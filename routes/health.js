const router = require('express').Router();
const db = require('../db');

router.get('/', async (req, res) => {
  try {
    await db.execute('SELECT 1');
    res.json({
      ok: true,
      status: 'healthy',
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      status: 'unhealthy',
      database: 'disconnected',
      timestamp: new Date().toISOString()
    });
  }
});

module.exports = router;
