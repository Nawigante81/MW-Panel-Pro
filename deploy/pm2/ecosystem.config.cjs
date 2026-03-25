module.exports = {
  apps: [
    {
      name: 'mwpanel-api',
      script: 'server/index.js',
      cwd: '/home/ubuntu/mw',
      node_args: '--env-file=.env',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
        API_PORT: 8787,
        EMAIL_QUEUE_POLL_INTERVAL_MS: 5000,
        EMAIL_QUEUE_BATCH_SIZE: 3,
      },
    },
    {
      name: 'mwpanel-web',
      script: 'npm',
      args: 'run preview -- --host 0.0.0.0 --port 5173',
      cwd: '/home/ubuntu/mw',
      interpreter: 'none',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'development',
      },
    },
  ],
}
