const fs = require('fs');
const path = require('path');
const { XUIClient } = require('./xuiClient');

const DATA_DIR = path.join(__dirname, '../../data');
const PANELS_FILE = path.join(DATA_DIR, 'panels.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PANELS_FILE)) {
    const initial = { panels: [] };

    // Import from env vars on first run
    if (process.env.XUI_PANEL_URL) {
      initial.panels.push({
        id: 'panel_trial_default',
        name: 'Trial Panel',
        url: process.env.XUI_PANEL_URL,
        username: process.env.XUI_USERNAME || '',
        password: process.env.XUI_PASSWORD || '',
        serverHost: process.env.XUI_SERVER_HOST || '',
        type: 'trial',
        status: 'online',
        createdAt: new Date().toISOString(),
      });
    }
    if (process.env.PREMIUM_XUI_PANEL_URL) {
      initial.panels.push({
        id: 'panel_premium_default',
        name: 'Premium Panel',
        url: process.env.PREMIUM_XUI_PANEL_URL,
        username: process.env.PREMIUM_XUI_USERNAME || '',
        password: process.env.PREMIUM_XUI_PASSWORD || '',
        serverHost: process.env.PREMIUM_XUI_SERVER_HOST || '',
        type: 'premium',
        status: 'online',
        createdAt: new Date().toISOString(),
      });
    }

    fs.writeFileSync(PANELS_FILE, JSON.stringify(initial, null, 2));
  }
}

function loadPanels() {
  ensureFile();
  return JSON.parse(fs.readFileSync(PANELS_FILE, 'utf8'));
}

function savePanels(data) {
  ensureFile();
  fs.writeFileSync(PANELS_FILE, JSON.stringify(data, null, 2));
}

function getAllPanels() {
  return loadPanels().panels;
}

function getPanel(panelId) {
  const data = loadPanels();
  return data.panels.find((p) => p.id === panelId) || null;
}

function getTrialPanels() {
  return getAllPanels().filter((p) => p.type === 'trial' || p.type === 'both');
}

function getPremiumPanels() {
  return getAllPanels().filter((p) => p.type === 'premium' || p.type === 'both');
}

function addPanel(panel) {
  const data = loadPanels();
  const id = `panel_${Date.now()}`;
  const newPanel = {
    id,
    name: panel.name || 'New Panel',
    url: panel.url || '',
    username: panel.username || '',
    password: panel.password || '',
    serverHost: panel.serverHost || '',
    type: panel.type || 'trial',
    status: 'online',
    createdAt: new Date().toISOString(),
  };
  data.panels.push(newPanel);
  savePanels(data);
  return newPanel;
}

function updatePanel(panelId, updates) {
  const data = loadPanels();
  const index = data.panels.findIndex((p) => p.id === panelId);
  if (index === -1) return null;

  for (const key of Object.keys(updates)) {
    if (key !== 'id') {
      data.panels[index][key] = updates[key];
    }
  }
  data.panels[index].updatedAt = new Date().toISOString();
  savePanels(data);
  return data.panels[index];
}

function removePanel(panelId) {
  const data = loadPanels();
  const before = data.panels.length;
  data.panels = data.panels.filter((p) => p.id !== panelId);
  if (data.panels.length < before) {
    savePanels(data);
    return true;
  }
  return false;
}

// XUIClient instance cache
const clientCache = new Map();

function getClient(panelId) {
  const panel = getPanel(panelId);
  if (!panel) return null;

  const cacheKey = `${panel.id}_${panel.url}_${panel.username}`;
  if (clientCache.has(cacheKey)) {
    return clientCache.get(cacheKey);
  }

  const client = new XUIClient({
    url: panel.url,
    username: panel.username,
    password: panel.password,
  });
  clientCache.set(cacheKey, client);
  return client;
}

function clearClientCache(panelId) {
  for (const key of clientCache.keys()) {
    if (key.startsWith(panelId + '_')) {
      clientCache.delete(key);
    }
  }
}

function getFirstTrialPanel() {
  const panels = getTrialPanels();
  return panels.length > 0 ? panels[0] : null;
}

function getFirstPremiumPanel() {
  const panels = getPremiumPanels();
  return panels.length > 0 ? panels[0] : null;
}

module.exports = {
  getAllPanels,
  getPanel,
  getTrialPanels,
  getPremiumPanels,
  addPanel,
  updatePanel,
  removePanel,
  getClient,
  clearClientCache,
  getFirstTrialPanel,
  getFirstPremiumPanel,
};
