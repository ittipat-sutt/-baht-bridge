const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.apk': 'application/vnd.android.package-archive',
};

http.createServer((request, response) => {
  const requestedPath = request.url === '/' ? '/index.html' : request.url;
  const filePath = path.resolve(root, `.${requestedPath.split('?')[0]}`);

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    return response.end('Forbidden');
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500);
      return response.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
    }
    response.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream' });
    response.end(data);
  });
}).listen(4173, '0.0.0.0', () => {
  console.log('BahtBridge is running at http://localhost:4173');
  console.log('For another device on the same Wi-Fi, use this computer\'s IPv4 address with :4173');
});
