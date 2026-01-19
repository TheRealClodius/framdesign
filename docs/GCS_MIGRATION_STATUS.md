# GCS Migration Status

## ✅ Completed Implementation

### Phase 0: Setup Files
- ✅ Installed `@google-cloud/storage` package
- ✅ Created `cors-config.json` for CORS setup
- ✅ Created `test-gcs-connection.js` for testing GCS connectivity
- ✅ Updated `.gitignore` to exclude `gcs-key.json`

### Phase 1: Tests Written (TDD)
- ✅ `tests/services/blob-storage-service.test.ts` - Blob storage service tests
- ✅ `tests/tools/kb-get-gcs.test.js` - kb_get tool tests with GCS
- ✅ `tests/tools/kb-search-gcs.test.js` - kb_search tool tests with GCS
- ✅ `tests/e2e/asset-retrieval-gcs.test.js` - End-to-end integration tests
- ✅ `tests/scripts/validate-manifest.test.js` - Manifest validation tests

### Phase 2: Implementation
- ✅ `lib/services/blob-storage-service.ts` - Blob storage service with:
  - `resolveBlobUrl()` - Resolves blob_id to GCS URL
  - `generateSignedUrl()` - Generates signed URLs for private assets
  - `uploadAsset()` - Uploads assets to GCS
  - `assetExists()` - Checks if asset exists in GCS

### Phase 3: Tool Handlers Updated
- ✅ `tools/kb-get/handler.js` - Updated to:
  - Resolve blob_id to GCS URL
  - Generate markdown field for agent
  - Include `_instructions` field
  - Fallback to old path if blob_id missing
  
- ✅ `tools/kb-search/handler.js` - Updated to:
  - Resolve blob_ids for asset results
  - Add markdown field to asset metadata
  - Handle mixed results (text + assets)

### Phase 4: Migration Scripts
- ✅ `scripts/transform-manifest-to-gcs.js` - Transforms manifest.json to GCS schema
- ✅ `scripts/migrate-assets-to-gcs.js` - Uploads assets to GCS
- ✅ `scripts/validate-gcs-migration.js` - Validates migration success

### Phase 5: System Prompts Updated
- ✅ `prompts/core.md` - Updated asset handling instructions
- ✅ `voice-server/prompts/core.md` - Updated asset handling instructions

## 📋 Next Steps (Manual Actions Required)

### Step 1: Set Up Google Cloud Storage

Run these commands (you need `gcloud` CLI installed):

```bash
# 1. Authenticate
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# 2. Create bucket
gcloud storage buckets create gs://framdesign-assets \
  --location=US \
  --storage-class=STANDARD \
  --public-access-prevention

# 3. Make bucket publicly readable
gcloud storage buckets add-iam-policy-binding gs://framdesign-assets \
  --member=allUsers \
  --role=roles/storage.objectViewer

# 4. Apply CORS
gcloud storage buckets update gs://framdesign-assets --cors-file=cors-config.json

# 5. Create service account
gcloud iam service-accounts create framdesign-storage \
  --display-name="Framdesign Storage Service Account"

# 6. Grant permissions
gcloud projects add-iam-policy-binding $(gcloud config get-value project) \
  --member="serviceAccount:framdesign-storage@$(gcloud config get-value project).iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

# 7. Create and download key
gcloud iam service-accounts keys create ./gcs-key.json \
  --iam-account=framdesign-storage@$(gcloud config get-value project).iam.gserviceaccount.com
```

### Step 2: Configure Environment Variables

Create/update `.env.local`:

```env
GCS_PROJECT_ID=your-project-id
GCS_BUCKET_NAME=framdesign-assets
GCS_KEY_FILE=./gcs-key.json
```

For Vercel deployment, add these environment variables:
- `GCS_SERVICE_ACCOUNT_KEY` (base64 encoded service account key)
- `GCS_PROJECT_ID`
- `GCS_BUCKET_NAME`

To get base64 key:
```bash
cat gcs-key.json | base64
```

### Step 3: Test GCS Connection

```bash
node test-gcs-connection.js
```

Expected output: All tests pass ✓

### Step 4: Transform Manifest

```bash
node scripts/transform-manifest-to-gcs.js
```

This will:
- Add `blob_id` and `file_extension` fields to each asset
- Update manifest version to 2.0.0
- Create backup at `kb/assets/manifest.v1.backup.json`

### Step 5: Migrate Assets to GCS

```bash
node scripts/migrate-assets-to-gcs.js
```

This will:
- Upload all assets from `public/kb-assets/` to GCS
- Make files publicly accessible
- Report success/failure for each asset

### Step 6: Validate Migration

```bash
node scripts/validate-gcs-migration.js
```

This will:
- Check all assets exist in GCS
- Verify URLs are accessible
- Report any issues

### Step 7: Update Qdrant

Run the embedding script to update Qdrant with new blob_ids:

```bash
npm run embed-kb
```

This will:
- Read transformed manifest with blob_ids
- Generate embeddings
- Store metadata with blob_id, file_extension, storage_provider in Qdrant

### Step 8: Test Everything

```bash
# Run tests
npm test

# Start dev server and test manually
npm run dev
```

Test queries:
- "Show me photos of Andrei"
- "Get me the Semantic Space canvas sketch"
- "Show me Autopilot videos"

### Step 9: Deploy to Vercel

After verifying everything works locally:

```bash
git add .
git commit -m "Migrate assets to Google Cloud Storage"
git push origin main
```

Make sure Vercel environment variables are set!

## 🎯 Success Criteria

- ✅ All tests pass
- ✅ Agent uses `markdown` field (no path generation)
- ✅ All 30+ assets render correctly
- ✅ GCS URLs are publicly accessible
- ✅ No broken images or 404s
- ✅ Video assets work

## 📝 Notes

- The implementation includes fallback logic: if `blob_id` is missing, it falls back to old `path` field
- This allows gradual migration without breaking existing functionality
- After migration is complete and validated, you can remove the fallback logic

## 🔄 Rollback Plan

If something goes wrong:

1. **Restore manifest**: `cp kb/assets/manifest.v1.backup.json kb/assets/manifest.json`
2. **Revert code changes**: `git checkout HEAD -- tools/kb-get/handler.js tools/kb-search/handler.js`
3. **Assets remain in GCS**: They won't be deleted, can be reused later

## 📚 Documentation

- See plan file: `.cursor/plans/fix_asset_retrieval_and_kb_tool_robustness_cc6768d6.plan.md`
- Manifest schema: `kb/assets/manifest.json` (includes `_ID_MAPPING_RULES`)
