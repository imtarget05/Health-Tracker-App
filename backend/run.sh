#!/bin/bash

# Health Tracker - Quick Start Script
# Hướng dẫn chạy ứng dụng Health Tracker

echo "=========================================="
echo "🚀 Health Tracker Application"
echo "=========================================="
echo ""

# Kiểm tra Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not installed"
    echo "📥 Please install Node.js from https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js: $(node --version)"
echo "✅ npm: $(npm --version)"
echo ""

# Kiểm tra .env
if [ ! -f ".env" ]; then
    echo "❌ .env file not found"
    echo "📝 Please run: cp .env.example .env"
    exit 1
fi

echo "✅ .env file exists"
echo ""

# Kiểm tra node_modules
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies (npm install)..."
    npm install
    echo ""
fi

echo "=========================================="
echo "Available Commands:"
echo "=========================================="
echo ""
echo "1️⃣  Development Mode (Recommended)"
echo "   npm run dev"
echo ""
echo "2️⃣  Production Mode"
echo "   npm start"
echo ""
echo "3️⃣  Run Tests"
echo "   npm test"
echo ""
echo "4️⃣  Run with Docker"
echo "   docker build -t health-tracker:latest ."
echo "   docker run -p 5001:5001 --env-file .env health-tracker:latest"
echo ""
echo "=========================================="
echo "API Documentation:"
echo "=========================================="
echo ""
echo "Health Check:        http://localhost:5001/api/health"
echo "API Endpoints:       http://localhost:5001/api"
echo "Prometheus Metrics:  http://localhost:5001/metrics"
echo ""
echo "=========================================="
echo ""
echo "Which option would you like to run?"
echo "Enter (1-4): "
read choice

case $choice in
  1)
    echo "🔧 Starting in Development Mode..."
    npm run dev
    ;;
  2)
    echo "🚀 Starting in Production Mode..."
    npm start
    ;;
  3)
    echo "🧪 Running Tests..."
    npm test
    ;;
  4)
    echo "🐳 Building Docker Image..."
    docker build -t health-tracker:latest .
    echo "✅ Image built. To run:"
    echo "   docker run -p 5001:5001 --env-file .env health-tracker:latest"
    ;;
  *)
    echo "❌ Invalid option"
    exit 1
    ;;
esac
