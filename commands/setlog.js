const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config.json');
const fs = require('fs');

module.exports = {
    name: 'setlog',
    aliases: ['لوق'],
    description: 'تعيين روم اللوقات',
    permissions: PermissionFlagsBits.Administrator,
    async execute(message, args, client) {
        const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]);

        if (!channel) {
            return message.reply('❌ يجب منشن القناة أو كتابة آيديها!');
        }

        if (!channel.isTextBased()) {
            return message.reply('❌ يجب أن تكون القناة نصية!');
        }

        config.logChannelId = channel.id;
        fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ تم تعيين روم اللوقات')
            .setDescription(`**الروم:** ${channel}\n**الآيدي:** ${channel.id}\n\nسيتم إرسال جميع تنبيهات الحماية في هذه القناة`)
            .setTimestamp();

        await message.reply({ embeds: [embed] });

        // إرسال رسالة تجريبية
        const testEmbed = new EmbedBuilder()
            .setColor('#00BFFF')
            .setTitle('🔔 تم تفعيل نظام اللوقات')
            .setDescription('جميع التنبيهات ستظهر هنا')
            .setTimestamp();

        await channel.send({ embeds: [testEmbed] });
    }
};
