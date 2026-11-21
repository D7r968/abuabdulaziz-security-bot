const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const fs = require('fs');

module.exports = {
    name: 'setname',
    aliases: ['اسم'],
    description: 'تغيير اسم البوت',
    ownerOnly: true,
    async execute(message, args, client) {
        if (!args[0]) {
            return message.reply('❌ يجب كتابة الاسم الجديد!');
        }

        const newName = args.join(' ');

        if (newName.length < 2 || newName.length > 32) {
            return message.reply('❌ الاسم يجب أن يكون بين 2-32 حرف!');
        }

        try {
            await client.user.setUsername(newName);
            
            config.botName = newName;
            fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ تم تغيير اسم البوت')
                .setDescription(`**الاسم الجديد:** ${newName}`)
                .setTimestamp()
                .setFooter({ text: 'ملاحظة: قد يستغرق الأمر بعض الوقت حتى يظهر التغيير' });

            await message.reply({ embeds: [embed] });

        } catch (error) {
            if (error.code === 50035) {
                return message.reply('❌ الاسم غير صالح! تأكد من عدم استخدام رموز خاصة.');
            } else if (error.message.includes('rate limit')) {
                return message.reply('❌ تم تغيير الاسم مؤخراً! يمكنك تغييره مرة أخرى بعد ساعة.');
            }
            
            console.error('خطأ في تغيير الاسم:', error);
            return message.reply('❌ حدث خطأ أثناء تغيير الاسم!');
        }
    }
};
