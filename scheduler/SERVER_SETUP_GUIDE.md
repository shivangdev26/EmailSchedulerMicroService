# Email Scheduler Server Setup Guide

## Key Improvements Made to Fix Cron Job Stopping Issues

### 1. **Robust Redis Connection Handling**
- Added automatic reconnection with exponential backoff
- Connection state logging for debugging
- Retry strategy prevents connection loss from stopping cron jobs

### 2. **Cron Job Persistence and Verification**
- Added `verifyAndRestartServices()` function that runs hourly
- Cron jobs are automatically reinitialized if they stop
- Retry logic for initial cron job setup

### 3. **Process Survival**
- Workers attempt to restart after uncaught exceptions
- Comprehensive error logging without crashing the process
- Graceful error handling to prevent total failures

### 4. **Server Configuration**
- Proper timeout settings (`keepAliveTimeout`, `headersTimeout`)
- Trust proxy enabled for reverse proxies
- Max connections limit for scalability

## Server Deployment Best Practices

### **1. Use a Process Manager**

**Option A: PM2 (Recommended)**
```bash
# Install PM2 globally
npm install -g pm2

# Start the application with PM2
cd scheduler
pm2 start src/server.js --name email-scheduler

# Set up PM2 to start on system boot
pm2 startup
pm2 save

# Useful PM2 commands
pm2 logs email-scheduler    # View logs
pm2 restart email-scheduler # Restart
pm2 stop email-scheduler    # Stop
pm2 monit                   # Monitor
```

**PM2 Configuration File (ecosystem.config.js):**
```javascript
module.exports = {
  apps: [{
    name: 'email-scheduler',
    script: './src/server.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    min_uptime: '10s',
    max_restarts: 10
  }]
};
```

**Option B: systemd (Linux)**
Create `/etc/systemd/system/email-scheduler.service`:
```ini
[Unit]
Description=Email Scheduler Service
After=network.target redis.service

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/EmailSchedulerMicroService/scheduler
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=10
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=email-scheduler
Environment=NODE_ENV=production
Environment=PORT=5000

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable email-scheduler
sudo systemctl start email-scheduler
sudo systemctl status email-scheduler
```

### **2. Redis Setup**

Ensure Redis is running and configured properly:

**Redis Configuration (redis.conf):**
```conf
# Persistence
save 900 1
save 300 10
save 60 10000
appendonly yes
appendfsync everysec

# Memory
maxmemory-policy allkeys-lru
maxmemory 2gb

# Connection
bind 127.0.0.1
port 6379
timeout 0
tcp-keepalive 300
```

### **3. Environment Variables (.env)**

Create a `.env` file in the scheduler directory:
```env
# Server
PORT=5000
NODE_ENV=production

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# Email Scheduler
EMAIL_SCHEDULER_PATTERN=0 0 18 * * *
EMAIL_SCHEDULER_TIMEZONE=Asia/Kolkata

# API Authentication
LOGIN_USERNAME=your-username
LOGIN_PASSWORD=your-password
UDF_QUERY_URL=https://your-api-url.com/api/query

# Logging
LOG_LEVEL=info
```

### **4. Nginx Reverse Proxy (Optional but Recommended)**

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        keepalive_timeout 65;
    }
}
```

### **5. Log Rotation**

Configure log rotation to prevent large log files:

**/etc/logrotate.d/email-scheduler:**
```
/path/to/EmailSchedulerMicroService/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
    postrotate
        [ -f /var/run/pm2.pid ] && pm2 reloadLogs > /dev/null 2>&1 || true
    endscript
}
```

### **6. Monitoring**

**Check Cron Jobs:**
```bash
# Log in to Redis
redis-cli

# List all repeatable jobs
KEYS bull:email-scheduler:*

# Check queue status
LLEN bull:email-scheduler:wait
LLEN bull:email-scheduler:active
LLEN bull:email-scheduler:delayed
```

**Health Check:**
```bash
curl http://localhost:5000/api/health
```

## Troubleshooting Common Issues

### **Cron Jobs Not Running**
1. Check Redis is running: `redis-cli ping`
2. View logs: `pm2 logs email-scheduler`
3. Verify cron jobs in Redis: `redis-cli KEYS "bull:email-scheduler:*"`
4. Check process status: `pm2 status`

### **API Calls Cause Crashes**
1. Check error logs for unhandled exceptions
2. Verify all API endpoints have proper error handling
3. Ensure PM2 is configured with autorestart

### **Redis Connection Issues**
1. Check Redis service status
2. Verify connection parameters in .env
3. Check firewall settings
4. Monitor Redis memory usage

## Key Files Modified

1. `src/server.js` - Main server with all improvements
2. `src/bullmq.js` - Redis connection with retry logic

## What to Do If Cron Jobs Stop

1. Check logs immediately
2. Restart the process: `pm2 restart email-scheduler`
3. Verify Redis is still connected
4. Check for any recent deployments or changes
5. Review server resource usage (CPU, memory, disk space)
