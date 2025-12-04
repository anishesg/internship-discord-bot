import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getAllListings } from './github-monitor.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseTasks } from './llm-parser.js';
import { getUserTasks, setUserTasks, completeTask, uncompleteTask, getUser, updateUser, getAllUsers } from './database.js';
import { createLeaderboardEmbed, createTeamLeaderboardEmbed, createProfileEmbed } from './gamification.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '../data');
const applicationsFile = path.join(dataDir, 'applications.json');

/**
 * Parse age string (e.g., "1d", "2d", "3mo") to days
 */
function parseAgeToDays(ageStr) {
  if (!ageStr) return Infinity;
  
  const age = ageStr.trim().toLowerCase();
  
  if (age.includes('mo')) {
    const months = parseInt(age) || 0;
    return months * 30;
  } else if (age.includes('d')) {
    return parseInt(age) || 0;
  } else if (age.includes('h')) {
    return 0; // Less than a day
  }
  
  return Infinity;
}

/**
 * Check if listing was posted today (age is 0-1 days)
 */
function isPostedToday(ageStr) {
  const days = parseAgeToDays(ageStr);
  return days < 1;
}

/**
 * Check if listing was posted recently (within last N days)
 */
function isPostedRecently(ageStr, days = 7) {
  const ageDays = parseAgeToDays(ageStr);
  return ageDays <= days;
}

/**
 * Load user applications
 */
async function getUserApplications(userId) {
  try {
    await fs.mkdir(dataDir, { recursive: true });
    const content = await fs.readFile(applicationsFile, 'utf-8');
    const applications = JSON.parse(content);
    
    // Find all listing IDs where user has applied
    const userListingIds = [];
    for (const [listingId, userIds] of Object.entries(applications)) {
      if (userIds.includes(userId)) {
        userListingIds.push(listingId);
      }
    }
    
    return userListingIds;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    console.error('Error loading user applications:', error);
    return [];
  }
}

/**
 * Create embed for a listing
 */
function createListingEmbed(listing) {
  return new EmbedBuilder()
    .setTitle(`${listing.emoji || '💼'} ${listing.company} - ${listing.role}`)
    .setDescription(
      `**Category:** ${listing.category || '💼 General'}\n` +
      `📍 **Location:** ${listing.location}\n` +
      `⏰ **Posted:** ${listing.age} ago\n\n` +
      `[🔗 Apply Here](${listing.applyLink})`
    )
    .setColor(0x5865F2)
    .setURL(listing.applyLink)
    .setTimestamp();
}

/**
 * Create button row for application tracking
 */
function createButtonRow(listingId) {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`apply_${listingId}`)
        .setLabel('I Applied')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅')
    );
}

/**
 * Handle ?today command
 */
export async function handleTodayCommand(message) {
  try {
    await message.channel.sendTyping();
    
    const allListings = await getAllListings();
    const todayListings = allListings.filter(listing => isPostedToday(listing.age));
    
    if (todayListings.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('📅 Today\'s Internships')
        .setDescription('No new internships posted today. Check back later!')
        .setColor(0xFEE75C)
        .setTimestamp();
      
      return await message.reply({ embeds: [embed] });
    }
    
    const embed = new EmbedBuilder()
      .setTitle(`📅 Today's Internships (${todayListings.length})`)
      .setDescription(`Found **${todayListings.length}** new internship${todayListings.length > 1 ? 's' : ''} posted today!`)
      .setColor(0x57F287)
      .setTimestamp();
    
    await message.reply({ embeds: [embed] });
    
    // Send each listing
    for (const listing of todayListings) {
      const listingEmbed = createListingEmbed(listing);
      const buttonRow = createButtonRow(listing.id);
      
      await message.channel.send({
        embeds: [listingEmbed],
        components: [buttonRow],
      });
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (error) {
    console.error('Error in ?today command:', error);
    await message.reply('❌ Error fetching today\'s internships. Please try again later.');
  }
}

/**
 * Handle ?recent command
 */
export async function handleRecentCommand(message, days = 7) {
  try {
    await message.channel.sendTyping();
    
    const allListings = await getAllListings();
    const recentListings = allListings.filter(listing => isPostedRecently(listing.age, days));
    
    if (recentListings.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle(`📆 Recent Internships (Last ${days} days)`)
        .setDescription(`No internships posted in the last ${days} days.`)
        .setColor(0xFEE75C)
        .setTimestamp();
      
      return await message.reply({ embeds: [embed] });
    }
    
    // Sort by age (newest first)
    recentListings.sort((a, b) => parseAgeToDays(a.age) - parseAgeToDays(b.age));
    
    const embed = new EmbedBuilder()
      .setTitle(`📆 Recent Internships (Last ${days} days)`)
      .setDescription(`Found **${recentListings.length}** internship${recentListings.length > 1 ? 's' : ''} posted in the last ${days} days.`)
      .setColor(0x5865F2)
      .setTimestamp();
    
    await message.reply({ embeds: [embed] });
    
    // Send listings (limit to 20 to avoid spam)
    const listingsToShow = recentListings.slice(0, 20);
    
    for (const listing of listingsToShow) {
      const listingEmbed = createListingEmbed(listing);
      const buttonRow = createButtonRow(listing.id);
      
      await message.channel.send({
        embeds: [listingEmbed],
        components: [buttonRow],
      });
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (recentListings.length > 20) {
      await message.channel.send(`*Showing first 20 of ${recentListings.length} recent listings. Use \`?search\` to find specific companies.*`);
    }
  } catch (error) {
    console.error('Error in ?recent command:', error);
    await message.reply('❌ Error fetching recent internships. Please try again later.');
  }
}

/**
 * Handle ?search command
 */
export async function handleSearchCommand(message, query) {
  try {
    if (!query || query.trim().length === 0) {
      return await message.reply('❌ Please provide a search term. Usage: `?search <company or role>`');
    }
    
    await message.channel.sendTyping();
    
    const allListings = await getAllListings();
    const searchTerm = query.toLowerCase();
    
    const results = allListings.filter(listing => 
      listing.company.toLowerCase().includes(searchTerm) ||
      listing.role.toLowerCase().includes(searchTerm) ||
      listing.location.toLowerCase().includes(searchTerm) ||
      listing.category.toLowerCase().includes(searchTerm)
    );
    
    if (results.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle(`🔍 Search Results for "${query}"`)
        .setDescription('No internships found matching your search.')
        .setColor(0xFEE75C)
        .setTimestamp();
      
      return await message.reply({ embeds: [embed] });
    }
    
    const embed = new EmbedBuilder()
      .setTitle(`🔍 Search Results for "${query}"`)
      .setDescription(`Found **${results.length}** internship${results.length > 1 ? 's' : ''} matching your search.`)
      .setColor(0x5865F2)
      .setTimestamp();
    
    await message.reply({ embeds: [embed] });
    
    // Send listings (limit to 15)
    const listingsToShow = results.slice(0, 15);
    
    for (const listing of listingsToShow) {
      const listingEmbed = createListingEmbed(listing);
      const buttonRow = createButtonRow(listing.id);
      
      await message.channel.send({
        embeds: [listingEmbed],
        components: [buttonRow],
      });
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (results.length > 15) {
      await message.channel.send(`*Showing first 15 of ${results.length} results. Try a more specific search term.*`);
    }
  } catch (error) {
    console.error('Error in ?search command:', error);
    await message.reply('❌ Error searching internships. Please try again later.');
  }
}

/**
 * Handle ?myapplications command
 */
export async function handleMyApplicationsCommand(message) {
  try {
    await message.channel.sendTyping();
    
    const userId = message.author.id;
    const userListingIds = await getUserApplications(userId);
    
    if (userListingIds.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('📝 Your Applications')
        .setDescription('You haven\'t marked any applications yet. Click the "I Applied" button on internship posts to track them!')
        .setColor(0xFEE75C)
        .setTimestamp();
      
      return await message.reply({ embeds: [embed] });
    }
    
    // Fetch all listings to match with user's applications
    const allListings = await getAllListings();
    const userListings = allListings.filter(listing => 
      userListingIds.includes(listing.id)
    );
    
    const embed = new EmbedBuilder()
      .setTitle(`📝 Your Applications (${userListings.length})`)
      .setDescription(`You've tracked **${userListings.length}** application${userListings.length > 1 ? 's' : ''}.`)
      .setColor(0x57F287)
      .setTimestamp();
    
    await message.reply({ embeds: [embed] });
    
    // Send listings (limit to 20)
    const listingsToShow = userListings.slice(0, 20);
    
    for (const listing of listingsToShow) {
      const listingEmbed = createListingEmbed(listing);
      const buttonRow = createButtonRow(listing.id);
      
      await message.channel.send({
        embeds: [listingEmbed],
        components: [buttonRow],
      });
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (userListings.length > 20) {
      await message.channel.send(`*Showing first 20 of ${userListings.length} applications.*`);
    }
  } catch (error) {
    console.error('Error in ?myapplications command:', error);
    await message.reply('❌ Error fetching your applications. Please try again later.');
  }
}

/**
 * Handle ?category command
 */
export async function handleCategoryCommand(message, category) {
  try {
    if (!category) {
      return await message.reply('❌ Please specify a category. Usage: `?category <category>`\nAvailable: software, product, data, quant, hardware');
    }
    
    await message.channel.sendTyping();
    
    const allListings = await getAllListings();
    const categoryLower = category.toLowerCase();
    
    // Map category aliases
    const categoryMap = {
      'software': 'software engineering',
      'swe': 'software engineering',
      'product': 'product management',
      'pm': 'product management',
      'data': 'data science',
      'ds': 'data science',
      'ai': 'data science',
      'ml': 'data science',
      'quant': 'quantitative finance',
      'finance': 'quantitative finance',
      'hardware': 'hardware engineering',
      'hw': 'hardware engineering',
    };
    
    const searchCategory = categoryMap[categoryLower] || categoryLower;
    
    const results = allListings.filter(listing => 
      listing.category.toLowerCase().includes(searchCategory)
    );
    
    if (results.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle(`📂 Category: ${category}`)
        .setDescription('No internships found in this category.')
        .setColor(0xFEE75C)
        .setTimestamp();
      
      return await message.reply({ embeds: [embed] });
    }
    
    const embed = new EmbedBuilder()
      .setTitle(`📂 Category: ${category} (${results.length})`)
      .setDescription(`Found **${results.length}** internship${results.length > 1 ? 's' : ''} in this category.`)
      .setColor(0x5865F2)
      .setTimestamp();
    
    await message.reply({ embeds: [embed] });
    
    // Send listings (limit to 20)
    const listingsToShow = results.slice(0, 20);
    
    for (const listing of listingsToShow) {
      const listingEmbed = createListingEmbed(listing);
      const buttonRow = createButtonRow(listing.id);
      
      await message.channel.send({
        embeds: [listingEmbed],
        components: [buttonRow],
      });
      
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (results.length > 20) {
      await message.channel.send(`*Showing first 20 of ${results.length} listings. Use \`?search\` to narrow down.*`);
    }
  } catch (error) {
    console.error('Error in ?category command:', error);
    await message.reply('❌ Error fetching category listings. Please try again later.');
  }
}

/**
 * Handle ?stats command
 */
export async function handleStatsCommand(message) {
  try {
    await message.channel.sendTyping();
    
    const allListings = await getAllListings();
    
    // Count by category
    const categoryCounts = {};
    allListings.forEach(listing => {
      const cat = listing.category || 'Other';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });
    
    // Count today's listings
    const todayCount = allListings.filter(l => isPostedToday(l.age)).length;
    
    // Count recent listings (last 7 days)
    const recentCount = allListings.filter(l => isPostedRecently(l.age, 7)).length;
    
    const categoryText = Object.entries(categoryCounts)
      .map(([cat, count]) => `${cat}: **${count}**`)
      .join('\n');
    
    const embed = new EmbedBuilder()
      .setTitle('📊 Internship Statistics')
      .setDescription(
        `**Total Listings:** ${allListings.length}\n` +
        `**Posted Today:** ${todayCount}\n` +
        `**Posted This Week:** ${recentCount}\n\n` +
        `**By Category:**\n${categoryText}`
      )
      .setColor(0x5865F2)
      .setTimestamp()
      .setFooter({ text: `Repository: ${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}` });
    
    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in ?stats command:', error);
    await message.reply('❌ Error fetching statistics. Please try again later.');
  }
}

/**
 * Handle ?help command
 */
export async function handleHelpCommand(message) {
  const embed = new EmbedBuilder()
    .setTitle('📚 Command Help')
    .setDescription('Here are all available commands:')
    .addFields(
      { name: '📋 Task Management', value: '`?tasks set` - Set your tasks for today\n`?tasks view` - View your tasks\n`?done <id>` - Mark task as complete\n`?undo <id>` - Unmark task', inline: false },
      { name: '🏆 Leaderboards', value: '`?leaderboard [today|week|season|internship|streak]` - View leaderboards\n`?profile` - View your profile\n`?streak` - View your streak', inline: false },
      { name: '👥 Teams', value: '`?team join <name>` - Join a team\n`?team leave` - Leave your team\n`?team stats` - View team stats', inline: false },
      { name: '💼 Internships', value: '`?today` - Show internships posted today\n`?recent [days]` - Show recent internships\n`?search <query>` - Search internships\n`?category <name>` - Filter by category\n`?myapplications` - View your applications', inline: false },
      { name: '📊 Other', value: '`?stats` - Show internship statistics\n`?help` - Show this help message', inline: false }
    )
    .setColor(0x5865F2)
    .setTimestamp()
    .setFooter({ text: 'Tip: Click "I Applied" buttons to track your applications!' });
  
  await message.reply({ embeds: [embed] });
}

/**
 * Handle ?tasks set command
 */
export async function handleTasksSetCommand(message) {
  try {
    const userId = message.author.id;
    const username = message.author.username;
    
    // Get the task text from the message (everything after ?tasks set)
    const content = message.content.trim();
    const taskText = content.replace(/^\?tasks\s+set\s*/i, '').trim();
    
    if (!taskText || taskText.length === 0) {
      return await message.reply('❌ Please provide your tasks. Usage: `?tasks set <your tasks here>`\n\nExample:\n`?tasks set\n- Apply to 3 SWE internships\n- Finish DS homework\n- Study LC for 1 hour`');
    }
    
    await message.channel.sendTyping();
    
    // Parse tasks using LLM
    const tasks = await parseTasks(taskText);
    
    if (tasks.length === 0) {
      return await message.reply('❌ Could not parse any tasks. Please try again with a clearer format.');
    }
    
    // Save tasks
    const today = new Date().toISOString().split('T')[0];
    await setUserTasks(userId, today, tasks);
    await getUser(userId, username); // Ensure user exists
    
    // Create embed
    const totalPoints = tasks.reduce((sum, t) => sum + t.points, 0);
    const tasksList = tasks.map((t, i) => 
      `${i + 1}. ${t.description} — **${t.points} pts** (${t.category})`
    ).join('\n');
    
    const embed = new EmbedBuilder()
      .setTitle(`📋 Your Tasks for ${today}`)
      .setDescription(tasksList)
      .addFields(
        { name: '📊 Total Possible Today', value: `${totalPoints} pts`, inline: true },
        { name: '✅ Completed', value: '0 / ' + tasks.length, inline: true }
      )
      .setColor(0x5865F2)
      .setTimestamp();
    
    // Add reaction buttons for each task
    const reply = await message.reply({ embeds: [embed] });
    
    // Add checkmark reactions for each task
    for (let i = 0; i < Math.min(tasks.length, 10); i++) {
      await reply.react(`${i + 1}️⃣`);
    }
    await reply.react('✅');
    
    // Store message ID for reaction handling
    const taskMessageId = reply.id;
    // We'll handle reactions in interactions.js
    
  } catch (error) {
    console.error('Error in ?tasks set command:', error);
    await message.reply('❌ Error setting tasks. Please try again.');
  }
}

/**
 * Handle ?tasks view command
 */
export async function handleTasksViewCommand(message) {
  try {
    const userId = message.author.id;
    const today = new Date().toISOString().split('T')[0];
    
    const tasks = await getUserTasks(userId, today);
    
    if (tasks.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('📋 Your Tasks')
        .setDescription('You haven\'t set any tasks for today. Use `?tasks set` to add tasks!')
        .setColor(0xFEE75C)
        .setTimestamp();
      
      return await message.reply({ embeds: [embed] });
    }
    
    const completed = tasks.filter(t => t.completed).length;
    const totalPoints = tasks.reduce((sum, t) => sum + (t.completed ? t.points : 0), 0);
    const possiblePoints = tasks.reduce((sum, t) => sum + t.points, 0);
    
    const tasksList = tasks.map((t, i) => {
      const status = t.completed ? '✅' : '⏳';
      return `${status} ${i + 1}. ${t.description} — **${t.points} pts** (${t.category})`;
    }).join('\n');
    
    const embed = new EmbedBuilder()
      .setTitle(`📋 Your Tasks for ${today}`)
      .setDescription(tasksList)
      .addFields(
        { name: '📊 Progress', value: `${totalPoints} / ${possiblePoints} pts`, inline: true },
        { name: '✅ Completed', value: `${completed} / ${tasks.length}`, inline: true }
      )
      .setColor(0x57F287)
      .setTimestamp();
    
    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in ?tasks view command:', error);
    await message.reply('❌ Error viewing tasks. Please try again.');
  }
}

/**
 * Handle ?done command
 */
export async function handleDoneCommand(message, taskId) {
  try {
    const userId = message.author.id;
    const username = message.author.username;
    const today = new Date().toISOString().split('T')[0];
    
    if (!taskId) {
      return await message.reply('❌ Please specify a task ID. Usage: `?done <task_number>`\nExample: `?done 1`');
    }
    
    const taskNum = parseInt(taskId);
    if (isNaN(taskNum) || taskNum < 1) {
      return await message.reply('❌ Invalid task number. Please use a number like 1, 2, 3, etc.');
    }
    
    const tasks = await getUserTasks(userId, today);
    
    if (tasks.length === 0) {
      return await message.reply('❌ You don\'t have any tasks set for today. Use `?tasks set` to add tasks!');
    }
    
    if (taskNum > tasks.length) {
      return await message.reply(`❌ Task ${taskNum} doesn't exist. You have ${tasks.length} task(s).`);
    }
    
    const task = tasks[taskNum - 1];
    
    if (task.completed) {
      return await message.reply(`✅ Task ${taskNum} is already completed!`);
    }
    
    const completedTask = await completeTask(userId, today, task.id);
    
    if (!completedTask) {
      return await message.reply('❌ Error completing task. Please try again.');
    }
    
    const user = await getUser(userId, username);
    const streakBonus = user.streakDays > 0 ? Math.min(20, user.streakDays * 2) : 0;
    
    const embed = new EmbedBuilder()
      .setTitle('✅ Task Completed!')
      .setDescription(`**${task.description}** — +${task.points} pts`)
      .addFields(
        { name: '📊 Today\'s Points', value: `${user.todayPoints} pts`, inline: true },
        { name: '🔥 Streak', value: `${user.streakDays} days`, inline: true }
      )
      .setColor(0x57F287)
      .setTimestamp();
    
    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in ?done command:', error);
    await message.reply('❌ Error completing task. Please try again.');
  }
}

/**
 * Handle ?undo command
 */
export async function handleUndoCommand(message, taskId) {
  try {
    const userId = message.author.id;
    const today = new Date().toISOString().split('T')[0];
    
    if (!taskId) {
      return await message.reply('❌ Please specify a task ID. Usage: `?undo <task_number>`');
    }
    
    const taskNum = parseInt(taskId);
    if (isNaN(taskNum) || taskNum < 1) {
      return await message.reply('❌ Invalid task number.');
    }
    
    const tasks = await getUserTasks(userId, today);
    
    if (taskNum > tasks.length) {
      return await message.reply(`❌ Task ${taskNum} doesn't exist.`);
    }
    
    const task = tasks[taskNum - 1];
    
    if (!task.completed) {
      return await message.reply(`❌ Task ${taskNum} is not completed.`);
    }
    
    await uncompleteTask(userId, today, task.id);
    
    const user = await getUser(userId);
    
    const embed = new EmbedBuilder()
      .setTitle('↩️ Task Unmarked')
      .setDescription(`**${task.description}** — -${task.points} pts`)
      .addFields(
        { name: '📊 Today\'s Points', value: `${user.todayPoints} pts`, inline: true }
      )
      .setColor(0xFEE75C)
      .setTimestamp();
    
    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in ?undo command:', error);
    await message.reply('❌ Error unmarking task. Please try again.');
  }
}

/**
 * Handle ?leaderboard command
 */
export async function handleLeaderboardCommand(message, type = 'today') {
  try {
    const validTypes = ['today', 'week', 'season', 'internship', 'streak'];
    
    if (type && !validTypes.includes(type.toLowerCase())) {
      return await message.reply(`❌ Invalid leaderboard type. Use: ${validTypes.join(', ')}`);
    }
    
    const embed = await createLeaderboardEmbed(type.toLowerCase() || 'today', 10);
    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in ?leaderboard command:', error);
    await message.reply('❌ Error fetching leaderboard. Please try again.');
  }
}

/**
 * Handle ?profile command
 */
export async function handleProfileCommand(message) {
  try {
    const userId = message.author.id;
    const username = message.author.username;
    
    const embed = await createProfileEmbed(userId, username);
    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in ?profile command:', error);
    await message.reply('❌ Error fetching profile. Please try again.');
  }
}

/**
 * Handle ?streak command
 */
export async function handleStreakCommand(message) {
  try {
    const userId = message.author.id;
    const username = message.author.username;
    const user = await getUser(userId, username);
    
    const embed = new EmbedBuilder()
      .setTitle('🔥 Your Streak')
      .setDescription(`**${user.streakDays || 0}** consecutive days with ≥10 points!`)
      .addFields(
        { name: '📅 Last Active', value: user.lastActiveDate || 'Never', inline: true },
        { name: '💪 Keep it up!', value: 'Maintain your streak by completing tasks daily', inline: false }
      )
      .setColor(0xFF6B6B)
      .setTimestamp();
    
    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in ?streak command:', error);
    await message.reply('❌ Error fetching streak. Please try again.');
  }
}

/**
 * Handle ?team join command
 */
export async function handleTeamJoinCommand(message, teamName) {
  try {
    if (!teamName || teamName.trim().length === 0) {
      return await message.reply('❌ Please specify a team name. Usage: `?team join <team_name>`');
    }
    
    const userId = message.author.id;
    const username = message.author.username;
    
    // Create team ID from name (lowercase, no spaces)
    const teamId = teamName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    
    const { createTeam, addUserToTeam, getTeam } = await import('./database.js');
    
    // Check if team exists, create if not
    let team = await getTeam(teamId);
    if (!team) {
      team = await createTeam(teamId, teamName, userId);
      if (!team) {
        return await message.reply('❌ Error creating team. Please try again.');
      }
    } else {
      // Add user to existing team
      team = await addUserToTeam(userId, teamId);
      if (!team) {
        return await message.reply('❌ Error joining team. Please try again.');
      }
    }
    
    const embed = new EmbedBuilder()
      .setTitle('👥 Team Joined!')
      .setDescription(`You've joined **${team.name}**!`)
      .addFields(
        { name: '👥 Members', value: `${team.members.length}`, inline: true },
        { name: '📊 Team Points', value: `${team.weeklyPoints || 0} pts (this week)`, inline: true }
      )
      .setColor(0x5865F2)
      .setTimestamp();
    
    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in ?team join command:', error);
    await message.reply('❌ Error joining team. Please try again.');
  }
}

/**
 * Handle ?team leave command
 */
export async function handleTeamLeaveCommand(message) {
  try {
    const userId = message.author.id;
    const { removeUserFromTeam, getUser } = await import('./database.js');
    
    const user = await getUser(userId);
    
    if (!user.teamId) {
      return await message.reply('❌ You are not in a team.');
    }
    
    await removeUserFromTeam(userId);
    
    const embed = new EmbedBuilder()
      .setTitle('👥 Left Team')
      .setDescription('You have left your team.')
      .setColor(0xFEE75C)
      .setTimestamp();
    
    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in ?team leave command:', error);
    await message.reply('❌ Error leaving team. Please try again.');
  }
}

/**
 * Handle ?team stats command
 */
export async function handleTeamStatsCommand(message) {
  try {
    const userId = message.author.id;
    const { getUser, loadTeams } = await import('./database.js');
    
    const user = await getUser(userId);
    
    if (!user.teamId) {
      return await message.reply('❌ You are not in a team. Join one with `?team join <name>`');
    }
    
    const teams = await loadTeams();
    const team = teams[user.teamId];
    
    if (!team) {
      return await message.reply('❌ Your team was not found.');
    }
    
    // Calculate team points
    const users = await getAllUsers();
    let weeklyPoints = 0;
    let seasonPoints = 0;
    
    team.members.forEach(memberId => {
      const member = users[memberId];
      if (member) {
        weeklyPoints += member.weeklyPoints || 0;
        seasonPoints += member.seasonPoints || 0;
      }
    });
    
    const membersList = team.members
      .map(memberId => {
        const member = users[memberId];
        return member ? `• ${member.username || memberId.slice(0, 8)} (${member.weeklyPoints || 0} pts)` : `• ${memberId.slice(0, 8)}`;
      })
      .join('\n');
    
    const embed = new EmbedBuilder()
      .setTitle(`👥 Team: ${team.name}`)
      .setDescription(`**Members:** ${team.members.length}`)
      .addFields(
        { name: '📊 Points', value: `**This Week:** ${weeklyPoints}\n**This Season:** ${seasonPoints}`, inline: true },
        { name: '👥 Members', value: membersList || 'No members', inline: false }
      )
      .setColor(0x5865F2)
      .setTimestamp();
    
    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error in ?team stats command:', error);
    await message.reply('❌ Error fetching team stats. Please try again.');
  }
}

/**
 * Main command handler
 */
export async function handleMessageCommand(message) {
  const content = message.content.trim();
  
  // Check if message starts with ?
  if (!content.startsWith('?')) {
    return false;
  }
  
  // Extract command and args
  const args = content.slice(1).split(/\s+/);
  const command = args[0].toLowerCase();
  const commandArgs = args.slice(1).join(' ');
  
  try {
    switch (command) {
      case 'today':
        await handleTodayCommand(message);
        break;
      
      case 'recent':
        const days = parseInt(commandArgs) || 7;
        await handleRecentCommand(message, days);
        break;
      
      case 'search':
        await handleSearchCommand(message, commandArgs);
        break;
      
      case 'myapplications':
      case 'myapps':
      case 'applications':
        await handleMyApplicationsCommand(message);
        break;
      
      case 'category':
      case 'cat':
        await handleCategoryCommand(message, commandArgs);
        break;
      
      case 'stats':
      case 'statistics':
        await handleStatsCommand(message);
        break;
      
      case 'help':
      case 'commands':
        await handleHelpCommand(message);
        break;
      
      case 'tasks':
        if (commandArgs.toLowerCase().startsWith('set')) {
          await handleTasksSetCommand(message);
        } else if (commandArgs.toLowerCase().startsWith('view') || commandArgs.length === 0) {
          await handleTasksViewCommand(message);
        } else {
          await message.reply('❌ Invalid tasks command. Use `?tasks set` or `?tasks view`');
        }
        break;
      
      case 'done':
        await handleDoneCommand(message, commandArgs);
        break;
      
      case 'undo':
        await handleUndoCommand(message, commandArgs);
        break;
      
      case 'leaderboard':
      case 'lb':
        await handleLeaderboardCommand(message, commandArgs);
        break;
      
      case 'profile':
        await handleProfileCommand(message);
        break;
      
      case 'streak':
        await handleStreakCommand(message);
        break;
      
      case 'team':
        if (commandArgs.toLowerCase().startsWith('join')) {
          const teamName = commandArgs.replace(/^join\s+/i, '').trim();
          await handleTeamJoinCommand(message, teamName);
        } else if (commandArgs.toLowerCase().startsWith('leave')) {
          await handleTeamLeaveCommand(message);
        } else if (commandArgs.toLowerCase().startsWith('stats')) {
          await handleTeamStatsCommand(message);
        } else {
          await message.reply('❌ Invalid team command. Use `?team join <name>`, `?team leave`, or `?team stats`');
        }
        break;
      
      default:
        await message.reply(`❌ Unknown command: \`?${command}\`. Use \`?help\` to see all commands.`);
    }
    
    return true;
  } catch (error) {
    console.error('Error handling command:', error);
    await message.reply('❌ An error occurred while processing your command.');
    return true;
  }
}

