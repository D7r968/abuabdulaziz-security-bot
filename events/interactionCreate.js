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
    .setName('link')
    .setDescription('ربط حساب ديسكوردك بلوحة التحكم')
    .addStringOption((o) =>
      o
        .setName('code')
        .setDescription('الكود اللي ظهر في الموقع')
        .setMinLength(4)
        .setMaxLength(16)
        .setRequired(true)
    )
    .toJSON(),
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

async function handleLink(interaction, client) {
  const isAdmin = !!interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator);
  if (!isAdmin) {
    return interaction.reply({
      content: '❌ أمر الربط للأدمن فقط في هذا السيرفر.',
      ephemeral: true
    });
  }

  const code = interaction.options.getString('code', true).trim().toUpperCase();
  const guilds = [];

  for (const guild of client.guilds.cache.values()) {
    let admin = guild.ownerId === interaction.user.id;
    if (!admin) {
      const member = await guild.members.fetch(interaction.user.id).catch(() => null);
      admin = !!member && member.permissions.has(PermissionFlagsBits.Administrator);
    }
    if (!admin) continue;
    guilds.push({
      id: guild.id,
      name: guild.name,
      icon: guild.iconURL({ size: 128 }) || null,
      owner: guild.ownerId === interaction.user.id,
      botPresent: true,
      memberCount: guild.memberCount
    });
  }

  const base = String(process.env.DASHBOARD_URL || '').trim().replace(/\/+$/, '');
  if (!base) {
    return interaction.reply({ content: '❌ الموقع غير مربوط بالبوت.', ephemeral: true });
  }

  try {
    const res = await fetch(`${base}/api/link/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-log-token': String(process.env.DASHBOARD_LOG_TOKEN || '').trim()
      },
      body: JSON.stringify({
        code,
        userId: interaction.user.id,
        username: interaction.user.globalName || interaction.user.username,
        avatar: interaction.user.displayAvatarURL({ size: 128 }),
        guilds
      }),
      signal: AbortSignal.timeout(10000)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);

    const lines = guilds.map((g) => `• **${g.name}** — \`${g.id}\``).join('\n') || 'لا يوجد';
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor('#23A55A')
          .setTitle('✅ تم ربط حسابك')
          .setDescription(
            `ارجع للموقع — صار عندك ${guilds.length} سيرفر تقدر تديره.\n\n${lines}\n\n` +
              'السيرفرات اللي البوت موجود فيها تظهر بحدود خضراء.'
          )
          .setTimestamp()
      ],
      ephemeral: true
    });
  } catch (err) {
    console.error('[link slash]', err.message);
    return interaction.reply({ content: `❌ فشل الربط: ${err.message}`, ephemeral: true });
  }
}

module.exports = {
  name: 'interactionCreate',
  slashCommands: SLASH_COMMANDS,

  async execute(interaction, client, db, saveDB) {
    if (!interaction.isChatInputCommand()) return;
    // أوامر الروم الصوتي (/join /leave /status)
    if (client.voice && await client.voice.handle(interaction)) return;
    if (interaction.commandName === 'link') return handleLink(interaction, client);
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
        await guard.grantProtectRole(guild, user.id);
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
        await guard.revokeProtectRole(guild, user.id);
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
