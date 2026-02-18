const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── In-memory store (last 50 signals) ──────────────────────
let signals = [];
let clients = [];   // SSE connections

// ── SSE: browser connects here to get live updates ─────────
app.get('/events', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  // send all existing signals on connect
  res.write(`data: ${JSON.stringify({ type: 'history', signals })}\n\n`);

  clients.push(res);

  // heartbeat every 25s (Render free tier needs this)
  const hb = setInterval(() => res.write(': heartbeat\n\n'), 25000);

  req.on('close', () => {
    clearInterval(hb);
    clients = clients.filter(c => c !== res);
  });
});

// ── Broadcast to all connected browsers ────────────────────
function broadcast(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(c => c.write(msg));
}

// ── WEBHOOK: TradingView calls this ───────────────────────
app.post('/webhook', (req, res) => {
  const body = req.body;
  if (!body || !body.type) return res.status(400).json({ error: 'Invalid payload' });

  const signal = {
    ...body,
    time: new Date().toISOString(),
    id:   Date.now()
  };

  signals.push(signal);
  if (signals.length > 50) signals.shift();

  broadcast({ type: 'signal', signal });
  console.log('Signal received:', signal);
  res.json({ ok: true });
});

// ── Test endpoint (browser se test karo) ──────────────────
app.post('/test', (req, res) => {
  const body = req.body;
  if (!body || !body.type) return res.status(400).json({ error: 'Invalid' });

  const signal = {
    ...body,
    time: new Date().toISOString(),
    id:   Date.now()
  };

  signals.push(signal);
  if (signals.length > 50) signals.shift();

  broadcast({ type: 'signal', signal });
  res.json({ ok: true });
});

// ── Get all signals (REST fallback) ───────────────────────
app.get('/signals', (req, res) => res.json(signals));

// ── Clear all signals ─────────────────────────────────────
app.delete('/signals', (req, res) => {
  signals = [];
  broadcast({ type: 'clear' });
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`🥇 XAUUSD Server running on port ${PORT}`));
