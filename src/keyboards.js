function getMainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🎁 Trial Key', callback_data: 'trial_key' },
        { text: '💎 Premium Key', callback_data: 'premium_menu' },
      ],
      [
        { text: '📦 My Key', callback_data: 'menu_mykey' },
        { text: '👥 Referral', callback_data: 'referral_menu' },
      ],
      [
        { text: '💰 Credit', callback_data: 'credit_menu' },
        { text: '🎟 Coupon', callback_data: 'coupon_menu' },
      ],
      [
        { text: '👤 My Account', callback_data: 'my_account' },
        { text: '⭐ Rating', callback_data: 'rating_menu' },
      ],
      [
        { text: '🚀 Speed Test', callback_data: 'speed_test' },
        { text: '🌐 Language', callback_data: 'language_menu' },
      ],
      [
        { text: '📞 Admin ဆက်သွယ်ရန်', callback_data: 'contact_admin' },
      ],
    ],
  };
}

function getBackKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '« Back to Menu', callback_data: 'back_to_menu' }],
    ],
  };
}

module.exports = {
  getMainMenuKeyboard,
  getBackKeyboard,
};
