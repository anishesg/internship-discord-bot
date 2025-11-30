import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import { monitorRepository, checkForUpdates } from './github-monitor.js';
import { handleInteraction } from './interactions.js';

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
  ],
});

// Store channel ID globally for commands
let monitoringChannelId = process.env.DISCORD_CHANNEL_ID;

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

