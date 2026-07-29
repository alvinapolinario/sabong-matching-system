const router = require('express').Router();
const controller = require('../controllers/eventController');

router.get('/', controller.index);
router.get('/new', controller.createForm);
router.post('/', controller.store);
router.get('/:id/edit', controller.editForm);
router.put('/:id', controller.update);
router.delete('/:id', controller.destroy);

module.exports = router;
