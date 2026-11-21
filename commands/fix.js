const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'fix',
    aliases: ['إصلاح', 'repair'],
    description: 'إصلاح ومزامنة الرولات',
    permissions: PermissionFlagsBits.Administrator,
    async execute(message, args, client, db, saveDB) {
        const subCommand = args[0]?.toLowerCase();

        if (!subCommand || !['roles', 'رولات', 'sync', 'مزامنة'].includes(subCommand)) {
            return message.reply('❌ استخدام خاطئ! استخدم: `fix <roles/sync>`');
        }

        const msg = await message.reply('⏳ جاري المزامنة...');

        try {
            const guild = message.guild;
            let fixed = 0;
            let errors = 0;

            // مزامنة الرولات في النسخة الاحتياطية
            console.log('🔄 بدء مزامنة الرولات...');
            
            // تحديث جميع الرولات الموجودة
            for (const [roleId, role] of guild.roles.cache) {
                const backupIndex = db.backup.roles.findIndex(r => r.id === roleId);
                
                if (backupIndex !== -1) {
                    // تحديث الرول الموجود
                    db.backup.roles[backupIndex] = {
                        id: role.id,
                        name: role.name,
                        color: role.color,
                        permissions: role.permissions.bitfield.toString(),
                        position: role.position,
                        hoist: role.hoist,
                        mentionable: role.mentionable
                    };
                    fixed++;
                } else {
                    // إضافة رول جديد
                    db.backup.roles.push({
                        id: role.id,
                        name: role.name,
                        color: role.color,
                        permissions: role.permissions.bitfield.toString(),
                        position: role.position,
                        hoist: role.hoist,
                        mentionable: role.mentionable
                    });
                    fixed++;
                }
            }

            // حذف الرولات المحذوفة من النسخة الاحتياطية
            db.backup.roles = db.backup.roles.filter(r => guild.roles.cache.has(r.id));

            // مزامنة رولات الأعضاء
            console.log('🔄 مزامنة رولات الأعضاء...');
            
            for (const [memberId, member] of guild.members.cache) {
                const memberIndex = db.backup.members.findIndex(m => m.id === memberId);
                
                if (memberIndex !== -1) {
                    // تحديث رولات العضو
                    db.backup.members[memberIndex].roles = member.roles.cache.map(r => r.id);
                } else {
                    // إضافة عضو جديد
                    db.backup.members.push({
                        id: member.id,
                        username: member.user.username,
                        discriminator: member.user.discriminator,
                        roles: member.roles.cache.map(r => r.id),
                        joinedAt: member.joinedTimestamp
                    });
                }
            }

            // حذف الأعضاء الذين غادروا
            db.backup.members = db.backup.members.filter(m => guild.members.cache.has(m.id));

            saveDB();

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ تمت المزامنة بنجاح!')
                .addFields(
                    { name: '📊 الرولات المحدثة', value: `${fixed}`, inline: true },
                    { name: '👥 الأعضاء المحدثين', value: `${guild.members.cache.size}`, inline: true },
                    { name: '❌ أخطاء', value: `${errors}`, inline: true }
                )
                .setDescription(`تم مزامنة جميع الرولات والأعضاء مع النسخة الاحتياطية`)
                .setTimestamp();

            await msg.edit({ content: null, embeds: [embed] });
            console.log(`✅ تمت المزامنة: ${fixed} رول، ${guild.members.cache.size} عضو`);

        } catch (error) {
            console.error('خطأ في المزامنة:', error);
            await msg.edit('❌ حدث خطأ أثناء المزامنة!');
        }
    }
};
