const fs = require('fs');
const path = require('path');
const LOG_CHANNEL_FILE = path.join(__dirname, '../../data/log-channel.json');

function getLogChannel() {
  // First check file-based config (set via /setchannel)
  try {
    if (fs.existsSync(LOG_CHANNEL_FILE)) {
      const data = JSON.parse(fs.readFileSync(LOG_CHANNEL_FILE, 'utf8'));
      if (data.channelId) return data.channelId;
    }
  } catch (e) { /* ignore */ }
  // Fall back to env var
  return process.env.USER_LOG_CHANNEL || '';
}

function setLogChannel(channelId) {
  const dir = path.dirname(LOG_CHANNEL_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LOG_CHANNEL_FILE, JSON.stringify({ channelId }, null, 2));
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function logUserAction(bot, user, action, details = '') {
  const LOG_CHANNEL = getLogChannel();
  if (!LOG_CHANNEL) return;

  const userId = user.id || user;
  const firstName = escapeHtml(user.first_name || '');
  const lastName = escapeHtml(user.last_name || '');
  const username = user.username ? `@${escapeHtml(user.username)}` : 'N/A';
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Unknown';
  const langCode = user.language_code || 'N/A';

  const now = new Date();
  const timeStr = now.toLocaleString('en-GB', { timeZone: 'Asia/Yangon' });
  const dateStr = now.toLocaleDateString('en-GB', { timeZone: 'Asia/Yangon' });
  const timeOnly = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Yangon', hour12: true });

  // Action type icon
  let actionIcon = '📌';
  if (action.includes('Trial')) actionIcon = '🎁';
  else if (action.includes('Premium') || action.includes('Order')) actionIcon = '💎';
  else if (action.includes('Referral')) actionIcon = '👥';
  else if (action.includes('Key')) actionIcon = '🔑';
  else if (action.includes('Start')) actionIcon = '🚀';
  else if (action.includes('Account')) actionIcon = '👤';

  const userLink = user.username
    ? `<a href="https://t.me/${escapeHtml(user.username)}">${fullName}</a>`
    : fullName;

  const text =
    `📋 <b>User Log</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 ${userLink}\n` +
    `🔗 ${username} | <code>${userId}</code>\n` +
    `🌐 Lang: ${langCode}\n` +
    `📅 ${dateStr} | 🕐 ${timeOnly} MMT\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `${actionIcon} <b>${escapeHtml(action)}</b>\n` +
    (details ? `\n📝 ${escapeHtml(details)}` : '');

  try {
    await bot.sendMessage(LOG_CHANNEL, text, { parse_mode: 'HTML', disable_web_page_preview: true });
  } catch (err) {
    console.error('Failed to send user log:', err.message);
  }
}

function isLoggingEnabled() {
  return !!getLogChannel();
}

// Rating feedback state
const feedbackState = {};

function setRatingFeedbackState(userId) {
  feedbackState[String(userId)] = true;
}

function isRatingFeedback(userId) {
  return feedbackState[String(userId)] === true;
}

function clearRatingFeedback(userId) {
  delete feedbackState[String(userId)];
}

// Coupon redeem state
const couponState = {};
function setCouponRedeemState(userId) { couponState[String(userId)] = true; }
function isCouponRedeem(userId) { return couponState[String(userId)] === true; }
function clearCouponRedeem(userId) { delete couponState[String(userId)]; }

async function logKeyClaimWithQR(bot, user, keyData, keyType = 'Trial') {
  const LOG_CHANNEL = getLogChannel();
  if (!LOG_CHANNEL) return;

  const userId = user.id || user;
  const firstName = escapeHtml(user.first_name || '');
  const lastName = escapeHtml(user.last_name || '');
  const username = user.username ? `@${escapeHtml(user.username)}` : 'N/A';
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Unknown';

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { timeZone: 'Asia/Yangon' });
  const timeOnly = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Yangon', hour12: true });

  const userLink = user.username
    ? `<a href="https://t.me/${escapeHtml(user.username)}">${fullName}</a>`
    : fullName;

  const icon = keyType === 'Trial' ? '🎁' : '💎';

  const caption =
    `${icon} <b>${keyType} Key Claimed</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `👤 ${userLink}\n` +
    `🔗 ${username} | <code>${userId}</code>\n` +
    `📅 ${dateStr} | 🕐 ${timeOnly} MMT\n` +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `📧 <b>Email:</b> <code>${escapeHtml(keyData.email || '')}</code>\n` +
    `📦 <b>Data:</b> ${keyData.dataGB || 0} GB\n` +
    `📅 <b>Expiry:</b> ${keyData.expiryDate || 'N/A'}\n` +
    `📱 <b>Device:</b> ${keyData.ipLimit || 'N/A'}\n` +
    (keyData.inbound ? `🌐 <b>Inbound:</b> ${escapeHtml(keyData.inbound)}\n` : '') +
    `━━━━━━━━━━━━━━━━━━━━\n` +
    `🔗 <b>Config:</b>\n<code>${escapeHtml(keyData.link || '')}</code>`;

  try {
    const QRCode = require('qrcode');
    const qrBuffer = await QRCode.toBuffer(keyData.link, { width: 300, margin: 2 });
    await bot.sendPhoto(LOG_CHANNEL, qrBuffer, {
      caption,
      parse_mode: 'HTML',
    });
  } catch (err) {
    try {
      await bot.sendMessage(LOG_CHANNEL, caption, { parse_mode: 'HTML', disable_web_page_preview: true });
    } catch (e) {
      console.error('Failed to send key claim log:', e.message);
    }
  }
}

module.exports = {
  logUserAction,
  isLoggingEnabled,
  setRatingFeedbackState,
  isRatingFeedback,
  clearRatingFeedback,
  setCouponRedeemState,
  isCouponRedeem,
  clearCouponRedeem,
  logKeyClaimWithQR,
  setLogChannel,
  getLogChannel,
};
