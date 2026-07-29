const db = require('../db');
const Backup = require('../services/backupService');
const {
  emitPoolUpdated,
  emitFightsUpdated,
  emitTvUpdated
} = require('../socket/events');

const RESET_CODE = 'RESET';

async function form(req, res, next) {
  try {
    const backups = await Backup.listBackups();
    res.render('reset/index', {
      title: 'Reset Data',
      error: req.query.error || '',
      success: req.query.success || '',
      backups
    });
  } catch (error) {
    next(error);
  }
}

async function createBackup(req, res, next) {
  try {
    const backup = await Backup.createBackup('manual');
    if (req.accepts('json') && !req.accepts('html')) {
      return res.json({
        ok: true,
        message: `Backup ${backup.filename} created.`,
        filename: backup.filename
      });
    }
    res.redirect(`/reset?success=${encodeURIComponent(`Backup ${backup.filename} created.`)}`);
  } catch (error) {
    console.error(error);
    if (req.accepts('json') && !req.accepts('html')) {
      return res.status(500).json({ ok: false, message: error.message || 'Unable to create backup.' });
    }
    res.redirect(`/reset?error=${encodeURIComponent(error.message || 'Unable to create backup.')}`);
  }
}

async function clearData(req, res, next) {
  try {
    if (String(req.body.confirmation || '').trim() !== RESET_CODE) {
      return res.redirect(`/reset?error=${encodeURIComponent('Invalid confirmation code.')}`);
    }

    const backup = await Backup.createBackup('before-reset');

    await db.execute('SET FOREIGN_KEY_CHECKS = 0');
    await db.execute('TRUNCATE TABLE matches');
    await db.execute('TRUNCATE TABLE override_logs');
    await db.execute('TRUNCATE TABLE entry_data');
    await db.execute('TRUNCATE TABLE entries');
    await db.execute('TRUNCATE TABLE owner_no_fights');
    await db.execute('TRUNCATE TABLE owners');
    await db.execute('TRUNCATE TABLE events');
    await db.execute('SET FOREIGN_KEY_CHECKS = 1');

    emitPoolUpdated(req.io);
    emitFightsUpdated(req.io);
    emitTvUpdated(req.io);

    res.redirect(`/reset?success=${encodeURIComponent(`Backup ${backup.filename} created. All production data has been cleared.`)}`);
  } catch (error) {
    try {
      await db.execute('SET FOREIGN_KEY_CHECKS = 1');
    } catch (restoreError) {
      console.error(restoreError);
    }
    console.error(error);
    res.redirect(`/reset?error=${encodeURIComponent(error.message || 'Unable to reset data.')}`);
  }
}

async function restoreData(req, res, next) {
  try {
    if (String(req.body.confirmation || '').trim() !== RESET_CODE) {
      return res.redirect(`/reset?error=${encodeURIComponent('Invalid confirmation code.')}`);
    }

    const filename = String(req.body.backup_file || '').trim();
    if (!filename) {
      return res.redirect(`/reset?error=${encodeURIComponent('Select a backup to restore.')}`);
    }

    await Backup.createBackup('before-restore');
    await Backup.restoreBackup(filename);

    emitPoolUpdated(req.io);
    emitFightsUpdated(req.io);
    emitTvUpdated(req.io);

    res.redirect(`/reset?success=${encodeURIComponent(`Backup ${filename} restored successfully.`)}`);
  } catch (error) {
    console.error(error);
    res.redirect(`/reset?error=${encodeURIComponent(error.message || 'Unable to restore backup.')}`);
  }
}

async function uploadRestoreData(req, res, next) {
  try {
    const confirmation = String(req.query.confirmation || '').trim();
    if (confirmation !== RESET_CODE) {
      return res.status(422).json({ ok: false, message: 'Invalid confirmation code.' });
    }

    const originalName = String(req.get('x-backup-filename') || 'uploaded.sql');
    const uploaded = await Backup.saveUploadedBackup(req.body, originalName);
    await Backup.createBackup('before-upload-restore');
    await Backup.restoreBackup(uploaded.filename);

    emitPoolUpdated(req.io);
    emitFightsUpdated(req.io);
    emitTvUpdated(req.io);

    res.json({
      ok: true,
      message: `Uploaded backup ${uploaded.filename} restored successfully.`
    });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({
      ok: false,
      message: error.message || 'Unable to restore uploaded backup.'
    });
  }
}

module.exports = { form, createBackup, clearData, restoreData, uploadRestoreData };
