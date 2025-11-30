# Internship Discord Bot

A Discord bot that monitors the [Summer2026-Internships](https://github.com/SimplifyJobs/Summer2026-Internships) repository for new internship listings and sends formatted notifications to your Discord channel.

## Features

- 🔍 Monitors GitHub README for new internship listings
- 📝 Sends beautifully formatted messages with job details
- ✅ Interactive buttons to track application status
- 💾 Stores application tracking data locally
- 🔄 Automatic polling for updates

## Setup

### 1. Create a Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to the "Bot" section and click "Add Bot"
4. Under "Privileged Gateway Intents", enable:
   - MESSAGE CONTENT INTENT
5. Copy the bot token
6. Go to "OAuth2" > "URL Generator"
7. Select scopes: `bot` and `applications.commands`
8. Select bot permissions:
   - Send Messages
   - Embed Links
   - Read Message History
   - Use External Emojis
   - Add Reactions
9. Copy the generated URL and open it in your browser to invite the bot to your server

### 2. Get Channel ID

1. Enable Developer Mode in Discord (Settings > Advanced > Developer Mode)
2. Right-click on the channel where you want notifications
3. Click "Copy ID"

### 3. Configure the Bot

1. Copy `.env.example` to `.env`
2. Fill in your Discord bot token and channel ID
3. Adjust polling interval if needed (default: 5 minutes)

### 4. Install Dependencies

```bash
npm install
```

### 5. Run the Bot

```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## How It Works

1. The bot polls the GitHub repository's README file at regular intervals
2. It parses the markdown table to extract internship listings
3. When new listings are detected, it sends formatted messages to Discord
4. Each message includes:
   - Company name
   - Role title
   - Location
   - Application link
   - An "I Applied" button to track your applications

## Configuration

Edit `.env` to customize:
- `POLL_INTERVAL`: How often to check for updates (in milliseconds)
- `GITHUB_BRANCH`: Which branch to monitor (default: `dev`)
- `TRACKING_FILE`: Where to store application tracking data

## Application Tracking

When you click the "I Applied" button:
- Your application is recorded in the tracking file
- A confirmation message is sent to the channel
- The button is disabled for you (others can still use it)

## Deployment

Want to run this bot 24/7 without keeping your computer on? Check out **[DEPLOYMENT.md](./DEPLOYMENT.md)** for step-by-step guides to deploy on:

- 🚂 **Railway** (Recommended - Easy & Free tier available)
- 🪰 **Fly.io** (Great free tier with always-on)
- 🌐 **Render** (Free tier available)
- 📦 **Replit** (Easy but spins down on free tier)
- And more!

All deployment configurations are included in this repository.

## Notes

- The bot stores application tracking data in `data/applications.json`
- Make sure the bot has proper permissions in your Discord server
- The bot needs internet access to fetch the GitHub README
- For production deployment, use environment variables instead of `.env` file

