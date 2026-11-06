const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  // 1. Arahkan semua request /api/* ke handler Supabase
  if (p.startsWith('/api/') || p === '/api') {
    const apiHandler = require('./api/index.js');
    return apiHandler(req, res);
  }

  // 2. Sajikan index.html untuk root atau /index.html
  if (p === '/' || p === '/index.html') {
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
  }

  // 3. Fallback 404
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
};

// Jika dijalankan langsung (misal: node index.js)
if (require.main === module) {
  const http = require('http');
  const port = process.env.PORT || 3000;
  http.createServer(module.exports).listen(port, () => {
    console.log(`Server jalan di http://localhost:${port}`);
  });
}
