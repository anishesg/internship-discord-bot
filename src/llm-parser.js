/**
 * LLM-based task parser and scorer
 * Uses OpenAI API (or fallback to simple heuristic parsing)
 */

/**
 * Map difficulty (1-10) to points with curve
 */
function difficultyToPoints(difficulty) {
  if (difficulty <= 2) return 1;
  if (difficulty <= 4) return Math.floor(difficulty * 0.75) + 1; // 2-3 pts
  if (difficulty <= 6) return Math.floor(difficulty * 0.9) + 1; // 4-6 pts
  if (difficulty <= 8) return Math.floor(difficulty * 1.1) - 1; // 7-9 pts
  return Math.min(15, difficulty + 2); // 10-12 pts, capped at 15
}

/**
 * Apply category multiplier
 */
function applyCategoryMultiplier(points, category) {
  const multipliers = {
    internship: 1.5,
    academics: 1.0,
    skill: 1.0,
    health: 0.8,
    misc: 0.8,
  };
  
  const multiplier = multipliers[category] || 1.0;
  return Math.round(points * multiplier);
}

/**
 * Detect if task is vague/trivial
 */
function isVagueTask(description) {
  const vaguePatterns = [
    /^(drink|check|look|see|read|watch|listen)/i,
    /^(just|only|maybe|perhaps)/i,
  ];
  
  const trivialTasks = [
    'drink water',
    'check discord',
    'check email',
    'check messages',
    'wake up',
    'eat',
  ];
  
  const lowerDesc = description.toLowerCase().trim();
  
  if (trivialTasks.some(tt => lowerDesc.includes(tt))) {
    return true;
  }
  
  return vaguePatterns.some(pattern => pattern.test(lowerDesc));
}

/**
 * Simple heuristic-based task parser (fallback when LLM is not available)
 */
export function parseTasksHeuristic(taskText) {
  const lines = taskText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const tasks = [];
  
  lines.forEach((line, index) => {
    // Remove bullet points, dashes, numbers
    let cleanLine = line.replace(/^[-•*]\s*/, '').replace(/^\d+[.)]\s*/, '');
    
    if (!cleanLine) return;
    
    // Detect category
    let category = 'misc';
    const lower = cleanLine.toLowerCase();
    
    if (lower.includes('apply') || lower.includes('application') || lower.includes('internship')) {
      category = 'internship';
    } else if (lower.includes('homework') || lower.includes('assignment') || lower.includes('study') || lower.includes('class')) {
      category = 'academics';
    } else if (lower.includes('leetcode') || lower.includes('lc') || lower.includes('coding') || lower.includes('practice') || lower.includes('interview')) {
      category = 'skill';
    } else if (lower.includes('gym') || lower.includes('workout') || lower.includes('exercise') || lower.includes('run')) {
      category = 'health';
    }
    
    // Estimate difficulty based on keywords and length
    let difficulty = 5; // Default medium
    
    if (isVagueTask(cleanLine)) {
      difficulty = 1;
    } else if (lower.includes('apply') || lower.includes('finish') || lower.includes('complete')) {
      difficulty = 7;
    } else if (lower.includes('study') || lower.includes('practice') || lower.includes('review')) {
      difficulty = 6;
    } else if (lower.includes('start') || lower.includes('begin')) {
      difficulty = 4;
    }
    
    // Adjust based on numbers mentioned
    const numberMatch = cleanLine.match(/\d+/);
    if (numberMatch) {
      const num = parseInt(numberMatch[0]);
      if (num > 5) difficulty += 2;
      else if (num > 2) difficulty += 1;
    }
    
    // Clamp difficulty
    difficulty = Math.max(1, Math.min(10, difficulty));
    
    let points = difficultyToPoints(difficulty);
    points = applyCategoryMultiplier(points, category);
    
    // Clamp points
    points = Math.max(1, Math.min(15, points));
    
    tasks.push({
      id: `task-${Date.now()}-${index}`,
      description: cleanLine,
      category,
      difficulty,
      points,
      completed: false,
    });
  });
  
  return tasks;
}

/**
 * Parse tasks using OpenAI API (if available)
 */
export async function parseTasksWithLLM(taskText) {
  const apiKey = process.env.OPENAI_API_KEY;
  
  if (!apiKey) {
    console.log('⚠️ OpenAI API key not set, using heuristic parser');
    return parseTasksHeuristic(taskText);
  }
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are a task parser for a productivity gamification system. Parse the user's to-do list into atomic, measurable tasks. For each task, assign:
1. A short description (max 50 chars)
2. A category: internship, academics, skill, health, or misc
3. A difficulty score (1-10) based on time/effort/cognitive load

Return ONLY a JSON array of tasks in this format:
[
  {
    "description": "short task description",
    "category": "internship|academics|skill|health|misc",
    "difficulty": 1-10
  }
]`,
          },
          {
            role: 'user',
            content: `Parse these tasks:\n\n${taskText}`,
          },
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    const content = data.choices[0].message.content.trim();
    
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    
    const parsedTasks = JSON.parse(jsonStr);
    
    // Convert to our format
    const tasks = parsedTasks.map((task, index) => {
      let difficulty = Math.max(1, Math.min(10, task.difficulty || 5));
      let points = difficultyToPoints(difficulty);
      points = applyCategoryMultiplier(points, task.category || 'misc');
      
      // Clamp points
      points = Math.max(1, Math.min(15, points));
      
      // Check for vague tasks
      if (isVagueTask(task.description)) {
        points = 1;
        difficulty = 1;
      }
      
      return {
        id: `task-${Date.now()}-${index}`,
        description: task.description,
        category: task.category || 'misc',
        difficulty,
        points,
        completed: false,
      };
    });
    
    // Scale down if total exceeds 50 points
    const totalPoints = tasks.reduce((sum, t) => sum + t.points, 0);
    if (totalPoints > 50) {
      const scale = 50 / totalPoints;
      tasks.forEach(task => {
        task.points = Math.max(1, Math.round(task.points * scale));
      });
    }
    
    return tasks;
  } catch (error) {
    console.error('Error parsing tasks with LLM:', error);
    console.log('Falling back to heuristic parser');
    return parseTasksHeuristic(taskText);
  }
}

/**
 * Main parse function (uses LLM if available, otherwise heuristic)
 */
export async function parseTasks(taskText) {
  if (!taskText || taskText.trim().length === 0) {
    return [];
  }
  
  return await parseTasksWithLLM(taskText);
}

