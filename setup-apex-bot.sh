#!/bin/bash
# ═══════════════════════════════════════════════════════════
# APEX BOT v5 BOOTSTRAP SCRIPT
# ═══════════════════════════════════════════════════════════

set -e

echo "◈◈◈ APEX BOT v5 SETUP ◈◈◈"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "✗ Node.js not found. Install from https://nodejs.org (v16+)"
    exit 1
fi
echo "✓ Node.js $(node -v)"

# Check env.local
if [ ! -f .env.local ]; then
    echo "⚠ .env.local not found. Creating from template..."
    cp .env.example .env.local
    echo "✓ Created .env.local"
    echo ""
    echo "⚠️  NEXT STEPS:"
    echo "1. Edit .env.local with your Alpaca credentials"
    echo "2. Go to https://alpaca.markets → Account → API Keys"
    echo "3. Copy your Key ID and Secret Key"
    echo "4. Run this script again"
    echo ""
    exit 1
fi

# Validate env vars
if grep -q "your_alpaca_key_id_here" .env.local; then
    echo "✗ ALPACA_KEY_ID not set in .env.local"
    exit 1
fi
if grep -q "your_alpaca_secret_key_here" .env.local; then
    echo "✗ ALPACA_SECRET_KEY not set in .env.local"
    exit 1
fi
echo "✓ Environment variables configured"

# Test API connection
echo ""
echo "Testing Alpaca API connection..."
node -e "
  require('dotenv').config({ path: '.env.local' });
  const https = require('https');
  const opts = {
    hostname: 'paper-api.alpaca.markets',
    path: '/v2/account',
    method: 'GET',
    headers: {
      'APCA-API-KEY-ID': process.env.ALPACA_KEY_ID,
      'APCA-API-SECRET-KEY': process.env.ALPACA_SECRET_KEY
    }
  };
  const req = https.request(opts, (res) => {
    if (res.statusCode === 200) {
      console.log('✓ Alpaca API authentication successful');
      process.exit(0);
    } else {
      console.error('✗ Alpaca API error:', res.statusCode);
      process.exit(1);
    }
  });
  req.on('error', (e) => {
    console.error('✗ Connection error:', e.message);
    process.exit(1);
  });
  req.end();
" || {
    echo "✗ Alpaca API test failed"
    echo "  Check ALPACA_KEY_ID and ALPACA_SECRET_KEY in .env.local"
    exit 1
}

# Create logs directory
mkdir -p logs
echo "✓ Created logs directory"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "✓ Setup complete! Bot is ready to start."
echo "═══════════════════════════════════════════════════════"
echo ""
echo "START OPTIONS:"
echo ""
echo "1. Local development (immediate output):"
echo "   node apex-bot-v5.js"
echo ""
echo "2. Using PM2 (background process):"
echo "   npm install -g pm2"
echo "   pm2 start pm2.config.js"
echo "   pm2 monit"
echo ""
echo "3. Docker:"
echo "   docker build -f apex-bot-v5.Dockerfile -t apex-bot:v5 ."
echo "   docker run -p 3000:3000 --env-file .env.local apex-bot:v5"
echo ""
echo "Dashboard: http://localhost:3000"
echo ""
