'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const g = require('./google');

const app = express();

// --- CORS: allow your Netlify site to call this API ---------------------
// Set ALLOWED_ORIGIN to your Netlify URL (comma-separate for several).
// If unset, all origins are allowed — fine for testing, lock it down for prod.
const allowed = process.env.ALLOWED_ORIGIN
  ? process.env.ALLOWED_ORIGIN.split(',').map((s) => s.trim())
  : true;
app.use(cors({
  origin: allowed,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-panel-token'],
}));

app.use(express.json());

const PORT = process.env.PORT || 3000;

// --- Access gate: if PANEL_TOKEN is set, every /api call must send it -----
// Strongly recommended once this is public on the internet.
app.use('/api', (req, res, next) => {
  const expected = process.env.PANEL_TOKEN;
  if (!expected) return next();
  if (req.method === 'OPTIONS') return next();
  if (req.get('x-panel-token') === expected) return next();
  return res.status(401).json({ ok: false, error: 'Wrong or missing panel token.' });
});

function explain(err) {
  const api = err?.response?.data?.error;
  if (api?.message) {
    const reason = api.errors?.[0]?.reason ? ` (${api.errors[0].reason})` : '';
    return `${api.message}${reason}`;
  }
  return err?.message || 'Unknown error';
}
function handler(fn) {
  return async (req, res) => {
    try { res.json({ ok: true, data: await fn(req) }); }
    catch (err) { console.error('[api error]', explain(err)); res.status(400).json({ ok: false, error: explain(err) }); }
  };
}

// Health check — hitting the Render URL root confirms the service is up.
app.get('/', (req, res) => res.json({ service: 'gws-reseller-backend', ok: true }));

app.get('/api/config', (req, res) => res.json({
  resellerAdmin: process.env.RESELLER_ADMIN || '',
  tokenRequired: Boolean(process.env.PANEL_TOKEN),
}));

app.post('/api/customers', handler((req) => g.createCustomer(req.body)));
app.get('/api/customers/:key', handler((req) => g.getCustomer(req.params.key)));
app.post('/api/subscriptions', handler((req) => g.createSubscription(req.body)));
app.get('/api/subscriptions', handler(() => g.listSubscriptions()));
app.post('/api/users', handler((req) => g.createUser(req.body)));
app.get('/api/users', handler((req) => g.listUsers({ actingAdmin: req.query.actingAdmin, domain: req.query.domain })));

app.listen(PORT, () => {
  console.log(`Backend listening on ${PORT}`);
  if (!process.env.SA_KEY_JSON && !process.env.SA_KEY_PATH) console.log('  ! No credentials set (SA_KEY_JSON / SA_KEY_PATH).');
  if (!process.env.RESELLER_ADMIN) console.log('  ! RESELLER_ADMIN not set — reseller calls will fail.');
});
