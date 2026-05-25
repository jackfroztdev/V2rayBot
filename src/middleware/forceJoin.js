const FORCE_JOIN_CHANNEL = process.env.FORCE_JOIN_CHANNEL || '';

async function checkMembership(bot, userId) {
  if (!FORCE_JOIN_CHANNEL) return true;

  try {
    const member = await bot.getChatMember(FORCE_JOIN_CHANNEL, userId);
    console.log(`Force join check: user=${userId} status=${member.status}`);
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (err) {
    console.error(`Force join check error for user=${userId}: ${err.message}`);
    return false;
  }
}

function getForceJoinKeyboard() {
  const channelUrl = FORCE_JOIN_CHANNEL.startsWith('@')
    ? `https://t.me/${FORCE_JOIN_CHANNEL.slice(1)}`
    : `https://t.me/${FORCE_JOIN_CHANNEL}`;

  return {
    inline_keyboard: [
      [{ text: '📢 Channel Join မယ်', url: channelUrl }],
      [{ text: '✅ Join ပြီးပါပြီ', callback_data: 'check_join' }],
    ],
  };
}

function getForceJoinMessage() {
  return (
    `⚠️ *Channel Join လိုအပ်ပါတယ်!*\n\n` +
    `Bot ကို အသုံးပြုဖို့ ${FORCE_JOIN_CHANNEL} channel ကို join ပေးပါ။\n\n` +
    `Join ပြီးရင် *"✅ Join ပြီးပါပြီ"* ကို နှိပ်ပါ။`
  );
}

function isForceJoinEnabled() {
  return !!FORCE_JOIN_CHANNEL;
}

module.exports = {
  checkMembership,
  getForceJoinKeyboard,
  getForceJoinMessage,
  isForceJoinEnabled,
};
