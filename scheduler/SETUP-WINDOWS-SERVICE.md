# Setup PM2 as Windows Service with NSSM

## Prerequisites
- PM2 installed globally: `npm install -g pm2`
- Your PM2 processes configured and saved: `pm2 save`
- NSSM downloaded from https://nssm.cc/download

## Step-by-Step Instructions

### 1. Save PM2 Process List
First, ensure your workers are running and save the state:
```powershell
cd C:\Users\lenovo\Desktop\EmailSchedulerMicroService\scheduler
pm2 start ecosystem.config.js
pm2 save
```

### 2. Install NSSM
1. Download NSSM from https://nssm.cc/download
2. Extract the zip file to `C:\nssm`
3. You should now have `C:\nssm\win64\nssm.exe` (or win32 for 32-bit systems)

### 3. Create the Windows Service
Open **Command Prompt as Administrator** and run:

```powershell
cd C:\nssm\win64
nssm install PM2-EmailScheduler
```

### 4. Configure the Service in NSSM GUI
When the NSSM window opens:

#### Application Tab:
- **Path**: `C:\Program Files\nodejs\node.exe` (or wherever node.exe is located)
  - To find node.exe: Run `where node` in Command Prompt
- **Startup directory**: `C:\Users\lenovo\Desktop\EmailSchedulerMicroService\scheduler`
- **Arguments**: `C:\Users\lenovo\AppData\Roaming\npm\node_modules\pm2\bin\pm2 resurrect`

#### Details Tab (Optional):
- **Display name**: PM2 Email Scheduler Service
- **Description**: Manages email scheduler background workers

#### Log on Tab:
- Select **Local System account**
- Check **Allow service to interact with desktop** (optional, for debugging)

#### I/O Tab (Optional - for logging):
- **Output (stdout)**: `C:\Users\lenovo\Desktop\EmailSchedulerMicroService\scheduler\logs\pm2-service-out.log`
- **Error (stderr)**: `C:\Users\lenovo\Desktop\EmailSchedulerMicroService\scheduler\logs\pm2-service-error.log`

### 5. Install and Start the Service
1. Click **Install service**
2. Start the service from Command Prompt (Administrator):
   ```powershell
   nssm start PM2-EmailScheduler
   ```
   Or start it from Windows Services (press Win+R, type `services.msc`)

### 6. Verify the Service
1. Check service status:
   ```powershell
   nssm status PM2-EmailScheduler
   ```
2. Check PM2 processes:
   ```powershell
   pm2 status
   ```

## Managing the Service
- **Start**: `nssm start PM2-EmailScheduler`
- **Stop**: `nssm stop PM2-EmailScheduler`
- **Restart**: `nssm restart PM2-EmailScheduler`
- **Remove**: `nssm remove PM2-EmailScheduler confirm`

## Updating PM2 Processes
If you make changes to your ecosystem.config.js:
1. Update your processes: `pm2 restart ecosystem.config.js`
2. Save the new state: `pm2 save`
3. The service will automatically load the new state on next boot

## Troubleshooting
- Check service logs in `scheduler/logs/pm2-service-out.log` and `pm2-service-error.log`
- Check PM2 logs with `pm2 logs`
- Make sure node.exe path is correct in NSSM configuration
