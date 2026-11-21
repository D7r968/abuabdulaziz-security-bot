const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');

module.exports = {
    name: 'guildMemberAdd',
    async execute(member, client, db, saveDB) {
        // استعادة الرولات للأعضاء العائدين
        if (db.pendingRestores && db.pendingRestores[member.id]) {
            const restore = db.pendingRestores[member.id];
            
            // التحقق من أن الاستعادة ليست قديمة (خلال ساعة)
            if (Date.now() - restore.timestamp < 3600000) {
                try {
                    const rolesToAdd = restore.roles
                        .map(roleId => member.guild.roles.cache.get(roleId))
                        .filter(role => role && role.id !== member.guild.id);

                    if (rolesToAdd.length > 0) {
                        await member.roles.add(rolesToAdd);
                        console.log(`✅ تم استعادة رولات ${member.user.tag}`);

                        const embed = new (require('discord.js').EmbedBuilder)()
                            .setColor('#00FF00')
                            .setTitle('✅ تم استعادة عضو')
                            .setDescription(`**العضو:** ${member.user.tag} (${member.id})\n**تم استعادة:** ${rolesToAdd.length} رول\n**السبب:** عودة بعد كيك/بان غير مصرح`)
                            .setTimestamp();

                        await client.sendLog(embed);
                    }
                } catch (error) {
                    console.error('خطأ في استعادة الرولات:', error);
                }
            }

            // حذف معلومات الاستعادة
            delete db.pendingRestores[member.id];
            saveDB();
        }

        if (!config.antiRaid.enabled) return;

        const now = Date.now();
        
        // إضافة العضو لقائمة الانضمامات
        db.antiRaid.joins.push({
            userId: member.id,
            timestamp: now
        });

        // إزالة الانضمامات القديمة (أكثر من دقيقة)
        db.antiRaid.joins = db.antiRaid.joins.filter(j => now - j.timestamp < 60000);

        // التحقق من عدد الانضمامات في الدقيقة الواحدة
        if (db.antiRaid.joins.length > config.antiRaid.maxJoinsPerMinute) {
            console.log(`🚨 كشف رايد محتمل! ${db.antiRaid.joins.length} انضمام في دقيقة واحدة`);

            try {
                // كيك/بان الأعضاء الجدد
                if (config.antiRaid.punishmentType === 'ban') {
                    await member.ban({ reason: 'حماية من الرايد - انضمامات مشبوهة' });
                } else {
                    await member.kick('حماية من الرايد - انضمامات مشبوهة');
                }

                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('🚨 تم كشف رايد محتمل!')
                    .setDescription(`**العضو:** ${member.user.tag} (${member.id})\n**عدد الانضمامات:** ${db.antiRaid.joins.length} في دقيقة واحدة\n**الإجراء:** تم ${config.antiRaid.punishmentType === 'ban' ? 'بان' : 'كيك'} العضو`)
                    .setTimestamp()
                    .setFooter({ text: 'نظام الحماية من الرايد' });

                await client.sendLog(embed);

            } catch (error) {
                console.error('خطأ في نظام الحماية من الرايد:', error);
            }
        } else {
            // فحص عمر الحساب
            const accountAge = now - member.user.createdTimestamp;
            const dayInMs = 24 * 60 * 60 * 1000;
            
            if (accountAge < dayInMs * 7) { // حساب أقل من أسبوع
                const embed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('⚠️ حساب جديد انضم للسيرفر')
                    .setDescription(`**العضو:** ${member.user.tag} (${member.id})\n**عمر الحساب:** ${Math.floor(accountAge / dayInMs)} يوم\n**تنبيه:** راقب هذا العضو`)
                    .setTimestamp();

                await client.sendLog(embed);
            }
        }

        saveDB();
    }
};
