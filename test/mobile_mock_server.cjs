// Throwaway mock of the Rust mobile server, to debug mobile_index.html in a desktop browser.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HTML = path.join(ROOT, 'src-tauri', 'src', 'mobile_index.html');
const IMG_DIR = path.join(ROOT, 'screenshots');

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/') return send(res, 200, 'text/html', fs.readFileSync(HTML));
  if (u.pathname === '/api/state')
    return send(res, 200, 'application/json', JSON.stringify({
      authorizedFolders: [IMG_DIR], recentFolders: []
    }));
  if (u.pathname === '/api/subfolders') return send(res, 200, 'application/json', '[]');
  if (u.pathname === '/api/images') {
    const files = fs.readdirSync(IMG_DIR).filter(f => /\.(png|jpe?g|webp)$/i.test(f));
    return send(res, 200, 'application/json', JSON.stringify(
      files.map(f => ({ path: path.join(IMG_DIR, f), name: f }))));
  }
  if (u.pathname === '/api/image') {
    const p = u.searchParams.get('path');
    try { return send(res, 200, 'image/png', fs.readFileSync(p)); }
    catch (e) { return send(res, 500, 'text/plain', 'read fail'); }
  }
  if (u.pathname === '/api/action' && req.method === 'POST') {
    let b = ''; req.on('data', c => b += c); req.on('end', () => { console.log('action', b); send(res, 200, 'text/plain', 'ok'); });
    return;
  }
  send(res, 404, 'text/plain', 'nope');
});
server.listen(4399, () => console.log('mock mobile server on http://localhost:4399'));
