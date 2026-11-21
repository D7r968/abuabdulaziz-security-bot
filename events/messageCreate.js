'use strict';

const config = require('../config.json');
const guard = require('../guard');

module.exports = {
  name: 'messageCreate',
  async execute(message, client, db, saveDB) {
    if (!message.guild) return;

    const ir = guard.settings();

    // ⚡ سبام سريع (١٠/٥ث) + سبام بطيء (٢٠/٦٠ث) → تايم أوت فوري
    if (ir.enabled !== false && config.protectionSettings.messageProtection) {
      const fastThreshold = ir.spamThreshold || 10;
      const fastWindow = ir.spamWindowMs || 5000;
      const slowThreshold = ir.slowSpamThreshold || 20;
      const slowWindow = ir.slowSpamWindowMs || 60000;

      const fastCount = guard.hit(db, 'spam', message.author.id, fastWindow);
      const slowCount = guard.hit(db, 'spamSlow', message.author.id, slowWindow);
      const isFast = fastCount >= fastThreshold;
      const isSlow = slowCount >= slowThreshold;

      if (isFast || isSlow) {
        guard.clearHits(db, 'spam', message.author.id);
        guard.clearHits(db, 'spamSlow', message.author.id);

        const label = isFast
          ? `${fastCount} رسالة خلال ${fastWindow / 1000} ثانية`
          : `${slowCount} رسالة خلال ${slowWindow / 1000} ثانية`;

        const res = await guard.punish(
          message.author.id,
          message.guild,
          `سبام ${label}`,
          'timeout',
          db,
          saveDB
        );

        try {
          const recent = await message.channel.messages.fetch({ limit: 100 });
          const spamMessages = recent.filter(
            (m) => m.author.id === message.author.id && Date.now() - m.createdTimestamp < Math.max(fastWindow, slowWindow)
          );
          if (spamMessages.size > 0) {
            await message.channel.bulkDelete(spamMessages, true).catch(() => {});
          }
        } catch { /* تجاهل */ }

        if (typeof saveDB === 'function') saveDB();

        console.log(
          `⚠️ سبام من ${message.author.tag}: ${label} → ${res.timedOut ? `تايم أوت ${ir.spamTimeoutMinutes || 10} دقيقة` : 'ما انطبق العقاب (مخول أو صلاحيات ناقصة)'}`
        );

        await guard.alert(
          client,
          '⚠️ سبام — تايم أوت فوري',
          `**المخالف:** ${message.author.tag} (${message.author.id})\n` +
            `**الرصيد:** ${label}\n` +
            `**الإجراء:** ${res.timedOut ? `تايم أوت ${ir.spamTimeoutMinutes || 10} دقيقة + مسح الرسائل` : 'تعذر التنفيذ — تأكد من صلاحيات البوت'}`,
          '#FFA500'
        );
        return;
      }
    }

    if (message.author.bot) return;

    try {
      if (!db.savedMessages) db.savedMessages = {};
      if (!db.savedMessages[message.channel.id]) db.savedMessages[message.channel.id] = [];

      db.savedMessages[message.channel.id].push({
        id: message.id,
        content: message.content,
        author: {
          id: message.author.id,
          username: message.author.username,
          tag: message.author.tag
        },
        channelId: message.channel.id,
        channelName: message.channel.name,
        timestamp: message.createdTimestamp,
        attachments: message.attachments.map((att) => ({ url: att.url, name: att.name, size: att.size })),
        embeds: message.embeds.length > 0,
        reference: message.reference
          ? { messageId: message.reference.messageId, channelId: message.reference.channelId }
          : null
      });

      if (db.savedMessages[message.channel.id].length > 1000) db.savedMessages[message.channel.id].shift();
      if (db.savedMessages[message.channel.id].length % 10 === 0 && typeof saveDB === 'function') saveDB();
    } catch (error) {
      console.error('خطأ في حفظ الرسالة:', error);
    }
  }
};
