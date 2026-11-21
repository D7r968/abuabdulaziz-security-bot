'use strict';

const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const guard = require('../guard');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member, client, db, saveDB) {
    const guild = member.guild;
    const ir = guard.settings();

    // استعادة الرتب للأعضاء العائدين
    if (db.pendingRestores && db.pendingRestores[member.id]) {
      const restore = db.pendingRestores[member.id];

      if (Date.now() - restore.timestamp < 3600000) {
        try {
          const rolesToAdd = restore.roles
            .map((roleId) => guild.roles.cache.get(roleId))
            .filter((role) => role && role.id !== guild.id);

          if (rolesToAdd.length > 0) {
            await member.roles.add(rolesToAdd);
            console.log(`✅ تم استعادة رولات ${member.user.tag}`);

            const embed = new EmbedBuilder()
              .setColor('#00FF00')
              .setTitle('✅ تم استعادة عضو')
              .setDescription(`**العضو:** ${member.user.tag} (${member.id})\n**تم استعادة:** ${rolesToAdd.length} رول`)
              .setTimestamp();

            await client.sendLog(embed);
          }
        } catch (error) {
          console.error('خطأ في استعادة الرولات:', error);
        }
      }

      delete db.pendingRestores[member.id];
      if (typeof saveDB === 'function') saveDB();
    }

    // 🤖 أي بوت يدخل يُعامل كتخريب → طرد فوري + إرجاع أي شي انحذف
    if (member.user.bot && ir.enabled !== false && ir.kickBotsOnJoin !== false) {
      if (!(client.user && member.id === client.user.id) && !guard.isProtectedUser(member.id, guild, db)) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        const res = await guard.punish(
          member.id,
          guild,
          'دخول بوت جديد — يُعامل كتخريب',
          'kick',
          db,
          saveDB
        );
        const restored = await guard.restoreAll(guild, db, saveDB);
        if (typeof saveDB === 'function') saveDB();

        console.log(
          `⚠️ بوت جديد ${member.user.tag} → ${res.kicked ? 'KICK فوري' : 'ما انطر'} | أُرجع ${restored.channels.length} قناة / ${restored.roles.length} رتبة`
        );

        await guard.alert(
          client,
          '🤖 بوت جديد — طرد فوري',
          `**البوت:** ${member.user.tag} (${member.id})\n` +
            `**الإجراء:** ${res.kicked ? 'سحب الرتب + كيك فوري' : 'تعذر الطرد — تأكد من صلاحيات البوت'}\n` +
            `**تم الإرجاع:** ${restored.channels.length} قناة، ${restored.roles.length} رتبة`,
          '#FF8C00'
        );
      }
      if (typeof saveDB === 'function') saveDB();
      return;
    }

    if (!config.antiRaid.enabled) return;

    const now = Date.now();

    db.antiRaid = db.antiRaid || { joins: [] };
    db.antiRaid.joins.push({ userId: member.id, timestamp: now });
    db.antiRaid.joins = db.antiRaid.joins.filter((j) => now - j.timestamp < 60000);

    if (db.antiRaid.joins.length > config.antiRaid.maxJoinsPerMinute) {
      console.log(`🚨 كشف رايد محتمل! ${db.antiRaid.joins.length} انضمام في دقيقة واحدة`);

      try {
        if (config.antiRaid.punishmentType === 'ban') {
          await member.ban({ reason: 'حماية من الرايد - انضمامات مشبوهة' });
        } else {
          await member.kick('حماية من الرايد - انضمامات مشبوهة');
        }

        const embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('🚨 تم كشف رايد محتمل!')
          .setDescription(
            `**العضو:** ${member.user.tag} (${member.id})\n**عدد الانضمامات:** ${db.antiRaid.joins.length} في دقيقة واحدة`
          )
          .setTimestamp()
          .setFooter({ text: 'نظام الحماية من الرايد' });

        await client.sendLog(embed);
      } catch (error) {
        console.error('خطأ في نظام الحماية من الرايد:', error);
      }
    } else {
      const accountAge = now - member.user.createdTimestamp;
      const dayInMs = 24 * 60 * 60 * 1000;

      if (accountAge < dayInMs * 7) {
        const embed = new EmbedBuilder()
          .setColor('#FFA500')
          .setTitle('⚠️ حساب جديد انضم للسيرفر')
          .setDescription(`**العضو:** ${member.user.tag} (${member.id})\n**عمر الحساب:** ${Math.floor(accountAge / dayInMs)} يوم`)
          .setTimestamp();

        await client.sendLog(embed);
      }
    }

    if (typeof saveDB === 'function') saveDB();
  }
};
