/**
 * Verify hover implementation is correct
 * Checks that all necessary files exist and code is properly structured
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔍 Verifying Hover Implementation...\n');

const checks = [];

// Check 1: Manifest exists in public folder
const manifestPath = path.join(__dirname, 'public/kb/assets/manifest.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  checks.push({
    name: 'Manifest in public folder',
    status: '✓',
    details: `Found ${manifest.assets?.length || 0} assets`
  });
} else {
  checks.push({
    name: 'Manifest in public folder',
    status: '✗',
    details: 'Missing - needs to be copied'
  });
}

// Check 2: Project config exists
const projectConfigPath = path.join(__dirname, 'lib/project-config.ts');
if (fs.existsSync(projectConfigPath)) {
  const content = fs.readFileSync(projectConfigPath, 'utf-8');
  const projectCount = (content.match(/PROJECT_ENTITY_MAP/g) || []).length;
  checks.push({
    name: 'Project config file',
    status: '✓',
    details: 'project-config.ts exists'
  });
} else {
  checks.push({
    name: 'Project config file',
    status: '✗',
    details: 'Missing'
  });
}

// Check 3: Image map utility exists
const imageMapPath = path.join(__dirname, 'lib/project-image-map.ts');
if (fs.existsSync(imageMapPath)) {
  const content = fs.readFileSync(imageMapPath, 'utf-8');
  const hasExtractFunction = content.includes('extractProjectName');
  const hasGetImageFunction = content.includes('getSuggestionImage');
  checks.push({
    name: 'Image map utility',
    status: hasExtractFunction && hasGetImageFunction ? '✓' : '✗',
    details: hasExtractFunction && hasGetImageFunction 
      ? 'All required functions present'
      : 'Missing required functions'
  });
} else {
  checks.push({
    name: 'Image map utility',
    status: '✗',
    details: 'Missing'
  });
}

// Check 4: Popup component exists
const popupPath = path.join(__dirname, 'components/SuggestionImagePopup.tsx');
if (fs.existsSync(popupPath)) {
  const content = fs.readFileSync(popupPath, 'utf-8');
  const hasProps = content.includes('imagePath') && content.includes('buttonRect');
  checks.push({
    name: 'Popup component',
    status: hasProps ? '✓' : '✗',
    details: hasProps ? 'Component exists with correct props' : 'Missing or incorrect props'
  });
} else {
  checks.push({
    name: 'Popup component',
    status: '✗',
    details: 'Missing'
  });
}

// Check 5: ChatInterface integration
const chatInterfacePath = path.join(__dirname, 'components/ChatInterface.tsx');
if (fs.existsSync(chatInterfacePath)) {
  const content = fs.readFileSync(chatInterfacePath, 'utf-8');
  const hasImport = content.includes('getSuggestionImage') && content.includes('SuggestionImagePopup');
  const hasHoverState = content.includes('hoveredSuggestion');
  const hasOnMouseEnter = content.includes('onMouseEnter');
  checks.push({
    name: 'ChatInterface integration',
    status: hasImport && hasHoverState && hasOnMouseEnter ? '✓' : '✗',
    details: hasImport && hasHoverState && hasOnMouseEnter
      ? 'All integrations present'
      : 'Missing integrations'
  });
} else {
  checks.push({
    name: 'ChatInterface integration',
    status: '✗',
    details: 'Missing'
  });
}

// Check 6: Tests exist
const testPath = path.join(__dirname, 'tests/lib/project-image-map.test.ts');
if (fs.existsSync(testPath)) {
  checks.push({
    name: 'Test file',
    status: '✓',
    details: 'Tests exist'
  });
} else {
  checks.push({
    name: 'Test file',
    status: '✗',
    details: 'Missing'
  });
}

// Print results
console.log('Implementation Check Results:\n');
checks.forEach(check => {
  console.log(`${check.status} ${check.name}`);
  console.log(`   ${check.details}\n`);
});

const allPassed = checks.every(c => c.status === '✓');
console.log('='.repeat(60));
if (allPassed) {
  console.log('✅ All checks passed! Implementation looks correct.');
  console.log('\n📋 Next step: Open http://localhost:3000 and test manually');
  console.log('   Run: node test-hover-manually.js for testing guide');
} else {
  console.log('⚠️  Some checks failed. Please review above.');
}
console.log('='.repeat(60));
