const router = require('express').Router();
const controller = require('../controllers/tvController');

router.get('/meron', (req, res, next) => controller.side(req, res, next, 'meron'));
router.get('/wala', (req, res, next) => controller.side(req, res, next, 'wala'));

module.exports = router;
