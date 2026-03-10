module.exports = {
  apps: [
    {
      name: "apex-bot-v5",
      script: "./apex-bot-v5.js",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      },
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      instances: 1
    }
  ]
};
