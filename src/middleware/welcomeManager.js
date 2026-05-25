const fs = require('fs');
const path = require('path');

const WELCOME_FILE = path.join(__dirname, '../../data/welcome.json');

const DEFAULT_WELCOME = {
  text: `🔐 *VPN Key Bot*\n\nမင်္ဂလာပါ {name}! 👋\n\nဒီ Bot မှာ VPN Key ထုတ်ယူနိုင်ပါတယ်။\n\n🎁 *Trial Key* — Free trial key ထုတ်ယူရန်\n💎 *Premium Key* — Premium key ဝယ်ယူရန်\n📦 *My Key* — ယူထားတဲ့ key ပြန်ကြည့်ရန်\n👤 *My Account* — ကိုယ့်အကောင့် အချက်အလက်\n\nအောက်က menu ကနေ ရွေးချယ်ပါ 👇`,
};

function loadWelcome() {
  try {
    if (fs.existsSync(WELCOME_FILE)) {
      return JSON.parse(fs.readFileSync(WELCOME_FILE, 'utf8'));
    }
  } catch (e) { /* ignore */ }
  return { ...DEFAULT_WELCOME };
}

function saveWelcome(data) {
  const dir = path.dirname(WELCOME_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(WELCOME_FILE, JSON.stringify(data, null, 2));
}

function getWelcomeText(userName) {
  const data = loadWelcome();
  return (data.text || DEFAULT_WELCOME.text).replace(/{name}/g, userName || 'User');
}

function setWelcomeText(text) {
  const data = loadWelcome();
  data.text = text;
  saveWelcome(data);
}

function getWelcomeRaw() {
  const data = loadWelcome();
  return data.text || DEFAULT_WELCOME.text;
}

module.exports = { getWelcomeText, setWelcomeText, getWelcomeRaw };
