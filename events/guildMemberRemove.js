const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const config = require('../config.json');

module.exports = {
    name: 'guildMemberRemove',
    async execute(member, client, db, saveDB) {
        if (!config.protectionSettings.kickProtection) return;

        const guild = member.guild;
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        try {
            const auditLogs = await guild.fetchAuditLogs({
                type: AuditLogEvent.MemberKick,
                limit: 1
            });

            const kickLog = auditLogs.entries.first();
            
            // التحقق إذا كان كيك
            if (!kickLog || kickLog.target.id !== member.id) return;
            if (Date.now() - kickLog.createdTimestamp > 5000) return;

            const { executor } = kickLog;
            
            if (client.isWhitelisted(executor.id)) {
                console.log(`✅ ${executor.tag} كك ${member.user.tag} (في الوايت لست)`);
                return;
            }

            console.log(`⚠️ ${executor.tag} كك ${member.user.tag} بدون صلاحيات!`);

            // حفظ معلومات العضو
            const memberBackup = db.backup.members.find(m => m.id === member.id);

            // إرسال دعوة للعضو المكيك
            try {
                const channels = guild.channels.cache.filter(c => c.isTextBased() && c.permissionsFor(guild.members.me).has('CreateInstantInvite'));
                const channel = channels.first();
                
                if (channel) {
                    const invite = await channel.createInvite({
                        maxAge: 300, // 5 دقائق
                        maxUses: 1,
                        unique: true,
                        reason: 'استعادة عضو تم كيكه بدون صلاحيات'
                    });

                    // إرسال الدعوة للعضو
                    await member.user.send({
                        content: `🔄 **تم استرجاعك تلقائياً**\n\nتم كيكك من سيرفر **${guild.name}** بدون صلاحيات صحيحة.\n\n✅ نظام الحماية اكتشف المخالفة\n📨 استخدم هذه الدعوة للعودة: ${invite.url}\n\n⏰ الدعوة صالحة لمدة 5 دقائق فقط!`
                    }).catch(() => console.log('لم يتمكن البوت من إرسال رسالة للعضو'));

                    console.log(`📨 تم إرسال دعوة لـ ${member.user.tag}`);

                    // حفظ معلومات لإعادة الرولات عند العودة
                    if (memberBackup) {
                        if (!db.pendingRestores) db.pendingRestores = {};
                        db.pendingRestores[member.id] = {
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
            const executorMember = await guild.members.fetch(executor.id).catch(() => null);
            if (executorMember) {
                const memberRoles = executorMember.roles.cache.filter(r => r.id !== guild.id);
                await executorMember.roles.remove(memberRoles).catch(console.error);
                console.log(`🔨 تم إزالة جميع رتب ${executor.tag}`);
            }

            // إرسال لوق
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🚨 محاولة كيك غير مصرح!')
                .setDescription(`**المخالف:** ${executor.tag} (${executor.id})\n**الضحية:** ${member.user.tag} (${member.id})\n**الإجراء:** تم إزالة جميع رتب المخالف`)
                .setTimestamp()
                .setFooter({ text: 'نظام الحماية الاحترافي' });

            await client.sendLog(embed);

        } catch (error) {
            console.error('خطأ في حماية الكيك:', error);
        }
    }
};
