function getAdminMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '📊 Statistics', callback_data: 'admin_stats' },
        { text: '👥 Users', callback_data: 'admin_users' },
      ],
      [
        { text: '🖥 Manage Servers', callback_data: 'admin_servers' },
        { text: '📢 Broadcast', callback_data: 'admin_broadcast' },
      ],
      [
        { text: '🖥 Panels', callback_data: 'pm_list' },
        { text: '🌐 X-UI Panel', callback_data: 'xui_menu' },
      ],
      [
        { text: '🚫 Banned Users', callback_data: 'admin_banned' },
      ],
      [
        { text: '💰 Orders', callback_data: 'admin_orders' },
        { text: '🎁 Trial Control', callback_data: 'admin_trial_control' },
      ],
      [
        { text: '💎 Premium Control', callback_data: 'admin_premium_control' },
      ],
      [
        { text: '🔑 Key Extend', callback_data: 'admin_key_extend' },
        { text: '🗑 Key Delete', callback_data: 'admin_key_delete' },
      ],
      [
        { text: '🧹 Delete Expired Keys', callback_data: 'admin_delete_expired' },
      ],
      [
        { text: '📊 Daily Stats', callback_data: 'admin_daily_stats' },
        { text: '⭐ Ratings', callback_data: 'admin_ratings' },
      ],
      [
        { text: '💰 Credit Manage', callback_data: 'admin_credit_manage' },
        { text: '🎟 Coupon Manage', callback_data: 'admin_coupon_manage' },
      ],
      [
        { text: '💾 Backup', callback_data: 'admin_backup' },
        { text: '🔧 Maintenance', callback_data: 'admin_maintenance' },
      ],
      [
        { text: '✏️ Welcome Message', callback_data: 'admin_welcome_edit' },
      ],
      [{ text: '« Main Menu', callback_data: 'back_to_menu' }],
    ],
  };
}

function getAdminServerKeyboard(servers) {
  const typeIcon = { trial: '🎁', premium: '💎', both: '🔷' };
  const buttons = servers.map((s) => [
    {
      text: `${s.status === 'online' ? '🟢' : '🔴'} ${typeIcon[s.type] || '🖥'} ${s.name}`,
      callback_data: `admsrv_${s.id}`,
    },
  ]);
  buttons.push([{ text: '➕ Server ထည့်မယ်', callback_data: 'admsrv_add' }]);
  buttons.push([{ text: '« Admin Menu', callback_data: 'admin_menu' }]);
  return { inline_keyboard: buttons };
}

function getAdminServerActionsKeyboard(serverId) {
  return {
    inline_keyboard: [
      [
        { text: '✏️ Name ပြင်', callback_data: `admsrv_ename_${serverId}` },
        { text: '🔄 Type ပြောင်း', callback_data: `admsrv_chtype_${serverId}` },
      ],
      [
        { text: '🔗 Panel ချိတ်', callback_data: `admsrv_linkpanel_${serverId}` },
        { text: '📋 Inbound ရွေး', callback_data: `admsrv_linkinb_${serverId}` },
      ],
      [
        { text: '🟢 Online', callback_data: `admsrvset_online_${serverId}` },
        { text: '🔴 Offline', callback_data: `admsrvset_offline_${serverId}` },
      ],
      [
        { text: '🗑 ဖျက်မယ်', callback_data: `admsrvdel_${serverId}` },
      ],
      [{ text: '« Servers', callback_data: 'admin_servers' }],
    ],
  };
}

function getUserActionsKeyboard(userId) {
  return {
    inline_keyboard: [
      [
        { text: '🚫 Ban', callback_data: `admin_ban_${userId}` },
        { text: '✅ Unban', callback_data: `admin_unban_${userId}` },
      ],
      [{ text: '« Back to Users', callback_data: 'admin_users' }],
    ],
  };
}

function getAdminBackKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '« Admin Menu', callback_data: 'admin_menu' }],
    ],
  };
}

module.exports = {
  getAdminMenuKeyboard,
  getAdminServerKeyboard,
  getAdminServerActionsKeyboard,
  getUserActionsKeyboard,
  getAdminBackKeyboard,
};
