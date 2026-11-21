const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config.json');

module.exports = {
    name: 'whitelist',
    aliases: ['wl', 'وايت'],
    description: 'إدارة قائمة الوايت لست',
    ownerOnly: true,
    async execute(message, args, client, db, saveDB) {
        const subCommand = args[0]?.toLowerCase();

        if (!subCommand || !['add', 'remove', 'list', 'اضافة', 'حذف', 'قائمة'].includes(subCommand)) {
            return message.reply('❌ استخدام خاطئ! استخدم: `whitelist <add/remove/list> [@user]`');
        }

        // عرض القائمة
        if (subCommand === 'list' || subCommand === 'قائمة') {
            if (db.whitelist.length === 0) {
                return message.reply('📋 قائمة الوايت لست فارغة!');
            }

            const whitelistUsers = [];
            for (const userId of db.whitelist) {
                try {
                    const user = await client.users.fetch(userId);
                    whitelistUsers.push(`${user.tag} (${userId})`);
                } catch {
                    whitelistUsers.push(`Unknown User (${userId})`);
                }
            }

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('📋 قائمة الوايت لست')
                .setDescription(whitelistUsers.join('\n') || 'لا يوجد أعضاء')
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }

        // إضافة أو حذف
        const user = message.mentions.users.first();
        if (!user) {
            return message.reply('❌ يجب منشن العضو!');
        }

        if (subCommand === 'add' || subCommand === 'اضافة') {
            if (db.whitelist.includes(user.id)) {
                return message.reply('⚠️ هذا العضو موجود بالفعل في الوايت لست!');
            }

            db.whitelist.push(user.id);
            saveDB();

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ تمت الإضافة للوايت لست')
                .setDescription(`**العضو:** ${user.tag}\n**الآيدي:** ${user.id}\n\nالآن هذا العضو معفي من جميع أنظمة الحماية`)
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }

        if (subCommand === 'remove' || subCommand === 'حذف') {
            if (!db.whitelist.includes(user.id)) {
                return message.reply('⚠️ هذا العضو غير موجود في الوايت لست!');
            }

            db.whitelist = db.whitelist.filter(id => id !== user.id);
            saveDB();

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('✅ تمت الإزالة من الوايت لست')
                .setDescription(`**العضو:** ${user.tag}\n**الآيدي:** ${user.id}\n\nالآن هذا العضو خاضع لأنظمة الحماية`)
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }
    }
};
