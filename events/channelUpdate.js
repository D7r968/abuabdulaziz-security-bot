const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const config = require('../config.json');

module.exports = {
    name: 'channelUpdate',
    async execute(oldChannel, newChannel, client, db, saveDB) {
        if (!config.protectionSettings.channelProtection) return;

        const guild = newChannel.guild;
        
        // التحقق من تغيير الصلاحيات
        const oldPermissions = oldChannel.permissionOverwrites?.cache || new Map();
        const newPermissions = newChannel.permissionOverwrites?.cache || new Map();
        
        // مقارنة الصلاحيات
        let permissionsChanged = false;
        
        console.log(`🔍 فحص القناة: ${newChannel.name}`);
        console.log(`   الصلاحيات القديمة: ${oldPermissions.size}`);
        console.log(`   الصلاحيات الجديدة: ${newPermissions.size}`);
        
        // التحقق من عدد الصلاحيات
        if (oldPermissions.size !== newPermissions.size) {
            permissionsChanged = true;
            console.log(`   ⚠️ تغيير في العدد!`);
        } else {
            // التحقق من محتوى الصلاحيات
            for (const [id, oldPerm] of oldPermissions) {
                const newPerm = newPermissions.get(id);
                if (!newPerm) {
                    permissionsChanged = true;
                    console.log(`   ⚠️ صلاحية محذوفة: ${id}`);
                    break;
                }
                
                const oldAllow = oldPerm.allow?.bitfield || BigInt(0);
                const newAllow = newPerm.allow?.bitfield || BigInt(0);
                const oldDeny = oldPerm.deny?.bitfield || BigInt(0);
                const newDeny = newPerm.deny?.bitfield || BigInt(0);
                
                if (oldAllow !== newAllow || oldDeny !== newDeny) {
                    permissionsChanged = true;
                    console.log(`   ⚠️ تغيير في صلاحيات: ${id}`);
                    console.log(`      القديم - Allow: ${oldAllow}, Deny: ${oldDeny}`);
                    console.log(`      الجديد - Allow: ${newAllow}, Deny: ${newDeny}`);
                    break;
                }
            }
        }
        
        if (permissionsChanged) {
            console.log(`⚠️ تم اكتشاف تغيير في صلاحيات ${newChannel.name}!`);
            
            // الانتظار للحصول على audit log
            await new Promise(resolve => setTimeout(resolve, 500));
            
            try {
                const auditLogs = await guild.fetchAuditLogs({
                    type: AuditLogEvent.ChannelUpdate,
                    limit: 1
                });

                const auditEntry = auditLogs.entries.first();
                
                if (auditEntry && auditEntry.target.id === newChannel.id) {
                    const executor = auditEntry.executor;
                    
                    // التحقق من الوايت لست
                    if (db.whitelist && db.whitelist.includes(executor.id)) {
                        console.log(`✅ ${executor.tag} غيّر صلاحيات ${newChannel.name} (في الوايت لست)`);
                        
                        // تحديث النسخة الاحتياطية
                        const channelIndex = db.backup.channels.findIndex(c => c.id === newChannel.id);
                        if (channelIndex !== -1) {
                            db.backup.channels[channelIndex].permissionOverwrites = Array.from(newChannel.permissionOverwrites.cache.values()).map(p => ({
                                id: p.id,
                                type: p.type,
                                allow: p.allow.bitfield.toString(),
                                deny: p.deny.bitfield.toString()
                            }));
                            saveDB();
                        }
                        return;
                    }
                    
                    // التحقق من المالك
                    if (executor.id === guild.ownerId) {
                        console.log(`✅ المالك ${executor.tag} غيّر صلاحيات ${newChannel.name}`);
                        
                        // تحديث النسخة الاحتياطية
                        const channelIndex = db.backup.channels.findIndex(c => c.id === newChannel.id);
                        if (channelIndex !== -1) {
                            db.backup.channels[channelIndex].permissionOverwrites = Array.from(newChannel.permissionOverwrites.cache.values()).map(p => ({
                                id: p.id,
                                type: p.type,
                                allow: p.allow.bitfield.toString(),
                                deny: p.deny.bitfield.toString()
                            }));
                            saveDB();
                        }
                        return;
                    }
                    
                    console.log(`⚠️ ${executor.tag} غيّر صلاحيات ${newChannel.name} بدون صلاحيات!`);
                    
                    // إزالة رتب المخالف
                    const executorMember = await guild.members.fetch(executor.id).catch(() => null);
                    if (executorMember) {
                        await executorMember.roles.set([]).catch(console.error);
                        console.log(`🔨 تم إزالة جميع رتب ${executor.tag}`);
                    }
                    
                    // استعادة الصلاحيات القديمة من النسخة الاحتياطية
                    const backupChannel = db.backup.channels.find(c => c.id === oldChannel.id);
                    
                    if (backupChannel && backupChannel.permissionOverwrites) {
                        console.log(`🔄 جاري استعادة صلاحيات ${newChannel.name} (${backupChannel.permissionOverwrites.length} صلاحية)...`);
                        
                        try {
                            // حذف جميع الصلاحيات الحالية
                            for (const [id, perm] of newChannel.permissionOverwrites.cache) {
                                await newChannel.permissionOverwrites.delete(id, 'إزالة صلاحيات غير مصرح بها')
                                    .catch(err => console.error(`خطأ في حذف صلاحية ${id}:`, err));
                            }
                            
                            console.log(`   ✅ تم حذف الصلاحيات الحالية`);
                            
                            // استعادة الصلاحيات من النسخة
                            let restored = 0;
                            for (const perm of backupChannel.permissionOverwrites) {
                                try {
                                    await newChannel.permissionOverwrites.create(perm.id, {
                                        allow: BigInt(perm.allow),
                                        deny: BigInt(perm.deny)
                                    }, { reason: 'استعادة صلاحيات بعد تعديل غير مصرح' });
                                    restored++;
                                    console.log(`   ✅ ${restored}/${backupChannel.permissionOverwrites.length} - تم استعادة صلاحية ${perm.id}`);
                                } catch (err) {
                                    console.error(`   ❌ خطأ في استعادة صلاحية ${perm.id}:`, err);
                                }
                            }
                            
                            console.log(`✅ اكتمل! تم استعادة ${restored} من ${backupChannel.permissionOverwrites.length} صلاحية لـ ${newChannel.name}`);
                        } catch (error) {
                            console.error(`خطأ في استعادة صلاحيات ${newChannel.name}:`, error);
                        }
                    } else {
                        console.log(`⚠️ لا توجد نسخة احتياطية لصلاحيات ${newChannel.name}`);
                        console.log(`   استخدم: !fix roles لتحديث النسخة الاحتياطية`);
                    }
                    
                    // إرسال لوق
                    const embed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('🚨 محاولة تغيير صلاحيات قناة')
                        .setDescription(`**المخالف:** ${executor.tag} (${executor.id})\n**القناة:** ${newChannel.name}\n**الإجراء:** تم استعادة الصلاحيات وإزالة رتب المخالف`)
                        .addFields(
                            { name: '⚠️ التغيير', value: 'تم محاولة تغيير صلاحيات القناة', inline: false },
                            { name: '✅ الحماية', value: 'تم استعادة الصلاحيات الأصلية', inline: false }
                        )
                        .setTimestamp();
                    
                    await client.sendLog(embed);
                }
            } catch (error) {
                console.error('خطأ في التحقق من تغيير صلاحيات القناة:', error);
            }
        }
        
        // تحديث معلومات القناة في النسخة الاحتياطية (للتغييرات الأخرى)
        try {
            const channelIndex = db.backup.channels.findIndex(c => c.id === newChannel.id);
            
            if (channelIndex !== -1) {
                db.backup.channels[channelIndex] = {
                    id: newChannel.id,
                    name: newChannel.name,
                    type: newChannel.type,
                    position: newChannel.position,
                    topic: newChannel.topic || '',
                    nsfw: newChannel.nsfw || false,
                    parent: newChannel.parentId,
                    permissionOverwrites: Array.from(newChannel.permissionOverwrites.cache.values()).map(p => ({
                        id: p.id,
                        type: p.type,
                        allow: p.allow.bitfield.toString(),
                        deny: p.deny.bitfield.toString()
                    }))
                };
                
                // حفظ كل 5 تحديثات
                if (!global.channelUpdateCount) global.channelUpdateCount = 0;
                global.channelUpdateCount++;
                
                if (global.channelUpdateCount >= 5) {
                    saveDB();
                    global.channelUpdateCount = 0;
                }
            }
        } catch (error) {
            console.error('خطأ في تحديث النسخة الاحتياطية للقناة:', error);
        }
    }
};
