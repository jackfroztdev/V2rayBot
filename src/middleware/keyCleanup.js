const xuiClient = require('../vpn/xuiClient');

const ADMIN_ID = process.env.ADMIN_ID || '';

async function cleanupExpiredKeys(bot) {
  try {
    const result = await xuiClient.listInbounds();
    if (!result.success || !result.obj) return;

    const now = Date.now();
    let cleaned = 0;
    const cleanedList = [];

    for (const inbound of result.obj) {
      const settings = JSON.parse(inbound.settings);
      const clients = settings.clients || [];

      for (const client of clients) {
        if (client.expiryTime > 0 && client.expiryTime < now) {
          // Check if expired more than 3 days ago
          const expiredDaysAgo = (now - client.expiryTime) / (1000 * 60 * 60 * 24);
          if (expiredDaysAgo >= 3) {
            try {
              await xuiClient.deleteClient(inbound.id, client.id);
              cleaned++;
              cleanedList.push(client.email);

              // Notify user if tgId is set
              if (client.tgId) {
                try {
                  await bot.sendMessage(client.tgId,
                    `🗑 သက်တမ်းကုန်ပြီးသော VPN key ဖျက်ပြီးပါပြီ။\n\n` +
                    `Key: ${client.email}\n\n` +
                    `Key အသစ်လိုချင်ရင် /menu ကနေ ရယူနိုင်ပါတယ်။`
                  );
                } catch {}
              }
            } catch (err) {
              console.error(`Failed to delete expired client ${client.email}: ${err.message}`);
            }
          }
        }
      }
    }

    if (cleaned > 0 && ADMIN_ID) {
      await bot.sendMessage(ADMIN_ID,
        `🗑 <b>Expired Key Cleanup</b>\n\n` +
        `Expired key <b>${cleaned}</b> ခု ဖျက်ပြီးပါပြီ။\n\n` +
        cleanedList.map((e) => `• ${e}`).join('\n'),
        { parse_mode: 'HTML' }
      );
    }
  } catch (err) {
    console.error('Key cleanup failed:', err.message);
  }
}

function startKeyCleanupScheduler(bot) {
  // Run every 6 hours
  const interval = 6 * 60 * 60 * 1000;
  setInterval(() => cleanupExpiredKeys(bot), interval);

  // Run once on startup after 1 minute
  setTimeout(() => cleanupExpiredKeys(bot), 60 * 1000);

  console.log('Expired key cleanup scheduler started (every 6 hours)');
}

module.exports = {
  cleanupExpiredKeys,
  startKeyCleanupScheduler,
};
