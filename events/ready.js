'use strict';

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const config = require('../config.json');
const guard = require('../guard');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client, db, saveDB) {
    console.log(chalk.green.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.cyan.bold('           🛡️  بوت الحماية — استجابة فورية  🛡️'));
    console.log(chalk.green.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.yellow(`├─ اسم البوت: ${chalk.white(client.user.tag)}`));
    console.log(chalk.yellow(`├─ السيرفرات: ${chalk.white(client.guilds.cache.size)}`));
    console.log(chalk.yellow(`├─ البادئة: ${chalk.white(config.prefix)}`));
    console.log(chalk.yellow(`└─ الحالة: ${chalk.green.bold('متصل ✅')}`));
    console.log(chalk.green.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

    if (config.botName && config.botName !== client.user.username) {
      try {
        await client.user.setUsername(config.botName);
        console.log(chalk.green(`✅ تم تغيير اسم البوت إلى: ${config.botName}`));
      } catch {
        console.log(chalk.red('❌ فشل تغيير اسم البوت (Rate Limit)'));
      }
    }

    client.user.setPresence({
      activities: [{ name: '/protect | حماية فورية', type: 3 }],
      status: 'dnd'
    });

    // 🔑 استرجاع الصلاحيات من الرول الدائم أولاً (يبقى بعد إعادة التشغيل)
    const guilds = guard.getTargetGuilds(client);
    try {
      const allowed = await guard.syncProtectAllowed(client, db, saveDB);
      console.log(chalk.cyan(`🔑 الصلاحيات المحفوظة: ${allowed.length} شخص\n`));
    } catch (err) {
      console.error(chalk.red('❌ فشل استرجاع الصلاحيات:'), err.message);
    }

    // 📦 نسخة احتياطية فورية للسيرفرات اللي أنت فعّلتها فقط
    const backupGuilds = guilds.filter((g) => guard.isBackupEnabled(g));
    if (backupGuilds.length && config.backupEnabled) {
      for (const guild of backupGuilds) {
        console.log(chalk.blue(`📦 جاري حفظ نسخة احتياطية من: ${guild.name}...`));
        const ok = await guard.backupNow(guild, db, saveDB);
        const snap = db.guildBackups[guild.id] || {};
        console.log(
          ok
            ? chalk.green(`✅ جاهز: ${(snap.roles || []).length} رتبة / ${(snap.channels || []).length} قناة / ${(snap.members || []).length} عضو`)
            : chalk.red('❌ فشل النسخ الاحتياطي')
        );
      }
      console.log('');
    } else {
      console.log(chalk.yellow('⚠️ ما فيه سيرفر مفعّل للحفظ — فعّله من لوحة الحماية لكل سيرفر تبي يحفظ\n'));
    }

    // ⚡ تسجيل أوامر /protect (عالمي + داخل كل سيرفر للظهور فوراً)
    try {
      const slash = [];
      for (const file of fs.readdirSync(__dirname).filter((f) => f.endsWith('.js'))) {
        const event = require(path.join(__dirname, file));
        if (Array.isArray(event.slashCommands)) slash.push(...event.slashCommands);
      }
      // أوامر الروم الصوتي
      if (client.voice) slash.push(...client.voice.commands());

      // استرجاع الروم المحفوظ
      if (client.voice) await client.voice.restore();

      if (slash.length) {
        await client.application.commands.set(slash);
        for (const [id, g] of client.guilds.cache) {
          await g.commands.set(slash).catch((err) =>
            console.error(chalk.red(`❌ فشل تسجيل /protect في ${g.name}: ${err.message}`))
          );
        }
        console.log(chalk.green(`✅ تم تسجيل ${slash.length} أمر / (protect)\n`));
      }
    } catch (err) {
      console.error(chalk.red('❌ فشل تسجيل أوامر /:'), err.message);
    }

    console.log(chalk.magenta('🔰 حذف رومين = باي | سبام = تايم أوت | أي حذف = إرجاع فوري'));
    console.log(chalk.green.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  }
};
