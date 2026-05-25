const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '../../data/premium_config.json');

const DEFAULT_CONFIG = {
  protocols: {
    shadowsocks: { label: '🔒 Shadowsocks', servers: [] },
    vless: { label: '⚡ VLESS', servers: [] },
    vmess: { label: '🌐 VMess', servers: [] },
  },
};

function loadConfig() {
  const dir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }
  const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  // Ensure all protocols exist
  for (const proto of ['shadowsocks', 'vless', 'vmess']) {
    if (!data.protocols[proto]) {
      data.protocols[proto] = DEFAULT_CONFIG.protocols[proto];
    }
  }
  return data;
}

function saveConfig(data) {
  const dir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
}

function getProtocolServers(protocol) {
  const config = loadConfig();
  return (config.protocols[protocol] && config.protocols[protocol].servers) || [];
}

function addProtocolServer(protocol, serverEntry) {
  const config = loadConfig();
  if (!config.protocols[protocol]) return null;
  const maxId = config.protocols[protocol].servers.reduce((max, s) => Math.max(max, s.id || 0), 0);
  const entry = {
    id: maxId + 1,
    name: serverEntry.name || 'New Server',
    panelId: serverEntry.panelId || null,
    inboundId: serverEntry.inboundId || null,
    status: 'online',
    createdAt: new Date().toISOString(),
  };
  config.protocols[protocol].servers.push(entry);
  saveConfig(config);
  return entry;
}

function getProtocolServerById(protocol, serverId) {
  const servers = getProtocolServers(protocol);
  return servers.find(s => s.id === serverId) || null;
}

function updateProtocolServer(protocol, serverId, updates) {
  const config = loadConfig();
  if (!config.protocols[protocol]) return null;
  const server = config.protocols[protocol].servers.find(s => s.id === serverId);
  if (!server) return null;
  for (const key of Object.keys(updates)) {
    if (key !== 'id') server[key] = updates[key];
  }
  server.updatedAt = new Date().toISOString();
  saveConfig(config);
  return server;
}

function removeProtocolServer(protocol, serverId) {
  const config = loadConfig();
  if (!config.protocols[protocol]) return false;
  const before = config.protocols[protocol].servers.length;
  config.protocols[protocol].servers = config.protocols[protocol].servers.filter(s => s.id !== serverId);
  if (config.protocols[protocol].servers.length < before) {
    saveConfig(config);
    return true;
  }
  return false;
}

function getProtocolLabel(protocol) {
  const labels = {
    shadowsocks: '🔒 Shadowsocks',
    vless: '⚡ VLESS',
    vmess: '🌐 VMess',
  };
  return labels[protocol] || protocol;
}

function getAllProtocols() {
  return ['shadowsocks', 'vless', 'vmess'];
}

module.exports = {
  getProtocolServers,
  addProtocolServer,
  getProtocolServerById,
  updateProtocolServer,
  removeProtocolServer,
  getProtocolLabel,
  getAllProtocols,
};
