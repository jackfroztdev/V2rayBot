const fs = require('fs');
const path = require('path');
const xuiClient = require('./xuiClient');
const { addCredits, getCreditSettings } = require('./creditManager');

const DATA_DIR = path.join(__dirname, '../../data');
const REFERRAL_FILE = path.join(DATA_DIR, 'referrals.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(REFERRAL_FILE)) {
    fs.writeFileSync(REFERRAL_FILE, JSON.stringify({ referrals: {} }, null, 2));
  }
}

function loadReferrals() {
  ensureFile();
  return JSON.parse(fs.readFileSync(REFERRAL_FILE, 'utf8'));
}

function saveReferrals(data) {
  ensureFile();
  fs.writeFileSync(REFERRAL_FILE, JSON.stringify(data, null, 2));
}

function getUserReferral(userId) {
  const data = loadReferrals();
  const id = String(userId);
  if (!data.referrals[id]) {
    data.referrals[id] = {
      referralCode: `ref_${id}`,
      invitedUsers: [],
      bonusClaimed: 0,
      totalBonusGB: 0,
      totalCreditsEarned: 0,
    };
    saveReferrals(data);
  }
  return data.referrals[id];
}

function getReferralCode(userId) {
  const ref = getUserReferral(userId);
  return ref.referralCode;
}

function recordReferral(referrerId, newUserId, newUserName) {
  const data = loadReferrals();
  const id = String(referrerId);

  if (!data.referrals[id]) {
    data.referrals[id] = {
      referralCode: `ref_${id}`,
      invitedUsers: [],
      bonusClaimed: 0,
      totalBonusGB: 0,
      totalCreditsEarned: 0,
    };
  }

  if (data.referrals[id].invitedUsers.some((u) => u.userId === String(newUserId))) {
    return false;
  }

  data.referrals[id].invitedUsers.push({
    userId: String(newUserId),
    name: newUserName,
    joinedAt: new Date().toISOString(),
  });

  // Auto add credit for referral
  const settings = getCreditSettings();
  const creditAmount = settings.referralCredit || 0.5;
  addCredits(referrerId, creditAmount, `Referral: ${newUserName}`);
  data.referrals[id].totalCreditsEarned = (data.referrals[id].totalCreditsEarned || 0) + creditAmount;

  saveReferrals(data);
  return true;
}

function findReferrerByCode(code) {
  const data = loadReferrals();
  for (const userId of Object.keys(data.referrals)) {
    if (data.referrals[userId].referralCode === code) {
      return userId;
    }
  }
  return null;
}

function getReferralConfig() {
  const settings = getCreditSettings();
  return {
    referralCredit: settings.referralCredit || 0.5,
    creditPerGB: settings.creditPerGB || 0.1,
  };
}

module.exports = {
  getUserReferral,
  getReferralCode,
  recordReferral,
  findReferrerByCode,
  getReferralConfig,
};
