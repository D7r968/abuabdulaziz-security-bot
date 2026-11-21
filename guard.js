'use strict';

const { EmbedBuilder, ChannelType } = require('discord.js');
const config = require('./config.json');

function settings() {
  return config.instantResponse || {};
}

// guildId فاضي في الإعدادات → نستخدم أول سيرفر البوت فيه عشان النسخ الاحتياطي يشتغل
function getTargetGuild(client) {
  if (!client || !client.guilds) return null;
  return client.guilds.cache.get(config.guildId) || client.guilds.cache.first() || null;
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
}

// ─────────────────────────────────────────────
// سحب الرتب + (تايم أوت / كيك / بان)
// ─────────────────────────────────────────────
async function punish(userId, guild, reason, mode = 'ban', db = null, saveDB = null) {
  const result = { rolesRemoved: false, timedOut: false, kicked: false, banned: false };
  if (!userId || !guild) return result;

  // أبداً ما نعاقب أنفسنا ولا مالك السيرفر ولا المخولين
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
// نسخة احتياطية فورية عند التشغيل (بدون انتظار ساعة)
// ─────────────────────────────────────────────
async function backupNow(guild, db, saveDB) {
  if (!guild || !db) return false;
  try {
    db.backup = db.backup || { roles: [], channels: [], members: [], settings: {} };

    db.backup.roles = guild.roles.cache
      .filter((r) => r.id !== guild.id && !r.managed)
      .map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        permissions: r.permissions.bitfield.toString(),
        position: r.position,
        hoist: r.hoist,
        mentionable: r.mentionable
      }));

    db.backup.channels = guild.channels.cache.map((c) => ({
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
    }));

    db.backup.members = guild.members.cache.map((m) => ({
      id: m.id,
      username: m.user.username,
      roles: m.roles.cache.map((r) => r.id),
      joinedAt: m.joinedAt
    }));

    if (typeof saveDB === 'function') saveDB();
    return true;
  } catch (err) {
    console.error('[guard] backupNow failed:', err.message);
    return false;
  }
}

// ─────────────────────────────────────────────
// إرجاع كل الرومات والرتب المفقودة
// ─────────────────────────────────────────────
async function restoreAll(guild, db, saveDB) {
  const restored = { roles: [], channels: [] };
  if (!guild || !db || !db.backup) return restored;

  try {
    // 1) الرتب
    for (const saved of db.backup.roles || []) {
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

        for (const m of db.backup.members || []) {
          if (!(m.roles || []).includes(oldId)) continue;
          const member = await guild.members.fetch(m.id).catch(() => null);
          if (member) await member.roles.add(role).catch(() => {});
          m.roles = m.roles.map((id) => (id === oldId ? role.id : id));
        }
      } catch (err) {
        console.error(`[guard] restore role ${saved.name}:`, err.message);
      }
    }

    // 2) القنوات
    for (const saved of db.backup.channels || []) {
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
          } catch { /* صلاحية غير صالحة — نتجاهلها */ }
        }

        if (db.savedMessages && db.savedMessages[oldId]) {
          db.savedMessages[created.id] = db.savedMessages[oldId];
          delete db.savedMessages[oldId];
        }
      } catch (err) {
        console.error(`[guard] restore channel ${saved.name}:`, err.message);
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
  getTargetGuild,
  isProtectedUser,
  alert,
  punish,
  backupNow,
  restoreAll,
  hit,
  clearHits
};
