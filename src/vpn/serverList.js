const fs = require('fs');
const path = require('path');

const SERVERS_FILE = path.join(__dirname, '../../data/servers.json');

function loadServers() {
  if (!fs.existsSync(SERVERS_FILE)) {
    const defaultServers = { servers: [] };
    const dir = path.dirname(SERVERS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SERVERS_FILE, JSON.stringify(defaultServers, null, 2));
    return defaultServers;
  }
  return JSON.parse(fs.readFileSync(SERVERS_FILE, 'utf8'));
}

function saveServers(data) {
  const dir = path.dirname(SERVERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SERVERS_FILE, JSON.stringify(data, null, 2));
}

function getServerList() {
  return loadServers().servers;
}

function getServerById(id) {
  return getServerList().find((s) => s.id === id) || null;
}

function getOnlineServers() {
  return getServerList().filter((s) => s.status === 'online');
}

function getServersByProtocol(protocol) {
  return getOnlineServers().filter((s) => s.protocols && s.protocols.includes(protocol));
}

function addServer(serverData) {
  const data = loadServers();
  const maxId = data.servers.reduce((max, s) => Math.max(max, s.id), 0);
  const newServer = {
    id: maxId + 1,
    name: serverData.name || 'New Server',
    host: serverData.host || '',
    port: serverData.port || 443,
    country: serverData.country || '',
    status: 'online',
    protocols: serverData.protocols || ['vmess', 'vless', 'shadowsocks'],
    panelId: serverData.panelId || null,
    inboundId: serverData.inboundId || null,
    type: serverData.type || 'trial',
    createdAt: new Date().toISOString(),
  };
  data.servers.push(newServer);
  saveServers(data);
  return newServer;
}

function updateServer(serverId, updates) {
  const data = loadServers();
  const server = data.servers.find((s) => s.id === serverId);
  if (!server) return null;
  for (const key of Object.keys(updates)) {
    if (key !== 'id') server[key] = updates[key];
  }
  server.updatedAt = new Date().toISOString();
  saveServers(data);
  return server;
}

function removeServer(serverId) {
  const data = loadServers();
  const before = data.servers.length;
  data.servers = data.servers.filter((s) => s.id !== serverId);
  if (data.servers.length < before) {
    saveServers(data);
    return true;
  }
  return false;
}

function getTrialServers() {
  return getServerList().filter((s) => s.type === 'trial' || s.type === 'both');
}

function getPremiumServers() {
  return getServerList().filter((s) => s.type === 'premium' || s.type === 'both');
}

function getCountryFlag(code) {
  const flags = {
    SG: '🇸🇬', JP: '🇯🇵', US: '🇺🇸', DE: '🇩🇪', HK: '🇭🇰',
    KR: '🇰🇷', TW: '🇹🇼', GB: '🇬🇧', FR: '🇫🇷', NL: '🇳🇱',
    CA: '🇨🇦', AU: '🇦🇺', IN: '🇮🇳', BR: '🇧🇷', RU: '🇷🇺',
    MM: '🇲🇲', TH: '🇹🇭', VN: '🇻🇳', ID: '🇮🇩', PH: '🇵🇭',
  };
  return flags[code] || '🌐';
}

function formatServerList(servers) {
  if (servers.length === 0) return 'No servers available.';

  let text = '🖥 *VPN Server List*\n\n';
  servers.forEach((s) => {
    const flag = getCountryFlag(s.country);
    const status = s.status === 'online' ? '🟢' : '🔴';
    text += `${status} ${flag} *${s.name}*\n`;
    if (s.host) text += `   Host: \`${s.host}\`\n`;
    if (s.port) text += `   Port: \`${s.port}\`\n`;
    if (s.protocols && s.protocols.length > 0) {
      text += `   Protocols: ${s.protocols.join(', ')}\n`;
    }
    text += '\n';
  });
  return text;
}

module.exports = {
  getServerList,
  getServerById,
  getOnlineServers,
  getServersByProtocol,
  addServer,
  updateServer,
  removeServer,
  getTrialServers,
  getPremiumServers,
  getCountryFlag,
  formatServerList,
};
