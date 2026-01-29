const fs = require('fs');
const path = require('path');

const manifestPath = 'kb/assets/manifest.json';
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const manifestPaths = new Set(manifest.assets.map(a => a.path));

const kbAssetsDir = 'public/kb-assets';

function getFiles(dir, allFiles = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const name = path.join(dir, file);
    if (fs.statSync(name).isDirectory()) {
      getFiles(name, allFiles);
    } else {
      if (!file.startsWith('.')) {
        allFiles.push(name);
      }
    }
  }
  return allFiles;
}

const allFiles = getFiles(kbAssetsDir);
const missing = allFiles.filter(f => {
  const relativePath = '/' + path.relative('public', f);
  return !manifestPaths.has(relativePath);
});

console.log(JSON.stringify(missing, null, 2));
