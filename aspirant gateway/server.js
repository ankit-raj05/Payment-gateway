const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const STORE = path.join(ROOT, 'data.json');
const MAX_BODY = 3 * 1024 * 1024;

const programs = {
  class10: { name: 'Class 10 — NIOS Enrollment + Full Documentation', fee: 5999 },
  class11: { name: 'Class 11 — NIOS Enrollment + 2-Year Support', fee: 7999 },
  class12: { name: 'Class 12 — NIOS Full Guidance Program', fee: 9999 },
  combo1112: { name: '11th + 12th Combo — Complete 2-Year Package', fee: 14999 },
  combo101112: { name: '10+11+12 Combo — Complete 3-Year Package', fee: 19999 },
};

function readStore() {
  try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); }
  catch { return { applications: [] }; }
}
function writeStore(data) { fs.writeFileSync(STORE, JSON.stringify(data, null, 2), 'utf8'); }
function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; let text = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY) { reject(new Error('Upload must be smaller than 2 MB.')); req.destroy(); return; }
      text += chunk;
    });
    req.on('end', () => { try { resolve(JSON.parse(text)); } catch { reject(new Error('Invalid request.')); } });
    req.on('error', reject);
  });
}
function isAdmin(req) {
  return Boolean(ADMIN_PASSWORD) && req.headers['x-admin-password'] === ADMIN_PASSWORD;
}
function safeFile(req, res, pathname) {
  const file = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const resolved = path.resolve(PUBLIC, file);
  if (!resolved.startsWith(PUBLIC)) return send(res, 403, { error: 'Forbidden' });
  fs.readFile(resolved, (error, content) => {
    if (error) return send(res, 404, { error: 'Not found' });
    const ext = path.extname(resolved);
    const mime = ext === '.html' ? 'text/html; charset=utf-8' : ext === '.js' ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8';
    send(res, 200, content, mime);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/programs') return send(res, 200, programs);

    if (req.method === 'POST' && url.pathname === '/api/applications') {
      const body = await parseBody(req);
      const program = programs[body.program];
      const required = ['name', 'dob', 'phone', 'city', 'program', 'paymentMode'];
      if (required.some(key => !String(body[key] || '').trim()) || !program) return send(res, 400, { error: 'Please fill all required fields.' });
      if (!/^\d{10}$/.test(String(body.phone).replace(/\D/g, ''))) return send(res, 400, { error: 'Enter a valid 10-digit mobile number.' });
      if (body.paymentMode === 'full' && (!body.utr || !body.screenshot)) return send(res, 400, { error: 'UTR and payment screenshot are required for full payment.' });
      if (body.screenshot && !/^data:image\/(png|jpeg|webp);base64,/.test(body.screenshot)) return send(res, 400, { error: 'Upload a PNG, JPG, or WebP screenshot.' });
      const now = new Date().toISOString();
      const app = {
        id: `AOS-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
        createdAt: now, updatedAt: now, status: 'pending',
        name: String(body.name).trim(), dob: body.dob, phone: String(body.phone).replace(/\D/g, ''),
        email: String(body.email || '').trim(), fatherName: String(body.fatherName || '').trim(), city: String(body.city).trim(),
        currentClass: String(body.currentClass || '').trim(), address: String(body.address || '').trim(),
        program: body.program, programName: program.name, amount: program.fee,
        paymentMode: body.paymentMode, utr: String(body.utr || '').trim(), screenshot: body.screenshot || null,
        adminNote: '',
      };
      const store = readStore(); store.applications.unshift(app); writeStore(store);
      return send(res, 201, { id: app.id, status: app.status, mode: app.paymentMode });
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/status/')) {
      const id = decodeURIComponent(url.pathname.split('/').pop());
      const phone = String(url.searchParams.get('phone') || '').replace(/\D/g, '');
      const app = readStore().applications.find(x => x.id === id && x.phone === phone);
      if (!app) return send(res, 404, { error: 'Application not found. Check your ID and mobile number.' });
      return send(res, 200, { id: app.id, name: app.name, programName: app.programName, amount: app.amount, status: app.status, adminNote: app.adminNote, updatedAt: app.updatedAt });
    }

    if (url.pathname === '/api/admin/applications') {
      if (!isAdmin(req)) return send(res, 401, { error: 'Admin access denied. Set ADMIN_PASSWORD before using the dashboard.' });
      if (req.method === 'GET') return send(res, 200, readStore().applications);
      if (req.method === 'PATCH') {
        const body = await parseBody(req);
        if (!['approved', 'rejected', 'pending'].includes(body.status)) return send(res, 400, { error: 'Invalid status.' });
        const store = readStore(); const app = store.applications.find(x => x.id === body.id);
        if (!app) return send(res, 404, { error: 'Application not found.' });
        app.status = body.status; app.adminNote = String(body.adminNote || '').trim().slice(0, 500); app.updatedAt = new Date().toISOString();
        writeStore(store); return send(res, 200, { ok: true, application: app });
      }
    }
    if (req.method === 'GET') return safeFile(req, res, url.pathname);
    return send(res, 404, { error: 'Not found' });
  } catch (error) { return send(res, 400, { error: error.message || 'Request failed.' }); }
}).listen(PORT, () => console.log(`Aspirant payment portal: http://localhost:${PORT}`));
