const { getCollection } = require('../config/db');
const { canActAs } = require('../utils/helpers');

exports.getHistoryMonth = async (req, res) => {
  try {
    const { year, month } = req.params;
    const { studentId } = req.query; 
    
    let targetUsername = req.user.username; 

    if (studentId && studentId !== req.user.username) {
      const authorized = await canActAs(req.user.username, studentId);
      if (!authorized) {
        return res.status(403).json({ error: 'Not authorized to view this student\'s history' });
      }
      targetUsername = studentId;
    }

    const dailyActivity = {};
    const pm = month.toString().padStart(2, '0');
    const daysInMonth = new Date(year, month, 0).getDate();
    const start = `${year}-${pm}-01`;
    const end = `${year}-${pm}-${daysInMonth}`;

    const attendance = await getCollection('attendance');
    const gatha = await getCollection('gatha');

    if (attendance) {
      const attRecords = await attendance.find({
        username: targetUsername,
        date: { $gte: start, $lte: end }
      }).toArray();

      attRecords.forEach(r => {
        dailyActivity[r.date] = { present: true, gathas: { new: 0, revision: 0 }, details: [] };
      });
    }

    if (gatha) {
      const gathaRecords = await gatha.find({
        username: targetUsername,
        date: { $gte: start, $lte: end }
      }).toArray();

      gathaRecords.forEach(r => {
        if (!dailyActivity[r.date]) {
          dailyActivity[r.date] = { present: false, gathas: { new: 0, revision: 0 }, details: [] };
        }
        const count = parseInt(r.total_gatha) || 0;
        dailyActivity[r.date].gathas[r.type || 'new'] += count;
        dailyActivity[r.date].details.push(r);
      });
    }

    res.json({ dailyActivity });
  } catch (error) {
    console.error('History error:', error);
    res.json({ dailyActivity: {} });
  }
};

exports.getHistoryRange = async (req, res) => {
  try {
    const { startDate, endDate, studentId } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ error: 'startDate and endDate required' });

    let targetUsername = req.user.username;
    if (studentId && studentId !== req.user.username) {
      const authorized = await canActAs(req.user.username, studentId);
      if (!authorized) {
        return res.status(403).json({ error: 'Not authorized to view this student\'s history' });
      }
      targetUsername = studentId;
    }
    
    const dailyActivity = {};
    const attendance = await getCollection('attendance');
    const gatha = await getCollection('gatha');
    
    if (attendance) {
      const attRecords = await attendance.find({
        username: targetUsername,
        date: { $gte: startDate, $lte: endDate }
      }).toArray();
      
      attRecords.forEach(r => {
        dailyActivity[r.date] = { present: true, gathas: { new: 0, revision: 0 }, details: [], attendanceTime: r.created_at };
      });
    }
    
    if (gatha) {
      const gathaRecords = await gatha.find({
        username: targetUsername,
        date: { $gte: startDate, $lte: endDate }
      }).toArray();
      
      gathaRecords.forEach(r => {
        if (!dailyActivity[r.date]) {
          dailyActivity[r.date] = { present: false, gathas: { new: 0, revision: 0 }, details: [] };
        }
        const count = parseInt(r.total_gatha) || 0;
        const type = r.type || 'new';
        dailyActivity[r.date].gathas[type] += count;
        dailyActivity[r.date].details.push({
          id: r._id.toString(), type: r.type, sutra_name: r.sutra_name, which_gatha: r.which_gatha,
          total_gatha: r.total_gatha, created_at: r.created_at
        });
      });
    }
    
    let totalDays = 0, totalNewGathas = 0, totalRevisionGathas = 0;
    Object.values(dailyActivity).forEach(day => {
      if (day.present) totalDays++;
      totalNewGathas += day.gathas.new;
      totalRevisionGathas += day.gathas.revision;
    });
    
    res.json({ dailyActivity, summary: { totalDays, totalNewGathas, totalRevisionGathas, totalGathas: totalNewGathas + totalRevisionGathas } });
  } catch (error) {
    res.json({ dailyActivity: {}, summary: {} });
  }
};
