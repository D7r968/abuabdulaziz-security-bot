const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'clear',
    aliases: ['مسح', 'حذف'],
    description: 'حذف عدد من الرسائل',
    permissions: PermissionFlagsBits.ManageMessages,
    async execute(message, args, client) {
        const amount = parseInt(args[0]);

        if (isNaN(amount) || amount < 1 || amount > 100) {
            return message.reply('❌ يجب كتابة رقم بين 1 و 100!');
        }

        try {
            const deleted = await message.channel.bulkDelete(amount + 1, true);
            
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🗑️ تم حذف الرسائل')
                .setDescription(`تم حذف **${deleted.size - 1}** رسالة بنجاح!`)
                .setFooter({ text: `بواسطة: ${message.author.tag}` })
                .setTimestamp();

            const reply = await message.channel.send({ embeds: [embed] });
            
            setTimeout(() => {
                reply.delete().catch(() => {});
            }, 5000);

        } catch (error) {
            console.error('خطأ في حذف الرسائل:', error);
            return message.reply('❌ حدث خطأ أثناء حذف الرسائل! (تأكد من أن الرسائل ليست أقدم من 14 يوم)');
        }
    }
};
