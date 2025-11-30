# Deployment Guide

This guide covers deploying your Discord bot to various hosting platforms so it can run 24/7 without your computer.

## 🚀 Recommended: Railway (Easiest & Free Tier Available)

Railway is the easiest option with a generous free tier.

### Steps:

1. **Sign up at [Railway.app](https://railway.app)** (use GitHub to sign in)

2. **Create a New Project**
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Connect your GitHub account
   - Select this repository

3. **Configure Environment Variables**
   - Go to your project → Variables tab
   - Add these variables:
     ```
     DISCORD_TOKEN=your_bot_token_here
     DISCORD_CHANNEL_ID=your_channel_id_here
     GITHUB_REPO_OWNER=SimplifyJobs
     GITHUB_REPO_NAME=Summer2026-Internships
     GITHUB_BRANCH=dev
     POLL_INTERVAL=300000
     ```

4. **Deploy**
   - Railway will automatically detect it's a Node.js project
   - It will run `npm install` and `npm start`
   - Your bot should be live!

5. **Monitor**
   - Check the "Deployments" tab for logs
   - The bot will restart automatically if it crashes

**Free Tier:** $5 credit/month (usually enough for a small bot)

---

## 🌐 Alternative: Render (Free Tier Available)

Render offers a free tier with some limitations.

### Steps:

1. **Sign up at [Render.com](https://render.com)** (use GitHub to sign in)

2. **Create a New Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Select this repository

3. **Configure Settings**
   - **Name:** internship-discord-bot (or any name)
   - **Region:** Choose closest to you
   - **Branch:** main (or your default branch)
   - **Root Directory:** (leave empty)
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`

4. **Add Environment Variables**
   - Scroll to "Environment Variables"
   - Add all variables from your `.env` file:
     ```
     DISCORD_TOKEN
     DISCORD_CHANNEL_ID
     GITHUB_REPO_OWNER
     GITHUB_REPO_NAME
     GITHUB_BRANCH
     POLL_INTERVAL
     ```

5. **Deploy**
   - Click "Create Web Service"
   - Wait for deployment to complete

**Free Tier:** 
- Spins down after 15 minutes of inactivity (not ideal for bots)
- Upgrade to paid ($7/month) for always-on

---

## 🐳 Alternative: Fly.io (Free Tier Available)

Fly.io offers a generous free tier with always-on capability.

### Steps:

1. **Install Fly CLI**
   ```bash
   # macOS
   curl -L https://fly.io/install.sh | sh
   
   # Or use Homebrew
   brew install flyctl
   ```

2. **Sign up and Login**
   ```bash
   fly auth signup
   # Or if you have an account:
   fly auth login
   ```

3. **Initialize Fly.io in your project**
   ```bash
   fly launch
   ```
   - Follow the prompts
   - Don't deploy yet (we need to set secrets first)

4. **Set Environment Variables (Secrets)**
   ```bash
   fly secrets set DISCORD_TOKEN=your_bot_token_here
   fly secrets set DISCORD_CHANNEL_ID=your_channel_id_here
   fly secrets set GITHUB_REPO_OWNER=SimplifyJobs
   fly secrets set GITHUB_REPO_NAME=Summer2026-Internships
   fly secrets set GITHUB_BRANCH=dev
   fly secrets set POLL_INTERVAL=300000
   ```

5. **Deploy**
   ```bash
   fly deploy
   ```

6. **Check Status**
   ```bash
   fly status
   fly logs
   ```

**Free Tier:** 3 shared-cpu-1x VMs (256MB RAM each) - perfect for Discord bots!

---

## 📦 Alternative: Replit (Free, but spins down)

Replit is easy but has limitations for always-on bots.

### Steps:

1. **Sign up at [Replit.com](https://replit.com)**

2. **Create a New Repl**
   - Click "Create Repl"
   - Choose "Node.js" template
   - Name it "internship-discord-bot"

3. **Upload Your Code**
   - Copy all files from this project into the Repl
   - Or connect via GitHub

4. **Set Secrets**
   - Click the "Secrets" tab (lock icon)
   - Add all environment variables

5. **Run**
   - Click "Run"
   - The bot will start

**Note:** Free tier spins down after inactivity. Consider upgrading or using a "keep-alive" service.

---

## 🔧 Alternative: DigitalOcean App Platform

### Steps:

1. **Sign up at [DigitalOcean](https://www.digitalocean.com)**

2. **Create App**
   - Go to App Platform
   - Connect GitHub repository
   - Select this repo

3. **Configure**
   - Environment: Node.js
   - Build Command: `npm install`
   - Run Command: `npm start`
   - Add all environment variables

4. **Deploy**
   - Choose plan (Basic plan starts at $5/month)

---

## 💡 Tips for All Platforms

1. **Keep Your Bot Token Secret**
   - Never commit `.env` to GitHub
   - Always use environment variables/secrets

2. **Monitor Logs**
   - Check logs regularly to ensure bot is running
   - Set up alerts if available

3. **Handle Restarts**
   - The bot will automatically restart on crashes
   - On first run, it marks all listings as "seen"

4. **Data Persistence**
   - The `data/` folder will persist on most platforms
   - Some platforms may require external storage for persistence

5. **Rate Limiting**
   - The bot includes delays to avoid rate limits
   - If you see rate limit errors, increase delays

---

## 🎯 Quick Comparison

| Platform | Free Tier | Always-On | Ease of Use | Best For |
|----------|-----------|-----------|-------------|----------|
| **Railway** | ✅ $5 credit/month | ✅ Yes | ⭐⭐⭐⭐⭐ | **Recommended** |
| **Fly.io** | ✅ 3 VMs | ✅ Yes | ⭐⭐⭐⭐ | Great free option |
| **Render** | ⚠️ Spins down | ❌ No (free) | ⭐⭐⭐⭐ | Paid plans only |
| **Replit** | ⚠️ Spins down | ❌ No | ⭐⭐⭐⭐⭐ | Learning/testing |
| **DigitalOcean** | ❌ No | ✅ Yes | ⭐⭐⭐ | Production |

**Recommendation:** Start with **Railway** or **Fly.io** for the best free always-on experience!

