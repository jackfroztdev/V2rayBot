const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map((id) => id.trim()).filter(Boolean);

function isAdmin(userId) {
  return ADMIN_IDS.includes(String(userId));
}

function requireAdmin(bot, msg) {
  if (!isAdmin(msg.from.id)) {
    bot.sendMessage(msg.chat.id, '⛔ You are not authorized to use admin commands.');
    return false;
  }
  return true;
}

function getAdminIds() {
  return ADMIN_IDS;
}

module.exports = { isAdmin, requireAdmin, getAdminIds };
