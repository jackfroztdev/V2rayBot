const { getMainMenuKeyboard, getBackKeyboard } = require('./keyboards');
const { hasUsedTrial, createTrialKey, getTrialConfig, getTrialInfo } = require('./vpn/trialManager');
const { getPlans, createOrder, getUserPremiumKeys } = require('./vpn/premiumManager');
const { getUserReferral, getReferralCode, getReferralConfig } = require('./vpn/referralManager');
const { getBalance, getUserCredits, deductCredits, getCreditSettings, redeemCoupon } = require('./vpn/creditManager');
const xuiClient = require('./vpn/xuiClient');
const { getUser } = require('./admin/userManager');
const { logUserAction, logKeyClaimWithQR } = require('./middleware/userLogger');
const { getUserLang, setUserLang } = require('./middleware/language');
const QRCode = require('qrcode');

async function handleCallback(bot, query) {
  const chatId = query.message.chat.id;
  const messageId = query.message.message_id;
  const userId = String(query.from.id);
  const data = query.data;

  bot.answerCallbackQuery(query.id);

  // ─── Main Menu ─────────────────────────────────────────────
  if (data === 'back_to_menu') {
    return bot.editMessageText('🔐 *VPN Key Bot*\n\nရွေးချယ်ပါ:', {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: getMainMenuKeyboard(),
    });
  }

  // ─── Trial Key ─────────────────────────────────────────────
  if (data === 'trial_key') {
    if (hasUsedTrial(userId)) {
      return bot.editMessageText(
        '🎁 *Trial Key*\n\n' +
        '❌ Trial key ကို တစ်ကြိမ်သာ ထုတ်ခွင့်ရှိပါတယ်။\n' +
        'သင် trial key ယူပြီးပါပြီ။\n\n' +
        '📦 My Key မှာ ပြန်ကြည့်နိုင်ပါတယ်။',
        {
          chat_id: chatId, message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📦 My Key ကြည့်မယ်', callback_data: 'menu_mykey' }],
              [{ text: '« Back', callback_data: 'back_to_menu' }],
            ],
          },
        }
      );
    }

    const config = getTrialConfig();
    return bot.editMessageText(
      `🎁 *Trial Key*\n\n` +
      `Free trial key ထုတ်ယူနိုင်ပါတယ်!\n\n` +
      `📦 Data: *${config.totalGB} GB*\n` +
      `📅 Expiry: *${config.expiryDays} Days*\n` +
      `📱 Device Limit: *${config.ipLimit}*\n` +
      `🔐 Encryption: *aes-256-gcm*\n\n` +
      `⚠️ တစ်ယောက်ကို *${config.maxTrials} ကြိမ်* သာ ထုတ်ခွင့်ရှိပါတယ်။`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎁 Trial Key ထုတ်ယူမယ်', callback_data: 'trial_claim' }],
            [{ text: '« Back', callback_data: 'back_to_menu' }],
          ],
        },
      }
    );
  }

  if (data === 'trial_claim') {
    if (hasUsedTrial(userId)) {
      return bot.editMessageText(
        '❌ Trial key ကို တစ်ကြိမ်သာ ထုတ်ခွင့်ရှိပါတယ်။',
        {
          chat_id: chatId, message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: getBackKeyboard(),
        }
      );
    }

    bot.editMessageText('⏳ Trial key ထုတ်ပေးနေပါတယ်...', {
      chat_id: chatId, message_id: messageId,
    });

    const result = await createTrialKey(userId, query.from.username || query.from.first_name);

    if (!result.success) {
      return bot.editMessageText(`❌ ${result.msg}`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: getBackKeyboard(),
      });
    }

    const d = result.data;
    const config = getTrialConfig();
    const expiryDate = new Date(d.expiryDate).toLocaleDateString('en-GB');

    logKeyClaimWithQR(bot, query.from, {
      email: d.email,
      dataGB: d.dataGB,
      expiryDate,
      ipLimit: d.ipLimit,
      link: d.link,
      inbound: d.inboundRemark || '',
    }, 'Trial');

    const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const customMsg = config.customMessage ? `\n${escHtml(config.customMessage)}\n` : '';

    const caption =
      `🎁 <b>Trial Key ရရှိပါပြီ!</b>\n\n` +
      `📅 Expiry: <b>${expiryDate}</b>\n` +
      `📦 Data: <b>${d.dataGB} GB</b>\n` +
      `📱 Device: <b>${d.ipLimit}</b>\n\n` +
      `🔗 <b>Config Link:</b>\n<code>${escHtml(d.link)}</code>\n` +
      customMsg +
      `\n<i>Link ကို copy ပြီး VPN app ထဲ import လုပ်ပါ။</i>`;

    try {
      const qrBuffer = await QRCode.toBuffer(d.link, { width: 300, margin: 2 });
      await bot.deleteMessage(chatId, messageId).catch(() => {});
      await bot.sendPhoto(chatId, qrBuffer, {
        caption,
        parse_mode: 'HTML',
        reply_markup: getBackKeyboard(),
      });
    } catch {
      await bot.editMessageText(caption, {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: getBackKeyboard(),
      });
    }
    return;
  }

  // ─── Premium Key Menu (Credit System) ──────────────────────
  if (data === 'premium_menu') {
    const settings = getCreditSettings();
    const balance = getBalance(userId);
    let text = `💎 <b>Premium Key (Credit System)</b>\n\n` +
      `💰 <b>Your Balance:</b> ${balance} Credit\n\n` +
      `Plan ရွေးပြီး Credit နဲ့ ဝယ်ယူပါ:\n\n`;

    const buttons = settings.premiumPlans.map((p) => [
      {
        text: `${p.name} | ${p.days}d | ${p.credits} Credit`,
        callback_data: `premium_credit_${p.id}`,
      },
    ]);
    buttons.push([{ text: '📋 My Orders', callback_data: 'premium_orders' }]);
    buttons.push([{ text: '« Back', callback_data: 'back_to_menu' }]);

    return bot.editMessageText(text, {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons },
    });
  }

  // ─── Premium Buy with Credit ──────────────────────────────
  if (data.startsWith('premium_credit_')) {
    const planId = data.replace('premium_credit_', '');
    const settings = getCreditSettings();
    const plan = settings.premiumPlans.find(p => p.id === planId);
    if (!plan) {
      return bot.editMessageText('❌ Plan မတွေ့ပါ', {
        chat_id: chatId, message_id: messageId,
        reply_markup: getBackKeyboard(),
      });
    }
    const balance = getBalance(userId);

    return bot.editMessageText(
      `💎 <b>${plan.name}</b>\n\n` +
      `📦 Data: <b>${plan.dataGB} GB</b>\n` +
      `📅 Duration: <b>${plan.days} Days</b>\n` +
      `📱 Devices: <b>${plan.ipLimit}</b>\n` +
      `💰 Price: <b>${plan.credits} Credit</b>\n\n` +
      `💰 Your Balance: <b>${balance} Credit</b>\n\n` +
      (balance >= plan.credits
        ? `✅ Credit လုံလောက်ပါတယ်။ ဝယ်မယ် နှိပ်ပါ။`
        : `❌ Credit မလုံလောက်ပါ။ ${plan.credits - balance} Credit ထပ်လိုပါတယ်။`),
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: balance >= plan.credits
            ? [
                [{ text: '💰 Credit နဲ့ ဝယ်မယ်', callback_data: `premium_buy_credit_${planId}` }],
                [{ text: '« Plans', callback_data: 'premium_menu' }],
              ]
            : [
                [{ text: '💰 Credit ထပ်ဝယ်မယ်', callback_data: 'credit_menu' }],
                [{ text: '« Plans', callback_data: 'premium_menu' }],
              ],
        },
      }
    );
  }

  if (data.startsWith('premium_buy_credit_')) {
    const planId = data.replace('premium_buy_credit_', '');
    const settings = getCreditSettings();
    const plan = settings.premiumPlans.find(p => p.id === planId);
    if (!plan) {
      return bot.editMessageText('❌ Plan မတွေ့ပါ', {
        chat_id: chatId, message_id: messageId,
        reply_markup: getBackKeyboard(),
      });
    }

    const result = deductCredits(userId, plan.credits, `Premium: ${plan.name}`);
    if (!result) {
      return bot.editMessageText('❌ Credit မလုံလောက်ပါ', {
        chat_id: chatId, message_id: messageId,
        reply_markup: getBackKeyboard(),
      });
    }

    bot.editMessageText('⏳ Premium key ထုတ်ပေးနေပါတယ်...', {
      chat_id: chatId, message_id: messageId,
    });

    try {
      const { premiumClient } = require('./vpn/xuiClient');
      const crypto = require('crypto');
      const premServerHost = process.env.PREMIUM_XUI_SERVER_HOST || '209.97.171.125';

      // Generate remark with username/userId and random port
      const uname = (query.from.username || '').replace(/[^a-zA-Z0-9_]/g, '').substring(0, 8);
      const remarkName = uname ? `${uname}_${userId}` : `${userId}`;
      const remark = remarkName;
      const randomPort = 10000 + Math.floor(Math.random() * 55000);
      const ssMethod = 'chacha20-ietf-poly1305';
      const ssPassword = crypto.randomBytes(16).toString('base64');

      // Create a new SS inbound on premium panel with random port
      const inboundRes = await premiumClient.createShadowsocksInbound(remark, randomPort, {
        method: ssMethod,
        password: ssPassword,
      });
      if (!inboundRes.success) {
        return bot.editMessageText(`❌ ${inboundRes.msg || 'Failed to create inbound'}`, {
          chat_id: chatId, message_id: messageId,
          reply_markup: getBackKeyboard(),
        });
      }

      const newInboundId = inboundRes.obj.id;
      const shortId = crypto.randomBytes(2).toString('hex');
      const email = `p_${shortId}`;
      const clientConfig = premiumClient.createClientConfig(email, {
        expiryDays: plan.days,
        totalGB: plan.dataGB * 1024 * 1024 * 1024,
        limitIp: plan.ipLimit || 2,
        tgId: String(userId),
        protocol: 'shadowsocks',
        method: ssMethod,
      });

      const addRes = await premiumClient.addClient(newInboundId, clientConfig);
      if (!addRes.success) {
        return bot.editMessageText(`❌ ${addRes.msg || 'Failed to create key'}`, {
          chat_id: chatId, message_id: messageId,
          reply_markup: getBackKeyboard(),
        });
      }

      // Get the created inbound for link generation
      const inbound = await premiumClient.getInbound(newInboundId);
      const link = premiumClient.generateLink(inbound, clientConfig, premServerHost);

      const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const expiryDate = new Date(Date.now() + plan.days * 86400000).toLocaleDateString('en-GB');

      logKeyClaimWithQR(bot, query.from, {
        email,
        dataGB: plan.dataGB,
        expiryDate,
        ipLimit: plan.ipLimit || 2,
        link,
        inbound: remark,
      }, 'Premium (Credit)');

      // Save to premium keys
      const { savePremiumKey } = require('./vpn/premiumManager');
      if (typeof savePremiumKey === 'function') {
        savePremiumKey(userId, { email, link, planId: plan.id, planName: plan.name, dataGB: plan.dataGB, days: plan.days, server: premServerHost, inboundId: newInboundId });
      }

      const caption =
        `💎 <b>Premium Key ရရှိပါပြီ!</b>\n\n` +
        `📦 Plan: <b>${plan.name}</b>\n` +
        `📅 Expiry: <b>${expiryDate}</b>\n` +
        `📦 Data: <b>${plan.dataGB} GB</b>\n` +
        `📱 Device: <b>${plan.ipLimit || 2}</b>\n` +
        `💰 Used: <b>${plan.credits} Credit</b>\n` +
        `🔒 Method: <b>${ssMethod}</b>\n` +
        `🌐 Port: <b>${randomPort}</b>\n\n` +
        `🔗 <b>Config Link:</b>\n<code>${escHtml(link)}</code>`;

      try {
        const qrBuffer = await QRCode.toBuffer(link, { width: 300, margin: 2 });
        await bot.deleteMessage(chatId, messageId).catch(() => {});
        await bot.sendPhoto(chatId, qrBuffer, {
          caption,
          parse_mode: 'HTML',
          reply_markup: getBackKeyboard(),
        });
      } catch {
        await bot.editMessageText(caption, {
          chat_id: chatId, message_id: messageId,
          parse_mode: 'HTML',
          reply_markup: getBackKeyboard(),
        });
      }
    } catch (err) {
      return bot.editMessageText(`❌ ${err.message}`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: getBackKeyboard(),
      });
    }
    return;
  }

  // ─── Premium Plan Select (old payment flow, still available) ──
  if (data.startsWith('premium_select_')) {
    const planId = data.replace('premium_select_', '');
    const plans = getPlans();
    const plan = plans.find((p) => p.id === planId);
    if (!plan) {
      return bot.editMessageText('❌ Plan မတွေ့ပါ။', {
        chat_id: chatId, message_id: messageId,
        reply_markup: getBackKeyboard(),
      });
    }

    return bot.editMessageText(
      `💎 *${plan.name}*\n\n` +
      `📦 Data: *${plan.dataGB} GB*\n` +
      `📅 Duration: *${plan.days} Days*\n` +
      `📱 Devices: *${plan.ipLimit}*\n` +
      `💰 Price: *${plan.price} Ks*\n\n` +
      `ဝယ်ယူမယ်ဆိုရင် *"ဝယ်ယူမယ်"* ကို နှိပ်ပါ။\n` +
      `Payment screenshot ပို့ပေးရပါမယ်။`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '💰 ဝယ်ယူမယ်', callback_data: `premium_buy_${planId}` }],
            [{ text: '« Plans', callback_data: 'premium_menu' }],
          ],
        },
      }
    );
  }

  if (data.startsWith('premium_buy_')) {
    const planId = data.replace('premium_buy_', '');
    const order = createOrder(userId, planId);
    if (!order) {
      return bot.editMessageText('❌ Plan မတွေ့ပါ။', {
        chat_id: chatId, message_id: messageId,
        reply_markup: getBackKeyboard(),
      });
    }

    logUserAction(bot, query.from, '💎 Premium Order Created',
      `📋 Order: \`${order.orderId}\`\n` +
      `📦 Plan: ${order.planName} (${order.dataGB}GB/${order.days}Days)\n` +
      `💰 Price: ${order.price} Ks`
    );

    return bot.editMessageText(
      `💎 *Order Created!*\n\n` +
      `📋 Order ID: \`${order.orderId}\`\n` +
      `📦 Plan: *${order.planName}* (${order.dataGB}GB/${order.days}Days)\n` +
      `💰 Price: *${order.price} Ks*\n\n` +
      `*ငွေလွှဲနည်း:*\n` +
      `Admin ထံ ငွေလွှဲပြီး screenshot ကို\n` +
      `ဒီ bot ထဲ ပို့ပေးပါ။\n\n` +
      `Screenshot ပို့ရင် Order ID ပါ ရေးပေးပါ:\n` +
      `\`${order.orderId}\`\n\n` +
      `_Admin approve လုပ်ပြီးရင် key auto ထုတ်ပေးပါမယ်။_`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📞 Admin ထံ ဆက်သွယ်မယ်', url: process.env.ADMIN_CONTACT || 'https://t.me/JackFrozt_2k4' }],
            [{ text: '« Back to Menu', callback_data: 'back_to_menu' }],
          ],
        },
      }
    );
  }

  // ─── Premium Orders ───────────────────────────────────────
  if (data === 'premium_orders') {
    const { getUserOrders } = require('./vpn/premiumManager');
    const orders = getUserOrders(userId);

    if (orders.length === 0) {
      return bot.editMessageText(
        '📋 *My Orders*\n\nOrder မရှိသေးပါ။',
        {
          chat_id: chatId, message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '💎 Premium Key ဝယ်မယ်', callback_data: 'premium_menu' }],
              [{ text: '« Back', callback_data: 'back_to_menu' }],
            ],
          },
        }
      );
    }

    const statusEmoji = { pending: '⏳', approved: '✅', rejected: '❌' };
    let text = '📋 *My Orders*\n\n';
    for (const o of orders.slice(-5).reverse()) {
      text += `${statusEmoji[o.status] || '❓'} \`${o.orderId}\`\n` +
        `   ${o.planName} | ${o.price} Ks | ${o.status}\n\n`;
    }

    return bot.editMessageText(text, {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💎 Premium Key ဝယ်မယ်', callback_data: 'premium_menu' }],
          [{ text: '« Back', callback_data: 'back_to_menu' }],
        ],
      },
    });
  }

  // ─── Credit Menu ──────────────────────────────────────────
  if (data === 'credit_menu') {
    const balance = getBalance(userId);
    const settings = getCreditSettings();
    const ref = getUserReferral(userId);

    return bot.editMessageText(
      `💰 <b>Credit System</b>\n\n` +
      `💰 <b>Balance:</b> ${balance} Credit\n` +
      `👥 <b>Referral Earned:</b> ${ref.totalCreditsEarned || 0} Credit\n\n` +
      `<b>Credit ရနည်း:</b>\n` +
      `• 👥 Referral invite 1 ယောက် = ${settings.referralCredit} Credit\n` +
      `• 🎟 Coupon Code သုံးပြီး ရယူ\n` +
      `• Admin ဆီက Credit ဝယ်ယူ\n\n` +
      `<b>Credit သုံးနည်း:</b>\n` +
      `• 🔄 Credit နဲ့ Key လဲ (${settings.creditPerGB} Credit = 1 GB)\n` +
      `• 💎 Credit နဲ့ Premium Plan ဝယ်`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Credit → Key လဲမယ်', callback_data: 'credit_exchange' }],
            [{ text: '💎 Premium ဝယ်မယ်', callback_data: 'premium_menu' }],
            [{ text: '💵 Credit ဝယ်ယူရန်', callback_data: 'credit_purchase' }],
            [{ text: '📜 Credit History', callback_data: 'credit_history' }],
            [{ text: '« Back', callback_data: 'back_to_menu' }],
          ],
        },
      }
    );
  }

  // ─── Credit Exchange (Credit → Key) ──────────────────────
  if (data === 'credit_exchange') {
    const balance = getBalance(userId);
    const settings = getCreditSettings();
    const rate = settings.creditPerGB || 0.1;

    const options = [5, 10, 20, 50, 100];
    const buttons = options.map(gb => {
      const cost = parseFloat((gb * rate).toFixed(2));
      return [{ text: `${gb} GB — ${cost} Credit`, callback_data: `credit_buy_${gb}` }];
    });
    buttons.push([{ text: '« Back', callback_data: 'credit_menu' }]);

    return bot.editMessageText(
      `🔄 <b>Credit → Key Exchange</b>\n\n` +
      `💰 <b>Balance:</b> ${balance} Credit\n` +
      `📊 <b>Rate:</b> ${rate} Credit = 1 GB\n\n` +
      `Key ထုတ်ယူချင်တဲ့ GB ရွေးပါ:`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons },
      }
    );
  }

  if (data.startsWith('credit_buy_')) {
    const gb = parseInt(data.replace('credit_buy_', ''));
    const settings = getCreditSettings();
    const rate = settings.creditPerGB || 0.1;
    const cost = parseFloat((gb * rate).toFixed(2));
    const balance = getBalance(userId);

    if (balance < cost) {
      return bot.editMessageText(
        `❌ Credit မလုံလောက်ပါ\n\n💰 Balance: ${balance}\n💰 Required: ${cost}`,
        {
          chat_id: chatId, message_id: messageId,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '« Back', callback_data: 'credit_exchange' }],
            ],
          },
        }
      );
    }

    const result = deductCredits(userId, cost, `Key Exchange: ${gb}GB`);
    if (!result) {
      return bot.editMessageText('❌ Credit deduct failed', {
        chat_id: chatId, message_id: messageId,
        reply_markup: getBackKeyboard(),
      });
    }

    bot.editMessageText('⏳ Key ထုတ်ပေးနေပါတယ်...', {
      chat_id: chatId, message_id: messageId,
    });

    try {
      const inboundId = settings.referralKeyInboundId || parseInt(process.env.TRIAL_INBOUND_ID) || 1;
      const inbound = await xuiClient.getInbound(inboundId);
      if (!inbound) {
        return bot.editMessageText('❌ Inbound not found', {
          chat_id: chatId, message_id: messageId,
          reply_markup: getBackKeyboard(),
        });
      }

      const inboundSettings = JSON.parse(inbound.settings);
      const email = `credit_${userId}_${Date.now()}`;
      const clientConfig = xuiClient.createClientConfig(email, {
        expiryDays: 30,
        totalGB: gb * 1024 * 1024 * 1024,
        limitIp: 1,
        tgId: String(userId),
        protocol: inbound.protocol,
        method: inboundSettings.method || 'aes-256-gcm',
      });

      const res = await xuiClient.addClient(inboundId, clientConfig);
      if (!res.success) {
        return bot.editMessageText(`❌ ${res.msg || 'Failed'}`, {
          chat_id: chatId, message_id: messageId,
          reply_markup: getBackKeyboard(),
        });
      }

      const serverHost = process.env.XUI_SERVER_HOST || '178.128.80.123';
      const link = xuiClient.generateLink(inbound, clientConfig, serverHost);
      const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const expiryDate = new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-GB');

      logKeyClaimWithQR(bot, query.from, {
        email, dataGB: gb, expiryDate, ipLimit: 1, link, inbound: inbound.remark || '',
      }, 'Credit Exchange');

      const caption =
        `🔄 <b>Credit Exchange Key ရရှိပါပြီ!</b>\n\n` +
        `📦 Data: <b>${gb} GB</b>\n` +
        `📅 Expiry: <b>${expiryDate}</b>\n` +
        `💰 Used: <b>${cost} Credit</b>\n` +
        `💰 Remaining: <b>${result.balance} Credit</b>\n\n` +
        `🔗 <b>Config Link:</b>\n<code>${escHtml(link)}</code>`;

      try {
        const qrBuffer = await QRCode.toBuffer(link, { width: 300, margin: 2 });
        await bot.deleteMessage(chatId, messageId).catch(() => {});
        await bot.sendPhoto(chatId, qrBuffer, {
          caption, parse_mode: 'HTML', reply_markup: getBackKeyboard(),
        });
      } catch {
        await bot.editMessageText(caption, {
          chat_id: chatId, message_id: messageId,
          parse_mode: 'HTML', reply_markup: getBackKeyboard(),
        });
      }
    } catch (err) {
      return bot.editMessageText(`❌ ${err.message}`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: getBackKeyboard(),
      });
    }
    return;
  }

  // ─── Credit History ───────────────────────────────────────
  if (data === 'credit_history') {
    const credits = getUserCredits(userId);
    let text = `📜 <b>Credit History</b>\n\n💰 Balance: <b>${credits.balance}</b>\n\n`;
    const history = (credits.history || []).slice(-10).reverse();
    if (history.length === 0) {
      text += '<i>History မရှိသေးပါ</i>';
    } else {
      for (const h of history) {
        const icon = h.type === 'add' ? '➕' : '➖';
        const date = new Date(h.date).toLocaleDateString('en-GB');
        text += `${icon} ${h.amount} Credit — ${h.reason || 'N/A'} (${date})\n`;
      }
    }
    return bot.editMessageText(text, {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '« Credit Menu', callback_data: 'credit_menu' }]],
      },
    });
  }

  // ─── Credit Buy (Contact Admin) ────────────────────────────
  if (data === 'credit_purchase') {
    const adminContact = process.env.ADMIN_CONTACT || 'https://t.me/JackFrozt_2k4';
    const balance = getBalance(userId);
    return bot.editMessageText(
      `💵 <b>Credit ဝယ်ယူရန်</b>\n\n` +
      `💰 <b>Current Balance:</b> ${balance} Credit\n\n` +
      `Credit ဝယ်ယူလိုပါက Admin ထံ ဆက်သွယ်ပါ။\n` +
      `ငွေလွှဲပြီးရင် Admin က Credit ထည့်ပေးပါမယ်။`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📞 Admin ထံ ဆက်သွယ်မယ်', url: adminContact }],
            [{ text: '« Credit Menu', callback_data: 'credit_menu' }],
          ],
        },
      }
    );
  }

  // ─── Coupon Menu ──────────────────────────────────────────
  if (data === 'coupon_menu') {
    const { setCouponRedeemState } = require('./middleware/userLogger');
    setCouponRedeemState(userId);
    return bot.editMessageText(
      `🎟 <b>Coupon Code</b>\n\n` +
      `Coupon code ရှိရင် ထည့်ပြီး Credit ရယူပါ!\n\n` +
      `Coupon code ကို ရိုက်ထည့်ပါ:`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '« Back', callback_data: 'back_to_menu' }],
          ],
        },
      }
    );
  }

  // ─── Referral Menu (Credit System) ────────────────────────
  if (data === 'referral_menu') {
    const ref = getUserReferral(userId);
    const config = getReferralConfig();
    const balance = getBalance(userId);
    const botUsername = (await bot.getMe()).username;
    const refLink = `https://t.me/${botUsername}?start=ref_${userId}`;
    const inviteCount = ref.invitedUsers.length;

    let text =
      `👥 <b>Referral System (Credit)</b>\n\n` +
      `သူငယ်ချင်း <b>1 ယောက်</b> invite လုပ်ရင်\n` +
      `💰 <b>${config.referralCredit} Credit</b> ရမယ်!\n\n` +
      `📊 <b>Invite Count:</b> ${inviteCount} ယောက်\n` +
      `💰 <b>Total Earned:</b> ${ref.totalCreditsEarned || 0} Credit\n` +
      `💰 <b>Balance:</b> ${balance} Credit\n\n` +
      `🔗 <b>Your Referral Link:</b>\n<code>${refLink}</code>\n\n` +
      `<i>Link ကို share ပြီး သူငယ်ချင်းတွေကို invite လုပ်ပါ!</i>`;

    return bot.editMessageText(text, {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💰 Credit Menu', callback_data: 'credit_menu' }],
          [{ text: '« Back', callback_data: 'back_to_menu' }],
        ],
      },
    });
  }

  // ─── Speed Test ───────────────────────────────────────────
  if (data === 'speed_test') {
    bot.editMessageText('🚀 Speed Test စစ်ဆေးနေပါတယ်...', {
      chat_id: chatId, message_id: messageId,
    });

    try {
      const serverHost = process.env.XUI_SERVER_HOST || '178.128.80.123';
      const startTime = Date.now();
      const axios = require('axios');
      await axios.get(`http://${serverHost}:53253`, { timeout: 5000 }).catch(() => {});
      const ping = Date.now() - startTime;

      const status = ping < 200 ? '🟢 Excellent' : ping < 500 ? '🟡 Good' : '🔴 Slow';

      return bot.editMessageText(
        `🚀 <b>Speed Test Result</b>\n\n` +
        `🌐 <b>Server:</b> ${serverHost}\n` +
        `📡 <b>Ping:</b> ${ping}ms\n` +
        `📊 <b>Status:</b> ${status}\n\n` +
        `<i>Ping = Bot server ကနေ VPN server ဆီ response time</i>`,
        {
          chat_id: chatId, message_id: messageId,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Retry', callback_data: 'speed_test' }],
              [{ text: '« Back', callback_data: 'back_to_menu' }],
            ],
          },
        }
      );
    } catch (err) {
      return bot.editMessageText(`❌ Speed test failed: ${err.message}`, {
        chat_id: chatId, message_id: messageId,
        reply_markup: getBackKeyboard(),
      });
    }
  }

  // ─── Language Menu ────────────────────────────────────────
  if (data === 'language_menu') {
    const lang = getUserLang(userId);
    return bot.editMessageText(
      `🌐 <b>Language / ဘာသာစကား</b>\n\n` +
      `Current: <b>${lang === 'mm' ? 'Myanmar 🇲🇲' : 'English 🇺🇸'}</b>\n\n` +
      `ပြောင်းချင်တဲ့ ဘာသာစကား ရွေးပါ:`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🇲🇲 Myanmar', callback_data: 'lang_mm' },
              { text: '🇺🇸 English', callback_data: 'lang_en' },
            ],
            [{ text: '« Back', callback_data: 'back_to_menu' }],
          ],
        },
      }
    );
  }

  if (data === 'lang_mm' || data === 'lang_en') {
    const lang = data.replace('lang_', '');
    setUserLang(userId, lang);
    const name = lang === 'mm' ? 'Myanmar 🇲🇲' : 'English 🇺🇸';
    return bot.editMessageText(
      `✅ Language changed to <b>${name}</b>`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: getBackKeyboard(),
      }
    );
  }

  // ─── My Key ────────────────────────────────────────────────
  if (data === 'menu_mykey') {
    logUserAction(bot, query.from, '📦 Viewed My Key');
    const trialInfo = getTrialInfo(userId);
    const premiumKeys = getUserPremiumKeys(userId);

    const hasKeys = (trialInfo && trialInfo.keys.length > 0) || premiumKeys.length > 0;

    if (!hasKeys) {
      return bot.editMessageText(
        '📦 *My Key*\n\n' +
        'Key မရှိသေးပါ။',
        {
          chat_id: chatId, message_id: messageId,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎁 Trial Key ထုတ်ယူမယ်', callback_data: 'trial_key' }],
              [{ text: '💎 Premium Key ဝယ်မယ်', callback_data: 'premium_menu' }],
              [{ text: '« Back', callback_data: 'back_to_menu' }],
            ],
          },
        }
      );
    }

    let text = '📦 *My Keys*\n\n';
    let clients = [];
    try {
      clients = await xuiClient.getAllClients();
    } catch {}

    if (trialInfo && trialInfo.keys.length > 0) {
      text += '🎁 *Trial Key:*\n';
      for (const key of trialInfo.keys) {
        const client = clients.find((c) => c.email === key.email);
        if (client) {
          const usedGB = ((client.up + client.down) / 1024 / 1024 / 1024).toFixed(2);
          const totalGB = (client.total / 1024 / 1024 / 1024).toFixed(0);
          const expiry = client.expiryTime > 0
            ? new Date(client.expiryTime).toLocaleDateString('en-GB')
            : 'Unlimited';
          const now = Date.now();
          const isExpired = client.expiryTime > 0 && client.expiryTime < now;
          const status = !client.enable ? '🔴 Disabled' : isExpired ? '🔴 Expired' : '🟢 Active';
          text += `  ${status} | 📊 ${usedGB}/${totalGB} GB | 📅 ${expiry}\n`;
        }
        text += `  🔗 \`${key.link}\`\n\n`;
      }
    }

    if (premiumKeys.length > 0) {
      text += '💎 *Premium Keys:*\n';
      for (const key of premiumKeys) {
        const client = clients.find((c) => c.email === key.email);
        if (client) {
          const usedGB = ((client.up + client.down) / 1024 / 1024 / 1024).toFixed(2);
          const totalGB = (client.total / 1024 / 1024 / 1024).toFixed(0);
          const expiry = client.expiryTime > 0
            ? new Date(client.expiryTime).toLocaleDateString('en-GB')
            : 'Unlimited';
          const now = Date.now();
          const isExpired = client.expiryTime > 0 && client.expiryTime < now;
          const status = !client.enable ? '🔴 Disabled' : isExpired ? '🔴 Expired' : '🟢 Active';
          text += `  ${status} | ${key.planName || 'Premium'} | 📊 ${usedGB}/${totalGB} GB | 📅 ${expiry}\n`;
        }
        text += `  🔗 \`${key.link}\`\n\n`;
      }
    }

    text += `_Link ကို copy ပြီး VPN app ထဲ import လုပ်ပါ။_`;

    const allKeys = [];
    if (trialInfo && trialInfo.keys) allKeys.push(...trialInfo.keys);
    allKeys.push(...premiumKeys);
    const qrButtons = allKeys.map((k, i) => ({ text: `📱 QR #${i + 1}`, callback_data: `qr_key_${i}` }));
    const buttons = [];
    if (qrButtons.length > 0) buttons.push(qrButtons.slice(0, 3));
    buttons.push([{ text: '« Back to Menu', callback_data: 'back_to_menu' }]);

    return bot.editMessageText(text, {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: buttons },
    });
  }

  // ─── QR Code for Key ──────────────────────────────────────
  if (data.startsWith('qr_key_')) {
    const idx = parseInt(data.replace('qr_key_', ''));
    const trialInfo2 = getTrialInfo(userId);
    const premiumKeys2 = getUserPremiumKeys(userId);
    const allKeys2 = [];
    if (trialInfo2 && trialInfo2.keys) allKeys2.push(...trialInfo2.keys);
    allKeys2.push(...premiumKeys2);
    const key = allKeys2[idx];
    if (!key) {
      return bot.answerCallbackQuery(query.id, { text: 'Key not found' });
    }
    try {
      const qrBuffer = await QRCode.toBuffer(key.link, { width: 300, margin: 2 });
      await bot.sendPhoto(chatId, qrBuffer, {
        caption: `📱 <b>QR Code</b>\n\n<code>${key.link.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</code>`,
        parse_mode: 'HTML',
      });
    } catch {
      bot.sendMessage(chatId, '❌ QR Code generate မရပါ');
    }
    return;
  }

  // ─── My Account ────────────────────────────────────────────
  if (data === 'my_account') {
    const user = getUser(userId);
    const trialInfo = getTrialInfo(userId);
    const hasTrial = trialInfo && trialInfo.count > 0;
    const premiumKeys = getUserPremiumKeys(userId);
    const ref = getUserReferral(userId);
    const balance = getBalance(userId);

    const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const userName = escHtml(query.from.first_name || 'User');
    const username = query.from.username ? `@${escHtml(query.from.username)}` : 'N/A';

    let text =
      `👤 <b>My Account</b>\n\n` +
      `<b>Name:</b> ${userName}\n` +
      `<b>Username:</b> ${username}\n` +
      `<b>ID:</b> <code>${userId}</code>\n` +
      `<b>Joined:</b> ${user ? new Date(user.joinedAt).toLocaleDateString('en-GB') : 'N/A'}\n\n`;

    if (hasTrial) {
      text += `🎁 <b>Trial Key:</b> ယူပြီး (${trialInfo.count}/${getTrialConfig().maxTrials})\n`;
    } else {
      text += `🎁 <b>Trial Key:</b> မယူရသေးပါ\n`;
    }
    text += `💎 <b>Premium Keys:</b> ${premiumKeys.length} ခု\n`;
    text += `👥 <b>Referrals:</b> ${ref.invitedUsers.length} ယောက် invited\n\n`;

    const creditInfo = getUserCredits(userId);
    const settings = getCreditSettings();
    text += `💰 <b>Credit Info:</b>\n`;
    text += `   Balance: <b>${balance}</b> Credit\n`;
    text += `   Referral Earned: ${ref.totalCreditsEarned || 0} Credit\n`;
    text += `   Total Spent: ${creditInfo.history.filter(h => h.type === 'deduct').reduce((a, h) => a + h.amount, 0).toFixed(2)} Credit\n`;
    text += `   Rate: ${settings.creditPerGB} Credit = 1 GB\n`;

    const allKeys = [];
    if (trialInfo && trialInfo.keys) allKeys.push(...trialInfo.keys);
    allKeys.push(...premiumKeys);

    if (allKeys.length > 0) {
      try {
        const clients = await xuiClient.getAllClients();
        const lastKey = allKeys[allKeys.length - 1];
        const client = clients.find((c) => c.email === lastKey.email);

        if (client) {
          const usedGB = ((client.up + client.down) / 1024 / 1024 / 1024).toFixed(2);
          const totalGB = client.total > 0 ? (client.total / 1024 / 1024 / 1024).toFixed(0) : 'Unlimited';
          const expiry = client.expiryTime > 0
            ? new Date(client.expiryTime).toLocaleDateString('en-GB')
            : 'Unlimited';
          const now = Date.now();
          const isExpired = client.expiryTime > 0 && client.expiryTime < now;
          const daysLeft = client.expiryTime > 0
            ? Math.max(0, Math.ceil((client.expiryTime - now) / (1000 * 60 * 60 * 24)))
            : '∞';
          const status = !client.enable ? '🔴 Disabled' : isExpired ? '🔴 Expired' : '🟢 Active';

          text +=
            `\n📊 <b>Latest Key:</b> ${status}\n` +
            `📅 <b>Expiry:</b> ${expiry} (${daysLeft} days left)\n` +
            `📦 <b>Data Used:</b> ${usedGB} GB / ${totalGB} GB\n`;
        }
      } catch {
        text += `\n<i>Usage data ယူ၍မရပါ</i>\n`;
      }
    }

    return bot.editMessageText(text, {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: getBackKeyboard(),
    });
  }

  // ─── Rating Menu ──────────────────────────────────────────
  if (data === 'rating_menu') {
    const fs = require('fs');
    const ratingsFile = './data/ratings.json';
    let ratings = {};
    try { ratings = JSON.parse(fs.readFileSync(ratingsFile, 'utf8')); } catch {}

    const myRating = ratings[userId];
    let text = `⭐ <b>Rating</b>\n\n`;
    if (myRating) {
      text += `သင့် Rating: ${'⭐'.repeat(myRating.stars)} (${myRating.stars}/5)\n`;
      if (myRating.feedback) text += `💬 "${myRating.feedback}"\n`;
      text += `\nRating ပြောင်းချင်ရင် အောက်က ⭐ နှိပ်ပါ။`;
    } else {
      text += `Bot ကို Rating ပေးပါ!\nအောက်က ⭐ နှိပ်ပါ:`;
    }

    return bot.editMessageText(text, {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '⭐', callback_data: 'rate_1' },
            { text: '⭐⭐', callback_data: 'rate_2' },
            { text: '⭐⭐⭐', callback_data: 'rate_3' },
          ],
          [
            { text: '⭐⭐⭐⭐', callback_data: 'rate_4' },
            { text: '⭐⭐⭐⭐⭐', callback_data: 'rate_5' },
          ],
          [{ text: '« Back to Menu', callback_data: 'back_to_menu' }],
        ],
      },
    });
  }

  if (data.startsWith('rate_')) {
    const stars = parseInt(data.replace('rate_', ''));
    const fs = require('fs');
    const ratingsFile = './data/ratings.json';
    let ratings = {};
    try { ratings = JSON.parse(fs.readFileSync(ratingsFile, 'utf8')); } catch {}

    ratings[userId] = {
      stars,
      date: new Date().toISOString(),
      name: [query.from.first_name, query.from.last_name].filter(Boolean).join(' '),
      username: query.from.username || '',
    };
    fs.writeFileSync(ratingsFile, JSON.stringify(ratings, null, 2));

    logUserAction(bot, query.from, '⭐ Rating', `${stars}/5 stars`);

    const text =
      `⭐ <b>Rating ပေးပြီးပါပြီ!</b>\n\n` +
      `သင့် Rating: ${'⭐'.repeat(stars)} (${stars}/5)\n\n` +
      `💬 Feedback ရေးချင်ရင် အောက်က button နှိပ်ပါ:`;

    return bot.editMessageText(text, {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💬 Feedback ရေးမယ်', callback_data: 'rate_feedback' }],
          [{ text: '« Back to Menu', callback_data: 'back_to_menu' }],
        ],
      },
    });
  }

  if (data === 'rate_feedback') {
    const { setRatingFeedbackState } = require('./middleware/userLogger');
    setRatingFeedbackState(userId);
    return bot.editMessageText(
      `💬 <b>Feedback</b>\n\nBot အကြောင်း feedback ရေးပေးပါ:`,
      {
        chat_id: chatId, message_id: messageId,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '« Cancel', callback_data: 'rating_menu' }],
          ],
        },
      }
    );
  }

  // ─── Contact Admin ─────────────────────────────────────────
  if (data === 'contact_admin') {
    const adminContact = process.env.ADMIN_CONTACT || 'https://t.me/JackFrozt_2k4';

    const text =
      `📞 *Admin ဆက်သွယ်ရန်*\n\n` +
      `အကူအညီလိုအပ်ပါက Admin ထံ ဆက်သွယ်ပါ။\n\n` +
      `*ဆက်သွယ်နိုင်တဲ့ အကြောင်းအရာများ:*\n` +
      `• Key သက်တမ်းတိုးခြင်း\n` +
      `• Premium key ဝယ်ယူခြင်း\n` +
      `• Credit ဝယ်ယူခြင်း\n` +
      `• ချိတ်ဆက်မှု ပြဿနာများ\n` +
      `• အခြား အကူအညီများ`;

    return bot.editMessageText(text, {
      chat_id: chatId, message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📞 Admin ထံ ဆက်သွယ်မယ်', url: adminContact }],
          [{ text: '« Back to Menu', callback_data: 'back_to_menu' }],
        ],
      },
    });
  }
}

module.exports = { handleCallback };
