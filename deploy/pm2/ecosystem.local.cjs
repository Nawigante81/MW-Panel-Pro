module.exports = {
  apps: [
    {
      name: 'mwpanel-api',
      script: 'server/index.js',
      cwd: '/home/acid/v5',
      env_file: '.env',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        API_PORT: 8787,
      },
    },
    {
      name: 'mwpanel-frontend',
      script: 'npm',
      args: 'run preview -- --host 0.0.0.0 --port 4173',
      cwd: '/home/acid/v5',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
