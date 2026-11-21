const { EmbedBuilder, AuditLogEvent, ChannelType } = require('discord.js');
const config = require('../config.json');

module.exports = {
    name: 'channelDelete',
    async execute(channel, client, db, saveDB) {
        if (!config.protectionSettings.channelProtection) return;

        const guild = channel.guild;
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        try {
            const auditLogs = await guild.fetchAuditLogs({
                type: AuditLogEvent.ChannelDelete,
                limit: 1
            });

            const deleteLog = auditLogs.entries.first();
            if (!deleteLog) return;

            const { executor } = deleteLog;
            
            if (client.isWhitelisted(executor.id)) {
                console.log(`✅ ${executor.tag} حذف قناة ${channel.name} (في الوايت لست)`);
                return;
            }

            console.log(`⚠️ ${executor.tag} حذف قناة ${channel.name} بدون صلاحيات!`);
            console.log(`   نوع القناة: ${channel.type}`);
            console.log(`   ID القناة: ${channel.id}`);

            // إزالة جميع صلاحيات الشخص
            const member = await guild.members.fetch(executor.id).catch(() => null);
            if (member) {
                const memberRoles = member.roles.cache.filter(r => r.id !== guild.id);
                await member.roles.remove(memberRoles).catch(console.error);
                console.log(`🔨 تم إزالة جميع رتب ${executor.tag}`);
            }

            // استرجاع القناة من النسخة الاحتياطية
            const backupChannel = db.backup.channels.find(c => c.id === channel.id);
            if (backupChannel) {
                console.log(`🔄 جاري استرجاع القناة: ${backupChannel.name}`);
                
                const channelOptions = {
                    name: backupChannel.name,
                    type: backupChannel.type,
                    position: backupChannel.position
                };

                // إضافة الخيارات حسب نوع القناة
                if (backupChannel.topic) channelOptions.topic = backupChannel.topic;
                if (backupChannel.nsfw !== undefined) channelOptions.nsfw = backupChannel.nsfw;
                if (backupChannel.rateLimitPerUser) channelOptions.rateLimitPerUser = backupChannel.rateLimitPerUser;
                if (backupChannel.bitrate) channelOptions.bitrate = backupChannel.bitrate;
                if (backupChannel.userLimit) channelOptions.userLimit = backupChannel.userLimit;
                if (backupChannel.parentId) channelOptions.parent = backupChannel.parentId;

                let newChannel;
                try {
                    newChannel = await guild.channels.create(channelOptions);
                    console.log(`✅ تم إنشاء القناة: ${newChannel.name} (${newChannel.id})`);
                } catch (error) {
                    console.error(`❌ خطأ في إنشاء القناة:`, error);
                    return;
                }

                if (newChannel) {
                    // تحديث ID القناة في النسخة الاحتياطية
                    const channelIndex = db.backup.channels.findIndex(c => c.id === channel.id);
                    if (channelIndex !== -1) {
                        db.backup.channels[channelIndex].id = newChannel.id;
                    }
                    saveDB();

                    // استرجاع الصلاحيات
                    if (backupChannel.permissionOverwrites && backupChannel.permissionOverwrites.length > 0) {
                        console.log(`🔐 جاري استرجاع ${backupChannel.permissionOverwrites.length} صلاحية...`);
                        
                        let permRestored = 0;
                        for (const perm of backupChannel.permissionOverwrites) {
                            try {
                                await newChannel.permissionOverwrites.create(perm.id, {
                                    allow: BigInt(perm.allow),
                                    deny: BigInt(perm.deny)
                                }, { reason: 'استرجاع صلاحيات بعد حذف غير مصرح' });
                                permRestored++;
                                console.log(`  ✅ ${permRestored}/${backupChannel.permissionOverwrites.length} - تم استرجاع صلاحية ${perm.id}`);
                            } catch (error) {
                                console.error(`  ❌ خطأ في استرجاع صلاحية ${perm.id}:`, error);
                            }
                        }
                        
                        console.log(`✅ تم استرجاع ${permRestored} من ${backupChannel.permissionOverwrites.length} صلاحية`);
                    }

                    // استرجاع الرسائل المحفوظة
                    if (db.savedMessages && db.savedMessages[channel.id]) {
                        const savedMessages = db.savedMessages[channel.id];
                        
                        if (savedMessages.length > 0) {
                            console.log(`📨 جاري استرجاع ${savedMessages.length} رسالة... (قد يستغرق بعض الوقت)`);

                            // إرسال رسالة توضيحية
                            await newChannel.send({
                                embeds: [{
                                    color: 0x00BFFF,
                                    title: '📋 رسائل مسترجعة من النسخة الاحتياطية',
                                    description: `جاري استرجاع **${savedMessages.length}** رسالة من القناة المحذوفة...\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n⏰ قد يستغرق هذا عدة دقائق، يرجى الانتظار...`,
                                    timestamp: new Date()
                                }]
                            });

                            // استرجاع جميع الرسائل المحفوظة (حتى 1000 رسالة)
                            const messagesToRestore = savedMessages;
                            
                            let successCount = 0;
                            let errorCount = 0;
                            
                            for (const msg of messagesToRestore) {
                                try {
                                    const embed = new EmbedBuilder()
                                        .setColor('#36393f')
                                        .setAuthor({ 
                                            name: msg.author.tag,
                                            iconURL: `https://cdn.discordapp.com/embed/avatars/${msg.author.id % 5}.png`
                                        })
                                        .setDescription(msg.content || '*[رسالة بدون محتوى نصي]*')
                                        .setTimestamp(msg.timestamp)
                                        .setFooter({ text: `رسالة أصلية من ${new Date(msg.timestamp).toLocaleString('ar-SA')}` });

                                    // إضافة معلومات المرفقات
                                    if (msg.attachments && msg.attachments.length > 0) {
                                        const attachmentsList = msg.attachments.map(att => 
                                            `📎 [${att.name}](${att.url})`
                                        ).join('\n');
                                        embed.addFields({ name: '📎 مرفقات', value: attachmentsList });
                                    }

                                    await newChannel.send({ embeds: [embed] });
                                    successCount++;
                                    
                                    // تأخير بسيط لتجنب Rate Limit (500ms بين كل رسالة)
                                    await new Promise(resolve => setTimeout(resolve, 500));
                                    
                                    // كل 100 رسالة، انتظر 30 ثانية لتجنب Rate Limit
                                    if (successCount % 100 === 0) {
                                        console.log(`⏰ تم استرجاع ${successCount}/${messagesToRestore.length} رسالة، انتظار 30 ثانية...`);
                                        
                                        await newChannel.send({
                                            embeds: [{
                                                color: 0xFFA500,
                                                description: `⏰ تم استرجاع ${successCount}/${messagesToRestore.length} رسالة\nاستراحة قصيرة (30 ثانية) لتجنب Rate Limit...`,
                                            }]
                                        });
                                        
                                        await new Promise(resolve => setTimeout(resolve, 30000));
                                    }
                                    
                                } catch (err) {
                                    errorCount++;
                                    if (err.code === 50013) { // Missing Permissions
                                        console.error('❌ البوت لا يملك صلاحيات الإرسال في القناة');
                                        break;
                                    } else if (err.code === 429) { // Rate Limited
                                        console.log('⏰ Rate Limit! انتظار دقيقة...');
                                        await new Promise(resolve => setTimeout(resolve, 60000));
                                    } else {
                                        console.error('خطأ في استرجاع رسالة:', err.message);
                                    }
                                }
                            }

                            console.log(`✅ تم استرجاع ${successCount} رسالة، فشل ${errorCount}`);

                            // إرسال رسالة إتمام
                            await newChannel.send({
                                embeds: [{
                                    color: successCount > 0 ? 0x00FF00 : 0xFF0000,
                                    title: '✅ اكتمل استرجاع الرسائل',
                                    description: `**نجح:** ${successCount} رسالة\n**فشل:** ${errorCount} رسالة\n**الإجمالي:** ${messagesToRestore.length} رسالة`,
                                    timestamp: new Date()
                                }]
                            });

                            // تحديث معلومات الرسائل المحفوظة للقناة الجديدة
                            db.savedMessages[newChannel.id] = db.savedMessages[channel.id];
                            delete db.savedMessages[channel.id];
                            saveDB();
                        }
                    }
                }
            } else {
                console.log(`⚠️ لا توجد نسخة احتياطية للقناة ${channel.name} (${channel.id})`);
                console.log(`   استخدم: !fix roles أو !backup create لإنشاء نسخة احتياطية`);
                console.log(`   القنوات في النسخة الاحتياطية: ${db.backup.channels.length}`);
            }

            // إرسال لوق
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🚨 محاولة حذف قناة!')
                .setDescription(`**المخالف:** ${executor.tag} (${executor.id})\n**القناة المحذوفة:** ${channel.name}\n**الإجراء:** تم إزالة جميع رتبه واسترجاع القناة`)
                .setTimestamp()
                .setFooter({ text: 'نظام الحماية الاحترافي' });

            await client.sendLog(embed);

        } catch (error) {
            console.error('خطأ في حماية القنوات:', error);
        }
    }
};
