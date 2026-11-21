const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config.json');

module.exports = {
    name: 'backup',
    aliases: ['نسخة', 'احتياطي'],
    description: 'إدارة النسخ الاحتياطية',
    permissions: PermissionFlagsBits.Administrator,
    async execute(message, args, client, db, saveDB) {
        const subCommand = args[0]?.toLowerCase();

        if (!subCommand || !['create', 'restore', 'info', 'انشاء', 'استعادة', 'معلومات'].includes(subCommand)) {
            return message.reply('❌ استخدام خاطئ! استخدم: `backup <create/restore/info>`');
        }

        const guild = message.guild;

        // إنشاء نسخة احتياطية
        if (subCommand === 'create' || subCommand === 'انشاء') {
            const msg = await message.reply('⏳ جاري إنشاء النسخة الاحتياطية...');

            try {
                db.backup.guildId = guild.id;
                // حفظ الرولات
                db.backup.roles = guild.roles.cache.map(role => ({
                    id: role.id,
                    name: role.name,
                    color: role.color,
                    permissions: role.permissions.bitfield.toString(),
                    position: role.position,
                    hoist: role.hoist,
                    mentionable: role.mentionable
                }));

                // حفظ القنوات
                db.backup.channels = guild.channels.cache.map(channel => ({
                    id: channel.id,
                    name: channel.name,
                    type: channel.type,
                    position: channel.position,
                    parentId: channel.parentId,
                    topic: channel.topic,
                    nsfw: channel.nsfw,
                    rateLimitPerUser: channel.rateLimitPerUser,
                    bitrate: channel.bitrate,
                    userLimit: channel.userLimit,
                    permissionOverwrites: channel.permissionOverwrites?.cache.map(po => ({
                        id: po.id,
                        type: po.type,
                        allow: po.allow.bitfield.toString(),
                        deny: po.deny.bitfield.toString()
                    }))
                }));

                // حفظ الأعضاء
                const members = await guild.members.fetch();
                db.backup.members = members.map(member => ({
                    id: member.id,
                    username: member.user.username,
                    discriminator: member.user.discriminator,
                    roles: member.roles.cache.map(r => r.id),
                    joinedAt: member.joinedTimestamp
                }));

                // حفظ الإعدادات
                db.backup.settings = {
                    name: guild.name,
                    icon: guild.iconURL(),
                    banner: guild.bannerURL(),
                    verificationLevel: guild.verificationLevel,
                    defaultMessageNotifications: guild.defaultMessageNotifications,
                    explicitContentFilter: guild.explicitContentFilter,
                    createdAt: Date.now()
                };

                saveDB();

                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ تم إنشاء النسخة الاحتياطية بنجاح!')
                    .addFields(
                        { name: '📊 عدد الرولات', value: `${db.backup.roles.length}`, inline: true },
                        { name: '📁 عدد القنوات', value: `${db.backup.channels.length}`, inline: true },
                        { name: '👥 عدد الأعضاء', value: `${db.backup.members.length}`, inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'يمكنك استعادة هذه النسخة في أي وقت' });

                await msg.edit({ content: null, embeds: [embed] });

            } catch (error) {
                console.error('خطأ في إنشاء النسخة:', error);
                await msg.edit('❌ حدث خطأ أثناء إنشاء النسخة الاحتياطية!');
            }
            return;
        }

        // معلومات النسخة الاحتياطية
        if (subCommand === 'info' || subCommand === 'معلومات') {
            if (!db.backup.settings || String(db.backup.guildId || '') !== String(guild.id)) {
                return message.reply('❌ لا توجد نسخة احتياطية لهذا السيرفر تحديداً.');
            }

            const createdDate = new Date(db.backup.settings.createdAt);
            
            const embed = new EmbedBuilder()
                .setColor('#00BFFF')
                .setTitle('📦 معلومات النسخة الاحتياطية')
                .addFields(
                    { name: '📊 عدد الرولات', value: `${db.backup.roles.length}`, inline: true },
                    { name: '📁 عدد القنوات', value: `${db.backup.channels.length}`, inline: true },
                    { name: '👥 عدد الأعضاء', value: `${db.backup.members.length}`, inline: true },
                    { name: '📅 تاريخ الإنشاء', value: `<t:${Math.floor(createdDate.getTime() / 1000)}:F>`, inline: false }
                )
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }

        // استعادة النسخة الاحتياطية
        if (subCommand === 'restore' || subCommand === 'استعادة') {
            if (!db.backup.settings || String(db.backup.guildId || '') !== String(guild.id)) {
                return message.reply('❌ لا توجد نسخة احتياطية لهذا السيرفر تحديداً — ما أقدر أستعيد نسخة سيرفر ثاني.');
            }

            const confirmMsg = await message.reply('⚠️ **تحذير:** هذه العملية ستقوم بـ:\n• حذف جميع الرولات والقنوات الحالية\n• إعادة إنشائها من النسخة الاحتياطية\n• إعادة الرولات للأعضاء\n\nهل أنت متأكد؟ اكتب `تأكيد` خلال 30 ثانية.');

            const filter = m => m.author.id === message.author.id && m.content === 'تأكيد';
            const collected = await message.channel.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] }).catch(() => null);

            if (!collected) {
                return confirmMsg.edit('❌ تم إلغاء عملية الاستعادة!');
            }

            const msg = await message.reply('⏳ جاري استعادة النسخة الاحتياطية... (قد يستغرق هذا بعض الوقت)');

            try {
                // حذف الرولات الحالية (ماعدا @everyone)
                const currentRoles = guild.roles.cache.filter(r => r.id !== guild.id && r.position < guild.members.me.roles.highest.position);
                for (const role of currentRoles.values()) {
                    await role.delete().catch(console.error);
                }

                // إعادة إنشاء الرولات
                const createdRoles = new Map();
                for (const roleData of db.backup.roles.sort((a, b) => a.position - b.position)) {
                    if (roleData.id === guild.id) continue;
                    
                    const newRole = await guild.roles.create({
                        name: roleData.name,
                        color: roleData.color,
                        permissions: BigInt(roleData.permissions),
                        hoist: roleData.hoist,
                        mentionable: roleData.mentionable,
                        reason: 'استعادة من النسخة الاحتياطية'
                    }).catch(console.error);

                    if (newRole) {
                        createdRoles.set(roleData.id, newRole);
                    }
                }

                // إعادة الرولات للأعضاء
                for (const memberData of db.backup.members) {
                    const member = await guild.members.fetch(memberData.id).catch(() => null);
                    if (!member) continue;

                    const rolesToAdd = [];
                    for (const oldRoleId of memberData.roles) {
                        // البحث عن الرول الجديد باستخدام الـ mapping أو الاسم
                        let newRole = createdRoles.get(oldRoleId);
                        
                        if (!newRole) {
                            // البحث بالاسم
                            const oldRoleData = db.backup.roles.find(r => r.id === oldRoleId);
                            if (oldRoleData) {
                                newRole = guild.roles.cache.find(r => r.name === oldRoleData.name);
                            }
                        }
                        
                        if (newRole && newRole.id !== guild.id) {
                            rolesToAdd.push(newRole);
                        }
                    }

                    if (rolesToAdd.length > 0) {
                        await member.roles.set(rolesToAdd).catch(err => {
                            console.error(`خطأ في إعادة الرولات لـ ${member.user.tag}:`, err);
                        });
                        console.log(`✅ تم إعادة ${rolesToAdd.length} رول لـ ${member.user.tag}`);
                    }
                }

                // تحديث IDs في النسخة الاحتياطية
                for (let i = 0; i < db.backup.roles.length; i++) {
                    const oldId = db.backup.roles[i].id;
                    const newRole = createdRoles.get(oldId);
                    if (newRole) {
                        db.backup.roles[i].id = newRole.id;
                    }
                }
                
                // تحديث رولات الأعضاء في النسخة الاحتياطية
                for (let i = 0; i < db.backup.members.length; i++) {
                    const newRoles = [];
                    for (const oldRoleId of db.backup.members[i].roles) {
                        const newRole = createdRoles.get(oldRoleId);
                        if (newRole) {
                            newRoles.push(newRole.id);
                        } else {
                            newRoles.push(oldRoleId);
                        }
                    }
                    db.backup.members[i].roles = newRoles;
                }
                
                saveDB();

                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ تمت استعادة النسخة الاحتياطية بنجاح!')
                    .setDescription('تم استعادة جميع الرولات والأعضاء من النسخة الاحتياطية')
                    .setTimestamp();

                await msg.edit({ content: null, embeds: [embed] });

            } catch (error) {
                console.error('خطأ في استعادة النسخة:', error);
                await msg.edit('❌ حدث خطأ أثناء استعادة النسخة الاحتياطية!');
            }
        }
    }
};
