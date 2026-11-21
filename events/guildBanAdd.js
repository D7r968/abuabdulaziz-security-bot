'use strict';

const { AuditLogEvent } = require('discord.js');
const config = require('../config.json');
const guard = require('../guard');

module.exports = {
  name: 'guildBanAdd',
  async execute(ban, client, db, saveDB) {
    const ir = guard.settings();
    if (ir.enabled === false) return;
    if (!config.protectionSettings.banProtection) return;

    const guild = ban.guild;
    if (!guild) return;
    if (client.user && ban.user.id === client.user.id) return;

    await new Promise((resolve) => setTimeout(resolve, 400));

    const entry = await guard.auditExecutor(guild, AuditLogEvent.MemberBanAdd, ban.user.id, 20000);
    if (!entry?.executor) return;
    const executor = entry.executor;

    if (client.user && executor.id === client.user.id) return;
    if (guard.isProtectedUser(executor.id, guild, db)) return;

    const windowMs = ir.massBanWindowMs || 60000;
    const count = guard.hit(db, 'massBan', executor.id, windowMs);
    const threshold = ir.massBanThreshold || 2;
    const mode = count >= threshold ? 'ban' : 'kick';

    // إلغاء البان عن الضحية فوراً
    await guild.bans.remove(ban.user.id, 'حماية: بان غير مصرح').catch(() => {});

    // حفظ رولات الضحية ترجع له لو رجع
    const backup = guard.getBackup(guild, db);
    const memberBackup = (backup.members || []).find((m) => m.id === ban.user.id);
    if (memberBackup) {
      if (!db.pendingRestores) db.pendingRestores = {};
      db.pendingRestores[ban.user.id] = { roles: memberBackup.roles, timestamp: Date.now() };
    }

    // دعوة للضحية يرجع فيها
    try {
      const channel = guild.channels.cache.find(
        (c) => c.isTextBased() && c.permissionsFor(guild.members.me)?.has('CreateInstantInvite')
      );
      if (channel) {
        const invite = await channel.createInvite({
          maxAge: 300,
          maxUses: 1,
          unique: true,
          reason: 'استعادة عضو تم بانه بدون صلاحيات'
        });
        const user = await client.users.fetch(ban.user.id).catch(() => null);
        if (user) {
          await user
            .send(`🔄 تم إلغاء بانك من **${guild.name}** تلقائياً.\nرابط العودة (٥ دقائق): ${invite.url}`)
            .catch(() => {});
        }
      }
    } catch { /* تجاهل */ }

    const restored = await guard.restoreAll(guild, db, saveDB);
    const res = await guard.punish(
      executor.id,
      guild,
      `${count} عملية بان خلال ${windowMs / 1000} ثانية`,
      mode,
      db,
      saveDB
    );
    guard.clearHits(db, 'massBan', executor.id);
    if (typeof saveDB === 'function') saveDB();

    console.log(
      `⚠️ ${executor.tag} بان ${ban.user.tag} → أُلغي البان + ${res.banned ? 'BAN' : res.kicked ? 'KICK' : 'لا إجراء'} للمخالف`
    );

    await guard.alert(
      client,
      '🚨 بان غير مصرح — إلغاء فوري',
      `**المخالف:** ${executor.tag} (${executor.id})\n` +
        `**الضحية:** ${ban.user.tag} (${ban.user.id})\n` +
        `**التكرار:** ${count} خلال ${windowMs / 1000} ثانية\n` +
        `**الإجراء:** إلغاء البان + ${res.banned ? 'سحب الرتب + باي' : res.kicked ? 'سحب الرتب + كيك' : 'تعذر العقاب'}\n` +
        `**تم الإرجاع:** ${restored.channels.length} قناة، ${restored.roles.length} رتبة، ${restored.emojis.length} إيموجي`,
      '#FF0000'
    );
  }
};
