function getPanelListKeyboard(panels) {
  const buttons = panels.map((p) => {
    const typeIcon = p.type === 'trial' ? '🎁' : p.type === 'premium' ? '💎' : '🔷';
    const statusIcon = p.status === 'online' ? '🟢' : '🔴';
    return [
      {
        text: `${statusIcon}${typeIcon} ${p.name}`,
        callback_data: `pm_v_${p.id}`,
      },
    ];
  });
  buttons.push([{ text: '➕ Panel ထည့်မယ်', callback_data: 'pm_add' }]);
  buttons.push([{ text: '« Admin Menu', callback_data: 'admin_menu' }]);
  return { inline_keyboard: buttons };
}

function getPanelDetailKeyboard(panelId) {
  return {
    inline_keyboard: [
      [
        { text: '🌐 X-UI Manage', callback_data: `pm_xui_${panelId}` },
        { text: '🖥 Status', callback_data: `px_st_${panelId}` },
      ],
      [
        { text: '✏️ Edit', callback_data: `pm_edit_${panelId}` },
        { text: '🔄 Type ပြောင်း', callback_data: `pm_chtype_${panelId}` },
      ],
      [
        { text: '🟢 Online', callback_data: `pm_on_${panelId}` },
        { text: '🔴 Offline', callback_data: `pm_off_${panelId}` },
      ],
      [
        { text: '🗑 ဖျက်မယ်', callback_data: `pm_del_${panelId}` },
      ],
      [{ text: '« Panels', callback_data: 'pm_list' }],
    ],
  };
}

function getPanelTypeKeyboard(panelId) {
  return {
    inline_keyboard: [
      [{ text: '🎁 Trial', callback_data: `pm_settype_${panelId}_trial` }],
      [{ text: '💎 Premium', callback_data: `pm_settype_${panelId}_premium` }],
      [{ text: '🔷 Both', callback_data: `pm_settype_${panelId}_both` }],
      [{ text: '« Back', callback_data: `pm_v_${panelId}` }],
    ],
  };
}

function getPanelEditKeyboard(panelId) {
  return {
    inline_keyboard: [
      [{ text: '📝 Name ပြင်မယ်', callback_data: `pm_ename_${panelId}` }],
      [{ text: '🔗 URL ပြင်မယ်', callback_data: `pm_eurl_${panelId}` }],
      [{ text: '👤 Username ပြင်မယ်', callback_data: `pm_euser_${panelId}` }],
      [{ text: '🔑 Password ပြင်မယ်', callback_data: `pm_epass_${panelId}` }],
      [{ text: '🌐 Server Host ပြင်မယ်', callback_data: `pm_ehost_${panelId}` }],
      [{ text: '« Back', callback_data: `pm_v_${panelId}` }],
    ],
  };
}

function getPanelXuiMenuKeyboard(panelId) {
  return {
    inline_keyboard: [
      [
        { text: '📋 Inbounds', callback_data: `px_ib_${panelId}` },
        { text: '🖥 Status', callback_data: `px_st_${panelId}` },
      ],
      [
        { text: '➕ Inbound ထည့်မယ်', callback_data: `px_ci_${panelId}` },
      ],
      [{ text: '« Panel', callback_data: `pm_v_${panelId}` }],
    ],
  };
}

function getPanelXuiInboundListKeyboard(panelId, inbounds) {
  const buttons = inbounds.map((ib) => {
    const settings = JSON.parse(ib.settings);
    const clientCount = (settings.clients || []).length;
    const status = ib.enable ? '🟢' : '🔴';
    return [
      {
        text: `${status} ${ib.remark} (${ib.protocol} :${ib.port}) [${clientCount}]`,
        callback_data: `px_ibd_${panelId}_${ib.id}`,
      },
    ];
  });
  buttons.push([{ text: '➕ Inbound ထည့်မယ်', callback_data: `px_ci_${panelId}` }]);
  buttons.push([{ text: '« Panel', callback_data: `pm_xui_${panelId}` }]);
  return { inline_keyboard: buttons };
}

function getPanelXuiInboundActionsKeyboard(panelId, inboundId) {
  return {
    inline_keyboard: [
      [
        { text: '👤 Client ထည့်', callback_data: `px_ac_${panelId}_${inboundId}` },
        { text: '👥 Clients', callback_data: `px_vc_${panelId}_${inboundId}` },
      ],
      [
        { text: '🔗 Link', callback_data: `px_gl_${panelId}_${inboundId}` },
      ],
      [
        { text: '🗑 Inbound ဖျက်', callback_data: `px_di_${panelId}_${inboundId}` },
      ],
      [{ text: '« Inbounds', callback_data: `px_ib_${panelId}` }],
    ],
  };
}

function getPanelXuiCreateInboundKeyboard(panelId) {
  return {
    inline_keyboard: [
      [
        { text: '🔷 VMess', callback_data: `px_ni_${panelId}_vmess` },
        { text: '🔶 VLESS', callback_data: `px_ni_${panelId}_vless` },
      ],
      [
        { text: '🛡 Shadowsocks', callback_data: `px_ni_${panelId}_ss` },
      ],
      [{ text: '« Back', callback_data: `pm_xui_${panelId}` }],
    ],
  };
}

function getPanelXuiClientListKeyboard(panelId, inboundId, clients) {
  const buttons = [];
  clients.slice(0, 10).forEach((c) => {
    buttons.push([
      { text: `🔗 ${c.email}`, callback_data: `px_cl_${panelId}_${inboundId}_${c.email}` },
      { text: '🗑', callback_data: `px_dc_${panelId}_${inboundId}_${c.id || c.email}` },
    ]);
  });
  buttons.push([
    { text: '👤 Client ထည့်', callback_data: `px_ac_${panelId}_${inboundId}` },
  ]);
  buttons.push([{ text: '« Inbound', callback_data: `px_ibd_${panelId}_${inboundId}` }]);
  return { inline_keyboard: buttons };
}

function getPanelXuiBackKeyboard(panelId) {
  return {
    inline_keyboard: [
      [{ text: '« X-UI Menu', callback_data: `pm_xui_${panelId}` }],
    ],
  };
}

module.exports = {
  getPanelListKeyboard,
  getPanelDetailKeyboard,
  getPanelTypeKeyboard,
  getPanelEditKeyboard,
  getPanelXuiMenuKeyboard,
  getPanelXuiInboundListKeyboard,
  getPanelXuiInboundActionsKeyboard,
  getPanelXuiCreateInboundKeyboard,
  getPanelXuiClientListKeyboard,
  getPanelXuiBackKeyboard,
};
