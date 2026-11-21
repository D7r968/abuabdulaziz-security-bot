'use strict';

const { EmbedBuilder, ChannelType, AuditLogEvent } = require('discord.js');
const config = require('./config.json');

let lastBackupError = '';
function backupError() { return lastBackupError; }

function settings() {
  return config.instantResponse || {};
}

// guildId فاضي → نشتغل على كل السيرفرات اللي البوت فيها
function getTargetGuilds(client) {
  if (!client || !client.guilds) return [];
  const configured = config.guildId && client.guilds.cache.get(config.guildId);
  if (configured) return [configured];
  return Array.from(client.guilds.cache.values());
}

function getTargetGuild(client) {
  return getTargetGuilds(client)[0] || null;
}

// ممنوع نسخة عامة مشتركة — كل سيرفر نسخته الخاصة فقط، وإلا ننسخ سيرفر قديم لسيرفر ثاني
function getBackup(guild, db) {
  if (!guild || !db || !db.guildBackups) return {};
  const backup = db.guildBackups[guild.id];
  if (!backup || typeof backup !== 'object') return {};
  // تحقق إضافي: النسخة لازم تكون موسومة بنفس معرف السيرفر
  if (backup.guildId && String(backup.guildId) !== String(guild.id)) {
    console.error(`[guard] رفض نسخة غير مطابقة: guild=${guild.id} backup.guildId=${backup.guildId}`);
    return {};
  }
  return backup;
}

// ─────────────────────────────────────────────
// الصلاحية: مالك السيرفر + مالك البوت + اللي يضيفه بـ /protect add
// ─────────────────────────────────────────────
function isProtectedUser(userId, guild, db) {
  if (!userId) return false;
  if (config.ownerId && userId === config.ownerId) return true;
  if (guild && userId === guild.ownerId) return true;
  if (db && Array.isArray(db.whitelist) && db.whitelist.includes(userId)) return true;
  if (db && Array.isArray(db.protectAllowed) && db.protectAllowed.includes(userId)) return true;
  return false;
}

// ─────────────────────────────────────────────
// تخزين الصلاحيات بشكل دائم عبر رول في ديسكورد
// ─────────────────────────────────────────────
const PROTECT_ROLE_NAME = '🛡️ PROTECTED';

async function getOrCreateProtectRole(guild) {
  let role = guild.roles.cache.find((r) => r.name === PROTECT_ROLE_NAME);
  if (role) return role;
  try {
    role = await guild.roles.create({
      name: PROTECT_ROLE_NAME,
      color: '#00BFFF',
      reason: 'تخزين صلاحيات الحماية بشكل دائم'
    });
    return role;
  } catch (err) {
    console.error('[guard] create protect role:', err.message);
    return null;
  }
}

async function syncProtectAllowed(client, db, saveDB) {
  if (!Array.isArray(db.protectAllowed)) db.protectAllowed = [];
  const ids = new Set(db.protectAllowed);
  for (const guild of getTargetGuilds(client)) {
    const role = await getOrCreateProtectRole(guild);
    if (!role) continue;
    for (const member of role.members.values()) ids.add(member.id);
  }
  db.protectAllowed = Array.from(ids);
  if (typeof saveDB === 'function') saveDB();
  return db.protectAllowed;
}

async function grantProtectRole(guild, userId) {
  const role = await getOrCreateProtectRole(guild);
  if (!role) return false;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return false;
  await member.roles.add(role, '/protect add').catch(() => {});
  return true;
}

async function revokeProtectRole(guild, userId) {
  const role = await getOrCreateProtectRole(guild);
  if (!role) return false;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return false;
  await member.roles.remove(role, '/protect remove').catch(() => {});
  return true;
}

// ─────────────────────────────────────────────
// إشعار خفيف لقناة اللوق (إذا مضبوطة)
// ─────────────────────────────────────────────
async function alert(client, title, description, color = '#FF0000') {
  if (settings().alertEnabled === false) return;
  try {
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(description)
      .setTimestamp()
      .setFooter({ text: '🛡️ Abuabdulaziz Security — استجابة فورية' });
    await client.sendLog(embed);
  } catch (err) {
    console.error('[guard] alert failed:', err.message);
  }

  // إرسال الحدث للوحة التحكم عشان يظهر في سجل الأحداث
  try {
    const base = String(process.env.DASHBOARD_URL || '').trim().replace(/\/+$/, '');
    if (base) {
      fetch(`${base}/api/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-log-token': String(process.env.DASHBOARD_LOG_TOKEN || '').trim()
        },
        body: JSON.stringify({
          bot: 'security',
          type: 'alert',
          title,
          description,
          color
        }),
        signal: AbortSignal.timeout(6000)
      }).catch(() => {});
    }
  } catch { /* تجاهل */ }
}

// ─────────────────────────────────────────────
// سحب الرتب + (تايم أوت / كيك / بان)
// ─────────────────────────────────────────────
async function punish(userId, guild, reason, mode = 'ban', db = null, saveDB = null) {
  const result = { rolesRemoved: false, timedOut: false, kicked: false, banned: false };
  if (!userId || !guild) return result;

  if (guild.client?.user && userId === guild.client.user.id) return result;
  if (userId === guild.ownerId) return result;
  if (db && isProtectedUser(userId, guild, db)) return result;

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return result;

  try {
    const roles = member.roles.cache.filter((r) => r.id !== guild.id && !r.managed);
    if (roles.size > 0) {
      await member.roles.remove(roles, `حماية: ${reason}`).catch(() => {});
      result.rolesRemoved = true;
    }
  } catch (err) {
    console.error('[guard] role remove failed:', err.message);
  }

  try {
    if (mode === 'timeout') {
      const minutes = Number(settings().spamTimeoutMinutes || config.spamTimeoutMinutes) || 10;
      await member.timeout(minutes * 60 * 1000, `حماية: ${reason}`).catch(() => {});
      result.timedOut = true;
    } else if (mode === 'kick') {
      await member.kick(`حماية: ${reason}`).catch(() => {});
      result.kicked = true;
    } else {
      await member.ban({ reason: `حماية: ${reason}` }).catch(() => {});
      result.banned = true;
    }
  } catch (err) {
    console.error('[guard] punish failed:', err.message);
  }

  return result;
}

// ─────────────────────────────────────────────
// جلب منفذ الحدث من سجل التدقيق
// ─────────────────────────────────────────────
async function auditExecutor(guild, type, targetId, maxAgeMs = 20000) {
  if (!guild) return null;
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 20 });
    const entry =
      logs.entries.find(
        (e) => (!targetId || e.target?.id === targetId) && Date.now() - e.createdTimestamp < maxAgeMs
      ) || logs.entries.first();
    if (!entry || (maxAgeMs && Date.now() - entry.createdTimestamp > maxAgeMs)) return null;
    return entry;
  } catch (err) {
    console.error('[guard] audit lookup:', err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// نسخة احتياطية لكل سيرفر على حدة
// ─────────────────────────────────────────────
async function backupNow(guild, db, saveDB) {
  lastBackupError = '';
  if (!guild || !db) {
    lastBackupError = 'no guild or database';
    return false;
  }
  try {
    let webhookList = [];
    try {
      if (guild.webhooks && typeof guild.webhooks.fetch === 'function') {
        const fetched = await guild.webhooks.fetch().catch(() => null);
        if (fetched && typeof fetched.values === 'function') webhookList = Array.from(fetched.values());
      }
    } catch { /* الويب هوكس مش إجبارية للنسخة */ }

    const snapshot = {
      guildId: String(guild.id),
      capturedAt: Date.now(),
      roles: guild.roles.cache
        .filter((r) => r.id !== guild.id && !r.managed)
        .map((r) => ({
          id: r.id,
          name: r.name,
          color: r.color,
          permissions: r.permissions.bitfield.toString(),
          position: r.position,
          hoist: r.hoist,
          mentionable: r.mentionable
        })),
      channels: guild.channels.cache.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        position: c.position,
        parentId: c.parentId || null,
        topic: c.topic || '',
        nsfw: !!c.nsfw,
        rateLimitPerUser: c.rateLimitPerUser || 0,
        bitrate: c.bitrate || 0,
        userLimit: c.userLimit || 0,
        permissionOverwrites: c.permissionOverwrites
          ? Array.from(c.permissionOverwrites.cache.values()).map((p) => ({
              id: p.id,
              type: p.type,
              allow: p.allow.bitfield.toString(),
              deny: p.deny.bitfield.toString()
            }))
          : []
      })),
      members: guild.members.cache.map((m) => ({
        id: m.id,
        username: m.user.username,
        roles: m.roles.cache.map((r) => r.id),
        joinedAt: m.joinedAt
      })),
      emojis: guild.emojis.cache.map((e) => ({
        id: e.id,
        name: e.name,
        animated: !!e.animated,
        url: `https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? 'gif' : 'png'}`
      })),
      // إعدادات السيرفر نفسها عشان يرجع "نفس ما كان" بعد التخريب
      guild: {
        name: guild.name,
        description: guild.description || '',
        icon: guild.iconURL({ size: 512, dynamic: true }) || null,
        banner: guild.bannerURL({ size: 512, dynamic: true }) || null,
        verificationLevel: guild.verificationLevel,
        defaultMessageNotifications: guild.defaultMessageNotifications,
        explicitContentFilter: guild.explicitContentFilter,
        preferredLocale: guild.preferredLocale,
        afkTimeout: guild.afkTimeout,
        afkChannelId: guild.afkChannelId || null
      },
      webhooks: webhookList.map((w) => ({
        id: w.id,
        name: w.name,
        channelId: w.channelId,
        avatar: typeof w.avatarURL === 'function' ? (w.avatarURL({ size: 128 }) || null) : null
      }))
    };

    if (!db.guildBackups) db.guildBackups = {};
    db.guildBackups[guild.id] = snapshot;
    // النسخة العامة القديمة كانت سبب النسخ بين السيرفرات — نمسحها نهائياً
    if (db.backup) delete db.backup;

    // فشل الحفظ على القرص ما يلغي النسخة الموجودة في الذاكرة — الاستضافة ترجّع القرص بعد كل إعادة نشر
    if (typeof saveDB === 'function') {
      try { saveDB(); }
      catch (err) {
        lastBackupError = 'saveDB: ' + err.message;
        console.error('[guard] saveDB failed:', err.message);
      }
    }
    return true;
  } catch (err) {
    lastBackupError = err.message;
    console.error('[guard] backupNow failed:', err.message);
    return false;
  }
}

// ─────────────────────────────────────────────
// إرجاع كل الرومات والرتب والإيموجي (بقفل يمنع التكرار)
// ─────────────────────────────────────────────
const restoreQueues = new Map();

async function restoreAll(guild, db, saveDB) {
  const empty = { roles: [], channels: [], emojis: [], members: [], webhooks: [], guild: [] };
  if (!guild) return empty;

  // أي استرجاع لازم يبدأ من نسخة هذا السيرفر بالذات — ما في أي بديل عام
  const ownBackup = getBackup(guild, db);
  if (!ownBackup.roles && !ownBackup.channels && !ownBackup.emojis) {
    console.log(`[guard] استرجاع ملغي: السيرفر ${guild.id} (${guild.name || ''}) ما عنده نسخة خاصة فيه — ما لمسنا أي شي`);
    return empty;
  }
  console.log(`[guard] استرجاع من نسخة السيرفر ${guild.id} (${guild.name || ''}) فقط`);

  const key = guild.id;
  const previous = restoreQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => doRestore(guild, db, saveDB));
  restoreQueues.set(key, next);
  return next;
}

async function doRestore(guild, db, saveDB) {
  const restored = { roles: [], channels: [], emojis: [], members: [], webhooks: [], guild: [] };
  const backup = getBackup(guild, db);
  if (!backup || (!backup.roles && !backup.channels && !backup.emojis)) return restored;

  try {
    for (const saved of backup.roles || []) {
      if (!saved.id || guild.roles.cache.has(saved.id)) continue;
      try {
        const role = await guild.roles.create({
          name: saved.name,
          color: saved.color,
          permissions: BigInt(saved.permissions || '0'),
          position: Math.min(saved.position || 0, 20),
          hoist: !!saved.hoist,
          mentionable: !!saved.mentionable,
          reason: 'استعادة تلقائية بعد تخريب'
        });

        const oldId = saved.id;
        saved.id = role.id;
        restored.roles.push(`${saved.name} (${oldId} → ${role.id})`);

        if (!db.roleMapping) db.roleMapping = {};
        db.roleMapping[oldId] = role.id;

        for (const m of backup.members || []) {
          if (!(m.roles || []).includes(oldId)) continue;
          const member = await guild.members.fetch(m.id).catch(() => null);
          if (member) await member.roles.add(role).catch(() => {});
          m.roles = m.roles.map((id) => (id === oldId ? role.id : id));
        }
      } catch (err) {
        console.error(`[guard] restore role ${saved.name}:`, err.message);
      }
    }

    // الرتب الموجودة لكن معدّلة → نرجّعها لاسمها ولونها وصلاحياتها الأصلية
    for (const saved of backup.roles || []) {
      const current = guild.roles.cache.get(saved.id);
      if (!current || current.id === guild.id || current.managed) continue;
      try {
        const patch = {};
        if (current.name !== saved.name) patch.name = saved.name;
        if (current.color !== saved.color) patch.color = saved.color;
        if (String(current.permissions.bitfield) !== String(saved.permissions || '0')) {
          patch.permissions = BigInt(saved.permissions || '0');
        }
        if (current.hoist !== !!saved.hoist) patch.hoist = !!saved.hoist;
        if (current.mentionable !== !!saved.mentionable) patch.mentionable = !!saved.mentionable;
        if (Object.keys(patch).length) {
          await current.edit(patch, 'استعادة تلقائية بعد تخريب');
          restored.roles.push(`${saved.name} (تم تعديله)`);
        }
      } catch (err) {
        console.error(`[guard] re-edit role ${saved.name}:`, err.message);
      }
    }

    for (const saved of backup.channels || []) {
      if (!saved.id || guild.channels.cache.has(saved.id)) continue;
      try {
        const opts = {
          name: saved.name,
          type: saved.type ?? ChannelType.GuildText,
          position: saved.position || 0,
          reason: 'استعادة تلقائية بعد تخريب'
        };
        if (saved.topic) opts.topic = saved.topic;
        if (saved.nsfw !== undefined) opts.nsfw = saved.nsfw;
        if (saved.rateLimitPerUser) opts.rateLimitPerUser = saved.rateLimitPerUser;
        if (saved.bitrate) opts.bitrate = saved.bitrate;
        if (saved.userLimit) opts.userLimit = saved.userLimit;

        const parentId = saved.parentId && guild.channels.cache.has(saved.parentId)
          ? saved.parentId
          : null;
        if (parentId) opts.parent = parentId;

        const created = await guild.channels.create(opts);
        const oldId = saved.id;
        saved.id = created.id;
        restored.channels.push(`${saved.name} (${oldId} → ${created.id})`);

        for (const perm of saved.permissionOverwrites || []) {
          try {
            await created.permissionOverwrites.create(perm.id, {
              allow: BigInt(perm.allow || '0'),
              deny: BigInt(perm.deny || '0')
            });
          } catch { /* نتجاهل الصلاحيات غير الصالحة */ }
        }

        if (db.savedMessages && db.savedMessages[oldId]) {
          db.savedMessages[created.id] = db.savedMessages[oldId];
          delete db.savedMessages[oldId];
        }
      } catch (err) {
        console.error(`[guard] restore channel ${saved.name}:`, err.message);
      }
    }

    // القنوات الموجودة لكن معدّلة → نرجّع الاسم والوصف والترتيب والصلاحيات
    for (const saved of backup.channels || []) {
      const current = guild.channels.cache.get(saved.id);
      if (!current) continue;
      try {
        const patch = {};
        if (current.name !== saved.name) patch.name = saved.name;
        if ((current.topic || '') !== (saved.topic || '')) patch.topic = saved.topic || null;
        if (!!current.nsfw !== !!saved.nsfw) patch.nsfw = !!saved.nsfw;
        if ((current.rateLimitPerUser || 0) !== (saved.rateLimitPerUser || 0)) {
          patch.rateLimitPerUser = saved.rateLimitPerUser || 0;
        }
        if ((current.bitrate || 0) !== (saved.bitrate || 0) && saved.bitrate) patch.bitrate = saved.bitrate;
        if ((current.userLimit || 0) !== (saved.userLimit || 0) && saved.userLimit) patch.userLimit = saved.userLimit;
        if (current.position !== saved.position) patch.position = saved.position;
        if (saved.parentId) {
          if (current.parentId !== saved.parentId && guild.channels.cache.has(saved.parentId)) {
            patch.parent = saved.parentId;
          }
        }
        if (Object.keys(patch).length) {
          await current.edit(patch, 'استعادة تلقائية بعد تخريب');
          restored.channels.push(`${saved.name} (تم تعديله)`);
        }

        const desired = new Map((saved.permissionOverwrites || []).map((p) => [p.id, p]));
        for (const perm of current.permissionOverwrites.cache.values()) {
          if (!desired.has(perm.id)) await perm.delete('استعادة تلقائية بعد تخريب').catch(() => {});
        }
        for (const perm of desired.values()) {
          const allow = BigInt(perm.allow || '0');
          const deny = BigInt(perm.deny || '0');
          const existing = current.permissionOverwrites.cache.get(perm.id);
          if (!existing) {
            await current.permissionOverwrites.create(perm.id, { allow, deny }).catch(() => {});
          } else if (
            String(existing.allow.bitfield) !== String(allow) ||
            String(existing.deny.bitfield) !== String(deny)
          ) {
            await current.permissionOverwrites.edit(perm.id, { allow, deny }).catch(() => {});
          }
        }
      } catch (err) {
        console.error(`[guard] re-edit channel ${saved.name}:`, err.message);
      }
    }

    for (const saved of backup.emojis || []) {
      if (!saved.id || guild.emojis.cache.has(saved.id)) continue;
      try {
        const response = await fetch(saved.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        const emoji = await guild.emojis.create({ attachment: buffer, name: saved.name });
        const oldId = saved.id;
        saved.id = emoji.id;
        restored.emojis.push(`${saved.name} (${oldId} → ${emoji.id})`);
      } catch (err) {
        console.error(`[guard] restore emoji ${saved.name}:`, err.message);
      }
    }

    // الرتب اللي انسحبت من الأعضاء → نرجّعها (بدون ما نلمس المالك أو المحميين)
    for (const saved of backup.members || []) {
      if (!saved.id || saved.id === guild.ownerId) continue;
      if (guild.client?.user && saved.id === guild.client.user.id) continue;
      if (db && isProtectedUser(saved.id, guild, db)) continue;
      try {
        const member = await guild.members.fetch(saved.id).catch(() => null);
        if (!member) continue;
        const wanted = (saved.roles || [])
          .map((id) => (db && db.roleMapping && db.roleMapping[id]) || id)
          .filter((id) => guild.roles.cache.has(id) && !member.roles.cache.has(id));
        if (wanted.length) {
          await member.roles.add(wanted, 'استعادة تلقائية بعد تخريب').catch(() => {});
          restored.members.push(`${member.user.username} (+${wanted.length} رتبة)`);
        }
      } catch (err) {
        console.error(`[guard] restore member roles ${saved.id}:`, err.message);
      }
    }

    // إعدادات السيرفر نفسه (الاسم / الوصف / مستوى التحقق ...)
    if (backup.guild) {
      const savedGuild = backup.guild;
      try {
        const patch = {};
        if (guild.name !== savedGuild.name) patch.name = savedGuild.name;
        if ((guild.description || '') !== (savedGuild.description || '')) {
          patch.description = savedGuild.description || null;
        }
        if (savedGuild.verificationLevel !== undefined && guild.verificationLevel !== savedGuild.verificationLevel) {
          patch.verificationLevel = savedGuild.verificationLevel;
        }
        if (
          savedGuild.defaultMessageNotifications !== undefined &&
          guild.defaultMessageNotifications !== savedGuild.defaultMessageNotifications
        ) {
          patch.defaultMessageNotifications = savedGuild.defaultMessageNotifications;
        }
        if (
          savedGuild.explicitContentFilter !== undefined &&
          guild.explicitContentFilter !== savedGuild.explicitContentFilter
        ) {
          patch.explicitContentFilter = savedGuild.explicitContentFilter;
        }
        if (Object.keys(patch).length) {
          await guild.edit(patch, 'استعادة تلقائية بعد تخريب');
          restored.guild.push('إعدادات السيرفر');
        }
        if (savedGuild.icon && guild.iconURL({ size: 512, dynamic: true }) !== savedGuild.icon) {
          const response = await fetch(savedGuild.icon);
          if (response.ok) {
            await guild.setIcon(Buffer.from(await response.arrayBuffer()), 'استعادة تلقائية بعد تخريب');
            restored.guild.push('الأيقونة');
          }
        }
      } catch (err) {
        console.error('[guard] restore guild settings:', err.message);
      }
    }

    // الويب هوكس المحذوفة
    for (const savedHook of backup.webhooks || []) {
      try {
        const channel = guild.channels.cache.get(savedHook.channelId);
        if (!channel) continue;
        const hookManager = channel.webhooks;
        const existing = hookManager && typeof hookManager.fetch === 'function'
          ? await hookManager.fetch().catch(() => null)
          : null;
        if (existing && typeof existing.some === 'function') {
          if (existing.some((w) => w.id === savedHook.id || w.name === savedHook.name)) continue;
        }
        let avatar = null;
        if (savedHook.avatar) {
          try {
            avatar = Buffer.from(await (await fetch(savedHook.avatar)).arrayBuffer());
          } catch { /* بدون صورة */ }
        }
        await channel.createWebhook(
          { name: savedHook.name, avatar },
          'استعادة تلقائية بعد تخريب'
        ).catch(() => {});
        restored.webhooks.push(`${savedHook.name} في ${channel.name}`);
      } catch (err) {
        console.error(`[guard] restore webhook ${savedHook.name}:`, err.message);
      }
    }

    if (typeof saveDB === 'function') saveDB();
  } catch (err) {
    console.error('[guard] restoreAll failed:', err.message);
  }

  return restored;
}

// ─────────────────────────────────────────────
// عدّاد الأحداث المتتالية
// ─────────────────────────────────────────────
function hit(db, bucket, userId, windowMs) {
  if (!db.guardHits) db.guardHits = {};
  if (!db.guardHits[bucket]) db.guardHits[bucket] = {};

  const now = Date.now();
  const arr = (db.guardHits[bucket][userId] || []).filter((t) => now - t < windowMs);
  arr.push(now);
  db.guardHits[bucket][userId] = arr;

  for (const u of Object.keys(db.guardHits[bucket])) {
    if (!db.guardHits[bucket][u].length) delete db.guardHits[bucket][u];
  }
  return arr.length;
}

function clearHits(db, bucket, userId) {
  if (db.guardHits && db.guardHits[bucket]) delete db.guardHits[bucket][userId];
}

module.exports = {
  settings,
  getTargetGuilds,
  getTargetGuild,
  getBackup,
  isProtectedUser,
  syncProtectAllowed,
  grantProtectRole,
  revokeProtectRole,
  alert,
  punish,
  auditExecutor,
  backupNow,
  backupError,
  restoreAll,
  hit,
  clearHits
};
