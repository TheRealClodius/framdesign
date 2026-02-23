import {readFileSync} from 'fs';

const manifest = JSON.parse(readFileSync('kb/assets/manifest.json', 'utf8'));
const projects = {};
for (const asset of manifest.assets) {
  for (const rel of (asset.related_entities || [])) {
    if (rel.startsWith("project:")) {
      if (!(rel in projects)) projects[rel] = [];
      projects[rel].push(asset.id);
    }
  }
}
console.log("=== Assets per project (from manifest) ===");
for (const [proj, assets] of Object.entries(projects).sort((a,b) => b[1].length - a[1].length)) {
  console.log(proj + ": " + assets.length);
}
const orphans = manifest.assets.filter(a => !a.related_entities || a.related_entities.length === 0);
console.log("\n=== Orphan assets (no related_entities) ===");
if (orphans.length === 0) console.log("(none)");
else orphans.forEach(a => console.log(a.id));
console.log("\nTotal assets in manifest:", manifest.assets.length);
