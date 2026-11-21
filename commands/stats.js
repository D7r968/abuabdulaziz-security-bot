const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');

module.exports = {
    name: 'stats',
    aliases: ['احصائيات', 'معلومات'],
    description: 'إحصائيات البوت',
    async execute(message, args, client, db) {
        const uptime = process.uptime();
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor(uptime / 3600) % 24;
        const minutes = Math.floor(uptime / 60) % 60;
        const seconds = Math.floor(uptime) % 60;

        const guild = message.guild;
        const totalMembers = guild.memberCount;
        const onlineMembers = guild.members.cache.filter(m => m.presence?.status !== 'offline').size;
        
        const embed = new EmbedBuilder()
            .setColor(config.embedColor)
            .setTitle('📊 إحصائيات البوت')
            .setThumbnail(client.user.displayAvatarURL())
            .addFields(
                { name: '🤖 اسم البوت', value: client.user.tag, inline: true },
                { name: '🆔 آيدي البوت', value: client.user.id, inline: true },
                { name: '⏰ وقت التشغيل', value: `${days}d ${hours}h ${minutes}m ${seconds}s`, inline: true },
                { name: '🖥️ السيرفرات', value: `${client.guilds.cache.size}`, inline: true },
                { name: '👥 الأعضاء', value: `${totalMembers}`, inline: true },
                { name: '🟢 المتصلين', value: `${onlineMembers}`, inline: true },
                { name: '📁 القنوات', value: `${guild.channels.cache.size}`, inline: true },
                { name: '🎭 الرولات', value: `${guild.roles.cache.size}`, inline: true },
                { name: '💾 النسخ الاحتياطية', value: config.backupEnabled ? '✅ مفعل' : '❌ معطل', inline: true },
                { name: '🛡️ الوايت لست', value: `${db.whitelist.length} عضو`, inline: true },
                { name: '🔒 الرولات الثابتة', value: `${db.permanentRoles?.length || 0}`, inline: true },
                { name: '📝 البادئة', value: config.prefix, inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'بوت الحماية الاحترافي' });

        await message.reply({ embeds: [embed] });
    }
};
