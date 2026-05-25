const pm2 = require('pm2');
const fs = require('fs');
const path = require('path');

// pm2-logrotate configuration - set to rotate every minute
const rotateConfig = {
  max_size: '10M',
  retain: 0, // don't keep old rotated files
  compress: false,
  dateFormat: 'YYYY-MM-DD_HH-mm-ss',
  workerInterval: 60, // check every 60 seconds
  rotateInterval: '0 * * * * *', // rotate every minute (cron format)
  rotateModule: true,
};

console.log('Setting up pm2-logrotate...');

pm2.connect((err) => {
  if (err) {
    console.error('Error connecting to PM2:', err);
    process.exit(1);
  }

  console.log('Connected to PM2');

  // Set the pm2-logrotate configuration
  pm2.set('pm2-logrotate', rotateConfig, (err) => {
    if (err) {
      console.error('Error setting pm2-logrotate config:', err);
      pm2.disconnect();
      process.exit(1);
    }

    console.log('pm2-logrotate configuration set successfully!');
    console.log('Log rotation configured to run every minute');
    pm2.disconnect();
    process.exit(0);
  });
});
