const axios = require('axios');
const crypto = require('crypto');

class XUIClient {
  constructor() {
    // Strip trailing slash to avoid double-slash in URL paths (supports subpath panels)
    this.baseUrl = (process.env.XUI_PANEL_URL || '').replace(/\/+$/, '');
    this.username = process.env.XUI_USERNAME || '';
    this.password = process.env.XUI_PASSWORD || '';
    this.cookie = null;
    this.cookieExpiry = null;
  }

  async login() {
    try {
      const res = await axios.post(`${this.baseUrl}/login`, 
        `username=${encodeURIComponent(this.username)}&password=${encodeURIComponent(this.password)}`,
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          maxRedirects: 0,
          validateStatus: (s) => s < 400,
        }
      );

      if (res.data.success) {
        const setCookie = res.headers['set-cookie'];
        if (setCookie) {
          this.cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
        }
        this.cookieExpiry = Date.now() + 3600000; // 1 hour
        return true;
      }
      return false;
    } catch (err) {
      console.error('X-UI Login error:', err.message);
      return false;
    }
  }

  async ensureLogin() {
    if (!this.cookie || !this.cookieExpiry || Date.now() > this.cookieExpiry) {
      return await this.login();
    }
    return true;
  }

  async request(method, path, data = null) {
    if (!await this.ensureLogin()) {
      throw new Error('Failed to login to X-UI panel');
    }

    try {
      const config = {
        method,
        url: `${this.baseUrl}${path}`,
        headers: { Cookie: this.cookie },
      };

      if (data) {
        config.data = data;
        config.headers['Content-Type'] = 'application/json';
      }

      const res = await axios(config);
      return res.data;
    } catch (err) {
      // Try re-login on 401
      if (err.response && err.response.status === 401) {
        this.cookie = null;
        if (await this.login()) {
          const config = {
            method,
            url: `${this.baseUrl}${path}`,
            headers: { Cookie: this.cookie },
          };
          if (data) {
            config.data = data;
            config.headers['Content-Type'] = 'application/json';
          }
          const res = await axios(config);
          return res.data;
        }
      }
      throw err;
    }
  }

  // ─── Server Status ─────────────────────────────────────────
  async getServerStatus() {
    return await this.request('get', '/xui/API/server/status');
  }

  // ─── Inbound Management ────────────────────────────────────
  async listInbounds() {
    // Returns array directly under 'obj' key
    const result = await this.request('get', '/xui/API/inbounds');
    // Normalize response: wrap array in {success, obj} if needed
    if (Array.isArray(result)) {
      return { success: true, obj: result };
    }
    return result;
  }

  async getInbound(id) {
    const result = await this.listInbounds();
    if (result.success && result.obj) {
      return result.obj.find((i) => i.id === id) || null;
    }
    return null;
  }

  async addInbound(inboundConfig) {
    return await this.request('post', '/xui/inbound/add', inboundConfig);
  }

  async deleteInbound(id) {
    return await this.request('post', `/xui/inbound/del/${id}`);
  }

  // ─── Client Management ─────────────────────────────────────
  async addClient(inboundId, clientConfig) {
    const data = {
      id: inboundId,
      settings: JSON.stringify({ clients: [clientConfig] }),
    };
    return await this.request('post', '/xui/inbound/addClient', data);
  }

  async deleteClient(inboundId, clientUuid) {
    return await this.request('post', `/xui/inbound/${inboundId}/delClient/${clientUuid}`);
  }

  async updateClient(clientUuid, inboundId, clientConfig) {
    // Use full inbound update approach (updateClient endpoint not supported on all x-ui versions)
    const inbound = await this.getInbound(inboundId);
    if (!inbound) throw new Error('Inbound not found');

    const settings = JSON.parse(inbound.settings);
    const clientIndex = settings.clients.findIndex((c) => c.id === clientUuid || c.email === clientConfig.email);
    if (clientIndex === -1) throw new Error('Client not found in inbound');

    // Update client fields
    const existing = settings.clients[clientIndex];
    for (const key of Object.keys(clientConfig)) {
      existing[key] = clientConfig[key];
    }

    const updateData = { ...inbound, settings: JSON.stringify(settings) };
    delete updateData.clientStats;
    return await this.request('post', `/xui/inbound/update/${inboundId}`, updateData);
  }

  async resetClientTraffic(inboundId, email) {
    return await this.request('post', `/xui/inbound/${inboundId}/resetClientTraffic/${email}`);
  }

  // ─── Helper: Create VMess Inbound ──────────────────────────
  async createVMessInbound(remark, port, options = {}) {
    const config = {
      up: 0,
      down: 0,
      total: 0,
      remark,
      enable: true,
      expiryTime: 0,
      listen: '',
      port,
      protocol: 'vmess',
      settings: JSON.stringify({
        clients: [],
        decryption: 'none',
        fallbacks: [],
      }),
      streamSettings: JSON.stringify({
        network: options.network || 'ws',
        security: options.security || 'none',
        wsSettings: {
          acceptProxyProtocol: false,
          path: options.path || '/vmess',
          headers: {},
        },
      }),
      sniffing: JSON.stringify({
        enabled: true,
        destOverride: ['http', 'tls', 'quic', 'fakedns'],
      }),
    };
    return await this.addInbound(config);
  }

  // ─── Helper: Create VLESS Inbound ──────────────────────────
  async createVLESSInbound(remark, port, options = {}) {
    const config = {
      up: 0,
      down: 0,
      total: 0,
      remark,
      enable: true,
      expiryTime: 0,
      listen: '',
      port,
      protocol: 'vless',
      settings: JSON.stringify({
        clients: [],
        decryption: 'none',
        fallbacks: [],
      }),
      streamSettings: JSON.stringify({
        network: options.network || 'ws',
        security: options.security || 'none',
        wsSettings: {
          acceptProxyProtocol: false,
          path: options.path || '/vless',
          headers: {},
        },
      }),
      sniffing: JSON.stringify({
        enabled: true,
        destOverride: ['http', 'tls', 'quic', 'fakedns'],
      }),
    };
    return await this.addInbound(config);
  }

  // ─── Helper: Create Shadowsocks Inbound ────────────────────
  async createShadowsocksInbound(remark, port, options = {}) {
    const method = options.method || 'aes-256-gcm';
    const password = options.password || crypto.randomBytes(16).toString('base64');

    const config = {
      up: 0,
      down: 0,
      total: 0,
      remark,
      enable: true,
      expiryTime: 0,
      listen: '',
      port,
      protocol: 'shadowsocks',
      settings: JSON.stringify({
        method,
        password,
        network: 'tcp,udp',
        clients: [],
      }),
      streamSettings: JSON.stringify({
        network: 'tcp',
        security: 'none',
        tcpSettings: {
          acceptProxyProtocol: false,
          header: { type: 'none' },
        },
      }),
      sniffing: JSON.stringify({
        enabled: true,
        destOverride: ['http', 'tls', 'quic', 'fakedns'],
      }),
    };
    return await this.addInbound(config);
  }

  // ─── Helper: Create Client for an Inbound ─────────────────
  createClientConfig(email, options = {}) {
    const uuid = crypto.randomUUID();
    const expiryTime = options.expiryDays
      ? Date.now() + options.expiryDays * 24 * 60 * 60 * 1000
      : 0;

    const config = {
      id: uuid,
      flow: '',
      email,
      limitIp: options.limitIp || 0,
      totalGB: options.totalGB || 0,
      expiryTime,
      enable: true,
      tgId: options.tgId || '',
      subId: options.subId || crypto.randomBytes(8).toString('hex'),
      reset: 0,
    };

    // For Shadowsocks, add password and method fields
    if (options.protocol === 'shadowsocks') {
      config.password = crypto.randomBytes(16).toString('base64');
      config.method = options.method || 'aes-256-gcm';
    }

    return config;
  }

  // ─── Helper: Generate config link from inbound + client ────
  generateLink(inbound, client, serverHost) {
    const protocol = inbound.protocol;
    const settings = JSON.parse(inbound.settings);
    const streamSettings = JSON.parse(inbound.streamSettings);

    if (protocol === 'vmess') {
      const vmessConfig = {
        v: '2',
        ps: `${inbound.remark}-${client.email}`,
        add: serverHost,
        port: String(inbound.port),
        id: client.id,
        aid: '0',
        scy: 'auto',
        net: streamSettings.network || 'ws',
        type: 'none',
        host: serverHost,
        path: streamSettings.wsSettings?.path || '/vmess',
        tls: streamSettings.security || 'none',
        sni: serverHost,
      };
      return 'vmess://' + Buffer.from(JSON.stringify(vmessConfig)).toString('base64');
    }

    if (protocol === 'vless') {
      const params = new URLSearchParams({
        type: streamSettings.network || 'ws',
        security: streamSettings.security || 'none',
        path: streamSettings.wsSettings?.path || '/vless',
        host: serverHost,
      });
      return `vless://${client.id}@${serverHost}:${inbound.port}?${params.toString()}#${encodeURIComponent(inbound.remark + '-' + client.email)}`;
    }

    if (protocol === 'shadowsocks') {
      const method = settings.method;
      const is2022 = method.includes('2022');

      let userinfo;
      if (is2022) {
        // 2022-blake3 methods: serverKey:clientKey
        const password = `${settings.password}:${client.password}`;
        userinfo = Buffer.from(`${method}:${password}`).toString('base64');
      } else {
        // Standard methods (aes-256-gcm etc): just client password
        userinfo = Buffer.from(`${method}:${client.password}`).toString('base64');
      }
      return `ss://${userinfo}@${serverHost}:${inbound.port}#${encodeURIComponent(inbound.remark + '-' + client.email)}`;
    }

    return null;
  }

  // ─── Get all clients across all inbounds ───────────────────
  async getAllClients() {
    const result = await this.listInbounds();
    if (!result.success) return [];

    const clients = [];
    for (const inbound of (result.obj || [])) {
      const settings = JSON.parse(inbound.settings);
      const clientStats = inbound.clientStats || [];

      for (const client of (settings.clients || [])) {
        // Merge with clientStats for traffic data
        const stats = clientStats.find((s) => s.email === client.email) || {};
        clients.push({
          ...client,
          up: stats.up || 0,
          down: stats.down || 0,
          total: client.totalGB || stats.total || 0,
          inboundId: inbound.id,
          inboundRemark: inbound.remark,
          protocol: inbound.protocol,
          port: inbound.port,
        });
      }
    }
    return clients;
  }
}

// Premium XUI Client (separate panel)
class PremiumXUIClient extends XUIClient {
  constructor() {
    super();
    // Strip trailing slash to avoid double-slash in URL paths (supports subpath panels)
    this.baseUrl = (process.env.PREMIUM_XUI_PANEL_URL || '').replace(/\/+$/, '');
    this.username = process.env.PREMIUM_XUI_USERNAME || '';
    this.password = process.env.PREMIUM_XUI_PASSWORD || '';
    this.cookie = null;
    this.cookieExpiry = null;
  }
}

const defaultClient = new XUIClient();
const premiumClient = new PremiumXUIClient();

module.exports = defaultClient;
module.exports.premiumClient = premiumClient;
module.exports.XUIClient = XUIClient;
