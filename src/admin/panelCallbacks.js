const { isAdmin } = require('./auth');
const {
  getAllPanels, getPanel, addPanel, updatePanel, removePanel,
  getClient, clearClientCache,
} = require('../vpn/panelManager');
const {
  getPanelListKeyboard, getPanelDetailKeyboard, getPanelTypeKeyboard,
  getPanelEditKeyboard, getPanelXuiMenuKeyboard, getPanelXuiInboundListKeyboard,
  getPanelXuiInboundActionsKeyboard, getPanelXuiCreateInboundKeyboard,
  getPanelXuiClientListKeyboard, getPanelXuiBackKeyboard,
} = require('./panelKeyboards');

// State for multi-step flows (add panel, edit fields)
const panelState = {};

function setPanelState(userId, state) {
  panelState[String(userId)] = state;
}

function getPanelAdminState(userId) {
  return panelState[String(userId)] || null;
}

function clearPanelState(userId) {
  delete panelState[String(userId)];
}

function isPanelAdminState(userId) {
  return !!panelState[String(userId)];
}

const escHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function handlePanelCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const userId = String(query.from.id);
  const data = query.data;

  if (!isAdmin(query.from.id)) {
    bot.answerCallbackQuery(query.id, { text: '⛔ Not authorized' });
    return false;
  }

  bot.answerCallbackQuery(query.id);

  // ─── Panel List ──────────────────────────────────────────────
  if (data === 'pm_list') {
    const panels = getAllPanels();
    const typeLabel = { trial: '🎁 Trial', premium: '💎 Premium', both: '🔷 Both' };
    let text = `🖥 <b>X-UI Panels</b> (${panels.length})\n\n`;
    if (panels.length === 0) {
      text += 'Panel မရှိသေးပါ။ ➕ နှိပ်ပြီး ထည့်ပါ။';
    } else {
      panels.forEach((p) => {
        const statusIcon = p.status === 'online' ? '🟢' : '🔴';
        text += `${statusIcon} <b>${escHtml(p.name)}</b> — ${typeLabel[p.type] || p.type}\n`;
        text += `   🔗 <code>${escHtml(p.url)}</code>\n`;
        text += `   🌐 ${escHtml(p.serverHost)}\n\n`;
      });
    }

    return bot.editMessageText(text, {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: getPanelListKeyboard(panels),
    });
  }

  // ─── Add Panel ───────────────────────────────────────────────
  if (data === 'pm_add') {
    setPanelState(userId, { action: 'add_panel', step: 'name', data: {} });
    return bot.editMessageText(
      '➕ <b>Panel အသစ်ထည့်မယ်</b>\n\n' +
      'Panel name ရိုက်ထည့်ပါ:',
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'pm_list' }]],
        },
      }
    );
  }

  // ─── Panel Detail View ───────────────────────────────────────
  if (data.startsWith('pm_v_')) {
    const panelId = data.replace('pm_v_', '');
    const panel = getPanel(panelId);
    if (!panel) {
      return bot.editMessageText('❌ Panel မတွေ့ပါ', {
        chat_id: chatId, message_id: messageId,
        reply_markup: getPanelListKeyboard(getAllPanels()),
      });
    }

    const typeLabel = { trial: '🎁 Trial', premium: '💎 Premium', both: '🔷 Both' };
    const text =
      `🖥 <b>${escHtml(panel.name)}</b>\n\n` +
      `📋 <b>Type:</b> ${typeLabel[panel.type] || panel.type}\n` +
      `🔗 <b>URL:</b> <code>${escHtml(panel.url)}</code>\n` +
      `👤 <b>Username:</b> <code>${escHtml(panel.username)}</code>\n` +
      `🌐 <b>Server Host:</b> <code>${escHtml(panel.serverHost)}</code>\n` +
      `📊 <b>Status:</b> ${panel.status === 'online' ? '🟢 Online' : '🔴 Offline'}\n` +
      `📅 <b>Created:</b> ${new Date(panel.createdAt).toLocaleDateString('en-GB')}`;

    return bot.editMessageText(text, {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: getPanelDetailKeyboard(panelId),
    });
  }

  // ─── Change Panel Type ───────────────────────────────────────
  if (data.startsWith('pm_chtype_')) {
    const panelId = data.replace('pm_chtype_', '');
    return bot.editMessageText('🔄 Panel type ရွေးပါ:', {
      chat_id: chatId, message_id: messageId,
      reply_markup: getPanelTypeKeyboard(panelId),
    });
  }

  if (data.startsWith('pm_settype_')) {
    const parts = data.replace('pm_settype_', '').split('_');
    const panelId = parts.slice(0, -1).join('_');
    const type = parts[parts.length - 1];
    updatePanel(panelId, { type });
    clearClientCache(panelId);
    return bot.editMessageText(`✅ Panel type ကို <b>${type}</b> ပြောင်းပြီးပါပြီ`, {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: getPanelDetailKeyboard(panelId),
    });
  }

  // ─── Panel Status Toggle ─────────────────────────────────────
  if (data.startsWith('pm_on_')) {
    const panelId = data.replace('pm_on_', '');
    updatePanel(panelId, { status: 'online' });
    return bot.editMessageText('✅ Panel ကို Online ပြောင်းပြီးပါပြီ', {
      chat_id: chatId, message_id: messageId,
      reply_markup: getPanelDetailKeyboard(panelId),
    });
  }

  if (data.startsWith('pm_off_')) {
    const panelId = data.replace('pm_off_', '');
    updatePanel(panelId, { status: 'offline' });
    return bot.editMessageText('✅ Panel ကို Offline ပြောင်းပြီးပါပြီ', {
      chat_id: chatId, message_id: messageId,
      reply_markup: getPanelDetailKeyboard(panelId),
    });
  }

  // ─── Delete Panel ────────────────────────────────────────────
  if (data.startsWith('pm_del_') && !data.startsWith('pm_delc_')) {
    const panelId = data.replace('pm_del_', '');
    const panel = getPanel(panelId);
    return bot.editMessageText(
      `🗑 <b>${escHtml(panel?.name || panelId)}</b> ကို ဖျက်မှာ သေချာပါသလား?`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ ဖျက်မယ်', callback_data: `pm_delc_${panelId}` }],
            [{ text: '❌ Cancel', callback_data: `pm_v_${panelId}` }],
          ],
        },
      }
    );
  }

  if (data.startsWith('pm_delc_')) {
    const panelId = data.replace('pm_delc_', '');
    clearClientCache(panelId);
    removePanel(panelId);
    return bot.editMessageText('✅ Panel ဖျက်ပြီးပါပြီ', {
      chat_id: chatId, message_id: messageId,
      reply_markup: getPanelListKeyboard(getAllPanels()),
    });
  }

  // ─── Edit Panel Fields ───────────────────────────────────────
  if (data.startsWith('pm_edit_')) {
    const panelId = data.replace('pm_edit_', '');
    return bot.editMessageText('✏️ ဘာပြင်ချင်လဲ ရွေးပါ:', {
      chat_id: chatId, message_id: messageId,
      reply_markup: getPanelEditKeyboard(panelId),
    });
  }

  if (data.startsWith('pm_ename_') || data.startsWith('pm_eurl_') ||
      data.startsWith('pm_euser_') || data.startsWith('pm_epass_') ||
      data.startsWith('pm_ehost_')) {
    let field, label, panelId;
    if (data.startsWith('pm_ename_')) { field = 'name'; label = 'Name'; panelId = data.replace('pm_ename_', ''); }
    else if (data.startsWith('pm_eurl_')) { field = 'url'; label = 'URL'; panelId = data.replace('pm_eurl_', ''); }
    else if (data.startsWith('pm_euser_')) { field = 'username'; label = 'Username'; panelId = data.replace('pm_euser_', ''); }
    else if (data.startsWith('pm_epass_')) { field = 'password'; label = 'Password'; panelId = data.replace('pm_epass_', ''); }
    else { field = 'serverHost'; label = 'Server Host'; panelId = data.replace('pm_ehost_', ''); }

    setPanelState(userId, { action: 'edit_panel', panelId, field });
    return bot.editMessageText(
      `✏️ <b>${label}</b> အသစ်ရိုက်ထည့်ပါ:`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '❌ Cancel', callback_data: `pm_edit_${panelId}` }]],
        },
      }
    );
  }

  // ─── Panel X-UI Management ───────────────────────────────────
  if (data.startsWith('pm_xui_')) {
    const panelId = data.replace('pm_xui_', '');
    const panel = getPanel(panelId);
    if (!panel) {
      return bot.editMessageText('❌ Panel မတွေ့ပါ', {
        chat_id: chatId, message_id: messageId,
        reply_markup: getPanelListKeyboard(getAllPanels()),
      });
    }
    return bot.editMessageText(
      `🌐 <b>X-UI: ${escHtml(panel.name)}</b>\n\n` +
      `🔗 ${escHtml(panel.url)}`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: getPanelXuiMenuKeyboard(panelId),
      }
    );
  }

  // ─── X-UI: Server Status ─────────────────────────────────────
  if (data.startsWith('px_st_')) {
    const panelId = data.replace('px_st_', '');
    const panel = getPanel(panelId);
    if (!panel) {
      return bot.editMessageText('❌ Panel မတွေ့ပါ', {
        chat_id: chatId, message_id: messageId,
        reply_markup: getPanelListKeyboard(getAllPanels()),
      });
    }
    try {
      const client = getClient(panelId);
      const res = await client.getServerStatus();
      if (!res.success) throw new Error('Failed');

      const s = res.obj;
      const memUsed = (s.mem.current / 1024 / 1024).toFixed(0);
      const memTotal = (s.mem.total / 1024 / 1024).toFixed(0);
      const diskUsed = (s.disk.current / 1024 / 1024 / 1024).toFixed(1);
      const diskTotal = (s.disk.total / 1024 / 1024 / 1024).toFixed(1);

      const text =
        `🖥 <b>Server Status — ${escHtml(panel.name)}</b>\n\n` +
        `<b>Xray:</b> ${s.xray.state} (v${s.xray.version})\n` +
        `<b>CPU:</b> ${s.cpu.toFixed(1)}% (${s.cpuCount} cores)\n` +
        `<b>Memory:</b> ${memUsed}MB / ${memTotal}MB\n` +
        `<b>Disk:</b> ${diskUsed}GB / ${diskTotal}GB\n` +
        `<b>TCP:</b> ${s.tcpCount} | <b>UDP:</b> ${s.udpCount}\n` +
        `<b>Hostname:</b> ${s.hostInfo.hostname}\n` +
        `<b>IP:</b> <code>${s.hostInfo.ipv4.trim()}</code>`;

      return bot.editMessageText(text, {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: getPanelXuiBackKeyboard(panelId),
      });
    } catch (err) {
      return bot.editMessageText(`❌ Error: ${err.message}`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: getPanelXuiBackKeyboard(panelId),
      });
    }
  }

  // ─── X-UI: List Inbounds ─────────────────────────────────────
  if (data.startsWith('px_ib_')) {
    const panelId = data.replace('px_ib_', '');
    try {
      const client = getClient(panelId);
      const res = await client.listInbounds();
      if (!res.success) throw new Error('Failed to list inbounds');

      const inbounds = res.obj || [];
      if (inbounds.length === 0) {
        return bot.editMessageText(
          `📋 <b>Inbounds</b>\n\nInbound မရှိပါ။ ထည့်ပါ!`,
          {
            chat_id: chatId, message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: getPanelXuiCreateInboundKeyboard(panelId),
          }
        );
      }

      let text = `📋 <b>Inbounds</b> (${inbounds.length})\n\n`;
      inbounds.forEach((ib) => {
        const settings = JSON.parse(ib.settings);
        const clientCount = (settings.clients || []).length;
        const status = ib.enable ? '🟢' : '🔴';
        const up = (ib.up / 1024 / 1024 / 1024).toFixed(1);
        const down = (ib.down / 1024 / 1024 / 1024).toFixed(1);
        text += `${status} <b>${escHtml(ib.remark)}</b> — ${ib.protocol} :${ib.port}\n`;
        text += `   👥 ${clientCount} clients | ↑${up}GB ↓${down}GB\n\n`;
      });

      return bot.editMessageText(text, {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: getPanelXuiInboundListKeyboard(panelId, inbounds),
      });
    } catch (err) {
      return bot.editMessageText(`❌ Error: ${err.message}`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: getPanelXuiBackKeyboard(panelId),
      });
    }
  }

  // ─── X-UI: Inbound Detail ───────────────────────────────────
  if (data.startsWith('px_ibd_')) {
    const rest = data.replace('px_ibd_', '');
    const lastUnderscore = rest.lastIndexOf('_');
    const panelId = rest.substring(0, lastUnderscore);
    const inboundId = parseInt(rest.substring(lastUnderscore + 1));

    try {
      const client = getClient(panelId);
      const inbound = await client.getInbound(inboundId);
      if (!inbound) throw new Error('Inbound not found');

      const settings = JSON.parse(inbound.settings);
      const clients = settings.clients || [];
      const up = (inbound.up / 1024 / 1024 / 1024).toFixed(2);
      const down = (inbound.down / 1024 / 1024 / 1024).toFixed(2);

      let text =
        `📋 <b>${escHtml(inbound.remark)}</b>\n\n` +
        `<b>Protocol:</b> ${inbound.protocol}\n` +
        `<b>Port:</b> ${inbound.port}\n` +
        `<b>Status:</b> ${inbound.enable ? '🟢 Active' : '🔴 Disabled'}\n` +
        `<b>Upload:</b> ${up} GB\n` +
        `<b>Download:</b> ${down} GB\n` +
        `<b>Clients:</b> ${clients.length}\n`;

      if (clients.length > 0) {
        text += `\n<b>Client List:</b>\n`;
        clients.forEach((c) => {
          const expiry = c.expiryTime > 0
            ? new Date(c.expiryTime).toLocaleDateString('en-GB')
            : 'Unlimited';
          text += `• <code>${escHtml(c.email)}</code> — Expires: ${expiry}\n`;
        });
      }

      return bot.editMessageText(text, {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: getPanelXuiInboundActionsKeyboard(panelId, inboundId),
      });
    } catch (err) {
      return bot.editMessageText(`❌ Error: ${err.message}`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: getPanelXuiBackKeyboard(panelId),
      });
    }
  }

  // ─── X-UI: Create Inbound ───────────────────────────────────
  if (data.startsWith('px_ci_')) {
    const panelId = data.replace('px_ci_', '');
    return bot.editMessageText('➕ <b>Create Inbound</b>\n\nProtocol ရွေးပါ:', {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: getPanelXuiCreateInboundKeyboard(panelId),
    });
  }

  if (data.startsWith('px_ni_')) {
    const rest = data.replace('px_ni_', '');
    const lastUnderscore = rest.lastIndexOf('_');
    const panelId = rest.substring(0, lastUnderscore);
    const protocol = rest.substring(lastUnderscore + 1);

    setPanelState(userId, { action: 'create_inbound', panelId, protocol });
    return bot.editMessageText(
      `➕ <b>Create ${protocol.toUpperCase()} Inbound</b>\n\n` +
      `Format: <code>remark|port</code>\n` +
      `Example: <code>MyServer|443</code>`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '❌ Cancel', callback_data: `px_ci_${panelId}` }]],
        },
      }
    );
  }

  // ─── X-UI: Add Client to Inbound ────────────────────────────
  if (data.startsWith('px_ac_')) {
    const rest = data.replace('px_ac_', '');
    const lastUnderscore = rest.lastIndexOf('_');
    const panelId = rest.substring(0, lastUnderscore);
    const inboundId = parseInt(rest.substring(lastUnderscore + 1));

    setPanelState(userId, { action: 'add_client', panelId, inboundId });
    return bot.editMessageText(
      '👤 <b>Add Client</b>\n\n' +
      'Format: <code>email|expiryDays|dataGB|ipLimit</code>\n\n' +
      'Example: <code>user1|30|50|2</code>\n' +
      '(30 days, 50GB, 2 devices)\n\n' +
      'Or just email: <code>user1</code> (unlimited)',
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[{ text: '❌ Cancel', callback_data: `px_ibd_${panelId}_${inboundId}` }]],
        },
      }
    );
  }

  // ─── X-UI: View Clients ─────────────────────────────────────
  if (data.startsWith('px_vc_')) {
    const rest = data.replace('px_vc_', '');
    const lastUnderscore = rest.lastIndexOf('_');
    const panelId = rest.substring(0, lastUnderscore);
    const inboundId = parseInt(rest.substring(lastUnderscore + 1));

    try {
      const client = getClient(panelId);
      const inbound = await client.getInbound(inboundId);
      if (!inbound) throw new Error('Inbound not found');

      const settings = JSON.parse(inbound.settings);
      const clients = settings.clients || [];

      if (clients.length === 0) {
        return bot.editMessageText('Client မရှိပါ', {
          chat_id: chatId, message_id: messageId,
          reply_markup: getPanelXuiInboundActionsKeyboard(panelId, inboundId),
        });
      }

      let text = `👥 <b>Clients — ${escHtml(inbound.remark)}</b>\n\n`;
      const clientStats = inbound.clientStats || [];
      clients.forEach((c) => {
        const stats = clientStats.find((s) => s.email === c.email) || {};
        const usedGB = (((stats.up || 0) + (stats.down || 0)) / 1024 / 1024 / 1024).toFixed(2);
        const totalGB = c.totalGB > 0 ? (c.totalGB / 1024 / 1024 / 1024).toFixed(0) : '∞';
        const expiry = c.expiryTime > 0 ? new Date(c.expiryTime).toLocaleDateString('en-GB') : '∞';
        const now = Date.now();
        const isExpired = c.expiryTime > 0 && c.expiryTime < now;
        const status = !c.enable ? '🔴' : isExpired ? '🟡' : '🟢';
        text += `${status} <code>${escHtml(c.email)}</code>\n`;
        text += `   📊 ${usedGB}/${totalGB} GB | 📅 ${expiry}\n\n`;
      });

      return bot.editMessageText(text, {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: getPanelXuiClientListKeyboard(panelId, inboundId, clients),
      });
    } catch (err) {
      return bot.editMessageText(`❌ Error: ${err.message}`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: getPanelXuiBackKeyboard(panelId),
      });
    }
  }

  // ─── X-UI: Get Config Link for Client ──────────────────────
  if (data.startsWith('px_cl_')) {
    const rest = data.replace('px_cl_', '');
    const parts = rest.split('_');
    // panelId may contain underscores, inboundId is a number, email is last
    // Format: px_cl_<panelId>_<inboundId>_<email>
    // We need to parse carefully
    const panelId = findPanelIdFromParts(parts);
    if (!panelId) {
      return bot.editMessageText('❌ Error parsing panel ID', {
        chat_id: chatId, message_id: messageId,
      });
    }
    const remaining = rest.substring(panelId.length + 1);
    const nextUnderscore = remaining.indexOf('_');
    const inboundId = parseInt(remaining.substring(0, nextUnderscore));
    const email = remaining.substring(nextUnderscore + 1);

    try {
      const panel = getPanel(panelId);
      const client = getClient(panelId);
      const inbound = await client.getInbound(inboundId);
      if (!inbound) throw new Error('Inbound not found');

      const settings = JSON.parse(inbound.settings);
      const foundClient = (settings.clients || []).find((c) => c.email === email);
      if (!foundClient) throw new Error('Client not found');

      const link = client.generateLink(inbound, foundClient, panel.serverHost);

      const expiry = foundClient.expiryTime > 0
        ? new Date(foundClient.expiryTime).toLocaleString()
        : 'Unlimited';

      const text =
        `🔗 <b>Config Link</b>\n\n` +
        `<b>Client:</b> ${escHtml(foundClient.email)}\n` +
        `<b>Protocol:</b> ${inbound.protocol}\n` +
        `<b>Expiry:</b> ${expiry}\n\n` +
        `<code>${escHtml(link)}</code>\n\n` +
        `<i>Copy and import into VPN client.</i>`;

      return bot.editMessageText(text, {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: getPanelXuiInboundActionsKeyboard(panelId, inboundId),
      });
    } catch (err) {
      return bot.editMessageText(`❌ Error: ${err.message}`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: getPanelXuiBackKeyboard(panelId),
      });
    }
  }

  // ─── X-UI: Get All Links for Inbound ──────────────────────
  if (data.startsWith('px_gl_')) {
    const rest = data.replace('px_gl_', '');
    const lastUnderscore = rest.lastIndexOf('_');
    const panelId = rest.substring(0, lastUnderscore);
    const inboundId = parseInt(rest.substring(lastUnderscore + 1));

    try {
      const panel = getPanel(panelId);
      const client = getClient(panelId);
      const inbound = await client.getInbound(inboundId);
      if (!inbound) throw new Error('Inbound not found');

      const settings = JSON.parse(inbound.settings);
      const clients = settings.clients || [];

      if (clients.length === 0) {
        return bot.editMessageText('Client မရှိပါ', {
          chat_id: chatId, message_id: messageId,
          reply_markup: getPanelXuiInboundActionsKeyboard(panelId, inboundId),
        });
      }

      let text = `🔗 <b>Config Links — ${escHtml(inbound.remark)}</b>\n\n`;
      for (const c of clients) {
        const link = client.generateLink(inbound, c, panel.serverHost);
        text += `<b>${escHtml(c.email)}:</b>\n<code>${escHtml(link)}</code>\n\n`;
      }

      return bot.editMessageText(text, {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: getPanelXuiInboundActionsKeyboard(panelId, inboundId),
      });
    } catch (err) {
      return bot.editMessageText(`❌ Error: ${err.message}`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: getPanelXuiBackKeyboard(panelId),
      });
    }
  }

  // ─── X-UI: Delete Client ─────────────────────────────────────
  if (data.startsWith('px_dc_')) {
    const rest = data.replace('px_dc_', '');
    const panelId = findPanelIdFromParts(rest.split('_'));
    if (!panelId) {
      return bot.editMessageText('❌ Error parsing', {
        chat_id: chatId, message_id: messageId,
      });
    }
    const remaining = rest.substring(panelId.length + 1);
    const nextUnderscore = remaining.indexOf('_');
    const inboundId = parseInt(remaining.substring(0, nextUnderscore));
    const clientUuid = remaining.substring(nextUnderscore + 1);

    try {
      const client = getClient(panelId);
      const res = await client.deleteClient(inboundId, clientUuid);
      if (res.success) {
        return bot.editMessageText('✅ Client ဖျက်ပြီးပါပြီ', {
          chat_id: chatId, message_id: messageId,
          reply_markup: getPanelXuiInboundActionsKeyboard(panelId, inboundId),
        });
      }
      throw new Error(res.msg || 'Failed');
    } catch (err) {
      return bot.editMessageText(`❌ Error: ${err.message}`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: getPanelXuiBackKeyboard(panelId),
      });
    }
  }

  // ─── X-UI: Delete Inbound ───────────────────────────────────
  if (data.startsWith('px_di_')) {
    const rest = data.replace('px_di_', '');
    const lastUnderscore = rest.lastIndexOf('_');
    const panelId = rest.substring(0, lastUnderscore);
    const inboundId = parseInt(rest.substring(lastUnderscore + 1));

    try {
      const client = getClient(panelId);
      const res = await client.deleteInbound(inboundId);
      if (res.success) {
        return bot.editMessageText('✅ Inbound ဖျက်ပြီးပါပြီ', {
          chat_id: chatId, message_id: messageId,
          reply_markup: getPanelXuiBackKeyboard(panelId),
        });
      }
      throw new Error(res.msg || 'Failed');
    } catch (err) {
      return bot.editMessageText(`❌ Error: ${err.message}`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: getPanelXuiBackKeyboard(panelId),
      });
    }
  }

  return false;
}

// Helper: find panel ID from parts array (panel IDs contain underscores like "panel_12345")
function findPanelIdFromParts(parts) {
  const panels = getAllPanels();
  for (let i = parts.length - 1; i >= 1; i--) {
    const candidate = parts.slice(0, i).join('_');
    if (panels.find((p) => p.id === candidate)) return candidate;
  }
  // Try with first two parts as default
  if (parts.length >= 2) return parts.slice(0, 2).join('_');
  return parts[0];
}

// Handle text messages for panel admin multi-step flows
async function handlePanelAdminMessage(bot, msg) {
  const userId = String(msg.from.id);
  const state = getPanelAdminState(userId);
  if (!state) return false;

  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  if (!text) return false;

  // ─── Add Panel Flow ──────────────────────────────────────────
  if (state.action === 'add_panel') {
    if (state.step === 'name') {
      state.data.name = text;
      state.step = 'url';
      setPanelState(userId, state);
      return bot.sendMessage(chatId,
        '🔗 Panel URL ရိုက်ထည့်ပါ:\n\n' +
        'Example: `http://your-server:port/your-path`',
        { parse_mode: 'Markdown' }
      );
    }
    if (state.step === 'url') {
      state.data.url = text;
      state.step = 'username';
      setPanelState(userId, state);
      return bot.sendMessage(chatId, '👤 Panel username ရိုက်ထည့်ပါ:');
    }
    if (state.step === 'username') {
      state.data.username = text;
      state.step = 'password';
      setPanelState(userId, state);
      return bot.sendMessage(chatId, '🔑 Panel password ရိုက်ထည့်ပါ:');
    }
    if (state.step === 'password') {
      state.data.password = text;
      state.step = 'serverHost';
      setPanelState(userId, state);
      return bot.sendMessage(chatId,
        '🌐 Server host (IP) ရိုက်ထည့်ပါ:\n\n' +
        'Example: `209.97.171.125`',
        { parse_mode: 'Markdown' }
      );
    }
    if (state.step === 'serverHost') {
      state.data.serverHost = text;
      state.step = 'type';
      setPanelState(userId, state);
      return bot.sendMessage(chatId, 'Panel type ရွေးပါ:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎁 Trial', callback_data: 'pm_addtype_trial' }],
            [{ text: '💎 Premium', callback_data: 'pm_addtype_premium' }],
            [{ text: '🔷 Both', callback_data: 'pm_addtype_both' }],
          ],
        },
      });
    }
    return false;
  }

  // ─── Edit Panel Field ────────────────────────────────────────
  if (state.action === 'edit_panel') {
    const updated = updatePanel(state.panelId, { [state.field]: text });
    if (state.field === 'url' || state.field === 'username' || state.field === 'password') {
      clearClientCache(state.panelId);
    }
    clearPanelState(userId);
    if (updated) {
      return bot.sendMessage(chatId,
        `✅ <b>${state.field}</b> ပြင်ပြီးပါပြီ`,
        {
          parse_mode: 'HTML',
          reply_markup: getPanelDetailKeyboard(state.panelId),
        }
      );
    }
    return bot.sendMessage(chatId, '❌ Panel မတွေ့ပါ');
  }

  // ─── Create Inbound Flow ─────────────────────────────────────
  if (state.action === 'create_inbound') {
    const parts = text.split('|');
    const remark = parts[0]?.trim();
    const port = parseInt(parts[1]?.trim());

    if (!remark || !port || isNaN(port)) {
      return bot.sendMessage(chatId, '❌ Format: `remark|port`', { parse_mode: 'Markdown' });
    }

    try {
      const client = getClient(state.panelId);
      let res;
      if (state.protocol === 'vmess') {
        res = await client.createVMessInbound(remark, port);
      } else if (state.protocol === 'vless') {
        res = await client.createVLESSInbound(remark, port);
      } else {
        res = await client.createShadowsocksInbound(remark, port);
      }

      clearPanelState(userId);

      if (res.success) {
        return bot.sendMessage(chatId,
          `✅ <b>${state.protocol.toUpperCase()}</b> inbound ထည့်ပြီးပါပြီ!\n\n` +
          `<b>Remark:</b> ${escHtml(remark)}\n` +
          `<b>Port:</b> ${port}`,
          {
            parse_mode: 'HTML',
            reply_markup: getPanelXuiBackKeyboard(state.panelId),
          }
        );
      }
      throw new Error(res.msg || 'Failed');
    } catch (err) {
      clearPanelState(userId);
      return bot.sendMessage(chatId, `❌ Error: ${err.message}`, {
        reply_markup: getPanelXuiBackKeyboard(state.panelId),
      });
    }
  }

  // ─── Add Client Flow ────────────────────────────────────────
  if (state.action === 'add_client') {
    const parts = text.split('|');
    const email = parts[0]?.trim();
    const expiryDays = parts[1] ? parseInt(parts[1].trim()) : 0;
    const dataGB = parts[2] ? parseInt(parts[2].trim()) : 0;
    const ipLimit = parts[3] ? parseInt(parts[3].trim()) : 0;

    if (!email) {
      return bot.sendMessage(chatId, '❌ Email ထည့်ပေးပါ');
    }

    try {
      const client = getClient(state.panelId);
      const inbound = await client.getInbound(state.inboundId);
      if (!inbound) throw new Error('Inbound not found');

      const inboundSettings = JSON.parse(inbound.settings);
      const clientConfig = client.createClientConfig(email, {
        expiryDays: expiryDays || 0,
        totalGB: dataGB > 0 ? dataGB * 1024 * 1024 * 1024 : 0,
        limitIp: ipLimit,
        protocol: inbound.protocol,
        method: inboundSettings.method || 'aes-256-gcm',
      });

      const res = await client.addClient(state.inboundId, clientConfig);
      clearPanelState(userId);

      if (res.success) {
        const panel = getPanel(state.panelId);
        const link = client.generateLink(inbound, clientConfig, panel.serverHost);

        return bot.sendMessage(chatId,
          `✅ <b>Client ထည့်ပြီးပါပြီ!</b>\n\n` +
          `<b>Email:</b> <code>${escHtml(email)}</code>\n` +
          `<b>Expiry:</b> ${expiryDays > 0 ? expiryDays + ' days' : 'Unlimited'}\n` +
          `<b>Data:</b> ${dataGB > 0 ? dataGB + ' GB' : 'Unlimited'}\n` +
          `<b>IP Limit:</b> ${ipLimit > 0 ? ipLimit : 'Unlimited'}\n\n` +
          `🔗 <b>Link:</b>\n<code>${escHtml(link)}</code>`,
          {
            parse_mode: 'HTML',
            reply_markup: getPanelXuiInboundActionsKeyboard(state.panelId, state.inboundId),
          }
        );
      }
      throw new Error(res.msg || 'Failed');
    } catch (err) {
      clearPanelState(userId);
      return bot.sendMessage(chatId, `❌ Error: ${err.message}`, {
        reply_markup: getPanelXuiBackKeyboard(state.panelId),
      });
    }
  }

  return false;
}

// Handle add panel type selection callback
async function handlePanelTypeCallback(bot, query) {
  const chatId = query.message.chat.id;
  const userId = String(query.from.id);
  const data = query.data;

  if (!data.startsWith('pm_addtype_')) return false;

  bot.answerCallbackQuery(query.id);

  const state = getPanelAdminState(userId);
  if (!state || state.action !== 'add_panel' || state.step !== 'type') {
    return bot.sendMessage(chatId, '❌ Session expired. Start over.');
  }

  const type = data.replace('pm_addtype_', '');
  state.data.type = type;

  const newPanel = addPanel(state.data);
  clearPanelState(userId);

  const typeLabel = { trial: '🎁 Trial', premium: '💎 Premium', both: '🔷 Both' };
  return bot.sendMessage(chatId,
    `✅ <b>Panel ထည့်ပြီးပါပြီ!</b>\n\n` +
    `<b>Name:</b> ${escHtml(newPanel.name)}\n` +
    `<b>URL:</b> <code>${escHtml(newPanel.url)}</code>\n` +
    `<b>Type:</b> ${typeLabel[newPanel.type]}\n` +
    `<b>Server:</b> ${escHtml(newPanel.serverHost)}`,
    {
      parse_mode: 'HTML',
      reply_markup: getPanelDetailKeyboard(newPanel.id),
    }
  );
}

module.exports = {
  handlePanelCallback,
  handlePanelAdminMessage,
  handlePanelTypeCallback,
  isPanelAdminState,
  getPanelAdminState,
  clearPanelState,
};
