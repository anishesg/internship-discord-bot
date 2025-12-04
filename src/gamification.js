import { EmbedBuilder } from 'discord.js';
import { getAllUsers, getCurrentSeason, loadTeams } from './database.js';

/**
 * Get leaderboard for a specific type
 */
export async function getLeaderboard(type = 'today', limit = 10) {
  const users = await getAllUsers();
  const userArray = Object.values(users);
  
  let sortKey;
  let title;
  
  switch (type) {
    case 'today':
      sortKey = 'todayPoints';
      title = '📊 Today\'s Leaderboard';
      break;
    case 'week':
      sortKey = 'weeklyPoints';
      title = '📊 Weekly Leaderboard';
      break;
    case 'season':
      sortKey = 'seasonPoints';
      title = '📊 Season Leaderboard';
      break;
    case 'internship':
      sortKey = 'internshipPoints';
      title = '🎯 Internship Grind Leaderboard';
      break;
    case 'streak':
      sortKey = 'streakDays';
      title = '🔥 Streak Leaderboard';
      break;
    default:
      sortKey = 'todayPoints';
      title = '📊 Today\'s Leaderboard';
  }
  
  // Sort by the selected metric
  userArray.sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));
  
  // Filter out users with 0 points for today/week/season
  const filtered = userArray.filter(user => (user[sortKey] || 0) > 0);
  
  return {
    title,
    users: filtered.slice(0, limit),
    sortKey,
  };
}

/**
 * Create leaderboard embed
 */
export async function createLeaderboardEmbed(type = 'today', limit = 10) {
  const leaderboard = await getLeaderboard(type, limit);
  
  if (leaderboard.users.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle(leaderboard.title)
      .setDescription('No one has earned points yet! Start by setting your tasks with `?tasks set`')
      .setColor(0xFEE75C)
      .setTimestamp();
    
    return embed;
  }
  
  const medals = ['🥇', '🥈', '🥉'];
  const description = leaderboard.users
    .map((user, index) => {
      const medal = index < 3 ? medals[index] + ' ' : `${index + 1}. `;
      const points = user[leaderboard.sortKey] || 0;
      const username = user.username || `User ${user.userId.slice(0, 8)}`;
      
      return `${medal}**${username}** - ${points} ${type === 'streak' ? 'days' : 'pts'}`;
    })
    .join('\n');
  
  const embed = new EmbedBuilder()
    .setTitle(leaderboard.title)
    .setDescription(description)
    .setColor(0x5865F2)
    .setTimestamp();
  
  if (type === 'season') {
    const season = await getCurrentSeason();
    if (season) {
      embed.setFooter({ text: `Season: ${season.name} | Ends: ${season.endDate}` });
    }
  }
  
  return embed;
}

/**
 * Get team leaderboard
 */
export async function getTeamLeaderboard(type = 'week', limit = 10) {
  const teams = await loadTeams();
  const teamArray = Object.values(teams);
  
  // Calculate team points from member points
  const users = await getAllUsers();
  
  teamArray.forEach(team => {
    let totalPoints = 0;
    team.members.forEach(memberId => {
      const user = users[memberId];
      if (user) {
        if (type === 'week') {
          totalPoints += user.weeklyPoints || 0;
        } else if (type === 'season') {
          totalPoints += user.seasonPoints || 0;
        } else {
          totalPoints += user.todayPoints || 0;
        }
      }
    });
    
    if (type === 'week') {
      team.weeklyPoints = totalPoints;
    } else {
      team.seasonPoints = totalPoints;
    }
  });
  
  const sortKey = type === 'season' ? 'seasonPoints' : 'weeklyPoints';
  teamArray.sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));
  
  const filtered = teamArray.filter(team => (team[sortKey] || 0) > 0);
  
  return {
    title: `👥 Team Leaderboard (${type})`,
    teams: filtered.slice(0, limit),
    sortKey,
  };
}

/**
 * Create team leaderboard embed
 */
export async function createTeamLeaderboardEmbed(type = 'week', limit = 10) {
  const leaderboard = await getTeamLeaderboard(type, limit);
  
  if (leaderboard.teams.length === 0) {
    const embed = new EmbedBuilder()
      .setTitle(leaderboard.title)
      .setDescription('No teams have earned points yet! Join a team with `?team join <name>`')
      .setColor(0xFEE75C)
      .setTimestamp();
    
    return embed;
  }
  
  const medals = ['🥇', '🥈', '🥉'];
  const description = leaderboard.teams
    .map((team, index) => {
      const medal = index < 3 ? medals[index] + ' ' : `${index + 1}. `;
      const points = team[leaderboard.sortKey] || 0;
      const memberCount = team.members.length;
      
      return `${medal}**${team.name}** - ${points} pts (${memberCount} member${memberCount !== 1 ? 's' : ''})`;
    })
    .join('\n');
  
  const embed = new EmbedBuilder()
    .setTitle(leaderboard.title)
    .setDescription(description)
    .setColor(0x5865F2)
    .setTimestamp();
  
  return embed;
}

/**
 * Create daily recap embed
 */
export async function createDailyRecapEmbed() {
  const users = await getAllUsers();
  const userArray = Object.values(users);
  
  // Today's top scorers
  const todayTop = userArray
    .filter(u => (u.todayPoints || 0) > 0)
    .sort((a, b) => (b.todayPoints || 0) - (a.todayPoints || 0))
    .slice(0, 5);
  
  // Total applications submitted today
  const totalApplications = userArray.reduce((sum, u) => sum + (u.applicationsSubmitted || 0), 0);
  
  // Streaks maintained/broken
  const activeStreaks = userArray.filter(u => (u.streakDays || 0) > 0).length;
  
  // Total points earned today
  const totalPoints = userArray.reduce((sum, u) => sum + (u.todayPoints || 0), 0);
  
  const topScorersText = todayTop.length > 0
    ? todayTop.map((u, i) => `${i + 1}. **${u.username || u.userId.slice(0, 8)}** - ${u.todayPoints || 0} pts`).join('\n')
    : 'No one earned points today 😢';
  
  const embed = new EmbedBuilder()
    .setTitle('📅 Daily Recap')
    .setDescription(`Here's what happened today in the grind!`)
    .addFields(
      { name: '🏆 Top Scorers', value: topScorersText, inline: false },
      { name: '📊 Stats', value: `**Total Points:** ${totalPoints}\n**Active Streaks:** ${activeStreaks}\n**Applications Tracked:** ${totalApplications}`, inline: true },
      { name: '🔥 Keep Grinding!', value: 'Set your tasks for tomorrow with `?tasks set`', inline: false }
    )
    .setColor(0x57F287)
    .setTimestamp();
  
  return embed;
}

/**
 * Calculate streak bonus points
 */
export function calculateStreakBonus(streakDays) {
  if (streakDays <= 0) return 0;
  // Bonus = 2 * streak, capped at 20
  return Math.min(20, streakDays * 2);
}

/**
 * Get user profile data
 */
export async function getUserProfile(userId) {
  const { getUser } = await import('./database.js');
  const user = await getUser(userId);
  const season = await getCurrentSeason();
  
  // Calculate rank
  const users = await getAllUsers();
  const userArray = Object.values(users)
    .filter(u => (u.seasonPoints || 0) > 0)
    .sort((a, b) => (b.seasonPoints || 0) - (a.seasonPoints || 0));
  
  const rank = userArray.findIndex(u => u.userId === userId) + 1;
  
  return {
    user,
    rank: rank || null,
    season,
  };
}

/**
 * Create user profile embed
 */
export async function createProfileEmbed(userId, username) {
  const profile = await getUserProfile(userId);
  const { user, rank, season } = profile;
  
  const embed = new EmbedBuilder()
    .setTitle(`📊 Profile: ${username || user.username || 'User'}`)
    .setDescription('Your productivity stats')
    .addFields(
      { name: '📈 Points', value: `**Today:** ${user.todayPoints || 0}\n**This Week:** ${user.weeklyPoints || 0}\n**This Season:** ${user.seasonPoints || 0}\n**Lifetime:** ${user.lifetimePoints || 0}`, inline: true },
      { name: '🎯 Internship Stats', value: `**Points:** ${user.internshipPoints || 0}\n**Applications:** ${user.applicationsSubmitted || 0}\n**Interview Preps:** ${user.interviewPrepsDone || 0}`, inline: true },
      { name: '🔥 Streak', value: `${user.streakDays || 0} days`, inline: true },
      { name: '🏆 Season Rank', value: rank ? `#${rank}` : 'Unranked', inline: true },
      { name: '👥 Team', value: user.teamId ? `Team ID: ${user.teamId}` : 'No team', inline: true },
      { name: '📅 Seasons Played', value: `${user.seasonsPlayed || 0}`, inline: true }
    )
    .setColor(0x5865F2)
    .setTimestamp();
  
  if (season) {
    embed.setFooter({ text: `Current Season: ${season.name}` });
  }
  
  return embed;
}

