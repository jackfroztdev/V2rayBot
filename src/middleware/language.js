const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const LANG_FILE = path.join(DATA_DIR, 'languages.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(LANG_FILE)) fs.writeFileSync(LANG_FILE, JSON.stringify({}, null, 2));
}

function loadLangs() {
  ensureFile();
  return JSON.parse(fs.readFileSync(LANG_FILE, 'utf8'));
}

function saveLangs(data) {
  ensureFile();
  fs.writeFileSync(LANG_FILE, JSON.stringify(data, null, 2));
}

function getUserLang(userId) {
  const data = loadLangs();
  return data[String(userId)] || 'mm';
}

function setUserLang(userId, lang) {
  const data = loadLangs();
  data[String(userId)] = lang;
  saveLangs(data);
}

const translations = {
  mm: {
    welcome: '🔐 *VPN Key Bot*\n\nရွေးချယ်ပါ:',
    trial_key: '🎁 Trial Key',
    premium_key: '💎 Premium Key',
    my_key: '📦 My Key',
    referral: '👥 Referral',
    my_account: '👤 My Account',
    rating: '⭐ Rating',
    contact_admin: '📞 Admin ဆက်သွယ်ရန်',
    credit: '💰 Credit',
    coupon: '🎟 Coupon',
    language: '🌐 Language',
    back: '« Back to Menu',
    trial_used: '❌ Trial key ကို တစ်ကြိမ်သာ ထုတ်ခွင့်ရှိပါတယ်။',
    trial_generating: '⏳ Trial key ထုတ်ပေးနေပါတယ်...',
    trial_success: '🎁 Trial Key ရရှိပါပြီ!',
    credit_balance: '💰 Credit Balance',
    credit_exchange: '🔄 Credit နဲ့ Key လဲမယ်',
    premium_buy_credit: '💎 Credit နဲ့ Premium ဝယ်မယ်',
    coupon_redeem: '🎟 Coupon Code ထည့်မယ်',
    no_credit: '❌ Credit မလုံလောက်ပါ',
    speed_test: '🚀 Speed Test',
    blacklist_reason: 'Ban အကြောင်းပြချက်',
  },
  en: {
    welcome: '🔐 *VPN Key Bot*\n\nSelect an option:',
    trial_key: '🎁 Trial Key',
    premium_key: '💎 Premium Key',
    my_key: '📦 My Key',
    referral: '👥 Referral',
    my_account: '👤 My Account',
    rating: '⭐ Rating',
    contact_admin: '📞 Contact Admin',
    credit: '💰 Credit',
    coupon: '🎟 Coupon',
    language: '🌐 Language',
    back: '« Back to Menu',
    trial_used: '❌ You can only claim trial key once.',
    trial_generating: '⏳ Generating trial key...',
    trial_success: '🎁 Trial Key Received!',
    credit_balance: '💰 Credit Balance',
    credit_exchange: '🔄 Exchange Credit for Key',
    premium_buy_credit: '💎 Buy Premium with Credit',
    coupon_redeem: '🎟 Redeem Coupon Code',
    no_credit: '❌ Insufficient credits',
    speed_test: '🚀 Speed Test',
    blacklist_reason: 'Ban reason',
  },
};

function t(userId, key) {
  const lang = getUserLang(userId);
  return (translations[lang] && translations[lang][key]) || translations.mm[key] || key;
}

module.exports = {
  getUserLang,
  setUserLang,
  t,
  translations,
};
