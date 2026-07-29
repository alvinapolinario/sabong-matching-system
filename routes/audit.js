const router = require('express').Router();
const controller = require('../controllers/auditController');

router.get('/overrides', controller.index);
router.get('/overrides/export.csv', controller.exportCsv);

module.exports = router;
