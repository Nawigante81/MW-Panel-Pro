import fs from 'node:fs';
import path from 'node:path';
import { BACKUP_DIR, DB_PATH } from './db.js';

const now = new Date();
const stamp = now.toISOString().replace(/[:.]/g, '-');
const sourcePath = path.resolve(DB_PATH);

if (!fs.existsSync(sourcePath)) {
  console.error(`Database not found: ${sourcePath}`);
  process.exit(1);
}

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const targetPath = path.join(BACKUP_DIR, `mwpanel-${stamp}.sqlite`);
fs.copyFileSync(sourcePath, targetPath);

console.log(`Backup created: ${targetPath}`);
