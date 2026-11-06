const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  // Ambil path asli: dari param _path (rewrite Vercel), header proxy, atau url.pathname
  const realPath = url.searchParams.get('_path') ||
                   req.headers['x-forwarded-url'] ||
                   req.headers['x-matched-path'] ||
                   url.pathname;

  const parsedReal = new URL(realPath, 'http://localhost');
  const p = parsedReal.pathname;

  // 1. Arahkan semua request /api/* ke handler Supabase
  if (p.startsWith('/api/') || p === '/api') {
    url.searchParams.delete('_path');
    const qs = url.searchParams.toString();
    req.url = p + (qs ? '?' + qs : '');

    const apiHandler = require('./api/index.js');
    return apiHandler(req, res);
  }

  // 2. Sajikan index.html untuk tampilan web
  const htmlPath = path.join(__dirname, 'public', 'index.html');
  try {
    const html = fs.readFileSync(htmlPath, 'utf8');
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate'
    });
    return res.end(html);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Error loading index.html: ' + err.message);
  }
};

// Jika dijalankan langsung (misal: node index.js)
if (require.main === module) {
  const http = require('http');
  const port = process.env.PORT || 3000;
  http.createServer(module.exports).listen(port, () => {
    console.log(`Server jalan di http://localhost:${port}`);
  });
}
