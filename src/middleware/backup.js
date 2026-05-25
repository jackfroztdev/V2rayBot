const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DATA_DIR = path.join(__dirname, '../../data');
const BACKUP_DIR = path.join(__dirname, '../../backups');

function createBackup() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupName = `backup_${timestamp}`;
  const backupPath = path.join(BACKUP_DIR, backupName);

  fs.mkdirSync(backupPath, { recursive: true });

  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  let count = 0;
  for (const file of files) {
    try {
      fs.copyFileSync(path.join(DATA_DIR, file), path.join(backupPath, file));
      count++;
    } catch {}
  }

  return { name: backupName, path: backupPath, files: count, timestamp };
}

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  const dirs = fs.readdirSync(BACKUP_DIR).filter(d => d.startsWith('backup_'));
  return dirs.sort().reverse().map(d => {
    const bp = path.join(BACKUP_DIR, d);
    const files = fs.readdirSync(bp).filter(f => f.endsWith('.json'));
    return { name: d, files: files.length };
  });
}

function restoreBackup(backupName) {
  const backupPath = path.join(BACKUP_DIR, backupName);
  if (!fs.existsSync(backupPath)) return { success: false, msg: 'Backup not found' };

  const files = fs.readdirSync(backupPath).filter(f => f.endsWith('.json'));
  let count = 0;
  for (const file of files) {
    try {
      fs.copyFileSync(path.join(backupPath, file), path.join(DATA_DIR, file));
      count++;
    } catch {}
  }
  return { success: true, files: count };
}

function deleteBackup(backupName) {
  const backupPath = path.join(BACKUP_DIR, backupName);
  if (!fs.existsSync(backupPath)) return false;
  fs.rmSync(backupPath, { recursive: true, force: true });
  return true;
}

function getBackupZipBuffer(backupName) {
  const backupPath = path.join(BACKUP_DIR, backupName);
  if (!fs.existsSync(backupPath)) return null;
  const zipPath = path.join(BACKUP_DIR, `${backupName}.tar.gz`);
  try {
    execSync(`cd "${BACKUP_DIR}" && tar czf "${zipPath}" "${backupName}"`);
    const buffer = fs.readFileSync(zipPath);
    fs.unlinkSync(zipPath);
    return buffer;
  } catch {
    return null;
  }
}

module.exports = {
  createBackup,
  listBackups,
  restoreBackup,
  deleteBackup,
  getBackupZipBuffer,
};
