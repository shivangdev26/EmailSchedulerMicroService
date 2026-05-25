const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Setting up automatic log deletion (every minute)');

try {
  console.log('1. Configuring pm2-logrotate...');
  
  const configs = [
    'pm2 set pm2-logrotate:max_size 1M',
    'pm2 set pm2-logrotate:retain 0',
    'pm2 set pm2-logrotate:workerInterval 60',
    'pm2 set pm2-logrotate:compress false',
    'pm2 set pm2-logrotate:rotateInterval "0 * * * * *"'
  ];
  
  for (const cmd of configs) {
    try {
      console.log(`   Running: ${cmd}`);
      execSync(cmd, { stdio: 'inherit', cwd: __dirname });
    } catch (e) {
      console.warn(`   Warning: Failed to run command - ${e.message}`);
    }
  }
  
  console.log('\n2. pm2-logrotate configured successfully!');
  console.log('   - Logs checked every 60 seconds');
  console.log('   - Rotated every minute');
  console.log('   - Old logs deleted automatically (retain: 0)');
  console.log('\n3. Creating fallback log deletion worker...');
  
  const fallbackScript = path.join(__dirname, 'src', 'log-cleanup-worker.js');
  const fallbackContent = `const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '..', 'logs');
const maxAgeMs = 60 * 1000; // 1 minute

const cleanupLogs = () => {
  try {
    if (!fs.existsSync(logsDir)) {
      return;
    }

    const files = fs.readdirSync(logsDir);
    const now = Date.now();

    for (const file of files) {
      const filePath = path.join(logsDir, file);
      try {
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > maxAgeMs && stats.size > 0) {
          fs.truncateSync(filePath, 0);
          console.log(\`[LogCleanup] Truncated: \${file}\`);
        }
      } catch (err) {
      }
    }
  } catch (err) {
    console.error('[LogCleanup] Error:', err.message);
  }
};

console.log('[LogCleanup] Starting fallback log cleanup worker');
cleanupLogs();
setInterval(cleanupLogs, 30 * 1000); // Check every 30 seconds
`;

  fs.writeFileSync(fallbackScript, fallbackContent);
  console.log('   Fallback worker created at src/log-cleanup-worker.js');
  
  console.log('Setup complete');
  console.log('\nTo add the fallback worker to PM2, run:');
  console.log('   pm2 start src/log-cleanup-worker.js --name "log-cleanup-worker"');
  console.log('\nCurrent pm2-logrotate status:');
  try {
    execSync('pm2 conf pm2-logrotate', { stdio: 'inherit', cwd: __dirname });
  } catch (e) {
    // Ignore
  }
  
} catch (error) {
  console.error('\nError setting up log rotation:', error.message);
  process.exit(1);
}
