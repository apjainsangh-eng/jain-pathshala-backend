// exportRoutes.js
const express = require('express');
const router = express.Router();
const { getCollection } = require('../config/db');
const { formatDate, getCurrentMonthRange } = require('../utils/helpers');

// ============================================
// Routes
// ============================================

// Admin Export Report (Summary)
router.get('/report', async (req, res) => {

  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const { startDate, endDate, format } = req.query;
    const monthRange = getCurrentMonthRange();
    const start = startDate || monthRange.start;
    const end = endDate || monthRange.end;

    const attendance = await getCollection('attendance');
    const gatha = await getCollection('gatha');

    const usersCollection = await getCollection('users');
    const allStudentsList = usersCollection
      ? await usersCollection.find({ role: 'student' }).toArray()
      : [];

    const studentsData = await Promise.all(
      allStudentsList.map(async (student) => {
        let attendanceCount = 0, newGathas = 0, revisionGathas = 0;

        if (attendance) {
          attendanceCount = await attendance.countDocuments({ 
            username: student.username,
            date: { $gte: start, $lte: end }
          });
        }

        if (gatha) {
          const gathaRecords = await gatha.find({ 
            username: student.username,
            date: { $gte: start, $lte: end }
          }).toArray();

          gathaRecords.forEach(g => {
            const count = parseInt(g.total_gatha) || 0;
            if (g.type === 'new') newGathas += count;
            else revisionGathas += count;
          });
        }

        return {
          username: student.username,
          name: student.name,
          attendanceCount,
          newGathas,
          revisionGathas,
          totalGathas: newGathas + revisionGathas,
          totalScore: attendanceCount + newGathas
        };
      })
    );

    studentsData.sort((a, b) => a.name.localeCompare(b.name));

    const totalAttendance = studentsData.reduce((sum, s) => sum + s.attendanceCount, 0);
    const totalNewGathas = studentsData.reduce((sum, s) => sum + s.newGathas, 0);
    const totalRevisionGathas = studentsData.reduce((sum, s) => sum + s.revisionGathas, 0);

    const summary = {
      totalStudents: studentsData.length,
      activeStudents: studentsData.filter(s => s.attendanceCount > 0 || s.newGathas > 0).length,
      totalAttendance,
      totalNewGathas,
      totalRevisionGathas,
      totalGathas: totalNewGathas + totalRevisionGathas,
      totalScore: totalAttendance + totalNewGathas,
      dateRange: { start, end }
    };

    const topByAttendance = [...studentsData].sort((a, b) => b.attendanceCount - a.attendanceCount).slice(0, 5);
    const topByGatha = [...studentsData].sort((a, b) => b.newGathas - a.newGathas).slice(0, 5);
    const topByTotal = [...studentsData].sort((a, b) => b.totalScore - a.totalScore).slice(0, 5);

    // CSV Format
    if (format === 'csv') {
      let csv = 'S.No,Name,Username,Attendance (Days),New Gathas,Revision Gathas,Total Score\n';
       
      studentsData.forEach((student, index) => {
        csv += `${index + 1},"${student.name}","${student.username}",${student.attendanceCount},${student.newGathas},${student.revisionGathas},${student.totalScore}\n`;
      });

      csv += `\n\nSUMMARY\n`;
      csv += `Total Students,${summary.totalStudents}\n`;
      csv += `Active Students,${summary.activeStudents}\n`;
      csv += `Total Attendance,${summary.totalAttendance}\n`;
      csv += `Total New Gathas,${summary.totalNewGathas}\n`;
      csv += `Total Revision Gathas,${summary.totalRevisionGathas}\n`;
      csv += `Total Score,${summary.totalScore}\n`;
      csv += `Date Range,${start} to ${end}\n`;
      csv += `\nNote: Total Score = Attendance + New Gathas\n`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=pathshala-report-${start}-to-${end}.csv`);
      return res.send(csv);
    }

    // Text Format
    if (format === 'text') {
      let text = `📊 JAIN PATHSHALA REPORT\n`;
      text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `📅 Period: ${formatDate(start)} to ${formatDate(end)}\n`;
      text += `👥 Total Students: ${summary.totalStudents}\n`;
      text += `✅ Active Students: ${summary.activeStudents}\n`;
      text += `📈 Total Attendance: ${summary.totalAttendance}\n`;
      text += `✨ Total New Gathas: ${summary.totalNewGathas}\n`;
      text += `🔄 Total Revisions: ${summary.totalRevisionGathas}\n`;
      text += `⭐ Total Score: ${summary.totalScore}\n`;
      text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
       
      text += `🏆 TOP PERFORMERS (by Total Score)\n`;
      text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      topByTotal.forEach((s, i) => {
        text += `  ${i + 1}. ${s.name} - ⭐${s.totalScore} (📅${s.attendanceCount} + ✨${s.newGathas})\n`;
      });

      text += `\n📅 Top by Attendance:\n`;
      topByAttendance.forEach((s, i) => {
        text += `  ${i + 1}. ${s.name} - ${s.attendanceCount} days\n`;
      });

      text += `\n✨ Top by New Gathas:\n`;
      topByGatha.forEach((s, i) => {
        text += `  ${i + 1}. ${s.name} - ${s.newGathas} gathas\n`;
      });
       
      text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `STUDENT-WISE DETAILS (A-Z):\n`;
      text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

      studentsData.forEach((student, idx) => {
        text += `${idx + 1}. ${student.name}\n`;
        text += `   📅 Attendance: ${student.attendanceCount} days\n`;
        text += `   ✨ New Gathas: ${student.newGathas}\n`;
        text += `   🔄 Revisions: ${student.revisionGathas}\n`;
        text += `   ⭐ Total Score: ${student.totalScore}\n\n`;
      });

      text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `📝 Note: Total Score = Attendance + New Gathas\n`;
      text += `Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n`;
      text += `Jai Jinendra! 🙏\n`;

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(text);
    }

    // Default: JSON
    res.json({
      students: studentsData,
      summary,
      topPerformers: {
        byAttendance: topByAttendance,
        byGatha: topByGatha,
        byTotal: topByTotal
      },
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Export report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

module.exports = router;
