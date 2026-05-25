const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const CREDITS_FILE = path.join(DATA_DIR, 'credits.json');
const CREDIT_SETTINGS_FILE = path.join(DATA_DIR, 'credit_settings.json');
const COUPONS_FILE = path.join(DATA_DIR, 'coupons.json');

function ensureFile(file, defaultData) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(defaultData, null, 2));
  }
}

// ─── Credits ─────────────────────────────────────────────────

function loadCredits() {
  ensureFile(CREDITS_FILE, { users: {} });
  return JSON.parse(fs.readFileSync(CREDITS_FILE, 'utf8'));
}

function saveCredits(data) {
  ensureFile(CREDITS_FILE, { users: {} });
  fs.writeFileSync(CREDITS_FILE, JSON.stringify(data, null, 2));
}

function getUserCredits(userId) {
  const data = loadCredits();
  const id = String(userId);
  if (!data.users[id]) {
    data.users[id] = { balance: 0, history: [] };
    saveCredits(data);
  }
  return data.users[id];
}

function addCredits(userId, amount, reason = '') {
  const data = loadCredits();
  const id = String(userId);
  if (!data.users[id]) {
    data.users[id] = { balance: 0, history: [] };
  }
  data.users[id].balance = parseFloat((data.users[id].balance + amount).toFixed(2));
  data.users[id].history.push({
    type: 'add',
    amount,
    reason,
    date: new Date().toISOString(),
  });
  saveCredits(data);
  return data.users[id];
}

function deductCredits(userId, amount, reason = '') {
  const data = loadCredits();
  const id = String(userId);
  if (!data.users[id] || data.users[id].balance < amount) {
    return null;
  }
  data.users[id].balance = parseFloat((data.users[id].balance - amount).toFixed(2));
  data.users[id].history.push({
    type: 'deduct',
    amount,
    reason,
    date: new Date().toISOString(),
  });
  saveCredits(data);
  return data.users[id];
}

function getBalance(userId) {
  const user = getUserCredits(userId);
  return user.balance;
}

// ─── Credit Settings ─────────────────────────────────────────

const DEFAULT_CREDIT_SETTINGS = {
  referralCredit: 0.5,
  creditPerGB: 0.1,
  referralKeyInboundId: null,
  premiumPlans: [
    { id: 'cp_100', name: '100 GB', dataGB: 100, days: 30, credits: 10, ipLimit: 1 },
    { id: 'cp_250', name: '250 GB', dataGB: 250, days: 30, credits: 25, ipLimit: 2 },
    { id: 'cp_500', name: '500 GB', dataGB: 500, days: 30, credits: 50, ipLimit: 3 },
  ],
};

function loadCreditSettings() {
  ensureFile(CREDIT_SETTINGS_FILE, DEFAULT_CREDIT_SETTINGS);
  try {
    const data = JSON.parse(fs.readFileSync(CREDIT_SETTINGS_FILE, 'utf8'));
    return { ...DEFAULT_CREDIT_SETTINGS, ...data };
  } catch {
    return { ...DEFAULT_CREDIT_SETTINGS };
  }
}

function saveCreditSettings(settings) {
  ensureFile(CREDIT_SETTINGS_FILE, DEFAULT_CREDIT_SETTINGS);
  fs.writeFileSync(CREDIT_SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function getCreditSettings() {
  return loadCreditSettings();
}

function updateCreditSettings(updates) {
  const current = loadCreditSettings();
  const updated = { ...current, ...updates };
  saveCreditSettings(updated);
  return updated;
}

// ─── Coupons ─────────────────────────────────────────────────

function loadCoupons() {
  ensureFile(COUPONS_FILE, { coupons: [] });
  return JSON.parse(fs.readFileSync(COUPONS_FILE, 'utf8'));
}

function saveCoupons(data) {
  ensureFile(COUPONS_FILE, { coupons: [] });
  fs.writeFileSync(COUPONS_FILE, JSON.stringify(data, null, 2));
}

function createCoupon(code, credits, maxUses = 1, expiryDays = 0) {
  const data = loadCoupons();
  const existing = data.coupons.find(c => c.code.toLowerCase() === code.toLowerCase());
  if (existing) return null;

  const coupon = {
    code: code.toUpperCase(),
    credits,
    maxUses,
    usedBy: [],
    createdAt: new Date().toISOString(),
    expiresAt: expiryDays > 0 ? new Date(Date.now() + expiryDays * 86400000).toISOString() : null,
    active: true,
  };
  data.coupons.push(coupon);
  saveCoupons(data);
  return coupon;
}

function redeemCoupon(userId, code) {
  const data = loadCoupons();
  const coupon = data.coupons.find(c => c.code.toLowerCase() === code.toLowerCase());
  if (!coupon) return { success: false, msg: 'Coupon code မတွေ့ပါ' };
  if (!coupon.active) return { success: false, msg: 'Coupon code expire ဖြစ်ပါပြီ' };
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    coupon.active = false;
    saveCoupons(data);
    return { success: false, msg: 'Coupon code expire ဖြစ်ပါပြီ' };
  }
  if (coupon.usedBy.length >= coupon.maxUses) {
    coupon.active = false;
    saveCoupons(data);
    return { success: false, msg: 'Coupon code အကုန်သုံးပြီးပါပြီ' };
  }
  const uid = String(userId);
  if (coupon.usedBy.includes(uid)) {
    return { success: false, msg: 'Coupon code ကို သင်သုံးပြီးပါပြီ' };
  }

  coupon.usedBy.push(uid);
  if (coupon.usedBy.length >= coupon.maxUses) coupon.active = false;
  saveCoupons(data);

  addCredits(userId, coupon.credits, `Coupon: ${coupon.code}`);
  return { success: true, credits: coupon.credits };
}

function getAllCoupons() {
  const data = loadCoupons();
  return data.coupons;
}

function deleteCoupon(code) {
  const data = loadCoupons();
  const idx = data.coupons.findIndex(c => c.code.toLowerCase() === code.toLowerCase());
  if (idx === -1) return false;
  data.coupons.splice(idx, 1);
  saveCoupons(data);
  return true;
}

module.exports = {
  getUserCredits,
  addCredits,
  deductCredits,
  getBalance,
  getCreditSettings,
  updateCreditSettings,
  createCoupon,
  redeemCoupon,
  getAllCoupons,
  deleteCoupon,
};
