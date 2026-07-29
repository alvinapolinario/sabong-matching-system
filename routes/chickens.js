const router = require('express').Router();
const controller = require('../controllers/chickenController');

router.get('/', controller.index);
router.get('/:id/edit', controller.editForm);
router.put('/:id', controller.update);

module.exports = router;
