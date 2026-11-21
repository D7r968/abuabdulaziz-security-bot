const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'ping',
    aliases: ['بنق'],
    description: 'فحص سرعة استجابة البوت',
    async execute(message, args, client) {
        const sent = await message.reply('🏓 جاري الفحص...');
        const timeDiff = sent.createdTimestamp - message.createdTimestamp;

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('🏓 سرعة الاستجابة')
            .addFields(
                { name: '⏱️ وقت الرد', value: `${timeDiff}ms`, inline: true },
                { name: '💓 API Latency', value: `${Math.round(client.ws.ping)}ms`, inline: true }
            )
            .setTimestamp();

        await sent.edit({ content: null, embeds: [embed] });
    }
};
