const { isAdmin } = require('./auth');
const { getAllUsers, getUser, banUser, unbanUser, getBannedUsers, getStats } = require('./userManager');
const { getServerList, getServerById } = require('../vpn/serverList');
const {
  getAdminMenuKeyboard,
  getAdminServerKeyboard,
  getAdminServerActionsKeyboard,
  getUserActionsKeyboard,
  getAdminBackKeyboard,
} = require('./adminKeyboards');
const { addCredits, getBalance, getUserCredits, getCreditSettings, updateCreditSettings, createCoupon, getAllCoupons, deleteCoupon } = require('../vpn/creditManager');
const { createBackup, listBackups, restoreBackup, deleteBackup, getBackupZipBuffer } = require('../middleware/backup');

const fs = require('fs');
const path = require('path');
const SERVERS_FILE = path.join(__dirname, '../../data/servers.json');
const BLACKLIST_FILE = path.join(__dirname, '../../data/blacklist.json');
const MAINTENANCE_FILE = path.join(__dirname, '../../data/maintenance.json');

// Maintenance mode
function getMaintenanceStatus() {
  try {
    const data = JSON.parse(fs.readFileSync(MAINTENANCE_FILE, 'utf8'));
    return data;
  } catch {
    return { enabled: false, message: '' };
  }
}

function setMaintenanceStatus(enabled, message = '') {
  fs.writeFileSync(MAINTENANCE_FILE, JSON.stringify({ enabled, message, updatedAt: new Date().toISOString() }, null, 2));
}

function isMaintenanceMode() {
  return getMaintenanceStatus().enabled;
}

// Track broadcast state per admin
const broadcastState = {};

async function handleAdminCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const userId = String(query.from.id);
  const data = query.data;

  if (!isAdmin(query.from.id)) {
    bot.answerCallbackQuery(query.id, { text: '⛔ Not authorized' });
    return false;
  }

  bot.answerCallbackQuery(query.id);

  // ─── Admin Menu ────────────────────────────────────────────
  if (data === 'admin_menu') {
    return bot.editMessageText('🔧 *Admin Panel*', {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: getAdminMenuKeyboard(),
    });
  }

  // ─── Statistics ────────────────────────────────────────────
  if (data === 'admin_stats') {
    const stats = getStats();
    const text =
      `📊 *Bot Statistics*\n\n` +
      `👥 Total Users: *${stats.totalUsers}*\n` +
      `🟢 Active Today: *${stats.activeToday}*\n` +
      `🚫 Banned: *${stats.bannedCount}*\n` +
      `🔑 Total Keys Generated: *${stats.totalKeys}*\n` +
      `⚙️ Total Configs Generated: *${stats.totalConfigs}*\n`;

    return bot.editMessageText(text, {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: getAdminBackKeyboard(),
    });
  }

  // ─── Users List ────────────────────────────────────────────
  if (data === 'admin_users' || data.startsWith('admin_users_page_')) {
    const users = getAllUsers();
    const userList = Object.values(users).sort((a, b) => new Date(b.lastActive) - new Date(a.lastActive));

    if (userList.length === 0) {
      return bot.editMessageText('👥 <b>Users</b>\n\nNo users yet.', {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: getAdminBackKeyboard(),
      });
    }

    const page = data.startsWith('admin_users_page_') ? parseInt(data.replace('admin_users_page_', '')) : 0;
    const perPage = 10;
    const start = page * perPage;
    const pageUsers = userList.slice(start, start + perPage);
    const totalPages = Math.ceil(userList.length / perPage);

    const { getTrialInfo } = require('../vpn/trialManager');
    const { getUserPremiumKeys } = require('../vpn/premiumManager');
    const { isBanned: checkBanned } = require('./userManager');
    const escHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    let text = `👥 <b>Users</b> (${userList.length}) — Page ${page + 1}/${totalPages}\n\n`;
    const buttons = [];

    for (const u of pageUsers) {
      const uname = u.username ? `@${escHtml(u.username)}` : escHtml(u.firstName);
      const banned = checkBanned(u.id) ? '🚫' : '';
      const trial = getTrialInfo(String(u.id));
      const premium = getUserPremiumKeys(String(u.id));
      const trialTag = trial && trial.count > 0 ? '🎁' : '';
      const premiumTag = premium.length > 0 ? '💎' : '';
      const lastSeen = u.lastActive ? new Date(u.lastActive).toLocaleDateString('en-GB') : 'N/A';

      text += `${banned}${trialTag}${premiumTag} ${uname} | <code>${u.id}</code> | ${lastSeen}\n`;
      buttons.push([
        { text: `${uname} - ${u.id}`, callback_data: `admin_userinfo_${u.id}` },
      ]);
    }

    const navBtns = [];
    if (page > 0) navBtns.push({ text: '« Prev', callback_data: `admin_users_page_${page - 1}` });
    if (page < totalPages - 1) navBtns.push({ text: 'Next »', callback_data: `admin_users_page_${page + 1}` });
    if (navBtns.length > 0) buttons.push(navBtns);
    buttons.push([{ text: '« Admin Menu', callback_data: 'admin_menu' }]);

    return bot.editMessageText(text, {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons },
    });
  }

  // ─── User Info ─────────────────────────────────────────────
  if (data.startsWith('admin_userinfo_')) {
    const targetId = data.replace('admin_userinfo_', '');
    const user = getUser(targetId);

    if (!user) {
      return bot.editMessageText('User not found.', {
        chat_id: chatId, message_id: messageId,
        reply_markup: getAdminBackKeyboard(),
      });
    }

    const escHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const username = user.username ? `@${escHtml(user.username)}` : 'N/A';
    const { getTrialInfo } = require('../vpn/trialManager');
    const { getUserPremiumKeys } = require('../vpn/premiumManager');
    const { getUserReferral } = require('../vpn/referralManager');
    const { isBanned: checkBanned } = require('./userManager');
    const xuiClient = require('../vpn/xuiClient');

    const trial = getTrialInfo(targetId);
    const premium = getUserPremiumKeys(targetId);
    const ref = getUserReferral(targetId);
    const banned = checkBanned(targetId);

    let text =
      `👤 <b>User Info</b>\n\n` +
      `<b>Name:</b> ${escHtml(user.firstName)} ${escHtml(user.lastName || '')}\n` +
      `<b>Username:</b> ${username}\n` +
      `<b>ID:</b> <code>${user.id}</code>\n` +
      `<b>Status:</b> ${banned ? '🚫 Banned' : '🟢 Active'}\n` +
      `<b>Joined:</b> ${new Date(user.joinedAt).toLocaleDateString('en-GB')}\n` +
      `<b>Last Active:</b> ${new Date(user.lastActive).toLocaleDateString('en-GB')}\n\n`;

    // Trial info
    text += `🎁 <b>Trial:</b> ${trial && trial.count > 0 ? `ယူပြီး (${trial.count})` : 'မယူရသေး'}\n`;
    text += `💎 <b>Premium:</b> ${premium.length} ခု\n`;
    text += `👥 <b>Referrals:</b> ${ref.invitedUsers.length} ယောက်\n\n`;

    // Live key data from X-UI
    const allKeys = [];
    if (trial && trial.keys) allKeys.push(...trial.keys.map(k => ({ ...k, type: 'Trial' })));
    allKeys.push(...premium.map(k => ({ ...k, type: 'Premium' })));

    if (allKeys.length > 0) {
      try {
        const clients = await xuiClient.getAllClients();
        text += `<b>🔑 Keys:</b>\n`;
        for (const key of allKeys) {
          const client = clients.find(c => c.email === key.email);
          if (client) {
            const usedGB = ((client.up + client.down) / 1024 / 1024 / 1024).toFixed(2);
            const totalGB = client.total > 0 ? (client.total / 1024 / 1024 / 1024).toFixed(0) : '∞';
            const expiry = client.expiryTime > 0 ? new Date(client.expiryTime).toLocaleDateString('en-GB') : '∞';
            const now = Date.now();
            const isExpired = client.expiryTime > 0 && client.expiryTime < now;
            const status = !client.enable ? '🔴' : isExpired ? '🔴' : '🟢';
            const daysLeft = client.expiryTime > 0 ? Math.max(0, Math.ceil((client.expiryTime - now) / 86400000)) : '∞';
            text += `  ${status} ${key.type} | ${usedGB}/${totalGB} GB | ${expiry} (${daysLeft}d)\n`;
            text += `  <code>${key.email}</code>\n`;
          }
        }
      } catch {}
    }

    return bot.editMessageText(text, {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: getUserActionsKeyboard(targetId),
    });
  }

  // ─── Ban / Unban (with Blacklist) ────────────────────────────
  if (data.startsWith('admin_ban_noreason_')) {
    const targetId = data.replace('admin_ban_noreason_', '');
    banUser(targetId);
    addBlacklistEntry(targetId, 'No reason provided', userId);
    delete broadcastState[`banreason_${userId}`];
    return bot.editMessageText(`🚫 User <code>${targetId}</code> has been banned.`, {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: getUserActionsKeyboard(targetId),
    });
  }

  if (data.startsWith('admin_ban_')) {
    const targetId = data.replace('admin_ban_', '');
    broadcastState[`banreason_${userId}`] = targetId;
    return bot.editMessageText(
      `🚫 <b>Ban User ${targetId}</b>\n\nBan reason ရိုက်ထည့်ပါ:`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⚡ Reason မထည့်ဘဲ Ban', callback_data: `admin_ban_noreason_${targetId}` }],
            [{ text: '« Cancel', callback_data: `admin_userinfo_${targetId}` }],
          ],
        },
      }
    );
  }

  if (data.startsWith('admin_unban_')) {
    const targetId = data.replace('admin_unban_', '');
    unbanUser(targetId);
    return bot.editMessageText(`✅ User <code>${targetId}</code> has been unbanned.`, {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: getUserActionsKeyboard(targetId),
    });
  }

  // ─── Banned Users List ─────────────────────────────────────
  if (data === 'admin_banned') {
    const banned = getBannedUsers();

    if (banned.length === 0) {
      return bot.editMessageText('🚫 <b>Banned Users</b>\n\nNo banned users.', {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: getAdminBackKeyboard(),
      });
    }

    let text = `🚫 <b>Banned Users</b> (${banned.length})\n\n`;
    const buttons = [];
    const escHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    banned.forEach((id) => {
      const user = getUser(id);
      const name = user ? (user.username ? `@${escHtml(user.username)}` : escHtml(user.firstName)) : id;
      const bl = getBlacklistEntry(id);
      const reason = bl && bl.bans.length > 0 ? bl.bans[bl.bans.length - 1].reason : 'N/A';
      text += `• ${name} (<code>${id}</code>)\n  📝 ${escHtml(reason)}\n`;
      buttons.push([
        { text: `✅ Unban ${user ? (user.username || user.firstName) : id}`, callback_data: `admin_unban_${id}` },
      ]);
    });

    buttons.push([{ text: '« Admin Menu', callback_data: 'admin_menu' }]);

    return bot.editMessageText(text, {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons },
    });
  }

  // ─── Server Management ─────────────────────────────────────
  if (data === 'admin_servers') {
    const servers = getServerList();
    return bot.editMessageText('🖥 *Manage Servers*', {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: getAdminServerKeyboard(servers),
    });
  }

  if (data.startsWith('admsrv_')) {
    const serverId = parseInt(data.replace('admsrv_', ''));
    const server = getServerById(serverId);

    if (!server) {
      return bot.editMessageText('Server not found.', {
        chat_id: chatId, message_id: messageId,
        reply_markup: getAdminBackKeyboard(),
      });
    }

    const text =
      `🖥 *Server: ${server.name}*\n\n` +
      `*Host:* \`${server.host}\`\n` +
      `*Port:* \`${server.port}\`\n` +
      `*Country:* ${server.country}\n` +
      `*Status:* ${server.status === 'online' ? '🟢 Online' : '🔴 Offline'}\n` +
      `*Protocols:* ${server.protocols.join(', ')}\n`;

    return bot.editMessageText(text, {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: getAdminServerActionsKeyboard(serverId),
    });
  }

  // ─── Set Server Status ─────────────────────────────────────
  if (data.startsWith('admsrvset_')) {
    const parts = data.replace('admsrvset_', '').split('_');
    const status = parts[0];
    const serverId = parseInt(parts[1]);

    const serversData = JSON.parse(fs.readFileSync(SERVERS_FILE, 'utf8'));
    const server = serversData.servers.find((s) => s.id === serverId);

    if (server) {
      server.status = status;
      fs.writeFileSync(SERVERS_FILE, JSON.stringify(serversData, null, 2));

      return bot.editMessageText(
        `Server *${server.name}* set to ${status === 'online' ? '🟢 Online' : '🔴 Offline'}`,
        {
          chat_id: chatId, message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: getAdminServerActionsKeyboard(serverId),
        }
      );
    }
  }

  // ─── Remove Server ─────────────────────────────────────────
  if (data.startsWith('admsrvdel_')) {
    const serverId = parseInt(data.replace('admsrvdel_', ''));
    const serversData = JSON.parse(fs.readFileSync(SERVERS_FILE, 'utf8'));
    const idx = serversData.servers.findIndex((s) => s.id === serverId);

    if (idx !== -1) {
      const removed = serversData.servers.splice(idx, 1)[0];
      fs.writeFileSync(SERVERS_FILE, JSON.stringify(serversData, null, 2));

      return bot.editMessageText(`🗑 Server *${removed.name}* removed.`, {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: getAdminBackKeyboard(),
      });
    }
  }

  // ─── Add Server Prompt ─────────────────────────────────────
  if (data === 'admin_addserver') {
    return bot.editMessageText(
      '➕ *Add Server*\n\n' +
      'Send server details in this format:\n\n' +
      '`/addserver name|host|port|country|protocols`\n\n' +
      'Example:\n' +
      '`/addserver Singapore 2|sg2.example.com|443|SG|vmess,vless,shadowsocks`',
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: getAdminBackKeyboard(),
      }
    );
  }

  // ─── Broadcast Prompt ──────────────────────────────────────
  if (data === 'admin_broadcast') {
    broadcastState[userId] = true;
    return bot.editMessageText(
      '📢 *Broadcast*\n\n' +
      'Send the message you want to broadcast to all users.\n\n' +
      'Type /cancel to cancel.',
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: getAdminBackKeyboard(),
      }
    );
  }

  // ─── Admin Orders ──────────────────────────────────────────
  if (data === 'admin_orders') {
    const { getAllPendingOrders } = require('../vpn/premiumManager');
    const pending = getAllPendingOrders();

    if (pending.length === 0) {
      return bot.editMessageText('💰 *Orders*\n\nPending order မရှိပါ။', {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: getAdminBackKeyboard(),
      });
    }

    let text = `💰 *Pending Orders (${pending.length})*\n\n`;
    const buttons = [];
    for (const o of pending) {
      text += `⏳ \`${o.orderId}\`\n` +
        `   User: \`${o.userId}\` | ${o.planName} | ${o.price} Ks\n\n`;
      buttons.push([
        { text: `✅ ${o.orderId}`, callback_data: `order_approve_${o.orderId}` },
        { text: `❌ ${o.orderId}`, callback_data: `order_reject_${o.orderId}` },
      ]);
    }
    buttons.push([{ text: '« Admin Menu', callback_data: 'admin_menu' }]);

    return bot.editMessageText(text, {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons },
    });
  }

  // ─── Trial Control ────────────────────────────────────────
  if (data === 'admin_trial_control') {
    const { getTrialConfig } = require('../vpn/trialManager');
    const xuiClient = require('../vpn/xuiClient');
    const config = getTrialConfig();

    let inboundName = `ID: ${config.inboundId}`;
    try {
      const inbound = await xuiClient.getInbound(config.inboundId);
      if (inbound) inboundName = `${inbound.remark} (ID: ${config.inboundId})`;
    } catch {}

    return bot.editMessageText(
      `🎁 *Trial Control*\n\n` +
      `*Current Settings:*\n` +
      `🌐 Inbound: *${inboundName}*\n` +
      `📦 Data: *${config.totalGB} GB*\n` +
      `📅 Expiry: *${config.expiryDays} Days*\n` +
      `📱 IP Limit: *${config.ipLimit}*\n` +
      `🔢 Max per user: *${config.maxTrials}*\n` +
      `✏️ Custom Msg: ${config.customMessage ? `"${config.customMessage}"` : '_မသတ်မှတ်ရသေး_'}\n\n` +
      `Setting ပြင်ချင်ရင် အောက်က button နှိပ်ပါ`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🌐 Inbound ပြောင်း', callback_data: 'admin_trial_set_inbound' }],
            [
              { text: '📦 Data GB ပြင်', callback_data: 'admin_trial_set_gb' },
              { text: '📅 Days ပြင်', callback_data: 'admin_trial_set_days' },
            ],
            [
              { text: '📱 IP Limit ပြင်', callback_data: 'admin_trial_set_ip' },
              { text: '🔢 Max Trials ပြင်', callback_data: 'admin_trial_set_max' },
            ],
            [{ text: '✏️ Custom Message ပြင်', callback_data: 'admin_trial_set_msg' }],
            [
              { text: '🔄 User Reset', callback_data: 'admin_trial_reset_user' },
              { text: '🔄 All Reset', callback_data: 'admin_trial_reset_all' },
            ],
            [{ text: '« Admin Menu', callback_data: 'admin_menu' }],
          ],
        },
      }
    );
  }

  // ─── Trial Inbound Selector ───────────────────────────────
  if (data === 'admin_trial_set_inbound') {
    const xuiClient = require('../vpn/xuiClient');
    try {
      const result = await xuiClient.listInbounds();
      if (!result.success || !result.obj || result.obj.length === 0) {
        return bot.editMessageText('❌ Inbound မရှိပါ။', {
          chat_id: chatId, message_id: messageId,
          reply_markup: getAdminBackKeyboard(),
        });
      }

      const buttons = result.obj.map((inb) => [
        {
          text: `${inb.remark} (${inb.protocol}, port: ${inb.port})`,
          callback_data: `admin_trial_inb_${inb.id}`,
        },
      ]);
      buttons.push([{ text: '« Back', callback_data: 'admin_trial_control' }]);

      return bot.editMessageText(
        `🌐 *Trial Inbound ပြောင်း*\n\nInbound ရွေးချယ်ပါ:`,
        {
          chat_id: chatId, message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: buttons },
        }
      );
    } catch (err) {
      return bot.editMessageText(`❌ Error: ${err.message}`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: getAdminBackKeyboard(),
      });
    }
  }

  if (data.startsWith('admin_trial_inb_')) {
    const inboundId = parseInt(data.replace('admin_trial_inb_', ''));
    const { updateTrialConfig } = require('../vpn/trialManager');
    const xuiClient = require('../vpn/xuiClient');

    let inboundName = `ID: ${inboundId}`;
    try {
      const inbound = await xuiClient.getInbound(inboundId);
      if (inbound) inboundName = inbound.remark;
    } catch {}

    updateTrialConfig({ inboundId });
    return bot.editMessageText(
      `✅ Trial Inbound *${inboundName}* (ID: ${inboundId}) သို့ ပြောင်းပြီးပါပြီ!`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎁 Trial Control', callback_data: 'admin_trial_control' }],
            [{ text: '« Admin Menu', callback_data: 'admin_menu' }],
          ],
        },
      }
    );
  }

  // ─── Trial Custom Message ──────────────────────────────────
  if (data === 'admin_trial_set_msg') {
    const { getTrialConfig } = require('../vpn/trialManager');
    const config = getTrialConfig();
    broadcastState[`custommsg_${userId}`] = true;
    return bot.editMessageText(
      `✏️ <b>Custom Message ပြင်</b>\n\n` +
      `<b>Current:</b> ${config.customMessage ? config.customMessage : '<i>မသတ်မှတ်ရသေး</i>'}\n\n` +
      `User trial key ယူတဲ့အခါ ပြမယ့် message ကို ရိုက်ထည့်ပါ:\n` +
      `(ဖျက်ချင်ရင် <code>clear</code> ရိုက်ပါ)`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '« Cancel', callback_data: 'admin_trial_control' }],
          ],
        },
      }
    );
  }

  // ─── Admin Key Delete ─────────────────────────────────────
  if (data === 'admin_key_delete') {
    broadcastState[`keydelete_${userId}`] = true;
    return bot.editMessageText(
      `🗑 <b>Key Delete</b>\n\n` +
      `ဖျက်ချင်တဲ့ client email ကို ရိုက်ထည့်ပါ:`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '« Admin Menu', callback_data: 'admin_menu' }],
          ],
        },
      }
    );
  }

  if (data.startsWith('confirm_delete_')) {
    const email = data.replace('confirm_delete_', '');
    const xuiClient = require('../vpn/xuiClient');
    const { premiumClient } = require('../vpn/xuiClient');
    const { removePremiumKeyByEmail } = require('../vpn/premiumManager');
    const { removeTrialKeyByEmail } = require('../vpn/trialManager');
    try {
      // Try both panels (trial + premium)
      let client = null;
      let targetClient = xuiClient;
      let panelName = 'Trial';
      const clients = await xuiClient.getAllClients();
      client = clients.find(c => c.email === email);

      if (!client && premiumClient) {
        try {
          const premClients = await premiumClient.getAllClients();
          client = premClients.find(c => c.email === email);
          if (client) {
            targetClient = premiumClient;
            panelName = 'Premium';
          }
        } catch (e) {
          console.error('Premium panel search error:', e.message);
        }
      }

      if (!client) {
        // Still remove from local database even if not found on panel
        const removedPrem = removePremiumKeyByEmail(email);
        const removedTrial = removeTrialKeyByEmail(email);
        if (removedPrem || removedTrial) {
          return bot.editMessageText(`✅ <code>${email}</code> ကို local database ကနေ ဖျက်ပြီးပါပြီ (panel မှာ မတွေ့ပါ)`, {
            chat_id: chatId, message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: getAdminBackKeyboard(),
          });
        }
        return bot.editMessageText(`❌ Client <code>${email}</code> not found.`, {
          chat_id: chatId, message_id: messageId,
          parse_mode: 'HTML',
          reply_markup: getAdminBackKeyboard(),
        });
      }

      // Delete from X-UI panel
      const inbound = await targetClient.getInbound(client.inboundId);
      const settings = JSON.parse(inbound.settings);
      settings.clients = settings.clients.filter(c => c.email !== email);
      const updateData = { ...inbound, settings: JSON.stringify(settings) };
      delete updateData.clientStats;
      await targetClient.request('post', `/panel/api/inbounds/update/${client.inboundId}`, updateData);

      // Also remove from local databases (user my key)
      removePremiumKeyByEmail(email);
      removeTrialKeyByEmail(email);

      return bot.editMessageText(
        `✅ <code>${email}</code> ဖျက်ပြီးပါပြီ!\n\n📋 Panel: ${panelName}\n🗑 X-UI Panel + User My Key ကနေ ဖျက်ပြီးပါပြီ`,
        {
          chat_id: chatId, message_id: messageId,
          parse_mode: 'HTML',
          reply_markup: getAdminBackKeyboard(),
        }
      );
    } catch (err) {
      console.error('Key delete error:', err.message);
      return bot.editMessageText(`❌ Error: ${err.message}`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: getAdminBackKeyboard(),
      });
    }
  }

  // ─── Delete All Expired Keys ─────────────────────────────
  if (data === 'admin_delete_expired') {
    return bot.editMessageText(
      `🧹 <b>Delete Expired Keys</b>\n\n` +
      `သက်တမ်းကုန် နဲ့ GB ပြည့်သွားတဲ့ key အားလုံးကို X-UI panel + user my key ကနေ ဖျက်ပစ်မှာ ဖြစ်ပါတယ်။\n\n` +
      `⚠️ ဆက်လုပ်မှာ သေချာပါသလား?`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ ဖျက်မယ်', callback_data: 'confirm_delete_expired' }],
            [{ text: '« Admin Menu', callback_data: 'admin_menu' }],
          ],
        },
      }
    );
  }

  if (data === 'confirm_delete_expired') {
    const xuiClient = require('../vpn/xuiClient');
    const { removePremiumKeyByEmail } = require('../vpn/premiumManager');
    const { removeTrialKeyByEmail } = require('../vpn/trialManager');

    try {
      await bot.editMessageText('⏳ Expired key တွေ ရှာနေပါတယ်...', {
        chat_id: chatId, message_id: messageId,
      });

      const result = await xuiClient.listInbounds();
      if (!result.success || !result.obj) {
        return bot.editMessageText('❌ X-UI panel ကနေ inbound list ရယူ၍ မရပါ', {
          chat_id: chatId, message_id: messageId,
          reply_markup: getAdminBackKeyboard(),
        });
      }

      const now = Date.now();
      let deleted = 0;
      const deletedList = [];

      for (const inbound of result.obj) {
        const settings = JSON.parse(inbound.settings);
        const clients = settings.clients || [];
        const clientStats = inbound.clientStats || [];

        for (const client of clients) {
          const stats = clientStats.find((s) => s.email === client.email) || {};
          const isTimeExpired = client.expiryTime > 0 && client.expiryTime < now;
          const totalUsed = (stats.up || 0) + (stats.down || 0);
          const isDataFull = client.totalGB > 0 && totalUsed >= client.totalGB;

          if (isTimeExpired || isDataFull) {
            try {
              await xuiClient.deleteClient(inbound.id, client.id);
              removePremiumKeyByEmail(client.email);
              removeTrialKeyByEmail(client.email);
              deleted++;
              const reason = isTimeExpired && isDataFull ? 'Expired + GB Full'
                : isTimeExpired ? 'Expired' : 'GB Full';
              deletedList.push(`${client.email} (${reason})`);

              if (client.tgId) {
                try {
                  await bot.sendMessage(client.tgId,
                    `🗑 သက်တမ်းကုန်/GB ပြည့်သွားတဲ့ VPN key ဖျက်ပြီးပါပြီ။\n\n` +
                    `Key: ${client.email}\n\n` +
                    `Key အသစ်လိုချင်ရင် /menu ကနေ ရယူနိုင်ပါတယ်။`
                  );
                } catch {}
              }
            } catch (err) {
              console.error(`Failed to delete ${client.email}: ${err.message}`);
            }
          }
        }
      }

      if (deleted === 0) {
        return bot.editMessageText(
          `🧹 <b>Delete Expired Keys</b>\n\n✅ Expired/GB Full key မရှိပါ။`,
          {
            chat_id: chatId, message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: getAdminBackKeyboard(),
          }
        );
      }

      const listText = deletedList.map((e) => `• ${e}`).join('\n');
      return bot.editMessageText(
        `🧹 <b>Delete Expired Keys</b>\n\n` +
        `✅ Expired/GB Full key <b>${deleted}</b> ခု ဖျက်ပြီးပါပြီ!\n\n${listText}`,
        {
          chat_id: chatId, message_id: messageId,
          parse_mode: 'HTML',
          reply_markup: getAdminBackKeyboard(),
        }
      );
    } catch (err) {
      console.error('Delete expired error:', err.message);
      return bot.editMessageText(`❌ Error: ${err.message}`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: getAdminBackKeyboard(),
      });
    }
  }

  // ─── Trial Reset: Single User (prompt for ID) ──────────────
  if (data === 'admin_trial_reset_user') {
    broadcastState[`reset_${userId}`] = true;
    return bot.editMessageText(
      `🔄 *Trial Reset (User)*\n\nReset လုပ်ချင်တဲ့ User ID ကို ရိုက်ထည့်ပါ:`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '« Back', callback_data: 'admin_trial_control' }],
          ],
        },
      }
    );
  }

  // ─── Trial Reset: All Users ────────────────────────────────
  if (data === 'admin_trial_reset_all') {
    return bot.editMessageText(
      `⚠️ *All User Trial Reset*\n\nUser အားလုံးရဲ့ trial ကို reset လုပ်မှာ သေချာပါသလား?`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Reset All', callback_data: 'admin_trial_reset_all_confirm' }],
            [{ text: '❌ Cancel', callback_data: 'admin_trial_control' }],
          ],
        },
      }
    );
  }

  if (data === 'admin_trial_reset_all_confirm') {
    const { resetTrial } = require('../vpn/trialManager');
    const trialsFile = path.join(__dirname, '../../data/trials.json');

    let resetCount = 0;
    if (fs.existsSync(trialsFile)) {
      const trialsData = JSON.parse(fs.readFileSync(trialsFile, 'utf8'));
      const userIdsToReset = Object.keys(trialsData.trials || {});
      resetCount = userIdsToReset.length;

      // Reset all
      trialsData.trials = {};
      fs.writeFileSync(trialsFile, JSON.stringify(trialsData, null, 2));

      // Notify all users
      for (const uid of userIdsToReset) {
        try {
          await bot.sendMessage(uid,
            `🎉 Trial Key ပြန်လည်ရယူနိုင်ပါပြီ!\n\nAdmin မှ trial reset လုပ်ပေးထားပါတယ်။ 🎁 Trial Key ကို ပြန်ထုတ်ယူနိုင်ပါပြီ။`
          );
        } catch {}
      }
    }

    return bot.editMessageText(
      `✅ User ${resetCount} ယောက် trial reset ပြီးပါပြီ!\nUser အားလုံးကို notify ပို့ပြီးပါပြီ။`,
      {
        chat_id: chatId, message_id: messageId,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎁 Trial Control', callback_data: 'admin_trial_control' }],
            [{ text: '« Admin Menu', callback_data: 'admin_menu' }],
          ],
        },
      }
    );
  }

  // ─── Trial Setting Options ────────────────────────────────
  if (data === 'admin_trial_set_gb') {
    return bot.editMessageText(
      `📦 *Trial Data GB ပြင်*\n\nGB ပမာဏ ရွေးချယ်ပါ:`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '5 GB', callback_data: 'admin_trial_gb_5' },
              { text: '10 GB', callback_data: 'admin_trial_gb_10' },
              { text: '20 GB', callback_data: 'admin_trial_gb_20' },
              { text: '30 GB', callback_data: 'admin_trial_gb_30' },
            ],
            [
              { text: '50 GB', callback_data: 'admin_trial_gb_50' },
              { text: '100 GB', callback_data: 'admin_trial_gb_100' },
              { text: '150 GB', callback_data: 'admin_trial_gb_150' },
            ],
            [
              { text: '200 GB', callback_data: 'admin_trial_gb_200' },
              { text: '250 GB', callback_data: 'admin_trial_gb_250' },
              { text: '500 GB', callback_data: 'admin_trial_gb_500' },
            ],
            [{ text: '✏️ ကိုယ်တိုင်ရိုက်ထည့်မယ်', callback_data: 'admin_trial_gb_custom' }],
            [{ text: '« Back', callback_data: 'admin_trial_control' }],
          ],
        },
      }
    );
  }

  if (data === 'admin_trial_gb_custom') {
    broadcastState[`trialgb_${userId}`] = true;
    return bot.editMessageText(
      `📦 *Custom GB*\n\nGB ပမာဏ ရိုက်ထည့်ပါ (ဥပမာ: 5, 10, 75):`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '« Cancel', callback_data: 'admin_trial_set_gb' }],
          ],
        },
      }
    );
  }

  if (data.startsWith('admin_trial_gb_')) {
    const gb = parseInt(data.replace('admin_trial_gb_', ''));
    const { updateTrialConfig } = require('../vpn/trialManager');
    updateTrialConfig({ totalGB: gb });
    return bot.editMessageText(
      `✅ Trial Data *${gb} GB* သို့ ပြောင်းပြီးပါပြီ!`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎁 Trial Control', callback_data: 'admin_trial_control' }],
            [{ text: '« Admin Menu', callback_data: 'admin_menu' }],
          ],
        },
      }
    );
  }

  if (data === 'admin_trial_set_days') {
    return bot.editMessageText(
      `📅 *Trial Expiry Days ပြင်*\n\nရက် ပမာဏ ရွေးချယ်ပါ:`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '3 Days', callback_data: 'admin_trial_days_3' },
              { text: '5 Days', callback_data: 'admin_trial_days_5' },
              { text: '7 Days', callback_data: 'admin_trial_days_7' },
            ],
            [
              { text: '10 Days', callback_data: 'admin_trial_days_10' },
              { text: '14 Days', callback_data: 'admin_trial_days_14' },
              { text: '30 Days', callback_data: 'admin_trial_days_30' },
            ],
            [{ text: '« Back', callback_data: 'admin_trial_control' }],
          ],
        },
      }
    );
  }

  if (data.startsWith('admin_trial_days_')) {
    const days = parseInt(data.replace('admin_trial_days_', ''));
    const { updateTrialConfig } = require('../vpn/trialManager');
    updateTrialConfig({ expiryDays: days });
    return bot.editMessageText(
      `✅ Trial Expiry *${days} Days* သို့ ပြောင်းပြီးပါပြီ!`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎁 Trial Control', callback_data: 'admin_trial_control' }],
            [{ text: '« Admin Menu', callback_data: 'admin_menu' }],
          ],
        },
      }
    );
  }

  if (data === 'admin_trial_set_ip') {
    return bot.editMessageText(
      `📱 *Trial IP Limit ပြင်*\n\nDevice limit ရွေးချယ်ပါ:`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '1 Device', callback_data: 'admin_trial_ip_1' },
              { text: '2 Devices', callback_data: 'admin_trial_ip_2' },
              { text: '3 Devices', callback_data: 'admin_trial_ip_3' },
            ],
            [{ text: '« Back', callback_data: 'admin_trial_control' }],
          ],
        },
      }
    );
  }

  if (data.startsWith('admin_trial_ip_')) {
    const ip = parseInt(data.replace('admin_trial_ip_', ''));
    const { updateTrialConfig } = require('../vpn/trialManager');
    updateTrialConfig({ ipLimit: ip });
    return bot.editMessageText(
      `✅ Trial IP Limit *${ip}* သို့ ပြောင်းပြီးပါပြီ!`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎁 Trial Control', callback_data: 'admin_trial_control' }],
            [{ text: '« Admin Menu', callback_data: 'admin_menu' }],
          ],
        },
      }
    );
  }

  if (data === 'admin_trial_set_max') {
    return bot.editMessageText(
      `🔢 *Trial Max Per User ပြင်*\n\nအကြိမ် ပမာဏ ရွေးချယ်ပါ:`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '1 ကြိမ်', callback_data: 'admin_trial_max_1' },
              { text: '2 ကြိမ်', callback_data: 'admin_trial_max_2' },
              { text: '3 ကြိမ်', callback_data: 'admin_trial_max_3' },
            ],
            [{ text: '« Back', callback_data: 'admin_trial_control' }],
          ],
        },
      }
    );
  }

  if (data.startsWith('admin_trial_max_')) {
    const max = parseInt(data.replace('admin_trial_max_', ''));
    const { updateTrialConfig } = require('../vpn/trialManager');
    updateTrialConfig({ maxTrials: max });
    return bot.editMessageText(
      `✅ Trial Max per user *${max}* ကြိမ် သို့ ပြောင်းပြီးပါပြီ!`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎁 Trial Control', callback_data: 'admin_trial_control' }],
            [{ text: '« Admin Menu', callback_data: 'admin_menu' }],
          ],
        },
      }
    );
  }

  // ─── Daily Stats (manual trigger) ───────────────────────────
  if (data === 'admin_daily_stats') {
    const { sendDailyStats } = require('../middleware/dailyStats');
    await sendDailyStats(bot);
    bot.answerCallbackQuery(query.id, { text: '📊 Stats report ပို့ပြီးပါပြီ!' });
    return true;
  }

  // ─── Admin Ratings View ──────────────────────────────────────
  if (data === 'admin_ratings') {
    const fs = require('fs');
    const ratingsFile = './data/ratings.json';
    let ratings = {};
    try { ratings = JSON.parse(fs.readFileSync(ratingsFile, 'utf8')); } catch {}

    const entries = Object.entries(ratings);
    if (entries.length === 0) {
      return bot.editMessageText('⭐ <b>Ratings</b>\n\nRating မရှိသေးပါ။', {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: getAdminBackKeyboard(),
      });
    }

    const totalStars = entries.reduce((sum, [, r]) => sum + r.stars, 0);
    const avg = (totalStars / entries.length).toFixed(1);
    const starCounts = [0, 0, 0, 0, 0];
    entries.forEach(([, r]) => { starCounts[r.stars - 1]++; });

    let text = `⭐ <b>Ratings</b> (${entries.length} users)\n\n`;
    text += `<b>Average:</b> ${avg}/5 ${'⭐'.repeat(Math.round(avg))}\n\n`;
    for (let i = 5; i >= 1; i--) {
      text += `${'⭐'.repeat(i)} — ${starCounts[i - 1]} users\n`;
    }

    const feedbacks = entries.filter(([, r]) => r.feedback).slice(-10);
    if (feedbacks.length > 0) {
      text += `\n<b>Latest Feedback:</b>\n`;
      feedbacks.forEach(([, r]) => {
        const name = r.name || 'User';
        text += `• ${r.stars}⭐ <b>${name}</b>: "${r.feedback}"\n`;
      });
    }

    return bot.editMessageText(text, {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: getAdminBackKeyboard(),
    });
  }

  // ─── Maintenance Mode ──────────────────────────────────────
  if (data === 'admin_maintenance') {
    const status = getMaintenanceStatus();
    const statusText = status.enabled ? '🔴 ဖွင့်ထား' : '🟢 ပိတ်ထား';
    const msgText = status.message ? `\n<b>Message:</b> "${status.message}"` : '';

    return bot.editMessageText(
      `🔧 <b>Maintenance Mode</b>\n\n` +
      `<b>Status:</b> ${statusText}${msgText}\n\n` +
      `ဖွင့်ရင် user တွေ bot ကို သုံးလို့မရတော့ဘူး။\nAdmin တွေကတော့ ပုံမှန်အတိုင်း သုံးလို့ရပါတယ်။`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            status.enabled
              ? [{ text: '🟢 Maintenance ပိတ်မယ်', callback_data: 'admin_maint_off' }]
              : [{ text: '🔴 Maintenance ဖွင့်မယ်', callback_data: 'admin_maint_on' }],
            [{ text: '✏️ Message ပြင်', callback_data: 'admin_maint_setmsg' }],
            [{ text: '« Admin Menu', callback_data: 'admin_menu' }],
          ],
        },
      }
    );
  }

  if (data === 'admin_maint_on') {
    const status = getMaintenanceStatus();
    setMaintenanceStatus(true, status.message || '🔧 Bot ကို ပြင်ဆင်နေပါတယ်။ ခဏစောင့်ပေးပါ။');
    return bot.editMessageText(
      `🔴 <b>Maintenance Mode ဖွင့်ပြီးပါပြီ!</b>\n\nUser တွေ bot ကို သုံးလို့မရတော့ပါ။`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔧 Maintenance Settings', callback_data: 'admin_maintenance' }],
            [{ text: '« Admin Menu', callback_data: 'admin_menu' }],
          ],
        },
      }
    );
  }

  if (data === 'admin_maint_off') {
    const status = getMaintenanceStatus();
    setMaintenanceStatus(false, status.message);
    return bot.editMessageText(
      `🟢 <b>Maintenance Mode ပိတ်ပြီးပါပြီ!</b>\n\nUser တွေ bot ကို ပုံမှန်အတိုင်း သုံးလို့ရပါပြီ။`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔧 Maintenance Settings', callback_data: 'admin_maintenance' }],
            [{ text: '« Admin Menu', callback_data: 'admin_menu' }],
          ],
        },
      }
    );
  }

  if (data === 'admin_maint_setmsg') {
    broadcastState[`maintmsg_${userId}`] = true;
    const status = getMaintenanceStatus();
    return bot.editMessageText(
      `✏️ <b>Maintenance Message ပြင်</b>\n\n` +
      `<b>Current:</b> ${status.message || '<i>မသတ်မှတ်ရသေး</i>'}\n\n` +
      `User တွေကို ပြမယ့် message ရိုက်ထည့်ပါ:`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '« Cancel', callback_data: 'admin_maintenance' }],
          ],
        },
      }
    );
  }

  // ─── Admin Credit Management ────────────────────────────────
  if (data === 'admin_credit_manage') {
    const settings = getCreditSettings();
    return bot.editMessageText(
      `💰 <b>Credit Management</b>\n\n` +
      `<b>Current Settings:</b>\n` +
      `👥 Referral Credit: <b>${settings.referralCredit}</b> per invite\n` +
      `📊 Credit/GB Rate: <b>${settings.creditPerGB}</b> Credit = 1 GB\n` +
      `🌐 Referral Key Inbound: <b>${settings.referralKeyInboundId || 'Default'}</b>\n\n` +
      `<b>Premium Plans:</b>\n` +
      settings.premiumPlans.map(p => `• ${p.name}: ${p.dataGB}GB/${p.days}d — ${p.credits} Credit`).join('\n'),
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💰 User Credit ထည့်ပေးမယ်', callback_data: 'admin_add_credit' }],
            [{ text: '📊 Referral Credit ပြင်', callback_data: 'admin_set_ref_credit' }],
            [{ text: '📊 Credit/GB Rate ပြင်', callback_data: 'admin_set_credit_rate' }],
            [{ text: '🌐 Key Inbound ပြင်', callback_data: 'admin_set_credit_inbound' }],
            [{ text: '💎 Premium Plan ပြင်', callback_data: 'admin_set_premium_plans' }],
            [{ text: '« Admin Menu', callback_data: 'admin_menu' }],
          ],
        },
      }
    );
  }

  if (data === 'admin_add_credit') {
    broadcastState[`addcredit_${userId}`] = true;
    return bot.editMessageText(
      `💰 <b>Add Credit to User</b>\n\n` +
      `User ID ရိုက်ထည့်ပါ:\n` +
      `Format: <code>USER_ID AMOUNT</code>\n\n` +
      `Example: <code>5171954086 10</code>\n(User 5171954086 ကို 10 Credit ထည့်ပေးမယ်)`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '« Cancel', callback_data: 'admin_credit_manage' }]],
        },
      }
    );
  }

  if (data === 'admin_set_ref_credit') {
    broadcastState[`setrefcredit_${userId}`] = true;
    const settings = getCreditSettings();
    return bot.editMessageText(
      `📊 <b>Set Referral Credit</b>\n\n` +
      `Current: <b>${settings.referralCredit}</b> Credit per invite\n\n` +
      `Credit amount ရိုက်ထည့်ပါ (ဥပမာ: 0.5):`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '« Cancel', callback_data: 'admin_credit_manage' }]],
        },
      }
    );
  }

  if (data === 'admin_set_credit_rate') {
    broadcastState[`setcreditrate_${userId}`] = true;
    const settings = getCreditSettings();
    return bot.editMessageText(
      `📊 <b>Set Credit/GB Rate</b>\n\n` +
      `Current: <b>${settings.creditPerGB}</b> Credit = 1 GB\n\n` +
      `Rate ရိုက်ထည့်ပါ (ဥပမာ: 0.1):`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '« Cancel', callback_data: 'admin_credit_manage' }]],
        },
      }
    );
  }

  if (data === 'admin_set_credit_inbound') {
    broadcastState[`setcreditinbound_${userId}`] = true;
    const settings = getCreditSettings();
    return bot.editMessageText(
      `🌐 <b>Set Credit Key Inbound ID</b>\n\n` +
      `Current: <b>${settings.referralKeyInboundId || 'Default (Trial Inbound)'}</b>\n\n` +
      `Inbound ID ရိုက်ထည့်ပါ:`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '« Cancel', callback_data: 'admin_credit_manage' }]],
        },
      }
    );
  }

  if (data === 'admin_set_premium_plans') {
    broadcastState[`setpremplan_${userId}`] = true;
    const settings = getCreditSettings();
    let current = settings.premiumPlans.map(p => `${p.name}:${p.dataGB}GB:${p.days}d:${p.credits}cr:${p.ipLimit}ip`).join('\n');
    return bot.editMessageText(
      `💎 <b>Set Premium Plans</b>\n\n` +
      `<b>Current Plans:</b>\n<code>${current}</code>\n\n` +
      `Plan format (line per plan):\n<code>name:dataGB:days:credits:ipLimit</code>\n\n` +
      `Example:\n<code>100 GB:100:30:10:1\n250 GB:250:30:25:2\n500 GB:500:30:50:3</code>`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '« Cancel', callback_data: 'admin_credit_manage' }]],
        },
      }
    );
  }

  // ─── Admin Coupon Management ──────────────────────────────
  if (data === 'admin_coupon_manage') {
    const coupons = getAllCoupons();
    let text = `🎟 <b>Coupon Management</b>\n\n`;
    if (coupons.length === 0) {
      text += `<i>Coupon မရှိသေးပါ</i>`;
    } else {
      for (const c of coupons.slice(-10)) {
        const status = c.active ? '🟢' : '🔴';
        text += `${status} <code>${c.code}</code> — ${c.credits} Credit | Used: ${c.usedBy.length}/${c.maxUses}\n`;
      }
    }
    return bot.editMessageText(text, {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Coupon အသစ် ဆောက်မယ်', callback_data: 'admin_create_coupon' }],
          [{ text: '🗑 Coupon ဖျက်မယ်', callback_data: 'admin_delete_coupon' }],
          [{ text: '« Admin Menu', callback_data: 'admin_menu' }],
        ],
      },
    });
  }

  if (data === 'admin_create_coupon') {
    broadcastState[`createcoupon_${userId}`] = true;
    return bot.editMessageText(
      `➕ <b>Create Coupon</b>\n\n` +
      `Format: <code>CODE CREDITS MAX_USES</code>\n\n` +
      `Example: <code>NEWYEAR 5 100</code>\n(Code: NEWYEAR, 5 Credit, 100 times သုံးလို့ရ)`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '« Cancel', callback_data: 'admin_coupon_manage' }]],
        },
      }
    );
  }

  if (data === 'admin_delete_coupon') {
    broadcastState[`deletecoupon_${userId}`] = true;
    return bot.editMessageText(
      `🗑 <b>Delete Coupon</b>\n\nCoupon code ရိုက်ထည့်ပါ:`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '« Cancel', callback_data: 'admin_coupon_manage' }]],
        },
      }
    );
  }

  // ─── Admin Backup ─────────────────────────────────────────
  if (data === 'admin_backup') {
    const backups = listBackups();
    let text = `💾 <b>Backup System</b>\n\n`;
    if (backups.length === 0) {
      text += '<i>Backup မရှိသေးပါ</i>';
    } else {
      text += `<b>Recent Backups:</b>\n`;
      for (const b of backups.slice(0, 5)) {
        text += `📁 <code>${b.name}</code> — ${b.files} files\n`;
      }
    }
    return bot.editMessageText(text, {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💾 Backup ဆောက်မယ်', callback_data: 'admin_create_backup' }],
          [{ text: '📥 Backup Download', callback_data: 'admin_download_backup' }],
          [{ text: '« Admin Menu', callback_data: 'admin_menu' }],
        ],
      },
    });
  }

  if (data === 'admin_create_backup') {
    const result = createBackup();
    return bot.editMessageText(
      `✅ <b>Backup ဆောက်ပြီးပါပြီ!</b>\n\n` +
      `📁 <code>${result.name}</code>\n📊 Files: ${result.files}`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💾 Backup Menu', callback_data: 'admin_backup' }],
            [{ text: '« Admin Menu', callback_data: 'admin_menu' }],
          ],
        },
      }
    );
  }

  if (data === 'admin_download_backup') {
    const backups = listBackups();
    if (backups.length === 0) {
      return bot.editMessageText('❌ Backup မရှိပါ', {
        chat_id: chatId, message_id: messageId,
        reply_markup: getAdminBackKeyboard(),
      });
    }
    const latest = backups[0];
    const buffer = getBackupZipBuffer(latest.name);
    if (buffer) {
      await bot.sendDocument(chatId, buffer, {
        caption: `💾 Backup: ${latest.name}`,
      }, {
        filename: `${latest.name}.tar.gz`,
        contentType: 'application/gzip',
      });
    } else {
      bot.sendMessage(chatId, '❌ Backup download failed');
    }
    return;
  }

  // ─── Panels (Multi-panel overview) ─────────────────────────
  if (data === 'admin_panels') {
    const xuiClient = require('../vpn/xuiClient');
    const { premiumClient } = require('../vpn/xuiClient');
    let text = `🖥 <b>Panels Overview</b>\n\n`;

    // Trial Panel
    try {
      const status = await xuiClient.getServerStatus();
      if (status && status.obj) {
        const s = status.obj;
        const cpuUsed = s.cpu ? s.cpu.toFixed(1) : 'N/A';
        const memUsed = s.mem ? ((s.mem.current / s.mem.total) * 100).toFixed(1) : 'N/A';
        text += `🟢 <b>Trial Panel</b>\n`;
        text += `  🌐 URL: <code>${process.env.XUI_PANEL_URL || 'N/A'}</code>\n`;
        text += `  💻 CPU: ${cpuUsed}%  |  RAM: ${memUsed}%\n\n`;
      } else {
        text += `🔴 <b>Trial Panel</b> — ချိတ်ဆက်မရပါ\n\n`;
      }
    } catch {
      text += `🔴 <b>Trial Panel</b> — ချိတ်ဆက်မရပါ\n\n`;
    }

    // Premium Panel
    if (process.env.PREMIUM_XUI_PANEL_URL) {
      try {
        const pStatus = await premiumClient.getServerStatus();
        if (pStatus && pStatus.obj) {
          const s = pStatus.obj;
          const cpuUsed = s.cpu ? s.cpu.toFixed(1) : 'N/A';
          const memUsed = s.mem ? ((s.mem.current / s.mem.total) * 100).toFixed(1) : 'N/A';
          text += `🟢 <b>Premium Panel</b>\n`;
          text += `  🌐 URL: <code>${process.env.PREMIUM_XUI_PANEL_URL}</code>\n`;
          text += `  💻 CPU: ${cpuUsed}%  |  RAM: ${memUsed}%\n\n`;
        } else {
          text += `🔴 <b>Premium Panel</b> — ချိတ်ဆက်မရပါ\n\n`;
        }
      } catch {
        text += `🔴 <b>Premium Panel</b> — ချိတ်ဆက်မရပါ\n\n`;
      }
    } else {
      text += `⚠️ <b>Premium Panel</b> — မသတ်မှတ်ရသေး\n`;
      text += `  <i>PREMIUM_XUI_PANEL_URL .env ထဲ ထည့်ပါ</i>\n\n`;
    }

    return bot.editMessageText(text, {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🌐 X-UI Panel Manage', callback_data: 'xui_menu' }],
          [{ text: '« Admin Menu', callback_data: 'admin_menu' }],
        ],
      },
    });
  }

  // ─── Premium Control ──────────────────────────────────────
  if (data === 'admin_premium_control') {
    const { premiumClient } = require('../vpn/xuiClient');
    const { getCreditSettings } = require('../vpn/creditManager');
    const settings = getCreditSettings();

    let text = `💎 <b>Premium Control</b>\n\n`;
    text += `<b>Premium Panel:</b> ${process.env.PREMIUM_XUI_PANEL_URL ? `<code>${process.env.PREMIUM_XUI_PANEL_URL}</code>` : '⚠️ မသတ်မှတ်ရသေး'}\n`;
    text += `<b>Server Host:</b> <code>${process.env.PREMIUM_XUI_SERVER_HOST || '⚠️ မသတ်မှတ်ရသေး'}</code>\n\n`;
    text += `<b>💎 Premium Plans (Credit):</b>\n`;
    for (const p of settings.premiumPlans) {
      text += `  • ${p.name}: ${p.dataGB}GB / ${p.days}d — ${p.credits} Credit (${p.ipLimit} device)\n`;
    }

    let activeKeys = 0;
    try {
      const premClients = await premiumClient.getAllClients();
      const now = Date.now();
      activeKeys = premClients.filter(c => c.enable && (c.expiryTime === 0 || c.expiryTime > now)).length;
      text += `\n<b>🔑 Active Premium Keys:</b> ${activeKeys}`;
    } catch {
      text += `\n<i>Premium panel ချိတ်ဆက်မရပါ</i>`;
    }

    return bot.editMessageText(text, {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💎 Premium Plans ပြင်', callback_data: 'admin_set_premium_plans' }],
          [{ text: '💰 Credit Manage', callback_data: 'admin_credit_manage' }],
          [{ text: '« Admin Menu', callback_data: 'admin_menu' }],
        ],
      },
    });
  }

  // ─── Key Extend: Prompt for email ─────────────────────────
  if (data === 'admin_key_extend') {
    broadcastState[`extend_${userId}`] = true;
    return bot.editMessageText(
      `🔑 <b>Key Extend</b>\n\n` +
      `Extend လုပ်ချင်တဲ့ client email ကို ရိုက်ထည့်ပါ:\n\n` +
      `<i>X-UI Panel &gt; Clients ထဲမှာ email ကြည့်ပါ</i>`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '« Admin Menu', callback_data: 'admin_menu' }],
          ],
        },
      }
    );
  }

  // ─── Key Extend: Select action ────────────────────────────
  if (data.startsWith('admin_extend_action_')) {
    const email = data.replace('admin_extend_action_', '');
    return bot.editMessageText(
      `🔑 <b>Key Extend</b>\n\nClient: <code>${email}</code>\n\nAction ရွေးပါ:`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📅 +7 Days', callback_data: `extend_days_7_${email}` },
              { text: '📅 +14 Days', callback_data: `extend_days_14_${email}` },
              { text: '📅 +30 Days', callback_data: `extend_days_30_${email}` },
            ],
            [
              { text: '📦 +50 GB', callback_data: `extend_gb_50_${email}` },
              { text: '📦 +100 GB', callback_data: `extend_gb_100_${email}` },
              { text: '📦 +200 GB', callback_data: `extend_gb_200_${email}` },
            ],
            [{ text: '« Admin Menu', callback_data: 'admin_menu' }],
          ],
        },
      }
    );
  }

  // ─── Key Extend: Apply days ───────────────────────────────
  if (data.startsWith('extend_days_')) {
    const xuiClient = require('../vpn/xuiClient');
    const parts = data.replace('extend_days_', '').split('_');
    const days = parseInt(parts[0]);
    const email = parts.slice(1).join('_');

    try {
      const clients = await xuiClient.getAllClients();
      const client = clients.find((c) => c.email === email);

      if (!client) {
        return bot.editMessageText(`❌ Client "${email}" မတွေ့ပါ။`, {
          chat_id: chatId, message_id: messageId,
          reply_markup: getAdminBackKeyboard(),
        });
      }

      const addMs = days * 24 * 60 * 60 * 1000;
      const currentExpiry = client.expiryTime > 0 ? client.expiryTime : Date.now();
      const newExpiry = currentExpiry + addMs;

      const updatedConfig = {
        id: client.id,
        flow: client.flow || '',
        email: client.email,
        limitIp: client.limitIp || 0,
        totalGB: client.total || 0,
        expiryTime: newExpiry,
        enable: true,
        tgId: client.tgId || '',
        subId: client.subId || '',
        reset: client.reset || 0,
      };
      if (client.password !== undefined) {
        updatedConfig.password = client.password;
        updatedConfig.method = client.method || '';
      }

      await xuiClient.updateClient(client.id, client.inboundId, updatedConfig);

      const newExpiryDate = new Date(newExpiry).toLocaleDateString('en-GB');

      // Notify user
      if (client.tgId) {
        try {
          await bot.sendMessage(client.tgId,
            `🎉 VPN Key သက်တမ်းတိုးပြီးပါပြီ!\n\n📅 +${days} Days ထပ်ပေးထားပါတယ်\n📅 New Expiry: ${newExpiryDate}\n\nBot Menu: /menu`
          );
        } catch {}
      }

      return bot.editMessageText(
        `✅ Key extend ပြီးပါပြီ!\n\nClient: ${email}\n📅 +${days} Days\n📅 New Expiry: ${newExpiryDate}`,
        {
          chat_id: chatId, message_id: messageId,
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔑 Key Extend', callback_data: 'admin_key_extend' }],
              [{ text: '« Admin Menu', callback_data: 'admin_menu' }],
            ],
          },
        }
      );
    } catch (err) {
      return bot.editMessageText(`❌ Error: ${err.message}`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: getAdminBackKeyboard(),
      });
    }
  }

  // ─── Key Extend: Apply GB ────────────────────────────────
  if (data.startsWith('extend_gb_')) {
    const xuiClient = require('../vpn/xuiClient');
    const parts = data.replace('extend_gb_', '').split('_');
    const gb = parseInt(parts[0]);
    const email = parts.slice(1).join('_');

    try {
      const clients = await xuiClient.getAllClients();
      const client = clients.find((c) => c.email === email);

      if (!client) {
        return bot.editMessageText(`❌ Client "${email}" မတွေ့ပါ။`, {
          chat_id: chatId, message_id: messageId,
          reply_markup: getAdminBackKeyboard(),
        });
      }

      const addBytes = gb * 1024 * 1024 * 1024;
      const currentTotal = client.total || 0;
      const newTotal = currentTotal + addBytes;

      const updatedConfig = {
        id: client.id,
        flow: client.flow || '',
        email: client.email,
        limitIp: client.limitIp || 0,
        totalGB: newTotal,
        expiryTime: client.expiryTime || 0,
        enable: true,
        tgId: client.tgId || '',
        subId: client.subId || '',
        reset: client.reset || 0,
      };
      if (client.password !== undefined) {
        updatedConfig.password = client.password;
        updatedConfig.method = client.method || '';
      }

      await xuiClient.updateClient(client.id, client.inboundId, updatedConfig);

      const totalGBNew = (newTotal / 1024 / 1024 / 1024).toFixed(0);

      // Notify user
      if (client.tgId) {
        try {
          await bot.sendMessage(client.tgId,
            `🎉 VPN Key data ထပ်ပေးပြီးပါပြီ!\n\n📦 +${gb} GB ထပ်ပေးထားပါတယ်\n📦 Total: ${totalGBNew} GB\n\nBot Menu: /menu`
          );
        } catch {}
      }

      return bot.editMessageText(
        `✅ Key extend ပြီးပါပြီ!\n\nClient: ${email}\n📦 +${gb} GB\n📦 Total: ${totalGBNew} GB`,
        {
          chat_id: chatId, message_id: messageId,
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔑 Key Extend', callback_data: 'admin_key_extend' }],
              [{ text: '« Admin Menu', callback_data: 'admin_menu' }],
            ],
          },
        }
      );
    } catch (err) {
      return bot.editMessageText(`❌ Error: ${err.message}`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: getAdminBackKeyboard(),
      });
    }
  }

  return false;
}

function isBroadcasting(userId) {
  return broadcastState[String(userId)] === true;
}

function clearBroadcast(userId) {
  delete broadcastState[String(userId)];
}

function isResettingTrial(userId) {
  return broadcastState[`reset_${String(userId)}`] === true;
}

function clearTrialReset(userId) {
  delete broadcastState[`reset_${String(userId)}`];
}

function isExtendingKey(userId) {
  return broadcastState[`extend_${String(userId)}`] === true;
}

function clearKeyExtend(userId) {
  delete broadcastState[`extend_${String(userId)}`];
}

function isSettingCustomMsg(userId) {
  return broadcastState[`custommsg_${String(userId)}`] === true;
}

function clearCustomMsg(userId) {
  delete broadcastState[`custommsg_${String(userId)}`];
}

function isDeletingKey(userId) {
  return broadcastState[`keydelete_${String(userId)}`] === true;
}

function clearKeyDelete(userId) {
  delete broadcastState[`keydelete_${String(userId)}`];
}

function isSettingTrialGB(userId) {
  return broadcastState[`trialgb_${String(userId)}`] === true;
}

function clearTrialGB(userId) {
  delete broadcastState[`trialgb_${String(userId)}`];
}

function isSettingMaintMsg(userId) {
  return broadcastState[`maintmsg_${String(userId)}`] === true;
}

function clearMaintMsg(userId) {
  delete broadcastState[`maintmsg_${String(userId)}`];
}

// Blacklist functions
function loadBlacklist() {
  if (!fs.existsSync(BLACKLIST_FILE)) {
    fs.writeFileSync(BLACKLIST_FILE, JSON.stringify({ entries: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(BLACKLIST_FILE, 'utf8'));
}
function saveBlacklist(data) {
  fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(data, null, 2));
}
function addBlacklistEntry(targetId, reason, adminId) {
  const data = loadBlacklist();
  const id = String(targetId);
  if (!data.entries[id]) data.entries[id] = { bans: [] };
  data.entries[id].bans.push({ reason, adminId: String(adminId), date: new Date().toISOString() });
  saveBlacklist(data);
}
function getBlacklistEntry(targetId) {
  const data = loadBlacklist();
  return data.entries[String(targetId)] || null;
}

function isBanningWithReason(userId) { return !!broadcastState[`banreason_${String(userId)}`]; }
function getBanTarget(userId) { return broadcastState[`banreason_${String(userId)}`]; }
function clearBanReason(userId) { delete broadcastState[`banreason_${String(userId)}`]; }

function isAddingCredit(userId) { return broadcastState[`addcredit_${String(userId)}`] === true; }
function clearAddCredit(userId) { delete broadcastState[`addcredit_${String(userId)}`]; }
function isSettingRefCredit(userId) { return broadcastState[`setrefcredit_${String(userId)}`] === true; }
function clearRefCredit(userId) { delete broadcastState[`setrefcredit_${String(userId)}`]; }
function isSettingCreditRate(userId) { return broadcastState[`setcreditrate_${String(userId)}`] === true; }
function clearCreditRate(userId) { delete broadcastState[`setcreditrate_${String(userId)}`]; }
function isSettingCreditInbound(userId) { return broadcastState[`setcreditinbound_${String(userId)}`] === true; }
function clearCreditInbound(userId) { delete broadcastState[`setcreditinbound_${String(userId)}`]; }
function isSettingPremPlan(userId) { return broadcastState[`setpremplan_${String(userId)}`] === true; }
function clearPremPlan(userId) { delete broadcastState[`setpremplan_${String(userId)}`]; }
function isCreatingCoupon(userId) { return broadcastState[`createcoupon_${String(userId)}`] === true; }
function clearCreateCoupon(userId) { delete broadcastState[`createcoupon_${String(userId)}`]; }
function isDeletingCoupon(userId) { return broadcastState[`deletecoupon_${String(userId)}`] === true; }
function clearDeleteCoupon(userId) { delete broadcastState[`deletecoupon_${String(userId)}`]; }

module.exports = {
  handleAdminCallback,
  isBroadcasting, clearBroadcast,
  isResettingTrial, clearTrialReset,
  isExtendingKey, clearKeyExtend,
  isSettingCustomMsg, clearCustomMsg,
  isDeletingKey, clearKeyDelete,
  isSettingTrialGB, clearTrialGB,
  isSettingMaintMsg, clearMaintMsg,
  isMaintenanceMode, getMaintenanceStatus,
  isAddingCredit, clearAddCredit,
  isSettingRefCredit, clearRefCredit,
  isSettingCreditRate, clearCreditRate,
  isSettingCreditInbound, clearCreditInbound,
  isSettingPremPlan, clearPremPlan,
  isCreatingCoupon, clearCreateCoupon,
  isDeletingCoupon, clearDeleteCoupon,
  isBanningWithReason, getBanTarget, clearBanReason,
  getBlacklistEntry, addBlacklistEntry,
};
