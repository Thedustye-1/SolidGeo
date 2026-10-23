import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const version = process.argv[2];
if (!version || !/^v\d+$/.test(version)) {
  console.error('usage: node scripts/snapshot-version.mjs v1');
  process.exit(1);
}

const root = process.cwd();
const dest = path.join(root, 'versions', version);
if (fs.existsSync(dest)) {
  console.error(`拒绝覆盖已有版本：${dest}`);
  console.error('版本快照是不可变的历史记录。请使用新的版本号。');
  process.exit(2);
}
fs.mkdirSync(dest, { recursive: true });

const entries = [
  'src',
  'electron',
  'public',
  'build',
  'scripts',
  'docs',
  'index.html',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vite.config.ts',
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
  '.gitignore',
];
for (const entry of entries) {
  const src = path.join(root, entry);
  if (!fs.existsSync(src)) continue;
  fs.cpSync(src, path.join(dest, entry), {
    recursive: true,
    filter: (source) => !source.includes('node_modules') && !source.endsWith('smoke.png'),
  });
}

// Keep release binaries in a separate top-level folder so source snapshots stay light.
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const releaseDir = path.join(root, 'releases', version);
fs.mkdirSync(releaseDir, { recursive: true });
const expectedExe = `SolidGeo-${pkg.version}-Portable.exe`;
const sourceReleaseDir = path.join(root, 'release');
const available = fs.existsSync(sourceReleaseDir)
  ? fs.readdirSync(sourceReleaseDir).filter((file) => file.endsWith('.exe'))
  : [];
const trusted = available.find((file) => file === expectedExe);
if (trusted) {
  fs.copyFileSync(path.join(sourceReleaseDir, trusted), path.join(releaseDir, trusted));
} else {
  console.warn(`warning: ${expectedExe} not found in release/; skipping binary archive`);
}
const exe = trusted && fs.existsSync(path.join(releaseDir, trusted)) ? trusted : null;
let checksum = null;
if (exe) {
  const buf = fs.readFileSync(path.join(releaseDir, exe));
  checksum = crypto.createHash('sha256').update(buf).digest('hex');
}
const manifest = {
  version,
  appVersion: pkg.version,
  createdAt: new Date().toISOString(),
  release: exe ? { file: `releases/${version}/${exe}`, bytes: fs.statSync(path.join(releaseDir, exe)).size, sha256: checksum } : null,
  note: '此目录是只读历史快照，后续改动请创建新版本，不修改旧版本。',
};
fs.writeFileSync(path.join(dest, 'SNAPSHOT.json'), JSON.stringify(manifest, null, 2));
console.log(`snapshot created: ${dest}`);
if (exe) console.log(`release copied: ${path.join(releaseDir, exe)}`);
