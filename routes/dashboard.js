const router = require('express').Router();
const controller = require('../controllers/dashboardController');

router.get('/', controller.index);

module.exports = router;
