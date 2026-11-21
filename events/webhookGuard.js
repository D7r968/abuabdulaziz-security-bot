'use strict';

const { AuditLogEvent } = require('discord.js');
const config = require('../config.json');
const guard = require('../guard');

module.exports = {
  name: 'webhooksUpdate',

  async execute(...args) {
    const ir = guard.settings();
    if (ir.enabled === false) return;
    if (!config.protectionSettings.webhookProtection) return;

    const client = args[args.length - 3];
    const db = args[args.length - 2];
    const saveDB = args[args.length - 1];
    const eventArgs = args.slice(0, -3);

    const guild =
      eventArgs.find((a) => a && typeof a.fetchAuditLogs === 'function') ||
      eventArgs[0]?.guild ||
      client?.guilds?.cache?.first();
    if (!guild) return;

    await new Promise((resolve) => setTimeout(resolve, 400));

    // أي تغيير ويب هوك (إنشاء/تعديل/حذف) يُعتبر تخريب
    const types = [
      AuditLogEvent.WebhookCreate,
      AuditLogEvent.WebhookUpdate,
      AuditLogEvent.WebhookDelete
    ].filter(Boolean);

    let entry = null;
    for (const type of types) {
      const e = await guard.auditExecutor(guild, type, null, 15000);
      if (e && (!entry || e.createdTimestamp > entry.createdTimestamp)) entry = e;
    }
    if (!entry?.executor) return;

    const executor = entry.executor;
    if (client.user && executor.id === client.user.id) return;
    if (guard.isProtectedUser(executor.id, guild, db)) return;

    const count = guard.hit(db, 'webhook', executor.id, 60000);
    const strikes = ir.webhookStrikes || 1;
    let res = { kicked: false, banned: false };
    if (count >= strikes) {
      res = await guard.punish(
        executor.id,
        guild,
        'تلاعب بويب هوك',
        count >= 3 ? 'ban' : 'kick',
        db,
        saveDB
      );
      guard.clearHits(db, 'webhook', executor.id);
    }

    const restored = await guard.restoreAll(guild, db, saveDB);
    if (typeof saveDB === 'function') saveDB();

    console.log(
      `⚠️ ${executor.tag} غيّر ويب هوك → ${res.banned ? 'BAN' : res.kicked ? 'KICK' : 'رصد'} | أُرجع ${restored.channels.length} قناة / ${restored.roles.length} رتبة`
    );

    await guard.alert(
      client,
      '🚨 تلاعب بويب هوك — إجراء فوري',
      `**المخالف:** ${executor.tag} (${executor.id})\n` +
        `**الإجراء:** ${res.banned ? 'سحب الرتب + باي' : res.kicked ? 'سحب الرتب + كيك' : 'رصد التعديل'}\n` +
        `**تم الإرجاع:** ${restored.channels.length} قناة، ${restored.roles.length} رتبة`,
      '#FF0000'
    );
  }
};
