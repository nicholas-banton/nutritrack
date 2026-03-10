# APEX BOT v5 — QUICK START

## 🚀 Get Running in 2 Minutes

### 1. Setup
```bash
chmod +x setup-apex-bot.sh
./setup-apex-bot.sh
```

This will:
- ✓ Validate Node.js installation
- ✓ Create `.env.local` from template
- ✓ Test Alpaca API connection
- ✓ Create logs directory

### 2. Configure Credentials

Get API keys from https://alpaca.markets → Account → API Keys

Edit `.env.local`:
```env
ALPACA_KEY_ID=PK_your_key_id
ALPACA_SECRET_KEY=your_secret_key
ALPACA_PAPER=true
RESEND_KEY=re_your_email_api_key  # optional
```

### 3. Start Bot

```bash
node apex-bot-v5.js
```

Expected output:
```
[4:32:15 PM ET] [INFO] ◈◈◈ APEX ALPACA BOT v5 STARTING ◈◈◈
[4:32:15 PM ET] [INFO] Mode: PAPER TRADING
[4:32:16 PM ET] [INFO] ✓ Connected | Account: PA123456789 | Starting equity: $100,000.00
[4:32:17 PM ET] [INFO] Status server on port 3000
```

### 4. Open Dashboard

Visit **http://localhost:3000**

✓ Status should show "RUNNING"
✓ Header shows current equity
✓ VIX and recent trades loading

---

## 📊 Dashboard Features

- **ALERTS** - Real-time notifications and thresholds
- **POSITIONS** - Current holdings + P&L
- **PORTFOLIO** - Equity curve, recovery mode, TQQQ cap
- **BENCHMARK** - Performance vs SPY/QQQ/DIA/VTI
- **ORDERS** - Today's trades from Alpaca
- **TRADES** - Win/loss record and streaks
- **STATUS** - System health and schedule
- **RULES** - All bot logic + configuration
- **LOG** - System messages (filter by level)

---

## ⏰ Trading Schedule (ET)

| Time | Action |
|------|--------|
| **9:30 AM** | Daily equity check, recovery mode update |
| **10:00 AM** | Read Savant directive, enter positions |
| **Every 5 min** | Monitor stops, take profits, dip buys |
| **3:45 PM** | Friday rule: sell if VIX > 18 |
| **Sun 6 PM** | Weekly performance report |

---

## 🛡️ Safeguards

| Name | Trigger | Action |
|------|---------|--------|
| Trailing Stop | P&L drops -10% default | Auto-sell |
| Take Profit | Gains 15%+ | Sell half position |
| VIX Stand Down | VIX > 22 | Switch to SGOV/GDXJ/SLV |
| Yield Hard Cap | 10yr yield rises 0.3%+ | TQQQ max 15% |
| Recovery Mode | Portfolio < $90K | TQQQ restrictions |
| Max Loss | Down 25% from start | ALL STOP |
| Personal Alert | Below $85K | Manual intervention required |

---

## 🐛 Troubleshooting

**Dashboard blank/loading forever:**
- Check .env.local has ALPACA_KEY_ID & SECRET_KEY
- Verify API keys at https://alpaca.markets
- Test with: `curl http://localhost:3000/health`

**API 401 Unauthorized:**
- Keys may be expired or incorrect
- Try regenerating at https://alpaca.markets

**"Email skipped":**
- RESEND_KEY not set (optional, non-critical)
- Get free key at https://resend.com

**Bot won't start:**
- Need Node.js v16+
- Check logs for error messages

---

## 📝 Important Notes

- **PAPER MODE ONLY**: Start with `ALPACA_PAPER=true`
- **$100K minimum**: Live trading requires significant capital
- **Market hours**: Trading only Mon-Fri 9:30 AM - 4:00 PM ET
- **Monthly review**: Send Alpaca + Fidelity values to Claude on 1st

---

**Questions?** Check `APEX_BOT_SETUP.md` for full documentation.
