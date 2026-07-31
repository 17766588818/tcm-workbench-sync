'use strict';
/*
 * 中药饮片工作台 · 云端同步服务端（零依赖，仅需 Node >= 18）
 *
 * 功能：
 *   - GET  /api/health        健康检查
 *   - GET  /api/db?key=...     拉取全部业务数据 { rev, data, updatedAt }
 *   - PUT  /api/db  (body:{data,rev}, header x-access-key)
 *                              推送数据；基于 rev 的乐观锁，冲突返回 409 + 远端数据
 *   - 可选：托管 public/ 下的静态文件（部署后一个 URL 同时提供 App 与 API）
 *
 * 数据以单个 JSON 文件持久化（适合个人单用户工作台）。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '3000', 10);
const ACCESS_KEY = process.env.ACCESS_KEY || 'change-me-please';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'db.json');
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(__dirname, 'public');

fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });

function loadStore() {
  try {
    const s = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (typeof s.rev === 'number' && s.data) return s;
  } catch (e) { /* ignore */ }
  return { rev: 0, data: { tables: {} }, updatedAt: 0 };
}
let store = loadStore();
let _saveTimer = null;
function saveStore() {
  // 防抖写盘，避免高频推送时频繁 IO
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    try { fs.writeFileSync(DATA_FILE, JSON.stringify(store)); }
    catch (e) { console.error('save failed:', e.message); }
  }, 200);
}

function sendJSON(res, code, obj, extra) {
  const headers = Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-access-key',
    'Cache-Control': 'no-store',
  }, extra || {});
  res.writeHead(code, headers);
  res.end(JSON.stringify(obj));
}

function getKey(req, url) {
  const h = req.headers['x-access-key'];
  if (h) return h;
  return url.searchParams.get('key') || '';
}
function validKey(k) {
  if (!k || k.length !== ACCESS_KEY.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(k), Buffer.from(ACCESS_KEY)); }
  catch (e) { return false; }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // CORS 预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-access-key',
    });
    return res.end();
  }

  // ---------- API ----------
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname === '/api/health') {
      return sendJSON(res, 200, { ok: true, rev: store.rev, time: Date.now() });
    }
    if (url.pathname === '/api/db') {
      if (!validKey(getKey(req, url))) return sendJSON(res, 401, { error: 'unauthorized' });

      if (req.method === 'GET') {
        return sendJSON(res, 200, { rev: store.rev, data: store.data, updatedAt: store.updatedAt });
      }

      if (req.method === 'PUT' || req.method === 'POST') {
        let body = '';
        req.on('data', c => { body += c; if (body.length > 50 * 1024 * 1024) req.destroy(); });
        req.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(body); }
          catch (e) { return sendJSON(res, 400, { error: 'bad json' }); }
          const data = parsed && parsed.data;
          const baseRev = (parsed && typeof parsed.rev === 'number') ? parsed.rev : 0;
          if (!data || typeof data !== 'object') return sendJSON(res, 400, { error: 'missing data' });
          // 乐观锁：若服务端已有数据且 rev 不一致 -> 冲突
          if (store.rev !== 0 && baseRev !== store.rev) {
            return sendJSON(res, 409, { error: 'conflict', rev: store.rev, data: store.data, updatedAt: store.updatedAt });
          }
          store = { rev: store.rev + 1, data: data, updatedAt: Date.now() };
          saveStore();
          return sendJSON(res, 200, { rev: store.rev, updatedAt: store.updatedAt });
        });
        return;
      }
      return sendJSON(res, 405, { error: 'method not allowed' });
    }
    return sendJSON(res, 404, { error: 'not found' });
  }

  // ---------- 静态托管（可选） ----------
  if (fs.existsSync(PUBLIC_DIR)) {
    let p = decodeURIComponent(url.pathname);
    if (p === '/') p = '/index.html';
    const fp = path.join(PUBLIC_DIR, path.normalize(p));
    // 防目录穿越
    if (fp.startsWith(PUBLIC_DIR) && fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      const ext = path.extname(fp).toLowerCase();
      const hd = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
      // sw.js / html 不让浏览器长缓存，保证更新即时生效
      if (path.basename(fp) === 'sw.js' || ext === '.html') hd['Cache-Control'] = 'no-cache';
      res.writeHead(200, hd);
      return fs.createReadStream(fp).pipe(res);
    }
    // SPA 回退到 index.html
    const idx = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(idx)) {
      res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
      return fs.createReadStream(idx).pipe(res);
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`[tcm-sync] listening on http://0.0.0.0:${PORT}`);
  console.log(`[tcm-sync] access-key ${ACCESS_KEY === 'change-me-please' ? 'IS DEFAULT (please set ACCESS_KEY)' : 'configured'}`);
  console.log(`[tcm-sync] static dir ${fs.existsSync(PUBLIC_DIR) ? 'enabled (' + PUBLIC_DIR + ')' : 'disabled'}`);
});
