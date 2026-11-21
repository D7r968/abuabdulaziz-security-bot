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

    // 📦 نسخة احتياطية فورية عند التشغيل (بدون ما نستنى ساعة)
    const guild = guard.getTargetGuild(client);
    if (guild && config.backupEnabled) {
      console.log(chalk.blue(`📦 جاري حفظ نسخة احتياطية من: ${guild.name}...`));
      const ok = await guard.backupNow(guild, db, saveDB);
      console.log(
        ok
          ? chalk.green(`✅ جاهز: ${db.backup.roles.length} رتبة / ${db.backup.channels.length} قناة / ${db.backup.members.length} عضو\n`)
          : chalk.red('❌ فشل النسخ الاحتياطي\n')
      );
    } else {
      console.log(chalk.yellow('⚠️ ما فيه سيرفر متاح للنسخ الاحتياطي — تأكد من إضافة البوت للسيرفر\n'));
    }

    // ⚡ تسجيل أوامر /protect (عالمي + داخل كل سيرفر للظهور فوراً)
    try {
      const slash = [];
      for (const file of fs.readdirSync(__dirname).filter((f) => f.endsWith('.js'))) {
        const event = require(path.join(__dirname, file));
        if (Array.isArray(event.slashCommands)) slash.push(...event.slashCommands);
      }

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
