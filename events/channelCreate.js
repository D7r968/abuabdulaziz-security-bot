'use strict';

const { AuditLogEvent, ChannelType } = require('discord.js');
const config = require('../config.json');
const guard = require('../guard');

module.exports = {
  name: 'channelCreate',
  async execute(channel, client, db, saveDB) {
    const ir = guard.settings();
    if (ir.enabled === false) return;

    const guild = channel.guild;
    if (!guild) return;

    await new Promise((resolve) => setTimeout(resolve, 350));

    let executor = null;
    try {
      const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 10 });
      const entry =
        logs.entries.find((e) => e.target?.id === channel.id && Date.now() - e.createdTimestamp < 20000) ||
        logs.entries.first();
      executor = entry?.executor || null;
    } catch (err) {
      console.error('[channelCreate] audit:', err.message);
    }
    if (!executor) return;

    // ترميمنا نحن — ما نحسبها تخريب
    if (client.user && executor.id === client.user.id) return;
    if (guard.isProtectedUser(executor.id, guild, db)) return;

    const count = guard.hit(db, 'channelCreate', executor.id, ir.channelCreateWindowMs || 10000);
    const threshold = ir.channelCreateThreshold || 3;
    if (count < threshold) return;

    guard.clearHits(db, 'channelCreate', executor.id);

    const res = await guard.punish(
      executor.id,
      guild,
      `إنشاء ${count} قناة خلال ${(ir.channelCreateWindowMs || 10000) / 1000} ثانية`,
      'kick',
      db,
      saveDB
    );

    // يرجع أي رومات/رتب انحذفت قبل كذا
    const restored = await guard.restoreAll(guild, db, saveDB);

    // نشيل القنوات اللي أنشأها المخرب عشان السيرفر ما يخرب
    const createdRecently = [];
    try {
      const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 20 });
      for (const entry of logs.entries.values()) {
        if (entry.executor?.id !== executor.id) continue;
        if (Date.now() - entry.createdTimestamp > (ir.channelCreateWindowMs || 10000) * 2) continue;
        const ch = guild.channels.cache.get(entry.target?.id);
        if (ch && ch.type !== ChannelType.GuildCategory) {
          await ch.delete('حماية: إنشاء قنوات تخريبي').catch(() => {});
          createdRecently.push(ch.name);
        }
      }
    } catch { /* تجاهل */ }

    if (typeof saveDB === 'function') saveDB();

    console.log(
      `⚠️ ${executor.tag} أنشأ ${count} قناة → ${res.kicked ? 'KICK' : res.banned ? 'BAN' : 'لا إجراء'} | شُيلت ${createdRecently.length} قناة | أُرجع ${restored.channels.length} قناة / ${restored.roles.length} رتبة`
    );

    await guard.alert(
      client,
      '🚨 إنشاء قنوات بسرعة — إزالة فورية',
      `**المخالف:** ${executor.tag} (${executor.id}) ${executor.bot ? '🤖 بوت' : ''}\n` +
        `**عدد القنوات:** ${count} خلال ${(ir.channelCreateWindowMs || 10000) / 1000} ثانية\n` +
        `**الإجراء:** ${res.kicked ? 'سحب الرتب + كيك' : res.banned ? 'سحب الرتب + باي' : 'تعذر تنفيذ العقاب'}\n` +
        `**تم الإرجاع:** ${restored.channels.length} قناة، ${restored.roles.length} رتبة`,
      '#FF0000'
    );
  }
};
