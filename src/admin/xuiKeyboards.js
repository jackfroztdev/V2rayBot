function getXuiMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '📋 Inbounds', callback_data: 'xui_inbounds' },
        { text: '🖥 Server Status', callback_data: 'xui_status' },
      ],
      [
        { text: '➕ Create Inbound', callback_data: 'xui_create_inbound' },
      ],
      [{ text: '« Admin Menu', callback_data: 'admin_menu' }],
    ],
  };
}

function getXuiInboundListKeyboard(inbounds) {
  const buttons = inbounds.map((ib) => {
    const settings = JSON.parse(ib.settings);
    const clientCount = (settings.clients || []).length;
    const status = ib.enable ? '🟢' : '🔴';
    return [
      {
        text: `${status} ${ib.remark} (${ib.protocol} :${ib.port}) [${clientCount}]`,
        callback_data: `xui_ib_${ib.id}`,
      },
    ];
  });
  buttons.push([{ text: '➕ Create Inbound', callback_data: 'xui_create_inbound' }]);
  buttons.push([{ text: '« X-UI Menu', callback_data: 'xui_menu' }]);
  return { inline_keyboard: buttons };
}

function getXuiInboundActionsKeyboard(inboundId) {
  return {
    inline_keyboard: [
      [
        { text: '👤 Add Client', callback_data: `xui_addclient_${inboundId}` },
        { text: '👥 View Clients', callback_data: `xui_clients_${inboundId}` },
      ],
      [
        { text: '🗑 Delete Inbound', callback_data: `xui_delib_${inboundId}` },
      ],
      [{ text: '« Inbounds', callback_data: 'xui_inbounds' }],
    ],
  };
}

function getXuiCreateInboundKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '🔷 VMess', callback_data: 'xui_newinb_vmess' },
        { text: '🔶 VLESS', callback_data: 'xui_newinb_vless' },
      ],
      [
        { text: '🛡 Shadowsocks', callback_data: 'xui_newinb_shadowsocks' },
      ],
      [{ text: '« X-UI Menu', callback_data: 'xui_menu' }],
    ],
  };
}

function getXuiClientListKeyboard(inboundId, clients) {
  const buttons = [];

  clients.slice(0, 10).forEach((c) => {
    buttons.push([
      { text: `🔗 ${c.email}`, callback_data: `xui_link_${inboundId}_${c.id}` },
      { text: '🗑', callback_data: `xui_delclient_${inboundId}_${c.id}` },
    ]);
  });

  buttons.push([
    { text: '👤 Add Client', callback_data: `xui_addclient_${inboundId}` },
  ]);
  buttons.push([{ text: '« Inbound', callback_data: `xui_ib_${inboundId}` }]);

  return { inline_keyboard: buttons };
}

function getXuiBackKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '« X-UI Menu', callback_data: 'xui_menu' }],
    ],
  };
}

module.exports = {
  getXuiMenuKeyboard,
  getXuiInboundListKeyboard,
  getXuiInboundActionsKeyboard,
  getXuiCreateInboundKeyboard,
  getXuiClientListKeyboard,
  getXuiBackKeyboard,
};
