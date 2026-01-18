#!/bin/bash

# Pre-Deployment Checklist Script
# Verifies everything is ready before deploying

set -e

echo "🔍 Pre-Deployment Checklist"
echo "=========================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

# Check if images directory exists
echo "📁 Checking images..."
if [ -d "public/kb-assets" ]; then
    IMAGE_COUNT=$(find public/kb-assets -type f \( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.gif" \) | wc -l | tr -d ' ')
    echo -e "${GREEN}✓${NC} Images directory exists ($IMAGE_COUNT images found)"
else
    echo -e "${RED}✗${NC} Images directory not found: public/kb-assets"
    ERRORS=$((ERRORS + 1))
fi

# Check if manifest exists
echo ""
echo "📋 Checking asset manifest..."
if [ -f "kb/assets/manifest.json" ]; then
    MANIFEST_ASSETS=$(grep -c '"id":' kb/assets/manifest.json || echo "0")
    echo -e "${GREEN}✓${NC} Manifest file exists ($MANIFEST_ASSETS assets)"
else
    echo -e "${YELLOW}⚠${NC} Manifest file not found: kb/assets/manifest.json"
    WARNINGS=$((WARNINGS + 1))
fi

# Check for large images (>5MB)
echo ""
echo "📏 Checking image sizes..."
LARGE_IMAGES=$(find public/kb-assets -type f \( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" \) -size +5M 2>/dev/null | wc -l | tr -d ' ')
if [ "$LARGE_IMAGES" -gt 0 ]; then
    echo -e "${YELLOW}⚠${NC} Found $LARGE_IMAGES large images (>5MB). Consider optimizing:"
    find public/kb-assets -type f \( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" \) -size +5M -exec ls -lh {} \; | awk '{print "  - " $9 " (" $5 ")"}'
    WARNINGS=$((WARNINGS + 1))
else
    echo -e "${GREEN}✓${NC} No excessively large images found"
fi

# Check if tool registry is built
echo ""
echo "🔧 Checking tool registry..."
if [ -f "tools/tool_registry.json" ]; then
    echo -e "${GREEN}✓${NC} Tool registry exists"
else
    echo -e "${YELLOW}⚠${NC} Tool registry not found. Will be built during deployment."
    WARNINGS=$((WARNINGS + 1))
fi

# Check Node version
echo ""
echo "🟢 Checking Node version..."
NODE_VERSION=$(node -v 2>/dev/null || echo "not found")
REQUIRED_VERSION="v20"
if [[ "$NODE_VERSION" == v2* ]] || [[ "$NODE_VERSION" == v21* ]] || [[ "$NODE_VERSION" == v22* ]]; then
    echo -e "${GREEN}✓${NC} Node version: $NODE_VERSION"
else
    echo -e "${RED}✗${NC} Node version $NODE_VERSION detected. Requires Node $REQUIRED_VERSION or higher"
    ERRORS=$((ERRORS + 1))
fi

# Check if .env.example exists (for reference)
echo ""
echo "🔐 Checking environment setup..."
if [ -f ".env.example" ] || [ -f ".env.local.example" ]; then
    echo -e "${GREEN}✓${NC} Environment example file found"
else
    echo -e "${YELLOW}⚠${NC} No .env.example file found"
    WARNINGS=$((WARNINGS + 1))
fi

# Check git status
echo ""
echo "📦 Checking git status..."
if [ -d ".git" ]; then
    UNCOMMITTED=$(git status --porcelain | wc -l | tr -d ' ')
    if [ "$UNCOMMITTED" -eq 0 ]; then
        echo -e "${GREEN}✓${NC} All changes committed"
    else
        echo -e "${YELLOW}⚠${NC} $UNCOMMITTED uncommitted changes found"
        echo "  Consider committing before deploying:"
        git status --short | head -5 | sed 's/^/    /'
        WARNINGS=$((WARNINGS + 1))
    fi
else
    echo -e "${YELLOW}⚠${NC} Not a git repository"
    WARNINGS=$((WARNINGS + 1))
fi

# Check if build works locally
echo ""
echo "🏗️  Testing build..."
if npm run build:tools > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Tool build successful"
else
    echo -e "${RED}✗${NC} Tool build failed. Run 'npm run build:tools' to see errors"
    ERRORS=$((ERRORS + 1))
fi

# Summary
echo ""
echo "=========================="
echo "📊 Summary"
echo "=========================="
echo -e "Errors: ${RED}$ERRORS${NC}"
echo -e "Warnings: ${YELLOW}$WARNINGS${NC}"
echo ""

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Ready to deploy!"
    echo ""
    echo "Next steps:"
    echo "  1. Frontend: git push origin main (auto-deploys to Vercel)"
    echo "  2. Voice Server: cd voice-server && railway up"
    echo ""
    echo "See DEPLOYMENT_GUIDE.md for detailed instructions."
    exit 0
else
    echo -e "${RED}✗${NC} Please fix errors before deploying"
    exit 1
fi
