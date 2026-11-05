const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const wwwDir = path.join(rootDir, 'www');

console.log('--- Starting BahtBridge Build ---');

// 1. Clean www/ directory before copying
if (fs.existsSync(wwwDir)) {
  fs.rmSync(wwwDir, { recursive: true, force: true });
}
fs.mkdirSync(wwwDir, { recursive: true });

// 2. Scan and copy root files (.html, .css, .js, .json, .svg)
const EXCLUDED_FILES = new Set([
  'server.js',
  'build.js',
  'package.json',
  'package-lock.json',
  'capacitor.config.json',
]);

const ALLOWED_EXTS = new Set(['.html', '.css', '.js', '.json', '.svg']);

const copiedFiles = [];

const allRootEntries = fs.readdirSync(rootDir, { withFileTypes: true });

allRootEntries.forEach((entry) => {
  if (entry.isFile()) {
    const ext = path.extname(entry.name).toLowerCase();
    if (ALLOWED_EXTS.has(ext) && !EXCLUDED_FILES.has(entry.name) && !entry.name.startsWith('.')) {
      const src = path.join(rootDir, entry.name);
      const dest = path.join(wwwDir, entry.name);
      fs.copyFileSync(src, dest);
      copiedFiles.push(entry.name);
    }
  }
});

// 3. Copy vendor/ directory if it exists
const vendorSrc = path.join(rootDir, 'vendor');
const vendorDest = path.join(wwwDir, 'vendor');

if (fs.existsSync(vendorSrc) && fs.statSync(vendorSrc).isDirectory()) {
  fs.cpSync(vendorSrc, vendorDest, { recursive: true });
  copiedFiles.push('vendor/ (directory)');
}

console.log('Copied files to www/:');
copiedFiles.forEach((file) => console.log(`  + ${file}`));

// 4. Update www/sw.js with actual precache list and build timestamp
const targetSw = path.join(wwwDir, 'sw.js');
if (fs.existsSync(targetSw)) {
  let swContent = fs.readFileSync(targetSw, 'utf8');
  const buildTimestamp = Date.now();
  const buildCacheName = `bahtbridge-${buildTimestamp}`;

  // Build precache list: root '/' plus all files in www/
  const precacheList = ['/'];
  copiedFiles.forEach((f) => {
    if (!f.includes(' (directory)')) {
      precacheList.push(`/${f}`);
    }
  });

  const precacheBlock = `/*PRECACHE*/
const CACHE_NAME = '${buildCacheName}';
const ASSETS_TO_CACHE = ${JSON.stringify(precacheList, null, 2)};
/*END*/`;

  swContent = swContent.replace(/\/\*PRECACHE\*\/[\s\S]*?\/\*END\*\//, precacheBlock);
  fs.writeFileSync(targetSw, swContent, 'utf8');
  console.log(`Updated www/sw.js with cache: ${buildCacheName} (${precacheList.length} assets)`);
}

console.log('--- Build Finished Successfully ---');
