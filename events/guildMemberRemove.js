'use strict';

const { AuditLogEvent } = require('discord.js');
const config = require('../config.json');
const guard = require('../guard');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member, client, db, saveDB) {
    const ir = guard.settings();
    if (ir.enabled === false) return;
    if (!config.protectionSettings.kickProtection) return;

    const guild = member.guild;
    if (!guild) return;
    if (client.user && member.id === client.user.id) return;

    await new Promise((resolve) => setTimeout(resolve, 400));

    const entry = await guard.auditExecutor(guild, AuditLogEvent.MemberKick, member.id, 20000);
    if (!entry?.executor) return;
    const executor = entry.executor;

    if (client.user && executor.id === client.user.id) return;
    if (guard.isProtectedUser(executor.id, guild, db)) return;

    const windowMs = ir.massKickWindowMs || 60000;
    const count = guard.hit(db, 'massKick', executor.id, windowMs);
    const threshold = ir.massKickThreshold || 3;
    const mode = count >= threshold ? 'ban' : 'kick';

    // حفظ رولات المكيوك + دعوة يرجع فيها
    const backup = guard.getBackup(guild, db);
    const memberBackup = (backup.members || []).find((m) => m.id === member.id);
    if (memberBackup) {
      if (!db.pendingRestores) db.pendingRestores = {};
      db.pendingRestores[member.id] = { roles: memberBackup.roles, timestamp: Date.now() };
    }

    try {
      const channel = guild.channels.cache.find(
        (c) => c.isTextBased() && c.permissionsFor(guild.members.me)?.has('CreateInstantInvite')
      );
      if (channel) {
        const invite = await channel.createInvite({
          maxAge: 300,
          maxUses: 1,
          unique: true,
          reason: 'استعادة عضو تم كيكه بدون صلاحيات'
        });
        await member.user
          .send(`🔄 تم كيكك من **${guild.name}** بدون صلاحيات. رابط العودة (٥ دقائق): ${invite.url}`)
          .catch(() => {});
      }
    } catch { /* تجاهل */ }

    const restored = await guard.restoreAll(guild, db, saveDB);
    const res = await guard.punish(
      executor.id,
      guild,
      `${count} عملية كيك خلال ${windowMs / 1000} ثانية`,
      mode,
      db,
      saveDB
    );
    guard.clearHits(db, 'massKick', executor.id);
    if (typeof saveDB === 'function') saveDB();

    console.log(
      `⚠️ ${executor.tag} كيك ${member.user.tag} → ${res.banned ? 'BAN' : res.kicked ? 'KICK' : 'لا إجراء'} للمخالف`
    );

    await guard.alert(
      client,
      '🚨 كيك غير مصرح — إجراء فوري',
      `**المخالف:** ${executor.tag} (${executor.id})\n` +
        `**الضحية:** ${member.user.tag} (${member.id})\n` +
        `**التكرار:** ${count} خلال ${windowMs / 1000} ثانية\n` +
        `**الإجراء:** ${res.banned ? 'سحب الرتب + باي' : res.kicked ? 'سحب الرتب + كيك' : 'تعذر العقاب'}\n` +
        `**تم الإرجاع:** ${restored.channels.length} قناة، ${restored.roles.length} رتبة`,
      '#FF0000'
    );
  }
};
