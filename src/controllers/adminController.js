const { getCollection } = require('../config/db');
const { formatTime, formatDate } = require('../utils/helpers');
const { ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const { LEGACY_STUDENTS } = require('../config/constants');

async function ensureLegacyStudentsSeeded(usersCol) {
  const legacyUsernames = LEGACY_STUDENTS.map(s => s.username);

  // Fix any legacy users that exist but are missing the role field
  await usersCol.updateMany(
    { username: { $in: legacyUsernames }, role: { $exists: false } },
    { $set: { role: 'student' } }
  );

  const existing = await usersCol
    .find({ username: { $in: legacyUsernames } })
    .project({ username: 1 })
    .toArray();
  const existingSet = new Set(existing.map(u => u.username.toLowerCase()));

  const toInsert = LEGACY_STUDENTS.filter(s => !existingSet.has(s.username.toLowerCase()));
  if (toInsert.length > 0) {
    const now = new Date().toISOString();
    await usersCol.insertMany(
      toInsert.map(s => ({
        username: s.username,
        name: s.name,
        role: 'student',
        password: s.password,
        migrated: true,
        created_at: now
      })),
      { ordered: false }
    );
  }
}

exports.getStats = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const today = new Date().toISOString().split('T')[0];

    const [attendanceCol, pendingAttendanceCol, pendingGathaCol, usersCollection] = await Promise.all([
      getCollection('attendance'),
      getCollection('pending_attendance'),
      getCollection('pending_gatha'),
      getCollection('users')
    ]);

    const [totalStudents, todayAtt, pendingAtt, pendingG] = await Promise.all([
      usersCollection ? usersCollection.countDocuments({ role: 'student' }) : Promise.resolve(0),
      attendanceCol ? attendanceCol.countDocuments({ date: today }) : Promise.resolve(0),
      pendingAttendanceCol ? pendingAttendanceCol.countDocuments({ status: 'pending' }) : Promise.resolve(0),
      pendingGathaCol ? pendingGathaCol.countDocuments({ status: 'pending' }) : Promise.resolve(0)
    ]);

    res.json({
      total_students: totalStudents,
      today_attendance: todayAtt,
      pending_attendance: pendingAtt,
      pending_gatha: pendingG
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.json({ pending_attendance: 0, pending_gatha: 0, total_students: 34, today_attendance: 0 });
  }
};

exports.getPending = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const pendingAttendance = await getCollection('pending_attendance');
    const pendingGatha = await getCollection('pending_gatha');

    let attendance = [], gatha = [];
    
    if (pendingAttendance) {
      const rawAttendance = await pendingAttendance.find({ status: 'pending' }).sort({ created_at: -1 }).toArray();
      attendance = rawAttendance.map(item => ({
        ...item,
        id: item._id.toString(),
        student_name: item.student_name || item.username || 'Unknown',
        display_name: item.student_name || item.username || 'Unknown',
        formatted_time: item.request_time || formatTime(item.created_at),
        formatted_date: item.request_date || formatDate(item.created_at) || item.date
      }));
    }

    if (pendingGatha) {
      const rawGatha = await pendingGatha.find({ status: 'pending' }).sort({ created_at: -1 }).toArray();
      gatha = rawGatha.map(item => ({
        ...item,
        id: item._id.toString(),
        student_name: item.student_name || item.username || 'Unknown',
        display_name: item.student_name || item.username || 'Unknown',
        formatted_time: item.request_time || formatTime(item.created_at),
        formatted_date: item.request_date || formatDate(item.created_at) || item.date
      }));
    }

    res.json({ attendance, gatha, totalPending: attendance.length + gatha.length });
  } catch (error) {
    console.error('Admin pending error:', error);
    res.json({ attendance: [], gatha: [], totalPending: 0 });
  }
};

exports.approveAttendance = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const pendingAttendance = await getCollection('pending_attendance');
    const attendance = await getCollection('attendance');

    if (!pendingAttendance || !attendance) return res.status(500).json({ error: 'Database not available' });

    const pending = await pendingAttendance.findOne({ _id: new ObjectId(req.params.id), status: 'pending' });
    if (!pending) return res.status(404).json({ error: 'Not found' });

    await attendance.insertOne({
      username: pending.username,
      student_name: pending.student_name || pending.username,
      date: pending.date,
      created_at: new Date().toISOString(),
      approved_by: req.user.username,
      approved_at: new Date().toISOString()
    });

    await pendingAttendance.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: req.user.username } }
    );

    res.json({ message: 'Approved' });
  } catch (error) {
    console.error('Approve attendance error:', error);
    res.status(500).json({ error: 'Failed' });
  }
};

exports.rejectAttendance = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const pendingAttendance = await getCollection('pending_attendance');
    if (!pendingAttendance) return res.status(500).json({ error: 'Database not available' });

    await pendingAttendance.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: req.user.username } }
    );

    res.json({ message: 'Rejected' });
  } catch (error) {
    console.error('Reject attendance error:', error);
    res.status(500).json({ error: 'Failed' });
  }
};

exports.approveGatha = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const pendingGatha = await getCollection('pending_gatha');
    const gatha = await getCollection('gatha');

    if (!pendingGatha || !gatha) return res.status(500).json({ error: 'Database not available' });

    const pending = await pendingGatha.findOne({ _id: new ObjectId(req.params.id), status: 'pending' });
    if (!pending) return res.status(404).json({ error: 'Not found' });

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
      created_at: new Date().toISOString(),
      approved_by: req.user.username,
      approved_at: new Date().toISOString()
    });

    await pendingGatha.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: req.user.username } }
    );

    res.json({ message: 'Approved' });
  } catch (error) {
    console.error('Approve gatha error:', error);
    res.status(500).json({ error: 'Failed' });
  }
};

exports.rejectGatha = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const pendingGatha = await getCollection('pending_gatha');
    if (!pendingGatha) return res.status(500).json({ error: 'Database not available' });

    await pendingGatha.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: req.user.username } }
    );

    res.json({ message: 'Rejected' });
  } catch (error) {
    console.error('Reject gatha error:', error);
    res.status(500).json({ error: 'Failed' });
  }
};

exports.approveAll = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const pendingAttendance = await getCollection('pending_attendance');
    const pendingGatha = await getCollection('pending_gatha');
    const attendance = await getCollection('attendance');
    const gatha = await getCollection('gatha');

    let aa = 0, ag = 0;
    const now = new Date().toISOString();

    if (pendingAttendance && attendance) {
      const pendingAtt = await pendingAttendance.find({ status: 'pending' }).toArray();
      for (const p of pendingAtt) {
        await attendance.insertOne({
          username: p.username,
          student_name: p.student_name || p.username,
          date: p.date,
          created_at: now,
          approved_by: req.user.username,
          approved_at: now
        });
        await pendingAttendance.updateOne(
          { _id: p._id },
          { $set: { status: 'approved', reviewed_at: now, reviewed_by: req.user.username } }
        );
        aa++;
      }
    }

    if (pendingGatha && gatha) {
      const pendingG = await pendingGatha.find({ status: 'pending' }).toArray();
      for (const p of pendingG) {
        await gatha.insertOne({
          username: p.username,
          student_name: p.student_name || p.username,
          type: p.type,
          activityTypeId: p.activityTypeId || null,
          activityTypeName: p.activityTypeName || (p.type === 'new' ? 'New Learning' : p.type === 'revision' ? 'Revision' : p.type),
          customActivityDescription: p.customActivityDescription || null,
          sutra_name: p.sutra_name,
          which_gatha: p.which_gatha,
          total_gatha: p.total_gatha,
          date: p.date,
          created_at: now,
          approved_by: req.user.username,
          approved_at: now
        });
        await pendingGatha.updateOne(
          { _id: p._id },
          { $set: { status: 'approved', reviewed_at: now, reviewed_by: req.user.username } }
        );
        ag++;
      }
    }

    res.json({ approved: { attendance: aa, gatha: ag } });
  } catch (error) {
    console.error('Approve all error:', error);
    res.status(500).json({ error: 'Failed' });
  }
};

exports.getStudents = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const { startDate, endDate } = req.query;
    const start = startDate || '2020-01-01';
    const end = endDate || '2099-12-31';

    const [attendanceCol, gathaCol, usersCol] = await Promise.all([
      getCollection('attendance'),
      getCollection('gatha'),
      getCollection('users')
    ]);
    if (!usersCol) return res.json([]);

    // Fetch students + bulk aggregate stats in parallel (3 queries total, not 66)
    const [allStudents, attAgg, gathaAgg] = await Promise.all([
      usersCol.find({ role: 'student' }).toArray(),
      attendanceCol ? attendanceCol.aggregate([
        { $match: { date: { $gte: start, $lte: end } } },
        { $group: { _id: '$username', count: { $sum: 1 } } }
      ]).toArray() : [],
      gathaCol ? gathaCol.aggregate([
        { $match: { date: { $gte: start, $lte: end } } },
        { $group: { _id: { username: '$username', type: '$type' }, total: { $sum: '$total_gatha' } } }
      ]).toArray() : []
    ]);

    const attMap = {};
    attAgg.forEach(a => { attMap[a._id] = a.count; });

    const gathaMap = {};
    gathaAgg.forEach(g => {
      const u = g._id.username;
      if (!gathaMap[u]) gathaMap[u] = { new: 0, revision: 0 };
      gathaMap[u][g._id.type] = (gathaMap[u][g._id.type] || 0) + (g.total || 0);
    });

    const studentsWithStats = allStudents.map(student => {
      const att = attMap[student.username] || 0;
      const g = gathaMap[student.username] || { new: 0, revision: 0 };
      return {
        id: student.username,
        username: student.username,
        name: student.name || student.username,
        attendance_count: att,
        total_gathas: g.new + g.revision,
        new_gathas: g.new,
        revision_gathas: g.revision
      };
    });

    studentsWithStats.sort((a, b) => a.name.localeCompare(b.name));
    res.json(studentsWithStats);
  } catch (error) {
    console.error('Admin students error:', error);
    res.json([]);
  }
};

exports.getTopStudents = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const { startDate, endDate, limit = 5 } = req.query;
    const start = startDate || '2020-01-01';
    const end = endDate || '2099-12-31';
    const n = parseInt(limit) || 5;

    const attendance = await getCollection('attendance');
    const gatha = await getCollection('gatha');
    const usersCol = await getCollection('users');

    let topAttendance = [], topGatha = [];

    if (attendance && usersCol) {
      const attAgg = await attendance.aggregate([
        { $match: { date: { $gte: start, $lte: end } } },
        { $group: { _id: '$username', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: n }
      ]).toArray();

      const usernames = attAgg.map(a => a._id);
      const users = await usersCol.find({ username: { $in: usernames } }).toArray();
      const nameMap = {};
      users.forEach(u => { nameMap[u.username] = u.name || u.username; });

      topAttendance = attAgg.map((a, i) => ({
        rank: i + 1,
        username: a._id,
        name: nameMap[a._id] || a._id,
        count: a.count
      }));
    }

    if (gatha && usersCol) {
      const gathaAgg = await gatha.aggregate([
        { $match: { date: { $gte: start, $lte: end }, type: 'new' } },
        { $group: { _id: '$username', count: { $sum: '$total_gatha' } } },
        { $sort: { count: -1 } },
        { $limit: n }
      ]).toArray();

      const usernames = gathaAgg.map(g => g._id);
      const users = await usersCol.find({ username: { $in: usernames } }).toArray();
      const nameMap = {};
      users.forEach(u => { nameMap[u.username] = u.name || u.username; });

      topGatha = gathaAgg.map((g, i) => ({
        rank: i + 1,
        username: g._id,
        name: nameMap[g._id] || g._id,
        count: g.count
      }));
    }

    res.json({ topAttendance, topGatha });
  } catch (error) {
    console.error('Top students error:', error);
    res.json({ topAttendance: [], topGatha: [] });
  }
};

exports.seedStudents = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const usersCol = await getCollection('users');
    if (!usersCol) return res.status(500).json({ error: 'Database not available' });

    await ensureLegacyStudentsSeeded(usersCol);
    const total = await usersCol.countDocuments({ role: 'student' });
    res.json({ message: 'Seeding complete', totalStudents: total });
  } catch (error) {
    console.error('Seed students error:', error);
    res.status(500).json({ error: 'Failed to seed students' });
  }
};

exports.exportReport = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const { startDate, endDate } = req.query;
    const today = new Date();
    const start = startDate || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    const end = endDate || today.toISOString().split('T')[0];

    const [attendanceCol, gathaCol, usersCol] = await Promise.all([
      getCollection('attendance'),
      getCollection('gatha'),
      getCollection('users')
    ]);
    if (!usersCol) return res.status(500).json({ error: 'Database not available' });

    // Bulk aggregate in parallel (3 queries total)
    const [allStudentsList, attAgg, gathaAgg] = await Promise.all([
      usersCol.find({ role: 'student' }).toArray(),
      attendanceCol ? attendanceCol.aggregate([
        { $match: { date: { $gte: start, $lte: end } } },
        { $group: { _id: '$username', count: { $sum: 1 } } }
      ]).toArray() : [],
      gathaCol ? gathaCol.aggregate([
        { $match: { date: { $gte: start, $lte: end } } },
        { $group: { _id: { username: '$username', type: '$type' }, total: { $sum: '$total_gatha' } } }
      ]).toArray() : []
    ]);

    const attMap = {};
    attAgg.forEach(a => { attMap[a._id] = a.count; });

    const gathaMap = {};
    gathaAgg.forEach(g => {
      const u = g._id.username;
      if (!gathaMap[u]) gathaMap[u] = { new: 0, revision: 0 };
      gathaMap[u][g._id.type] = (gathaMap[u][g._id.type] || 0) + (g.total || 0);
    });

    const studentsData = allStudentsList.map(student => {
      const att = attMap[student.username] || 0;
      const g = gathaMap[student.username] || { new: 0, revision: 0 };
      const newGathas = g.new;
      const revisionGathas = g.revision;
      return {
        username: student.username,
        name: student.name || student.username,
        attendanceCount: att,
        newGathas,
        revisionGathas,
        totalGathas: newGathas + revisionGathas,
        totalScore: att + newGathas
      };
    });

    studentsData.sort((a, b) => a.name.localeCompare(b.name));

    const totalAttendance = studentsData.reduce((s, x) => s + x.attendanceCount, 0);
    const totalNewGathas = studentsData.reduce((s, x) => s + x.newGathas, 0);
    const totalRevisionGathas = studentsData.reduce((s, x) => s + x.revisionGathas, 0);

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

    const sorted = [...studentsData].sort((a, b) => b.totalScore - a.totalScore);
    const topPerformers = {
      byAttendance: [...studentsData].sort((a, b) => b.attendanceCount - a.attendanceCount).slice(0, 5),
      byGatha: [...studentsData].sort((a, b) => b.newGathas - a.newGathas).slice(0, 5),
      byTotal: sorted.slice(0, 5)
    };

    res.json({ students: studentsData, summary, topPerformers, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Export report error:', error);
    res.status(500).json({ error: 'Failed to generate report' });
  }
};

// ============================================
// USER MANAGEMENT
// ============================================

exports.getUsers = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const usersCollection = await getCollection('users');
    if (!usersCollection) return res.status(500).json({ error: 'Database not available' });

    const rawUsers = await usersCollection.find({}).toArray();
    
    // We do not want to return password_hash to the frontend.
    // However, if the frontend needs to show something else, we omit the hash.
    const users = rawUsers.map(u => ({
      id: u._id.toString(),
      username: u.username,
      name: u.name || u.username,
      role: u.role || 'student',
      created_at: u.created_at
    }));

    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

exports.createUser = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const { username, password, name, role } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const usersCollection = await getCollection('users');
    if (!usersCollection) return res.status(500).json({ error: 'Database not available' });

    const existingUser = await usersCollection.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const newUser = {
      username,
      name: name || username,
      role: role || 'student',
      password_hash,
      created_at: new Date().toISOString()
    };

    await usersCollection.insertOne(newUser);
    res.json({ message: 'User created' });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
};

exports.updateUser = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const { username, password, name, role } = req.body;
    const usersCollection = await getCollection('users');
    if (!usersCollection) return res.status(500).json({ error: 'Database not available' });

    const updateFields = {};
    if (username) updateFields.username = username;
    if (name) updateFields.name = name;
    if (role) updateFields.role = role;
    if (password) {
      updateFields.password_hash = await bcrypt.hash(password, 10);
    }

    await usersCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updateFields }
    );

    res.json({ message: 'User updated' });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
};

exports.deleteUser = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const usersCollection = await getCollection('users');
    if (!usersCollection) return res.status(500).json({ error: 'Database not available' });

    // Ensure they don't delete themselves
    if (req.user.id === req.params.id) {
      return res.status(400).json({ error: 'Cannot delete your own admin account' });
    }

    await usersCollection.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ message: 'User deleted' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

// ============================================
// FAMILY GROUPS MANAGEMENT
// ============================================

exports.getFamilyGroups = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const familyGroupsColl = await getCollection('family_groups');
    if (!familyGroupsColl) return res.json([]);

    const groups = await familyGroupsColl.find({}).toArray();
    
    const formattedGroups = groups.map(g => ({
      id: g._id.toString(),
      groupName: g.groupName,
      members: g.members || [],
      created_at: g.created_at
    }));

    res.json(formattedGroups);
  } catch (error) {
    console.error('Get family groups error:', error);
    res.json([]);
  }
};

exports.createFamilyGroup = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const { groupName, members } = req.body;
    if (!groupName || !members || members.length < 2) {
      return res.status(400).json({ error: 'Group name and at least 2 members are required' });
    }

    const familyGroupsColl = await getCollection('family_groups');
    if (!familyGroupsColl) return res.status(500).json({ error: 'Database not available' });

    const newGroup = {
      groupName,
      members,
      created_at: new Date().toISOString()
    };

    await familyGroupsColl.insertOne(newGroup);
    res.json({ message: 'Family group created' });
  } catch (error) {
    console.error('Create family group error:', error);
    res.status(500).json({ error: 'Failed to create family group' });
  }
};

exports.deleteFamilyGroup = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const familyGroupsColl = await getCollection('family_groups');
    if (!familyGroupsColl) return res.status(500).json({ error: 'Database not available' });

    await familyGroupsColl.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ message: 'Family group deleted' });
  } catch (error) {
    console.error('Delete family group error:', error);
    res.status(500).json({ error: 'Failed to delete family group' });
  }
};
