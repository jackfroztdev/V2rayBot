const fs = require('fs');
const path = require('path');
const xuiClient = require('./xuiClient');
const { getFirstPremiumPanel, getClient } = require('./panelManager');

const DATA_DIR = path.join(__dirname, '../../data');
const PREMIUM_FILE = path.join(DATA_DIR, 'premium.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

const PREMIUM_PLANS = [
  {
    id: 'plan_a',
    name: 'Plan A',
    dataGB: 100,
    days: 30,
    price: 4000,
    ipLimit: 1,
  },
  {
    id: 'plan_b',
    name: 'Plan B',
    dataGB: 250,
    days: 30,
    price: 6000,
    ipLimit: 2,
  },
  {
    id: 'plan_c',
    name: 'Plan C',
    dataGB: 500,
    days: 30,
    price: 10000,
    ipLimit: 3,
  },
];

function ensureFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PREMIUM_FILE)) {
    fs.writeFileSync(PREMIUM_FILE, JSON.stringify({ keys: {} }, null, 2));
  }
  if (!fs.existsSync(ORDERS_FILE)) {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify({ orders: {} }, null, 2));
  }
}

function loadOrders() {
  ensureFiles();
  return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8'));
}

function saveOrders(data) {
  ensureFiles();
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(data, null, 2));
}

function loadPremiumKeys() {
  ensureFiles();
  return JSON.parse(fs.readFileSync(PREMIUM_FILE, 'utf8'));
}

function savePremiumKeys(data) {
  ensureFiles();
  fs.writeFileSync(PREMIUM_FILE, JSON.stringify(data, null, 2));
}

function getPlans() {
  return PREMIUM_PLANS;
}

function getPlan(planId) {
  return PREMIUM_PLANS.find((p) => p.id === planId) || null;
}

function createOrder(userId, planId) {
  const plan = getPlan(planId);
  if (!plan) return null;

  const orderId = `ORD${Date.now()}`;
  const data = loadOrders();

  const order = {
    orderId,
    userId: String(userId),
    planId,
    planName: plan.name,
    price: plan.price,
    dataGB: plan.dataGB,
    days: plan.days,
    ipLimit: plan.ipLimit,
    status: 'pending',
    createdAt: new Date().toISOString(),
    screenshot: null,
    approvedAt: null,
  };

  if (!data.orders[String(userId)]) {
    data.orders[String(userId)] = [];
  }
  data.orders[String(userId)].push(order);
  saveOrders(data);

  return order;
}

function getUserOrders(userId) {
  const data = loadOrders();
  return data.orders[String(userId)] || [];
}

function getAllPendingOrders() {
  const data = loadOrders();
  const pending = [];
  for (const userId of Object.keys(data.orders)) {
    for (const order of data.orders[userId]) {
      if (order.status === 'pending') {
        pending.push(order);
      }
    }
  }
  return pending;
}

function updateOrderScreenshot(userId, orderId, fileId) {
  const data = loadOrders();
  const orders = data.orders[String(userId)] || [];
  const order = orders.find((o) => o.orderId === orderId);
  if (order) {
    order.screenshot = fileId;
    saveOrders(data);
    return true;
  }
  return false;
}

function getOrder(userId, orderId) {
  const data = loadOrders();
  const orders = data.orders[String(userId)] || [];
  return orders.find((o) => o.orderId === orderId) || null;
}

function getOrderById(orderId) {
  const data = loadOrders();
  for (const userId of Object.keys(data.orders)) {
    const order = data.orders[userId].find((o) => o.orderId === orderId);
    if (order) return order;
  }
  return null;
}

async function approveOrder(orderId) {
  const data = loadOrders();

  for (const userId of Object.keys(data.orders)) {
    const order = data.orders[userId].find((o) => o.orderId === orderId);
    if (!order) continue;
    if (order.status !== 'pending') return { success: false, msg: 'Order is not pending' };

    const plan = getPlan(order.planId);
    if (!plan) return { success: false, msg: 'Plan not found' };

    try {
      // Find first configured premium server with panel + inbound (check all protocols)
      const { getAllProtocols, getProtocolServers } = require('./premiumConfig');
      const { getPanel: getPanelById } = require('./panelManager');
      let premServers = [];
      for (const proto of getAllProtocols()) {
        premServers = premServers.concat(getProtocolServers(proto).filter(s => s.panelId && s.inboundId && s.status === 'online'));
      }

      if (premServers.length === 0) {
        return { success: false, msg: 'No premium server configured with panel/inbound' };
      }

      const server = premServers[0];
      const panel = getPanelById(server.panelId);
      const activeClient = panel ? getClient(panel.id) : xuiClient;
      const serverHost = panel ? panel.serverHost : (process.env.XUI_SERVER_HOST || '');

      const inbound = await activeClient.getInbound(server.inboundId);
      if (!inbound) return { success: false, msg: 'Inbound not found on panel' };

      const crypto = require('crypto');
      const shortId = crypto.randomBytes(3).toString('hex');
      const email = `premium_${userId}_${shortId}`;
      const inboundSettings = JSON.parse(inbound.settings);
      const clientConfig = activeClient.createClientConfig(email, {
        expiryDays: plan.days,
        totalGB: plan.dataGB * 1024 * 1024 * 1024,
        limitIp: plan.ipLimit,
        tgId: String(userId),
        protocol: inbound.protocol,
        method: inboundSettings.method || 'aes-256-gcm',
      });

      const res = await activeClient.addClient(server.inboundId, clientConfig);
      if (!res.success) return { success: false, msg: res.msg || 'Failed to create key' };

      const link = activeClient.generateLink(inbound, clientConfig, serverHost);

      order.status = 'approved';
      order.approvedAt = new Date().toISOString();
      order.email = email;
      order.link = link;
      saveOrders(data);

      const premData = loadPremiumKeys();
      if (!premData.keys[userId]) {
        premData.keys[userId] = [];
      }
      premData.keys[userId].push({
        email, link, planId: plan.id, planName: plan.name,
        dataGB: plan.dataGB, days: plan.days, orderId,
        server: server.name, serverHost, inboundId: server.inboundId,
        panelId: server.panelId, protocol: inbound.protocol,
        createdAt: new Date().toISOString(),
      });
      savePremiumKeys(premData);

      return { success: true, order, link, userId };
    } catch (err) {
      return { success: false, msg: err.message };
    }
  }

  return { success: false, msg: 'Order not found' };
}

function rejectOrder(orderId, reason) {
  const data = loadOrders();
  for (const userId of Object.keys(data.orders)) {
    const order = data.orders[userId].find((o) => o.orderId === orderId);
    if (order) {
      order.status = 'rejected';
      order.rejectedAt = new Date().toISOString();
      order.rejectReason = reason || '';
      saveOrders(data);
      return { success: true, order, userId };
    }
  }
  return { success: false, msg: 'Order not found' };
}

function getUserPremiumKeys(userId) {
  const premData = loadPremiumKeys();
  return premData.keys[String(userId)] || [];
}

function savePremiumKey(userId, keyData) {
  const premData = loadPremiumKeys();
  const id = String(userId);
  if (!premData.keys[id]) {
    premData.keys[id] = [];
  }
  premData.keys[id].push({
    ...keyData,
    createdAt: new Date().toISOString(),
  });
  savePremiumKeys(premData);
}

function removePremiumKeyByEmail(email) {
  const premData = loadPremiumKeys();
  let removed = false;
  for (const uid of Object.keys(premData.keys)) {
    const before = premData.keys[uid].length;
    premData.keys[uid] = premData.keys[uid].filter(k => k.email !== email);
    if (premData.keys[uid].length < before) removed = true;
  }
  if (removed) savePremiumKeys(premData);
  return removed;
}

module.exports = {
  getPlans,
  getPlan,
  createOrder,
  getUserOrders,
  getAllPendingOrders,
  updateOrderScreenshot,
  getOrder,
  getOrderById,
  approveOrder,
  rejectOrder,
  getUserPremiumKeys,
  savePremiumKey,
  removePremiumKeyByEmail,
};
