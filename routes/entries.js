const router = require('express').Router();
const controller = require('../controllers/entryController');

router.get('/', controller.index);
router.get('/new', controller.createForm);
router.post('/', controller.store);
router.get('/:id/encode', controller.encodeForm);
router.post('/:id/chickens', controller.addChicken);

module.exports = router;
