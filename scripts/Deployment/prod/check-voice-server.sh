#!/bin/bash

# Quick diagnostic script for Railway Voice Server
# Checks environment variables and deployment status

set -e

echo "🔍 FRAM Voice Server - Railway Diagnostic"
echo "=========================================="
echo ""

cd "$(dirname "$0")/../../../voice-server" || exit 1

# Check Railway CLI
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI is not installed."
    echo "   Install it with: npm install -g @railway/cli"
    exit 1
fi

echo "📋 Checking Railway Project Status..."
railway status

echo ""
echo "📋 Checking Environment Variables..."
echo "===================================="
railway variables 2>&1 || echo "⚠️  Could not list variables (service may not be linked)"

echo ""
echo "🔍 Common Crash Causes:"
echo "======================"
echo ""
echo "1. Missing GEMINI_API_KEY or VERTEXAI_PROJECT"
echo "   → Server exits immediately with error"
echo ""
echo "2. Missing ALLOWED_ORIGINS"
echo "   → Server may start but connections will be rejected"
echo ""
echo "3. Tool registry loading failure"
echo "   → Check Railway logs for import errors"
echo ""
echo "📝 To Fix:"
echo "=========="
echo ""
echo "Option 1: Set via Railway Dashboard"
echo "  1. Go to https://railway.app"
echo "  2. Open project: FRAMDESIGN-LIVEAPI"
echo "  3. Go to Variables tab"
echo "  4. Add required variables:"
echo "     - GEMINI_API_KEY=your-key"
echo "     - ALLOWED_ORIGINS=https://your-vercel-domain.vercel.app,https://framdesign.com"
echo ""
echo "Option 2: Set via Railway CLI (requires service link)"
echo "  railway variables set GEMINI_API_KEY=\"your-key\""
echo "  railway variables set ALLOWED_ORIGINS=\"https://your-domain.com\""
echo ""
echo "Option 3: View logs in Railway Dashboard"
echo "  1. Go to Railway Dashboard → FRAMDESIGN-LIVEAPI"
echo "  2. Click on the service"
echo "  3. Go to Deployments tab"
echo "  4. Click on latest deployment → View Logs"
echo ""
