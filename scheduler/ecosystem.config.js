module.exports = {
  apps: [
    {
      name: "email-scheduler-workers",
      script: "./src/workers.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
      error_file: "./logs/workers-error.log",
      out_file: "./logs/workers-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: false,
      min_uptime: "10s",
      max_restarts: 10,
      restart_delay: 4000,
    },
    {
      name: "log-cleanup-worker",
      script: "./src/log-cleanup-worker.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "100M",
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
      error_file: "./logs/log-cleanup-error.log",
      out_file: "./logs/log-cleanup-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: false,
    },
  ],
};
