'use strict';

const { AuditLogEvent } = require('discord.js');
const config = require('../config.json');
const guard = require('../guard');

module.exports = {
  name: 'roleDelete',
  async execute(role, client, db, saveDB) {
    const ir = guard.settings();
    if (ir.enabled === false) return;
    if (!config.protectionSettings.roleProtection) return;

    const guild = role.guild;
    if (!guild || role.id === guild.id || role.managed) return;

    // الأعضاء اللي كان معهم الرول قبل الحذف
    const membersWithRole = [];
    for (const member of guild.members.cache.values()) {
      if (member.roles.cache.has(role.id)) membersWithRole.push(member.id);
    }

    await new Promise((resolve) => setTimeout(resolve, 400));

    let executor = null;
    try {
      const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 10 });
      const entry =
        logs.entries.find((e) => e.target?.id === role.id && Date.now() - e.createdTimestamp < 20000) ||
        logs.entries.first();
      executor = entry?.executor || null;
    } catch (err) {
      console.error('[roleDelete] audit:', err.message);
    }
    if (!executor) return;

    if (client.user && executor.id === client.user.id) return;

    const protectedUser = guard.isProtectedUser(executor.id, guild, db);
    const count = guard.hit(db, 'roleDelete', executor.id, ir.deleteWindowMs || 60000);
    const threshold = ir.deleteThreshold || 2;
    const mode = count >= threshold ? 'ban' : 'kick';

    const restored = await guard.restoreAll(guild, db, saveDB);

    if (protectedUser) {
      console.log(`✅ ${executor.tag} (مخول) حذف رتبة ${role.name} — تم الإرجاع بدون عقاب`);
      return;
    }

    const res = await guard.punish(
      executor.id,
      guild,
      `حذف رتبة ${role.name} (كانت عند ${membersWithRole.length} عضو)`,
      mode,
      db,
      saveDB
    );
    guard.clearHits(db, 'roleDelete', executor.id);
    if (typeof saveDB === 'function') saveDB();

    console.log(
      `⚠️ ${executor.tag} حذف رتبة ${role.name} → ${res.banned ? 'BAN' : res.kicked ? 'KICK' : 'لا إجراء'} | أُرجع ${restored.roles.length} رتبة / ${restored.channels.length} قناة`
    );

    await guard.alert(
      client,
      '🚨 حذف رتبة — استجابة فورية',
      `**المخالف:** ${executor.tag} (${executor.id})\n` +
        `**الرتبة:** ${role.name}\n` +
        `**الأعضاء المتأثرون:** ${membersWithRole.length}\n` +
        `**الإجراء:** ${res.banned ? 'سحب الرتب + باي' : res.kicked ? 'سحب الرتب + كيك' : 'تعذر تنفيذ العقاب — تأكد من صلاحيات البوت'}\n` +
        `**تم الإرجاع:** ${restored.roles.length} رتبة، ${restored.channels.length} قناة`,
      '#FF0000'
    );
  }
};
