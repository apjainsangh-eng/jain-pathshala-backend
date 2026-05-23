const { getCollection } = require('../config/db');
const { calculateStreaks } = require('../utils/helpers');

exports.getYearlyStats = async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const attendance = await getCollection('attendance');
    if (!attendance) return res.json({ totalDaysPresent: 0 });
    
    const count = await attendance.countDocuments({
      username: req.user.username,
      date: { $gte: startDate, $lte: endDate }
    });

    res.json({ totalDaysPresent: count });
  } catch (error) {
    res.json({ totalDaysPresent: 0 });
  }
};

exports.getComprehensiveStats = async (req, res) => {
  try {
    const now = new Date();
    const selectedYear = parseInt(req.query.year) || now.getFullYear();
    const selectedMonth = parseInt(req.query.month) || (now.getMonth() + 1);
    const currentYear = selectedYear;
    const currentMonth = selectedMonth - 1;
    
    const yearStart = `${currentYear}-01-01`;
    const yearEnd = `${currentYear}-12-31`;
    const monthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
    const monthEnd = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${new Date(currentYear, currentMonth + 1, 0).getDate()}`;
    
    const attendance = await getCollection('attendance');
    const gatha = await getCollection('gatha');
    
    let stats = {
      totalAttendance: 0,
      totalGathas: 0,
      totalNewGathas: 0,
      totalRevisionGathas: 0,
      yearlyAttendance: 0,
      yearlyGathas: 0,
      monthlyAttendance: 0,
      monthlyGathas: 0,
      monthlyNewGathas: 0,
      monthlyRevisionGathas: 0,
      currentStreak: 0,
      maxStreak: 0,
      specialConditions: {
        early_attendance: false,
        night_gatha: false,
        weekend_attendance: false,
        first_day: false
      },
      daysInCurrentMonth: new Date(currentYear, currentMonth + 1, 0).getDate(),
      workingDays: 22
    };
    
    if (attendance) {
      stats.totalAttendance = await attendance.countDocuments({ username: req.user.username });
      stats.yearlyAttendance = await attendance.countDocuments({ 
        username: req.user.username,
        date: { $gte: yearStart, $lte: yearEnd }
      });
      stats.monthlyAttendance = await attendance.countDocuments({ 
        username: req.user.username,
        date: { $gte: monthStart, $lte: monthEnd }
      });
      
      const allAttendance = await attendance
        .find({ username: req.user.username })
        .sort({ date: -1 })
        .toArray();
      
      const streakData = calculateStreaks(allAttendance.map(a => a.date));
      stats.currentStreak = streakData.current;
      stats.maxStreak = streakData.max;
      
      const firstOfMonth = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
      const firstDayAttendance = await attendance.findOne({
        username: req.user.username,
        date: firstOfMonth
      });
      stats.specialConditions.first_day = !!firstDayAttendance;
    }
    
    if (gatha) {
      const lifetimeGathas = await gatha.aggregate([
        { $match: { username: req.user.username } },
        { $group: { _id: '$type', total: { $sum: '$total_gatha' } }}
      ]).toArray();
      
      lifetimeGathas.forEach(g => {
        if (g._id === 'new') stats.totalNewGathas = g.total || 0;
        else stats.totalRevisionGathas = g.total || 0;
      });
      stats.totalGathas = stats.totalNewGathas + stats.totalRevisionGathas;
      
      const yearlyGathas = await gatha.aggregate([
        { $match: { username: req.user.username, date: { $gte: yearStart, $lte: yearEnd } }},
        { $group: { _id: null, total: { $sum: '$total_gatha' } }}
      ]).toArray();
      stats.yearlyGathas = yearlyGathas[0]?.total || 0;
      
      const monthlyGathas = await gatha.aggregate([
        { $match: { username: req.user.username, date: { $gte: monthStart, $lte: monthEnd } }},
        { $group: { _id: '$type', total: { $sum: '$total_gatha' } }}
      ]).toArray();
      
      monthlyGathas.forEach(g => {
        if (g._id === 'new') stats.monthlyNewGathas = g.total || 0;
        else stats.monthlyRevisionGathas = g.total || 0;
      });
      stats.monthlyGathas = stats.monthlyNewGathas + stats.monthlyRevisionGathas;
    }
    
    res.json(stats);
  } catch (error) {
    console.error('Comprehensive stats error:', error);
    res.json({
      totalAttendance: 0, totalGathas: 0, totalNewGathas: 0, totalRevisionGathas: 0,
      yearlyAttendance: 0, yearlyGathas: 0, monthlyAttendance: 0, monthlyGathas: 0,
      monthlyNewGathas: 0, monthlyRevisionGathas: 0, currentStreak: 0, maxStreak: 0,
      specialConditions: {}, daysInCurrentMonth: 22, workingDays: 22
    });
  }
};
