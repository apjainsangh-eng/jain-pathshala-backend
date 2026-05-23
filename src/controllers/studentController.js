const { getCollection } = require('../config/db');
const { canActAs, calculateStreaks, formatTime, formatDate } = require('../utils/helpers');

exports.getFamilyMembers = async (req, res) => {
  try {
    const groups = await getCollection('family_groups');
    if (!groups) return res.json({ familyMembers: [], groupName: null });

    const userGroup = await groups.findOne({
      members: req.user.username
    });

    if (!userGroup) {
      return res.json({ familyMembers: [], groupName: null });
    }

    const usersCollection = await getCollection('users');
    const memberDocs = usersCollection
      ? await usersCollection.find({ username: { $in: userGroup.members } }).toArray()
      : [];
    const memberMap = {};
    memberDocs.forEach(m => { memberMap[m.username] = m.name || m.username; });

    const familyMembers = userGroup.members.map(username => ({
      username,
      name: memberMap[username] || username,
      isCurrent: username === req.user.username
    }));

    res.json({ 
      familyMembers,
      groupName: userGroup.groupName,
      groupId: userGroup._id.toString()
    });
  } catch (error) {
    console.error('Get family members error:', error);
    res.json({ familyMembers: [], groupName: null });
  }
};

exports.getFamilyMemberData = async (req, res) => {
  try {
    const targetUser = req.params.username;

    if (targetUser !== req.user.username) {
      const canAct = await canActAs(req.user.username, targetUser);
      if (!canAct) {
        return res.status(403).json({ error: 'You cannot view this user\'s data' });
      }
    }

    const attendance = await getCollection('attendance');
    const gatha = await getCollection('gatha');
    const pendingAttendance = await getCollection('pending_attendance');
    const pendingGatha = await getCollection('pending_gatha');

    const usersCol = await getCollection('users');
    const targetDbUser = usersCol ? await usersCol.findOne({ username: { $regex: new RegExp('^' + targetUser + '$', 'i') } }) : null;
    const targetInfo = { name: targetDbUser?.name || targetUser, username: targetUser };

    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    // Date ranges
    const yearStart = `${currentYear}-01-01`;
    const yearEnd = `${currentYear}-12-31`;
    const monthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
    const monthEnd = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${new Date(currentYear, currentMonth + 1, 0).getDate()}`;
    
    let todayAttendance = null;
    let todayPendingAttendance = null;
    
    if (attendance) {
      todayAttendance = await attendance.findOne({ username: targetUser, date: today });
    }
    if (pendingAttendance) {
      todayPendingAttendance = await pendingAttendance.findOne({ 
        username: targetUser, 
        date: today,
        status: 'pending'
      });
    }

    let allAttendance = [];
    let recentAttendance = [];
    let recentGathas = [];
    let pendingGathaList = [];
    let pendingAttendanceList = [];

    if (attendance) {
      allAttendance = await attendance
        .find({ username: targetUser })
        .sort({ date: -1 })
        .toArray();
      
      recentAttendance = allAttendance.slice(0, 60);
    }

    if (gatha) {
      recentGathas = await gatha
        .find({ username: targetUser })
        .sort({ created_at: -1 })
        .limit(60)
        .toArray();
    }

    if (pendingGatha) {
      pendingGathaList = await pendingGatha
        .find({ username: targetUser, status: 'pending' })
        .sort({ created_at: -1 })
        .toArray();
    }

    if (pendingAttendance) {
      pendingAttendanceList = await pendingAttendance
        .find({ username: targetUser, status: 'pending' })
        .sort({ created_at: -1 })
        .toArray();
    }

    const streakData = calculateStreaks(allAttendance.map(a => a.date));

    let yearlyAttendance = 0;
    let yearlyNewGathas = 0;

    if (attendance) {
      yearlyAttendance = await attendance.countDocuments({
        username: targetUser,
        date: { $gte: yearStart, $lte: yearEnd }
      });
    }

    if (gatha) {
      const gathaSum = await gatha.aggregate([
        { 
          $match: { 
            username: targetUser,
            date: { $gte: yearStart, $lte: yearEnd },
            type: 'new'
          } 
        },
        { $group: { _id: null, total: { $sum: '$total_gatha' } } }
      ]).toArray();
      yearlyNewGathas = gathaSum[0]?.total || 0;
    }

    let monthlyAttendance = 0;
    let monthlyNewGathas = 0;
    let monthlyRevisionGathas = 0;

    if (attendance) {
      monthlyAttendance = await attendance.countDocuments({
        username: targetUser,
        date: { $gte: monthStart, $lte: monthEnd }
      });
    }

    if (gatha) {
      const monthlyGathaStats = await gatha.aggregate([
        { 
          $match: { 
            username: targetUser,
            date: { $gte: monthStart, $lte: monthEnd }
          } 
        },
        { $group: { _id: '$type', total: { $sum: '$total_gatha' } } }
      ]).toArray();
      
      monthlyGathaStats.forEach(g => {
        if (g._id === 'new') monthlyNewGathas = g.total || 0;
        else monthlyRevisionGathas = g.total || 0;
      });
    }

    res.json({
      user: {
        username: targetUser,
        name: targetInfo.name
      },
      today: {
        isMarked: !!todayAttendance,
        isPending: !!todayPendingAttendance,
        date: today
      },
      stats: {
        yearlyAttendance,
        yearlyNewGathas,
        monthlyAttendance,
        monthlyNewGathas,
        monthlyRevisionGathas,
        currentStreak: streakData.current,
        maxStreak: streakData.max,
        workingDays: 22
      },
      recentAttendance: recentAttendance.map(a => ({
        ...a,
        id: a._id.toString()
      })),
      recentGathas: recentGathas.map(g => ({
        ...g,
        id: g._id.toString()
      })),
      pendingGathas: pendingGathaList.map(g => ({
        ...g,
        id: g._id.toString()
      })),
      pendingAttendance: pendingAttendanceList.map(a => ({
        ...a,
        id: a._id.toString()
      }))
    });
  } catch (error) {
    console.error('Get family member data error:', error);
    res.status(500).json({ error: 'Failed to get data' });
  }
};

exports.getFamilyMemberStats = async (req, res) => {
  try {
    const targetUser = req.params.username;

    if (targetUser !== req.user.username) {
      const canAct = await canActAs(req.user.username, targetUser);
      if (!canAct) {
        return res.status(403).json({ error: 'You cannot view this user\'s stats' });
      }
    }

    const now = new Date();
    const selectedYear = parseInt(req.query.year) || now.getFullYear();
    const selectedMonth = parseInt(req.query.month) || (now.getMonth() + 1);
    
    const monthStart = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const monthEnd = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-${daysInMonth}`;

    const attendance = await getCollection('attendance');
    const gatha = await getCollection('gatha');

    let stats = {
      monthlyAttendance: 0,
      monthlyNewGathas: 0,
      monthlyRevisionGathas: 0,
      currentStreak: 0,
      maxStreak: 0,
      workingDays: 22,
      daysInMonth: daysInMonth
    };

    if (attendance) {
      stats.monthlyAttendance = await attendance.countDocuments({
        username: targetUser,
        date: { $gte: monthStart, $lte: monthEnd }
      });

      const allAttendance = await attendance
        .find({ username: targetUser })
        .sort({ date: -1 })
        .toArray();
      
      const streakData = calculateStreaks(allAttendance.map(a => a.date));
      stats.currentStreak = streakData.current;
      stats.maxStreak = streakData.max;
    }

    if (gatha) {
      const monthlyGathaStats = await gatha.aggregate([
        { 
          $match: { 
            username: targetUser,
            date: { $gte: monthStart, $lte: monthEnd }
          } 
        },
        { $group: { _id: '$type', total: { $sum: '$total_gatha' } } }
      ]).toArray();
      
      monthlyGathaStats.forEach(g => {
        if (g._id === 'new') stats.monthlyNewGathas = g.total || 0;
        else stats.monthlyRevisionGathas = g.total || 0;
      });
    }

    res.json(stats);
  } catch (error) {
    console.error('Get family member stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
};
