'use strict';

const { AuditLogEvent } = require('discord.js');
const config = require('../config.json');
const guard = require('../guard');

module.exports = {
  name: 'channelDelete',
  async execute(channel, client, db, saveDB) {
    const ir = guard.settings();
    if (ir.enabled === false) return;
    if (!config.protectionSettings.channelProtection) return;

    const guild = channel.guild;
    if (!guild) return;

    // ننتظر قليلاً عشان اللوق يظهر
    await new Promise((resolve) => setTimeout(resolve, 400));

    let executor = null;
    try {
      const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 10 });
      const entry =
        logs.entries.find((e) => e.target?.id === channel.id && Date.now() - e.createdTimestamp < 20000) ||
        logs.entries.first();
      executor = entry?.executor || null;
    } catch (err) {
      console.error('[channelDelete] audit:', err.message);
    }
    if (!executor) return;

    // استعادتنا نحن للقناة — ما نعاقب أنفسنا ولا نعيد إرجاع
    if (client.user && executor.id === client.user.id) return;

    const protectedUser = guard.isProtectedUser(executor.id, guild, db);
    const count = guard.hit(db, 'channelDelete', executor.id, ir.deleteWindowMs || 60000);
    const threshold = ir.deleteThreshold || 2;
    const mode = count >= threshold ? 'ban' : 'kick';

    // إرجاع كل اللي انحذف فوراً (رومات + رتب)
    const restored = await guard.restoreAll(guild, db, saveDB);

    if (protectedUser) {
      console.log(`✅ ${executor.tag} (مخول) حذف قناة ${channel.name} — تم الإرجاع بدون عقاب`);
      return;
    }

    const res = await guard.punish(
      executor.id,
      guild,
      `حذف قناة ${channel.name}${count >= threshold ? ` (${count} قنوات خلال ${(ir.deleteWindowMs || 60000) / 1000}ث)` : ''}`,
      mode,
      db,
      saveDB
    );
    guard.clearHits(db, 'channelDelete', executor.id);
    if (typeof saveDB === 'function') saveDB();

    console.log(
      `⚠️ ${executor.tag} حذف قناة ${channel.name} → ${res.banned ? 'BAN' : res.kicked ? 'KICK' : 'لا إجراء'} | أُرجع ${restored.channels.length} قناة / ${restored.roles.length} رتبة`
    );

    await guard.alert(
      client,
      '🚨 حذف قناة — استجابة فورية',
      `**المخالف:** ${executor.tag} (${executor.id})\n` +
        `**القناة:** ${channel.name}\n` +
        `**التكرار:** ${count} خلال ${(ir.deleteWindowMs || 60000) / 1000} ثانية\n` +
        `**الإجراء:** ${res.banned ? 'سحب الرتب + باي' : res.kicked ? 'سحب الرتب + كيك' : 'تعذر تنفيذ العقاب — تأكد من صلاحيات البوت'}\n` +
        `**تم الإرجاع:** ${restored.channels.length} قناة، ${restored.roles.length} رتبة`,
      '#FF0000'
    );
  }
};
