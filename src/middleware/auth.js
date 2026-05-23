const createToken = (payload) => {
  return Buffer.from(JSON.stringify({
    ...payload,
    exp: Date.now() + (7 * 24 * 60 * 60 * 1000)
  })).toString('base64');
};

const verifyToken = (token) => {
  try {
    const data = JSON.parse(Buffer.from(token, 'base64').toString());
    return data.exp > Date.now() ? data : null;
  } catch (e) {
    return null;
  }
};

const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Token required' });
  
  const user = verifyToken(token);
  if (!user) return res.status(401).json({ error: 'Invalid token' });
  
  req.user = user;
  next();
};

module.exports = {
  createToken,
  verifyToken,
  authenticate
};
