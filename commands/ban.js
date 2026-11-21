const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'ban',
    aliases: ['بان', 'حظر'],
    description: 'بان عضو من السيرفر',
    permissions: PermissionFlagsBits.BanMembers,
    async execute(message, args, client) {
        const member = message.mentions.members.first() || await message.guild.members.fetch(args[0]).catch(() => null);

        if (!member) {
            return message.reply('❌ يجب منشن العضو أو كتابة آيديه!');
        }

        if (member.id === message.author.id) {
            return message.reply('❌ لا يمكنك بان نفسك!');
        }

        if (member.id === client.user.id) {
            return message.reply('❌ لا يمكنني بان نفسي!');
        }

        if (member.roles.highest.position >= message.member.roles.highest.position) {
            return message.reply('❌ لا يمكنك بان عضو رتبته أعلى أو مساوية لرتبتك!');
        }

        if (!member.bannable) {
            return message.reply('❌ لا يمكنني بان هذا العضو! (ربما رتبته أعلى مني)');
        }

        const reason = args.slice(1).join(' ') || 'لا يوجد سبب';

        try {
            await member.send(`تم بانك من سيرفر **${message.guild.name}**\n**السبب:** ${reason}`).catch(() => {});
            await member.ban({ reason: `${reason} | بواسطة: ${message.author.tag}` });

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🔨 تم بان عضو')
                .addFields(
                    { name: '👤 العضو', value: `${member.user.tag} (${member.id})`, inline: true },
                    { name: '👮 المسؤول', value: message.author.tag, inline: true },
                    { name: '📝 السبب', value: reason, inline: false }
                )
                .setTimestamp();

            await message.reply({ embeds: [embed] });

        } catch (error) {
            console.error('خطأ في البان:', error);
            return message.reply('❌ حدث خطأ أثناء بان العضو!');
        }
    }
};
