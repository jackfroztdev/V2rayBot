const fs = require('fs');
const path = require('path');

const SERVERS_FILE = path.join(__dirname, '../../data/servers.json');

function loadServers() {
  if (!fs.existsSync(SERVERS_FILE)) {
    const defaultServers = {
      servers: [
        {
          id: 1,
          name: 'Singapore 1',
          host: 'sg1.example.com',
          port: 443,
          country: 'SG',
          status: 'online',
          protocols: ['vmess', 'vless', 'shadowsocks'],
        },
        {
          id: 2,
          name: 'Japan 1',
          host: 'jp1.example.com',
          port: 443,
          country: 'JP',
          status: 'online',
          protocols: ['vmess', 'vless', 'shadowsocks'],
        },
        {
          id: 3,
          name: 'US West 1',
          host: 'usw1.example.com',
          port: 443,
          country: 'US',
          status: 'online',
          protocols: ['vmess', 'vless', 'shadowsocks'],
        },
        {
          id: 4,
          name: 'Germany 1',
          host: 'de1.example.com',
          port: 443,
          country: 'DE',
          status: 'online',
          protocols: ['vmess', 'vless'],
        },
        {
          id: 5,
          name: 'Hong Kong 1',
          host: 'hk1.example.com',
          port: 443,
          country: 'HK',
          status: 'online',
          protocols: ['vmess', 'vless', 'shadowsocks'],
        },
      ],
    };
    fs.writeFileSync(SERVERS_FILE, JSON.stringify(defaultServers, null, 2));
    return defaultServers;
  }
  return JSON.parse(fs.readFileSync(SERVERS_FILE, 'utf8'));
}

function getServerList() {
  const data = loadServers();
  return data.servers;
}

function getServerById(id) {
  const servers = getServerList();
  return servers.find((s) => s.id === id) || null;
}

function getOnlineServers() {
  const servers = getServerList();
  return servers.filter((s) => s.status === 'online');
}

function getServersByProtocol(protocol) {
  const servers = getOnlineServers();
  return servers.filter((s) => s.protocols.includes(protocol));
}

function getCountryFlag(code) {
  const flags = {
    SG: '🇸🇬', JP: '🇯🇵', US: '🇺🇸', DE: '🇩🇪', HK: '🇭🇰',
    KR: '🇰🇷', TW: '🇹🇼', GB: '🇬🇧', FR: '🇫🇷', NL: '🇳🇱',
    CA: '🇨🇦', AU: '🇦🇺', IN: '🇮🇳', BR: '🇧🇷', RU: '🇷🇺',
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
    text += `   Host: \`${s.host}\`\n`;
    text += `   Port: \`${s.port}\`\n`;
    text += `   Protocols: ${s.protocols.join(', ')}\n\n`;
  });
  return text;
}

module.exports = {
  getServerList,
  getServerById,
  getOnlineServers,
  getServersByProtocol,
  getCountryFlag,
  formatServerList,
};
