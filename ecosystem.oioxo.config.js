// PM2 ecosystem for the SEPARATE oioxo instance on Iceland.
// Runs the same codebase as a second process on port 3002, fully isolated from
// the live `newxonvert` process (:3001). Caddy routes oioxo.com → 127.0.0.1:3002.
module.exports = {
  apps: [
    {
      name: 'oioxo',
      cwd: '/root/oioxo',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3002',
      env: {
        NODE_ENV: 'production',
        PORT: '3002',
        NEXT_BASE_PATH: '',
      },
      max_memory_restart: '1500M',
      watch: false,
      out_file: '/root/.pm2/logs/oioxo-out.log',
      error_file: '/root/.pm2/logs/oioxo-error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
