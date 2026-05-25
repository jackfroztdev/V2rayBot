const { getMainMenuKeyboard } = require('./keyboards');

function handleCommand(bot, msg, command) {
  const chatId = msg.chat.id;
  const userName = msg.from.first_name || 'User';

  switch (command) {
    case 'start':
      bot.sendMessage(chatId,
        `🔐 *VPN Key Bot*\n\n` +
        `မင်္ဂလာပါ ${userName}! 👋\n\n` +
        `ဒီ Bot မှာ VPN Key ထုတ်ယူနိုင်ပါတယ်။\n\n` +
        `🎁 *Trial Key* — Free trial key ထုတ်ယူရန်\n` +
        `📦 *My Key* — ယူထားတဲ့ key ပြန်ကြည့်ရန်\n` +
        `👤 *My Account* — ကိုယ့်အကောင့် အချက်အလက်\n` +
        `📞 *Admin ဆက်သွယ်ရန်* — အကူအညီ တောင်းခံရန်\n\n` +
        `အောက်က menu ကနေ ရွေးချယ်ပါ 👇`,
        { parse_mode: 'Markdown', reply_markup: getMainMenuKeyboard() }
      );
      break;

    case 'help':
      bot.sendMessage(chatId,
        `📖 *VPN Key Bot - Help*\n\n` +
        `*Commands:*\n` +
        `/start - Bot စတင်ရန်\n` +
        `/trial - Trial Key ထုတ်ယူရန်\n` +
        `/mykey - ကိုယ့် Key ကြည့်ရန်\n` +
        `/account - ကိုယ့်အကောင့် ကြည့်ရန်\n` +
        `/id - ကိုယ့် info အပြည့်အစုံ ကြည့်ရန်\n` +
        `/menu - Menu ပြရန်`,
        { parse_mode: 'Markdown' }
      );
      break;

    case 'menu':
      bot.sendMessage(chatId, '🔐 *VPN Key Bot*\n\nရွေးချယ်ပါ:', {
        parse_mode: 'Markdown',
        reply_markup: getMainMenuKeyboard(),
      });
      break;

    default:
      bot.sendMessage(chatId, 'Unknown command. Type /help for available commands.');
  }
}

module.exports = { handleCommand };
