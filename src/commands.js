import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getAllListings } from './github-monitor.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

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
      { name: '`?today`', value: 'Show all internships posted today', inline: false },
      { name: '`?recent [days]`', value: 'Show recent internships (default: 7 days)', inline: false },
      { name: '`?search <query>`', value: 'Search internships by company, role, or location', inline: false },
      { name: '`?category <name>`', value: 'Filter by category (software, product, data, quant, hardware)', inline: false },
      { name: '`?myapplications`', value: 'View all internships you\'ve marked as applied', inline: false },
      { name: '`?stats`', value: 'Show statistics about all internships', inline: false },
      { name: '`?help`', value: 'Show this help message', inline: false }
    )
    .setColor(0x5865F2)
    .setTimestamp()
    .setFooter({ text: 'Tip: Click "I Applied" buttons to track your applications!' });
  
  await message.reply({ embeds: [embed] });
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

