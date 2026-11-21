const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const config = require('../config.json');

module.exports = {
    name: 'roleUpdate',
    async execute(oldRole, newRole, client, db, saveDB) {
        if (!config.protectionSettings.roleProtection) return;

        const guild = newRole.guild;
        
        // التحقق من تغيير الصلاحيات
        const oldPermissions = oldRole.permissions.bitfield;
        const newPermissions = newRole.permissions.bitfield;
        
        if (oldPermissions !== newPermissions) {
            // الانتظار للحصول على audit log
            await new Promise(resolve => setTimeout(resolve, 500));
            
            try {
                const auditLogs = await guild.fetchAuditLogs({
                    type: AuditLogEvent.RoleUpdate,
                    limit: 1
                });

                const auditEntry = auditLogs.entries.first();
                
                if (auditEntry && auditEntry.target.id === newRole.id) {
                    const executor = auditEntry.executor;
                    
                    // التحقق من الوايت لست
                    if (db.whitelist && db.whitelist.includes(executor.id)) {
                        console.log(`✅ ${executor.tag} غيّر صلاحيات ${newRole.name} (في الوايت لست)`);
                        
                        // تحديث النسخة الاحتياطية بالصلاحيات الجديدة
                        const roleIndex = db.backup.roles.findIndex(r => r.id === newRole.id);
                        if (roleIndex !== -1) {
                            db.backup.roles[roleIndex].permissions = newPermissions.toString();
                            saveDB();
                        }
                        return;
                    }
                    
                    // التحقق من المالك
                    if (executor.id === guild.ownerId) {
                        console.log(`✅ المالك ${executor.tag} غيّر صلاحيات ${newRole.name}`);
                        
                        // تحديث النسخة الاحتياطية
                        const roleIndex = db.backup.roles.findIndex(r => r.id === newRole.id);
                        if (roleIndex !== -1) {
                            db.backup.roles[roleIndex].permissions = newPermissions.toString();
                            saveDB();
                        }
                        return;
                    }
                    
                    console.log(`⚠️ ${executor.tag} غيّر صلاحيات ${newRole.name} بدون صلاحيات!`);
                    
                    // إزالة رتب المخالف
                    const executorMember = await guild.members.fetch(executor.id).catch(() => null);
                    if (executorMember) {
                        await executorMember.roles.set([]).catch(console.error);
                        console.log(`🔨 تم إزالة جميع رتب ${executor.tag}`);
                    }
                    
                    // استعادة الصلاحيات القديمة من النسخة الاحتياطية
                    const backupRole = db.backup.roles.find(r => r.id === oldRole.id);
                    if (backupRole) {
                        await newRole.setPermissions(BigInt(backupRole.permissions), 'استعادة صلاحيات بعد تعديل غير مصرح')
                            .catch(console.error);
                        console.log(`✅ تم استعادة صلاحيات ${newRole.name} من النسخة الاحتياطية`);
                    } else {
                        // إذا لم يكن في النسخة، استخدم الصلاحيات القديمة
                        await newRole.setPermissions(oldPermissions, 'استعادة صلاحيات بعد تعديل غير مصرح')
                            .catch(console.error);
                        console.log(`✅ تم استعادة صلاحيات ${newRole.name}`);
                    }
                    
                    // إرسال لوق
                    const embed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('🚨 محاولة تغيير صلاحيات رول')
                        .setDescription(`**المخالف:** ${executor.tag} (${executor.id})\n**الرول:** ${newRole.name}\n**الإجراء:** تم استعادة الصلاحيات وإزالة رتب المخالف`)
                        .addFields(
                            { name: '⚠️ التغيير', value: 'تم محاولة تغيير صلاحيات الرول', inline: false },
                            { name: '✅ الحماية', value: 'تم استعادة الصلاحيات الأصلية', inline: false }
                        )
                        .setTimestamp();
                    
                    await client.sendLog(embed);
                }
            } catch (error) {
                console.error('خطأ في التحقق من تغيير صلاحيات الرول:', error);
            }
        }

        try {
            // تحديث معلومات الرول في النسخة الاحتياطية
            const roleIndex = db.backup.roles.findIndex(r => r.id === newRole.id);
            
            if (roleIndex !== -1) {
                // تحديث البيانات
                db.backup.roles[roleIndex] = {
                    id: newRole.id,
                    name: newRole.name,
                    color: newRole.color,
                    permissions: newRole.permissions.bitfield.toString(),
                    position: newRole.position,
                    hoist: newRole.hoist,
                    mentionable: newRole.mentionable
                };
                
                // حفظ كل 5 تحديثات فقط لتقليل عمليات الحفظ
                if (!global.roleUpdateCount) global.roleUpdateCount = 0;
                global.roleUpdateCount++;
                
                if (global.roleUpdateCount >= 5) {
                    saveDB();
                    global.roleUpdateCount = 0;
                }
            } else {
                // رول جديد، إضافته للنسخة الاحتياطية
                db.backup.roles.push({
                    id: newRole.id,
                    name: newRole.name,
                    color: newRole.color,
                    permissions: newRole.permissions.bitfield.toString(),
                    position: newRole.position,
                    hoist: newRole.hoist,
                    mentionable: newRole.mentionable
                });
                saveDB();
            }
        } catch (error) {
            console.error('خطأ في تحديث النسخة الاحتياطية للرول:', error);
        }
    }
};
