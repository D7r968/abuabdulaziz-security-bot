const chalk = require('chalk');
const config = require('../config.json');

module.exports = {
    name: 'ready',
    once: true,
    async execute(client, db, saveDB) {
        console.log(chalk.green.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
        console.log(chalk.cyan.bold('           🛡️  بوت الحماية الاحترافي  🛡️'));
        console.log(chalk.green.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
        console.log(chalk.yellow(`┌─ اسم البوت: ${chalk.white(client.user.tag)}`));
        console.log(chalk.yellow(`├─ عدد السيرفرات: ${chalk.white(client.guilds.cache.size)}`));
        console.log(chalk.yellow(`├─ عدد الأعضاء: ${chalk.white(client.users.cache.size)}`));
        console.log(chalk.yellow(`├─ البادئة: ${chalk.white(config.prefix)}`));
        console.log(chalk.yellow(`└─ الحالة: ${chalk.green.bold('متصل ✅')}`));
        console.log(chalk.green.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
        console.log(chalk.magenta('🔰 جميع أنظمة الحماية مفعلة'));
        console.log(chalk.green.bold('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

        // تغيير اسم البوت
        if (config.botName && config.botName !== client.user.username) {
            try {
                await client.user.setUsername(config.botName);
                console.log(chalk.green(`✅ تم تغيير اسم البوت إلى: ${config.botName}`));
            } catch (error) {
                console.log(chalk.red('❌ فشل تغيير اسم البوت (ربما بسبب Rate Limit)'));
            }
        }

        // تعيين حالة البوت
        client.user.setPresence({
            activities: [{
                name: `${config.prefix}help | حماية احترافية`,
                type: 3 // WATCHING
            }],
            status: 'dnd' // do not disturb - اللون الأحمر
        });

        // إنشاء نسخة احتياطية أولية
        const guild = client.guilds.cache.get(config.guildId);
        if (guild && config.backupEnabled) {
            console.log(chalk.blue('📦 جاري إنشاء نسخة احتياطية أولية...'));
            
            db.backup.roles = guild.roles.cache.map(role => ({
                id: role.id,
                name: role.name,
                color: role.color,
                permissions: role.permissions.bitfield.toString(),
                position: role.position,
                hoist: role.hoist,
                mentionable: role.mentionable
            }));

            db.backup.channels = guild.channels.cache.map(channel => ({
                id: channel.id,
                name: channel.name,
                type: channel.type,
                position: channel.position,
                parentId: channel.parentId,
                topic: channel.topic || '',
                nsfw: channel.nsfw || false,
                permissionOverwrites: channel.permissionOverwrites ? 
                    Array.from(channel.permissionOverwrites.cache.values()).map(p => ({
                        id: p.id,
                        type: p.type,
                        allow: p.allow.bitfield.toString(),
                        deny: p.deny.bitfield.toString()
                    })) : []
            }));

            db.backup.members = guild.members.cache.map(member => ({
                id: member.id,
                username: member.user.username,
                roles: member.roles.cache.map(r => r.id),
                joinedAt: member.joinedAt
            }));

            saveDB();
            console.log(chalk.green('✅ تم إنشاء النسخة الاحتياطية بنجاح\n'));
        }
    }
};
