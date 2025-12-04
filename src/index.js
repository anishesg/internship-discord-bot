import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import { monitorRepository, checkForUpdates } from './github-monitor.js';
import { handleInteraction, handleReactionAdd, handleReactionRemove } from './interactions.js';
import { handleMessageCommand } from './commands.js';
import { createDailyRecapEmbed } from './gamification.js';
import { updateStreak, resetWeeklyPoints, getAllUsers, updateUser } from './database.js';

dotenv.config();

// Validate environment variables
if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN is not set in .env file');
  process.exit(1);
}

if (!process.env.DISCORD_CHANNEL_ID) {
  console.error('❌ DISCORD_CHANNEL_ID is not set in .env file');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

// Store channel ID globally for commands
let monitoringChannelId = process.env.DISCORD_CHANNEL_ID;

/**
 * Set up daily recap functionality
 */
function setupDailyRecap(client, channelId) {
  // Calculate time until next midnight UTC
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  
  const msUntilMidnight = tomorrow.getTime() - now.getTime();
  
  console.log(`⏰ Daily recap scheduled for ${tomorrow.toISOString()} (in ${Math.round(msUntilMidnight / 1000 / 60)} minutes)`);
  
  // Schedule first recap
  setTimeout(async () => {
    await runDailyRecap(client, channelId);
    
    // Then schedule every 24 hours
    setInterval(async () => {
      await runDailyRecap(client, channelId);
    }, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
}

/**
 * Run daily recap
 */
async function runDailyRecap(client, channelId) {
  try {
    console.log('📅 Running daily recap...');
    
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      console.error('❌ Channel not found for daily recap');
      return;
    }
    
    // Create daily recap first (before resetting points)
    const embed = await createDailyRecapEmbed();
    await channel.send({ embeds: [embed] });
    
    // Update streaks for all users and reset points
    const users = await getAllUsers();
    const today = new Date().toISOString().split('T')[0];
    
    for (const userId in users) {
      const user = users[userId];
      const lastActive = user.lastActiveDate;
      
      // If user didn't earn points today and last active was before today, reset streak
      if (user.todayPoints === 0 && lastActive && lastActive !== today) {
        const lastDate = new Date(lastActive);
        const todayDate = new Date(today);
        const daysDiff = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));
        
        if (daysDiff > 1) {
          await updateUser(userId, { streakDays: 0 });
        }
      } else if (user.todayPoints > 0) {
        // Update streak if they earned points
        await updateStreak(userId, user.todayPoints);
      }
      
      // Reset today's points for next day
      await updateUser(userId, { todayPoints: 0 });
    }
    
    console.log('✅ Daily recap sent');
  } catch (error) {
    console.error('❌ Error running daily recap:', error);
  }
}

/**
 * Set up weekly reset
 */
function setupWeeklyReset() {
  // Calculate time until next Monday at midnight UTC
  const now = new Date();
  const nextMonday = new Date(now);
  const daysUntilMonday = (1 + 7 - now.getUTCDay()) % 7 || 7;
  nextMonday.setUTCDate(now.getUTCDate() + daysUntilMonday);
  nextMonday.setUTCHours(0, 0, 0, 0);
  
  const msUntilMonday = nextMonday.getTime() - now.getTime();
  
  console.log(`⏰ Weekly reset scheduled for ${nextMonday.toISOString()} (in ${Math.round(msUntilMonday / 1000 / 60 / 60)} hours)`);
  
  // Schedule first reset
  setTimeout(async () => {
    await resetWeeklyPoints();
    console.log('✅ Weekly points reset');
    
    // Then schedule every 7 days
    setInterval(async () => {
      await resetWeeklyPoints();
      console.log('✅ Weekly points reset');
    }, 7 * 24 * 60 * 60 * 1000);
  }, msUntilMonday);
}

client.once('ready', async () => {
  console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
  console.log(`📊 Monitoring: ${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}`);
  
  // Register slash commands
  try {
    const commands = [
      new SlashCommandBuilder()
        .setName('check')
        .setDescription('Manually check for new internship listings'),
      new SlashCommandBuilder()
        .setName('stats')
        .setDescription('Show bot statistics'),
    ].map(command => command.toJSON());

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const clientId = client.user.id;

    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands },
    );

    console.log('✅ Slash commands registered');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
  
  // Start monitoring the repository
  monitorRepository(client, monitoringChannelId);
  
  // Set up daily recap (runs at midnight UTC)
  setupDailyRecap(client, monitoringChannelId);
  
  // Set up weekly reset (runs on Monday at midnight UTC)
  setupWeeklyReset();
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
    await handleInteraction(interaction, client);
  } else if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'check') {
      await interaction.deferReply({ ephemeral: true });
      try {
        await checkForUpdates(client, monitoringChannelId);
        await interaction.editReply('✅ Checked for new listings!');
      } catch (error) {
        console.error('Error in check command:', error);
        await interaction.editReply('❌ Error checking for listings. Check console for details.');
      }
    } else if (interaction.commandName === 'stats') {
      const embed = new EmbedBuilder()
        .setTitle('📊 Bot Statistics')
        .setDescription(
          `**Repository:** ${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}\n` +
          `**Branch:** ${process.env.GITHUB_BRANCH || 'dev'}\n` +
          `**Poll Interval:** ${(parseInt(process.env.POLL_INTERVAL) || 300000) / 1000} seconds\n` +
          `**Channel:** <#${monitoringChannelId}>`
        )
        .setColor(0x5865F2)
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
});

// Handle message-based commands (e.g., ?today, ?search)
client.on('messageCreate', async (message) => {
  // Ignore messages from bots
  if (message.author.bot) return;
  
  // Handle commands
  await handleMessageCommand(message);
});

// Handle reaction events for task completion
client.on('messageReactionAdd', async (reaction, user) => {
  try {
    // Fetch partial reactions
    if (reaction.partial) {
      await reaction.fetch();
    }
    if (user.partial) {
      await user.fetch();
    }
    
    await handleReactionAdd(reaction, user);
  } catch (error) {
    console.error('Error handling reaction add:', error);
  }
});

client.on('messageReactionRemove', async (reaction, user) => {
  try {
    // Fetch partial reactions
    if (reaction.partial) {
      await reaction.fetch();
    }
    if (user.partial) {
      await user.fetch();
    }
    
    await handleReactionRemove(reaction, user);
  } catch (error) {
    console.error('Error handling reaction remove:', error);
  }
});

client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error('❌ Failed to login:', error);
  process.exit(1);
});

// Graceful shutdown handling for deployment platforms
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  client.destroy();
  process.exit(0);
});

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  client.destroy();
  process.exit(1);
});

