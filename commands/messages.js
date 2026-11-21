const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'messages',
    aliases: ['رسائل', 'saved'],
    description: 'عرض الرسائل المحفوظة من قناة',
    permissions: PermissionFlagsBits.Administrator,
    async execute(message, args, client, db, saveDB) {
        const subCommand = args[0]?.toLowerCase();

        if (!subCommand || !['list', 'show', 'قائمة', 'عرض', 'stats', 'احصائيات'].includes(subCommand)) {
            return message.reply('❌ استخدام خاطئ! استخدم: `messages <list/show/stats> [#channel]`');
        }

        // إحصائيات الرسائل المحفوظة
        if (subCommand === 'stats' || subCommand === 'احصائيات') {
            if (!db.savedMessages || Object.keys(db.savedMessages).length === 0) {
                return message.reply('📭 لا توجد رسائل محفوظة حالياً!');
            }

            const embed = new EmbedBuilder()
                .setColor('#00BFFF')
                .setTitle('📊 إحصائيات الرسائل المحفوظة')
                .setTimestamp();

            let totalMessages = 0;
            for (const [channelId, messages] of Object.entries(db.savedMessages)) {
                const channel = message.guild.channels.cache.get(channelId);
                const channelName = channel ? channel.name : `قناة محذوفة (${channelId})`;
                
                embed.addFields({
                    name: `📁 ${channelName}`,
                    value: `عدد الرسائل: **${messages.length}**`,
                    inline: true
                });

                totalMessages += messages.length;
            }

            embed.setDescription(`**إجمالي الرسائل المحفوظة:** ${totalMessages}\n**عدد القنوات:** ${Object.keys(db.savedMessages).length}`);

            return message.reply({ embeds: [embed] });
        }

        // عرض الرسائل من قناة
        if (subCommand === 'show' || subCommand === 'عرض') {
            const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[1]) || message.channel;

            if (!db.savedMessages || !db.savedMessages[channel.id] || db.savedMessages[channel.id].length === 0) {
                return message.reply(`📭 لا توجد رسائل محفوظة من ${channel}!`);
            }

            const savedMessages = db.savedMessages[channel.id];
            const limit = parseInt(args[2]) || 10;
            const messagesToShow = savedMessages.slice(-Math.min(limit, 50));

            const embed = new EmbedBuilder()
                .setColor('#00BFFF')
                .setTitle(`📨 آخر ${messagesToShow.length} رسالة من ${channel.name}`)
                .setDescription(`إجمالي الرسائل المحفوظة: **${savedMessages.length}**`)
                .setTimestamp();

            for (const msg of messagesToShow) {
                const date = new Date(msg.timestamp).toLocaleString('ar-SA', { 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                let content = msg.content || '*[رسالة بدون محتوى]*';
                if (content.length > 100) content = content.substring(0, 100) + '...';

                embed.addFields({
                    name: `${msg.author.tag} - ${date}`,
                    value: content + (msg.attachments?.length > 0 ? ` 📎(${msg.attachments.length})` : ''),
                    inline: false
                });
            }

            return message.reply({ embeds: [embed] });
        }

        // قائمة القنوات ذات الرسائل المحفوظة
        if (subCommand === 'list' || subCommand === 'قائمة') {
            if (!db.savedMessages || Object.keys(db.savedMessages).length === 0) {
                return message.reply('📭 لا توجد رسائل محفوظة حالياً!');
            }

            const embed = new EmbedBuilder()
                .setColor('#00BFFF')
                .setTitle('📋 قائمة القنوات ذات الرسائل المحفوظة')
                .setTimestamp();

            for (const [channelId, messages] of Object.entries(db.savedMessages)) {
                const channel = message.guild.channels.cache.get(channelId);
                const channelName = channel ? `<#${channelId}>` : `قناة محذوفة (${channelId})`;
                
                const lastMsg = messages[messages.length - 1];
                const lastDate = new Date(lastMsg.timestamp).toLocaleString('ar-SA', { 
                    month: 'short', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                embed.addFields({
                    name: channelName,
                    value: `📊 الرسائل: **${messages.length}**\n⏰ آخر رسالة: ${lastDate}`,
                    inline: true
                });
            }

            return message.reply({ embeds: [embed] });
        }
    }
};
