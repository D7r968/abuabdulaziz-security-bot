'use strict';

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');
const config = require('../config.json');
const guard = require('../guard');

// أوامر Script اللي بتتسجل عند الدخول
const SLASH_COMMANDS = [
  new SlashCommandBuilder()
    .setName('protect')
    .setDescription('إدارة صلاحيات الحماية')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s
        .setName('add')
        .setDescription('إعطاء صلاحية لشخص')
        .addUserOption((o) => o.setName('user').setDescription('الشخص').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription('سحب الصلاحية من شخص')
        .addUserOption((o) => o.setName('user').setDescription('الشخص').setRequired(true))
    )
    .addSubcommand((s) => s.setName('list').setDescription('عرض كل اللي معهم صلاحية'))
    .toJSON()
];

module.exports = {
  name: 'interactionCreate',
  slashCommands: SLASH_COMMANDS,

  async execute(interaction, client, db, saveDB) {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== 'protect') return;

    const guild = interaction.guild;
    const caller = interaction.user.id;
    const isAdmin = !!interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator);
    if (!guard.isProtectedUser(caller, guild, db) && !isAdmin) {
      return interaction.reply({ content: '❌ ما عندك صلاحية تستخدم الأمر هذا.', ephemeral: true });
    }

    if (!Array.isArray(db.protectAllowed)) db.protectAllowed = [];
    const sub = interaction.options.getSubcommand();

    try {
      if (sub === 'add') {
        const user = interaction.options.getUser('user');
        if (user.id === client.user.id) {
          return interaction.reply({ content: '❌ ما أقدر أضيف نفسي.', ephemeral: true });
        }
        if (!db.protectAllowed.includes(user.id)) db.protectAllowed.push(user.id);
        if (typeof saveDB === 'function') saveDB();

        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#00FF00')
              .setTitle('✅ تمت إضافة الصلاحية')
              .setDescription(`**الشخص:** ${user.tag} (${user.id})\nأصبح الآن في مأمن من العقوبات التلقائية.`)
              .setTimestamp()
          ],
          ephemeral: true
        });
        return;
      }

      if (sub === 'remove') {
        const user = interaction.options.getUser('user');
        db.protectAllowed = db.protectAllowed.filter((id) => id !== user.id);
        if (typeof saveDB === 'function') saveDB();

        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#FF0000')
              .setTitle('✅ تم سحب الصلاحية')
              .setDescription(`**الشخص:** ${user.tag} (${user.id})\nأصبح خاضعاً لأنظمة الحماية.`)
              .setTimestamp()
          ],
          ephemeral: true
        });
        return;
      }

      if (sub === 'list') {
        const ids = [
          ...new Set([
            ...(config.ownerId ? [config.ownerId] : []),
            ...(guild ? [guild.ownerId] : []),
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
            lines.push(`• \`${id}\` (ما انلقى)`);
          }
        }

        await interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#00BFFF')
              .setTitle('🛡️ اللي معهم صلاحية حماية')
              .setDescription(lines.join('\n') || 'لا يوجد')
              .setTimestamp()
          ],
          ephemeral: true
        });
      }
    } catch (err) {
      console.error('[protect slash] error:', err.message);
      if (!interaction.replied) {
        await interaction.reply({ content: `❌ خطأ: ${err.message}`, ephemeral: true }).catch(() => {});
      }
    }
  }
};
