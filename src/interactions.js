import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { EmbedBuilder } from 'discord.js';
import { getUserTasks, completeTask, uncompleteTask, getUser } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '../data');
const applicationsFile = path.join(dataDir, 'applications.json');

/**
 * Load applications data
 */
async function loadApplications() {
  try {
    await fs.mkdir(dataDir, { recursive: true });
    const content = await fs.readFile(applicationsFile, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    console.error('Error loading applications:', error);
    return {};
  }
}

/**
 * Save applications data
 */
async function saveApplications(applications) {
  try {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(applicationsFile, JSON.stringify(applications, null, 2));
  } catch (error) {
    console.error('Error saving applications:', error);
  }
}

/**
 * Record an application
 */
async function recordApplication(userId, listingId) {
  const applications = await loadApplications();
  
  if (!applications[listingId]) {
    applications[listingId] = [];
  }
  
  if (!applications[listingId].includes(userId)) {
    applications[listingId].push(userId);
    await saveApplications(applications);
    return true;
  }
  
  return false;
}

/**
 * Check if user has already applied
 */
async function hasApplied(userId, listingId) {
  const applications = await loadApplications();
  return applications[listingId]?.includes(userId) || false;
}

/**
 * Handle button interactions
 */
export async function handleInteraction(interaction, client) {
  if (!interaction.isButton()) {
    return;
  }
  
  const customId = interaction.customId;
  
  if (customId.startsWith('apply_')) {
    const listingId = customId.replace('apply_', '');
    const userId = interaction.user.id;
    const username = interaction.user.username;
    
    // Check if already applied
    const alreadyApplied = await hasApplied(userId, listingId);
    
    if (alreadyApplied) {
      await interaction.reply({
        content: `✅ You've already marked this application as submitted!`,
        ephemeral: true,
      });
      return;
    }
    
    // Record the application
    const isNew = await recordApplication(userId, listingId);
    
    if (isNew) {
      // Get the original message to extract listing info
      const originalMessage = interaction.message;
      const embed = originalMessage.embeds[0];
      
      // Send confirmation to channel
      const confirmationEmbed = new EmbedBuilder()
        .setTitle('🎉 Application Recorded!')
        .setDescription(`${username} has applied to:\n**${embed.title}**`)
        .setColor(0x57F287)
        .setTimestamp();
      
      await interaction.channel.send({ embeds: [confirmationEmbed] });
      
      // Reply to the user
      await interaction.reply({
        content: `✅ Your application has been recorded! Good luck! 🍀`,
        ephemeral: true,
      });
      
      console.log(`📝 ${username} marked application: ${listingId}`);
    } else {
      await interaction.reply({
        content: `❌ Error recording application. Please try again.`,
        ephemeral: true,
      });
    }
  }
}

/**
 * Handle reaction-based task completion
 */
export async function handleReactionAdd(reaction, user) {
  // Ignore bot reactions
  if (user.bot) return;
  
  // Check if this is a task message (has task embed)
  const message = reaction.message;
  if (!message.embeds || message.embeds.length === 0) return;
  
  const embed = message.embeds[0];
  if (!embed.title || !embed.title.includes('Your Tasks')) return;
  
  // Map emoji to task number
  const emojiToNumber = {
    '1️⃣': 1,
    '2️⃣': 2,
    '3️⃣': 3,
    '4️⃣': 4,
    '5️⃣': 5,
    '6️⃣': 6,
    '7️⃣': 7,
    '8️⃣': 8,
    '9️⃣': 9,
    '🔟': 10,
  };
  
  const emoji = reaction.emoji.name;
  const taskNum = emojiToNumber[emoji];
  
  if (!taskNum) {
    // Check for checkmark (mark all as done)
    if (emoji === '✅') {
      // Mark all incomplete tasks as done
      const userId = user.id;
      const today = new Date().toISOString().split('T')[0];
      const tasks = await getUserTasks(userId, today);
      
      const incompleteTasks = tasks.filter(t => !t.completed);
      if (incompleteTasks.length === 0) {
        return;
      }
      
      for (const task of incompleteTasks) {
        await completeTask(userId, today, task.id);
      }
      
      const userData = await getUser(userId, user.username);
      await message.channel.send(`✅ ${user.username} completed all tasks! Total: ${userData.todayPoints} pts`);
    }
    return;
  }
  
  // Complete the specific task
  const userId = user.id;
  const today = new Date().toISOString().split('T')[0];
  const tasks = await getUserTasks(userId, today);
  
  if (taskNum > tasks.length) {
    return;
  }
  
  const task = tasks[taskNum - 1];
  
  if (task.completed) {
    return; // Already completed
  }
  
  const completedTask = await completeTask(userId, today, task.id);
  
  if (completedTask) {
    const userData = await getUser(userId, user.username);
    await message.channel.send(`✅ ${user.username} completed task ${taskNum}: **${task.description}** (+${task.points} pts)`);
  }
}

/**
 * Handle reaction removal (uncomplete task)
 */
export async function handleReactionRemove(reaction, user) {
  // Ignore bot reactions
  if (user.bot) return;
  
  // Check if this is a task message
  const message = reaction.message;
  if (!message.embeds || message.embeds.length === 0) return;
  
  const embed = message.embeds[0];
  if (!embed.title || !embed.title.includes('Your Tasks')) return;
  
  const emojiToNumber = {
    '1️⃣': 1,
    '2️⃣': 2,
    '3️⃣': 3,
    '4️⃣': 4,
    '5️⃣': 5,
    '6️⃣': 6,
    '7️⃣': 7,
    '8️⃣': 8,
    '9️⃣': 9,
    '🔟': 10,
  };
  
  const emoji = reaction.emoji.name;
  const taskNum = emojiToNumber[emoji];
  
  if (!taskNum) return;
  
  // Uncomplete the task
  const userId = user.id;
  const today = new Date().toISOString().split('T')[0];
  const tasks = await getUserTasks(userId, today);
  
  if (taskNum > tasks.length) {
    return;
  }
  
  const task = tasks[taskNum - 1];
  
  if (!task.completed) {
    return; // Not completed
  }
  
  await uncompleteTask(userId, today, task.id);
  await message.channel.send(`↩️ ${user.username} unmarked task ${taskNum}: **${task.description}** (-${task.points} pts)`);
}

