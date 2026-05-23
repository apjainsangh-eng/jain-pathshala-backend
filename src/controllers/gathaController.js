const { getCollection } = require('../config/db');
const { canActAs, formatTime, formatDate } = require('../utils/helpers');
const { ObjectId } = require('mongodb');

exports.getGatha = async (req, res) => {
  try {
    const gatha = await getCollection('gatha');
    if (!gatha) return res.json([]);
    
    const records = await gatha
      .find({ username: req.user.username })
      .sort({ created_at: -1 })
      .toArray();
      
    res.json(records);
  } catch (error) {
    res.json([]);
  }
};

exports.addGatha = async (req, res) => {
  try {
    const { type, sutra_name, which_gatha, total_gatha } = req.body || {};

    if (!type || !sutra_name || !which_gatha || !total_gatha) {
      return res.status(400).json({ error: 'All fields required' });
    }

    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const pendingGatha = await getCollection('pending_gatha');
    
    if (!pendingGatha) {
      return res.status(500).json({ error: 'Database not available' });
    }

    await pendingGatha.insertOne({
      username: req.user.username,
      student_name: req.user.name || req.user.username,
      type,
      sutra_name,
      which_gatha,
      total_gatha: parseInt(total_gatha),
      date: today,
      status: 'pending',
      created_at: now.toISOString(),
      request_time: formatTime(now.toISOString()),
      request_date: formatDate(now.toISOString())
    });

    res.json({ message: 'Pending approval' });
  } catch (error) {
    console.error('Create gatha error:', error);
    res.status(500).json({ error: 'Failed' });
  }
};

exports.addGathaFor = async (req, res) => {
  try {
    const { forUsername, type, sutra_name, which_gatha, total_gatha } = req.body || {};
    const targetUser = forUsername || req.user.username;

    if (targetUser !== req.user.username) {
      const canAct = await canActAs(req.user.username, targetUser);
      if (!canAct) {
        return res.status(403).json({ error: 'You cannot add gatha for this user' });
      }
    }

    if (!type || !sutra_name || !which_gatha || !total_gatha) {
      return res.status(400).json({ error: 'All fields required' });
    }

    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const pendingGatha = await getCollection('pending_gatha');
    
    if (!pendingGatha) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const usersCol = await getCollection('users');
    const targetDbUser = usersCol ? await usersCol.findOne({ username: { $regex: new RegExp('^' + targetUser + '$', 'i') } }) : null;
    const targetInfo = { name: targetDbUser?.name || targetUser, username: targetUser };

    await pendingGatha.insertOne({
      username: targetUser,
      student_name: targetInfo.name,
      type,
      sutra_name,
      which_gatha,
      total_gatha: parseInt(total_gatha),
      date: today,
      status: 'pending',
      created_at: now.toISOString(),
      request_time: formatTime(now.toISOString()),
      request_date: formatDate(now.toISOString()),
      added_by: req.user.username
    });

    res.json({ message: 'Pending approval for ' + targetInfo.name });
  } catch (error) {
    console.error('Create gatha for error:', error);
    res.status(500).json({ error: 'Failed' });
  }
};

exports.editPendingGatha = async (req, res) => {
  try {
    const { sutra_name, which_gatha, total_gatha } = req.body || {};

    if (!sutra_name || !which_gatha || !total_gatha) {
      return res.status(400).json({ error: 'All fields required' });
    }

    const pendingGatha = await getCollection('pending_gatha');
    if (!pendingGatha) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const result = await pendingGatha.updateOne(
      {
        _id: new ObjectId(req.params.id),
        username: req.user.username,
        status: 'pending'
      },
      {
        $set: {
          sutra_name,
          which_gatha,
          total_gatha: parseInt(total_gatha),
          updated_at: new Date().toISOString()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Pending gatha not found or already approved' });
    }

    res.json({ message: 'Gatha updated successfully' });
  } catch (error) {
    console.error('Edit pending gatha error:', error);
    res.status(500).json({ error: 'Failed to update' });
  }
};

exports.deletePendingGatha = async (req, res) => {
  try {
    const pendingGatha = await getCollection('pending_gatha');
    if (!pendingGatha) {
      return res.status(500).json({ error: 'Database not available' });
    }

    const result = await pendingGatha.deleteOne({
      _id: new ObjectId(req.params.id),
      username: req.user.username,
      status: 'pending'
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Pending gatha not found or already approved' });
    }

    res.json({ message: 'Gatha request cancelled' });
  } catch (error) {
    console.error('Delete pending gatha error:', error);
    res.status(500).json({ error: 'Failed to cancel' });
  }
};

exports.editGatha = async (req, res) => {
  try {
    const { sutra_name, which_gatha, total_gatha } = req.body || {};
    const gatha = await getCollection('gatha');
    
    if (!gatha) return res.status(500).json({ error: 'Database not available' });

    const result = await gatha.updateOne(
      { _id: new ObjectId(req.params.id), username: req.user.username },
      { $set: { sutra_name, which_gatha, total_gatha: parseInt(total_gatha), updated_at: new Date().toISOString() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Gatha not found' });
    }

    res.json({ message: 'Updated' });
  } catch (error) {
    console.error('Update gatha error:', error);
    res.status(500).json({ error: 'Failed' });
  }
};

exports.deleteGatha = async (req, res) => {
  try {
    const gatha = await getCollection('gatha');
    if (!gatha) return res.status(500).json({ error: 'Database not available' });
    
    const result = await gatha.deleteOne({
      _id: new ObjectId(req.params.id),
      username: req.user.username
    });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Gatha not found' });
    }
    
    res.json({ message: 'Deleted' });
  } catch (error) {
    console.error('Delete gatha error:', error);
    res.status(500).json({ error: 'Failed' });
  }
};
