const xuiClient = require('../vpn/xuiClient');
const { getTrialInfo } = require('../vpn/trialManager');
const { getUserPremiumKeys } = require('../vpn/premiumManager');
const { getAllUsers } = require('../admin/userManager');

const ALERT_THRESHOLDS = [80, 90, 95];
const alerted = new Map(); // userId -> Set of thresholds already alerted

async function checkUsageAlerts(bot) {
  try {
    const clients = await xuiClient.getAllClients();
    const users = getAllUsers();

    for (const userId of Object.keys(users)) {
      const userEmails = [];

      // Collect trial key emails
      const trialInfo = getTrialInfo(userId);
      if (trialInfo && trialInfo.keys) {
        for (const key of trialInfo.keys) {
          userEmails.push(key.email);
        }
      }

      // Collect premium key emails
      const premiumKeys = getUserPremiumKeys(userId);
      for (const key of premiumKeys) {
        userEmails.push(key.email);
      }

      for (const email of userEmails) {
        const client = clients.find((c) => c.email === email);
        if (!client || client.total <= 0) continue;

        const usedBytes = (client.up || 0) + (client.down || 0);
        const usedPercent = (usedBytes / client.total) * 100;

        const alertKey = `${userId}_${email}`;
        if (!alerted.has(alertKey)) {
          alerted.set(alertKey, new Set());
        }
        const alertedSet = alerted.get(alertKey);

        for (const threshold of ALERT_THRESHOLDS) {
          if (usedPercent >= threshold && !alertedSet.has(threshold)) {
            alertedSet.add(threshold);

            const usedGB = (usedBytes / 1024 / 1024 / 1024).toFixed(2);
            const totalGB = (client.total / 1024 / 1024 / 1024).toFixed(0);
            const remainGB = ((client.total - usedBytes) / 1024 / 1024 / 1024).toFixed(2);

            try {
              await bot.sendMessage(userId,
                `⚠️ *Data Usage Alert*\n\n` +
                `သင့် VPN key data *${threshold}%* ပြည့်ပါပြီ!\n\n` +
                `📊 *Used:* ${usedGB} GB / ${totalGB} GB\n` +
                `📦 *Remaining:* ${remainGB} GB\n\n` +
                `_Data ကုန်ရင် VPN အလုပ်မလုပ်တော့ပါ။_\n` +
                `_Premium key ဝယ်ယူဖို့ /menu ကနေ 💎 Premium Key ကို နှိပ်ပါ။_`,
                { parse_mode: 'Markdown' }
              );
            } catch {
              // User may have blocked the bot
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('Usage alert check failed:', err.message);
  }
}

function startUsageAlertScheduler(bot) {
  // Check every 30 minutes
  const interval = parseInt(process.env.USAGE_CHECK_INTERVAL) || 30;
  setInterval(() => checkUsageAlerts(bot), interval * 60 * 1000);
  console.log(`Usage alert scheduler started (every ${interval} min)`);
}

module.exports = {
  checkUsageAlerts,
  startUsageAlertScheduler,
};
