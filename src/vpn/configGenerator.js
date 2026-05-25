const { generateUUID, generatePassword, generateBase64Key, generateShadowsocksPassword } = require('./keyGenerator');

// ─── VMess Config ────────────────────────────────────────────
function generateVMessConfig(server, options = {}) {
  const uuid = options.uuid || generateUUID();
  const alterId = options.alterId || 0;
  const network = options.network || 'ws';
  const path = options.path || '/vmess';
  const tls = options.tls || 'tls';

  const config = {
    v: '2',
    ps: server.name,
    add: server.host,
    port: String(server.port),
    id: uuid,
    aid: String(alterId),
    scy: 'auto',
    net: network,
    type: 'none',
    host: server.host,
    path: path,
    tls: tls,
    sni: server.host,
  };

  const vmessLink = 'vmess://' + Buffer.from(JSON.stringify(config)).toString('base64');

  return {
    type: 'vmess',
    uuid,
    server: server.host,
    port: server.port,
    config,
    link: vmessLink,
  };
}

// ─── VLESS Config ────────────────────────────────────────────
function generateVLESSConfig(server, options = {}) {
  const uuid = options.uuid || generateUUID();
  const encryption = options.encryption || 'none';
  const network = options.network || 'ws';
  const security = options.security || 'tls';
  const path = options.path || '/vless';

  const params = new URLSearchParams({
    encryption,
    security,
    type: network,
    host: server.host,
    path: path,
    sni: server.host,
  });

  const vlessLink = `vless://${uuid}@${server.host}:${server.port}?${params.toString()}#${encodeURIComponent(server.name)}`;

  return {
    type: 'vless',
    uuid,
    server: server.host,
    port: server.port,
    link: vlessLink,
    config: {
      uuid,
      address: server.host,
      port: server.port,
      encryption,
      network,
      security,
      path,
      sni: server.host,
    },
  };
}

// ─── Shadowsocks Config ──────────────────────────────────────
function generateShadowsocksConfig(server, options = {}) {
  const method = options.method || 'aes-256-gcm';
  const password = options.password || generateShadowsocksPassword(method);

  const userinfo = Buffer.from(`${method}:${password}`).toString('base64');
  const ssLink = `ss://${userinfo}@${server.host}:${server.port}#${encodeURIComponent(server.name)}`;

  return {
    type: 'shadowsocks',
    method,
    password,
    server: server.host,
    port: server.port,
    link: ssLink,
    config: {
      server: server.host,
      server_port: server.port,
      password,
      method,
      local_address: '127.0.0.1',
      local_port: 1080,
      timeout: 300,
    },
  };
}

// ─── V2Ray Full JSON Config ──────────────────────────────────
function generateV2RayClientConfig(server, protocol, options = {}) {
  const uuid = options.uuid || generateUUID();

  const baseConfig = {
    log: { loglevel: 'warning' },
    inbounds: [
      {
        tag: 'socks',
        port: 10808,
        listen: '127.0.0.1',
        protocol: 'socks',
        settings: { auth: 'noauth', udp: true },
      },
      {
        tag: 'http',
        port: 10809,
        listen: '127.0.0.1',
        protocol: 'http',
        settings: { allowTransparent: false },
      },
    ],
    outbounds: [],
    routing: {
      rules: [
        { type: 'field', ip: ['geoip:private'], outboundTag: 'direct' },
      ],
    },
  };

  if (protocol === 'vmess') {
    baseConfig.outbounds.push({
      tag: 'proxy',
      protocol: 'vmess',
      settings: {
        vnext: [
          {
            address: server.host,
            port: server.port,
            users: [{ id: uuid, alterId: 0, security: 'auto' }],
          },
        ],
      },
      streamSettings: {
        network: 'ws',
        security: 'tls',
        wsSettings: { path: '/vmess', headers: { Host: server.host } },
        tlsSettings: { serverName: server.host },
      },
    });
  } else if (protocol === 'vless') {
    baseConfig.outbounds.push({
      tag: 'proxy',
      protocol: 'vless',
      settings: {
        vnext: [
          {
            address: server.host,
            port: server.port,
            users: [{ id: uuid, encryption: 'none' }],
          },
        ],
      },
      streamSettings: {
        network: 'ws',
        security: 'tls',
        wsSettings: { path: '/vless', headers: { Host: server.host } },
        tlsSettings: { serverName: server.host },
      },
    });
  } else if (protocol === 'shadowsocks') {
    const method = options.method || 'aes-256-gcm';
    const password = options.password || generateShadowsocksPassword(method);
    baseConfig.outbounds.push({
      tag: 'proxy',
      protocol: 'shadowsocks',
      settings: {
        servers: [
          {
            address: server.host,
            port: server.port,
            method,
            password,
          },
        ],
      },
    });
  }

  baseConfig.outbounds.push({ tag: 'direct', protocol: 'freedom' });

  return baseConfig;
}

// ─── Format config as text for Telegram ──────────────────────
function formatConfigMessage(configResult) {
  const { type, link, config } = configResult;
  let text = `🔐 *${type.toUpperCase()} Config*\n\n`;

  if (type === 'vmess') {
    text += `*UUID:* \`${configResult.uuid}\`\n`;
    text += `*Server:* \`${configResult.server}\`\n`;
    text += `*Port:* \`${configResult.port}\`\n\n`;
  } else if (type === 'vless') {
    text += `*UUID:* \`${configResult.uuid}\`\n`;
    text += `*Server:* \`${configResult.server}\`\n`;
    text += `*Port:* \`${configResult.port}\`\n\n`;
  } else if (type === 'shadowsocks') {
    text += `*Method:* \`${configResult.method}\`\n`;
    text += `*Password:* \`${configResult.password}\`\n`;
    text += `*Server:* \`${configResult.server}\`\n`;
    text += `*Port:* \`${configResult.port}\`\n\n`;
  }

  text += `📋 *Import Link:*\n\`${link}\`\n\n`;
  text += `_Copy the link above and import it into your VPN client._`;

  return text;
}

module.exports = {
  generateVMessConfig,
  generateVLESSConfig,
  generateShadowsocksConfig,
  generateV2RayClientConfig,
  formatConfigMessage,
};
