# VPN Key Bot

A Telegram bot for generating and managing VPN keys and configs. Built with Node.js and [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api).

## Features

### VPN Key Generation
- **UUID** - Generate random UUIDs for VMess/VLESS
- **Password** - Secure random passwords
- **Base64 Key** - Base64-encoded keys
- **Hex Key** - Hexadecimal keys
- **All Keys** - Generate all key types at once

### Config Generation
- **VMess** - Generate VMess configs with import links
- **VLESS** - Generate VLESS configs with import links
- **Shadowsocks** - Generate SS configs (aes-256-gcm, aes-128-gcm, chacha20-ietf-poly1305)
- **V2Ray Full JSON** - Complete V2Ray client configuration files

### Key Management
- Auto-save generated keys and configs
- View all saved keys
- Delete keys

### Server List
- Browse available VPN servers
- Generate configs for specific servers
- Server status monitoring

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Start the bot & show main menu |
| `/help` | Show help message |
| `/genkey` | Generate VPN keys |
| `/mykeys` | View saved keys |
| `/servers` | Browse VPN servers |
| `/vmess` | Generate VMess config |
| `/vless` | Generate VLESS config |
| `/ss` | Generate Shadowsocks config |
| `/menu` | Show main menu |

## Setup

### 1. Create a Bot

1. Open [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow the instructions
3. Copy the bot token

### 2. Install

```bash
npm install
```

### 3. Configure

```bash
cp .env.example .env
```

Edit `.env`:
```
TELEGRAM_BOT_TOKEN=your_bot_token_here
```

### 4. Configure Servers

Edit `data/servers.json` to add your VPN servers. Default servers are created on first run.

### 5. Run

```bash
# Production
npm start

# Development (auto-restart)
npm run dev
```

## Project Structure

```
telegram-bot/
├── src/
│   ├── bot.js                  # Main entry point
│   ├── commands.js             # Command handlers
│   ├── callbacks.js            # Inline keyboard callback handlers
│   ├── keyboards.js            # Keyboard layouts
│   └── vpn/
│       ├── keyGenerator.js     # Key generation (UUID, password, base64, hex)
│       ├── keyStore.js         # Key storage (JSON file)
│       ├── serverList.js       # Server list management
│       └── configGenerator.js  # VMess/VLESS/SS/V2Ray config generation
├── data/
│   ├── keys.json               # Stored keys (auto-created)
│   └── servers.json            # Server list (auto-created)
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Adding Custom Servers

Edit `data/servers.json`:

```json
{
  "servers": [
    {
      "id": 1,
      "name": "My Server",
      "host": "my-server.com",
      "port": 443,
      "country": "SG",
      "status": "online",
      "protocols": ["vmess", "vless", "shadowsocks"]
    }
  ]
}
```

## License

ISC
