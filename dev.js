const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
require('dotenv').config();

const port = Number(process.env.PORT || 1111);
const portProbe = net.createServer();

portProbe.once('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.log(`Site is already running at http://localhost:${port}/. Reuse that server instead of starting another.`);
    process.exit(0);
  }

  console.error(`Could not check port ${port}:`, error.code || error.name);
  process.exit(1);
});

portProbe.listen(port, () => {
  portProbe.close(() => {
    const nodemonPath = path.join(__dirname, 'node_modules', 'nodemon', 'bin', 'nodemon.js');
    const watcher = spawn(process.execPath, [
      nodemonPath,
      '--exitcrash',
      '--ignore', 'data/**',
      '--ignore', 'public/assets/img/pics/**',
      'server.js'
    ], {
      cwd: __dirname,
      env: process.env,
      stdio: 'inherit'
    });

    watcher.once('error', (error) => {
      console.error('Could not start nodemon:', error.name);
      process.exit(1);
    });

    watcher.once('exit', (code) => {
      process.exitCode = code ?? 1;
    });
  });
});