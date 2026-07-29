const router = require('express').Router();
const controller = require('../controllers/ownerController');

router.get('/', controller.index);
router.post('/', controller.store);
router.post('/no-fights', controller.storeNoFight);
router.delete('/no-fights/:id', controller.destroyNoFight);
router.get('/:id/edit', controller.editForm);
router.put('/:id', controller.update);
router.delete('/:id', controller.destroy);

module.exports = router;
