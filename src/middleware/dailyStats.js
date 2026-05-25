const { getAllUsers, getStats } = require('../admin/userManager');
const xuiClient = require('../vpn/xuiClient');
const { getAdminIds } = require('../admin/auth');

async function sendDailyStats(bot) {
  const adminIds = getAdminIds();
  if (adminIds.length === 0) return;

  try {
    const stats = getStats();
    const users = getAllUsers();
    const userIds = Object.keys(users);

    // Count today's new users
    const today = new Date().toISOString().split('T')[0];
    let newToday = 0;
    for (const uid of userIds) {
      const u = users[uid];
      if (u.joinedAt && u.joinedAt.startsWith(today)) {
        newToday++;
      }
    }

    // Get active keys from X-UI
    let activeKeys = 0;
    let expiredKeys = 0;
    let totalUsedGB = 0;
    try {
      const clients = await xuiClient.getAllClients();
      const now = Date.now();
      for (const c of clients) {
        if (c.expiryTime > 0 && c.expiryTime < now) {
          expiredKeys++;
        } else if (c.enable) {
          activeKeys++;
        }
        totalUsedGB += ((c.up || 0) + (c.down || 0)) / 1024 / 1024 / 1024;
      }
    } catch {}

    const now = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Yangon' });

    const text =
      `📊 <b>Daily Stats Report</b>\n` +
      `📅 ${now} (MMT)\n\n` +
      `👥 <b>Users:</b>\n` +
      `  Total: <b>${stats.totalUsers}</b>\n` +
      `  New Today: <b>${newToday}</b>\n` +
      `  Active Today: <b>${stats.activeToday}</b>\n` +
      `  Banned: <b>${stats.bannedCount}</b>\n\n` +
      `🔑 <b>Keys:</b>\n` +
      `  Active: <b>${activeKeys}</b>\n` +
      `  Expired: <b>${expiredKeys}</b>\n\n` +
      `📦 <b>Total Data Used:</b> ${totalUsedGB.toFixed(2)} GB`;

    for (const adminId of adminIds) {
      await bot.sendMessage(adminId, text, { parse_mode: 'HTML' });
    }
  } catch (err) {
    console.error('Daily stats report failed:', err.message);
  }
}

function startDailyStatsScheduler(bot) {
  // Send stats every day at 9:00 PM MMT (14:30 UTC)
  const checkInterval = 60 * 1000; // Check every minute

  setInterval(() => {
    const now = new Date();
    const mmtHour = (now.getUTCHours() + 6) % 24 + (now.getUTCMinutes() + 30 >= 60 ? 1 : 0);
    const mmtMin = (now.getUTCMinutes() + 30) % 60;

    // Send at 21:00 MMT
    if (mmtHour === 21 && mmtMin === 0) {
      sendDailyStats(bot);
    }
  }, checkInterval);

  console.log('Daily stats scheduler started (sends at 9:00 PM MMT)');
}

module.exports = {
  sendDailyStats,
  startDailyStatsScheduler,
};
