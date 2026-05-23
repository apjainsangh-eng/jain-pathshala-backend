const { getCollection } = require('../config/db');
const { formatTime, formatDate } = require('../utils/helpers');
const { ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

exports.getStats = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const today = new Date().toISOString().split('T')[0];
    const attendance = await getCollection('attendance');
    const pendingAttendance = await getCollection('pending_attendance');
    const pendingGatha = await getCollection('pending_gatha');

    const usersCollection = await getCollection('users');
    const totalStudents = usersCollection ? await usersCollection.countDocuments({ role: 'student' }) : 0;

    const stats = {
      total_students: totalStudents,
      today_attendance: attendance ? await attendance.countDocuments({ date: today }) : 0,
      pending_attendance: pendingAttendance ? await pendingAttendance.countDocuments({ status: 'pending' }) : 0,
      pending_gatha: pendingGatha ? await pendingGatha.countDocuments({ status: 'pending' }) : 0
    };

    res.json(stats);
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

    const attendance = await getCollection('attendance');
    const gatha = await getCollection('gatha');

    const usersCol = await getCollection('users');
    const allStudents = usersCol ? await usersCol.find({ role: 'student' }).toArray() : [];

    const studentsWithStats = await Promise.all(
      allStudents.map(async (student) => {
        let attendance_count = 0, new_gathas = 0, revision_gathas = 0;

        if (attendance) {
          attendance_count = await attendance.countDocuments({
            username: student.username,
            date: { $gte: start, $lte: end }
          });
        }

        if (gatha) {
          const gathaStats = await gatha.aggregate([
            { $match: { username: student.username, date: { $gte: start, $lte: end } } },
            { $group: { _id: '$type', total: { $sum: '$total_gatha' } } }
          ]).toArray();

          gathaStats.forEach(stat => {
            if (stat._id === 'new') new_gathas = stat.total || 0;
            else if (stat._id === 'revision') revision_gathas = stat.total || 0;
          });
        }

        return {
          id: student.username,
          username: student.username,
          name: student.name || student.username,
          attendance_count,
          total_gathas: new_gathas + revision_gathas,
          new_gathas,
          revision_gathas
        };
      })
    );

    studentsWithStats.sort((a, b) => a.name.localeCompare(b.name));
    res.json(studentsWithStats);
  } catch (error) {
    console.error('Admin students error:', error);
    res.json([]);
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
