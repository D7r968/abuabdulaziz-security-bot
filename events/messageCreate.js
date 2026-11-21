'use strict';

const config = require('../config.json');
const guard = require('../guard');

module.exports = {
  name: 'messageCreate',
  async execute(message, client, db, saveDB) {
    if (!message.guild) return;

    const ir = guard.settings();

    // ⚡ كشف السبام قبل أي شيء — ١٠ رسائل خلال ٥ ثواني → تايم أوت فوري
    if (ir.enabled !== false && config.protectionSettings.messageProtection) {
      const threshold = ir.spamThreshold || 10;
      const windowMs = ir.spamWindowMs || 5000;

      const count = guard.hit(db, 'spam', message.author.id, windowMs);
      if (count >= threshold) {
        guard.clearHits(db, 'spam', message.author.id);

        const res = await guard.punish(
          message.author.id,
          message.guild,
          `سبام ${count} رسالة خلال ${windowMs / 1000} ثانية`,
          'timeout',
          db,
          saveDB
        );

        // مسح رسائل السبام الأخيرة
        try {
          const recent = await message.channel.messages.fetch({ limit: 100 });
          const spamMessages = recent.filter(
            (m) => m.author.id === message.author.id && Date.now() - m.createdTimestamp < windowMs * 2
          );
          if (spamMessages.size > 0) {
            await message.channel.bulkDelete(spamMessages, true).catch(() => {});
          }
        } catch { /* تجاهل */ }

        if (typeof saveDB === 'function') saveDB();

        console.log(
          `⚠️ سبام من ${message.author.tag}: ${count} رسالة → ${res.timedOut ? `تايم أوت ${ir.spamTimeoutMinutes || 10} دقيقة` : 'ما انطبق العقاب (مخول أو صلاحيات ناقصة)'}`
        );

        await guard.alert(
          client,
          '⚠️ سبام — تايم أوت فوري',
          `**المخالف:** ${message.author.tag} (${message.author.id})\n` +
            `**الرسائل:** ${count} خلال ${windowMs / 1000} ثانية\n` +
            `**الإجراء:** ${res.timedOut ? `تايم أوت ${ir.spamTimeoutMinutes || 10} دقيقة + مسح الرسائل` : 'تعذر التنفيذ — تأكد من صلاحيات البوت'}`,
          '#FFA500'
        );
        return;
      }
    }

    // تجاهل رسائل البوتات في الحفظ العادي
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
        attachments: message.attachments.map((att) => ({
          url: att.url,
          name: att.name,
          size: att.size
        })),
        embeds: message.embeds.length > 0,
        reference: message.reference
          ? { messageId: message.reference.messageId, channelId: message.reference.channelId }
          : null
      });

      if (db.savedMessages[message.channel.id].length > 1000) {
        db.savedMessages[message.channel.id].shift();
      }

      if (db.savedMessages[message.channel.id].length % 10 === 0 && typeof saveDB === 'function') {
        saveDB();
      }
    } catch (error) {
      console.error('خطأ في حفظ الرسالة:', error);
    }
  }
};
