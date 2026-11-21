'use strict';

const { EmbedBuilder, ChannelType, AuditLogEvent } = require('discord.js');
const config = require('./config.json');

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

function getBackup(guild, db) {
  if (!guild || !db) return {};
  return (db.guildBackups && db.guildBackups[guild.id]) || db.backup || {};
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
  if (!guild || !db) return false;
  try {
    const snapshot = {
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
      }))
    };

    if (!db.guildBackups) db.guildBackups = {};
    db.guildBackups[guild.id] = snapshot;
    if (!config.guildId || config.guildId === guild.id) db.backup = snapshot;

    if (typeof saveDB === 'function') saveDB();
    return true;
  } catch (err) {
    console.error('[guard] backupNow failed:', err.message);
    return false;
  }
}

// ─────────────────────────────────────────────
// إرجاع كل الرومات والرتب والإيموجي (بقفل يمنع التكرار)
// ─────────────────────────────────────────────
const restoreQueues = new Map();

async function restoreAll(guild, db, saveDB) {
  if (!guild) return { roles: [], channels: [], emojis: [] };
  const key = guild.id;
  const previous = restoreQueues.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => doRestore(guild, db, saveDB));
  restoreQueues.set(key, next);
  return next;
}

async function doRestore(guild, db, saveDB) {
  const restored = { roles: [], channels: [], emojis: [] };
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
  restoreAll,
  hit,
  clearHits
};
