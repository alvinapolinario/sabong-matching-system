const router = require('express').Router();
const express = require('express');
const controller = require('../controllers/resetController');

router.get('/', controller.form);
router.post('/', controller.clearData);
router.post('/restore', controller.restoreData);
router.post(
  '/restore-upload',
  express.raw({
    type: ['application/sql', 'application/octet-stream', 'text/plain'],
    limit: process.env.RESTORE_UPLOAD_LIMIT || '100mb'
  }),
  controller.uploadRestoreData
);

module.exports = router;
