// PM2 ecosystem file for newxonvert on Iceland.
// Companion to: translation-lab (:8011), traxlate-web (:3000), traxlate-dub (:8013).
// We take port 3001 — Caddy routes /xonvert/* → 127.0.0.1:3001.

module.exports = {
  apps: [
    {
      name: 'newxonvert',
      cwd: '/root/newxonvert',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
        // basePath is empty now that we serve at new.xonvert.com root.
        NEXT_BASE_PATH: '',
      },
      // Restart only if memory > 1.5GB (stays well below the 32GB host total).
      max_memory_restart: '1500M',
      // Don't watch — restart is deploy-triggered.
      watch: false,
      // Keep a small log footprint; rotate handled by PM2 logrotate.
      out_file: '/root/.pm2/logs/newxonvert-out.log',
      error_file: '/root/.pm2/logs/newxonvert-error.log',
      merge_logs: true,
      time: true,
    },
  ],
};
