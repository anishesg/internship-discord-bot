import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, '../data');
const usersFile = path.join(dataDir, 'users.json');
const tasksFile = path.join(dataDir, 'tasks.json');
const seasonsFile = path.join(dataDir, 'seasons.json');
const teamsFile = path.join(dataDir, 'teams.json');

// Initialize data structures
const defaultUser = {
  userId: '',
  username: '',
  seasonPoints: 0,
  weeklyPoints: 0,
  todayPoints: 0,
  streakDays: 0,
  lastActiveDate: null,
  internshipPoints: 0,
  applicationsSubmitted: 0,
  interviewPrepsDone: 0,
  lifetimePoints: 0,
  seasonsPlayed: 0,
  bestRank: null,
  teamId: null,
  createdAt: new Date().toISOString(),
};

const defaultSeason = {
  id: '',
  name: '',
  startDate: '',
  endDate: '',
  isActive: true,
  createdAt: new Date().toISOString(),
};

/**
 * Ensure data directory exists
 */
async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

/**
 * Load users data
 */
export async function loadUsers() {
  try {
    await ensureDataDir();
    const content = await fs.readFile(usersFile, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    console.error('Error loading users:', error);
    return {};
  }
}

/**
 * Save users data
 */
async function saveUsers(users) {
  try {
    await ensureDataDir();
    await fs.writeFile(usersFile, JSON.stringify(users, null, 2));
  } catch (error) {
    console.error('Error saving users:', error);
  }
}

/**
 * Get or create user
 */
export async function getUser(userId, username = null) {
  const users = await loadUsers();
  
  if (!users[userId]) {
    users[userId] = {
      ...defaultUser,
      userId,
      username: username || userId,
    };
    await saveUsers(users);
  } else if (username && users[userId].username !== username) {
    users[userId].username = username;
    await saveUsers(users);
  }
  
  return users[userId];
}

/**
 * Update user
 */
export async function updateUser(userId, updates) {
  const users = await loadUsers();
  
  if (!users[userId]) {
    await getUser(userId);
    return await updateUser(userId, updates);
  }
  
  users[userId] = { ...users[userId], ...updates };
  await saveUsers(users);
  return users[userId];
}

/**
 * Load tasks data
 */
export async function loadTasks() {
  try {
    await ensureDataDir();
    const content = await fs.readFile(tasksFile, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    console.error('Error loading tasks:', error);
    return {};
  }
}

/**
 * Save tasks data
 */
async function saveTasks(tasks) {
  try {
    await ensureDataDir();
    await fs.writeFile(tasksFile, JSON.stringify(tasks, null, 2));
  } catch (error) {
    console.error('Error saving tasks:', error);
  }
}

/**
 * Get user's tasks for a specific date
 */
export async function getUserTasks(userId, date = null) {
  const dateKey = date || new Date().toISOString().split('T')[0];
  const tasks = await loadTasks();
  
  if (!tasks[userId]) {
    tasks[userId] = {};
  }
  
  if (!tasks[userId][dateKey]) {
    tasks[userId][dateKey] = [];
  }
  
  return tasks[userId][dateKey];
}

/**
 * Set user's tasks for a specific date
 */
export async function setUserTasks(userId, date, taskList) {
  const dateKey = date || new Date().toISOString().split('T')[0];
  const tasks = await loadTasks();
  
  if (!tasks[userId]) {
    tasks[userId] = {};
  }
  
  tasks[userId][dateKey] = taskList;
  await saveTasks(tasks);
  return taskList;
}

/**
 * Mark task as complete
 */
export async function completeTask(userId, date, taskId) {
  const dateKey = date || new Date().toISOString().split('T')[0];
  const tasks = await loadTasks();
  
  if (!tasks[userId] || !tasks[userId][dateKey]) {
    return null;
  }
  
  const task = tasks[userId][dateKey].find(t => t.id === taskId);
  if (!task) {
    return null;
  }
  
  if (task.completed) {
    return task; // Already completed
  }
  
  task.completed = true;
  task.completedAt = new Date().toISOString();
  
  await saveTasks(tasks);
  
  // Update user points
  const user = await getUser(userId);
  const points = task.points || 0;
  const isInternship = task.category === 'internship';
  
  await updateUser(userId, {
    todayPoints: user.todayPoints + points,
    seasonPoints: user.seasonPoints + points,
    weeklyPoints: user.weeklyPoints + points,
    lifetimePoints: user.lifetimePoints + points,
    internshipPoints: isInternship ? user.internshipPoints + points : user.internshipPoints,
    applicationsSubmitted: isInternship && task.description.toLowerCase().includes('apply') 
      ? user.applicationsSubmitted + 1 
      : user.applicationsSubmitted,
    interviewPrepsDone: isInternship && (task.description.toLowerCase().includes('interview') || task.description.toLowerCase().includes('lc') || task.description.toLowerCase().includes('leetcode'))
      ? user.interviewPrepsDone + 1
      : user.interviewPrepsDone,
  });
  
  return task;
}

/**
 * Unmark task as complete
 */
export async function uncompleteTask(userId, date, taskId) {
  const dateKey = date || new Date().toISOString().split('T')[0];
  const tasks = await loadTasks();
  
  if (!tasks[userId] || !tasks[userId][dateKey]) {
    return null;
  }
  
  const task = tasks[userId][dateKey].find(t => t.id === taskId);
  if (!task || !task.completed) {
    return null;
  }
  
  task.completed = false;
  task.completedAt = null;
  
  await saveTasks(tasks);
  
  // Update user points
  const user = await getUser(userId);
  const points = task.points || 0;
  const isInternship = task.category === 'internship';
  
  await updateUser(userId, {
    todayPoints: Math.max(0, user.todayPoints - points),
    seasonPoints: Math.max(0, user.seasonPoints - points),
    weeklyPoints: Math.max(0, user.weeklyPoints - points),
    lifetimePoints: Math.max(0, user.lifetimePoints - points),
    internshipPoints: isInternship ? Math.max(0, user.internshipPoints - points) : user.internshipPoints,
  });
  
  return task;
}

/**
 * Load seasons data
 */
export async function loadSeasons() {
  try {
    await ensureDataDir();
    const content = await fs.readFile(seasonsFile, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { seasons: [], currentSeasonId: null };
    }
    console.error('Error loading seasons:', error);
    return { seasons: [], currentSeasonId: null };
  }
}

/**
 * Save seasons data
 */
async function saveSeasons(data) {
  try {
    await ensureDataDir();
    await fs.writeFile(seasonsFile, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving seasons:', error);
  }
}

/**
 * Get current season
 */
export async function getCurrentSeason() {
  const data = await loadSeasons();
  
  if (!data.currentSeasonId) {
    // Create a default season
    const seasonId = `season-${Date.now()}`;
    const season = {
      ...defaultSeason,
      id: seasonId,
      name: `Season ${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 4 weeks
    };
    
    data.seasons.push(season);
    data.currentSeasonId = seasonId;
    await saveSeasons(data);
    return season;
  }
  
  return data.seasons.find(s => s.id === data.currentSeasonId) || null;
}

/**
 * Load teams data
 */
export async function loadTeams() {
  try {
    await ensureDataDir();
    const content = await fs.readFile(teamsFile, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {};
    }
    console.error('Error loading teams:', error);
    return {};
  }
}

/**
 * Save teams data
 */
async function saveTeams(teams) {
  try {
    await ensureDataDir();
    await fs.writeFile(teamsFile, JSON.stringify(teams, null, 2));
  } catch (error) {
    console.error('Error saving teams:', error);
  }
}

/**
 * Get or create team
 */
export async function getTeam(teamId) {
  const teams = await loadTeams();
  return teams[teamId] || null;
}

/**
 * Create team
 */
export async function createTeam(teamId, teamName, creatorId) {
  const teams = await loadTeams();
  
  if (teams[teamId]) {
    return null; // Team already exists
  }
  
  teams[teamId] = {
    id: teamId,
    name: teamName,
    members: [creatorId],
    weeklyPoints: 0,
    seasonPoints: 0,
    createdAt: new Date().toISOString(),
  };
  
  await saveTeams(teams);
  return teams[teamId];
}

/**
 * Add user to team
 */
export async function addUserToTeam(userId, teamId) {
  const teams = await loadTeams();
  const user = await getUser(userId);
  
  // Remove from old team if any
  if (user.teamId && teams[user.teamId]) {
    teams[user.teamId].members = teams[user.teamId].members.filter(id => id !== userId);
  }
  
  if (!teams[teamId]) {
    return null;
  }
  
  if (!teams[teamId].members.includes(userId)) {
    teams[teamId].members.push(userId);
  }
  
  await saveTeams(teams);
  await updateUser(userId, { teamId });
  
  return teams[teamId];
}

/**
 * Remove user from team
 */
export async function removeUserFromTeam(userId) {
  const user = await getUser(userId);
  
  if (!user.teamId) {
    return null;
  }
  
  const teams = await loadTeams();
  if (teams[user.teamId]) {
    teams[user.teamId].members = teams[user.teamId].members.filter(id => id !== userId);
    await saveTeams(teams);
  }
  
  await updateUser(userId, { teamId: null });
  return true;
}

/**
 * Get all users (for leaderboards)
 */
export async function getAllUsers() {
  return await loadUsers();
}

/**
 * Update streak for user
 */
export async function updateStreak(userId, pointsEarned) {
  const user = await getUser(userId);
  const today = new Date().toISOString().split('T')[0];
  const lastActive = user.lastActiveDate;
  
  const STREAK_THRESHOLD = 10; // Minimum points to maintain streak
  
  if (pointsEarned >= STREAK_THRESHOLD) {
    if (lastActive === today) {
      // Already updated today
      return user.streakDays;
    }
    
    if (lastActive) {
      const lastDate = new Date(lastActive);
      const todayDate = new Date(today);
      const daysDiff = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));
      
      if (daysDiff === 1) {
        // Consecutive day
        await updateUser(userId, {
          streakDays: user.streakDays + 1,
          lastActiveDate: today,
        });
        return user.streakDays + 1;
      } else if (daysDiff > 1) {
        // Streak broken
        await updateUser(userId, {
          streakDays: 1,
          lastActiveDate: today,
        });
        return 1;
      }
    } else {
      // First time
      await updateUser(userId, {
        streakDays: 1,
        lastActiveDate: today,
      });
      return 1;
    }
  } else if (pointsEarned === 0 && lastActive !== today) {
    // No points today, but check if streak should reset
    // We'll only reset if they explicitly have 0 points for the day
    // This is handled in daily recap
  }
  
  return user.streakDays;
}

/**
 * Reset weekly points (called at start of new week)
 */
export async function resetWeeklyPoints() {
  const users = await loadUsers();
  
  for (const userId in users) {
    users[userId].weeklyPoints = 0;
  }
  
  await saveUsers(users);
}

