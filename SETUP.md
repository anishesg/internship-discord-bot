# Quick Setup Guide

## Step 1: Create Discord Bot

1. Go to https://discord.com/developers/applications
2. Click "New Application" → Name it (e.g., "Internship Bot")
3. Go to "Bot" section → Click "Add Bot"
4. Under "Privileged Gateway Intents", enable:
   - ✅ MESSAGE CONTENT INTENT
5. Click "Reset Token" → Copy the token (you'll need this)
6. Go to "OAuth2" → "URL Generator"
   - Select scopes: `bot` and `applications.commands`
   - Select permissions:
     - Send Messages
     - Embed Links
     - Read Message History
     - Use External Emojis
     - Add Reactions
   - Copy the generated URL
7. Open the URL in your browser → Select your server → Authorize

## Step 2: Get Channel ID

1. In Discord, go to Settings → Advanced → Enable "Developer Mode"
2. Right-click the channel where you want notifications
3. Click "Copy ID"

## Step 3: Configure Bot

1. Copy `env.example` to `.env`:
   ```bash
   cp env.example .env
   ```

2. Edit `.env` and fill in:
   ```
   DISCORD_TOKEN=your_bot_token_here
   DISCORD_CHANNEL_ID=your_channel_id_here
   ```

## Step 4: Install & Run

```bash
npm install
npm start
```

The bot will:
- Initialize and mark all current listings as "seen"
- Start monitoring for new listings every 5 minutes
- Send formatted messages when new internships are posted

## Commands

- `/check` - Manually check for new listings
- `/stats` - Show bot statistics

## Troubleshooting

**Bot doesn't respond:**
- Check that the bot has proper permissions in your server
- Verify the channel ID is correct
- Make sure MESSAGE CONTENT INTENT is enabled

**No listings detected:**
- The bot marks all current listings as "seen" on first run
- Only NEW listings after the bot starts will be posted
- Use `/check` to manually trigger a check

**Rate limiting:**
- The bot includes delays between messages
- If you see rate limit errors, increase the delay in `github-monitor.js`

