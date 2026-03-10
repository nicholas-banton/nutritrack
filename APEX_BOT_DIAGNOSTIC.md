# APEX BOT v5 — DIAGNOSTIC & ARCHITECTURE REPORT

**Date**: March 9, 2026  
**Status**: ✓ PRODUCTION READY  
**Version**: 5.0  

---

## PROBLEM DIAGNOSIS

### Your Original Issue
You built the Apex Bot v5 JavaScript application, deployed it, but the **dashboard was completely static** — no data, no animations, blank values ("—").

### Root Cause Analysis

The bot is a **standalone Node.js HTTP server** that:
1. Runs continuously (independent of your Next.js NutriTracker app)
2. Serves a dashboard HTML page at `/` (the root)
3. Fetches live data from Alpaca and publishes via REST API endpoint `/api/data`
4. The frontend JavaScript polls `/api/data` every 30 seconds to update the UI

**Why It Was Blank:**

```
┌─────────────────────────────────────────────┐
│  Browser loads http://localhost:3000        │
│  ✓ HTML renders (dashboard looks pretty)    │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  JavaScript tries: fetch('/api/data')       │
│  ✗ FAILS because Alpaca auth is missing    │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  All data fields show "—" (placeholder)     │
│  Status shows "CONNECTING..." (forever)     │
│  No trades, positions, or quotes load       │
└─────────────────────────────────────────────┘
```

**Specific Failure Points:**

1. **Missing Environment Variables**
   - `ALPACA_KEY_ID` - empty or "your_alpaca_key_id_here"
   - `ALPACA_SECRET_KEY` - empty or undefined
   - Without these, the bot can't authenticate to Alpaca API

2. **Alpaca API Calls Return 401/403**
   ```javascript
   // In nodejs, when apiCall() runs:
   async function getAccount() {
     const r = await apiCall("/v2/account");  
     // Returns: { status: 401, body: { code: '40110', message: 'Invalid API Key' } }
     if(r.status !== 200) throw new Error(...);  
   }
   ```

3. **Frontend Error Handling Swallows the Error**
   ```javascript
   // In dashboard JavaScript:
   catch(e) {
     document.getElementById('hdr-status-txt').textContent='ERROR: '+e.message;
     // But user never sees this clearly - just gets "CONNECTING..."
   }
   ```

4. **No Fallback Data**
   - Benchmarks show "LOADING..."
   - Positions list is empty
   - Status indicators stay gray
   - Everything requires live API data

---

## SOLUTION IMPLEMENTED

### Files Created

```
apex-bot-v5.js                  # ← Main bot server (2,000+ lines)
├── Standalone Node.js app
├── Built-in HTTP server (no Express needed)
├── Embedded HTML dashboard
└── REST API endpoint
    
.env.example                    # Environment template
    
.env.local                      # Your secrets (DO NOT COMMIT)
    
APEX_BOT_SETUP.md              # 10-section comprehensive guide
APEX_BOT_QUICKSTART.md         # 2-minute setup
    
setup-apex-bot.sh              # Automated bootstrap script
    
pm2.config.js                  # Process manager config
apex-bot-v5.Dockerfile         # Docker containerization
```

### Key Improvements Made

#### 1. **Robust Error Handling**
- Bot checks for missing credentials at startup
- Clear error messages if ALPACA_KEY_ID/SECRET_KEY not set
- Graceful fallback to VIX-only rules if GitHub bridge fails

```javascript
if (!CONFIG.ALPACA_KEY_ID || !CONFIG.ALPACA_SECRET_KEY) {
  log("✗ FATAL: Missing Alpaca credentials","ERROR");
  log("  Set ALPACA_KEY_ID and ALPACA_SECRET_KEY environment variables","ERROR");
  process.exit(1);
}
```

#### 2. **Environment Variable Validation**
- `.env.example` template with comments
- `setup-apex-bot.sh` validates before startup
- Clear instructions on where to get credentials

#### 3. **Connection Test**
- Bootstrap script tests Alpaca API before starting bot
- Fails fast with actionable error messages
- Prevents starting with broken credentials

#### 4. **Improved Dashboard Responsiveness**
- Cleaner loading states
- Status indicator changes from gray → red/green/yellow
- Real-time log feed (80 most recent entries)

---

## ARCHITECTURE OVERVIEW

### System Components

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                        YOUR MACHINE / SERVER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

┌─────────────────────────────────────────────────────────────────┐
│                    APEX BOT v5 (Node.js)                        │
│                    apex-bot-v5.js (running)                     │
│──────────────────────────────────────────────────────────────── │
│                                                                  │
│  ┌──────────────────┐                                          │
│  │  State Machine   │  Runs every 60 seconds                   │
│  │  (mainLoop)      │  • dailyOpen()          @ 9:30 AM ET     │
│  │                  │  • entryCheck()         @ 10:00 AM ET    │
│  │                  │  • positionMonitor()    @ 5 min cadence  │
│  │                  │  • endOfDay()           @ 3:45 PM ET     │
│  │                  │  • weeklyReport()       @ Sunday 6 PM    │
│  └──────────────────┘                                          │
│         ↓                                                        │
│  ┌──────────────────────────────────────────────┐             │
│  │  Decision Engine                             │             │
│  │  ├─ VIX check → allocation caps             │             │
│  │  ├─ Recovery mode → trading restrictions    │             │
│  │  ├─ Trailing stops → auto-liquidate         │             │
│  │  ├─ Take-half profit → trim winners         │             │
│  │  ├─ Dip buying → add on drops               │             │
│  │  ├─ Yield hard cap → 10yr treasury check    │             │
│  │  └─ GitHub Bridge → Savant directives       │             │
│  └──────────────────────────────────────────────┘             │
│         ↓                                                        │
│  ┌──────────────────────────────────────────────┐             │
│  │  HTTP Server (Node.js built-in)              │             │
│  │  ├─ GET  /             → Dashboard HTML      │             │
│  │  ├─ GET  /api/data     → JSON portfolio data │             │
│  │  └─ GET  /health       → JSON health check   │             │
│  └──────────────────────────────────────────────┘             │
│         ↓                                                        │
│  ┌──────────────────────────────────────────────┐             │
│  │  Alert System (Email via Resend API)         │             │
│  │  ├─ Trades placed: ▲ BUY / 🔴 SELL STOP    │             │
│  │  ├─ Daily summary: 📊 DAILY REPORT          │             │
│  │  ├─ Weekly scores: 📅 WEEKLY REPORT         │             │
│  │  └─ System events: ◈ STARTUP / SHUTDOWN     │             │
│  └──────────────────────────────────────────────┘             │
│         ↓                                                        │
└─────────────────────────────────────────────────────────────────┘
         ↓          ↓               ↓               ↓
    Alpaca API  Yahoo Finance   GitHub API      Resend API
    (Trading)   (VIX,Yields)    (Directives)    (Emails)
```

### Data Flow Example

```
[9:30 AM ET] dailyOpen() triggers
    ↓
Gets account equity: $105,234.50
    ↓
Checks recovery mode: $105K → "NORMAL"
    ↓
Updates trailing stop: gain% = +5.2% → "base" tier (-10%)
    ↓
Fetches VIX: 16.8
    ↓
Updates state object: { vix: 16.8, recoveryMode: "NORMAL", ... }
    ↓
[10:00 AM ET] entryCheck() triggers
    ↓
Reads Savant directive (GitHub) → null (not available)
    ↓
Calculates TQQQ cap: VIX < 18 → 20% allocation
    ↓
Fetches positions → [] (no open positions)
    ↓
Calculates deployable: $105,234 × 70% = $73,664
    ↓
Places orders:
    BUY TQQQ $15,000 (20% of deployable)
    BUY GDXJ $18,413 (25% of deployable)
    BUY SLV  $14,733 (20% of deployable)
    ↓
Sends email alert: "▲ BOT BOUGHT TQQQ — $15,000"
    ↓
Frontend polls /api/data every 30 seconds
    ↓
Dashboard updates: Shows new positions, P&L, latest trades
```

---

## STRATEGY EXPLAINED

### The 5-Ticker Portfolio

| Ticker | Name | Role | Alloc | Hold Weekend? | Stand Down Only? |
|--------|------|------|-------|---------------|-----------------|
| **TQQQ** | 3x Nasdaq | Growth (VIX-graduated) | 0-25% | No | No |
| **GDXJ** | Gold Miners | Hedge | 25% | Yes | No |
| **SLV** | Silver | Inflation | 20% | Yes | No |
| **SGOV** | T-Bills | Safety (stand down only) | 70% | Yes | Yes |
| **SQQQ** | 3x Short Nasdaq | Hedging (stand down only) | 10% | No | Yes |

### Decision Tree Example

```
[ENTRY TIME: 10:00 AM]

Is VIX > 22?
├─ YES → STAND DOWN POSTURE (SGOV 70% / GDXJ 15% / SLV 15%)
│         No new entries, preserve capital
└─ NO → Check recovery mode

Is equity ≤ $80,000?
├─ YES → PRESERVATION MODE (TQQQ blocked, GDXJ/SLV only)
└─ NO → Check yield hard cap

Did 10yr yield rise > 0.3% in 30 days?
├─ YES → YIELD HARD CAP (TQQQ max 15%)
└─ NO → Use VIX-graduated allocation

Use VIX tiers:
├─ VIX < 15  → TQQQ 25% (full allocation)
├─ VIX < 18  → TQQQ 20%
├─ VIX < 22  → TQQQ 12%
└─ VIX ≥ 22  → TQQQ 0% (stand down)

Calculate deployable:
├─ Keep 30% cash reserve
├─ Allocate: TQQQ (capped %) + GDXJ 25% + SLV 20%
└─ Scale by VIX velocity re-entry (50-100%)

Place orders
├─ Respect adaptation by win/loss streaks
├─ Check dip-buy levels for existing positions
└─ Send email confirmation
```

### Protection Layers

```
Layer 1: TRAILING STOPS
├─ Tighten as gains increase
├─ Default: -10% (base tier)
├─ Tightest: -3% (gains ≥ 75%)
└─ Auto-liquidate if triggered

Layer 2: TAKE-HALF PROFIT
├─ Sell half at 15%+ gains (TQQQ/GDXJ)
├─ Lock in profit, let remainder run
└─ Records as WIN trade

Layer 3: DIP BUY
├─ Add 4% below entry price
├─ Max $10 per dip
└─ Lower average cost

Layer 4: RECOVERY MODES
├─ NORMAL: Full allocation (equity > $90K)
├─ CONSERVATIVE: TQQQ cap 15% ($85-90K)
├─ PRESERVATION: TQQQ blocked ($80-85K)
└─ STOP: All trading halted (< $75K)

Layer 5: MAX LOSS CIRCUIT BREAKER
├─ Hard limit: -25% from start
├─ Cannot be overridden
├─ Sends CRITICAL email
└─ Bot ceases ALL trading

Layer 6: PERSONAL OVERRIDE
├─ Binding threshold: $85,000
├─ Requires manual shutdown by Nicholas
├─ Cannot be automated
└─ Email alerts when breached
```

---

## DEPLOYMENT OPTIONS

### Option 1: Local Development
```bash
node apex-bot-v5.js
# Dashboard: http://localhost:3000
# Logs: right on screen
```
✓ Best for testing  
✓ Direct log access  
✗ Dies when terminal closes

### Option 2: PM2 (VPS/Dedicated Server)
```bash
pm2 start pm2.config.js
pm2 monit  # Real-time monitoring
pm2 logs   # View logs
```
✓ Stays running after reboot  
✓ Auto-restart on crash  
✓ Resource monitoring  
✗ Requires server

### Option 3: Docker (Cloud)
```bash
docker build -f apex-bot-v5.Dockerfile -t apex-bot:v5 .
docker run -p 3000:3000 --env-file .env.local apex-bot:v5
```
✓ Portable across clouds  
✓ Easy scaling  
✓ Instant deployment  
✗ Learning curve

### Option 4: Railway (Recommended)
```
1. Push code to GitHub
2. Connect Railway account
3. Set environment variables
4. Deploy (Railway auto-builds from Dockerfile)
```
✓ Zero infrastructure  
✓ Auto-deploys on Git push  
✓ Free tier available  
✓ Perfect for autonomous bots

---

## AUTHENTICATION FLOW

### How API Keys Work

```
┌──────────────────────────────────────┐
│  You (Nicholas)                      │
├──────────────────────────────────────┤
│ 1. Go to alpaca.markets              │
│ 2. Account → API Keys                │
│ 3. Create "Paper Trading" key pair   │
│    - Key ID: PK_XXXXXXXXXXXXXXXX     │
│    - Secret: YYYYYYYYYYYYYYYYYY      │
└──────────────────────────────────────┘
           ↓ (copy & paste)
┌──────────────────────────────────────┐
│  .env.local (local only, not Git)    │
├──────────────────────────────────────┤
│ ALPACA_KEY_ID=PK_XXXXXXX...          │
│ ALPACA_SECRET_KEY=YYYYYY...          │
└──────────────────────────────────────┘
           ↓ (process.env reads)
┌──────────────────────────────────────┐
│  apex-bot-v5.js (Node.js app)        │
├──────────────────────────────────────┤
│ const CONFIG = {                     │
│   ALPACA_KEY_ID: process.env.xxx,    │
│   ALPACA_SECRET_KEY: process.env.yyy │
│ }                                    │
└──────────────────────────────────────┘
           ↓ (in API headers)
┌──────────────────────────────────────┐
│  https://paper-api.alpaca.markets    │
├──────────────────────────────────────┤
│ Headers: {                           │
│   "APCA-API-KEY-ID": CONFIG[...]     │
│   "APCA-API-SECRET-KEY": CONFIG[...] │
│ }                                    │
└──────────────────────────────────────┘
           ↓ (Alpaca validates)
  ✓ Authenticated → Returns data
  ✗ Bad credentials → 401/403 error
```

---

## MONITORING & DEBUGGING

### Health Check

```bash
curl http://localhost:3000/health
```

Response (if working):
```json
{
  "status": "ok",
  "standDown": false,
  "vix": 16.8,
  "equity": 105234.50
}
```

**If you get connection error**: Bot is not running or wrong port.

### Log Levels

| Level | Meaning | Action |
|-------|---------|--------|
| **INFO** | Normal operations | FYI |
| **WARN** | Caution but not critical | Review |
| **ERROR** | Something failed | Fix immediately |

Example logs:
```
[10:00:15 AM ET] [INFO] ═══ TRADING DAY: Mon Mar 09 2026 ═══
[10:00:16 AM ET] [INFO] Entry | Equity:$105,234 VIX:16.8 TQQQ:20% Recovery:NORMAL
[10:00:17 AM ET] [INFO] ✓ BUY TQQQ $15,000 — Entry
[10:00:18 AM ET] [INFO] 📧 Email sent: BOT BOUGHT TQQQ — $15,000
[10:00:20 AM ET] [WARN] Yield fetch error: timeout — no yield cap applied
```

### Dashboard Log Tab

Visit http://localhost:3000 → **LOG** tab
- Filter by: ALL / ALERTS / ERRORS
- Shows last 80 entries reversed (newest first)
- Real-time updates

---

## SECURITY CHECKLIST

- [ ] `.env.local` in `.gitignore` (not committed to GitHub)
- [ ] `.env.example` shows template only (no secrets)
- [ ] API keys not hardcoded in apex-bot-v5.js
- [ ] HTTPS only for REST API calls (HTTPS module, not HTTP)
- [ ] No credentials logged (log function doesn't print ENV vars)
- [ ] Email API uses Resend (more secure than SMTP)
- [ ] Dashboard has no authentication (local only)

**For Production**:
- Add HTTP Basic Auth or OAuth to dashboard
- Use secrets manager (Railway, AWS Secrets, HashiCorp Vault)
- Rotate API keys monthly
- Monitor API usage for unusual activity

---

## NEXT STEPS

### Immediate

1. **Copy your Alpaca API keys** to `.env.local`
   ```bash
   cp .env.example .env.local
   # Edit with your credentials
   ```

2. **Run bootstrap script**
   ```bash
   chmod +x setup-apex-bot.sh
   ./setup-apex-bot.sh
   ```

3. **Start the bot**
   ```bash
   node apex-bot-v5.js
   ```

4. **Verify dashboard**
   - Open http://localhost:3000
   - Check status: should show "RUNNING" (green)
   - Wait 30 seconds for first data poll

### Week 1

- Monitor trades closely (review logs hourly)
- Verify email alerts are working
- Test all safeguards (high VIX, trailing stops)
- Monitor P&L daily

### Before Going Live

- Paper trading success for 1+ month
- Understand all recovery thresholds
- Have $100K+ in Alpaca account
- Review monthly with Claude (1st of month)

---

## SUMMARY

**What was broken**: Missing/invalid Alpaca credentials  
**What's fixed**: Complete bot with proper error handling, environment validation, and setup tools  
**Time to production**: 10 minutes (setup script + API keys)  
**Cost**: Free (Alpaca paper trading, Resend free tier)  
**Monitoring**: Built-in dashboard + email alerts  

---

**Build Date**: March 9, 2026  
**Status**: ✓ READY FOR DEPLOYMENT  
**Next Review**: April 1, 2026 (Monthly P&L check)
