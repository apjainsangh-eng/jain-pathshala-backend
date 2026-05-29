const { getCollection } = require('../config/db');
const { ObjectId } = require('mongodb');

// POST /admin/bulk/attendance
// Body: { date, entries: [{ username, status, remark }] }
// status: 'present' | 'absent' | 'excused'
exports.bulkAttendance = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const { date, entries } = req.body;

    if (!date || !entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'Date and entries array required' });
    }

    const attendance = await getCollection('attendance');
    if (!attendance) return res.status(500).json({ error: 'Database not available' });

    const auditLog = await getCollection('audit_log');
    const now = new Date().toISOString();
    let added = 0;
    let skipped = 0;
    const errors = [];

    for (const entry of entries) {
      if (!entry.username) continue;

      // Only add attendance for 'present' status
      if (entry.status !== 'present') {
        // For absent/excused, we just skip (absence is implied by no record)
        continue;
      }

      // Check if already exists
      const existing = await attendance.findOne({ username: entry.username, date });
      if (existing) {
        skipped++;
        continue;
      }

      await attendance.insertOne({
        username: entry.username,
        student_name: entry.username,
        date,
        status: entry.status || 'present',
        remark: entry.remark || '',
        created_at: now,
        approved_by: req.user.username || req.user.name,
        approved_at: now,
        added_by_admin: true,
        bulk_entry: true
      });

      added++;

      // Audit log
      if (auditLog) {
        await auditLog.insertOne({
          action: 'bulk_attendance_add',
          targetUsername: entry.username,
          date,
          performedBy: req.user.username || req.user.name,
          details: { status: entry.status, remark: entry.remark },
          created_at: now
        });
      }
    }

    res.json({
      message: `Bulk attendance saved`,
      added,
      skipped,
      total: entries.length
    });
  } catch (error) {
    console.error('Bulk attendance error:', error);
    res.status(500).json({ error: 'Failed to save bulk attendance' });
  }
};

// POST /admin/bulk/gatha
// Body: { date, entries: [{ username, sutraName, whichGatha, totalGatha, type, remark, score }] }
exports.bulkGatha = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const { date, entries } = req.body;

    if (!date || !entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'Date and entries array required' });
    }

    const gatha = await getCollection('gatha');
    if (!gatha) return res.status(500).json({ error: 'Database not available' });

    const auditLog = await getCollection('audit_log');
    const now = new Date().toISOString();
    let added = 0;

    for (const entry of entries) {
      if (!entry.username) continue;
      if (entry.type !== 'other' && (!entry.sutraName || !entry.totalGatha)) continue;

      const resolvedTypeName = entry.activityTypeName || (entry.type === 'new' ? 'New Learning' : entry.type === 'revision' ? 'Revision' : entry.type || 'New Learning');
      const resolvedType = (() => {
        const lower = resolvedTypeName.toLowerCase().trim();
        if (lower === 'new learning' || lower === 'new') return 'new';
        if (lower === 'revision') return 'revision';
        return lower.replace(/\s+/g, '_');
      })();

      await gatha.insertOne({
        username: entry.username,
        student_name: entry.username,
        type: resolvedType,
        activityTypeId: entry.activityTypeId || null,
        activityTypeName: resolvedTypeName,
        customActivityDescription: resolvedTypeName === 'Other' ? (entry.customActivityDescription || null) : null,
        sutra_name: entry.sutraName,
        which_gatha: entry.whichGatha || '',
        total_gatha: parseInt(entry.totalGatha) || 1,
        date,
        remark: entry.remark || '',
        score: entry.score || 0,
        created_at: now,
        approved_by: req.user.username || req.user.name,
        approved_at: now,
        added_by_admin: true,
        bulk_entry: true
      });

      added++;

      // Audit log
      if (auditLog) {
        await auditLog.insertOne({
          action: 'bulk_gatha_add',
          targetUsername: entry.username,
          date,
          performedBy: req.user.username || req.user.name,
          details: {
            sutraName: entry.sutraName,
            whichGatha: entry.whichGatha,
            totalGatha: entry.totalGatha,
            type: entry.type
          },
          created_at: now
        });
      }
    }

    res.json({
      message: `Bulk gatha saved`,
      added,
      total: entries.length
    });
  } catch (error) {
    console.error('Bulk gatha error:', error);
    res.status(500).json({ error: 'Failed to save bulk gatha' });
  }
};

// GET /admin/attendance-register?startDate=...&endDate=...
exports.getAttendanceRegister = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate required' });
    }

    const attendance = await getCollection('attendance');

    // Generate all dates in range
    const dates = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split('T')[0]);
    }

    // Get all students from DB
    const usersCollection = await getCollection('users');
    const allStudentsList = usersCollection
      ? (await usersCollection.find({ role: 'student' }).toArray()).map(u => ({ username: u.username, name: u.name || u.username }))
      : [];
    allStudentsList.sort((a, b) => a.name.localeCompare(b.name));

    // Get all attendance records in range
    let attRecords = [];
    if (attendance) {
      attRecords = await attendance.find({
        date: { $gte: startDate, $lte: endDate }
      }).toArray();
    }

    // Build matrix
    const attMap = {};
    attRecords.forEach(r => {
      const key = r.username + '|' + r.date;
      attMap[key] = true;
    });

    // Find groups
    const familyGroupsColl = await getCollection('family_groups');
    const groupsData = familyGroupsColl ? await familyGroupsColl.find({}).toArray() : [];
    const groupLookup = {};
    groupsData.forEach(g => {
      (g.members || []).forEach(m => {
        groupLookup[m] = g.groupName;
      });
    });

    const students = allStudentsList.map(s => {
      const attendanceMap = {};
      let presentCount = 0;

      dates.forEach(date => {
        const isPresent = !!attMap[s.username + '|' + date];
        attendanceMap[date] = isPresent;
        if (isPresent) presentCount++;
      });

      return {
        username: s.username,
        name: s.name,
        group: groupLookup[s.username] || null,
        attendance: attendanceMap,
        presentCount,
        totalDays: dates.length,
        attendancePercent: dates.length > 0 ? Math.round((presentCount / dates.length) * 100) : 0
      };
    });

    res.json({ dates, students });
  } catch (error) {
    console.error('Attendance register error:', error);
    res.status(500).json({ error: 'Failed to load register' });
  }
};

// POST /admin/bulk/approve
// Body: { ids: [{ id, type: 'attendance'|'gatha' }] }
exports.bulkApprove = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'IDs array required' });
    }

    const pendingAttendance = await getCollection('pending_attendance');
    const pendingGatha = await getCollection('pending_gatha');
    const attendance = await getCollection('attendance');
    const gatha = await getCollection('gatha');
    const auditLog = await getCollection('audit_log');
    const now = new Date().toISOString();

    let approvedAtt = 0;
    let approvedGatha = 0;

    for (const item of ids) {
      try {
        if (item.type === 'attendance' && pendingAttendance && attendance) {
          const pending = await pendingAttendance.findOne({ _id: new ObjectId(item.id), status: 'pending' });
          if (pending) {
            await attendance.insertOne({
              username: pending.username,
              student_name: pending.student_name || pending.username,
              date: pending.date,
              created_at: now,
              approved_by: req.user.username,
              approved_at: now
            });
            await pendingAttendance.updateOne(
              { _id: new ObjectId(item.id) },
              { $set: { status: 'approved', reviewed_at: now, reviewed_by: req.user.username } }
            );
            approvedAtt++;
          }
        } else if (item.type === 'gatha' && pendingGatha && gatha) {
          const pending = await pendingGatha.findOne({ _id: new ObjectId(item.id), status: 'pending' });
          if (pending) {
            await gatha.insertOne({
              username: pending.username,
              student_name: pending.student_name || pending.username,
              type: pending.type,
              activityTypeId: pending.activityTypeId || null,
              activityTypeName: pending.activityTypeName || (pending.type === 'new' ? 'New Learning' : pending.type === 'revision' ? 'Revision' : pending.type),
              customActivityDescription: pending.customActivityDescription || null,
              sutra_name: pending.sutra_name,
              which_gatha: pending.which_gatha,
              total_gatha: pending.total_gatha,
              date: pending.date,
              created_at: now,
              approved_by: req.user.username,
              approved_at: now
            });
            await pendingGatha.updateOne(
              { _id: new ObjectId(item.id) },
              { $set: { status: 'approved', reviewed_at: now, reviewed_by: req.user.username } }
            );
            approvedGatha++;
          }
        }

        if (auditLog) {
          await auditLog.insertOne({
            action: 'bulk_approve',
            entryId: item.id,
            entryType: item.type,
            performedBy: req.user.username,
            created_at: now
          });
        }
      } catch (e) {
        console.error('Error approving item:', item.id, e);
      }
    }

    res.json({
      message: 'Bulk approval complete',
      approved: { attendance: approvedAtt, gatha: approvedGatha }
    });
  } catch (error) {
    console.error('Bulk approve error:', error);
    res.status(500).json({ error: 'Failed' });
  }
};

// POST /admin/bulk/reject
// Body: { ids: [{ id, type: 'attendance'|'gatha' }], reason }
exports.bulkReject = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const { ids, reason } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'IDs array required' });
    }

    const pendingAttendance = await getCollection('pending_attendance');
    const pendingGatha = await getCollection('pending_gatha');
    const auditLog = await getCollection('audit_log');
    const now = new Date().toISOString();

    let rejectedAtt = 0;
    let rejectedGatha = 0;

    for (const item of ids) {
      try {
        if (item.type === 'attendance' && pendingAttendance) {
          await pendingAttendance.updateOne(
            { _id: new ObjectId(item.id), status: 'pending' },
            { $set: { status: 'rejected', reviewed_at: now, reviewed_by: req.user.username, rejection_reason: reason || 'Rejected by admin' } }
          );
          rejectedAtt++;
        } else if (item.type === 'gatha' && pendingGatha) {
          await pendingGatha.updateOne(
            { _id: new ObjectId(item.id), status: 'pending' },
            { $set: { status: 'rejected', reviewed_at: now, reviewed_by: req.user.username, rejection_reason: reason || 'Rejected by admin' } }
          );
          rejectedGatha++;
        }

        if (auditLog) {
          await auditLog.insertOne({
            action: 'bulk_reject',
            entryId: item.id,
            entryType: item.type,
            performedBy: req.user.username,
            reason: reason || 'Rejected by admin',
            created_at: now
          });
        }
      } catch (e) {
        console.error('Error rejecting item:', item.id, e);
      }
    }

    res.json({
      message: 'Bulk rejection complete',
      rejected: { attendance: rejectedAtt, gatha: rejectedGatha }
    });
  } catch (error) {
    console.error('Bulk reject error:', error);
    res.status(500).json({ error: 'Failed' });
  }
};

// GET /admin/dashboard-analytics
exports.getDashboardAnalytics = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const monthStart = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
    const monthEnd = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${new Date(currentYear, currentMonth + 1, 0).getDate()}`;
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    const attendance = await getCollection('attendance');
    const gatha = await getCollection('gatha');
    const pendingAttendance = await getCollection('pending_attendance');
    const pendingGatha = await getCollection('pending_gatha');

    const usersCol = await getCollection('users');
    const totalStudents = usersCol ? await usersCol.countDocuments({ role: 'student' }) : 0;

    // Today's attendance
    let todayAttendance = 0;
    if (attendance) {
      todayAttendance = await attendance.countDocuments({ date: today });
    }

    // Monthly attendance total
    let monthlyAttendanceTotal = 0;
    if (attendance) {
      monthlyAttendanceTotal = await attendance.countDocuments({
        date: { $gte: monthStart, $lte: monthEnd }
      });
    }

    const monthlyAttendancePercent = totalStudents > 0 && daysInMonth > 0
      ? Math.round((monthlyAttendanceTotal / (totalStudents * daysInMonth)) * 100)
      : 0;

    // Pending counts
    let pendingAttCount = 0, pendingGathaCount = 0;
    if (pendingAttendance) {
      pendingAttCount = await pendingAttendance.countDocuments({ status: 'pending' });
    }
    if (pendingGatha) {
      pendingGathaCount = await pendingGatha.countDocuments({ status: 'pending' });
    }

    // Students absent 3+ consecutive days
    const absentAlerts = [];
    const allDbStudents = usersCol ? await usersCol.find({ role: 'student' }).toArray() : [];

    if (attendance) {
      for (const student of allDbStudents) {
        const lastAtt = await attendance.find({ username: student.username })
          .sort({ date: -1 }).limit(1).toArray();

        if (lastAtt.length > 0) {
          const daysSince = Math.ceil((now - new Date(lastAtt[0].date)) / (1000 * 60 * 60 * 24));
          if (daysSince >= 3) {
            absentAlerts.push({ username: student.username, name: student.name || student.username, lastDate: lastAtt[0].date, daysSince });
          }
        } else {
          absentAlerts.push({ username: student.username, name: student.name || student.username, lastDate: null, daysSince: 999 });
        }
      }
    }

    absentAlerts.sort((a, b) => b.daysSince - a.daysSince);

    // Students with no gatha in 15+ days
    const noGathaAlerts = [];
    if (gatha) {
      for (const student of allDbStudents) {
        const lastGatha = await gatha.find({ username: student.username })
          .sort({ date: -1 }).limit(1).toArray();
        const daysSince = lastGatha.length > 0
          ? Math.ceil((now - new Date(lastGatha[0].date)) / (1000 * 60 * 60 * 24))
          : 999;
        if (daysSince >= 15) {
          noGathaAlerts.push({ username: student.username, name: student.name || student.username, lastDate: lastGatha.length > 0 ? lastGatha[0].date : null, daysSince });
        }
      }
    }

    noGathaAlerts.sort((a, b) => b.daysSince - a.daysSince);

    // Old pending (>2 days)
    const oldPending = [];
    const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();

    if (pendingAttendance) {
      const oldPendingAtt = await pendingAttendance.find({
        status: 'pending',
        created_at: { $lte: twoDaysAgo }
      }).toArray();
      oldPendingAtt.forEach(p => {
        oldPending.push({
          id: p._id.toString(),
          type: 'attendance',
          username: p.username,
          studentName: p.student_name,
          date: p.date,
          createdAt: p.created_at
        });
      });
    }

    if (pendingGatha) {
      const oldPendingG = await pendingGatha.find({
        status: 'pending',
        created_at: { $lte: twoDaysAgo }
      }).toArray();
      oldPendingG.forEach(p => {
        oldPending.push({
          id: p._id.toString(),
          type: 'gatha',
          username: p.username,
          studentName: p.student_name,
          date: p.date,
          createdAt: p.created_at
        });
      });
    }

    // Attendance trend (last 7 days)
    const attendanceTrend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      let count = 0;
      if (attendance) {
        count = await attendance.countDocuments({ date: dateStr });
      }
      attendanceTrend.push({ date: dateStr, count });
    }

    // Active vs inactive
    let activeCount = 0;
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

    if (attendance) {
      const activeUsernames = await attendance.distinct('username', {
        date: { $gte: thirtyDaysAgoStr }
      });
      activeCount = activeUsernames.length;
    }

    res.json({
      todayAttendance,
      todayAbsent: totalStudents - todayAttendance,
      totalStudents,
      monthlyAttendancePercent,
      monthlyAttendanceTotal,
      pendingAttendance: pendingAttCount,
      pendingGatha: pendingGathaCount,
      totalPending: pendingAttCount + pendingGathaCount,
      activeStudents: activeCount,
      inactiveStudents: totalStudents - activeCount,
      absentAlerts: absentAlerts.slice(0, 10),
      noGathaAlerts: noGathaAlerts.slice(0, 10),
      oldPending,
      attendanceTrend
    });
  } catch (error) {
    console.error('Dashboard analytics error:', error);
    res.status(500).json({ error: 'Failed' });
  }
};

// GET /admin/group/:groupId/analytics
exports.getGroupAnalytics = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const { groupId } = req.params;
    const familyGroupsColl = await getCollection('family_groups');
    if (!familyGroupsColl) return res.status(500).json({ error: 'Database not available' });

    const group = await familyGroupsColl.findOne({ _id: new ObjectId(groupId) });
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const attendance = await getCollection('attendance');
    const gatha = await getCollection('gatha');
    const pendingAttendance = await getCollection('pending_attendance');
    const pendingGatha = await getCollection('pending_gatha');

    const members = [];
    let totalGroupAttendance = 0;
    let totalGroupGathas = 0;
    let totalGroupPending = 0;

    for (const memberUsername of (group.members || [])) {
      const studentInfo = { name: memberUsername };

      let attCount = 0, gathaCount = 0, pendingCount = 0;

      if (attendance) {
        attCount = await attendance.countDocuments({ username: memberUsername });
      }
      if (gatha) {
        const gathaSum = await gatha.aggregate([
          { $match: { username: memberUsername, type: 'new' } },
          { $group: { _id: null, total: { $sum: '$total_gatha' } } }
        ]).toArray();
        gathaCount = gathaSum[0]?.total || 0;
      }
      if (pendingAttendance) {
        pendingCount += await pendingAttendance.countDocuments({ username: memberUsername, status: 'pending' });
      }
      if (pendingGatha) {
        pendingCount += await pendingGatha.countDocuments({ username: memberUsername, status: 'pending' });
      }

      totalGroupAttendance += attCount;
      totalGroupGathas += gathaCount;
      totalGroupPending += pendingCount;

      members.push({
        username: memberUsername,
        name: studentInfo.name,
        attendance: attCount,
        gathas: gathaCount,
        pending: pendingCount,
        score: attCount + gathaCount
      });
    }

    members.sort((a, b) => b.score - a.score);

    const avgAttendance = members.length > 0
      ? Math.round(totalGroupAttendance / members.length)
      : 0;

    res.json({
      group: {
        id: group._id.toString(),
        name: group.groupName,
        memberCount: members.length
      },
      members,
      totals: {
        attendance: totalGroupAttendance,
        gathas: totalGroupGathas,
        pending: totalGroupPending,
        avgAttendance
      },
      topPerformer: members[0] || null,
      leastActive: members[members.length - 1] || null
    });
  } catch (error) {
    console.error('Group analytics error:', error);
    res.status(500).json({ error: 'Failed' });
  }
};

// GET /admin/audit-log?limit=50
exports.getAuditLog = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const limit = parseInt(req.query.limit) || 50;
    const auditLog = await getCollection('audit_log');
    if (!auditLog) return res.json([]);

    const logs = await auditLog.find({}).sort({ created_at: -1 }).limit(limit).toArray();
    res.json(logs.map(l => ({
      id: l._id.toString(),
      action: l.action,
      targetUsername: l.targetUsername,
      entryType: l.entryType,
      performedBy: l.performedBy,
      details: l.details,
      reason: l.reason,
      createdAt: l.created_at
    })));
  } catch (error) {
    console.error('Audit log error:', error);
    res.json([]);
  }
};
