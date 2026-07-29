const router = require('express').Router();
const controller = require('../controllers/matchingController');

router.get('/', controller.board);
router.get('/api/pool', controller.apiPool);
router.get('/api/matches', controller.apiMatches);
router.post('/auto', controller.autoMatch);
router.post('/confirm', controller.confirm);
router.delete('/unfought', controller.destroyUnfought);
router.delete('/:id', controller.destroy);

module.exports = router;
