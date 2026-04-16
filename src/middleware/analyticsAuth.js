const analyticsAuth = (req, res, next) => {
  const password = process.env.ANALYTICS_ADMIN_PASSWORD;

  if (!password) {
    return res.status(503).json({ message: 'Analytics admin password not configured' });
  }

  const provided = req.headers['x-analytics-key'];

  if (!provided || provided !== password) {
    return res.status(401).json({ message: 'סיסמת אנליטיקס שגויה' });
  }

  next();
};

module.exports = { analyticsAuth };
