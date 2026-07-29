const router = require('express').Router();
const controller = require('../controllers/liveController');

router.get('/', controller.board);

module.exports = router;
