const { getCollection } = require('../config/db');
const { getCurrentMonthRange } = require('../utils/helpers');
const bcrypt = require('bcryptjs');

exports.getLeaderboard = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const monthRange = getCurrentMonthRange();
    const start = startDate || monthRange.start;
    const end = endDate || monthRange.end;

    const attendance = await getCollection('attendance');
    const gatha = await getCollection('gatha');

    let attendanceLeaders = [], gathaLeaders = [];

    if (attendance) {
      const attAgg = await attendance.aggregate([
        { $match: { date: { $gte: start, $lte: end } } },
        { $group: { _id: '$username', totalAttendance: { $sum: 1 } } },
        { $sort: { totalAttendance: -1 } },
        { $limit: 10 }
      ]).toArray();

      attendanceLeaders = attAgg.map((item, index) => ({
        rank: index + 1, userId: item._id, username: item._id, name: item._id,
        totalAttendance: item.totalAttendance, count: item.totalAttendance
      }));
    }

    if (gatha) {
      const gathaAgg = await gatha.aggregate([
        { $match: { date: { $gte: start, $lte: end }, type: 'new' } },
        { $group: { _id: '$username', totalGathas: { $sum: '$total_gatha' } } },
        { $sort: { totalGathas: -1 } },
        { $limit: 10 }
      ]).toArray();

      gathaLeaders = gathaAgg.map((item, index) => ({
        rank: index + 1, userId: item._id, username: item._id, name: item._id,
        totalGathas: item.totalGathas, count: item.totalGathas
      }));
    }

    res.json({ attendanceLeaders, gathaLeaders, dateRange: { start, end } });
  } catch (error) {
    res.json({ attendanceLeaders: [], gathaLeaders: [], dateRange: {} });
  }
};

exports.getKidsLeaderboard = async (req, res) => {
  // Kids dashboard removed — return same as regular leaderboard
  return exports.getLeaderboard(req, res);
};

exports.getAnalyticsLeaderboard = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate || `${new Date().getFullYear()}-01-01`;
    const end = endDate || `${new Date().getFullYear()}-12-31`;

    let result = { attendanceLeader: null, gathaStats: { totalPathshalaGathas: 0, totalAttendance: 0, gathaLeader: null }, attendanceLeaders: [], gathaLeaders: [] };

    const attendance = await getCollection('attendance');
    const gatha = await getCollection('gatha');

    if (attendance) {
      result.gathaStats.totalAttendance = await attendance.countDocuments({ date: { $gte: start, $lte: end } });
      const attLeaders = await attendance.aggregate([{ $match: { date: { $gte: start, $lte: end } } }, { $group: { _id: '$username', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]).toArray();

      if (attLeaders.length > 0) {
        result.attendanceLeaders = attLeaders.map((item, index) => ({
          rank: index + 1, userId: item._id, username: item._id, name: item._id, totalAttendance: item.count, count: item.count
        }));
        const topAtt = attLeaders[0];
        result.attendanceLeader = { name: topAtt._id, username: topAtt._id, attendance_count: topAtt.count };
      }
    }

    if (gatha) {
      const totalGathas = await gatha.aggregate([{ $match: { date: { $gte: start, $lte: end } } }, { $group: { _id: null, total: { $sum: '$total_gatha' } } }]).toArray();
      result.gathaStats.totalPathshalaGathas = totalGathas[0]?.total || 0;

      const gathaLeaders = await gatha.aggregate([{ $match: { date: { $gte: start, $lte: end }, type: 'new' } }, { $group: { _id: '$username', count: { $sum: '$total_gatha' } } }, { $sort: { count: -1 } }, { $limit: 10 }]).toArray();

      if (gathaLeaders.length > 0) {
        result.gathaLeaders = gathaLeaders.map((item, index) => ({
          rank: index + 1, userId: item._id, username: item._id, name: item._id, totalGathas: item.count, count: item.count
        }));
        const topGatha = gathaLeaders[0];
        result.gathaStats.gathaLeader = { name: topGatha._id, username: topGatha._id, count: topGatha.count };
      }
    }

    res.json(result);
  } catch (error) {
    res.json({ attendanceLeader: null, gathaStats: { totalPathshalaGathas: 0, totalAttendance: 0, gathaLeader: null }, attendanceLeaders: [], gathaLeaders: [] });
  }
};

exports.getAchievements = async (req, res) => {
  try {
    const achievements = await getCollection('achievements');
    if (!achievements) return res.json({ unlocked: [], xp: 0 });
    const userAchievements = await achievements.find({ username: req.user.username }).toArray();
    const totalXP = userAchievements.reduce((sum, a) => sum + (a.xp || 0), 0);
    res.json({ unlocked: userAchievements, xp: totalXP });
  } catch (error) { res.json({ unlocked: [], xp: 0 }); }
};

exports.unlockAchievement = async (req, res) => {
  try {
    const { achievementId, xp } = req.body;
    if (!achievementId) return res.status(400).json({ error: 'Achievement ID required' });
    const achievements = await getCollection('achievements');
    if (!achievements) return res.status(500).json({ error: 'Database not available' });

    const existing = await achievements.findOne({ username: req.user.username, achievementId: achievementId });
    if (existing) return res.json({ message: 'Already unlocked', alreadyUnlocked: true });

    await achievements.insertOne({ username: req.user.username, achievementId: achievementId, xp: xp || 0, unlockedAt: new Date().toISOString() });
    res.json({ message: 'Achievement unlocked!', achievementId, xp });
  } catch (error) { res.status(500).json({ error: 'Failed to unlock achievement' }); }
};

exports.getProfile = async (req, res) => {
  try {
    const profiles = await getCollection('profiles');
    let profile = null;
    if (profiles) profile = await profiles.findOne({ username: req.user.username });
    res.json({ username: req.user.username, name: req.user.name, ...profile, joinedDate: profile?.joinedDate || null });
  } catch (error) { res.json({ username: req.user.username, name: req.user.name }); }
};

exports.updateProfile = async (req, res) => {
  try {
    const { showTips, theme, language } = req.body;
    const profiles = await getCollection('profiles');
    if (!profiles) return res.status(500).json({ error: 'Database not available' });

    await profiles.updateOne(
      { username: req.user.username },
      { $set: { showTips, theme, language, updatedAt: new Date().toISOString() }, $setOnInsert: { username: req.user.username, joinedDate: new Date().toISOString() } },
      { upsert: true }
    );
    res.json({ message: 'Profile updated' });
  } catch (error) { res.status(500).json({ error: 'Failed to update profile' }); }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Required' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Min 6 chars' });

    const usersCollection = await getCollection('users');
    if (!usersCollection) return res.status(500).json({ error: 'Database not available' });

    const dbUser = await usersCollection.findOne({
      username: { $regex: new RegExp('^' + req.user.username + '$', 'i') }
    });
    if (!dbUser) return res.status(404).json({ error: 'Not found' });

    let isCurrentPasswordValid = false;

    // Check passwords collection first
    const passwords = await getCollection('passwords');
    if (passwords) {
      const savedPassword = await passwords.findOne({ username: dbUser.username });
      if (savedPassword && savedPassword.password_hash) {
        isCurrentPasswordValid = await bcrypt.compare(currentPassword, savedPassword.password_hash);
      }
    }

    // Check user's password_hash
    if (!isCurrentPasswordValid && dbUser.password_hash) {
      isCurrentPasswordValid = await bcrypt.compare(currentPassword, dbUser.password_hash);
    }

    // Check plain text password (legacy)
    if (!isCurrentPasswordValid && dbUser.password) {
      isCurrentPasswordValid = currentPassword === dbUser.password;
    }

    if (!isCurrentPasswordValid) return res.status(401).json({ error: 'Incorrect' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    if (passwords) {
      await passwords.updateOne(
        { username: dbUser.username },
        { $set: { password_hash: hashedPassword, updatedAt: new Date().toISOString() } },
        { upsert: true }
      );
    }
    res.json({ message: 'Success' });
  } catch (error) { res.status(500).json({ error: 'Failed' }); }
};

function safeDateString(value) {
  if (!value && value !== 0) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value);
  if (s.length >= 10) return s.slice(0, 10);
  return s;
}

exports.getHistory = async (req, res) => {
  try {
    const { year: yearStr, month: monthStr } = req.params;
    // Allow admin to specify a student explicitly, otherwise default to authenticated user
    const username = req.query.studentId || req.user.username; 

    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);

    if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'Invalid year or month parameter' });
    }

    const paddedMonth = String(month).padStart(2, '0');
    const startRange = `${year}-${paddedMonth}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endRange = `${year}-${paddedMonth}-${String(lastDay).padStart(2, '0')}`;

    const gatha = await getCollection('gatha');
    const attendance = await getCollection('attendance');

    const gathaDetails = gatha ? await gatha
      .find({
        username: username,
        created_at: {
          $gte: new Date(startRange),
          $lte: new Date(endRange + 'T23:59:59.999Z')
        }
      })
      .sort({ created_at: 1 })
      .toArray() : [];

    const attendanceRecords = attendance ? await attendance
      .find({
        username: username,
        date: { $gte: startRange, $lte: endRange }
      })
      .toArray() : [];

    const daysInMonth = new Date(year, month, 0).getDate();
    const dailyActivity = {};

    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${paddedMonth}-${String(i).padStart(2, '0')}`;
      dailyActivity[dateStr] = {
        present: false,
        gathas: { new: 0, revision: 0 },
        details: []
      };
    }

    attendanceRecords.forEach((att) => {
      const dateStr = safeDateString(att.date);
      if (dateStr && dailyActivity[dateStr]) {
        dailyActivity[dateStr].present = true;
      }
    });

    gathaDetails.forEach((entry) => {
      const dateStr = safeDateString(entry.created_at);
      if (!dateStr || !dailyActivity[dateStr]) return;

      const count = Number(entry.total_gatha || 0);
      if (entry.type === 'new') dailyActivity[dateStr].gathas.new += count;
      else if (entry.type === 'revision') dailyActivity[dateStr].gathas.revision += count;

      dailyActivity[dateStr].details.push({
        id: entry._id.toString(),
        type: entry.type,
        sutra_name: entry.sutra_name,
        which_gatha: entry.which_gatha,
        total_gatha: entry.total_gatha
      });
    });

    res.json({ year, month, dailyActivity });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ error: 'Failed to fetch history', details: error.message });
  }
};
