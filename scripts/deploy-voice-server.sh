#!/bin/bash

# Railway Deployment Script for Voice Server
# This script helps automate the Railway deployment process for the Voice Server

set -e

echo "🚀 FRAM Voice Server - Railway Deployment Helper"
echo "=================================================="
echo ""

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI is not installed."
    echo "   Install it with: npm install -g @railway/cli"
    exit 1
fi

# Navigate to voice-server directory
cd "$(dirname "$0")/../voice-server" || exit 1

echo "📁 Current directory: $(pwd)"
echo ""

# Check if already linked to Railway
if [ -f ".railway" ]; then
    echo "✅ Already linked to Railway project"
    echo ""
    read -p "Do you want to continue with deployment? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Deployment cancelled."
        exit 0
    fi
else
    echo "🔗 Not linked to Railway project yet"
    echo ""
    echo "Step 1: Login to Railway"
    railway login
    
    echo ""
    echo "Step 2: Initialize Railway project"
    echo "   When prompted, name your project: FRAM-WEBSITE-G-LIVE-API"
    railway init
    
    echo ""
    echo "Step 3: Link to Railway project"
    railway link
fi

echo ""
echo "📋 Environment Variables Setup"
echo "=============================="
echo ""
echo "You need to set the following environment variables:"
echo ""
echo "Required:"
echo "  - GEMINI_API_KEY (for AI Studio) OR"
echo "  - VERTEXAI_PROJECT + VERTEXAI_LOCATION (for Vertex AI)"
echo "  - ALLOWED_ORIGINS (comma-separated, no spaces)"
echo ""
echo "Optional:"
echo "  - PORT (Railway auto-assigns this)"
echo ""

read -p "Do you want to set environment variables now? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "Setting up environment variables..."
    echo ""
    
    # Ask for API key type
    echo "Choose authentication method:"
    echo "1) Vertex AI (Recommended for Live API)"
    echo "2) Google AI Studio API Key"
    read -p "Enter choice (1 or 2): " auth_choice
    
    if [ "$auth_choice" = "1" ]; then
        read -p "Enter VERTEXAI_PROJECT: " vertex_project
        read -p "Enter VERTEXAI_LOCATION [us-central1]: " vertex_location
        vertex_location=${vertex_location:-us-central1}
        
        railway variables set VERTEXAI_PROJECT="$vertex_project"
        railway variables set VERTEXAI_LOCATION="$vertex_location"
    else
        read -p "Enter GEMINI_API_KEY: " gemini_key
        railway variables set GEMINI_API_KEY="$gemini_key"
    fi
    
    echo ""
    read -p "Enter ALLOWED_ORIGINS (comma-separated, e.g., http://localhost:3000,https://your-domain.com): " allowed_origins
    railway variables set ALLOWED_ORIGINS="$allowed_origins"
    
    echo ""
    echo "✅ Environment variables set"
fi

echo ""
echo "🔍 Verifying environment variables..."
railway variables

echo ""
read -p "Ready to deploy? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "🚀 Deploying to Railway..."
    railway up
    
    echo ""
    echo "✅ Deployment complete!"
    echo ""
    echo "📡 Getting your Railway domain..."
    railway domain
    
    echo ""
    echo "🧪 Testing health endpoint..."
    DOMAIN=$(railway domain 2>/dev/null | grep -o 'https://[^ ]*' | head -1 | sed 's|https://||')
    if [ -n "$DOMAIN" ]; then
        echo "Testing: https://$DOMAIN/health"
        curl -s "https://$DOMAIN/health" | jq . || echo "Health check response received"
    fi
    
    echo ""
    echo "📊 View logs with: railway logs"
    echo "🌐 Your WebSocket URL: wss://$DOMAIN"
    echo ""
    echo "✨ Don't forget to update NEXT_PUBLIC_VOICE_SERVER_URL in your Next.js app!"
else
    echo "Deployment cancelled."
fi
