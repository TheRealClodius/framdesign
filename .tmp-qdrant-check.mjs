import {readFileSync} from 'fs';

const env = readFileSync('.env', 'utf8');
const endpoint = env.match(/QDRANT_CLUSTER_ENDPOINT=(.*)/)[1].trim();
const apiKey = env.match(/QDRANT_API_KEY=(.*)/)[1].trim();

const res = await fetch(`${endpoint}:6333/collections/kb_documents/points/scroll`, {
  method: 'POST',
  headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    limit: 250,
    with_payload: { include: ["entity_id", "entity_type", "related_entities"] },
    with_vector: false,
    filter: { must: [{ key: "entity_type", match: { any: ["photo", "diagram", "video", "gif"] } }] }
  })
});

const parsed = await res.json();
const projects = {};
const missingRel = [];
for (const p of parsed.result.points) {
  const rels = p.payload.related_entities || [];
  if (rels.length === 0) { missingRel.push(p.payload.entity_id); continue; }
  for (const rel of rels) {
    if (rel.startsWith("project:")) {
      if (!(rel in projects)) projects[rel] = [];
      projects[rel].push(p.payload.entity_id);
    }
  }
}
console.log("=== Assets per project (from Qdrant) ===");
for (const [proj, assets] of Object.entries(projects).sort((a,b) => b[1].length - a[1].length)) {
  console.log(proj + ": " + assets.length);
}
console.log("\n=== Assets in Qdrant with NO related_entities ===");
if (missingRel.length === 0) console.log("(none)");
else missingRel.forEach(a => console.log(a));
console.log("\nTotal asset points in Qdrant:", parsed.result.points.length);
