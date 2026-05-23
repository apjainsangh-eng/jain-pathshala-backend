const { MongoClient } = require('mongodb');

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;

  const uri = process.env.MONGODB_URI;
  const dbName = process.env.DB_NAME || 'pathshala';

  if (!uri) return null;

  try {
    if (!cachedClient) {
      cachedClient = new MongoClient(uri);
      await cachedClient.connect();
    }
    cachedDb = cachedClient.db(dbName);
    return cachedDb;
  } catch (error) {
    console.error('MongoDB error:', error);
    return null;
  }
}

async function getCollection(name) {
  const db = await connectToDatabase();
  return db ? db.collection(name) : null;
}

module.exports = {
  connectToDatabase,
  getCollection
};
