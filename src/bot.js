require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { handleCommand } = require('./commands');
const { handleCallback } = require('./callbacks');
const { getMainMenuKeyboard } = require('./keyboards');
const { isAdmin, requireAdmin } = require('./admin/auth');
const { registerUser, getUser, isBanned, getAllUsers } = require('./admin/userManager');
const { handleAdminCallback, isBroadcasting, clearBroadcast, isResettingTrial, clearTrialReset, isExtendingKey, clearKeyExtend, isSettingCustomMsg, clearCustomMsg, isDeletingKey, clearKeyDelete, isSettingTrialGB, clearTrialGB, isSettingMaintMsg, clearMaintMsg, isMaintenanceMode, getMaintenanceStatus, isAddingCredit, clearAddCredit, isSettingRefCredit, clearRefCredit, isSettingCreditRate, clearCreditRate, isSettingCreditInbound, clearCreditInbound, isSettingPremPlan, clearPremPlan, isCreatingCoupon, clearCreateCoupon, isDeletingCoupon, clearDeleteCoupon, isBanningWithReason, getBanTarget, clearBanReason, isServerAdminState, clearServerAdminState, handleServerAdminMessage, isWelcomeEdit, clearWelcomeEdit } = require('./admin/adminCallbacks');
const { getAdminMenuKeyboard } = require('./admin/adminKeyboards');
const { handleXuiCallback, handleXuiAdminMessage, getAdminState, clearAdminState } = require('./admin/xuiAdminCallbacks');
const { handlePanelCallback, handlePanelAdminMessage, handlePanelTypeCallback, isPanelAdminState, clearPanelState } = require('./admin/panelCallbacks');
const { checkMembership, getForceJoinKeyboard, getForceJoinMessage, isForceJoinEnabled } = require('./middleware/forceJoin');
const { logUserAction, isRatingFeedback, clearRatingFeedback, isCouponRedeem, clearCouponRedeem, setLogChannel, getLogChannel } = require('./middleware/userLogger');
const { startUsageAlertScheduler } = require('./middleware/usageAlert');
const { startDailyStatsScheduler } = require('./middleware/dailyStats');
const { startKeyCleanupScheduler } = require('./middleware/keyCleanup');
const { setWelcomeText } = require('./middleware/welcomeManager');
const { recordReferral, findReferrerByCode } = require('./vpn/referralManager');
const { getAllPendingOrders, approveOrder, rejectOrder, getOrderById, updateOrderScreenshot } = require('./vpn/premiumManager');
const { hasUsedTrial, getTrialInfo } = require('./vpn/trialManager');

const fs = require('fs');
const path = require('path');
const SERVERS_FILE = path.join(__dirname, '../data/servers.json');

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not set in .env file');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

console.log('VPN Key Bot is running...');

// Start schedulers
startUsageAlertScheduler(bot);
startDailyStatsScheduler(bot);
startKeyCleanupScheduler(bot);

// Admin state for order management
const adminOrderState = new Map();

// ─── Helper: Check force join ────────────────────────────────
async function enforceJoin(msg) {
  if (!isForceJoinEnabled()) return true;
  if (isAdmin(msg.from.id)) return true;

  const isMember = await checkMembership(bot, msg.from.id);
  if (!isMember) {
    bot.sendMessage(msg.chat.id, getForceJoinMessage(), {
      parse_mode: 'Markdown',
      reply_markup: getForceJoinKeyboard(),
    });
    return false;
  }
  return true;
}

async function enforceJoinCallback(query) {
  if (!isForceJoinEnabled()) return true;
  if (isAdmin(query.from.id)) return true;

  const isMember = await checkMembership(bot, query.from.id);
  if (!isMember) {
    bot.answerCallbackQuery(query.id, {
      text: '⚠️ Channel join ပေးပါ!',
      show_alert: true,
    });
    bot.editMessageText(getForceJoinMessage(), {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
      parse_mode: 'Markdown',
      reply_markup: getForceJoinKeyboard(),
    });
    return false;
  }
  return true;
}

// ─── Middleware: Register user & check ban ───────────────────
bot.on('message', (msg) => {
  if (!msg.from) return;
  registerUser(msg.from);

  if (isBanned(msg.from.id)) {
    if (msg.text && !msg.text.startsWith('/start')) return;
    bot.sendMessage(msg.chat.id, '⛔ You have been banned from using this bot.');
    return;
  }
});

// ─── Admin Commands ──────────────────────────────────────────
bot.onText(/\/admin/, (msg) => {
  if (!requireAdmin(bot, msg)) return;
  bot.sendMessage(msg.chat.id, '🔧 *Admin Panel*', {
    parse_mode: 'Markdown',
    reply_markup: getAdminMenuKeyboard(),
  });
});

// /addserver command removed - now handled via inline UI in admin_servers

bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  if (!requireAdmin(bot, msg)) return;
  const text = match[1];
  const users = getAllUsers();
  const userIds = Object.keys(users);

  let sent = 0;
  let failed = 0;

  await bot.sendMessage(msg.chat.id, `📢 Broadcasting to ${userIds.length} users...`);

  for (const uid of userIds) {
    try {
      await bot.sendMessage(uid, `📢 Broadcast\n\n${text}`);
      sent++;
      if (sent % 25 === 0) await new Promise(r => setTimeout(r, 1000));
    } catch {
      failed++;
    }
  }

  await bot.sendMessage(msg.chat.id, `📢 Broadcast complete!\n✅ Sent: ${sent}\n❌ Failed: ${failed}`);
});

bot.onText(/\/ban (\d+)/, (msg, match) => {
  if (!requireAdmin(bot, msg)) return;
  const { banUser } = require('./admin/userManager');
  banUser(match[1]);
  bot.sendMessage(msg.chat.id, `🚫 User \`${match[1]}\` banned.`, { parse_mode: 'Markdown' });
});

bot.onText(/\/unban (\d+)/, (msg, match) => {
  if (!requireAdmin(bot, msg)) return;
  const { unbanUser } = require('./admin/userManager');
  unbanUser(match[1]);
  bot.sendMessage(msg.chat.id, `✅ User \`${match[1]}\` unbanned.`, { parse_mode: 'Markdown' });
});

bot.onText(/\/stats/, (msg) => {
  if (!requireAdmin(bot, msg)) return;
  const { getStats } = require('./admin/userManager');
  const stats = getStats();
  bot.sendMessage(msg.chat.id,
    `📊 *Bot Statistics*\n\n` +
    `👥 Total Users: *${stats.totalUsers}*\n` +
    `🟢 Active Today: *${stats.activeToday}*\n` +
    `🚫 Banned: *${stats.bannedCount}*\n` +
    `🔑 Total Keys: *${stats.totalKeys}*\n` +
    `⚙️ Total Configs: *${stats.totalConfigs}*`,
    { parse_mode: 'Markdown' }
  );
});

// ─── Admin: Order Management ─────────────────────────────────
bot.onText(/\/orders/, (msg) => {
  if (!requireAdmin(bot, msg)) return;
  const pending = getAllPendingOrders();

  if (pending.length === 0) {
    bot.sendMessage(msg.chat.id, '📋 *Pending Orders*\n\nPending order မရှိပါ။', { parse_mode: 'Markdown' });
    return;
  }

  let text = `📋 *Pending Orders (${pending.length})*\n\n`;
  const buttons = [];
  for (const o of pending) {
    text += `⏳ \`${o.orderId}\`\n` +
      `   User: \`${o.userId}\` | ${o.planName} | ${o.price} Ks\n\n`;
    buttons.push([
      { text: `✅ Approve ${o.orderId}`, callback_data: `order_approve_${o.orderId}` },
      { text: `❌ Reject ${o.orderId}`, callback_data: `order_reject_${o.orderId}` },
    ]);
  }
  buttons.push([{ text: '« Admin Menu', callback_data: 'admin_menu' }]);

  bot.sendMessage(msg.chat.id, text, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: buttons },
  });
});

// ─── Admin: Trial Reset ──────────────────────────────────────
bot.onText(/\/trialreset (\d+)/, async (msg, match) => {
  if (!requireAdmin(bot, msg)) return;

  const targetUserId = match[1];
  const { resetTrial } = require('./vpn/trialManager');

  if (resetTrial(targetUserId)) {
    await bot.sendMessage(msg.chat.id, `✅ User ${targetUserId} ၏ trial reset ပြီးပါပြီ။`);
    try {
      await bot.sendMessage(targetUserId,
        `🎉 Trial Key ပြန်လည်ရယူနိုင်ပါပြီ!\n\nAdmin မှ trial reset လုပ်ပေးထားပါတယ်။ 🎁 Trial Key ကို ပြန်ထုတ်ယူနိုင်ပါပြီ။`
      );
      await bot.sendMessage(msg.chat.id, `📨 User ${targetUserId} ကို notify ပို့ပြီးပါပြီ။`);
    } catch {
      await bot.sendMessage(msg.chat.id, `⚠️ User ${targetUserId} ကို notify ပို့လို့ မရပါ။`);
    }
  } else {
    await bot.sendMessage(msg.chat.id, `ℹ️ User ${targetUserId} trial data မရှိပါ။`);
  }
});

// ─── User Commands ───────────────────────────────────────────
bot.onText(/\/start(.*)/, async (msg, match) => {
  if (isBanned(msg.from.id)) return;
  // Maintenance mode check (admin bypass)
  if (isMaintenanceMode() && !isAdmin(msg.from.id)) {
    const mStatus = getMaintenanceStatus();
    return bot.sendMessage(msg.chat.id, mStatus.message || '🔧 Bot ကို ပြင်ဆင်နေပါတယ်။ ခဏစောင့်ပေးပါ။');
  }
  if (!await enforceJoin(msg)) return;

  // Handle referral link
  const param = (match[1] || '').trim();
  if (param.startsWith('ref_')) {
    const referrerId = param.replace('ref_', '');
    if (referrerId !== String(msg.from.id)) {
      const recorded = recordReferral(referrerId, msg.from.id, msg.from.first_name || 'User');
      if (recorded) {
        logUserAction(bot, msg.from, '👥 Referred User Joined',
          `Referred by: \`${referrerId}\``
        );
        // Notify referrer
        try {
          const { getUserReferral, getReferralConfig } = require('./vpn/referralManager');
          const ref = getUserReferral(referrerId);
          const config = getReferralConfig();
          await bot.sendMessage(referrerId,
            `👥 *New Referral!*\n\n` +
            `${msg.from.first_name || 'User'} သင့် link ကနေ join ပါတယ်!\n` +
            `📊 Total: ${ref.invitedUsers.length}/${config.requiredInvites}\n\n` +
            (ref.invitedUsers.length >= config.requiredInvites
              ? `🎁 Bonus key ယူလို့ရပါပြီ! /menu > Referral ကို နှိပ်ပါ!`
              : `${config.requiredInvites - ref.invitedUsers.length} ယောက် ထပ်လိုပါသေးတယ်!`),
            { parse_mode: 'Markdown' }
          );
        } catch {}
      }
    }
  }

  logUserAction(bot, msg.from, '🟢 Bot Started', 'User opened the bot');
  handleCommand(bot, msg, 'start');
});

bot.onText(/\/help/, async (msg) => {
  if (isBanned(msg.from.id)) return;
  if (!await enforceJoin(msg)) return;
  handleCommand(bot, msg, 'help');
});

bot.onText(/\/menu/, async (msg) => {
  if (isBanned(msg.from.id)) return;
  if (!await enforceJoin(msg)) return;
  handleCommand(bot, msg, 'menu');
});

bot.onText(/\/trial/, async (msg) => {
  if (isBanned(msg.from.id)) return;
  if (!await enforceJoin(msg)) return;

  const { getTrialConfig } = require('./vpn/trialManager');

  if (hasUsedTrial(msg.from.id)) {
    bot.sendMessage(msg.chat.id,
      '🎁 *Trial Key*\n\n❌ Trial key ကို တစ်ကြိမ်သာ ထုတ်ခွင့်ရှိပါတယ်။\nသင် trial key ယူပြီးပါပြီ။',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const config = getTrialConfig();
  bot.sendMessage(msg.chat.id,
    `🎁 *Trial Key*\n\n` +
    `Free trial key ထုတ်ယူနိုင်ပါတယ်!\n\n` +
    `📦 Data: *${config.totalGB} GB*\n` +
    `📅 Expiry: *${config.expiryDays} Days*\n` +
    `📱 Device Limit: *${config.ipLimit}*\n` +
    `🔐 Encryption: *aes-256-gcm*\n\n` +
    `⚠️ တစ်ယောက်ကို *${config.maxTrials} ကြိမ်* သာ ထုတ်ခွင့်ရှိပါတယ်။`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎁 Trial Key ထုတ်ယူမယ်', callback_data: 'trial_claim' }],
          [{ text: '« Back', callback_data: 'back_to_menu' }],
        ],
      },
    }
  );
});

bot.onText(/\/mykey/, async (msg) => {
  if (isBanned(msg.from.id)) return;
  if (!await enforceJoin(msg)) return;
  handleCallback(bot, {
    id: 'cmd',
    from: msg.from,
    message: { chat: msg.chat, message_id: msg.message_id },
    data: 'menu_mykey',
  });
});

bot.onText(/\/account/, async (msg) => {
  if (isBanned(msg.from.id)) return;
  if (!await enforceJoin(msg)) return;
  handleCallback(bot, {
    id: 'cmd',
    from: msg.from,
    message: { chat: msg.chat, message_id: msg.message_id },
    data: 'my_account',
  });
});

bot.onText(/\/id(.*)/, async (msg, match) => {
  if (isBanned(msg.from.id)) return;
  if (!await enforceJoin(msg)) return;

  const { getTrialInfo } = require('./vpn/trialManager');
  const { getUserPremiumKeys } = require('./vpn/premiumManager');
  const { getUserReferral } = require('./vpn/referralManager');
  const { getBalance, getUserCredits } = require('./vpn/creditManager');
  const xuiClient = require('./vpn/xuiClient');
  const { premiumClient } = require('./vpn/xuiClient');
  const escHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const arg = (match[1] || '').trim();
  let targetId = String(msg.from.id);
  let targetUser = null;
  let targetName = escHtml(msg.from.first_name || 'User');
  let targetUsername = msg.from.username ? `@${escHtml(msg.from.username)}` : 'N/A';

  // Admin can look up by username or userId
  if (arg && isAdmin(msg.from.id)) {
    const searchTerm = arg.replace(/^@/, '');
    const allUsers = getAllUsers();
    // Search by userId or username
    let found = null;
    for (const [uid, udata] of Object.entries(allUsers)) {
      if (uid === searchTerm || (udata.username && udata.username.toLowerCase() === searchTerm.toLowerCase())) {
        found = { id: uid, ...udata };
        break;
      }
    }
    if (!found) {
      return bot.sendMessage(msg.chat.id, `❌ User <code>${escHtml(searchTerm)}</code> not found.`, { parse_mode: 'HTML' });
    }
    targetId = found.id;
    targetName = escHtml(found.firstName || found.first_name || 'User');
    targetUsername = found.username ? `@${escHtml(found.username)}` : 'N/A';
    targetUser = found;
  }

  const user = targetUser || getUser(targetId);
  const trial = getTrialInfo(targetId);
  const premium = getUserPremiumKeys(targetId);
  const ref = getUserReferral(targetId);
  const creditBalance = getBalance(targetId);
  const creditInfo = getUserCredits(targetId);

  let text =
    `📋 <b>${arg && isAdmin(msg.from.id) ? 'User Info' : 'My Information'}</b>\n\n` +
    `<b>Name:</b> ${targetName}\n` +
    `<b>Username:</b> ${targetUsername}\n` +
    `<b>User ID:</b> <code>${targetId}</code>\n` +
    `<b>Joined:</b> ${user ? new Date(user.joinedAt).toLocaleDateString('en-GB') : 'N/A'}\n` +
    `<b>Last Active:</b> ${user ? new Date(user.lastActive).toLocaleDateString('en-GB') : 'N/A'}\n\n`;

  text += `🎁 <b>Trial Key:</b> ${trial && trial.count > 0 ? `ယူပြီး (${trial.count})` : 'မယူရသေးပါ'}\n`;
  text += `💎 <b>Premium Keys:</b> ${premium.length} ခု\n`;
  text += `👥 <b>Referrals:</b> ${ref.invitedUsers.length} ယောက် invited\n`;
  text += `💰 <b>Credit Balance:</b> ${creditBalance}\n`;
  text += `💰 <b>Total Earned:</b> ${creditInfo.history.filter(h => h.type === 'add').reduce((a, h) => a + h.amount, 0).toFixed(2)}\n`;
  text += `💰 <b>Total Spent:</b> ${creditInfo.history.filter(h => h.type === 'deduct').reduce((a, h) => a + h.amount, 0).toFixed(2)}\n\n`;

  const allKeys = [];
  if (trial && trial.keys) allKeys.push(...trial.keys.map(k => ({ ...k, type: 'Trial' })));
  allKeys.push(...premium.map(k => ({ ...k, type: 'Premium' })));

  if (allKeys.length > 0) {
    try {
      // Get clients from both panels
      let clients = await xuiClient.getAllClients();
      if (premiumClient) {
        try {
          const premClients = await premiumClient.getAllClients();
          clients = clients.concat(premClients);
        } catch (e) { /* ignore */ }
      }
      text += `<b>🔑 Keys:</b>\n`;
      for (const key of allKeys) {
        const client = clients.find(c => c.email === key.email);
        if (client) {
          const usedGB = ((client.up + client.down) / 1024 / 1024 / 1024).toFixed(2);
          const totalGB = client.total > 0 ? (client.total / 1024 / 1024 / 1024).toFixed(0) : '∞';
          const expiry = client.expiryTime > 0 ? new Date(client.expiryTime).toLocaleDateString('en-GB') : '∞';
          const now = Date.now();
          const isExpired = client.expiryTime > 0 && client.expiryTime < now;
          const status = !client.enable ? '🔴 Disabled' : isExpired ? '🔴 Expired' : '🟢 Active';
          const daysLeft = client.expiryTime > 0 ? Math.max(0, Math.ceil((client.expiryTime - now) / 86400000)) : '∞';

          text += `\n${status} <b>${key.type}</b>\n`;
          text += `  📧 ${escHtml(key.email)}\n`;
          text += `  📊 Data: ${usedGB} / ${totalGB} GB\n`;
          text += `  📅 Expiry: ${expiry} (${daysLeft} days left)\n`;
          text += `  🔗 <code>${key.link || 'N/A'}</code>\n`;
        }
      }
    } catch {
      text += `\n<i>Key data ယူ၍မရပါ</i>\n`;
    }
  } else {
    text += `<i>Key မရှိသေးပါ</i>`;
  }

  bot.sendMessage(msg.chat.id, text, { parse_mode: 'HTML' });
});

// /setchannel — admin sets log channel by forwarding a message from the channel
bot.onText(/\/setchannel/, async (msg) => {
  if (!isAdmin(msg.from.id)) return;
  // If this is a forwarded message from a channel, use that channel's chat ID
  if (msg.forward_from_chat && (msg.forward_from_chat.type === 'channel' || msg.forward_from_chat.type === 'supergroup')) {
    const channelId = String(msg.forward_from_chat.id);
    const channelTitle = msg.forward_from_chat.title || 'Unknown';
    setLogChannel(channelId);
    return bot.sendMessage(msg.chat.id,
      `✅ Log Channel set!\n\n` +
      `📋 Title: ${channelTitle}\n` +
      `🆔 ID: <code>${channelId}</code>\n\n` +
      `Log တွေ ဒီ channel ကို ပို့ပေးပါမယ်။`,
      { parse_mode: 'HTML' }
    );
  }
  // If just /setchannel with a chat ID argument
  const text = msg.text.trim();
  const parts = text.split(/\s+/);
  if (parts.length > 1) {
    const channelId = parts[1];
    setLogChannel(channelId);
    try {
      await bot.sendMessage(channelId, '✅ Log channel connected!');
      return bot.sendMessage(msg.chat.id, `✅ Log Channel <code>${channelId}</code> set!`, { parse_mode: 'HTML' });
    } catch (e) {
      return bot.sendMessage(msg.chat.id, `⚠️ Channel set but test send failed: ${e.message}\n\nBot ကို channel admin အဖြစ် ထည့်ထားပါ။`, { parse_mode: 'HTML' });
    }
  }
  // Instructions
  const current = getLogChannel();
  return bot.sendMessage(msg.chat.id,
    `📋 <b>Set Log Channel</b>\n\n` +
    `<b>Current:</b> ${current || 'Not set'}\n\n` +
    `<b>နည်း ၁:</b> Channel ထဲက message တစ်ခု forward လုပ်ပြီး /setchannel ရိုက်ပါ\n\n` +
    `<b>နည်း ၂:</b> <code>/setchannel -100xxxxx</code> (channel ID ထည့်ပါ)\n\n` +
    `⚠️ Bot ကို channel admin အဖြစ် ထည့်ထားဖို့ လိုပါတယ်`,
    { parse_mode: 'HTML' }
  );
});

bot.onText(/\/cancel/, (msg) => {
  clearBroadcast(msg.from.id);
  clearAdminState(msg.from.id);
  clearCustomMsg(msg.from.id);
  clearKeyDelete(msg.from.id);
  clearTrialGB(msg.from.id);
  clearMaintMsg(msg.from.id);
  clearAddCredit(msg.from.id);
  clearRefCredit(msg.from.id);
  clearCreditRate(msg.from.id);
  clearCreditInbound(msg.from.id);
  clearPremPlan(msg.from.id);
  clearCreateCoupon(msg.from.id);
  clearDeleteCoupon(msg.from.id);
  clearPanelState(msg.from.id);
  clearServerAdminState(msg.from.id);
  adminOrderState.delete(String(msg.from.id));
  bot.sendMessage(msg.chat.id, 'Cancelled.', { reply_markup: getMainMenuKeyboard() });
});

// ─── Callback Query Handler ─────────────────────────────────
bot.on('callback_query', async (query) => {
  if (isBanned(query.from.id)) {
    bot.answerCallbackQuery(query.id, { text: '⛔ You are banned' });
    return;
  }

  registerUser(query.from);

  // Check join callback
  if (query.data === 'check_join') {
    const isMember = await checkMembership(bot, query.from.id);
    if (isMember) {
      bot.answerCallbackQuery(query.id, { text: '✅ Join ပြီးပါပြီ!' });
      bot.editMessageText(
        `🔐 *VPN Key Bot*\n\n` +
        `Channel join ပြီးပါပြီ! အောက်က menu ကနေ ရွေးချယ်ပါ 👇`,
        {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'Markdown',
          reply_markup: getMainMenuKeyboard(),
        }
      );
      logUserAction(bot, query.from, '📢 Channel Joined', 'User joined the required channel');
      return;
    }
    bot.answerCallbackQuery(query.id, {
      text: '❌ Channel ကို join ပေးပါ!',
      show_alert: true,
    });
    return;
  }

  // Admin order callbacks
  if (query.data.startsWith('order_approve_')) {
    if (!isAdmin(query.from.id)) return;
    const orderId = query.data.replace('order_approve_', '');

    bot.answerCallbackQuery(query.id, { text: '⏳ Approving...' });
    const result = await approveOrder(orderId);

    if (result.success) {
      bot.editMessageText(
        `✅ *Order Approved!*\n\n` +
        `📋 Order: \`${orderId}\`\n` +
        `👤 User: \`${result.userId}\`\n` +
        `📦 Plan: ${result.order.planName}\n\n` +
        `Key auto-created ပြီး user ထံ ပို့ပေးပါပြီ။`,
        {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'Markdown',
        }
      );

      // Notify user
      try {
        await bot.sendMessage(result.userId,
          `✅ *Order Approved!*\n\n` +
          `📋 Order: \`${orderId}\`\n` +
          `📦 Plan: *${result.order.planName}* (${result.order.dataGB}GB/${result.order.days}Days)\n\n` +
          `🔗 *Config Link:*\n\`${result.link}\`\n\n` +
          `_Link ကို copy ပြီး VPN app ထဲ import လုပ်ပါ။_`,
          { parse_mode: 'Markdown' }
        );
      } catch {}

      logUserAction(bot, query.from, '✅ Order Approved',
        `📋 Order: \`${orderId}\`\nUser: \`${result.userId}\``
      );
    } else {
      bot.editMessageText(`❌ Approve failed: ${result.msg}`, {
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
      });
    }
    return;
  }

  if (query.data.startsWith('order_reject_')) {
    if (!isAdmin(query.from.id)) return;
    const orderId = query.data.replace('order_reject_', '');
    const result = rejectOrder(orderId);

    if (result.success) {
      bot.answerCallbackQuery(query.id, { text: '❌ Rejected' });
      bot.editMessageText(
        `❌ *Order Rejected*\n\n📋 Order: \`${orderId}\``,
        {
          chat_id: query.message.chat.id,
          message_id: query.message.message_id,
          parse_mode: 'Markdown',
        }
      );

      // Notify user
      try {
        await bot.sendMessage(result.userId,
          `❌ *Order Rejected*\n\n` +
          `📋 Order: \`${orderId}\`\n\n` +
          `Admin ထံ ဆက်သွယ်ပြီး မေးမြန်းနိုင်ပါတယ်။`,
          { parse_mode: 'Markdown' }
        );
      } catch {}
    }
    return;
  }

  // Force join check for non-admin callbacks
  if (!query.data.startsWith('xui_') && !query.data.startsWith('admin_') && !query.data.startsWith('admsrv') && !query.data.startsWith('premcfg_') && !query.data.startsWith('confirm_delete_') && !query.data.startsWith('pm_') && !query.data.startsWith('px_')) {
    if (!await enforceJoinCallback(query)) return;
  }

  // Check if it's a panel management callback
  if (query.data.startsWith('pm_') || query.data.startsWith('px_')) {
    // Handle add panel type selection
    if (query.data.startsWith('pm_addtype_')) {
      return handlePanelTypeCallback(bot, query);
    }
    return handlePanelCallback(bot, query);
  }

  // Check if it's an X-UI callback
  if (query.data.startsWith('xui_')) {
    return handleXuiCallback(bot, query);
  }

  // Check if it's an admin callback
  if (query.data.startsWith('admin_') || query.data.startsWith('admsrv') || query.data.startsWith('premcfg_') || query.data.startsWith('extend_days_') || query.data.startsWith('extend_gb_') || query.data.startsWith('confirm_delete_')) {
    return handleAdminCallback(bot, query);
  }

  // Maintenance mode check for user callbacks (admin bypass)
  if (isMaintenanceMode() && !isAdmin(query.from.id)) {
    const mStatus = getMaintenanceStatus();
    return bot.answerCallbackQuery(query.id, {
      text: mStatus.message || '🔧 Bot ကို ပြင်ဆင်နေပါတယ်။',
      show_alert: true,
    });
  }

  return handleCallback(bot, query);
});

// ─── Photo handler for payment screenshots ───────────────────
bot.on('photo', async (msg) => {
  if (!msg.caption || isBanned(msg.from.id)) return;

  // Check if caption contains order ID
  const orderMatch = msg.caption.match(/ORD\d+/);
  if (!orderMatch) return;

  const orderId = orderMatch[0];
  const order = getOrderById(orderId);
  if (!order || order.userId !== String(msg.from.id)) {
    bot.sendMessage(msg.chat.id, '❌ Order ID မမှန်ပါ။');
    return;
  }
  if (order.status !== 'pending') {
    bot.sendMessage(msg.chat.id, `ℹ️ Order \`${orderId}\` ${order.status} ဖြစ်ပြီးပါပြီ။`, { parse_mode: 'Markdown' });
    return;
  }

  const fileId = msg.photo[msg.photo.length - 1].file_id;
  updateOrderScreenshot(String(msg.from.id), orderId, fileId);

  bot.sendMessage(msg.chat.id,
    `✅ *Screenshot ရရှိပါပြီ!*\n\n` +
    `📋 Order: \`${orderId}\`\n` +
    `Admin approve လုပ်ပေးပါမယ်။ ခဏစောင့်ပါ။`,
    { parse_mode: 'Markdown' }
  );

  // Notify admin
  const adminIds = (process.env.ADMIN_IDS || '').split(',');
  for (const adminId of adminIds) {
    try {
      await bot.sendPhoto(adminId.trim(), fileId, {
        caption: `💰 *Payment Screenshot*\n\n` +
          `📋 Order: \`${orderId}\`\n` +
          `👤 User: \`${order.userId}\`\n` +
          `📦 Plan: ${order.planName} | ${order.price} Ks`,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Approve', callback_data: `order_approve_${orderId}` },
              { text: '❌ Reject', callback_data: `order_reject_${orderId}` },
            ],
          ],
        },
      });
    } catch {}
  }

  logUserAction(bot, msg.from, '💰 Payment Screenshot Sent',
    `📋 Order: \`${orderId}\`\n📦 Plan: ${order.planName} | ${order.price} Ks`
  );
});

// ─── Admin message handler (broadcast + XUI) ────────────────
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  if (!isAdmin(msg.from.id)) return;

  // Key extend: admin sends client email
  if (isExtendingKey(msg.from.id)) {
    clearKeyExtend(msg.from.id);
    const email = msg.text.trim();

    const xuiClient = require('./vpn/xuiClient');
    try {
      const clients = await xuiClient.getAllClients();
      const client = clients.find((c) => c.email === email);

      if (!client) {
        await bot.sendMessage(msg.chat.id, `❌ Client "${email}" မတွေ့ပါ။`);
        return;
      }

      const usedGB = ((client.up + client.down) / 1024 / 1024 / 1024).toFixed(2);
      const totalGB = client.total > 0 ? (client.total / 1024 / 1024 / 1024).toFixed(0) : 'Unlimited';
      const expiry = client.expiryTime > 0
        ? new Date(client.expiryTime).toLocaleDateString('en-GB')
        : 'Unlimited';

      await bot.sendMessage(msg.chat.id,
        `🔑 Client Found!\n\n` +
        `Email: ${email}\n` +
        `📦 Data: ${usedGB} GB / ${totalGB} GB\n` +
        `📅 Expiry: ${expiry}\n\n` +
        `Action ရွေးပါ:`,
        {
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
    } catch (err) {
      await bot.sendMessage(msg.chat.id, `❌ Error: ${err.message}`);
    }
    return;
  }

  // Trial reset: admin sends user ID
  if (isResettingTrial(msg.from.id)) {
    clearTrialReset(msg.from.id);
    const targetId = msg.text.trim();

    if (!/^\d+$/.test(targetId)) {
      await bot.sendMessage(msg.chat.id, '❌ User ID သည် ဂဏန်းဖြစ်ရပါမယ်။');
      return;
    }

    const { resetTrial } = require('./vpn/trialManager');
    if (resetTrial(targetId)) {
      await bot.sendMessage(msg.chat.id, `✅ User ${targetId} ၏ trial reset ပြီးပါပြီ။`);
      try {
        await bot.sendMessage(targetId,
          `🎉 Trial Key ပြန်လည်ရယူနိုင်ပါပြီ!\n\nAdmin မှ trial reset လုပ်ပေးထားပါတယ်။ 🎁 Trial Key ကို ပြန်ထုတ်ယူနိုင်ပါပြီ။`
        );
        await bot.sendMessage(msg.chat.id, `📨 User ${targetId} ကို notify ပို့ပြီးပါပြီ။`);
      } catch {
        await bot.sendMessage(msg.chat.id, `⚠️ User ${targetId} ကို notify ပို့လို့ မရပါ။`);
      }
    } else {
      await bot.sendMessage(msg.chat.id, `ℹ️ User ${targetId} trial data မရှိပါ။`);
    }
    return;
  }

  // Maintenance message setting
  if (isSettingMaintMsg(msg.from.id)) {
    clearMaintMsg(msg.from.id);
    const { setMaintenanceStatus, getMaintenanceStatus } = require('./admin/adminCallbacks');
    const status = getMaintenanceStatus();
    setMaintenanceStatus(status.enabled, msg.text.trim());
    await bot.sendMessage(msg.chat.id, `✅ Maintenance message ပြင်ပြီးပါပြီ!\n\n"${msg.text.trim()}"`);
    return;
  }

  // Ban with reason
  if (isBanningWithReason(msg.from.id)) {
    const targetId = getBanTarget(msg.from.id);
    clearBanReason(msg.from.id);
    const { banUser } = require('./admin/userManager');
    const { addBlacklistEntry } = require('./admin/adminCallbacks');
    banUser(targetId);
    const reason = msg.text.trim();
    addBlacklistEntry(targetId, reason, msg.from.id);
    await bot.sendMessage(msg.chat.id, `🚫 User ${targetId} banned!\n📝 Reason: ${reason}`);
    return;
  }

  // Admin add credit to user
  if (isAddingCredit(msg.from.id)) {
    clearAddCredit(msg.from.id);
    const parts = msg.text.trim().split(/\s+/);
    if (parts.length < 2) {
      await bot.sendMessage(msg.chat.id, '❌ Format: USER_ID AMOUNT');
      return;
    }
    const targetId = parts[0];
    const amount = parseFloat(parts[1]);
    if (isNaN(amount) || amount <= 0) {
      await bot.sendMessage(msg.chat.id, '❌ Amount မှန်ကန်ပါ (ဥပမာ: 10)');
      return;
    }
    const { addCredits, getBalance } = require('./vpn/creditManager');
    addCredits(targetId, amount, 'Admin added');
    const newBalance = getBalance(targetId);
    await bot.sendMessage(msg.chat.id, `✅ User ${targetId} ကို ${amount} Credit ထည့်ပြီးပါပြီ!\n💰 New Balance: ${newBalance}`);
    // Notify user
    try {
      await bot.sendMessage(targetId, `💰 Admin က သင့်ကို ${amount} Credit ထည့်ပေးပါပြီ!\n💰 Balance: ${newBalance}`);
    } catch {}
    return;
  }

  // Set referral credit amount
  if (isSettingRefCredit(msg.from.id)) {
    clearRefCredit(msg.from.id);
    const val = parseFloat(msg.text.trim());
    if (isNaN(val) || val <= 0) {
      await bot.sendMessage(msg.chat.id, '❌ Number ရိုက်ထည့်ပါ (ဥပမာ: 0.5)');
      return;
    }
    const { updateCreditSettings } = require('./vpn/creditManager');
    updateCreditSettings({ referralCredit: val });
    await bot.sendMessage(msg.chat.id, `✅ Referral Credit: ${val} per invite`);
    return;
  }

  // Set credit/GB rate
  if (isSettingCreditRate(msg.from.id)) {
    clearCreditRate(msg.from.id);
    const val = parseFloat(msg.text.trim());
    if (isNaN(val) || val <= 0) {
      await bot.sendMessage(msg.chat.id, '❌ Number ရိုက်ထည့်ပါ (ဥပမာ: 0.1)');
      return;
    }
    const { updateCreditSettings } = require('./vpn/creditManager');
    updateCreditSettings({ creditPerGB: val });
    await bot.sendMessage(msg.chat.id, `✅ Credit/GB Rate: ${val} Credit = 1 GB`);
    return;
  }

  // Set credit key inbound
  if (isSettingCreditInbound(msg.from.id)) {
    clearCreditInbound(msg.from.id);
    const val = parseInt(msg.text.trim());
    if (isNaN(val) || val < 1) {
      await bot.sendMessage(msg.chat.id, '❌ Inbound ID ရိုက်ထည့်ပါ');
      return;
    }
    const { updateCreditSettings } = require('./vpn/creditManager');
    updateCreditSettings({ referralKeyInboundId: val });
    await bot.sendMessage(msg.chat.id, `✅ Credit Key Inbound ID: ${val}`);
    return;
  }

  // Set premium plans
  if (isSettingPremPlan(msg.from.id)) {
    clearPremPlan(msg.from.id);
    const lines = msg.text.trim().split('\n');
    const plans = [];
    for (const line of lines) {
      const parts = line.split(':');
      if (parts.length < 5) continue;
      plans.push({
        id: `cp_${parts[1].trim()}`,
        name: parts[0].trim(),
        dataGB: parseInt(parts[1]),
        days: parseInt(parts[2]),
        credits: parseFloat(parts[3]),
        ipLimit: parseInt(parts[4]),
      });
    }
    if (plans.length === 0) {
      await bot.sendMessage(msg.chat.id, '❌ Format: name:dataGB:days:credits:ipLimit\nExample: 100 GB:100:30:10:1');
      return;
    }
    const { updateCreditSettings } = require('./vpn/creditManager');
    updateCreditSettings({ premiumPlans: plans });
    await bot.sendMessage(msg.chat.id, `✅ Premium Plans (${plans.length}) updated!`);
    return;
  }

  // Create coupon
  if (isCreatingCoupon(msg.from.id)) {
    clearCreateCoupon(msg.from.id);
    const parts = msg.text.trim().split(/\s+/);
    if (parts.length < 3) {
      await bot.sendMessage(msg.chat.id, '❌ Format: CODE CREDITS MAX_USES');
      return;
    }
    const code = parts[0];
    const credits = parseFloat(parts[1]);
    const maxUses = parseInt(parts[2]);
    if (isNaN(credits) || isNaN(maxUses)) {
      await bot.sendMessage(msg.chat.id, '❌ Credits နဲ့ Max Uses numbers ဖြစ်ရမယ်');
      return;
    }
    const { createCoupon } = require('./vpn/creditManager');
    const coupon = createCoupon(code, credits, maxUses);
    if (!coupon) {
      await bot.sendMessage(msg.chat.id, '❌ Coupon code ရှိပြီးသားပါ');
      return;
    }
    await bot.sendMessage(msg.chat.id, `✅ Coupon ဆောက်ပြီး!\n🎟 Code: ${coupon.code}\n💰 Credits: ${coupon.credits}\n👥 Max Uses: ${coupon.maxUses}`);
    return;
  }

  // Delete coupon
  if (isDeletingCoupon(msg.from.id)) {
    clearDeleteCoupon(msg.from.id);
    const { deleteCoupon } = require('./vpn/creditManager');
    const result = deleteCoupon(msg.text.trim());
    if (result) {
      await bot.sendMessage(msg.chat.id, `✅ Coupon "${msg.text.trim()}" ဖျက်ပြီး!`);
    } else {
      await bot.sendMessage(msg.chat.id, `❌ Coupon "${msg.text.trim()}" မတွေ့ပါ`);
    }
    return;
  }

  // Custom trial GB input
  if (isSettingTrialGB(msg.from.id)) {
    clearTrialGB(msg.from.id);
    const gb = parseInt(msg.text.trim());
    if (isNaN(gb) || gb < 1 || gb > 10000) {
      await bot.sendMessage(msg.chat.id, '❌ 1 - 10000 GB ကြားထဲ ရိုက်ထည့်ပါ။');
      return;
    }
    const { updateTrialConfig } = require('./vpn/trialManager');
    updateTrialConfig({ totalGB: gb });
    await bot.sendMessage(msg.chat.id, `✅ Trial Data *${gb} GB* သို့ ပြောင်းပြီးပါပြီ!`, { parse_mode: 'Markdown' });
    return;
  }

  // Custom message setting
  if (isSettingCustomMsg(msg.from.id)) {
    clearCustomMsg(msg.from.id);
    const { updateTrialConfig } = require('./vpn/trialManager');
    const text = msg.text.trim();
    if (text.toLowerCase() === 'clear') {
      updateTrialConfig({ customMessage: '' });
      await bot.sendMessage(msg.chat.id, '✅ Custom message ဖျက်ပြီးပါပြီ!');
    } else {
      updateTrialConfig({ customMessage: text });
      await bot.sendMessage(msg.chat.id, `✅ Custom message သတ်မှတ်ပြီးပါပြီ!\n\n"${text}"`);
    }
    return;
  }

  // Key delete
  if (isDeletingKey(msg.from.id)) {
    clearKeyDelete(msg.from.id);
    const email = msg.text.trim();
    const { getAllPanels, getClient: getPanelClient } = require('./vpn/panelManager');
    try {
      let client = null;
      let panelName = '';

      // Search ALL panels
      const panels = getAllPanels();
      for (const p of panels) {
        try {
          const pc = getPanelClient(p.id);
          const clients = await pc.getAllClients();
          const found = clients.find(c => c.email === email);
          if (found) {
            client = found;
            panelName = p.name;
            break;
          }
        } catch (e) {
          console.error(`Panel ${p.name} search error:`, e.message);
        }
      }

      // Fallback: legacy xuiClient
      if (!client) {
        try {
          const xuiClient = require('./vpn/xuiClient');
          const clients = await xuiClient.getAllClients();
          const found = clients.find(c => c.email === email);
          if (found) {
            client = found;
            panelName = 'Default';
          }
        } catch (e) { /* ignore */ }
      }

      if (!client) {
        await bot.sendMessage(msg.chat.id, `❌ Client <code>${email}</code> not found in any panel.`, { parse_mode: 'HTML' });
        return;
      }
      const usedGB = ((client.up + client.down) / 1024 / 1024 / 1024).toFixed(2);
      const totalGB = client.total > 0 ? (client.total / 1024 / 1024 / 1024).toFixed(0) : '∞';
      await bot.sendMessage(msg.chat.id,
        `🗑 <b>Delete Confirm</b>\n\n` +
        `<b>Email:</b> <code>${email}</code>\n` +
        `<b>Data:</b> ${usedGB}/${totalGB} GB\n` +
        `<b>Panel:</b> ${panelName}\n` +
        `<b>Inbound:</b> ${client.inboundRemark || 'N/A'}\n\n` +
        `ဖျက်မှာ သေချာလား?`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ ဖျက်မယ်', callback_data: `confirm_delete_${email}` },
                { text: '❌ Cancel', callback_data: 'admin_menu' },
              ],
            ],
          },
        }
      );
    } catch (err) {
      await bot.sendMessage(msg.chat.id, `❌ Error: ${err.message}`);
    }
    return;
  }

  // Welcome message edit handler
  if (isWelcomeEdit(msg.from.id)) {
    clearWelcomeEdit(msg.from.id);
    const newText = msg.text.trim();
    setWelcomeText(newText);
    await bot.sendMessage(msg.chat.id,
      '<b>✅ Welcome Message ပြင်ပြီးပါပြီ!</b>\n\n<b>Preview:</b>\n' + newText.replace(/</g, '&lt;').replace(/>/g, '&gt;'),
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: '« Admin Menu', callback_data: 'admin_menu' }]] } }
    );
    return;
  }

  // Broadcast takes priority
    if (isBroadcasting(msg.from.id)) {
    clearBroadcast(msg.from.id);
    const users = getAllUsers();
    const userIds = Object.keys(users);
    let sent = 0;
    let failed = 0;
    const progressMsg = await bot.sendMessage(msg.chat.id,
      `📢 <b>Broadcasting...</b>\n\n👥 Total users: <b>${userIds.length}</b>\n⏳ Please wait...`,
      { parse_mode: 'HTML' }
    );
    for (const uid of userIds) {
      try {
        if (msg.photo) {
          const photoId = msg.photo[msg.photo.length - 1].file_id;
          await bot.sendPhoto(uid, photoId, {
            caption: msg.caption || '',
            parse_mode: 'HTML',
          });
        } else if (msg.video) {
          await bot.sendVideo(uid, msg.video.file_id, {
            caption: msg.caption || '',
            parse_mode: 'HTML',
          });
        } else if (msg.document) {
          await bot.sendDocument(uid, msg.document.file_id, {
            caption: msg.caption || '',
            parse_mode: 'HTML',
          });
        } else {
          await bot.sendMessage(uid, msg.text, {
            parse_mode: 'HTML',
            disable_web_page_preview: false,
          });
        }
        sent++;
        // Update progress every 50 users
        if (sent % 50 === 0) {
          await bot.editMessageText(
            `📢 <b>Broadcasting...</b>\n\n👥 Total: <b>${userIds.length}</b>\n✅ Sent: <b>${sent}</b>\n❌ Failed: <b>${failed}</b>\n⏳ Progress: ${Math.round((sent + failed) / userIds.length * 100)}%`,
            { chat_id: msg.chat.id, message_id: progressMsg.message_id, parse_mode: 'HTML' }
          ).catch(() => {});
        }
        // Rate limit: 30 msgs/sec max for Telegram API
        if (sent % 25 === 0) await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        failed++;
        console.error(`Broadcast failed for ${uid}: ${err.message}`);
      }
    }
    await bot.editMessageText(
      `📢 <b>Broadcast Complete!</b>\n\n` +
      `👥 Total: <b>${userIds.length}</b>\n` +
      `✅ Sent: <b>${sent}</b>\n` +
      `❌ Failed: <b>${failed}</b>\n` +
      `📊 Success Rate: <b>${userIds.length > 0 ? Math.round(sent / userIds.length * 100) : 0}%</b>`,
      { chat_id: msg.chat.id, message_id: progressMsg.message_id, parse_mode: 'HTML' }
    ).catch(() => {});
    return;
  }

  // Server admin message handling
  const serverHandled = await handleServerAdminMessage(bot, msg);
  if (serverHandled) return;

  // Panel admin message handling
  const panelHandled = await handlePanelAdminMessage(bot, msg);
  if (panelHandled) return;

  // XUI admin message handling
  const handled = await handleXuiAdminMessage(bot, msg);
  if (handled) return;
});

// ─── General Message Handler ─────────────────────────────────
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  if (isBanned(msg.from.id)) return;
  if (isAdmin(msg.from.id) && (isBroadcasting(msg.from.id) || isResettingTrial(msg.from.id) || isExtendingKey(msg.from.id) || isSettingCustomMsg(msg.from.id) || isDeletingKey(msg.from.id) || isSettingTrialGB(msg.from.id) || isSettingMaintMsg(msg.from.id) || isAddingCredit(msg.from.id) || isSettingRefCredit(msg.from.id) || isSettingCreditRate(msg.from.id) || isSettingCreditInbound(msg.from.id) || isSettingPremPlan(msg.from.id) || isCreatingCoupon(msg.from.id) || isDeletingCoupon(msg.from.id) || isBanningWithReason(msg.from.id) || getAdminState(msg.from.id) || isPanelAdminState(msg.from.id) || isServerAdminState(msg.from.id))) return;

  // Coupon redeem handler
  if (isCouponRedeem(msg.from.id)) {
    clearCouponRedeem(msg.from.id);
    const { redeemCoupon } = require('./vpn/creditManager');
    const result = redeemCoupon(msg.from.id, msg.text.trim());
    if (result.success) {
      const { getBalance } = require('./vpn/creditManager');
      const balance = getBalance(msg.from.id);
      await bot.sendMessage(msg.chat.id,
        `✅ Coupon ရရှိပါပြီ!\n💰 +${result.credits} Credit\n💰 Balance: ${balance}`,
        { reply_markup: getMainMenuKeyboard() }
      );
      logUserAction(bot, msg.from, '🎟 Coupon Redeemed', `Code: ${msg.text.trim()} | +${result.credits} Credit`);
    } else {
      await bot.sendMessage(msg.chat.id, `❌ ${result.msg}`, { reply_markup: getMainMenuKeyboard() });
    }
    return;
  }

  // Rating feedback handler
  if (isRatingFeedback(msg.from.id)) {
    clearRatingFeedback(msg.from.id);
    const fs = require('fs');
    const ratingsFile = './data/ratings.json';
    let ratings = {};
    try { ratings = JSON.parse(fs.readFileSync(ratingsFile, 'utf8')); } catch {}
    const uid = String(msg.from.id);
    if (ratings[uid]) {
      ratings[uid].feedback = msg.text.trim();
      fs.writeFileSync(ratingsFile, JSON.stringify(ratings, null, 2));
      logUserAction(bot, msg.from, '💬 Feedback', `${ratings[uid].stars}/5 stars | "${msg.text.trim()}"`);
      bot.sendMessage(msg.chat.id,
        `✅ Feedback ရေးပြီးပါပြီ! ကျေးဇူးတင်ပါတယ်!\n\n⭐ ${ratings[uid].stars}/5 | 💬 "${msg.text.trim()}"`,
        { reply_markup: getMainMenuKeyboard() }
      );
    } else {
      bot.sendMessage(msg.chat.id, '❌ Rating အရင်ပေးပါ။', { reply_markup: getMainMenuKeyboard() });
    }
    return;
  }

  bot.sendMessage(msg.chat.id,
    'Menu ကို အသုံးပြုပါ:',
    { reply_markup: getMainMenuKeyboard() }
  );
});

// ─── Error Handling ──────────────────────────────────────────
bot.on('polling_error', (error) => {
  console.error('Polling error:', error.code, error.message);
});

bot.on('error', (error) => {
  console.error('Bot error:', error.code, error.message);
});

// ─── Enhanced Error Logging to Log Channel ───────────────────
async function sendErrorToLogChannel(label, error) {
  const logCh = getLogChannel();
  if (!logCh) return;
  const now = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Yangon' });
  const errMsg = String(error && error.message ? error.message : error).substring(0, 800);
  const text =
    `⚠️ <b>Bot Error</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📌 <b>${label}</b>\n` +
    `🗓 ${now} MMT\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🚨 <code>${errMsg.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code>`;
  try {
    await bot.sendMessage(logCh, text, { parse_mode: 'HTML' });
  } catch (e) { /* silent */ }
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  sendErrorToLogChannel('Uncaught Exception', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  sendErrorToLogChannel('Unhandled Rejection', reason);
});
