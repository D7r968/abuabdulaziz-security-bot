'use strict';

const { AuditLogEvent } = require('discord.js');
const config = require('../config.json');
const guard = require('../guard');

function overwriteFingerprint(overwrites) {
  return Array.from(overwrites?.values() || [])
    .map((p) => `${p.id}:${p.allow?.bitfield || 0n}:${p.deny?.bitfield || 0n}`)
    .sort()
    .join('|');
}

function currentOverwrites(channel) {
  return Array.from(channel.permissionOverwrites?.cache?.values() || []).map((p) => ({
    id: p.id,
    type: p.type ?? (p.id === channel.guild?.id ? 0 : 1),
    allow: p.allow.bitfield.toString(),
    deny: p.deny.bitfield.toString()
  }));
}

module.exports = {
  name: 'channelUpdate',
  async execute(oldChannel, newChannel, client, db, saveDB) {
    const ir = guard.settings();
    if (ir.enabled === false) return;
    if (!config.protectionSettings.channelProtection) return;

    const guild = newChannel.guild;
    if (!guild) return;

    const changed =
      overwriteFingerprint(oldChannel.permissionOverwrites?.cache) !==
      overwriteFingerprint(newChannel.permissionOverwrites?.cache);
    if (!changed) return;

    await new Promise((resolve) => setTimeout(resolve, 400));

    const type = AuditLogEvent.ChannelOverwriteUpdate ?? AuditLogEvent.ChannelUpdate;
    const entry = await guard.auditExecutor(guild, type, newChannel.id, 20000);
    if (!entry?.executor) return;
    const executor = entry.executor;

    if (client.user && executor.id === client.user.id) return;
    const backup = guard.getBackup(guild, db);
    const saved = (backup.channels || []).find((c) => c.id === newChannel.id);

    // المخول يغيّر الصلاحيات → نحدّث النسخة الاحتياطية بدل ما نرجّعها
    if (guard.isProtectedUser(executor.id, guild, db)) {
      if (saved) {
        saved.permissionOverwrites = currentOverwrites(newChannel);
        if (typeof saveDB === 'function') saveDB();
      }
      return;
    }

    // إرجاع الصلاحيات الأصلية فوراً
    if (saved && Array.isArray(saved.permissionOverwrites)) {
      try {
        await newChannel.permissionOverwrites.set(
          saved.permissionOverwrites.map((p) => ({
            id: p.id,
            type: p.type ?? (p.id === guild.id ? 0 : 1),
            allow: BigInt(p.allow || '0'),
            deny: BigInt(p.deny || '0')
          })),
          'حماية: إرجاع صلاحيات بعد تعديل غير مصرح'
        );
      } catch (err) {
        console.error('[channelUpdate] revert failed:', err.message);
      }
    }

    const count = guard.hit(db, 'permEdit', executor.id, 60000);
    const strikes = ir.permissionEditStrikes || 1;
    let res = { kicked: false, banned: false };
    if (count >= strikes) {
      res = await guard.punish(
        executor.id,
        guild,
        `تعديل صلاحيات ${newChannel.name}`,
        count >= 3 ? 'ban' : 'kick',
        db,
        saveDB
      );
      guard.clearHits(db, 'permEdit', executor.id);
    }
    if (typeof saveDB === 'function') saveDB();

    console.log(
      `⚠️ ${executor.tag} غيّر صلاحيات ${newChannel.name} → أُرجعت + ${res.banned ? 'BAN' : res.kicked ? 'KICK' : 'تحذير'}`
    );

    await guard.alert(
      client,
      '🚨 تعديل صلاحيات قناة — إرجاع فوري',
      `**المخالف:** ${executor.tag} (${executor.id})\n` +
        `**القناة:** ${newChannel.name}\n` +
        `**الإجراء:** إرجاع الصلاحيات + ${res.banned ? 'سحب الرتب + باي' : res.kicked ? 'سحب الرتب + كيك' : 'رصد التعديل'}`,
      '#FF0000'
    );
  }
};
