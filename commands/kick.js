const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'kick',
    aliases: ['كيك', 'طرد'],
    description: 'كيك عضو من السيرفر',
    permissions: PermissionFlagsBits.KickMembers,
    async execute(message, args, client) {
        const member = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null);

        if (!member) {
            return message.reply('❌ يجب منشن العضو أو كتابة آيديه!');
        }

        if (member.id === message.author.id) {
            return message.reply('❌ لا يمكنك كيك نفسك!');
        }

        if (member.id === client.user.id) {
            return message.reply('❌ لا يمكنني كيك نفسي!');
        }

        if (member.roles.highest.position >= message.member.roles.highest.position) {
            return message.reply('❌ لا يمكنك كيك عضو رتبته أعلى أو مساوية لرتبتك!');
        }

        if (!member.kickable) {
            return message.reply('❌ لا يمكنني كيك هذا العضو! (ربما رتبته أعلى مني)');
        }

        const reason = args.slice(1).join(' ') || 'لا يوجد سبب';

        try {
            await member.send(`تم كيكك من سيرفر **${message.guild.name}**\n**السبب:** ${reason}`).catch(() => {});
            await member.kick(`${reason} | بواسطة: ${message.author.tag}`);

            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('👢 تم كيك عضو')
                .addFields(
                    { name: '👤 العضو', value: `${member.user.tag} (${member.id})`, inline: true },
                    { name: '👮 المسؤول', value: message.author.tag, inline: true },
                    { name: '📝 السبب', value: reason, inline: false }
                )
                .setTimestamp();

            await message.reply({ embeds: [embed] });

        } catch (error) {
            console.error('خطأ في الكيك:', error);
            return message.reply('❌ حدث خطأ أثناء كيك العضو!');
        }
    }
};
