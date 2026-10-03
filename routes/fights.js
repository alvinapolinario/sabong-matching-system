const router = require('express').Router();
const controller = require('../controllers/fightController');

router.get('/', controller.index);
router.get('/api/schedule', controller.apiSchedule);
router.post('/reorder', controller.reorder);
router.put('/:id/active', controller.setActive);
router.put('/:id/tv-meron', controller.setTvMeron);
router.put('/:id/result', controller.updateResult);
router.put('/:id/status', controller.updateStatus);
router.put('/:id/recall', controller.recall);
router.put('/:id/resend', controller.resend);
router.put('/:id/duration', controller.setDuration);
router.put('/:id/rematch', controller.rematch);
router.get('/api/bridge-status', controller.bridgeStatus);

module.exports = router;
