# APEX BOT v5 — SETUP & DEPLOYMENT GUIDE

## ⚠️ BEFORE YOU START

**This is an autonomous trading bot.** It will trade with real money if configured for live mode. Start with **PAPER TRADING** to test.

---

## 1. ENVIRONMENT SETUP

### Step 1: Create `.env.local` file

Copy the template and add your credentials:

```bash
cp .env.example .env.local
```

### Step 2: Get Alpaca API Credentials

1. Go to https://alpaca.markets
2. Sign up or login
3. Navigate to **Account → API Keys**
4. Create a new API key
5. Copy `Key ID` → `ALPACA_KEY_ID`
6. Copy `Secret Key` → `ALPACA_SECRET_KEY`

### Step 3: Edit `.env.local`

```env
# Paper trading (STRONGLY RECOMMENDED for testing)
ALPACA_PAPER=true

# Your API credentials
ALPACA_KEY_ID=PK_XXXXXXXXXXXXXX
ALPACA_SECRET_KEY=XXXXXXXXXXXXXX

# Email notifications (optional, but highly recommended)
RESEND_KEY=re_XXXXXXXXXXXXXX  # Get from https://resend.com (free: 3000/month)

# GitHub Bridge (optional, for Savant directive integration)
GITHUB_TOKEN=ghp_XXXXXXXXXXXXXX  # GitHub personal access token
GITHUB_GIST_ID=abc123def456  # Gist ID with apex-directive.json

# Server
PORT=3000
NODE_ENV=development
```

**⚠️ SECURITY**: Never commit `.env.local` to Git. Add to `.gitignore`.

---

## 2. RUNNING THE BOT

### LOCAL DEVELOPMENT

```bash
# Install dependencies (if needed)
npm install

# Run the bot
node apex-bot-v5.js
```

Dashboard available at: **http://localhost:3000**

### Verify Connection

1. Visit http://localhost:3000
2. Status should show:
   - ✓ "RUNNING" (green)
   - Current equity balance
   - VIX data loading
   - Recent trades/log entries

---

## 3. PRODUCTION DEPLOYMENT (Railway/Heroku/AWS)

### Option A: Railway (Recommended)

1. **Connect GitHub**:
   - Push code to GitHub
   - Go to https://railway.app
   - Select repo and deploy

2. **Set Environment Variables** in Railway dashboard:
   ```
   ALPACA_KEY_ID=xxx
   ALPACA_SECRET_KEY=xxx
   ALPACA_PAPER=true
   RESEND_KEY=xxx
   PORT=3000
   ```

3. **Deploy**: Railway auto-deploys on Git push

### Option B: Docker (Any Cloud)

```bash
# Create Dockerfile
docker build -t apex-bot:v5 .
docker run -p 3000:3000 \
  -e ALPACA_KEY_ID=xxx \
  -e ALPACA_SECRET_KEY=xxx \
  -e ALPACA_PAPER=true \
  apex-bot:v5
```

### Option C: PM2 (VPS/Local Server)

```bash
# Install PM2
npm install -g pm2

# Start bot
pm2 start apex-bot-v5.js --name "apex-bot"

# Monitor
pm2 monit

# Restart on server reboot
pm2 startup
pm2 save
```

---

## 4. TROUBLESHOOTING

| Issue | Solution |
|-------|----------|
| Dashboard shows "CONNECTING..." | Check ALPACA_KEY_ID & SECRET_KEY are correct |
| 401 Unauthorized | Verify API credentials in Alpaca dashboard |
| No positions/data | Ensure market is open (9:30 AM–4:00 PM ET, Monday–Friday) |
| Emails not sending | Set RESEND_KEY from https://resend.com |
| Bot won't start | Check Node.js version (`node -v`, requires v14+) |

---

## 5. MONITORING & ALERTS

### Daily Alerts via Email

The bot sends automated alerts for:
- **Startup**: Bot online confirmation
- **Trades**: Buy/sell orders placed
- **Stops**: Trailing stops triggered
- **End of Day**: Daily P&L summary
- **Weekly**: Sunday 6 PM ET performance report

Set your email in the code:
```javascript
EMAIL: "your_email@gmail.com",
```

### Log Access

- Local: Check console output or http://localhost:3000 (LOG tab)
- Production: Check deployment logs (Railway/Heroku/AWS)

---

## 6. STRATEGY CONFIGURATION

### Allocation Settings

Edit `CONFIG` in apex-bot-v5.js:

```javascript
MAX_LOSS_PCT: 0.25,           // Hard stop: -25% from start
CASH_RESERVE_PCT: 0.30,       // Always keep 30% in cash
DIP_BUY_DROP: 0.04,           // Buy dips at 4% below entry
HIGH_VIX: 22,                 // Stand down above 22
WEEKEND_VIX: 18,              // Sell Friday if VIX > 18
```

### VIX-Graduated TQQQ Allocation

```javascript
TQQQ_VIX_TIERS: [
  { maxVix: 15,  alloc: 0.25 },  // VIX < 15  → 25% TQQQ
  { maxVix: 18,  alloc: 0.20 },  // VIX < 18  → 20% TQQQ
  { maxVix: 22,  alloc: 0.12 },  // VIX < 22  → 12% TQQQ
  { maxVix: 999, alloc: 0.00 },  // VIX > 22  → 0% TQQQ (STAND DOWN)
],
```

### Recovery Mode Thresholds

```javascript
RECOVERY_CONSERVATIVE: 90000,  // TQQQ capped at 15%
RECOVERY_PRESERVATION:  80000, // TQQQ blocked
RECOVERY_STOP:          75000, // All trading halted
PERSONAL_THRESHOLD:     85000, // Manual intervention required
```

---

## 7. LIVE TRADING CHECKLIST

Before switching to **LIVE MODE** (change `ALPACA_PAPER=false`):

- [ ] Tested thoroughly in paper mode (1+ week)
- [ ] Verified all environment variables
- [ ] Email notifications working
- [ ] Understand recovery thresholds
- [ ] Have $100K+ in Alpaca account
- [ ] Monitor first trades closely (review logs hourly)
- [ ] Set up alerts on your phone

**⚠️ YOU HAVE BEEN WARNED**: Live mode trades REAL money.

---

## 8. SUPPORT & DEBUGGING

### Enable Debug Logging

Access logs at: **http://localhost:3000** → **LOG tab**

Recent entries show:
- API calls to Alpaca
- Trade decisions (VIX, recovery mode, yield cap)
- Email sending status
- Performance metrics

### API Health Check

```bash
curl http://localhost:3000/health
```

Response:
```json
{
  "status": "ok",
  "standDown": false,
  "vix": 18.5,
  "equity": 105234.50
}
```

---

## 9. FILE STRUCTURE

```
apex-bot-v5.js          # Main bot server (Node.js)
.env.example            # Environment template
.env.local              # Your secrets (add to .gitignore)
apex-bot-v5.Dockerfile  # Docker config (optional)
pm2.config.js           # PM2 process manager (optional)
```

---

## 10. MONTHLY REVIEW

On the **1st of each month**, Nicholas sends a summary to Claude:
- Portfolio value (Alpaca)
- Fidelity account balance (if applicable)
- Win/loss record
- Strategy adjustments needed

Record in bot logs and email archives.

---

**Last Updated**: March 9, 2026
**Bot Version**: v5
**Status**: Ready for deployment
