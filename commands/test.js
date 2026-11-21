const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'test',
    aliases: ['اختبار'],
    description: 'اختبار نظام استعادة الرولات',
    permissions: PermissionFlagsBits.Administrator,
    ownerOnly: true,
    async execute(message, args, client, db, saveDB) {
        const subCommand = args[0]?.toLowerCase();

        if (!subCommand || !['role', 'رول', 'restore', 'استعادة'].includes(subCommand)) {
            return message.reply('❌ استخدام خاطئ! استخدم: `test role [@role] [@user]`');
        }

        const role = message.mentions.roles.first();
        const user = message.mentions.users.first();

        if (!role) {
            return message.reply('❌ يجب منشن الرول!');
        }

        if (!user) {
            return message.reply('❌ يجب منشن العضو!');
        }

        const member = await message.guild.members.fetch(user.id).catch(() => null);
        if (!member) {
            return message.reply('❌ العضو غير موجود في السيرفر!');
        }

        try {
            const msg = await message.reply('⏳ جاري الاختبار...');

            // الخطوة 1: إضافة الرول للعضو
            await member.roles.add(role);
            await msg.edit('✅ الخطوة 1: تم إضافة الرول للعضو');
            await new Promise(resolve => setTimeout(resolve, 2000));

            // الخطوة 2: مزامنة النسخة الاحتياطية
            await msg.edit('⏳ الخطوة 2: مزامنة النسخة الاحتياطية...');
            
            // تحديث رولات العضو في النسخة
            const memberIndex = db.backup.members.findIndex(m => m.id === member.id);
            if (memberIndex !== -1) {
                db.backup.members[memberIndex].roles = member.roles.cache.map(r => r.id);
            } else {
                db.backup.members.push({
                    id: member.id,
                    username: member.user.username,
                    roles: member.roles.cache.map(r => r.id),
                    joinedAt: member.joinedTimestamp
                });
            }
            
            // تحديث الرول في النسخة
            const roleIndex = db.backup.roles.findIndex(r => r.id === role.id);
            if (roleIndex === -1) {
                db.backup.roles.push({
                    id: role.id,
                    name: role.name,
                    color: role.color,
                    permissions: role.permissions.bitfield.toString(),
                    position: role.position,
                    hoist: role.hoist,
                    mentionable: role.mentionable
                });
            }
            
            saveDB();
            await msg.edit('✅ الخطوة 2: تم المزامنة');
            await new Promise(resolve => setTimeout(resolve, 2000));

            // الخطوة 3: عرض المعلومات
            const embed = new EmbedBuilder()
                .setColor('#00BFFF')
                .setTitle('📊 معلومات الاختبار')
                .addFields(
                    { name: '👤 العضو', value: `${member.user.tag}`, inline: true },
                    { name: '🎭 الرول', value: `${role.name}`, inline: true },
                    { name: '✅ الحالة', value: 'جاهز للاختبار!', inline: false },
                    { name: '📝 التعليمات', value: 'الآن احذف الرول وشوف البوت يرجعه تلقائياً للعضو!', inline: false }
                )
                .setTimestamp();

            await msg.edit({ content: null, embeds: [embed] });

            // إرسال رسالة إضافية
            await message.channel.send({
                embeds: [{
                    color: 0xFFD700,
                    title: '🧪 جاهز للاختبار!',
                    description: `**الخطوات:**\n1. ✅ تم إضافة الرول ${role} للعضو ${member}\n2. ✅ تم المزامنة مع النسخة الاحتياطية\n3. 🗑️ الآن احذف الرول ${role}\n4. 👀 شاهد البوت يرجعه تلقائياً!\n\n**ملاحظة:** تأكد أنك لست في الوايت لست للاختبار`
                }]
            });

        } catch (error) {
            console.error('خطأ في الاختبار:', error);
            return message.reply('❌ حدث خطأ أثناء الاختبار!');
        }
    }
};
