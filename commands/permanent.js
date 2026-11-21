const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    name: 'permanent',
    aliases: ['perm', 'ثابت'],
    description: 'إدارة الرولات الثابتة',
    permissions: PermissionFlagsBits.Administrator,
    async execute(message, args, client, db, saveDB) {
        const subCommand = args[0]?.toLowerCase();

        if (!subCommand || !['add', 'remove', 'list', 'اضافة', 'حذف', 'قائمة'].includes(subCommand)) {
            return message.reply('❌ استخدام خاطئ! استخدم: `permanent <add/remove/list> [@user] [@role]`');
        }

        // عرض القائمة
        if (subCommand === 'list' || subCommand === 'قائمة') {
            if (!db.permanentRoles || db.permanentRoles.length === 0) {
                return message.reply('📋 لا توجد رولات ثابتة مسجلة!');
            }

            const embed = new EmbedBuilder()
                .setColor('#00BFFF')
                .setTitle('📋 قائمة الرولات الثابتة')
                .setTimestamp();

            for (const roleConfig of db.permanentRoles) {
                const role = message.guild.roles.cache.get(roleConfig.roleId);
                if (!role) continue;

                const members = roleConfig.memberIds.map(id => `<@${id}>`).join(', ');
                embed.addFields({
                    name: `🎭 ${role.name}`,
                    value: `**الأعضاء:** ${members || 'لا يوجد'}\n**العدد:** ${roleConfig.memberIds.length}`,
                    inline: false
                });
            }

            return message.reply({ embeds: [embed] });
        }

        // إضافة أو حذف
        const user = message.mentions.users.first();
        const role = message.mentions.roles.first();

        if (!user || !role) {
            return message.reply('❌ يجب منشن العضو والرول! مثال: `permanent add @user @role`');
        }

        const member = await message.guild.members.fetch(user.id).catch(() => null);
        if (!member) {
            return message.reply('❌ العضو غير موجود في السيرفر!');
        }

        // التأكد من وجود مصفوفة الرولات الثابتة
        if (!db.permanentRoles) {
            db.permanentRoles = [];
        }

        if (subCommand === 'add' || subCommand === 'اضافة') {
            // البحث عن الرول في القائمة
            let roleConfig = db.permanentRoles.find(r => r.roleId === role.id);
            
            if (!roleConfig) {
                // إنشاء تكوين جديد للرول
                roleConfig = {
                    roleId: role.id,
                    memberIds: []
                };
                db.permanentRoles.push(roleConfig);
            }

            if (roleConfig.memberIds.includes(user.id)) {
                return message.reply('⚠️ هذا العضو لديه بالفعل هذا الرول كرول ثابت!');
            }

            // إضافة العضو للقائمة
            roleConfig.memberIds.push(user.id);
            
            // إعطاء الرول للعضو
            await member.roles.add(role).catch(console.error);
            
            saveDB();

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ تمت إضافة رول ثابت')
                .setDescription(`**العضو:** ${user.tag}\n**الرول:** ${role.name}\n\n🔒 الآن هذا الرول لن يُزال من العضو تلقائياً مهما حدث`)
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }

        if (subCommand === 'remove' || subCommand === 'حذف') {
            const roleConfig = db.permanentRoles.find(r => r.roleId === role.id);
            
            if (!roleConfig || !roleConfig.memberIds.includes(user.id)) {
                return message.reply('⚠️ هذا العضو ليس لديه هذا الرول كرول ثابت!');
            }

            // إزالة العضو من القائمة
            roleConfig.memberIds = roleConfig.memberIds.filter(id => id !== user.id);
            
            // إزالة التكوين إذا لم يبق أعضاء
            if (roleConfig.memberIds.length === 0) {
                db.permanentRoles = db.permanentRoles.filter(r => r.roleId !== role.id);
            }
            
            saveDB();

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('✅ تمت إزالة الرول الثابت')
                .setDescription(`**العضو:** ${user.tag}\n**الرول:** ${role.name}\n\n🔓 الآن يمكن إزالة هذا الرول من العضو بشكل عادي`)
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }
    }
};
