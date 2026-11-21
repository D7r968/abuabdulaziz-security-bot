const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config.json');
const fs = require('fs');

module.exports = {
    name: 'protection',
    aliases: ['حماية'],
    description: 'إدارة أنظمة الحماية',
    permissions: PermissionFlagsBits.Administrator,
    async execute(message, args, client, db, saveDB) {
        const subCommand = args[0]?.toLowerCase();

        // عرض الحالة
        if (!subCommand || subCommand === 'status' || subCommand === 'حالة') {
            const protections = config.protectionSettings;
            
            const embed = new EmbedBuilder()
                .setColor('#00BFFF')
                .setTitle('🛡️ حالة أنظمة الحماية')
                .addFields(
                    { 
                        name: '🎭 حماية الرولات', 
                        value: protections.roleProtection ? '✅ مفعل' : '❌ معطل', 
                        inline: true 
                    },
                    { 
                        name: '📁 حماية القنوات', 
                        value: protections.channelProtection ? '✅ مفعل' : '❌ معطل', 
                        inline: true 
                    },
                    { 
                        name: '👥 حماية الأعضاء', 
                        value: protections.memberProtection ? '✅ مفعل' : '❌ معطل', 
                        inline: true 
                    },
                    { 
                        name: '💬 حماية الرسائل', 
                        value: protections.messageProtection ? '✅ مفعل' : '❌ معطل', 
                        inline: true 
                    },
                    { 
                        name: '😀 حماية الإيموجي', 
                        value: protections.emojiProtection ? '✅ مفعل' : '❌ معطل', 
                        inline: true 
                    },
                    { 
                        name: '🔗 حماية الويب هوك', 
                        value: protections.webhookProtection ? '✅ مفعل' : '❌ معطل', 
                        inline: true 
                    },
                    { 
                        name: '🔨 حماية من البان', 
                        value: protections.banProtection ? '✅ مفعل' : '❌ معطل', 
                        inline: true 
                    },
                    { 
                        name: '👢 حماية من الكيك', 
                        value: protections.kickProtection ? '✅ مفعل' : '❌ معطل', 
                        inline: true 
                    },
                    { 
                        name: '🚨 حماية من الرايد', 
                        value: config.antiRaid.enabled ? '✅ مفعل' : '❌ معطل', 
                        inline: true 
                    }
                )
                .setTimestamp()
                .setFooter({ text: 'استخدم !protection <on/off> للتحكم' });

            return message.reply({ embeds: [embed] });
        }

        // تفعيل/تعطيل الحماية
        if (subCommand === 'on' || subCommand === 'off' || subCommand === 'تفعيل' || subCommand === 'تعطيل') {
            const enable = subCommand === 'on' || subCommand === 'تفعيل';
            
            // تحديث جميع أنظمة الحماية
            config.protectionSettings.roleProtection = enable;
            config.protectionSettings.channelProtection = enable;
            config.protectionSettings.memberProtection = enable;
            config.protectionSettings.messageProtection = enable;
            config.protectionSettings.emojiProtection = enable;
            config.protectionSettings.webhookProtection = enable;
            config.protectionSettings.banProtection = enable;
            config.protectionSettings.kickProtection = enable;

            // حفظ في ملف config
            fs.writeFileSync('./config.json', JSON.stringify(config, null, 2));

            const embed = new EmbedBuilder()
                .setColor(enable ? '#00FF00' : '#FF0000')
                .setTitle(`${enable ? '✅' : '❌'} تم ${enable ? 'تفعيل' : 'تعطيل'} جميع أنظمة الحماية`)
                .setDescription(`جميع أنظمة الحماية الآن ${enable ? '**مفعلة**' : '**معطلة**'}`)
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }

        return message.reply('❌ استخدام خاطئ! استخدم: `protection <on/off/status>`');
    }
};
