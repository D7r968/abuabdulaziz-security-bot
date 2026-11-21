const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');

module.exports = {
    name: 'help',
    aliases: ['مساعدة', 'اوامر'],
    description: 'عرض جميع الأوامر المتاحة',
    async execute(message, args, client, db, saveDB) {
        const prefix = config.prefix;
        
        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('🛡️ أوامر بوت الحماية الاحترافي')
            .setDescription('**الحماية المفعلة:** ✅ الرولات والقنوات | ✅ البان/الكيك | 🆕 **حماية الصلاحيات** | ✅ الرسائل\n\nجميع الأوامر المتوفرة في البوت:')
            .addFields(
                {
                    name: '📋 الأوامر العامة',
                    value: `\`${prefix}help\` - عرض هذه القائمة\n\`${prefix}ping\` - فحص سرعة استجابة البوت\n\`${prefix}stats\` - إحصائيات البوت`,
                    inline: false
                },
                {
                    name: '⚙️ أوامر الإعدادات',
                    value: `\`${prefix}whitelist add/remove <@user>\` - إضافة/إزالة من الوايت لست\n\`${prefix}whitelist list\` - عرض قائمة الوايت لست\n\`${prefix}setlog <#channel>\` - تعيين روم اللوقات\n\`${prefix}setname <name>\` - تغيير اسم البوت`,
                    inline: false
                },
                {
                    name: '🔒 أوامر الحماية',
                    value: `\`${prefix}protection <on/off>\` - تفعيل/تعطيل الحماية\n\`${prefix}protection status\` - عرض حالة أنظمة الحماية\n\`${prefix}antiraid <on/off>\` - تفعيل/تعطيل الحماية من الرايد`,
                    inline: false
                },
                {
                    name: '💾 أوامر النسخ الاحتياطي',
                    value: `\`${prefix}backup create\` - إنشاء نسخة احتياطية\n\`${prefix}backup restore\` - استعادة النسخة الاحتياطية\n\`${prefix}backup info\` - معلومات النسخة الاحتياطية\n\`${prefix}fix roles\` - مزامنة الرولات والأعضاء\n\`${prefix}messages stats\` - إحصائيات الرسائل المحفوظة\n\`${prefix}messages show [#channel]\` - عرض الرسائل المحفوظة`,
                    inline: false
                },
                {
                    name: '🔐 أوامر الرولات الثابتة',
                    value: `\`${prefix}permanent add <@user> <@role>\` - إضافة رول ثابت لعضو\n\`${prefix}permanent remove <@user> <@role>\` - إزالة رول ثابت\n\`${prefix}permanent list\` - عرض الرولات الثابتة`,
                    inline: false
                },
                {
                    name: '🔨 أوامر المعاقبة',
                    value: `\`${prefix}ban <@user> [reason]\` - بان عضو\n\`${prefix}kick <@user> [reason]\` - كيك عضو\n\`${prefix}clear <number>\` - حذف رسائل\n\`${prefix}test role <@role> <@user>\` - اختبار استعادة الرولات (للمالك)`,
                    inline: false
                }
            )
            .setFooter({ text: `استخدم ${prefix}help <command> لمزيد من التفاصيل` })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }
};
