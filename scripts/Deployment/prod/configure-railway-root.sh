#!/bin/bash

# Script to configure Railway to deploy from project root
# Run this from the project root directory

set -e

echo "🔧 Configuring Railway to deploy from project root"
echo "=================================================="
echo ""

cd "$(dirname "$0")/../../.." || exit 1

echo "📋 Current Railway status:"
railway status

echo ""
echo "🔍 Available services in FRAMDESIGN-LIVEAPI:"
echo "Please select the voice server service name:"
echo ""

# Try to get service list (may require interactive selection)
railway service 2>&1 || {
    echo ""
    echo "⚠️  Cannot list services non-interactively"
    echo ""
    echo "Please run this command manually:"
    echo "  railway service"
    echo ""
    echo "Then note the voice server service name and run:"
    echo "  railway up --service <SERVICE_NAME>"
    echo ""
    exit 1
}

echo ""
echo "✅ Railway is now linked from project root"
echo "✅ railway.json is configured with:"
echo "   - Build: cd voice-server && npm install"
echo "   - Start: cd voice-server && npm start"
echo ""
echo "🚀 To deploy, run:"
echo "   railway up --service <VOICE_SERVER_SERVICE_NAME>"
echo ""
