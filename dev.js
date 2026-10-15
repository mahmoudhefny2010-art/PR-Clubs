const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
// Read the launcher's port without copying database settings into its process
// environment. Each server restart must load the latest .env itself.
const localEnv = {};
require('dotenv').config({ processEnv: localEnv });

const port = Number(process.env.PORT || localEnv.PORT || 1111);
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
    const watcher = spawn(process.execPath, [
      '--watch',
      '--watch-preserve-output',
      'server.js'
    ], {
      cwd: __dirname,
      env: process.env,
      windowsHide: true,
      stdio: 'inherit'
    });

    watcher.once('error', (error) => {
      console.error('Could not start development watcher:', error.name);
      process.exit(1);
    });

    watcher.once('exit', (code) => {
      process.exitCode = code ?? 1;
    });
  });
});
