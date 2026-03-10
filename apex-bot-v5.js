#!/usr/bin/env node
// ============================================================
// APEX ALPACA AUTONOMOUS TRADING BOT v5
// Zero external dependencies · Built-in Node.js only
// Trailing stops · VIX-graduated allocation · STAND DOWN posture
// Recovery mode tiers · VIX velocity re-entry · Yield hard cap
// ============================================================

const https = require("https");
const http  = require("http");

// ── CONFIGURATION ────────────────────────────────────────────
const CONFIG = {
  ALPACA_KEY_ID:     process.env.ALPACA_KEY_ID     || "",
  ALPACA_SECRET_KEY: process.env.ALPACA_SECRET_KEY || "",
  ALPACA_BASE_URL:   process.env.ALPACA_PAPER === "true"
                       ? "https://paper-api.alpaca.markets"
                       : "https://api.alpaca.markets",
  EMAIL:             "nicholas.banton@gmail.com",
  PHONE:             "+16102206272",
  GMAIL_USER:        process.env.GMAIL_USER || "nicholas.banton@gmail.com",
  GMAIL_PASS:        process.env.GMAIL_PASS || "",
  RESEND_KEY:        process.env.RESEND_KEY || "",
  SMTP2GO_KEY:       process.env.SMTP2GO_KEY || "",
  MAX_LOSS_PCT:      0.25,
  CASH_RESERVE_PCT:  0.30,   // increased from 20% to accommodate SGOV posture
  DIP_BUY_DROP:      0.04,
  HIGH_VIX:          22,
  WEEKEND_VIX:       18,
  MARKET_OPEN_HOUR:  9,  MARKET_OPEN_MIN:  30,
  ENTRY_HOUR:        10, ENTRY_MIN:         0,
  EXIT_HOUR:         15, EXIT_MIN:          45,
  CLOSE_HOUR:        16, CLOSE_MIN:          0,

  // ── VIX-GRADUATED TQQQ ALLOCATION (Blindspot 1/6) ──────────
  TQQQ_VIX_TIERS: [
    { maxVix: 15,  alloc: 0.25 },
    { maxVix: 18,  alloc: 0.20 },
    { maxVix: 22,  alloc: 0.12 },
    { maxVix: 999, alloc: 0.00 },
  ],

  // ── STAND DOWN POSTURE — capital always working (Blindspot 10) ──
  STAND_DOWN_ALLOC: { SGOV: 0.70, GDXJ: 0.15, SLV: 0.15 },

  // ── RECOVERY MODE TIERS (Blindspot 3) ──────────────────────
  RECOVERY_CONSERVATIVE: 90000,
  RECOVERY_PRESERVATION:  80000,
  RECOVERY_STOP:          75000,

  // ── PERSONAL INTERVENTION THRESHOLD (Blindspot 5) ──────────
  PERSONAL_THRESHOLD:     85000,

  // ── TRAILING STOP TIERS — replaces growth ladder (Blindspot 6) ──
  TRAILING_STOPS: [
    { gainPct: 0.75, label: "+75%", stopPct: 0.03 },
    { gainPct: 0.50, label: "+50%", stopPct: 0.04 },
    { gainPct: 0.30, label: "+30%", stopPct: 0.06 },
    { gainPct: 0.15, label: "+15%", stopPct: 0.08 },
    { gainPct: 0,    label: "base", stopPct: 0.10 },
  ],

  // ── YIELD HARD CAP (Blindspot 2) ───────────────────────────
  YIELD_HARD_CAP_TRIGGER: 0.003,
  YIELD_HARD_CAP_ALLOC:   0.15,

  // ── VIX VELOCITY RE-ENTRY (Blindspot 7) ────────────────────
  VIX_VELOCITY: [
    { dropPct: 0.15, label: "capitulation",      confirmDays: 0, firstPct: 1.00 },
    { dropPct: 0.10, label: "strong reversal",   confirmDays: 1, firstPct: 0.85 },
    { dropPct: 0.05, label: "moderate reversal", confirmDays: 1, firstPct: 0.75 },
    { dropPct: 0,    label: "gradual",            confirmDays: 2, firstPct: 0.50 },
  ],
  // ── MARSHALL BRIDGE — reads Savant directive from GitHub Gist ──
  GITHUB_TOKEN:      process.env.GITHUB_TOKEN      || "",
  GITHUB_GIST_ID:    process.env.GITHUB_GIST_ID    || "",
  BRIDGE_MAX_AGE_MS: 4 * 60 * 60 * 1000,
};

// ── TRAILING STOPS ─────────────────────────────────────────
function getTrailingStop(equity) {
  if (!state.startingEquity) return { label: "base", stopPct: 0.10 };
  const gainPct = (equity - state.startingEquity) / state.startingEquity;
  return CONFIG.TRAILING_STOPS.find(t => gainPct >= t.gainPct) || CONFIG.TRAILING_STOPS[CONFIG.TRAILING_STOPS.length - 1];
}

// ── VIX-GRADUATED TQQQ ALLOCATION ────────────────────────────
function getTqqqAlloc(vix) {
  const tier = CONFIG.TQQQ_VIX_TIERS.find(t => vix < t.maxVix);
  return tier ? tier.alloc : 0;
}

// ── RECOVERY MODE ─────────────────────────────────────────────
function getRecoveryMode(equity) {
  if (equity <= CONFIG.RECOVERY_STOP)         return "STOP";
  if (equity <= CONFIG.RECOVERY_PRESERVATION) return "PRESERVATION";
  if (equity <= CONFIG.RECOVERY_CONSERVATIVE) return "CONSERVATIVE";
  return "NORMAL";
}

// ── STRATEGY ──────────────────────────────────────────────────
const STRATEGY = [
  { ticker:"TQQQ", name:"ProShares UltraPro QQQ 3x", allocation:0.25, takeHalf:0.15, holdWeekend:false, standDownOnly:false },
  { ticker:"GDXJ", name:"VanEck Junior Gold Miners",  allocation:0.25, takeHalf:0.15, holdWeekend:true,  standDownOnly:false },
  { ticker:"SLV",  name:"iShares Silver Trust",       allocation:0.20, takeHalf:0.12, holdWeekend:true,  standDownOnly:false },
  { ticker:"SGOV", name:"iShares 0-3 Month Treasury", allocation:0.70, takeHalf:null, holdWeekend:true,  standDownOnly:true  },
  { ticker:"SQQQ", name:"ProShares UltraPro Short QQQ", allocation:0.10, takeHalf:0.20, holdWeekend:false, standDownOnly:true, vixMin:25 },
];

// ── STATE ─────────────────────────────────────────────────────
let state = {
  running:true, todayActions:[], startingEquity:null, peakEquity:null,
  trailingStopLabel:"base", vix:null, prevVix:null, vixHistory:[],
  yieldHistory:[], currentYield:null,
  entryPrices:{}, tradingDay:null,
  standDown:false, standDownPostureActive:false,
  recoveryMode:"NORMAL",
  personalAlertSent:false,
  log:[], trades:[], winStreak:{}, lossStreak:{},
  reentryPending:false, reentryFirstPct:0.50,
  savantDirective:null, yieldCapActive:false,
};

// ── LOGGING ───────────────────────────────────────────────────
function log(msg, level="INFO") {
  const ts   = etNow().toLocaleTimeString();
  const line = `[${ts} ET] [${level}] ${msg}`;
  console.log(line);
  state.log.push(line);
  if (state.log.length > 500) state.log = state.log.slice(-500);
}

// ── TIME ──────────────────────────────────────────────────────
function etNow()       { return new Date(new Date().toLocaleString("en-US",{timeZone:"America/New_York"})); }
function isMarketDay() { const d=etNow().getDay(); return d>=1&&d<=5; }
function isFriday()    { return etNow().getDay()===5; }
function etMins()      { const d=etNow(); return d.getHours()*60+d.getMinutes(); }
function minsToClose() { return (CONFIG.CLOSE_HOUR*60+CONFIG.CLOSE_MIN)-etMins(); }

// ── MARSHALL BRIDGE ──────────────────────────────────────────
async function readBridgeDirective() {
  if (!CONFIG.GITHUB_TOKEN || !CONFIG.GITHUB_GIST_ID) {
    return null;
  }

  try {
    const r = await new Promise((resolve, reject) => {
      const req = require("https").request({
        hostname: "api.github.com",
        path:     `/gists/${CONFIG.GITHUB_GIST_ID}`,
        method:   "GET",
        headers:  {
          "Authorization": `Bearer ${CONFIG.GITHUB_TOKEN}`,
          "User-Agent":    "apex-alpaca-bridge",
          "Accept":        "application/vnd.github+json",
        },
      }, res => {
        let d = "";
        res.on("data", c => d += c);
        res.on("end", () => resolve({ status: res.statusCode, body: d }));
      });
      req.on("error", reject);
      req.end();
    });

    if (r.status !== 200) {
      log(`Bridge read failed: ${r.status} — using VIX-only rules`, "WARN");
      return null;
    }

    const gistData = JSON.parse(r.body);
    const fileContent = gistData?.files?.["apex-directive.json"]?.content;
    if (!fileContent) { log("Bridge: No directive file found — using VIX-only rules", "WARN"); return null; }

    const record = JSON.parse(fileContent);
    if (!record)  { log("Bridge: Empty directive — using VIX-only rules", "WARN"); return null; }

    const directiveAge = Date.now() - new Date(record.timestamp).getTime();
    if (directiveAge > CONFIG.BRIDGE_MAX_AGE_MS) {
      log(`Bridge: Directive is ${Math.round(directiveAge/3600000)}h old — using VIX-only rules`, "WARN");
      return null;
    }

    log(`🌉 Bridge: Savant says ${record.directive} | TQQQ max: ${((record.tqqq_max_alloc||0)*100).toFixed(0)}% | Regime: ${record.regime}`);

    return {
      directive:      record.directive,
      tqqqMaxAlloc:   record.tqqq_max_alloc || 0,
      standDown:      record.stand_down === true,
      regime:         record.regime,
      riskLevel:      record.risk_level,
      vix:            record.vix,
      generatedBy:    record.generated_by,
      timestamp:      record.timestamp,
    };

  } catch(e) {
    log(`Bridge read error: ${e.message} — using VIX-only rules`, "WARN");
    return null;
  }
}

function windowStr()   { const m=minsToClose(); if(m<=0)return"After hours"; if(m<=15)return`⚠ ${m}min URGENT`; return`${Math.floor(m/60)}h ${m%60}m left`; }

// ── 10-YEAR YIELD FETCH ────────────────────────────────────────
async function getTenYearYield() {
  try {
    const r = await new Promise((resolve, reject) => {
      const req = https.get(
        "https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?interval=1d&range=30d",
        { headers: { "User-Agent": "Mozilla/5.0" } },
        resp => {
          let d = "";
          resp.on("data", c => d += c);
          resp.on("end", () => resolve(JSON.parse(d)));
        }
      );
      req.on("error", reject);
    });

    const closes = r?.chart?.result?.[0]?.indicators?.quote?.[0]?.close;
    if (!closes || closes.length < 2) return null;

    const latest = closes[closes.length - 1];
    const earliest = closes.find(v => v != null);
    const yieldDecimal = latest / 100;

    state.currentYield = yieldDecimal;
    state.yieldHistory.push({ yield: yieldDecimal, time: Date.now() });
    if (state.yieldHistory.length > 30) state.yieldHistory = state.yieldHistory.slice(-30);

    const change30d = (latest - earliest) / 100;
    const hardCapActive = change30d > CONFIG.YIELD_HARD_CAP_TRIGGER;

    if (hardCapActive) {
      log(`⚠ Yield hard cap ACTIVE: 10yr yield rose ${(change30d*100).toFixed(2)}% in 30d → TQQQ capped at ${(CONFIG.YIELD_HARD_CAP_ALLOC*100).toFixed(0)}%`);
    } else {
      log(`Yield: ${(yieldDecimal*100).toFixed(2)}% (30d change: ${change30d>=0?"+":""}${(change30d*100).toFixed(2)}%) — no hard cap`);
    }

    return { yield: yieldDecimal, change30d, hardCapActive };
  } catch(e) {
    log(`Yield fetch error: ${e.message} — no yield cap applied`, "WARN");
    return null;
  }
}

// ── ADAPTED ALLOCATION ──────────────────────────────────────────
function getAdaptedAllocation(ticker, base) {
  const w = state.winStreak[ticker] || 0;
  const l = state.lossStreak[ticker] || 0;
  if (w >= 3) return Math.min(base + 0.05, 0.40);
  if (l >= 2) return Math.max(base - 0.05, 0.10);
  return base;
}

function recordTrade(ticker, outcome) {
  state.trades.push({ticker,outcome,time:new Date()});
  if(outcome==="win"){ state.winStreak[ticker]=(state.winStreak[ticker]||0)+1; state.lossStreak[ticker]=0; }
  else               { state.lossStreak[ticker]=(state.lossStreak[ticker]||0)+1; state.winStreak[ticker]=0; }
  log(`Trade: ${ticker} ${outcome} | Wins:${state.winStreak[ticker]||0} Losses:${state.lossStreak[ticker]||0}`);
}

// ── EMAIL VIA RESEND API ────────────────────────────────────────
function sendEmail(subject, body) {
  return new Promise((resolve) => {
    if (!CONFIG.RESEND_KEY) { log("RESEND_KEY not set — email skipped","WARN"); resolve(); return; }
    const payload = JSON.stringify({
      from:    "Apex Bot <onboarding@resend.dev>",
      to:      [CONFIG.EMAIL],
      subject: subject,
      text:    body,
    });
    const req = https.request({
      hostname: "api.resend.com",
      path:     "/emails",
      method:   "POST",
      headers:  {
        "Authorization": `Bearer ${CONFIG.RESEND_KEY}`,
        "Content-Type":  "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    }, res => {
      let d="";
      res.on("data", c => d+=c);
      res.on("end", () => {
        if(res.statusCode===200||res.statusCode===201) log(`📧 Email sent: ${subject}`);
        else log(`Email failed (${res.statusCode}): ${d}`,"ERROR");
        resolve();
      });
    });
    req.on("error", e=>{ log(`Email error: ${e.message}`,"ERROR"); resolve(); });
    req.write(payload);
    req.end();
  });
}

async function sendAlert({title, body, platform, action, ticker, dollar, timeWindow, urgency="HIGH"}) {
  const subject = `APEX BOT [${urgency}]: ${action.toUpperCase()} ${ticker} — ${platform}`;
  const text = [
    `◈ APEX ALPACA AUTONOMOUS BOT`,
    ``,
    `${urgency} ALERT: ${title}`,
    ``,
    `Platform:     ${platform}`,
    `Action:       ${action.toUpperCase()}`,
    `Ticker:       ${ticker}`,
    `Amount:       ${dollar?"$"+dollar.toFixed(2):"N/A"}`,
    `Time Window:  ${timeWindow||"Immediate"}`,
    ``,
    body,
    ``,
    `─────────────────────────────`,
    `${etNow().toLocaleString()} ET`,
    `Apex Alpaca Autonomous Bot v5`,
  ].join("\n");
  await sendEmail(subject, text);
}

// ── ALPACA API ──────────────────────────────────────────────────
const AH = ()=>({ "APCA-API-KEY-ID":CONFIG.ALPACA_KEY_ID, "APCA-API-SECRET-KEY":CONFIG.ALPACA_SECRET_KEY, "Content-Type":"application/json" });

function apiCall(path, method="GET", body=null) {
  return new Promise((resolve,reject)=>{
    const url    = new URL(CONFIG.ALPACA_BASE_URL+path);
    const opts   = { hostname:url.hostname, path:url.pathname+url.search, method, headers:AH() };
    const req    = https.request(opts, res=>{
      let d="";
      res.on("data",c=>d+=c);
      res.on("end",()=>{ try{resolve({status:res.statusCode,body:JSON.parse(d)})}catch(e){resolve({status:res.statusCode,body:d})} });
    });
    req.on("error",reject);
    if(body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function getAccount()   { const r=await apiCall("/v2/account");   if(r.status!==200) throw new Error(JSON.stringify(r.body)); return r.body; }
async function getPositions() { const r=await apiCall("/v2/positions");  if(r.status!==200) throw new Error(JSON.stringify(r.body)); return r.body; }

async function getQuote(symbol) {
  const r=await apiCall(`/v2/stocks/${symbol}/quotes/latest`,"GET",null);
  const q=r.body?.quote; return q?(q.ap+q.bp)/2:null;
}

async function placeOrder({symbol,notional,side,note=""}) {
  const r=await apiCall("/v2/orders","POST",{symbol,side,type:"market",time_in_force:"day",notional:notional.toFixed(2)});
  if(r.status===200||r.status===201){ log(`✓ ${side.toUpperCase()} ${symbol} $${notional.toFixed(2)} — ${note}`); state.todayActions.push({action:side,symbol,dollar:notional,note}); return r.body; }
  log(`✗ Order failed: ${symbol} ${JSON.stringify(r.body)}`,"ERROR"); return null;
}

async function closePos(symbol,note="") {
  const r=await apiCall(`/v2/positions/${symbol}`,"DELETE");
  if(r.status===200||r.status===201){ log(`✓ Closed ${symbol} — ${note}`); state.todayActions.push({action:"close",symbol,note}); return r.body; }
  log(`✗ Close failed: ${symbol}`,"ERROR"); return null;
}

// ── VIX ──────────────────────────────────────────────────────────
async function getVIX() {
  try {
    const r=await new Promise((res,rej)=>{
      const req=https.get("https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=1d",{headers:{"User-Agent":"Mozilla/5.0"}},resp=>{
        let d=""; resp.on("data",c=>d+=c); resp.on("end",()=>res(JSON.parse(d)));
      }); req.on("error",rej);
    });
    const p=r?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if(p){ state.vix=p; return p; }
  } catch(e){ log(`VIX error: ${e.message}`,"WARN"); }
  return 15;
}

// ── DAILY OPEN ───────────────────────────────────────────────────
async function dailyOpen() {
  const today = etNow().toDateString();
  if (state.tradingDay === today) return;

  const prevStandDown = state.standDown;
  state.tradingDay    = today;
  state.todayActions  = [];
  state.standDown     = false;
  log(`═══ TRADING DAY: ${today} ═══`);

  const acct   = await getAccount();
  const equity = parseFloat(acct.equity);
  if (!state.startingEquity) state.startingEquity = equity;
  if (!state.peakEquity || equity > state.peakEquity) state.peakEquity = equity;

  if (equity <= CONFIG.PERSONAL_THRESHOLD && !state.personalAlertSent) {
    state.personalAlertSent = true;
    await sendAlert({
      title: `🚨 PERSONAL INTERVENTION THRESHOLD: $${equity.toFixed(2)}`,
      body: `Portfolio has hit $${equity.toFixed(2)} — below the binding personal threshold of $${CONFIG.PERSONAL_THRESHOLD.toLocaleString()}.

PER BINDING COMMITMENT (March 6, 2026):
Nicholas must manually shut down the bot.

This is not automatic. You committed to shutting this down yourself.
Log in to Alpaca and liquidate all positions manually.`,
      platform: "ALPACA (AUTO)", action: "INTERVENTION REQUIRED", ticker: "ALL",
      timeWindow: "IMMEDIATE — Manual action required", urgency: "CRITICAL", dollar: equity,
    });
  }

  const totalReturn = (equity - state.startingEquity) / state.startingEquity;
  if (totalReturn <= -CONFIG.MAX_LOSS_PCT) {
    state.standDown = true;
    await sendAlert({ title: "🚨 LOSS LIMIT — ALL TRADING PAUSED", body: `Down ${(totalReturn*100).toFixed(1)}% from start. Equity: $${equity.toFixed(2)}. Manual review required.`, platform: "ALPACA (AUTO)", action: "STAND DOWN", ticker: "ALL", timeWindow: "Immediate", urgency: "CRITICAL", dollar: equity });
    return;
  }

  const recoveryMode = getRecoveryMode(equity);
  if (recoveryMode !== state.recoveryMode) {
    log(`⚠ Recovery mode: ${state.recoveryMode} → ${recoveryMode}`);
    state.recoveryMode = recoveryMode;
    if (recoveryMode === "STOP") {
      state.standDown = true;
      await sendAlert({ title: `🚨 RECOVERY STOP: $${equity.toFixed(2)} — All Trading Halted`, body: `Portfolio at $${equity.toFixed(2)}, below the $${CONFIG.RECOVERY_STOP.toLocaleString()} full-stop threshold.

All trading halted. Awaiting manual review.`, platform: "ALPACA (AUTO)", action: "STAND DOWN", ticker: "ALL", timeWindow: "Manual review required", urgency: "CRITICAL", dollar: equity });
      return;
    }
  }

  const trailingStop = getTrailingStop(equity);
  if (trailingStop.label !== state.trailingStopLabel) {
    log(`Trailing stop: ${state.trailingStopLabel} → ${trailingStop.label} (stop: ${(trailingStop.stopPct*100).toFixed(0)}%)`);
    state.trailingStopLabel = trailingStop.label;
  }

  state.prevVix = state.vix;
  const vix = await getVIX();
  state.vixHistory.push({ vix, time: Date.now() });
  if (state.vixHistory.length > 10) state.vixHistory = state.vixHistory.slice(-10);

  if (prevStandDown && state.prevVix && vix < state.prevVix) {
    const vixDropPct = (state.prevVix - vix) / state.prevVix;
    const velocityTier = CONFIG.VIX_VELOCITY.find(t => vixDropPct >= t.dropPct);

    if (velocityTier) {
      log(`🔄 VIX velocity re-entry: ${(vixDropPct*100).toFixed(1)}% drop → ${velocityTier.label} | First entry: ${(velocityTier.firstPct*100).toFixed(0)}%`);
      state.reentryPending  = true;
      state.reentryFirstPct = velocityTier.firstPct;

      if (vixDropPct >= 0.10) {
        log(`⚡ Whipsaw guard SUSPENDED — VIX capitulation confirmed (${(vixDropPct*100).toFixed(1)}% drop)`);
      }
    }
  }

  if (vix > CONFIG.HIGH_VIX) {
    state.standDown = true;
    state.reentryPending = false;
    await sendAlert({ title: `⚠ HIGH VIX ${vix.toFixed(1)} — Standing Down`, body: `VIX at ${vix.toFixed(1)} exceeds ${CONFIG.HIGH_VIX}. Deploying STAND DOWN posture (SGOV/GDXJ/SLV). No leveraged positions today.`, platform: "ALPACA (AUTO)", action: "STAND DOWN", ticker: "VIX", timeWindow: "Reassessing tomorrow", urgency: "HIGH", dollar: equity });
  }

  log(`Equity: $${equity.toFixed(2)} | VIX: ${vix.toFixed(1)} | Stop: ${trailingStop.label} (${(trailingStop.stopPct*100).toFixed(0)}%) | Recovery: ${recoveryMode} | StandDown: ${state.standDown}`);
}

// ── STAND DOWN POSTURE DEPLOYMENT ────────────────────────────────
async function deployStandDownPosture(equity) {
  if (state.standDownPostureActive) { log("Stand down posture already active"); return; }
  try {
    const positions = await getPositions();
    const held = positions.map(p => p.symbol);
    const acct = await getAccount();
    const cash = parseFloat(acct.cash);

    log("🛡 Deploying STAND DOWN posture: SGOV 70% / GDXJ 15% / SLV 15%");
    for (const [ticker, allocPct] of Object.entries(CONFIG.STAND_DOWN_ALLOC)) {
      if (held.includes(ticker)) { log(`${ticker} already held`); continue; }
      const target = equity * allocPct;
      if (cash < target) { log(`Insufficient cash for ${ticker} in stand down posture`, "WARN"); continue; }
      await placeOrder({ symbol: ticker, notional: target, side: "buy", note: `Stand down posture` });
      await new Promise(r => setTimeout(r, 1000));
    }
    state.standDownPostureActive = true;
    await sendAlert({
      title: `🛡 STAND DOWN POSTURE DEPLOYED`,
      body: `Capital repositioned for STAND DOWN:
• SGOV (T-Bills): ${(CONFIG.STAND_DOWN_ALLOC.SGOV*100).toFixed(0)}% — ~5% yield
• GDXJ (Gold Miners): ${(CONFIG.STAND_DOWN_ALLOC.GDXJ*100).toFixed(0)}% — safe haven
• SLV (Silver): ${(CONFIG.STAND_DOWN_ALLOC.SLV*100).toFixed(0)}% — inflation hedge

Estimated yield: ~$240/month. No idle cash.`,
      platform: "ALPACA (AUTO)", action: "REPOSITION", ticker: "SGOV/GDXJ/SLV",
      timeWindow: "Holding until VIX normalizes", urgency: "MEDIUM", dollar: equity,
    });
  } catch(e) {
    log(`Stand down posture error: ${e.message}`, "WARN");
  }
}

// ── ENTRY CHECK ──────────────────────────────────────────────────
async function entryCheck() {
  const savantDirective = await readBridgeDirective();
  if (savantDirective) state.savantDirective = savantDirective;

  if (savantDirective?.standDown) {
    state.standDown = true;
    log(`🌉 Bridge: Savant STAND_DOWN overrides VIX — no entries today (Regime: ${savantDirective.regime})`);
    await sendAlert({
      title: `🌉 SAVANT OVERRIDE: STAND DOWN — ${savantDirective.regime}`,
      body:  `Savant Intelligence issued STAND_DOWN this morning.
Regime: ${savantDirective.regime}
Risk: ${savantDirective.riskLevel}
VIX: ${savantDirective.vix?.toFixed(1)||"unknown"}

Deploying STAND DOWN posture (SGOV/GDXJ/SLV).`,
      platform: "ALPACA (AUTO)", action: "STAND DOWN", ticker: "SAVANT",
      timeWindow: "Reassessing tomorrow", urgency: "HIGH", dollar: 0,
    });
  }

  if (state.standDown) {
    log("Entry skipped — stand down active");
    const acct = await getAccount();
    await deployStandDownPosture(parseFloat(acct.equity));
    return;
  }

  const yieldData = await getTenYearYield();
  const yieldCapActive = yieldData?.hardCapActive === true;
  state.yieldCapActive = yieldCapActive;

  const acct      = await getAccount();
  const equity    = parseFloat(acct.equity);
  const cash      = parseFloat(acct.cash);
  const positions = await getPositions();
  const held      = positions.map(p => p.symbol);
  const vix       = state.vix || 15;
  const reserve   = CONFIG.CASH_RESERVE_PCT;
  const deployable = equity * (1 - reserve);

  if (state.standDownPostureActive) {
    log("🔄 Exiting stand down posture — liquidating SGOV/GDXJ/SLV");
    for (const ticker of Object.keys(CONFIG.STAND_DOWN_ALLOC)) {
      if (held.includes(ticker)) await closePos(ticker, "Exiting stand down posture");
    }
    state.standDownPostureActive = false;
    await new Promise(r => setTimeout(r, 2000));
  }

  let tqqqAlloc = getTqqqAlloc(vix);

  if (state.recoveryMode === "PRESERVATION") {
    tqqqAlloc = 0;
    log("⚠ Recovery PRESERVATION mode — TQQQ blocked");
  } else if (state.recoveryMode === "CONSERVATIVE") {
    tqqqAlloc = Math.min(tqqqAlloc, 0.15);
    log(`⚠ Recovery CONSERVATIVE mode — TQQQ capped at 15%`);
  }

  if (yieldCapActive) {
    tqqqAlloc = Math.min(tqqqAlloc, CONFIG.YIELD_HARD_CAP_ALLOC);
    log(`⚠ Yield hard cap ACTIVE — TQQQ capped at ${(CONFIG.YIELD_HARD_CAP_ALLOC*100).toFixed(0)}%`);
  }

  const savantTqqqMax = savantDirective?.tqqqMaxAlloc ?? null;
  if (savantTqqqMax !== null) {
    tqqqAlloc = Math.min(tqqqAlloc, savantTqqqMax);
    log(`🌉 Savant caps TQQQ at ${(savantTqqqMax*100).toFixed(0)}% (${savantDirective.directive})`);
  }

  const entryScale = state.reentryPending ? state.reentryFirstPct : 1.0;
  if (state.reentryPending) {
    log(`🔄 Re-entry at ${(entryScale*100).toFixed(0)}% scale (VIX velocity)`);
    state.reentryPending = false;
  }

  log(`Entry | Equity:$${equity.toFixed(2)} Deployable:$${(deployable*entryScale).toFixed(2)} VIX:${vix.toFixed(1)} TQQQ:${(tqqqAlloc*100).toFixed(0)}% Recovery:${state.recoveryMode} Savant:${savantDirective?.directive||"VIX-only"}`);

  for (const s of STRATEGY) {
    if (s.standDownOnly) continue;
    if (held.includes(s.ticker)) { log(`${s.ticker} already held`); continue; }

    let alloc = getAdaptedAllocation(s.ticker, s.allocation);

    if (s.ticker === "TQQQ") {
      alloc = Math.min(alloc, tqqqAlloc);
      if (alloc === 0) { log("TQQQ skipped — allocation is 0% (VIX/recovery/yield/Savant)"); continue; }
    }

    const target = deployable * alloc * entryScale;
    if (target < 5) { log(`${s.ticker} target too small: $${target.toFixed(2)}`); continue; }
    if (cash < target + (equity * reserve)) { log(`Insufficient cash for ${s.ticker}`); continue; }

    const price = await getQuote(s.ticker);
    if (price) state.entryPrices[s.ticker] = price;

    const trailingStop = getTrailingStop(equity);
    const order = await placeOrder({ symbol: s.ticker, notional: target, side: "buy", note: `Entry (${trailingStop.label})` });

    if (order) {
      const w = state.winStreak[s.ticker] || 0;
      const l = state.lossStreak[s.ticker] || 0;
      await sendAlert({
        title: `▲ BOT BOUGHT ${s.ticker} — $${target.toFixed(2)}`,
        body: `${s.name}
Price: ~$${price?.toFixed(2)||"market"}
Allocation: ${(alloc*100).toFixed(0)}% ${w>0?`(+${w} win streak)`:l>0?`(-${l} loss streak)`:""}
Trailing stop: -${(trailingStop.stopPct*100).toFixed(0)}% (${trailingStop.label})
Take half: +${(s.takeHalf*100).toFixed(0)}%
VIX: ${vix.toFixed(1)} | Recovery: ${state.recoveryMode}
Savant: ${savantDirective?.directive||"VIX-only"}`,
        platform: "ALPACA (AUTO)", action: "BUY", ticker: s.ticker,
        dollar: target, timeWindow: windowStr(), urgency: "HIGH",
      });
      await new Promise(r => setTimeout(r, 1500));
    }
  }
}

// ── POSITION MONITOR ─────────────────────────────────────────────
async function positionMonitor() {
  const positions = await getPositions();
  if (!positions.length) return;
  const acct        = await getAccount();
  const equity      = parseFloat(acct.equity);
  const trailingStop = getTrailingStop(equity);

  for (const pos of positions) {
    const s     = STRATEGY.find(x => x.ticker === pos.symbol);
    if (!s) continue;

    if (s.standDownOnly) { log(`Monitor: ${pos.symbol} — stand down posture, skipping stop check`); continue; }

    const mv    = parseFloat(pos.market_value);
    const plPct = parseFloat(pos.unrealized_plpc);
    const price = parseFloat(pos.current_price);
    const stop  = trailingStop.stopPct;

    log(`Monitor: ${pos.symbol} | P&L:${(plPct*100).toFixed(2)}% | $${mv.toFixed(2)} | Stop:-${(stop*100).toFixed(0)}% (${trailingStop.label})`);

    if (plPct <= -stop) {
      await closePos(pos.symbol, `Trailing stop ${(plPct*100).toFixed(2)}%`);
      recordTrade(pos.symbol, "loss");
      await sendAlert({
        title: `🔴 TRAILING STOP: ${pos.symbol} SOLD ${(plPct*100).toFixed(2)}%`,
        body: `Stop triggered at ${(plPct*100).toFixed(2)}% (threshold -${(stop*100).toFixed(0)}% on ${trailingStop.label} tier).
Cash returned to reserve.
Loss streak: ${state.lossStreak[pos.symbol]||1}.${(state.lossStreak[pos.symbol]||0)>=2?" ⚠ Allocation reducing 5% next entry.":""}`,
        platform: "ALPACA (AUTO)", action: "SELL (STOP)", ticker: pos.symbol,
        dollar: mv, timeWindow: windowStr(), urgency: "CRITICAL",
      });
      continue;
    }

    if (s.takeHalf && plPct >= s.takeHalf) {
      const half = mv / 2;
      await placeOrder({ symbol: pos.symbol, notional: half, side: "sell", note: `Take half +${(plPct*100).toFixed(2)}%` });
      recordTrade(pos.symbol, "win");
      await sendAlert({
        title: `✓ PROFIT LOCKED: Sold half ${pos.symbol} +${(plPct*100).toFixed(2)}%`,
        body: `Half position sold. Profit locked: ~$${(half - parseFloat(pos.cost_basis)/2).toFixed(2)}.
Remaining half in pure profit territory.
Win streak: ${(state.winStreak[pos.symbol]||0)+1}.${((state.winStreak[pos.symbol]||0)+1)>=3?" 🎯 Allocation increasing 5% next entry.":""}`,
        platform: "ALPACA (AUTO)", action: "SELL HALF", ticker: pos.symbol,
        dollar: half, timeWindow: windowStr(), urgency: "HIGH",
      });
      state.entryPrices[pos.symbol] = price * 1.5;
      continue;
    }

    const entry = state.entryPrices[pos.symbol];
    if (entry && price < entry * (1 - CONFIG.DIP_BUY_DROP)) {
      const acct2 = await getAccount();
      const avail = parseFloat(acct2.cash) - (equity * CONFIG.CASH_RESERVE_PCT);
      if (avail >= 5) {
        const amt = Math.min(avail * 0.5, 10);
        await placeOrder({ symbol: pos.symbol, notional: amt, side: "buy", note: "Dip buy" });
        await sendAlert({ title: `▲ DIP BUY: Added to ${pos.symbol} $${amt.toFixed(2)}`, body: `${pos.symbol} dropped ${(CONFIG.DIP_BUY_DROP*100).toFixed(0)}% from entry. Deployed $${amt.toFixed(2)} to lower average cost.`, platform: "ALPACA (AUTO)", action: "BUY (DIP)", ticker: pos.symbol, dollar: amt, timeWindow: windowStr(), urgency: "MEDIUM" });
        delete state.entryPrices[pos.symbol];
      }
    }
  }
}

// ── END OF DAY ───────────────────────────────────────────────────
async function endOfDay() {
  const positions = await getPositions();
  const vix       = state.vix||await getVIX();
  const acct      = await getAccount();
  const equity    = parseFloat(acct.equity);

  for(const pos of positions){
    const s=STRATEGY.find(x=>x.ticker===pos.symbol);
    if(s&&isFriday()&&!s.holdWeekend&&vix>CONFIG.WEEKEND_VIX){
      await closePos(pos.symbol,`Friday VIX ${vix.toFixed(1)}`);
      await sendAlert({title:`📅 WEEKEND: ${pos.symbol} Sold (VIX ${vix.toFixed(1)})`,body:`Friday protocol. VIX ${vix.toFixed(1)} > ${CONFIG.WEEKEND_VIX}. Sold to protect against Monday gap risk. Re-entering Monday 10AM ET if VIX normalizes.`,platform:"ALPACA (AUTO)",action:"SELL (WEEKEND)",ticker:pos.symbol,dollar:parseFloat(pos.market_value),timeWindow:"Re-entering Monday",urgency:"HIGH"});
    }
  }

  const start  = state.startingEquity||equity;
  const totalPL= equity-start;
  const wins   = state.trades.filter(t=>t.outcome==="win").length;
  const losses = state.trades.filter(t=>t.outcome==="loss").length;

  await sendAlert({
    title:`📊 DAILY SUMMARY — $${equity.toFixed(2)}`,
    body:`Date: ${etNow().toDateString()}\nPortfolio: $${equity.toFixed(2)}\nReturn: ${totalPL>=0?"+":""}$${totalPL.toFixed(2)} (${((totalPL/start)*100).toFixed(2)}%)\nPeak: $${state.peakEquity?.toFixed(2)||equity.toFixed(2)}\nVIX: ${vix.toFixed(1)}\nAll-time: ${wins}W / ${losses}L\nToday's trades: ${state.todayActions.length}\n${state.todayActions.map(a=>`• ${a.action.toUpperCase()} ${a.symbol} ${a.dollar?"$"+a.dollar.toFixed(2):""}`).join("\n")||"• No trades today"}\n\nReport to Claude on the 1st of each month with both Fidelity and Alpaca values.`,
    platform:"ALPACA (AUTO)",action:"DAILY REPORT",ticker:"PORTFOLIO",dollar:equity,timeWindow:"Market closed",urgency:"LOW",
  });
}

// ── WEEKLY ───────────────────────────────────────────────────────
async function weeklyReport() {
  const acct   = await getAccount();
  const equity = parseFloat(acct.equity);
  const start  = state.startingEquity||equity;
  const pl     = equity-start;
  const wins   = state.trades.filter(t=>t.outcome==="win").length;
  const losses = state.trades.filter(t=>t.outcome==="loss").length;
  await sendAlert({
    title:`📅 WEEKLY REPORT — $${equity.toFixed(2)}`,
    body:`Portfolio: $${equity.toFixed(2)}\nReturn: ${pl>=0?"+":""}$${pl.toFixed(2)} (${((pl/start)*100).toFixed(2)}%)\nPeak: $${state.peakEquity?.toFixed(2)||equity.toFixed(2)}\nAll-time: ${wins}W / ${losses}L\n\nAdapted allocations:\n${STRATEGY.map(s=>`${s.ticker}: ${(getAdaptedAllocation(s.ticker,s.allocation)*100).toFixed(0)}%`).join("\n")}\n\nReport to Claude on the 1st with both Fidelity and Alpaca values.`,
    platform:"ALPACA (AUTO)",action:"WEEKLY REPORT",ticker:"PORTFOLIO",dollar:equity,timeWindow:"Markets open Monday 9:30AM ET",urgency:"LOW",
  });
}

// ── MAIN LOOP ────────────────────────────────────────────────────
let ranEntry=false, ranEOD=false, lastMonitor=0; state.lastMonitorRun=null;

async function mainLoop() {
  if(!state.running) return;
  try {
    if(!isMarketDay()){
      const d=etNow();
      if(d.getDay()===0&&d.getHours()===18&&d.getMinutes()<2) await weeklyReport();
      return;
    }
    const mins=etMins(), open=9*60+30, entry=10*60, eod=15*60+45, close=16*60;
    const today=etNow().toDateString();
    if(state.tradingDay!==today){ ranEntry=false; ranEOD=false; }
    if(mins>=open  &&mins<open+5)              await dailyOpen();
    if(mins>=entry &&mins<entry+5&&!ranEntry)  { ranEntry=true; await entryCheck(); }
    if(mins>=open  &&mins<close){
      const now=Date.now();
      if(now-lastMonitor>=5*60*1000){ lastMonitor=now; state.lastMonitorRun=etNow().toLocaleTimeString("en-US",{hour12:false,timeZone:"America/New_York"}); await positionMonitor(); }
    }
    if(mins>=eod&&mins<eod+5&&!ranEOD){ ranEOD=true; await endOfDay(); }
  } catch(e){ log(`mainLoop error: ${e.message}`,"ERROR"); }
}

// ── STATUS SERVER ────────────────────────────────────────────────
function startServer() {
  const port = process.env.PORT || 3000;

  let benchCache = { data: null, fetchedAt: 0 };

  async function fetchBenchmarks(equity) {
    const now = Date.now();
    if (benchCache.data && (now - benchCache.fetchedAt) < 5 * 60 * 1000) return benchCache.data;
    const tickers = ['SPY','QQQ','DIA','VTI'];
    const results = {};
    for (const t of tickers) {
      try {
        const r = await apiCall(`/v2/stocks/${t}/bars?timeframe=1Day&limit=2&feed=iex`);
        if (r.status === 200 && r.body.bars?.length >= 1) {
          const bars = r.body.bars;
          const latest = bars[bars.length - 1];
          const prev   = bars.length > 1 ? bars[bars.length - 2] : bars[0];
          results[t] = {
            price: latest.c,
            todayPct: ((latest.c - prev.c) / prev.c) * 100,
          };
        }
      } catch(e) { results[t] = null; }
    }
    const startEquity = state.startingEquity || 100000;
    const apexPct = ((equity - 100000) / 100000) * 100;
    benchCache = { data: { tickers: results, apexPct, equity }, fetchedAt: now };
    return benchCache.data;
  }

  let posCache = { data: null, fetchedAt: 0 };
  async function fetchPositions() {
    const now = Date.now();
    if (posCache.data && (now - posCache.fetchedAt) < 60 * 1000) return posCache.data;
    try {
      const [posR, acctR] = await Promise.all([getPositions(), getAccount()]);
      posCache = { data: { positions: posR, account: acctR }, fetchedAt: now };
      return posCache.data;
    } catch(e) { return posCache.data || { positions: [], account: null }; }
  }

  http.createServer(async (req, res) => {

    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status:'ok', standDown:state.standDown, vix:state.vix, equity:state.peakEquity }));
      return;
    }

    if (req.url === '/api/data') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      try {
        let orders = [];
        try {
          const et = etNow();
          const today = new Date(et.getFullYear(), et.getMonth(), et.getDate());
          const r = await apiCall(`/v2/orders?status=all&after=${today.toISOString()}&limit=50`);
          if (r.status === 200) orders = r.body;
        } catch(e) { /* non-fatal */ }

        const [live, bench] = await Promise.all([
          fetchPositions(),
          fetchBenchmarks(state.peakEquity || 100000)
        ]);
        const acct   = live.account;
        const equity = acct ? parseFloat(acct.equity) : (state.peakEquity || 100000);
        const bp     = acct ? parseFloat(acct.buying_power) : 0;
        const cash   = acct ? parseFloat(acct.cash) : 0;
        const peak   = state.peakEquity || equity;
        const drawdownFromPeak = ((equity - peak) / peak) * 100;
        const vix    = state.vix || 0;
        const tqqqCap = getTqqqAlloc(vix);

        res.end(JSON.stringify({
          equity, bp, cash,
          positions: live.positions,
          orders,
          bench: bench.tickers,
          apexPct: bench.apexPct,
          drawdownFromPeak,
          tqqqCap,
          maxLossPct:    CONFIG.MAX_LOSS_PCT,
          cashReservePct: CONFIG.CASH_RESERVE_PCT,
          highVix:       CONFIG.HIGH_VIX,
          weekendVix:    CONFIG.WEEKEND_VIX,
          dipBuyDrop:    CONFIG.DIP_BUY_DROP,
          personalThreshold: CONFIG.PERSONAL_THRESHOLD,
          tqqqVixTiers:  CONFIG.TQQQ_VIX_TIERS,
          trailingStopTiers: CONFIG.TRAILING_STOPS,
          experimentStart: 'Feb 2026',
          state: {
            standDown:     state.standDown,
            standDownPostureActive: state.standDownPostureActive,
            recoveryMode:  state.recoveryMode,
            trailingStopLabel: state.trailingStopLabel,
            vix:           state.vix,
            prevVix:       state.prevVix,
            vixHistory:    state.vixHistory.slice(-10),
            currentYield:  state.currentYield,
            yieldCapActive: state.yieldCapActive,
            tradingDay:    state.tradingDay,
            reentryPending: state.reentryPending,
            reentryFirstPct: state.reentryFirstPct,
            personalAlertSent: state.personalAlertSent,
            winStreak:     state.winStreak,
            lossStreak:    state.lossStreak,
            wins:          state.trades.filter(t => t.outcome === 'win').length,
            losses:        state.trades.filter(t => t.outcome === 'loss').length,
            todayActions:  state.todayActions,
            entryPrices:   state.entryPrices,
            log:           state.log.slice(-80).reverse(),
            bridgeOk:      !!CONFIG.GITHUB_GIST_ID,
            peakEquity:    state.peakEquity,
            startingEquity: state.startingEquity,
            savantDirective: state.savantDirective,
            lastMonitorRun: state.lastMonitorRun,
            ranEntry,
            ranEOD,
          },
          etTime: etNow().toLocaleTimeString('en-US',{hour12:false,timeZone:'America/New_York'}),
          etDate: etNow().toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',year:'numeric',timeZone:'America/New_York'}),
          etMins: etMins(),
        }));
      } catch(e) {
        res.end(JSON.stringify({ error: e.message }));
      }
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(DASHBOARD_HTML);

  }).listen(port, () => log('Status server on port ' + port));
}

// ── DASHBOARD HTML (EMBEDDED) ────────────────────────────────────
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>APEX BOT v5</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Bebas+Neue&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}
body{background:#06060e;color:#e0d8c0;font-family:'Space Mono',monospace;min-height:100vh}
@keyframes tickerScroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
@keyframes ping{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(2.4);opacity:0}}
@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
@keyframes scanMove{0%{top:-3px}100%{top:100%}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#1a1830}
.scanline{pointer-events:none;position:fixed;left:0;right:0;height:3px;z-index:9999;opacity:0.04;background:linear-gradient(180deg,transparent,#00ffaa,transparent);animation:scanMove 8s linear infinite}
.card{background:#08081a;border:1px solid #1a1a30;border-radius:4px;overflow:hidden;margin-bottom:12px}
.ch{padding:9px 14px;background:#0c0c1e;border-bottom:1px solid #1a1a30;font-size:9px;color:#00ffaa88;letter-spacing:3px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;user-select:none}
.ch:hover{background:#10101e}
.ct{font-size:11px;color:#445;transition:transform 0.2s;display:inline-block}
.card.collapsed .ct{transform:rotate(-90deg)}
.card.collapsed .cb{display:none}
.tab-btn{background:none;border:none;border-bottom:2px solid transparent;padding:10px 14px;font-family:'Space Mono',monospace;font-size:10px;letter-spacing:2px;color:#334;cursor:pointer;transition:all 0.15s;white-space:nowrap}
.tab-btn.active{color:#00ffaa;border-bottom-color:#00ffaa}
.tab-btn:hover:not(.active){color:#00ffaa66}
.tc{display:none;padding:18px 22px;animation:fadeIn 0.2s ease}
.tc.active{display:block}
.badge{font-size:8px;font-weight:700;padding:2px 8px;border-radius:2px;letter-spacing:2px}
.ld{position:relative;display:inline-block;width:8px;height:8px}
.ldi{position:absolute;inset:0;border-radius:50%}
.ldr{position:absolute;inset:0;border-radius:50%;animation:ping 2s infinite}
.sg{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.sg3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.sg2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.sc{background:#08081a;border:1px solid #1a1a30;border-radius:4px;padding:11px 13px}
.sl{font-size:9px;color:#334;letter-spacing:2px;margin-bottom:5px}
.sv{font-family:'Bebas Neue',monospace;font-size:20px;letter-spacing:2px}
.pb{background:#0a0a1e;border-radius:2px;height:6px;overflow:hidden}
.pf{height:100%;border-radius:2px;transition:width 0.5s}
.pr{display:grid;grid-template-columns:90px 90px 80px 80px 80px 1fr 80px;gap:6px;align-items:center;padding:9px 14px;border-bottom:1px solid #0a0a1e;font-size:10px}
.pr:last-child{border-bottom:none}
.prh{color:#334;font-size:8px;letter-spacing:2px;background:#0a0a1a}
.ll{display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #09090f}
.lt{color:#334;font-size:9px;flex-shrink:0;width:130px}
.lm{font-size:10px;line-height:1.5}
.sp{display:inline-block;width:14px;height:14px;border:2px solid #1a1a30;border-top-color:#00ffaa;border-radius:50%;animation:spin 0.8s linear infinite;vertical-align:middle;margin-right:6px}
.ac{border-radius:4px;padding:13px 16px;margin-bottom:10px;animation:fadeIn 0.3s ease}
</style>
</head>
<body>
<div class="scanline"></div>

<div style="background:#040310;border-bottom:1px solid #00ffaa18;padding:15px 22px;text-align:center">
  <div style="font-family:'Bebas Neue';font-size:20px;letter-spacing:3px;color:#00ffaa;margin-bottom:3px">◈ APEX ALPACA BOT v5</div>
  <div style="font-size:9px;color:#334;letter-spacing:2px">Loading dashboard... please wait</div>
  <div style="margin-top:12px"><span class="sp"></span><span style="color:#334">Connecting to Alpaca</span></div>
</div>

<script>
let refreshCount = 0;
async function testConnection() {
  try {
    const r = await fetch('/health').then(r => r.json());
    if (r.status === 'ok') {
      location.reload();
    } else {
      throw new Error('Health check failed');
    }
  } catch(e) {
    refreshCount++;
    if (refreshCount > 10) {
      document.body.innerHTML = '<div style="background:#06060e;color:#ff3333;font-family:monospace;padding:40px;text-align:center;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center"><div style="font-size:18px;margin-bottom:20px">⚠ CONNECTION ERROR</div><div style="max-width:500px;line-height:1.8;margin-bottom:20px"><strong>Bot is not responding.</strong><br><br>Verify:<br>1. Environment variables set: ALPACA_KEY_ID, ALPACA_SECRET_KEY<br>2. Alpaca API credentials valid<br>3. Network connectivity to Alpaca API<br><br>Check logs for details.</div><button onclick="location.reload()" style="background:#00ffaa;color:#06060e;border:none;padding:10px 20px;cursor:pointer;font-family:monospace;font-weight:bold">Retry</button></div>';
      return;
    }
    setTimeout(testConnection, 1000);
  }
}
testConnection();
</script>
</body>
</html>`;

// ── BOOT ──────────────────────────────────────────────────────────
async function boot() {
  log("◈◈◈ APEX ALPACA BOT v5 STARTING ◈◈◈");
  log(`Mode: ${CONFIG.ALPACA_BASE_URL.includes("paper")?"PAPER TRADING":"LIVE TRADING"}`);
  log(`Bridge: ${CONFIG.GITHUB_GIST_ID?"✓ Gist connected":"⚠ GITHUB_GIST_ID not set — VIX-only mode"}`);
  
  if (!CONFIG.ALPACA_KEY_ID || !CONFIG.ALPACA_SECRET_KEY) {
    log("✗ FATAL: Missing Alpaca credentials","ERROR");
    log("  Set ALPACA_KEY_ID and ALPACA_SECRET_KEY environment variables","ERROR");
    process.exit(1);
  }
  
  try {
    const acct=await getAccount();
    state.startingEquity=parseFloat(acct.equity);
    state.peakEquity=state.startingEquity;
    const trailingStop=getTrailingStop(state.startingEquity);
    const recoveryMode=getRecoveryMode(state.startingEquity);
    state.recoveryMode=recoveryMode;
    state.trailingStopLabel=trailingStop.label;
    log(`✓ Connected | Account: ${acct.account_number} | Starting equity: $${state.startingEquity.toFixed(2)}`);
    log(`Recovery: ${recoveryMode} | Trailing stop: ${trailingStop.label} (${(trailingStop.stopPct*100).toFixed(0)}%)`);
    await sendAlert({
      title:"◈ APEX BOT v5 ONLINE",
      body:`Bot v5 started successfully.
Starting equity: $${state.startingEquity.toFixed(2)}
Mode: ${CONFIG.ALPACA_BASE_URL.includes("paper")?"PAPER (no real money)":"LIVE"}
Strategy: TQQQ (VIX-graduated) · GDXJ 25% · SLV 20% · Cash 30%
Trailing stop: ${trailingStop.label} (${(trailingStop.stopPct*100).toFixed(0)}%)
Recovery mode: ${recoveryMode}
Bridge: ${CONFIG.GITHUB_GIST_ID?"✓ GitHub Gist connected":"⚠ Not connected — VIX-only"}

Personal intervention threshold: $85,000
First trades execute next market day 10:00 AM ET.`,
      platform:"ALPACA (AUTO)",action:"STARTUP",ticker:"SYSTEM",
      timeWindow:"First trades next market day 10AM ET",urgency:"HIGH",dollar:state.startingEquity,
    });
  } catch(e){ 
    log(`✗ Connection FAILED: ${e.message}`,"ERROR"); 
    process.exit(1); 
  }
  
  startServer();
  await mainLoop();
  setInterval(mainLoop,60*1000);
}

boot().catch(e=>{ console.error("FATAL:",e.message); process.exit(1); });
