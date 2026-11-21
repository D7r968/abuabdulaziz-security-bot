const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const config = require('../config.json');

module.exports = {
    name: 'guildBanAdd',
    async execute(ban, client, db, saveDB) {
        if (!config.protectionSettings.banProtection) return;

        const guild = ban.guild;
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        try {
            const auditLogs = await guild.fetchAuditLogs({
                type: AuditLogEvent.MemberBanAdd,
                limit: 1
            });

            const banLog = auditLogs.entries.first();
            if (!banLog) return;

            const { executor, target } = banLog;
            
            // إذا البوت هو اللي بان، نتجاهل
            if (target.id === client.user.id) return;
            
            if (client.isWhitelisted(executor.id)) {
                console.log(`✅ ${executor.tag} بان ${target.tag} (في الوايت لست)`);
                return;
            }

            console.log(`⚠️ ${executor.tag} بان ${target.tag} بدون صلاحيات!`);

            // حفظ رولات العضو من النسخة الاحتياطية
            const memberBackup = db.backup.members.find(m => m.id === target.id);

            // إزالة البان
            await guild.bans.remove(target.id, 'حماية تلقائية - بان غير مصرح').catch(console.error);
            console.log(`✅ تم إزالة البان عن ${target.tag}`);

            // إرسال دعوة للعضو المبند لإعادته
            try {
                // إنشاء دعوة مؤقتة
                const channels = guild.channels.cache.filter(c => c.isTextBased() && c.permissionsFor(guild.members.me).has('CreateInstantInvite'));
                const channel = channels.first();
                
                if (channel) {
                    const invite = await channel.createInvite({
                        maxAge: 300, // 5 دقائق
                        maxUses: 1,
                        unique: true,
                        reason: 'استعادة عضو تم بانه بدون صلاحيات'
                    });

                    // إرسال الدعوة للعضو
                    const targetUser = await client.users.fetch(target.id);
                    await targetUser.send({
                        content: `🔄 **تم استرجاعك تلقائياً**\n\nتم بانك من سيرفر **${guild.name}** بدون صلاحيات صحيحة.\n\n✅ تم إلغاء البان تلقائياً\n📨 استخدم هذه الدعوة للعودة: ${invite.url}\n\n⏰ الدعوة صالحة لمدة 5 دقائق فقط!`
                    }).catch(() => console.log('لم يتمكن البوت من إرسال رسالة للعضو'));

                    console.log(`📨 تم إرسال دعوة لـ ${target.tag}`);

                    // حفظ معلومات لإعادة الرولات عند العودة
                    if (memberBackup) {
                        if (!db.pendingRestores) db.pendingRestores = {};
                        db.pendingRestores[target.id] = {
                            roles: memberBackup.roles,
                            timestamp: Date.now()
                        };
                        saveDB();
                    }
                }
            } catch (error) {
                console.error('خطأ في إرسال الدعوة:', error);
            }

            // معاقبة المخالف
            const member = await guild.members.fetch(executor.id).catch(() => null);
            if (member) {
                // إزالة جميع الرتب
                const memberRoles = member.roles.cache.filter(r => r.id !== guild.id);
                await member.roles.remove(memberRoles).catch(console.error);
                
                // بان المخالف
                await guild.members.ban(executor.id, { 
                    reason: 'محاولة بان أعضاء بدون صلاحيات' 
                }).catch(console.error);
                
                console.log(`🔨 تم بان ${executor.tag}`);
            }

            // إرسال لوق
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🚨 محاولة بان غير مصرح!')
                .setDescription(`**المخالف:** ${executor.tag} (${executor.id})\n**الضحية:** ${target.tag} (${target.id})\n**الإجراء:** تم إزالة البان وبان المخالف`)
                .setTimestamp()
                .setFooter({ text: 'نظام الحماية الاحترافي' });

            await client.sendLog(embed);

        } catch (error) {
            console.error('خطأ في حماية البان:', error);
        }
    }
};
