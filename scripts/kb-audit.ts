/**
 * KB Health Audit Script
 *
 * Comprehensive diagnostic for the entire KB pipeline:
 * 1. Frontmatter schema validation
 * 2. Asset manifest integrity
 * 3. Cross-reference checks (related_entities, affiliations)
 * 4. Embedding coverage in Qdrant
 * 5. GCS asset existence verification
 *
 * Usage: npx tsx scripts/kb-audit.ts
 *        npx tsx scripts/kb-audit.ts --skip-gcs    (skip GCS checks, faster)
 *        npx tsx scripts/kb-audit.ts --skip-qdrant  (skip Qdrant checks)
 *        npx tsx scripts/kb-audit.ts --json          (output as JSON)
 */

import { config } from 'dotenv';
import path from 'path';
config({ path: path.join(process.cwd(), '.env'), override: true });

import fs from 'fs/promises';
import matter from 'gray-matter';

const KB_DIR = path.join(process.cwd(), 'kb');
const MANIFEST_PATH = path.join(KB_DIR, 'assets', 'manifest.json');

// Parse CLI flags
const args = process.argv.slice(2);
const skipGcs = args.includes('--skip-gcs');
const skipQdrant = args.includes('--skip-qdrant');
const jsonOutput = args.includes('--json');

// ─── Types ───────────────────────────────────────────────────────────

interface AuditIssue {
  severity: 'error' | 'warning' | 'info';
  category: 'frontmatter' | 'manifest' | 'cross-ref' | 'embedding' | 'gcs';
  file?: string;
  field?: string;
  message: string;
}

interface AuditResult {
  timestamp: string;
  duration: number;
  summary: {
    files: number;
    assets: number;
    issues: { errors: number; warnings: number; info: number };
  };
  issues: AuditIssue[];
  checks: {
    frontmatter: { passed: number; failed: number };
    manifest: { passed: number; failed: number };
    crossRef: { passed: number; failed: number };
    embedding: { passed: number; failed: number; skipped: boolean };
    gcs: { passed: number; failed: number; skipped: boolean };
  };
}

// ─── Frontmatter Schema ─────────────────────────────────────────────

const VALID_ENTITY_TYPES = ['person', 'lab', 'project'];
const REQUIRED_FIELDS: Record<string, string[]> = {
  person: ['id', 'type', 'title'],
  lab: ['id', 'type', 'title'],
  project: ['id', 'type', 'title', 'status'],
};
const VALID_PROJECT_STATUS = ['shipped', 'ongoing', 'archived'];

// ─── Helpers ─────────────────────────────────────────────────────────

async function findMarkdownFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'assets') {
      files.push(...(await findMarkdownFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md') {
      files.push(fullPath);
    }
  }
  return files;
}

function issue(
  severity: AuditIssue['severity'],
  category: AuditIssue['category'],
  message: string,
  file?: string,
  field?: string
): AuditIssue {
  return { severity, category, message, file, field };
}

// ─── Check 1: Frontmatter Validation ────────────────────────────────

async function checkFrontmatter(files: string[]): Promise<{
  issues: AuditIssue[];
  entityIds: Map<string, string>; // id -> file path
  passed: number;
  failed: number;
}> {
  const issues: AuditIssue[] = [];
  const entityIds = new Map<string, string>();
  let passed = 0;
  let failed = 0;

  for (const filePath of files) {
    const relativePath = path.relative(KB_DIR, filePath);
    const content = await fs.readFile(filePath, 'utf-8');
    let fileHasError = false;

    // Check if frontmatter exists
    if (!content.startsWith('---')) {
      issues.push(issue('error', 'frontmatter', 'Missing frontmatter block', relativePath));
      failed++;
      continue;
    }

    let frontmatter: Record<string, any>;
    try {
      const parsed = matter(content);
      frontmatter = parsed.data;
    } catch (e: any) {
      issues.push(issue('error', 'frontmatter', `Failed to parse frontmatter: ${e.message}`, relativePath));
      failed++;
      continue;
    }

    // Check required fields
    const entityType = frontmatter.type;
    if (!entityType) {
      issues.push(issue('error', 'frontmatter', 'Missing required field: type', relativePath, 'type'));
      fileHasError = true;
    } else if (!VALID_ENTITY_TYPES.includes(entityType)) {
      issues.push(issue('error', 'frontmatter', `Invalid type "${entityType}". Expected: ${VALID_ENTITY_TYPES.join(', ')}`, relativePath, 'type'));
      fileHasError = true;
    }

    const requiredFields = REQUIRED_FIELDS[entityType] || REQUIRED_FIELDS.person;
    for (const field of requiredFields) {
      if (!frontmatter[field]) {
        issues.push(issue('error', 'frontmatter', `Missing required field: ${field}`, relativePath, field));
        fileHasError = true;
      }
    }

    // Check ID format: {type}:{filename_without_ext}
    if (frontmatter.id) {
      const expectedPrefix = `${entityType}:`;
      if (!frontmatter.id.startsWith(expectedPrefix)) {
        issues.push(issue('error', 'frontmatter', `ID "${frontmatter.id}" should start with "${expectedPrefix}"`, relativePath, 'id'));
        fileHasError = true;
      }

      // Check filename matches ID suffix
      const fileBasename = path.basename(filePath, '.md');
      const idSuffix = frontmatter.id.split(':')[1];
      if (idSuffix && idSuffix !== fileBasename) {
        issues.push(issue('warning', 'frontmatter', `ID suffix "${idSuffix}" doesn't match filename "${fileBasename}"`, relativePath, 'id'));
      }

      // Check for duplicate IDs
      if (entityIds.has(frontmatter.id)) {
        issues.push(issue('error', 'frontmatter', `Duplicate ID "${frontmatter.id}" (also in ${entityIds.get(frontmatter.id)})`, relativePath, 'id'));
        fileHasError = true;
      }
      entityIds.set(frontmatter.id, relativePath);
    }

    // Type-specific validation
    if (entityType === 'project' && frontmatter.status) {
      if (!VALID_PROJECT_STATUS.includes(frontmatter.status)) {
        issues.push(issue('warning', 'frontmatter', `Invalid status "${frontmatter.status}". Expected: ${VALID_PROJECT_STATUS.join(', ')}`, relativePath, 'status'));
      }
    }

    // Check for empty title
    if (frontmatter.title && typeof frontmatter.title === 'string' && frontmatter.title.trim() === '') {
      issues.push(issue('error', 'frontmatter', 'Title is empty string', relativePath, 'title'));
      fileHasError = true;
    }

    // Check body has content
    const bodyContent = matter(content).content.trim();
    if (!bodyContent) {
      issues.push(issue('warning', 'frontmatter', 'File has frontmatter but empty body (no markdown content)', relativePath));
    }

    if (fileHasError) {
      failed++;
    } else {
      passed++;
    }
  }

  return { issues, entityIds, passed, failed };
}

// ─── Check 2: Asset Manifest Validation ─────────────────────────────

interface ManifestAsset {
  id: string;
  type: string;
  entity_type: string;
  title: string;
  description: string;
  blob_id: string;
  file_extension: string;
  storage_provider: string;
  related_entities: string[];
  tags: string[];
  caption: string;
  path: string;
  metadata: Record<string, any>;
  [key: string]: any;
}

async function checkManifest(): Promise<{
  issues: AuditIssue[];
  assets: ManifestAsset[];
  assetIds: Set<string>;
  passed: number;
  failed: number;
}> {
  const issues: AuditIssue[] = [];
  const assetIds = new Set<string>();
  let passed = 0;
  let failed = 0;

  let manifest: { version: string; assets: ManifestAsset[] };
  try {
    const content = await fs.readFile(MANIFEST_PATH, 'utf-8');
    manifest = JSON.parse(content);
  } catch (e: any) {
    issues.push(issue('error', 'manifest', `Failed to read/parse manifest: ${e.message}`));
    return { issues, assets: [], assetIds, passed: 0, failed: 1 };
  }

  if (!manifest.version) {
    issues.push(issue('warning', 'manifest', 'Missing version field in manifest'));
  }

  if (!Array.isArray(manifest.assets)) {
    issues.push(issue('error', 'manifest', 'manifest.assets is not an array'));
    return { issues, assets: [], assetIds, passed: 0, failed: 1 };
  }

  const REQUIRED_ASSET_FIELDS = ['id', 'entity_type', 'title', 'description', 'blob_id', 'file_extension'];
  const VALID_ASSET_TYPES = ['photo', 'diagram', 'video', 'gif'];

  for (const asset of manifest.assets) {
    let assetHasError = false;
    const assetLabel = asset.id || '(unknown id)';

    // Required fields
    for (const field of REQUIRED_ASSET_FIELDS) {
      if (!asset[field]) {
        issues.push(issue('error', 'manifest', `Asset "${assetLabel}": missing required field "${field}"`, 'manifest.json', field));
        assetHasError = true;
      }
    }

    // ID format: asset:{slug}
    if (asset.id) {
      if (!asset.id.startsWith('asset:')) {
        issues.push(issue('error', 'manifest', `Asset ID "${asset.id}" should start with "asset:"`, 'manifest.json', 'id'));
        assetHasError = true;
      }
      if (assetIds.has(asset.id)) {
        issues.push(issue('error', 'manifest', `Duplicate asset ID: "${asset.id}"`, 'manifest.json', 'id'));
        assetHasError = true;
      }
      assetIds.add(asset.id);
    }

    // entity_type validation
    if (asset.entity_type && !VALID_ASSET_TYPES.includes(asset.entity_type)) {
      issues.push(issue('warning', 'manifest', `Asset "${assetLabel}": entity_type "${asset.entity_type}" not in [${VALID_ASSET_TYPES.join(', ')}]`, 'manifest.json', 'entity_type'));
    }

    // blob_id should not have file extension
    if (asset.blob_id && asset.file_extension && asset.blob_id.endsWith(`.${asset.file_extension}`)) {
      issues.push(issue('warning', 'manifest', `Asset "${assetLabel}": blob_id includes file extension (should be without)`, 'manifest.json', 'blob_id'));
    }

    // related_entities should be an array
    if (asset.related_entities && !Array.isArray(asset.related_entities)) {
      issues.push(issue('error', 'manifest', `Asset "${assetLabel}": related_entities should be an array`, 'manifest.json', 'related_entities'));
      assetHasError = true;
    }

    // Empty description check
    if (asset.description && typeof asset.description === 'string' && asset.description.trim().length < 10) {
      issues.push(issue('warning', 'manifest', `Asset "${assetLabel}": description is very short (${asset.description.length} chars)`, 'manifest.json', 'description'));
    }

    if (assetHasError) {
      failed++;
    } else {
      passed++;
    }
  }

  return { issues, assets: manifest.assets, assetIds, passed, failed };
}

// ─── Check 3: Cross-Reference Integrity ─────────────────────────────

function checkCrossReferences(
  entityIds: Map<string, string>,
  assets: ManifestAsset[]
): { issues: AuditIssue[]; passed: number; failed: number } {
  const issues: AuditIssue[] = [];
  let passed = 0;
  let failed = 0;

  // Check asset related_entities reference real KB entities
  for (const asset of assets) {
    if (!asset.related_entities || !Array.isArray(asset.related_entities)) continue;

    for (const entityRef of asset.related_entities) {
      if (entityIds.has(entityRef)) {
        passed++;
      } else {
        issues.push(issue('warning', 'cross-ref',
          `Asset "${asset.id}": related_entity "${entityRef}" not found in KB files`,
          'manifest.json'
        ));
        failed++;
      }
    }
  }

  return { issues, passed, failed };
}

// ─── Check 4: Embedding Coverage ────────────────────────────────────

async function checkEmbeddings(
  entityIds: Map<string, string>,
  assetIds: Set<string>
): Promise<{ issues: AuditIssue[]; passed: number; failed: number }> {
  const issues: AuditIssue[] = [];
  let passed = 0;
  let failed = 0;

  let getAllDocumentIds: () => Promise<string[]>;
  let hasDocuments: () => Promise<boolean>;

  try {
    const vectorStore = await import('../lib/services/vector-store-service');
    getAllDocumentIds = vectorStore.getAllDocumentIds;
    hasDocuments = vectorStore.hasDocuments;
  } catch (e: any) {
    issues.push(issue('error', 'embedding', `Failed to import vector-store-service: ${e.message}`));
    return { issues, passed: 0, failed: 1 };
  }

  const hasDocs = await hasDocuments();
  if (!hasDocs) {
    issues.push(issue('error', 'embedding', 'Vector store is empty — no documents embedded'));
    return { issues, passed: 0, failed: 1 };
  }

  const embeddedIds = await getAllDocumentIds();
  const embeddedIdSet = new Set(embeddedIds);

  // Check each KB entity has at least one chunk
  for (const [entityId, filePath] of entityIds) {
    const hasChunks = embeddedIds.some(id => id === entityId || id.startsWith(`${entityId}_chunk_`));
    if (hasChunks) {
      passed++;
    } else {
      issues.push(issue('error', 'embedding', `Entity "${entityId}" has no embeddings in Qdrant`, filePath));
      failed++;
    }
  }

  // Check each asset has at least one chunk
  for (const assetId of assetIds) {
    const hasChunks = embeddedIds.some(id => id === assetId || id.startsWith(`${assetId}_chunk_`));
    if (hasChunks) {
      passed++;
    } else {
      issues.push(issue('error', 'embedding', `Asset "${assetId}" has no embeddings in Qdrant`, 'manifest.json'));
      failed++;
    }
  }

  // Check for orphaned chunks
  const allKnownBaseIds = new Set([...entityIds.keys(), ...assetIds]);
  let orphanCount = 0;
  for (const embeddedId of embeddedIds) {
    const baseId = embeddedId.replace(/_chunk_\d+$/, '');
    if (!allKnownBaseIds.has(baseId)) {
      orphanCount++;
      if (orphanCount <= 5) {
        issues.push(issue('warning', 'embedding', `Orphaned chunk in Qdrant: "${embeddedId}" (no matching KB entity or asset)`));
      }
    }
  }
  if (orphanCount > 5) {
    issues.push(issue('warning', 'embedding', `...and ${orphanCount - 5} more orphaned chunks`));
  }

  // Summary info
  issues.push(issue('info', 'embedding', `Qdrant contains ${embeddedIds.length} total chunks`));

  return { issues, passed, failed };
}

// ─── Check 5: GCS Asset Existence ───────────────────────────────────

async function checkGcsAssets(
  assets: ManifestAsset[]
): Promise<{ issues: AuditIssue[]; passed: number; failed: number }> {
  const issues: AuditIssue[] = [];
  let passed = 0;
  let failed = 0;

  let assetExists: (blobId: string, extension: string) => Promise<boolean>;

  try {
    const blobService = await import('../lib/services/blob-storage-service');
    assetExists = blobService.assetExists;
  } catch (e: any) {
    issues.push(issue('error', 'gcs', `Failed to import blob-storage-service: ${e.message}`));
    return { issues, passed: 0, failed: 1 };
  }

  // Batch check in parallel (groups of 10 to avoid overwhelming GCS)
  const BATCH_SIZE = 10;
  for (let i = 0; i < assets.length; i += BATCH_SIZE) {
    const batch = assets.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (asset) => {
        if (!asset.blob_id || !asset.file_extension) {
          return { asset, exists: false, reason: 'missing blob_id or file_extension' };
        }
        try {
          const exists = await assetExists(asset.blob_id, asset.file_extension);
          return { asset, exists, reason: exists ? '' : 'not found in GCS' };
        } catch (e: any) {
          return { asset, exists: false, reason: `GCS error: ${e.message}` };
        }
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { asset, exists, reason } = result.value;
        if (exists) {
          passed++;
        } else {
          issues.push(issue('error', 'gcs',
            `Asset "${asset.id}" (blob: assets/${asset.blob_id}.${asset.file_extension}): ${reason}`,
            'manifest.json'
          ));
          failed++;
        }
      } else {
        issues.push(issue('error', 'gcs', `Unexpected error: ${result.reason}`));
        failed++;
      }
    }
  }

  return { issues, passed, failed };
}

// ─── Main ────────────────────────────────────────────────────────────

async function runAudit(): Promise<AuditResult> {
  const startTime = Date.now();
  const allIssues: AuditIssue[] = [];

  if (!jsonOutput) {
    console.log('╔══════════════════════════════════════════╗');
    console.log('║         KB Health Audit                  ║');
    console.log('╚══════════════════════════════════════════╝\n');
  }

  // Discover files
  const files = await findMarkdownFiles(KB_DIR);
  if (!jsonOutput) console.log(`Found ${files.length} KB markdown files\n`);

  // Check 1: Frontmatter
  if (!jsonOutput) console.log('── Frontmatter Validation ──');
  const frontmatterResult = await checkFrontmatter(files);
  allIssues.push(...frontmatterResult.issues);
  if (!jsonOutput) {
    console.log(`   Passed: ${frontmatterResult.passed}  Failed: ${frontmatterResult.failed}`);
    printIssues(frontmatterResult.issues);
    console.log();
  }

  // Check 2: Manifest
  if (!jsonOutput) console.log('── Asset Manifest Validation ──');
  const manifestResult = await checkManifest();
  allIssues.push(...manifestResult.issues);
  if (!jsonOutput) {
    console.log(`   Assets: ${manifestResult.assets.length}  Passed: ${manifestResult.passed}  Failed: ${manifestResult.failed}`);
    printIssues(manifestResult.issues);
    console.log();
  }

  // Check 3: Cross-references
  if (!jsonOutput) console.log('── Cross-Reference Integrity ──');
  const crossRefResult = checkCrossReferences(frontmatterResult.entityIds, manifestResult.assets);
  allIssues.push(...crossRefResult.issues);
  if (!jsonOutput) {
    console.log(`   Passed: ${crossRefResult.passed}  Failed: ${crossRefResult.failed}`);
    printIssues(crossRefResult.issues);
    console.log();
  }

  // Check 4: Embedding coverage
  let embeddingResult = { issues: [] as AuditIssue[], passed: 0, failed: 0 };
  if (skipQdrant) {
    if (!jsonOutput) console.log('── Embedding Coverage (SKIPPED) ──\n');
  } else {
    if (!jsonOutput) console.log('── Embedding Coverage ──');
    embeddingResult = await checkEmbeddings(frontmatterResult.entityIds, manifestResult.assetIds);
    allIssues.push(...embeddingResult.issues);
    if (!jsonOutput) {
      console.log(`   Passed: ${embeddingResult.passed}  Failed: ${embeddingResult.failed}`);
      printIssues(embeddingResult.issues);
      console.log();
    }
  }

  // Check 5: GCS asset existence
  let gcsResult = { issues: [] as AuditIssue[], passed: 0, failed: 0 };
  if (skipGcs) {
    if (!jsonOutput) console.log('── GCS Asset Existence (SKIPPED) ──\n');
  } else {
    if (!jsonOutput) console.log('── GCS Asset Existence ──');
    gcsResult = await checkGcsAssets(manifestResult.assets);
    allIssues.push(...gcsResult.issues);
    if (!jsonOutput) {
      console.log(`   Passed: ${gcsResult.passed}  Failed: ${gcsResult.failed}`);
      printIssues(gcsResult.issues);
      console.log();
    }
  }

  // Build result
  const duration = Date.now() - startTime;
  const result: AuditResult = {
    timestamp: new Date().toISOString(),
    duration,
    summary: {
      files: files.length,
      assets: manifestResult.assets.length,
      issues: {
        errors: allIssues.filter(i => i.severity === 'error').length,
        warnings: allIssues.filter(i => i.severity === 'warning').length,
        info: allIssues.filter(i => i.severity === 'info').length,
      },
    },
    issues: allIssues,
    checks: {
      frontmatter: { passed: frontmatterResult.passed, failed: frontmatterResult.failed },
      manifest: { passed: manifestResult.passed, failed: manifestResult.failed },
      crossRef: { passed: crossRefResult.passed, failed: crossRefResult.failed },
      embedding: { passed: embeddingResult.passed, failed: embeddingResult.failed, skipped: skipQdrant },
      gcs: { passed: gcsResult.passed, failed: gcsResult.failed, skipped: skipGcs },
    },
  };

  // Final summary
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('══════════════════════════════════════════');
    console.log('  SUMMARY');
    console.log('══════════════════════════════════════════');
    console.log(`  Files:    ${result.summary.files}`);
    console.log(`  Assets:   ${result.summary.assets}`);
    console.log(`  Errors:   ${result.summary.issues.errors}`);
    console.log(`  Warnings: ${result.summary.issues.warnings}`);
    console.log(`  Duration: ${duration}ms`);
    console.log('══════════════════════════════════════════');

    if (result.summary.issues.errors === 0 && result.summary.issues.warnings === 0) {
      console.log('\n  All checks passed.\n');
    } else if (result.summary.issues.errors > 0) {
      console.log(`\n  ${result.summary.issues.errors} error(s) found. Fix these before deploying.\n`);
    }
  }

  return result;
}

function printIssues(issues: AuditIssue[]) {
  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');
  const infos = issues.filter(i => i.severity === 'info');

  for (const i of errors) {
    console.log(`   [ERROR]   ${i.file ? `${i.file}: ` : ''}${i.message}`);
  }
  for (const i of warnings) {
    console.log(`   [WARN]    ${i.file ? `${i.file}: ` : ''}${i.message}`);
  }
  for (const i of infos) {
    console.log(`   [INFO]    ${i.message}`);
  }
}

// Run
runAudit().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
