const { EmbedBuilder, AuditLogEvent, PermissionFlagsBits } = require('discord.js');
const config = require('../config.json');

module.exports = {
    name: 'roleDelete',
    async execute(role, client, db, saveDB) {
        if (!config.protectionSettings.roleProtection) return;

        const guild = role.guild;
        
        // حفظ قائمة الأعضاء اللي معهم الرول قبل الحذف
        const membersWithRoleNow = [];
        for (const [memberId, member] of guild.members.cache) {
            if (member.roles.cache.has(role.id)) {
                membersWithRoleNow.push({
                    id: member.id,
                    tag: member.user.tag
                });
            }
        }
        
        console.log(`📋 الأعضاء اللي معهم الرول ${role.name}: ${membersWithRoleNow.length}`);
        
        // الانتظار قليلاً للحصول على audit log
        await new Promise(resolve => setTimeout(resolve, 500));
        
        try {
            const auditLogs = await guild.fetchAuditLogs({
                type: AuditLogEvent.RoleDelete,
                limit: 1
            });

            const deleteLog = auditLogs.entries.first();
            if (!deleteLog) return;

            const { executor, target } = deleteLog;
            
            // إذا كان المنفذ في الوايت لست، لا نفعل شيء
            if (client.isWhitelisted(executor.id)) {
                console.log(`✅ ${executor.tag} حذف رول ${role.name} (في الوايت لست)`);
                return;
            }

            console.log(`⚠️ ${executor.tag} حذف رول ${role.name} بدون صلاحيات!`);

            // إزالة جميع صلاحيات الشخص
            const member = await guild.members.fetch(executor.id).catch(() => null);
            if (member) {
                const memberRoles = member.roles.cache.filter(r => r.id !== guild.id);
                await member.roles.remove(memberRoles).catch(console.error);
                console.log(`🔨 تم إزالة جميع رتب ${executor.tag}`);
            }

            // استرجاع الرول من النسخة الاحتياطية
            const backupRole = db.backup.roles.find(r => r.id === role.id);
            if (backupRole) {
                const newRole = await guild.roles.create({
                    name: backupRole.name,
                    color: backupRole.color,
                    permissions: BigInt(backupRole.permissions),
                    position: backupRole.position,
                    hoist: backupRole.hoist,
                    mentionable: backupRole.mentionable,
                    reason: 'استرجاع رول محذوف بدون صلاحيات'
                }).catch(console.error);

                if (newRole) {
                    console.log(`✅ تم استرجاع الرول: ${newRole.name}`);

                    // حفظ mapping بين الرول القديم والجديد
                    if (!db.roleMapping) db.roleMapping = {};
                    db.roleMapping[role.id] = newRole.id;
                    
                    // تحديث النسخة الاحتياطية بالـ ID الجديد
                    const roleIndex = db.backup.roles.findIndex(r => r.id === role.id);
                    if (roleIndex !== -1) {
                        db.backup.roles[roleIndex].id = newRole.id;
                    }
                    
                    saveDB();

                    // إعادة الرول للأعضاء اللي كانوا معهم الرول
                    console.log(`🔄 جاري إعادة الرول لـ ${membersWithRoleNow.length} عضو...`);
                    
                    let restoredCount = 0;
                    for (const memberData of membersWithRoleNow) {
                        try {
                            const mem = await guild.members.fetch(memberData.id).catch(() => null);
                            if (mem) {
                                await mem.roles.add(newRole).catch(console.error);
                                
                                // تحديث رولات العضو في النسخة الاحتياطية
                                const memberIndex = db.backup.members.findIndex(m => m.id === memberData.id);
                                if (memberIndex !== -1) {
                                    // إزالة الرول القديم وإضافة الجديد
                                    const oldRoleIdx = db.backup.members[memberIndex].roles.indexOf(role.id);
                                    if (oldRoleIdx !== -1) {
                                        db.backup.members[memberIndex].roles[oldRoleIdx] = newRole.id;
                                    } else {
                                        // إضافة الرول إذا لم يكن موجود
                                        db.backup.members[memberIndex].roles.push(newRole.id);
                                    }
                                } else {
                                    // إضافة العضو للنسخة الاحتياطية
                                    db.backup.members.push({
                                        id: mem.id,
                                        username: mem.user.username,
                                        roles: mem.roles.cache.map(r => r.id),
                                        joinedAt: mem.joinedTimestamp
                                    });
                                }
                                
                                restoredCount++;
                                console.log(`  ✅ ${restoredCount}/${membersWithRoleNow.length} - تم إعادة الرول لـ ${mem.user.tag}`);
                            }
                        } catch (error) {
                            console.error(`  ❌ خطأ في إعادة الرول لعضو ${memberData.id}:`, error);
                        }
                    }
                    
                    saveDB();
                    console.log(`✅ اكتمل! تم إعادة الرول لـ ${restoredCount} من ${membersWithRoleNow.length} عضو`);
                    
                    // إرسال لوق مفصل
                    const embed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('✅ تم استرجاع رول محذوف')
                        .setDescription(`**الرول:** ${newRole.name}\n**تم إعادته لـ:** ${restoredCount} عضو`)
                        .addFields(
                            { name: '👥 الأعضاء', value: membersWithRoleNow.map(m => m.tag).slice(0, 10).join('\n') || 'لا يوجد', inline: false }
                        )
                        .setTimestamp();
                    
                    await client.sendLog(embed);
                }
            }

            // إرسال لوق
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🚨 محاولة حذف رول!')
                .setDescription(`**المخالف:** ${executor.tag} (${executor.id})\n**الرول المحذوف:** ${role.name}\n**الإجراء:** تم إزالة جميع رتبه واسترجاع الرول`)
                .setTimestamp()
                .setFooter({ text: 'نظام الحماية الاحترافي' });

            await client.sendLog(embed);

        } catch (error) {
            console.error('خطأ في حماية الرولات:', error);
        }
    }
};
