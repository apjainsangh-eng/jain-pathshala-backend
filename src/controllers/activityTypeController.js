const { getCollection } = require('../config/db');
const { ObjectId } = require('mongodb');

const DEFAULT_TYPES = [
  { name: 'New Learning', isDefault: true, isActive: true },
  { name: 'Revision', isDefault: true, isActive: true },
  { name: 'Other', isDefault: true, isActive: true },
];

async function ensureActivityTypesSeed(col) {
  const count = await col.countDocuments();
  if (count === 0) {
    const now = new Date().toISOString();
    await col.insertMany(DEFAULT_TYPES.map(t => ({ ...t, createdAt: now, updatedAt: now })));
  }
}

exports.getActivityTypes = async (req, res) => {
  try {
    const col = await getCollection('activity_types');
    if (!col) return res.json([]);

    await ensureActivityTypesSeed(col);

    const isAdmin = req.user && req.user.role === 'admin';
    const query = isAdmin ? {} : { isActive: true };

    const types = await col.find(query).sort({ isDefault: -1, createdAt: 1 }).toArray();
    res.json(types.map(t => ({
      id: t._id.toString(),
      name: t.name,
      isDefault: t.isDefault,
      isActive: t.isActive,
      createdAt: t.createdAt,
    })));
  } catch (error) {
    console.error('Get activity types error:', error);
    res.json([]);
  }
};

exports.createActivityType = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });

    const col = await getCollection('activity_types');
    if (!col) return res.status(500).json({ error: 'Database not available' });

    const existing = await col.findOne({ name: { $regex: new RegExp('^' + name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') } });
    if (existing) return res.status(400).json({ error: 'Activity type already exists' });

    const now = new Date().toISOString();
    const result = await col.insertOne({
      name: name.trim(),
      isDefault: false,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    res.json({ id: result.insertedId.toString(), message: 'Created' });
  } catch (error) {
    console.error('Create activity type error:', error);
    res.status(500).json({ error: 'Failed to create activity type' });
  }
};

exports.updateActivityType = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const { name, isActive } = req.body;
    const col = await getCollection('activity_types');
    if (!col) return res.status(500).json({ error: 'Database not available' });

    const existing = await col.findOne({ _id: new ObjectId(req.params.id) });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const update = { updatedAt: new Date().toISOString() };
    if (name !== undefined && name.trim()) {
      if (existing.isDefault) return res.status(400).json({ error: 'Cannot rename default activity type' });
      update.name = name.trim();
    }
    if (isActive !== undefined) update.isActive = isActive;

    await col.updateOne({ _id: new ObjectId(req.params.id) }, { $set: update });
    res.json({ message: 'Updated' });
  } catch (error) {
    console.error('Update activity type error:', error);
    res.status(500).json({ error: 'Failed to update' });
  }
};

exports.deleteActivityType = async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  try {
    const col = await getCollection('activity_types');
    if (!col) return res.status(500).json({ error: 'Database not available' });

    const existing = await col.findOne({ _id: new ObjectId(req.params.id) });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (existing.isDefault) return res.status(400).json({ error: 'Cannot delete default activity type' });

    await col.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ message: 'Deleted' });
  } catch (error) {
    console.error('Delete activity type error:', error);
    res.status(500).json({ error: 'Failed to delete' });
  }
};
