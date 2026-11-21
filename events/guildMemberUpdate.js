const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');

module.exports = {
    name: 'guildMemberUpdate',
    async execute(oldMember, newMember, client, db, saveDB) {
        // تحديث رولات العضو في النسخة الاحتياطية
        const memberIndex = db.backup.members.findIndex(m => m.id === newMember.id);
        
        if (memberIndex !== -1) {
            // تحديث الرولات
            db.backup.members[memberIndex].roles = newMember.roles.cache.map(r => r.id);
            
            // حفظ كل 5 تحديثات
            if (!global.memberUpdateCount) global.memberUpdateCount = 0;
            global.memberUpdateCount++;
            
            if (global.memberUpdateCount >= 5) {
                saveDB();
                global.memberUpdateCount = 0;
            }
        } else {
            // إضافة عضو جديد
            db.backup.members.push({
                id: newMember.id,
                username: newMember.user.username,
                roles: newMember.roles.cache.map(r => r.id),
                joinedAt: newMember.joinedTimestamp
            });
            saveDB();
        }

        // نظام الرولات الثابتة
        if (db.permanentRoles && db.permanentRoles.length > 0) {
            for (const roleConfig of db.permanentRoles) {
                const { roleId, memberIds } = roleConfig;
                
                if (memberIds.includes(newMember.id)) {
                    const role = newMember.guild.roles.cache.get(roleId);
                    
                    if (role && !newMember.roles.cache.has(roleId)) {
                        await newMember.roles.add(role).catch(console.error);
                        console.log(`🔄 تم إعادة الرول الثابت ${role.name} لـ ${newMember.user.tag}`);
                        
                        const embed = new EmbedBuilder()
                            .setColor('#FFA500')
                            .setTitle('🔄 إعادة رول ثابت')
                            .setDescription(`**العضو:** ${newMember.user.tag}\n**الرول:** ${role.name}\n**السبب:** رول ثابت تم إعادته تلقائياً`)
                            .setTimestamp();
                        
                        await client.sendLog(embed);
                    }
                }
            }
        }

        // مراقبة تغيير الصلاحيات الخطيرة
        const dangerousPerms = [
            'Administrator',
            'ManageGuild',
            'ManageRoles',
            'ManageChannels',
            'BanMembers',
            'KickMembers'
        ];

        const oldPerms = oldMember.permissions.toArray();
        const newPerms = newMember.permissions.toArray();
        
        const addedPerms = newPerms.filter(p => !oldPerms.includes(p) && dangerousPerms.includes(p));
        
        if (addedPerms.length > 0 && !client.isWhitelisted(newMember.id)) {
            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('⚠️ تحذير: تم إضافة صلاحيات خطيرة!')
                .setDescription(`**العضو:** ${newMember.user.tag} (${newMember.id})\n**الصلاحيات المضافة:** ${addedPerms.join(', ')}\n**تنبيه:** راقب هذا العضو`)
                .setTimestamp();
            
            await client.sendLog(embed);
        }
    }
};
