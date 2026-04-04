/**
 * Post-build script: stamps the correct icon + version info into the packaged exe
 * using rcedit, since electron-builder sometimes fails to do this on Windows
 * without Developer Mode (symlink permissions issue).
 */
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const glob = require('glob');

const ROOT = path.join(__dirname, '..');
const ICO = path.join(ROOT, 'assets/images/collings-logo.ico');
const EXE = path.join(ROOT, 'dist-installer/win-unpacked/Collings AI.exe');

// Find rcedit-x64.exe in electron-builder cache
const cacheDir = path.join(process.env.LOCALAPPDATA || '', 'electron-builder/Cache/winCodeSign');
let rcedit = null;

if (fs.existsSync(cacheDir)) {
  const dirs = fs.readdirSync(cacheDir).map(d => path.join(cacheDir, d)).filter(d => fs.statSync(d).isDirectory());
  for (const dir of dirs) {
    const candidate = path.join(dir, 'rcedit-x64.exe');
    if (fs.existsSync(candidate)) { rcedit = candidate; break; }
  }
}

if (!rcedit) {
  console.error('rcedit-x64.exe not found in cache. Run electron-builder once first.');
  process.exit(1);
}

if (!fs.existsSync(EXE)) {
  console.error('Exe not found:', EXE);
  process.exit(1);
}

console.log('Stamping icon into:', EXE);
execFileSync(rcedit, [
  EXE,
  '--set-icon', ICO,
  '--set-version-string', 'ProductName', 'Collings AI',
  '--set-version-string', 'FileDescription', 'Collings AI - WordPress management powered by AI',
  '--set-version-string', 'CompanyName', 'Collings AI',
  '--set-version-string', 'LegalCopyright', '© 2024 Collings AI',
  '--set-file-version', '1.1.0.0',
  '--set-product-version', '1.1.0.0',
]);
console.log('Icon stamped successfully.');
