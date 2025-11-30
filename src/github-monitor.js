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
 * Parse markdown table to extract internship listings from all sections
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
  
  // Match table rows - handles multiple formats:
  // | **[Company](link)** | Role | Location | [Apply](link) [Simplify](link) | Age |
  // | **Company** | Role | Location | [Apply](link) | Age |
  // The regex captures the entire application column to parse links from it
  const tableRowRegex = /\|\s*\*\*\[?([^\]]+)\]?\(?[^\)]*\)?\*\*\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)\s*\|/g;
  
  for (const section of sectionPatterns) {
    const sectionMatch = readmeContent.match(section.pattern);
    if (!sectionMatch) {
      continue;
    }
    
    const sectionContent = sectionMatch[0];
    let match;
    
    while ((match = tableRowRegex.exec(sectionContent)) !== null) {
      const company = match[1].trim();
      const role = match[2].trim();
      const location = match[3].trim();
      const applicationColumn = match[4].trim();
      const age = match[5].trim();
      
      // Skip closed applications (marked with 🔒)
      if (applicationColumn.includes('🔒') || role.includes('🔒') || company.includes('🔒')) {
        continue;
      }
      
      // Extract Apply link (prefer Apply over Simplify)
      let applyLink = null;
      const applyMatch = applicationColumn.match(/\[Apply\]\(([^\)]+)\)/);
      if (applyMatch) {
        applyLink = applyMatch[1].trim();
      } else {
        // Fallback to Simplify link if no Apply link
        const simplifyMatch = applicationColumn.match(/\[Simplify\]\(([^\)]+)\)/);
        if (simplifyMatch) {
          applyLink = simplifyMatch[1].trim();
        }
      }
      
      // Skip if no valid apply link
      if (!applyLink || applyLink === '🔒') {
        continue;
      }
      
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
  }
  
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

