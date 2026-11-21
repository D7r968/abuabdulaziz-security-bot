'use strict';

const { AuditLogEvent } = require('discord.js');
const config = require('../config.json');
const guard = require('../guard');

module.exports = {
  name: 'emojiDelete',

  async execute(emoji, client, db, saveDB) {
    const ir = guard.settings();
    if (ir.enabled === false) return;
    if (!config.protectionSettings.emojiProtection) return;

    const guild = emoji.guild;
    if (!guild) return;

    await new Promise((resolve) => setTimeout(resolve, 400));

    const entry = await guard.auditExecutor(guild, AuditLogEvent.EmojiDelete, emoji.id, 20000);
    if (!entry?.executor) return;
    const executor = entry.executor;

    if (client.user && executor.id === client.user.id) return;
    if (guard.isProtectedUser(executor.id, guild, db)) return;

    const count = guard.hit(db, 'emoji', executor.id, 60000);
    const strikes = ir.emojiStrikes || 1;
    let res = { kicked: false, banned: false };
    if (count >= strikes) {
      res = await guard.punish(
        executor.id,
        guild,
        `حذف إيموجي ${emoji.name}`,
        count >= 3 ? 'ban' : 'kick',
        db,
        saveDB
      );
      guard.clearHits(db, 'emoji', executor.id);
    }

    const restored = await guard.restoreAll(guild, db, saveDB);
    if (typeof saveDB === 'function') saveDB();

    console.log(
      `⚠️ ${executor.tag} حذف إيموجي ${emoji.name} → ${res.banned ? 'BAN' : res.kicked ? 'KICK' : 'رصد'} | أُرجع ${restored.emojis.length} إيموجي`
    );

    await guard.alert(
      client,
      '🚨 حذف إيموجي — إرجاع فوري',
      `**المخالف:** ${executor.tag} (${executor.id})\n` +
        `**الإيموجي:** ${emoji.name}\n` +
        `**الإجراء:** ${res.banned ? 'سحب الرتب + باي' : res.kicked ? 'سحب الرتب + كيك' : 'رصد الحذف'}\n` +
        `**تم الإرجاع:** ${restored.emojis.length} إيموجي`,
      '#FF0000'
    );
  }
};
