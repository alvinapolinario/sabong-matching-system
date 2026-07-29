const fs = require('fs/promises');
const nodeFs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const backupDir = path.join(__dirname, '..', 'backups');

function dbConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'matching_db',
    port: String(process.env.DB_PORT || 3306)
  };
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function commandArgs(config) {
  return [
    '-h', config.host,
    '-P', config.port,
    '-u', config.user,
    config.database
  ];
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        MYSQL_PWD: dbConfig().password
      },
      stdio: options.stdio || ['ignore', 'pipe', 'pipe']
    });

    let stderr = '';
    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${command} exited with code ${code}${stderr ? `: ${stderr}` : ''}`));
    });

    if (options.input && child.stdin) {
      options.input.pipe(child.stdin);
    }
  });
}

function backupFilename(reason = 'manual') {
  const safeReason = String(reason || 'manual').replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
  return `matching_db_${safeReason}_${timestamp()}.sql`;
}

async function ensureBackupDir() {
  await fs.mkdir(backupDir, { recursive: true });
}

async function createBackup(reason) {
  await ensureBackupDir();

  const config = dbConfig();
  const filename = backupFilename(reason);
  const filePath = path.join(backupDir, filename);
  const output = await fs.open(filePath, 'w');

  try {
    await run(
      process.env.MYSQLDUMP_BIN || 'mysqldump',
      [
        '--single-transaction',
        '--routines',
        '--triggers',
        '--add-drop-table',
        ...commandArgs(config)
      ],
      { stdio: ['ignore', output.createWriteStream(), 'pipe'] }
    );
  } catch (error) {
    await fs.rm(filePath, { force: true });
    throw error;
  } finally {
    await output.close();
  }

  return { filename, filePath };
}

async function listBackups() {
  await ensureBackupDir();
  const files = await fs.readdir(backupDir, { withFileTypes: true });
  const backups = await Promise.all(
    files
      .filter((file) => file.isFile() && file.name.endsWith('.sql') && file.name.startsWith('matching_db_'))
      .map(async (file) => {
        const filePath = path.join(backupDir, file.name);
        const stat = await fs.stat(filePath);
        return {
          filename: file.name,
          size: stat.size,
          created_at: stat.mtime
        };
      })
  );

  return backups.sort((a, b) => b.created_at - a.created_at);
}

function resolveBackupPath(filename) {
  if (!/^matching_db_[a-z0-9_.-]+\.sql$/i.test(filename || '')) {
    const error = new Error('Invalid backup file.');
    error.status = 422;
    throw error;
  }

  const filePath = path.join(backupDir, filename);
  const resolvedPath = path.resolve(filePath);
  const resolvedDir = path.resolve(backupDir);
  if (!resolvedPath.startsWith(`${resolvedDir}${path.sep}`)) {
    const error = new Error('Invalid backup path.');
    error.status = 422;
    throw error;
  }

  return resolvedPath;
}

async function saveUploadedBackup(buffer, originalName = 'uploaded.sql') {
  await ensureBackupDir();
  if (!buffer?.length) {
    const error = new Error('Upload a SQL backup file first.');
    error.status = 422;
    throw error;
  }

  const safeOriginalName = path.basename(originalName).replace(/[^a-z0-9_.-]/gi, '-').toLowerCase();
  const filename = `matching_db_uploaded_${timestamp()}_${safeOriginalName.endsWith('.sql') ? safeOriginalName : `${safeOriginalName}.sql`}`;
  const filePath = path.join(backupDir, filename);
  await fs.writeFile(filePath, buffer);
  return { filename, filePath };
}

async function restoreBackup(filename) {
  const resolvedPath = resolveBackupPath(filename);
  await fs.access(resolvedPath);

  const config = dbConfig();
  const input = nodeFs.createReadStream(resolvedPath);
  await run(process.env.MYSQL_BIN || 'mysql', commandArgs(config), { input });
}

module.exports = {
  createBackup,
  listBackups,
  saveUploadedBackup,
  restoreBackup
};
