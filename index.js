const { Client, GatewayIntentBits, Partials, Collection, EmbedBuilder, PermissionFlagsBits, AuditLogEvent } = require('discord.js');
const fs = require('fs');
const http = require('http');
const config = require('./config.json');
const guard = require('./guard');
const chalk = require('chalk');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildWebhooks,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

client.commands = new Collection();
client.cooldowns = new Collection();

// تحميل قاعدة البيانات
let db = {
    backup: {
        roles: [],
        channels: [],
        members: [],
        settings: {}
    },
    whitelist: config.whitelist || [],
    protectAllowed: [],
    permanentRoles: config.permanentRoles || [],
    trustedUsers: {},
    antiRaid: {
        joins: []
    }
};

// حفظ قاعدة البيانات
function saveDB() {
    fs.writeFileSync('./database.json', JSON.stringify(db, null, 2));
}

// تحميل قاعدة البيانات
if (fs.existsSync('./database.json')) {
    db = JSON.parse(fs.readFileSync('./database.json', 'utf8'));
}

// تنظيف لمرة واحدة: النسخة العامة القديمة كانت تسبب نسخ سيرفر قديم لسيرفر ثاني
let dbCleaned = false;
if (!db.guildBackups || typeof db.guildBackups !== 'object') {
    db.guildBackups = {};
    dbCleaned = true;
}
for (const [gid, snap] of Object.entries(db.guildBackups)) {
    if (!snap || typeof snap !== 'object' || String(snap.guildId || gid) !== String(gid)) {
        delete db.guildBackups[gid];
        dbCleaned = true;
        continue;
    }
    if (!snap.guildId) { snap.guildId = String(gid); dbCleaned = true; }
}
if (!db.backup || typeof db.backup !== 'object' || db.backup.guildId) {
    db.backup = { roles: [], channels: [], members: [], settings: {}, guildId: '' };
    dbCleaned = true;
}
if (dbCleaned) {
    try { saveDB(); console.log('[db] تم تنظيف النسخ القديمة وتثبيت كل نسخة بسيرفرها'); }
    catch (err) { console.error('[db] تنظيف النسخ:', err.message); }
}

// تحميل الأوامر
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const command = require(`./commands/${file}`);
    client.commands.set(command.name, command);
}

// تحميل الأحداث
const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
    const event = require(`./events/${file}`);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client, db, saveDB));
    } else {
        client.on(event.name, (...args) => event.execute(...args, client, db, saveDB));
    }
}

// معالجة الأوامر
client.on('messageCreate', async message => {
    if (!message.content.startsWith(config.prefix) || message.author.bot) return;

    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = client.commands.get(commandName) || 
                   client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

    if (!command) return;

    // التحقق من الصلاحيات
    if (command.ownerOnly && message.author.id !== config.ownerId) {
        return message.reply('❌ هذا الأمر متاح فقط لمالك البوت!');
    }

    if (command.permissions && !message.member.permissions.has(command.permissions)) {
        return message.reply('❌ ليس لديك الصلاحيات الكافية لاستخدام هذا الأمر!');
    }

    // نظام الكولداون
    if (!client.cooldowns.has(command.name)) {
        client.cooldowns.set(command.name, new Collection());
    }

    const now = Date.now();
    const timestamps = client.cooldowns.get(command.name);
    const cooldownAmount = (command.cooldown || 3) * 1000;

    if (timestamps.has(message.author.id)) {
        const expirationTime = timestamps.get(message.author.id) + cooldownAmount;

        if (now < expirationTime) {
            const timeLeft = (expirationTime - now) / 1000;
            return message.reply(`⏱️ الرجاء الانتظار ${timeLeft.toFixed(1)} ثانية قبل استخدام الأمر مرة أخرى.`);
        }
    }

    timestamps.set(message.author.id, now);
    setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);

    // تنفيذ الأمر
    try {
        await command.execute(message, args, client, db, saveDB);
    } catch (error) {
        console.error(error);
        message.reply('❌ حدث خطأ أثناء تنفيذ الأمر!');
    }
});

// دالة إرسال اللوقات
client.sendLog = async (embed) => {
    try {
        const logChannel = client.channels.cache.get(config.logChannelId);
        if (logChannel) {
            await logChannel.send({ embeds: [embed] });
        }
    } catch (error) {
        console.error('خطأ في إرسال اللوق:', error);
    }
};

// دالة التحقق من الوايت لست / الصلاحيات
client.isWhitelisted = (userId, guild) => {
    return guard.isProtectedUser(userId, guild || guard.getTargetGuild(client), db);
};

// دالة حفظ نسخة احتياطية تلقائية (تشتغل حتى لو guildId فاضي)
function autoBackup() {
    if (!config.backupEnabled) return;

    const run = async () => {
        const guilds = guard.getTargetGuilds(client).filter((g) => guard.isBackupEnabled(g));
        if (!guilds.length) return;
        let okCount = 0;
        let totalRoles = 0;
        let totalChannels = 0;

        for (const guild of guilds) {
            const ok = await guard.backupNow(guild, db, saveDB);
            if (ok) {
                okCount++;
                const snap = db.guildBackups[guild.id] || {};
                totalRoles += (snap.roles || []).length;
                totalChannels += (snap.channels || []).length;
            }
        }
        console.log(
            okCount
                ? chalk.green(`[نسخ احتياطي] ${okCount} سيرفر ✅ ${totalRoles} رتبة / ${totalChannels} قناة`)
                : chalk.red('[نسخ احتياطي] فشل الحفظ ❌')
        );
    };

    // النسخة الفورية تتم في ready.js بعد اكتمال تحميل السيرفرات
    setInterval(run, config.autoBackupInterval);
}


// ─────────────────────────────────────────────
// سيرفر HTTP: فحص صحة + تحكم بالسيرفر من الموقع
// ─────────────────────────────────────────────
let loginState = 'starting';
let loginError = '';

const CONTROL_TOKEN = String(process.env.DASHBOARD_LOG_TOKEN || 'change-me');

function jsonResponse(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 200000) req.destroy();
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
  });
}

function authorized(req) {
  return String(req.headers['x-control-token'] || '') === CONTROL_TOKEN;
}

async function guildsForUser(userId) {
  const guilds = [];
  for (const guild of client.guilds.cache.values()) {
    let isAdmin = guild.ownerId === userId;
    if (!isAdmin && userId) {
      const member = await guild.members.fetch(userId).catch(() => null);
      isAdmin = !!member && member.permissions.has(PermissionFlagsBits.Administrator);
    }
    if (!isAdmin) continue;
    guilds.push({
      id: guild.id,
      name: guild.name,
      icon: guild.iconURL({ size: 128 }) || null,
      owner: guild.ownerId === userId,
      botPresent: true,
      memberCount: guild.memberCount
    });
  }
  return guilds;
}

if (process.env.PORT) {
  const port = Number(process.env.PORT) || 3000;
  http
    .createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '/', 'http://localhost');
        const path = url.pathname.replace(/\/+$/, '') || '/';

        if (path === '/') {
          return jsonResponse(res, 200, {
            status: 'ok',
            bot: client.user?.tag || 'starting',
            login: loginState,
            loginError,
            uptimeSeconds: Math.floor(process.uptime()),
            guilds: client.guilds.cache.size
          });
        }

        if (!authorized(req)) return jsonResponse(res, 401, { ok: false, error: 'unauthorized' });

        if (path === '/control/guilds') {
          const userId = String(url.searchParams.get('userId') || '').replace(/\D/g, '');
          if (!/^\d{15,25}$/.test(userId)) return jsonResponse(res, 400, { ok: false, guilds: [] });
          return jsonResponse(res, 200, { ok: true, guilds: await guildsForUser(userId) });
        }

        const guildId = String(url.searchParams.get('guild') || '').replace(/\D/g, '');
        if (!/^\d{15,25}$/.test(guildId)) {
          return jsonResponse(res, 400, { ok: false, error: 'invalid guild id' });
        }
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return jsonResponse(res, 404, { ok: false, error: 'bot is not in this server' });

        if (path === '/control/backup' && req.method === 'POST') {
          await readJsonBody(req);
          const saved = await guard.backupNow(guild, db, saveDB);
          const snap = (db.guildBackups && db.guildBackups[guildId]) || {};
          return jsonResponse(res, saved ? 200 : 500, {
            ok: !!saved,
            server: guild.name,
            roles: (snap.roles || []).length,
            channels: (snap.channels || []).length,
            members: (snap.members || []).length,
            emojis: (snap.emojis || []).length,
            ...(guard.backupError() ? { error: guard.backupError() } : {})
          });
        }

        if (path === '/control/restore' && req.method === 'POST') {
          await readJsonBody(req);
          const restored = await guard.restoreAll(guild, db, saveDB);
          return jsonResponse(res, 200, {
            ok: true,
            server: guild.name,
            roles: (restored.roles || []).length,
            channels: (restored.channels || []).length,
            emojis: (restored.emojis || []).length,
            detail: restored
          });
        }

        return jsonResponse(res, 404, { ok: false, error: 'not found' });
      } catch (err) {
        console.error('[http]', err.message);
        return jsonResponse(res, 500, { ok: false, error: err.message });
      }
    })
    .listen(port, '0.0.0.0', () => console.log('[i] منفذ الفحص والتحكم شغال على ' + port));
}

// self-ping داخلي كل 5 دقائق عشان Render ما يرقد
const selfPingUrl = String(process.env.SELF_PING_URL || '').trim();
if (selfPingUrl) {
  setInterval(async () => {
    try {
      await fetch(selfPingUrl, { signal: AbortSignal.timeout(15000) });
    } catch (err) {
      console.error('[!] فشل الـ self ping:', err.message);
    }
  }, 5 * 60 * 1000).unref();
  console.log('[i] self ping مفعّل كل 5 دقائق: ' + selfPingUrl);
}

// مزامنة إعدادات لوحة التحكم — التعديلات من الموقع تتنفّذ بدون إعادة نشر
const dashboardSync = require('./dashboard-sync');
dashboardSync.start(
  'security',
  config,
  ['ownerId', 'guildId', 'logChannelId', 'instantResponse', 'protectionSettings', 'backupEnabled', 'autoBackupInterval', 'guildBackupPrefs'],
  (remote) => {
    if (Array.isArray(remote.protectAllowed)) {
      db.protectAllowed = remote.protectAllowed.slice();
      if (typeof saveDB === 'function') saveDB();
      console.log('[dashboard] 🔑 الصلاحيات المسموح بها: ' + db.protectAllowed.length);
    }
    // أي سيرفر ما فعّل الحفظ → نمسح نسخته القديمة حتى ما يرجع شي من سيرفر ثاني
    const prefs = remote.guildBackupPrefs || {};
    let removed = 0;
    for (const gid of Object.keys(db.guildBackups || {})) {
      if (prefs[gid] !== true) { delete db.guildBackups[gid]; removed++; }
    }
    if (removed && typeof saveDB === 'function') {
      saveDB();
      console.log('[dashboard] 🗑️ حذف ' + removed + ' نسخة لسيرفرات غير مفعّلة للحفظ');
    }
  }
);

process.on('SIGTERM', () => {
  console.log('[i] SIGTERM — إغلاق آمن...');
  client.destroy();
  process.exit(0);
});

// تسجيل الدخول
const botToken = String(process.env.DISCORD_TOKEN || config.token || '').trim();
if (!botToken || botToken.includes('ضع_')) {
  console.error('[!] ما فيه توكن — حط DISCORD_TOKEN في المتغيرات');
  process.exit(1);
}

client.login(botToken)
  .then(() => {
    loginState = 'logged_in';
    autoBackup();
  })
  .catch(error => {
    loginState = 'failed';
    loginError = String(error?.message || error);
    console.error(chalk.red('خطأ في تسجيل الدخول:'), error);
    process.exit(1);
  });

// معالجة الأخطاء
process.on('unhandledRejection', error => {
    console.error(chalk.red('خطأ غير معالج:'), error);
});

process.on('uncaughtException', error => {
    console.error(chalk.red('استثناء غير معالج:'), error);
});

module.exports = client;
