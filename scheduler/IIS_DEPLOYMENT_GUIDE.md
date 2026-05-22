# IIS Deployment Guide for Email Scheduler

## Critical Settings for IISNode to Prevent Process Recycling

### **1. Application Pool Configuration (MOST IMPORTANT!)**

IIS recycles application pools by default, which will stop your cron jobs. **Disable idle timeout and periodic recycling**:

#### Step-by-Step Application Pool Setup:

1. **Open IIS Manager**
2. **Select Application Pools**
3. **Right-click your application pool** → Advanced Settings
4. **Change these CRITICAL settings**:

   | Setting | Value | Reason |
   |---------|-------|--------|
   | **Start Mode** | AlwaysRunning | Prevents idle shutdown |
   | **Idle Time-out (minutes)** | 0 | Disables idle timeout completely |
   | **Regular Time Interval (minutes)** | 0 | Disables periodic recycling |
   | **Specific Times** | (empty) | No scheduled recycling |
   | **Disable Overlapped Recycle** | True | Prevents multiple instances |
   | **Disable Recycling for Configuration Changes** | True | No recycle on web.config changes |
   | **Maximum Worker Processes** | 1 | Only one process instance |

5. **Click OK** to save changes

---

### **2. web.config Configuration**

We've created an optimized `web.config` with these key settings:

- **nodeProcessCountPerApplication="1"**: Only one Node.js process
- **gracefulShutdownTimeout="60000"**: Give time to clean up
- **watchedFiles**: Only watch critical files to prevent excessive restarts
- **debuggingEnabled="false"**: Production mode
- **devErrorsEnabled="false"**: Production mode

---

### **3. Always Running Website**

In IIS Manager:

1. **Select your website**
2. **Right-click** → Manage Website → Advanced Settings
3. Set **Preload Enabled** = True
4. Set **Start Automatically** = True

---

### **4. Application Initialization Module**

Install and configure the Application Initialization module:

1. **Download and install** [Application Initialization Module](https://www.iis.net/downloads/microsoft/application-initialization)
2. **Add to your web.config** (inside `<system.webServer>`):

```xml
<applicationInitialization doAppInitAfterRestart="true">
  <add initializationPage="/api/health" />
</applicationInitialization>
```

---

### **5. Configure URL Rewrite for Health Checks**

Ensure your health check endpoint is accessible:

```xml
<rule name="HealthCheck" stopProcessing="true">
  <match url="^api/health$" />
  <action type="Rewrite" url="src/server.js" />
</rule>
```

---

## Complete web.config Reference

Here's the full optimized web.config with all necessary settings:

```xml
<configuration>
  <system.webServer>
    <handlers>
      <add name="iisnode" path="src/server.js" verb="*" modules="iisnode" />
    </handlers>
    
    <rewrite>
      <rules>
        <rule name="HealthCheck" stopProcessing="true">
          <match url="^api/health$" />
          <action type="Rewrite" url="src/server.js" />
        </rule>
        <rule name="app" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="src/server.js" />
        </rule>
      </rules>
    </rewrite>
    
    <security>
      <requestFiltering>
        <hiddenSegments>
          <add segment="node_modules" />
          <add segment="iisnode" />
        </hiddenSegments>
        <verbs allowUnlisted="true">
          <add verb="PUT" allowed="true" />
          <add verb="DELETE" allowed="true" />
          <add verb="PATCH" allowed="true" />
        </verbs>
        <requestLimits maxAllowedContentLength="10485760" />
      </requestFiltering>
    </security>
    
    <modules>
      <remove name="WebDAVModule" />
    </modules>
    
    <applicationInitialization doAppInitAfterRestart="true">
      <add initializationPage="/api/health" />
    </applicationInitialization>
    
    <iisnode 
      node_env="production"
      nodeProcessCountPerApplication="1"
      maxConcurrentRequestsPerProcess="1024"
      maxNamedPipeConnectionRetry="3"
      namedPipeConnectionRetryDelay="2000"
      maxNamedPipeConnectionPoolSize="512"
      maxNamedPipePooledConnectionAge="30000"
      asyncCompletionThreadCount="0"
      initialRequestBufferSize="4096"
      maxRequestBufferSize="65536"
      watchedFiles="package.json;src/server.js;src/bullmq.js"
      uncFileChangesPollingInterval="5000"
      gracefulShutdownTimeout="60000"
      loggingEnabled="true"
      logDirectory="logs/iisnode"
      debuggingEnabled="false"
      devErrorsEnabled="false"
      nodeProcessCommandLine="&quot;%programfiles%\nodejs\node.exe&quot;"
      setCurrentUserEnvironmentVariable="false"
      flushResponse="false"
      promoteServerVars="AUTH_USER,AUTH_TYPE,LOGON_USER,REMOTE_USER,REMOTE_ADDR,HTTP_HOST,HTTPS,URL,REQUEST_URI"
    />
  </system.webServer>
  
  <system.web>
    <httpRuntime executionTimeout="3600" />
  </system.web>
</configuration>
```

---

## Monitoring and Maintenance

### **Check Application Pool Status**

```powershell
# Open PowerShell as Administrator
Import-Module WebAdministration

# Check application pool state
Get-ItemProperty "IIS:\AppPools\YourAppPoolName" -Name "state"

# Start application pool if stopped
Start-WebAppPool -Name "YourAppPoolName"

# Check recycling events
Get-EventLog -LogName System -Source "WAS" -Newest 20
```

### **Check IISNode Logs**

Logs are stored in:
- Website directory → `logs/iisnode/`
- Check for `stdout.log` and `stderr.log`

### **Redis Persistence**

Ensure Redis is running as a Windows Service:
```powershell
# Check Redis service status
Get-Service redis

# Start Redis if stopped
Start-Service redis
```

---

## Common IIS Issues & Fixes

### **Issue: Cron jobs stop after idle period**
**Fix:** Set Application Pool Idle Time-out = 0

### **Issue: Process recycles every 29 hours**
**Fix:** Set Regular Time Interval = 0

### **Issue: Multiple Node.js processes running**
**Fix:** Set Maximum Worker Processes = 1

### **Issue: Process restarts on file changes**
**Fix:** Limit `watchedFiles` in web.config to only essential files

### **Issue: 500 errors on startup**
**Fix:** 
1. Check `logs/iisnode/stderr.log`
2. Verify Node.js is in PATH
3. Check file permissions

---

## Post-Deployment Checklist

✅ Application Pool: Start Mode = AlwaysRunning  
✅ Application Pool: Idle Time-out = 0  
✅ Application Pool: Regular Time Interval = 0  
✅ Application Pool: Maximum Worker Processes = 1  
✅ Website: Preload Enabled = True  
✅ web.config: Correct path to server.js  
✅ Redis: Running as Windows Service  
✅ Health Check: /api/health returns 200 OK  
✅ Logs: No errors in logs/iisnode/  

---

## Quick Test After Deployment

1. **Restart Application Pool** in IIS Manager
2. **Visit** `http://your-server/api/health` - should return success
3. **Check Redis** for cron jobs:
   ```bash
   redis-cli
   KEYS bull:email-scheduler:*
   ```
4. **Monitor** for 1-2 hours to ensure no unexpected restarts
5. **Verify** cron jobs run at scheduled times
