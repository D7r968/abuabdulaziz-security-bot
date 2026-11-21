'use strict';

const { AuditLogEvent } = require('discord.js');
const config = require('../config.json');
const guard = require('../guard');

module.exports = {
  name: 'roleUpdate',
  async execute(oldRole, newRole, client, db, saveDB) {
    const ir = guard.settings();
    if (ir.enabled === false) return;
    if (!config.protectionSettings.roleProtection) return;

    const guild = newRole.guild;
    if (!guild || newRole.id === guild.id || newRole.managed) return;

    const changed =
      oldRole.permissions.bitfield !== newRole.permissions.bitfield ||
      oldRole.name !== newRole.name ||
      oldRole.color !== newRole.color ||
      oldRole.hoist !== newRole.hoist ||
      oldRole.mentionable !== newRole.mentionable;
    if (!changed) return;

    await new Promise((resolve) => setTimeout(resolve, 400));

    const entry = await guard.auditExecutor(guild, AuditLogEvent.RoleUpdate, newRole.id, 20000);
    if (!entry?.executor) return;
    const executor = entry.executor;

    if (client.user && executor.id === client.user.id) return;
    const backup = guard.getBackup(guild, db);
    const saved = (backup.roles || []).find((r) => r.id === newRole.id);

    // الصلاحية: حدّث النسخة الاحتياطية بدل الإرجاع
    if (guard.isProtectedUser(executor.id, guild, db)) {
      if (saved) {
        saved.name = newRole.name;
        saved.color = newRole.color;
        saved.permissions = newRole.permissions.bitfield.toString();
        saved.hoist = newRole.hoist;
        saved.mentionable = newRole.mentionable;
        if (typeof saveDB === 'function') saveDB();
      }
      return;
    }

    // إرجاع الرول لوضعه الأصلي
    try {
      if (saved) {
        await newRole
          .setName(saved.name, 'حماية: إرجاع رول بعد تعديل غير مصرح')
          .catch(() => {});
        await newRole
          .setColor(saved.color, 'حماية: إرجاع رول بعد تعديل غير مصرح')
          .catch(() => {});
        await newRole
          .setPermissions(BigInt(saved.permissions || '0'), 'حماية: إرجاع صلاحيات رول')
          .catch(() => {});
        await newRole
          .setHoist(!!saved.hoist, 'حماية: إرجاع رول بعد تعديل غير مصرح')
          .catch(() => {});
        await newRole
          .setMentionable(!!saved.mentionable, 'حماية: إرجاع رول بعد تعديل غير مصرح')
          .catch(() => {});
      } else {
        await newRole
          .setPermissions(oldRole.permissions.bitfield, 'حماية: إرجاع صلاحيات رول')
          .catch(() => {});
        await newRole.setName(oldRole.name).catch(() => {});
      }
    } catch (err) {
      console.error('[roleUpdate] revert failed:', err.message);
    }

    const count = guard.hit(db, 'permEdit', executor.id, 60000);
    const strikes = ir.permissionEditStrikes || 1;
    let res = { kicked: false, banned: false };
    if (count >= strikes) {
      res = await guard.punish(
        executor.id,
        guild,
        `تعديل رول ${newRole.name}`,
        count >= 3 ? 'ban' : 'kick',
        db,
        saveDB
      );
      guard.clearHits(db, 'permEdit', executor.id);
    }
    if (typeof saveDB === 'function') saveDB();

    console.log(
      `⚠️ ${executor.tag} غيّر رول ${newRole.name} → أُرجع + ${res.banned ? 'BAN' : res.kicked ? 'KICK' : 'تحذير'}`
    );

    await guard.alert(
      client,
      '🚨 تعديل رول — إرجاع فوري',
      `**المخالف:** ${executor.tag} (${executor.id})\n` +
        `**الرول:** ${newRole.name}\n` +
        `**الإجراء:** إرجاع الرول + ${res.banned ? 'سحب الرتب + باي' : res.kicked ? 'سحب الرتب + كيك' : 'رصد التعديل'}`,
      '#FF0000'
    );
  }
};
