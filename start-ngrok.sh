#!/bin/bash

echo "🚀 Starting Data Platform with ngrok..."
echo ""

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "❌ ngrok not installed. Installing..."
    brew install ngrok
fi

# Check if authenticated
if ! ngrok config check &> /dev/null; then
    echo ""
    echo "⚠️  ngrok not authenticated!"
    echo "1. Sign up at: https://dashboard.ngrok.com/signup"
    echo "2. Get your auth token: https://dashboard.ngrok.com/get-started/your-authtoken"
    echo "3. Run: ngrok config add-authtoken YOUR_TOKEN"
    echo ""
    exit 1
fi

echo "✅ ngrok is ready"
echo ""
echo "📋 Instructions:"
echo "1. This terminal will show your ngrok URLs"
echo "2. Open a NEW terminal and run: cd backend && source ./venv-platform/bin/activate && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
echo "3. Wait for backend to start, then press ENTER here..."
read

echo ""
echo "🌐 Starting ngrok tunnel for backend..."
echo ""
echo "Your ngrok URL will appear below:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ngrok http 8000
