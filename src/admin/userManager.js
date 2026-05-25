const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify({ users: {}, banned: [] }, null, 2));
  }
}

function loadData() {
  ensureFile();
  return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
}

function saveData(data) {
  ensureFile();
  fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

function registerUser(user) {
  const data = loadData();
  const userId = String(user.id);

  if (!data.users[userId]) {
    data.users[userId] = {
      id: user.id,
      firstName: user.first_name || '',
      lastName: user.last_name || '',
      username: user.username || '',
      joinedAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      totalKeys: 0,
      totalConfigs: 0,
    };
  } else {
    data.users[userId].lastActive = new Date().toISOString();
    data.users[userId].firstName = user.first_name || data.users[userId].firstName;
    data.users[userId].username = user.username || data.users[userId].username;
  }

  saveData(data);
  return data.users[userId];
}

function getUser(userId) {
  const data = loadData();
  return data.users[String(userId)] || null;
}

function getAllUsers() {
  const data = loadData();
  return data.users;
}

function getUserCount() {
  const data = loadData();
  return Object.keys(data.users).length;
}

function incrementStat(userId, stat) {
  const data = loadData();
  const id = String(userId);
  if (data.users[id]) {
    data.users[id][stat] = (data.users[id][stat] || 0) + 1;
    saveData(data);
  }
}

function banUser(userId) {
  const data = loadData();
  const id = String(userId);
  if (!data.banned) data.banned = [];
  if (!data.banned.includes(id)) {
    data.banned.push(id);
    saveData(data);
  }
  return true;
}

function unbanUser(userId) {
  const data = loadData();
  const id = String(userId);
  if (!data.banned) data.banned = [];
  data.banned = data.banned.filter((b) => b !== id);
  saveData(data);
  return true;
}

function isBanned(userId) {
  const data = loadData();
  if (!data.banned) return false;
  return data.banned.includes(String(userId));
}

function getBannedUsers() {
  const data = loadData();
  return data.banned || [];
}

function getStats() {
  const data = loadData();
  const users = Object.values(data.users);
  const totalUsers = users.length;
  const bannedCount = (data.banned || []).length;
  const totalKeys = users.reduce((sum, u) => sum + (u.totalKeys || 0), 0);
  const totalConfigs = users.reduce((sum, u) => sum + (u.totalConfigs || 0), 0);

  const now = new Date();
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const activeToday = users.filter((u) => new Date(u.lastActive) > oneDayAgo).length;

  return {
    totalUsers,
    bannedCount,
    activeToday,
    totalKeys,
    totalConfigs,
  };
}

module.exports = {
  registerUser,
  getUser,
  getAllUsers,
  getUserCount,
  incrementStat,
  banUser,
  unbanUser,
  isBanned,
  getBannedUsers,
  getStats,
};
