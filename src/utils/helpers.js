const { getCollection } = require('../config/db');

function formatTime(dateString) {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-IN', { 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: true, 
      timeZone: 'Asia/Kolkata' 
    });
  } catch (e) {
    return '';
  }
}

function formatDate(dateString) {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Kolkata'
    });
  } catch (e) {
    return '';
  }
}

function getCurrentMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0);
  
  return {
    start: startOfMonth.toISOString().split('T')[0],
    end: endOfMonth.toISOString().split('T')[0]
  };
}

async function canActAs(currentUsername, targetUsername) {
  try {
    const groups = await getCollection('family_groups');
    if (!groups) return false;

    const group = await groups.findOne({
      members: { $all: [currentUsername, targetUsername] }
    });

    return !!group;
  } catch (e) {
    return false;
  }
}

function calculateStreaks(dates) {
  if (!dates || dates.length === 0) return { current: 0, max: 0 };
  
  const uniqueDates = [...new Set(dates)].sort((a, b) => new Date(b) - new Date(a));
  
  if (uniqueDates.length === 0) return { current: 0, max: 0 };
  
  let currentStreak = 0;
  let maxStreak = 0;
  let tempStreak = 1;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const mostRecentDate = new Date(uniqueDates[0]);
  mostRecentDate.setHours(0, 0, 0, 0);
  
  const daysSinceLastAttendance = Math.floor((today - mostRecentDate) / (1000 * 60 * 60 * 24));
  
  if (daysSinceLastAttendance > 1) {
    currentStreak = 0;
  } else {
    currentStreak = 1;
    for (let i = 0; i < uniqueDates.length - 1; i++) {
        const d1 = new Date(uniqueDates[i]);
        d1.setHours(0, 0, 0, 0);
        const d2 = new Date(uniqueDates[i+1]);
        d2.setHours(0, 0, 0, 0);
        
        const diff = Math.floor((d1 - d2) / (1000 * 60 * 60 * 24));
        if (diff === 1) {
            currentStreak++;
            tempStreak++;
        } else if (diff === 0) {
            continue;
        } else {
            break;
        }
    }
  }

  tempStreak = 1;
  maxStreak = 1;
  for (let i = 0; i < uniqueDates.length - 1; i++) {
      const d1 = new Date(uniqueDates[i]);
      d1.setHours(0, 0, 0, 0);
      const d2 = new Date(uniqueDates[i+1]);
      d2.setHours(0, 0, 0, 0);
      
      const diff = Math.floor((d1 - d2) / (1000 * 60 * 60 * 24));
      if (diff === 1) {
          tempStreak++;
          maxStreak = Math.max(maxStreak, tempStreak);
      } else if (diff === 0) {
          continue;
      } else {
          tempStreak = 1;
      }
  }

  return { current: currentStreak, max: Math.max(maxStreak, currentStreak) };
}

module.exports = {
  formatTime,
  formatDate,
  getCurrentMonthRange,
  canActAs,
  calculateStreaks
};
