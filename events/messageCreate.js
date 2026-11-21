const config = require('../config.json');

module.exports = {
    name: 'messageCreate',
    async execute(message, client, db, saveDB) {
        // تجاهل رسائل البوتات
        if (message.author.bot) return;
        
        // تجاهل الرسائل المباشرة
        if (!message.guild) return;

        // التحقق من تفعيل حفظ الرسائل
        if (!config.protectionSettings.messageProtection) return;

        try {
            // إنشاء مصفوفة الرسائل المحفوظة إذا لم تكن موجودة
            if (!db.savedMessages) {
                db.savedMessages = {};
            }

            if (!db.savedMessages[message.channel.id]) {
                db.savedMessages[message.channel.id] = [];
            }

            // حفظ معلومات الرسالة
            const messageData = {
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
                attachments: message.attachments.map(att => ({
                    url: att.url,
                    name: att.name,
                    size: att.size
                })),
                embeds: message.embeds.length > 0,
                reference: message.reference ? {
                    messageId: message.reference.messageId,
                    channelId: message.reference.channelId
                } : null
            };

            // إضافة الرسالة للمصفوفة
            db.savedMessages[message.channel.id].push(messageData);

            // الحد الأقصى: 1000 رسالة لكل قناة
            if (db.savedMessages[message.channel.id].length > 1000) {
                db.savedMessages[message.channel.id].shift(); // حذف أقدم رسالة
            }

            // حفظ كل 10 رسائل
            if (db.savedMessages[message.channel.id].length % 10 === 0) {
                saveDB();
            }

        } catch (error) {
            console.error('خطأ في حفظ الرسالة:', error);
        }
    }
};
