import fetch from 'node-fetch';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GITHUB_API_BASE = 'https://api.github.com';
const RAW_CONTENT_BASE = 'https://raw.githubusercontent.com';

let lastKnownListings = new Set();
let isInitialized = false;

/**
 * Fetch the README content from GitHub
 */
async function fetchReadme() {
  const owner = process.env.GITHUB_REPO_OWNER || 'SimplifyJobs';
  const repo = process.env.GITHUB_REPO_NAME || 'Summer2026-Internships';
  const branch = process.env.GITHUB_BRANCH || 'dev';
  
  const url = `${RAW_CONTENT_BASE}/${owner}/${repo}/${branch}/README.md`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch README: ${response.statusText}`);
    }
    return await response.text();
  } catch (error) {
    console.error('Error fetching README:', error);
    throw error;
  }
}

/**
 * Parse HTML table to extract internship listings from all sections
 */
function parseInternshipListings(readmeContent) {
  const listings = [];
  
  // Define all section patterns to monitor with their category names
  const sectionPatterns = [
    { pattern: /## 💻 Software Engineering Internship Roles[\s\S]*?(?=## |$)/, category: '💻 Software Engineering', emoji: '💻' },
    { pattern: /## 📱 Product Management[\s\S]*?(?=## |$)/, category: '📱 Product Management', emoji: '📱' },
    { pattern: /## 🤖 Data Science, AI & Machine Learning[\s\S]*?(?=## |$)/, category: '🤖 Data Science, AI & ML', emoji: '🤖' },
    { pattern: /## 📈 Quantitative Finance[\s\S]*?(?=## |$)/, category: '📈 Quantitative Finance', emoji: '📈' },
    { pattern: /## 🔧 Hardware Engineering[\s\S]*?(?=## |$)/, category: '🔧 Hardware Engineering', emoji: '🔧' },
  ];
  
  for (const section of sectionPatterns) {
    const sectionMatch = readmeContent.match(section.pattern);
    if (!sectionMatch) {
      console.log(`⚠️ Section not found: ${section.category}`);
      continue;
    }
    
    const sectionContent = sectionMatch[0];
    
    // Find the table in this section
    const tableMatch = sectionContent.match(/<table>[\s\S]*?<\/table>/);
    if (!tableMatch) {
      console.log(`⚠️ Table not found in section: ${section.category}`);
      continue;
    }
    
    const tableContent = tableMatch[0];
    console.log(`✅ Found table for ${section.category}`);
    
    // Match table rows: <tr>...</tr>
    const rowRegex = /<tr>[\s\S]*?<\/tr>/g;
    let rowMatch;
    
    while ((rowMatch = rowRegex.exec(tableContent)) !== null) {
      const rowContent = rowMatch[0];
      
      // Skip header row
      if (rowContent.includes('<th>')) {
        continue;
      }
      
      // Extract table cells: <td>...</td>
      const cellRegex = /<td>([\s\S]*?)<\/td>/g;
      const cells = [];
      let cellMatch;
      
      while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
        cells.push(cellMatch[1].trim());
      }
      
      // Should have 5 cells: Company, Role, Location, Application, Age
      if (cells.length < 5) {
        continue;
      }
      
      // Extract company name (from <strong><a>Company</a></strong> or <strong>Company</strong>)
      let company = cells[0]
        .replace(/<[^>]+>/g, '') // Remove all HTML tags
        .trim();
      
      // Extract role (remove HTML tags)
      let role = cells[1]
        .replace(/<[^>]+>/g, '')
        .trim();
      
      // Extract location (handle details/summary tags)
      let location = cells[2]
        .replace(/<details>[\s\S]*?<summary>[\s\S]*?<\/summary>[\s\S]*?<\/details>/g, '') // Remove details blocks
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Extract application links from the application column
      const applicationColumn = cells[3];
      
      // Skip closed applications (marked with 🔒)
      if (applicationColumn.includes('🔒') || role.includes('🔒') || company.includes('🔒')) {
        continue;
      }
      
      // Extract Apply link from <a href="..." alt="Apply">
      let applyLink = null;
      const applyLinkRegex = /<a\s+href="([^"]+)"[^>]*alt="Apply"/i;
      const applyMatch = applicationColumn.match(applyLinkRegex);
      if (applyMatch) {
        applyLink = applyMatch[1].trim();
      } else {
        // Fallback: try to find any link with "Apply" in alt or text
        const anyApplyLinkRegex = /<a\s+href="([^"]+)"[^>]*>[\s\S]*?Apply/i;
        const anyApplyMatch = applicationColumn.match(anyApplyLinkRegex);
        if (anyApplyMatch) {
          applyLink = anyApplyMatch[1].trim();
        }
      }
      
      // Skip if no valid apply link
      if (!applyLink || applyLink === '🔒') {
        continue;
      }
      
      // Extract age (remove HTML tags)
      let age = cells[4]
        .replace(/<[^>]+>/g, '')
        .trim();
      
      // Clean up location (remove <br> tags and normalize)
      location = location.replace(/<br\s*\/?>/gi, ', ').replace(/\s+/g, ' ').trim();
      
      listings.push({
        company,
        role,
        location,
        applyLink,
        age,
        category: section.category,
        emoji: section.emoji,
        id: `${company}-${role}-${location}`.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase(),
      });
    }
    
    console.log(`📊 Parsed ${listings.filter(l => l.category === section.category).length} listings from ${section.category}`);
  }
  
  console.log(`✅ Total listings parsed: ${listings.length}`);
  return listings;
}

/**
 * Create a unique identifier for a listing
 */
function getListingId(listing) {
  return listing.id;
}

/**
 * Load previously seen listings from file
 */
async function loadSeenListings() {
  const dataDir = path.join(__dirname, '../data');
  const filePath = path.join(dataDir, 'seen-listings.json');
  
  try {
    await fs.mkdir(dataDir, { recursive: true });
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    return new Set(data.listings || []);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return new Set();
    }
    console.error('Error loading seen listings:', error);
    return new Set();
  }
}

/**
 * Save seen listings to file
 */
async function saveSeenListings(listings) {
  const dataDir = path.join(__dirname, '../data');
  const filePath = path.join(dataDir, 'seen-listings.json');
  
  try {
    await fs.mkdir(dataDir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify({ listings: Array.from(listings) }, null, 2));
  } catch (error) {
    console.error('Error saving seen listings:', error);
  }
}

/**
 * Create a Discord embed for an internship listing
 */
function createListingEmbed(listing) {
  const embed = new EmbedBuilder()
    .setTitle(`${listing.emoji || '💼'} ${listing.company} - ${listing.role}`)
    .setDescription(
      `**Category:** ${listing.category || '💼 General'}\n` +
      `📍 **Location:** ${listing.location}\n` +
      `⏰ **Posted:** ${listing.age} ago\n\n` +
      `[🔗 Apply Here](${listing.applyLink})`
    )
    .setColor(0x5865F2)
    .setURL(listing.applyLink)
    .setTimestamp()
    .setFooter({ text: 'Summer 2026 Internships' });
  
  return embed;
}

/**
 * Create button row for application tracking
 */
function createButtonRow(listingId) {
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`apply_${listingId}`)
        .setLabel('I Applied')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅')
    );
  
  return row;
}

/**
 * Send new listings to Discord channel
 */
async function sendNewListings(client, channelId, newListings) {
  const channel = await client.channels.fetch(channelId);
  
  if (!channel) {
    console.error(`❌ Channel ${channelId} not found`);
    return;
  }
  
  for (const listing of newListings) {
    try {
      const embed = createListingEmbed(listing);
      const buttonRow = createButtonRow(listing.id);
      
      await channel.send({
        embeds: [embed],
        components: [buttonRow],
      });
      
      console.log(`✅ Posted: ${listing.company} - ${listing.role}`);
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error sending listing for ${listing.company}:`, error);
    }
  }
}

/**
 * Main monitoring function
 */
export async function monitorRepository(client, channelId) {
  const pollInterval = parseInt(process.env.POLL_INTERVAL) || 300000; // 5 minutes default
  
  console.log(`🔄 Starting to monitor repository (checking every ${pollInterval / 1000} seconds)...`);
  
  // Load previously seen listings
  lastKnownListings = await loadSeenListings();
  console.log(`📋 Loaded ${lastKnownListings.size} previously seen listings`);
  
  // Initial check
  await checkForUpdates(client, channelId);
  
  // Set up polling
  setInterval(async () => {
    await checkForUpdates(client, channelId);
  }, pollInterval);
}

/**
 * Get all current listings from GitHub
 * Exported for use in commands
 */
export async function getAllListings() {
  try {
    const readmeContent = await fetchReadme();
    return parseInternshipListings(readmeContent);
  } catch (error) {
    console.error('❌ Error fetching listings:', error);
    throw error;
  }
}

/**
 * Check for updates and send new listings
 * Exported for use in slash commands
 */
export async function checkForUpdates(client, channelId) {
  try {
    console.log('🔍 Checking for new internships...');
    
    const readmeContent = await fetchReadme();
    const currentListings = parseInternshipListings(readmeContent);
    
    console.log(`📊 Found ${currentListings.length} total listings`);
    
    // On first run, just save all listings as seen
    if (!isInitialized) {
      console.log('🚀 Initializing - marking all current listings as seen...');
      for (const listing of currentListings) {
        lastKnownListings.add(getListingId(listing));
      }
      await saveSeenListings(lastKnownListings);
      isInitialized = true;
      console.log('✅ Initialization complete. Monitoring for new listings...');
      return;
    }
    
    // Find new listings
    const newListings = currentListings.filter(listing => {
      const id = getListingId(listing);
      return !lastKnownListings.has(id);
    });
    
    if (newListings.length > 0) {
      console.log(`🎉 Found ${newListings.length} new listing(s)!`);
      
      // Send new listings to Discord
      await sendNewListings(client, channelId, newListings);
      
      // Update seen listings
      for (const listing of newListings) {
        lastKnownListings.add(getListingId(listing));
      }
      await saveSeenListings(lastKnownListings);
    } else {
      console.log('✨ No new listings found');
    }
  } catch (error) {
    console.error('❌ Error checking for updates:', error);
  }
}

