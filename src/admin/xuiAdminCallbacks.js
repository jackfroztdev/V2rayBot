const { isAdmin } = require('./auth');
const xuiClient = require('../vpn/xuiClient');
const {
  getXuiMenuKeyboard,
  getXuiInboundListKeyboard,
  getXuiInboundActionsKeyboard,
  getXuiCreateInboundKeyboard,
  getXuiClientListKeyboard,
  getXuiBackKeyboard,
} = require('./xuiKeyboards');

// State for multi-step flows
const adminState = {};

function setAdminState(userId, state) {
  adminState[String(userId)] = state;
}

function getAdminState(userId) {
  return adminState[String(userId)] || null;
}

function clearAdminState(userId) {
  delete adminState[String(userId)];
}

async function handleXuiCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const userId = String(query.from.id);
  const data = query.data;

  if (!isAdmin(query.from.id)) {
    bot.answerCallbackQuery(query.id, { text: '⛔ Not authorized' });
    return;
  }

  bot.answerCallbackQuery(query.id);

  // ─── X-UI Menu ─────────────────────────────────────────────
  if (data === 'xui_menu') {
    return bot.editMessageText('🌐 *X-UI Panel Management*', {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: getXuiMenuKeyboard(),
    });
  }

  // ─── Server Status ─────────────────────────────────────────
  if (data === 'xui_status') {
    try {
      const res = await xuiClient.getServerStatus();
      if (!res.success) throw new Error('Failed');

      const s = res.obj;
      const memUsed = (s.mem.current / 1024 / 1024).toFixed(0);
      const memTotal = (s.mem.total / 1024 / 1024).toFixed(0);
      const diskUsed = (s.disk.current / 1024 / 1024 / 1024).toFixed(1);
      const diskTotal = (s.disk.total / 1024 / 1024 / 1024).toFixed(1);

      const text =
        `🖥 *X-UI Server Status*\n\n` +
        `*Xray:* ${s.xray.state} (v${s.xray.version})\n` +
        `*CPU:* ${s.cpu.toFixed(1)}% (${s.cpuCount} cores)\n` +
        `*Memory:* ${memUsed}MB / ${memTotal}MB\n` +
        `*Disk:* ${diskUsed}GB / ${diskTotal}GB\n` +
        `*TCP:* ${s.tcpCount} | *UDP:* ${s.udpCount}\n` +
        `*Hostname:* ${s.hostInfo.hostname}\n` +
        `*IP:* \`${s.hostInfo.ipv4.trim()}\``;

      return bot.editMessageText(text, {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: getXuiBackKeyboard(),
      });
    } catch (err) {
      return bot.editMessageText(`❌ Error: ${err.message}`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: getXuiBackKeyboard(),
      });
    }
  }

  // ─── List Inbounds ─────────────────────────────────────────
  if (data === 'xui_inbounds') {
    try {
      const res = await xuiClient.listInbounds();
      if (!res.success) throw new Error('Failed to list inbounds');

      const inbounds = res.obj || [];
      if (inbounds.length === 0) {
        return bot.editMessageText(
          '📋 *Inbounds*\n\nNo inbounds found. Create one first!',
          {
            chat_id: chatId, message_id: messageId,
            parse_mode: 'Markdown',
            reply_markup: getXuiCreateInboundKeyboard(),
          }
        );
      }

      let text = `📋 *Inbounds* (${inbounds.length})\n\n`;
      inbounds.forEach((ib) => {
        const settings = JSON.parse(ib.settings);
        const clientCount = (settings.clients || []).length;
        const status = ib.enable ? '🟢' : '🔴';
        text += `${status} *${ib.remark}* — ${ib.protocol} :${ib.port} (${clientCount} clients)\n`;
      });

      return bot.editMessageText(text, {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: getXuiInboundListKeyboard(inbounds),
      });
    } catch (err) {
      return bot.editMessageText(`❌ Error: ${err.message}`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: getXuiBackKeyboard(),
      });
    }
  }

  // ─── Inbound Details ───────────────────────────────────────
  if (data.startsWith('xui_ib_')) {
    const inboundId = parseInt(data.replace('xui_ib_', ''));
    try {
      const inbound = await xuiClient.getInbound(inboundId);
      if (!inbound) throw new Error('Inbound not found');

      const settings = JSON.parse(inbound.settings);
      const clients = settings.clients || [];
      const up = (inbound.up / 1024 / 1024 / 1024).toFixed(2);
      const down = (inbound.down / 1024 / 1024 / 1024).toFixed(2);

      let text =
        `📋 *${inbound.remark}*\n\n` +
        `*Protocol:* ${inbound.protocol}\n` +
        `*Port:* ${inbound.port}\n` +
        `*Status:* ${inbound.enable ? '🟢 Active' : '🔴 Disabled'}\n` +
        `*Upload:* ${up} GB\n` +
        `*Download:* ${down} GB\n` +
        `*Clients:* ${clients.length}\n`;

      if (clients.length > 0) {
        text += `\n*Client List:*\n`;
        clients.forEach((c) => {
          const expiry = c.expiryTime > 0
            ? new Date(c.expiryTime).toLocaleDateString()
            : 'Unlimited';
          text += `• \`${c.email}\` — Expires: ${expiry}\n`;
        });
      }

      return bot.editMessageText(text, {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: getXuiInboundActionsKeyboard(inboundId),
      });
    } catch (err) {
      return bot.editMessageText(`❌ Error: ${err.message}`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: getXuiBackKeyboard(),
      });
    }
  }

  // ─── Add Client to Inbound ─────────────────────────────────
  if (data.startsWith('xui_addclient_')) {
    const inboundId = parseInt(data.replace('xui_addclient_', ''));
    setAdminState(userId, { action: 'add_client', inboundId });

    return bot.editMessageText(
      '👤 *Add Client*\n\n' +
      'Send client details:\n\n' +
      '`email|expiryDays|dataLimitGB|ipLimit`\n\n' +
      'Example: `user1|30|50|2`\n' +
      '(30 days, 50GB, 2 device limit)\n\n' +
      'Or just send email: `user1`\n(unlimited)',
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: getXuiBackKeyboard(),
      }
    );
  }

  // ─── Delete Client ─────────────────────────────────────────
  if (data.startsWith('xui_delclient_')) {
    const parts = data.replace('xui_delclient_', '').split('_');
    const inboundId = parseInt(parts[0]);
    const clientUuid = parts.slice(1).join('_');

    try {
      const res = await xuiClient.deleteClient(inboundId, clientUuid);
      if (res.success) {
        return bot.editMessageText('✅ Client deleted successfully.', {
          chat_id: chatId, message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: getXuiBackKeyboard(),
        });
      }
      throw new Error(res.msg || 'Failed to delete client');
    } catch (err) {
      return bot.editMessageText(`❌ Error: ${err.message}`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: getXuiBackKeyboard(),
      });
    }
  }

  // ─── View Clients of Inbound ───────────────────────────────
  if (data.startsWith('xui_clients_')) {
    const inboundId = parseInt(data.replace('xui_clients_', ''));
    try {
      const inbound = await xuiClient.getInbound(inboundId);
      if (!inbound) throw new Error('Inbound not found');

      const settings = JSON.parse(inbound.settings);
      const clients = settings.clients || [];

      if (clients.length === 0) {
        return bot.editMessageText('No clients in this inbound.', {
          chat_id: chatId, message_id: messageId,
          reply_markup: getXuiInboundActionsKeyboard(inboundId),
        });
      }

      return bot.editMessageText(`👥 *Clients — ${inbound.remark}*`, {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: getXuiClientListKeyboard(inboundId, clients),
      });
    } catch (err) {
      return bot.editMessageText(`❌ Error: ${err.message}`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: getXuiBackKeyboard(),
      });
    }
  }

  // ─── Get Client Config Link ────────────────────────────────
  if (data.startsWith('xui_link_')) {
    const parts = data.replace('xui_link_', '').split('_');
    const inboundId = parseInt(parts[0]);
    const clientUuid = parts.slice(1).join('_');

    try {
      const inbound = await xuiClient.getInbound(inboundId);
      if (!inbound) throw new Error('Inbound not found');

      const settings = JSON.parse(inbound.settings);
      const client = (settings.clients || []).find((c) => c.id === clientUuid);
      if (!client) throw new Error('Client not found');

      const serverHost = process.env.XUI_SERVER_HOST || '178.128.80.123';
      const link = xuiClient.generateLink(inbound, client, serverHost);

      const expiry = client.expiryTime > 0
        ? new Date(client.expiryTime).toLocaleString()
        : 'Unlimited';

      const text =
        `🔗 *Config Link*\n\n` +
        `*Client:* ${client.email}\n` +
        `*Protocol:* ${inbound.protocol}\n` +
        `*Expiry:* ${expiry}\n\n` +
        `\`${link}\`\n\n` +
        `_Copy and import into your VPN client._`;

      return bot.editMessageText(text, {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: getXuiInboundActionsKeyboard(inboundId),
      });
    } catch (err) {
      return bot.editMessageText(`❌ Error: ${err.message}`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: getXuiBackKeyboard(),
      });
    }
  }

  // ─── Create Inbound Menus ──────────────────────────────────
  if (data === 'xui_create_inbound') {
    return bot.editMessageText('➕ *Create Inbound*\n\nChoose protocol:', {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: getXuiCreateInboundKeyboard(),
    });
  }

  if (data.startsWith('xui_newinb_')) {
    const protocol = data.replace('xui_newinb_', '');
    setAdminState(userId, { action: 'create_inbound', protocol });

    return bot.editMessageText(
      `➕ *Create ${protocol.toUpperCase()} Inbound*\n\n` +
      `Send: \`remark|port\`\n\n` +
      `Example: \`MyVMess|8443\``,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: getXuiBackKeyboard(),
      }
    );
  }

  // ─── Delete Inbound (confirm) ─────────────────────────────
  if (data.startsWith('xui_delib_')) {
    const inboundId = parseInt(data.replace('xui_delib_', ''));
    try {
      const inbound = await xuiClient.getInbound(inboundId);
      if (!inbound) throw new Error('Inbound not found');
      const settings = JSON.parse(inbound.settings);
      const clientCount = (settings.clients || []).length;

      return bot.editMessageText(
        `🗑 <b>Inbound ဖျက်မယ်</b>\n\n` +
        `<b>Name:</b> ${inbound.remark}\n` +
        `<b>Protocol:</b> ${inbound.protocol}\n` +
        `<b>Port:</b> ${inbound.port}\n` +
        `<b>Clients:</b> ${clientCount}\n\n` +
        `⚠️ Client ${clientCount} ခုလုံး ပါဖျက်မှာပါ။ သေချာလား?`,
        {
          chat_id: chatId, message_id: messageId,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ ဖျက်မယ်', callback_data: `xui_confirmdelib_${inboundId}` },
                { text: '❌ Cancel', callback_data: `xui_ib_${inboundId}` },
              ],
            ],
          },
        }
      );
    } catch (err) {
      return bot.editMessageText(`❌ Error: ${err.message}`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: getXuiBackKeyboard(),
      });
    }
  }

  // ─── Confirm Delete Inbound ─────────────────────────────────
  if (data.startsWith('xui_confirmdelib_')) {
    const inboundId = parseInt(data.replace('xui_confirmdelib_', ''));
    try {
      const res = await xuiClient.deleteInbound(inboundId);
      if (res.success) {
        return bot.editMessageText('✅ Inbound ဖျက်ပြီးပါပြီ!', {
          chat_id: chatId, message_id: messageId,
          reply_markup: getXuiBackKeyboard(),
        });
      }
      throw new Error(res.msg || 'Failed');
    } catch (err) {
      return bot.editMessageText(`❌ Error: ${err.message}`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: getXuiBackKeyboard(),
      });
    }
  }

  return false;
}

// Handle text messages for multi-step admin flows
async function handleXuiAdminMessage(bot, msg) {
  const userId = String(msg.from.id);
  const state = getAdminState(userId);
  if (!state) return false;

  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === '/cancel') {
    clearAdminState(userId);
    bot.sendMessage(chatId, 'Cancelled.');
    return true;
  }

  // ─── Create Inbound ────────────────────────────────────────
  if (state.action === 'create_inbound') {
    const parts = text.split('|');
    if (parts.length < 2) {
      bot.sendMessage(chatId, '❌ Invalid format. Use: `remark|port`', { parse_mode: 'Markdown' });
      return true;
    }

    const [remark, portStr] = parts;
    const port = parseInt(portStr.trim());

    try {
      let res;
      if (state.protocol === 'vmess') {
        res = await xuiClient.createVMessInbound(remark.trim(), port);
      } else if (state.protocol === 'vless') {
        res = await xuiClient.createVLESSInbound(remark.trim(), port);
      } else if (state.protocol === 'shadowsocks') {
        res = await xuiClient.createShadowsocksInbound(remark.trim(), port);
      }

      clearAdminState(userId);

      if (res && res.success) {
        bot.sendMessage(chatId,
          `✅ *${state.protocol.toUpperCase()} Inbound Created!*\n\n` +
          `*Remark:* ${remark.trim()}\n*Port:* ${port}`,
          { parse_mode: 'Markdown' }
        );
      } else {
        bot.sendMessage(chatId, `❌ Failed: ${res?.msg || 'Unknown error'}`);
      }
    } catch (err) {
      clearAdminState(userId);
      bot.sendMessage(chatId, `❌ Error: ${err.message}`);
    }
    return true;
  }

  // ─── Add Client ────────────────────────────────────────────
  if (state.action === 'add_client') {
    const parts = text.split('|');
    const email = parts[0].trim();
    const expiryDays = parts[1] ? parseInt(parts[1].trim()) : 0;
    const totalGB = parts[2] ? parseFloat(parts[2].trim()) * 1024 * 1024 * 1024 : 0;
    const limitIp = parts[3] ? parseInt(parts[3].trim()) : 0;

    try {
      // Get inbound to determine protocol
      const inboundInfo = await xuiClient.getInbound(state.inboundId);
      const protocol = inboundInfo ? inboundInfo.protocol : 'vmess';

      const clientConfig = xuiClient.createClientConfig(email, {
        expiryDays: expiryDays || 0,
        totalGB,
        limitIp,
        tgId: '',
        protocol,
      });

      const res = await xuiClient.addClient(state.inboundId, clientConfig);
      clearAdminState(userId);

      if (res.success) {
        const inbound = await xuiClient.getInbound(state.inboundId);
        const serverHost = process.env.XUI_SERVER_HOST || '178.128.80.123';
        const link = inbound ? xuiClient.generateLink(inbound, clientConfig, serverHost) : null;

        const expiry = expiryDays > 0 ? `${expiryDays} days` : 'Unlimited';
        const dataLimit = totalGB > 0 ? `${parts[2].trim()} GB` : 'Unlimited';

        let replyText =
          `✅ *Client Added!*\n\n` +
          `*Email:* \`${email}\`\n` +
          `*UUID:* \`${clientConfig.id}\`\n` +
          `*Expiry:* ${expiry}\n` +
          `*Data:* ${dataLimit}\n` +
          `*IP Limit:* ${limitIp || 'Unlimited'}\n`;

        if (link) {
          replyText += `\n🔗 *Config Link:*\n\`${link}\``;
        }

        bot.sendMessage(chatId, replyText, { parse_mode: 'Markdown' });
      } else {
        bot.sendMessage(chatId, `❌ Failed: ${res.msg || 'Unknown error'}`);
      }
    } catch (err) {
      clearAdminState(userId);
      bot.sendMessage(chatId, `❌ Error: ${err.message}`);
    }
    return true;
  }

  return false;
}

module.exports = { handleXuiCallback, handleXuiAdminMessage, getAdminState, clearAdminState };
