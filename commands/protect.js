'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config.json');
const guard = require('../guard');

module.exports = {
  name: 'protect',
  aliases: ['صلاحية', 'الصلاحيات'],
  description: 'إدارة صلاحيات الحماية (أو استخدم /protect)',
  permissions: PermissionFlagsBits.Administrator,
  async execute(message, args, client, db, saveDB) {
    if (!Array.isArray(db.protectAllowed)) db.protectAllowed = [];

    const sub = (args[0] || '').toLowerCase();
    const target =
      message.mentions.users.first() ||
      (args[1] && client.users.cache.get(args[1].replace(/[<@!>]/g, ''))) ||
      null;

    if (['add', 'اضافة', 'اضف'].includes(sub)) {
      if (!target) return message.reply('❌ الاستخدام: `!protect add @الشخص`');
      await guard.grantProtectRole(message.guild, target.id);
      if (!db.protectAllowed.includes(target.id)) db.protectAllowed.push(target.id);
      if (typeof saveDB === 'function') saveDB();
      return message.reply(`✅ ${target.tag} صار معه صلاحية حماية.`);
    }

    if (['remove', 'حذف', 'شيل'].includes(sub)) {
      if (!target) return message.reply('❌ الاستخدام: `!protect remove @الشخص`');
      await guard.revokeProtectRole(message.guild, target.id);
      db.protectAllowed = db.protectAllowed.filter((id) => id !== target.id);
      if (typeof saveDB === 'function') saveDB();
      return message.reply(`✅ انشالت الصلاحية من ${target.tag}.`);
    }

    if (['list', 'قائمة', 'اشوف'].includes(sub)) {
      const ids = [
        ...new Set([
          ...(config.ownerId ? [config.ownerId] : []),
          message.guild.ownerId,
          ...(db.whitelist || []),
          ...db.protectAllowed
        ])
      ];
      const lines = [];
      for (const id of ids) {
        try {
          const u = await client.users.fetch(id);
          lines.push(`• ${u.tag} — \`${id}\``);
        } catch {
          lines.push(`• \`${id}\``);
        }
      }
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('#00BFFF')
            .setTitle('🛡️ اللي معهم صلاحية حماية')
            .setDescription(lines.join('\n') || 'لا يوجد')
            .setTimestamp()
        ]
      });
    }

    return message.reply(
      '❌ الاستخدام: `!protect add @شخص` | `!protect remove @شخص` | `!protect list`\nأو استخدم أوامر `/protect`.'
    );
  }
};
