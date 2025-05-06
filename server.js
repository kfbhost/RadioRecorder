const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const nodeCron = require('node-cron');
const { DateTime } = require('luxon');
const winston = require('winston');

// Create recordings directory if it doesn't exist
const recordingsDir = path.join(__dirname, 'recordings');
if (!fs.existsSync(recordingsDir)) {
  fs.mkdirSync(recordingsDir, { recursive: true });
}

// Create settings.json if it doesn't exist
const settingsPath = path.join(__dirname, 'settings.json');
if (!fs.existsSync(settingsPath)) {
  // Create default settings with timezone comment
  const defaultSettings = {
    recordingFormat: 'mp3',
    audioQuality: 'medium',
    storagePath: '/app/recordings',
    timeZone: 'UTC', // IMPORTANT: Users should change this to their local timezone (e.g., 'Europe/Belfast' for BST)
  };
  
  fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));
  logger.info('Created default settings.json file. Users should update the timeZone for their region.');
}

// Create schedules.json path
const schedulesPath = path.join(__dirname, 'schedules.json');

// Setup logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({ format: winston.format.simple() })
  ]
});

// Initialize Express app
const app = express();
const PORT = 80;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'dist')));

// Store scheduled jobs
const scheduledJobs = {};

// Load saved schedules from file
function loadSchedules() {
  try {
    if (fs.existsSync(schedulesPath)) {
      const savedSchedules = JSON.parse(fs.readFileSync(schedulesPath, 'utf8'));
      
      // Restore each saved schedule
      Object.entries(savedSchedules).forEach(([id, jobData]) => {
        try {
          if (nodeCron.validate(jobData.schedule)) {
            // Get time zone from settings
            let timeZone = 'UTC';
            try {
              const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
              timeZone = settings.timeZone;
            } catch (error) {
              logger.error('Error reading settings for time zone:', error);
            }
            
            // Create new cron job with time zone
            const job = nodeCron.schedule(jobData.schedule, () => {
              startRecording(id, jobData.name, jobData.url, jobData.duration);
            }, {
              timezone: timeZone
            });
            
            // Restore the job with active cron job
            scheduledJobs[id] = {
              ...jobData,
              job, // Reference to the actual cron job
              status: 'scheduled', // Reset status on reload
            };
            
            logger.info(`Restored scheduled recording: ${jobData.name} with schedule: ${jobData.schedule}`);
          } else {
            logger.error(`Invalid cron expression when loading schedule: ${jobData.schedule}`);
          }
        } catch (err) {
          logger.error(`Error restoring schedule ${id}:`, err);
        }
      });
      
      logger.info(`Loaded ${Object.keys(scheduledJobs).length} schedules`);
    }
  } catch (error) {
    logger.error('Error loading schedules:', error);
  }
}

// Save schedules to file
function saveSchedules() {
  try {
    // Create a stripped version of scheduledJobs without circular references
    const jobsToSave = Object.entries(scheduledJobs).reduce((acc, [id, jobData]) => {
      // Remove the job object which can't be serialized
      const { job, recordingProcess, ...serializableData } = jobData;
      acc[id] = serializableData;
      return acc;
    }, {});
    
    fs.writeFileSync(schedulesPath, JSON.stringify(jobsToSave, null, 2));
    logger.info(`Saved ${Object.keys(jobsToSave).length} schedules`);
  } catch (error) {
    logger.error('Error saving schedules:', error);
  }
}

// Load schedules on startup
loadSchedules();

// Routes
app.get('/api/scheduled-shows', (req, res) => {
  try {
    const shows = Object.keys(scheduledJobs).map(id => {
      // Remove circular references for JSON response
      const { job, recordingProcess, ...jobData } = scheduledJobs[id];
      return {
        id,
        ...jobData
      };
    });
    res.json(shows);
  } catch (error) {
    logger.error('Error fetching scheduled shows:', error);
    res.status(500).json({ error: 'Failed to fetch scheduled shows' });
  }
});

app.post('/api/schedule', (req, res) => {
  try {
    const { name, url, schedule, duration } = req.body;
    
    if (!name || !url || !schedule || !duration) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const id = Date.now().toString();
    
    // Validate cron expression
    if (!nodeCron.validate(schedule)) {
      return res.status(400).json({ error: 'Invalid cron schedule expression' });
    }
    
    // Get time zone from settings
    let timeZone = 'UTC';
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      timeZone = settings.timeZone;
    } catch (error) {
      logger.error('Error reading settings for time zone:', error);
    }
    
    // Create and start the cron job
    const job = nodeCron.schedule(schedule, () => {
      startRecording(id, name, url, duration);
    }, {
      timezone: timeZone
    });
    
    // Store the job properly
    scheduledJobs[id] = {
      name,
      url,
      schedule,
      duration,
      status: 'scheduled',
      createdAt: new Date().toISOString(),
      job // Store job reference so we can stop it later
    };
    
    // Save to file
    saveSchedules();
    
    logger.info(`Scheduled recording: ${name} with schedule: ${schedule}`);
    res.json({ id, message: 'Recording scheduled successfully' });
  } catch (error) {
    logger.error('Error scheduling recording:', error);
    res.status(500).json({ error: 'Failed to schedule recording' });
  }
});

app.delete('/api/schedule/:id', (req, res) => {
  const { id } = req.params;
  
  if (scheduledJobs[id]) {
    try {
      // Stop the cron job
      const job = scheduledJobs[id].job;
      if (job) {
        job.stop();
      }
      
      // Remove from our tracking
      delete scheduledJobs[id];
      
      // Save updated schedules
      saveSchedules();
      
      logger.info(`Removed scheduled recording with ID: ${id}`);
      res.json({ message: 'Schedule removed successfully' });
    } catch (error) {
      logger.error(`Error deleting schedule ${id}:`, error);
      res.status(500).json({ error: 'Failed to delete schedule' });
    }
  } else {
    res.status(404).json({ error: 'Schedule not found' });
  }
});

app.get('/api/recordings', (req, res) => {
  try {
    const files = fs.readdirSync(recordingsDir);
    const recordings = files
      .filter(file => file.endsWith('.mp3') || file.endsWith('.ogg'))
      .map(file => {
        const stats = fs.statSync(path.join(recordingsDir, file));
        return {
          name: file,
          size: stats.size,
          createdAt: stats.birthtime,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
      
    res.json(recordings);
  } catch (error) {
    logger.error('Error fetching recordings:', error);
    res.status(500).json({ error: 'Failed to fetch recordings' });
  }
});

app.get('/api/recordings/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(recordingsDir, filename);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'Recording not found' });
  }
});

app.delete('/api/recordings/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(recordingsDir, filename);
  
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    logger.info(`Deleted recording: ${filename}`);
    res.json({ message: 'Recording deleted successfully' });
  } else {
    res.status(404).json({ error: 'Recording not found' });
  }
});

// Add system info API endpoint
app.get('/api/system-info', (req, res) => {
  try {
    // Get disk space information
    const getDiskSpace = () => {
      return new Promise((resolve, reject) => {
        exec('df -h /app/recordings', (error, stdout, stderr) => {
          if (error) {
            reject(error);
            return;
          }
          
          // Parse the output to get disk information
          const lines = stdout.trim().split('\n');
          if (lines.length >= 2) {
            const diskInfo = lines[1].split(/\s+/);
            resolve({
              filesystem: diskInfo[0],
              size: diskInfo[1],
              used: diskInfo[2],
              available: diskInfo[3],
              usedPercentage: diskInfo[4]
            });
          } else {
            reject(new Error('Unable to parse disk space information'));
          }
        });
      });
    };
    
    // Get FFmpeg version
    const getFFmpegVersion = () => {
      return new Promise((resolve, reject) => {
        exec('ffmpeg -version', (error, stdout, stderr) => {
          if (error) {
            reject(error);
            return;
          }
          
          // Extract version from the output
          const versionMatch = stdout.match(/ffmpeg version (\S+)/);
          if (versionMatch && versionMatch[1]) {
            resolve(versionMatch[1]);
          } else {
            resolve('Unknown');
          }
        });
      });
    };
    
    // Execute both promises in parallel
    Promise.all([getDiskSpace(), getFFmpegVersion()])
      .then(([diskSpace, ffmpegVersion]) => {
        res.json({
          version: '1.1.0',
          ffmpegVersion,
          diskSpace,
          serverTime: new Date().toISOString()
        });
      })
      .catch(error => {
        logger.error('Error getting system info:', error);
        res.status(500).json({ 
          error: 'Failed to get system information',
          message: error.message 
        });
      });
  } catch (error) {
    logger.error('Error in system info endpoint:', error);
    res.status(500).json({ error: 'Failed to get system information' });
  }
});

// Settings endpoint
app.get('/api/settings', (req, res) => {
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    res.json(settings);
  } catch (error) {
    logger.error('Error reading settings:', error);
    res.status(500).json({ error: 'Failed to read settings' });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const newSettings = req.body;
    
    // Validate required fields
    if (!newSettings.recordingFormat || !newSettings.audioQuality || 
        !newSettings.storagePath || !newSettings.timeZone) {
      return res.status(400).json({ error: 'Missing required settings fields' });
    }
    
    // Save settings
    fs.writeFileSync(settingsPath, JSON.stringify(newSettings, null, 2));
    logger.info('Settings updated');
    res.json({ message: 'Settings saved successfully' });
  } catch (error) {
    logger.error('Error saving settings:', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// Handle React routing, return all requests to React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start recording function
function startRecording(id, name, url, duration) {
  try {
    // Format the date as YYYY-MM-DD_HH-MM
    const timestamp = DateTime.now().toFormat('yyyy-MM-dd_HH-mm');
    
    // Keep the original show name but replace invalid characters for filenames
    const safeShowName = name.replace(/[<>:"/\\|?*]/g, '-');
    
    // Construct filename as ShowName_YYYY-MM-DD_HH-MM.mp3
    const filename = `${safeShowName}_${timestamp}.mp3`;
    const outputPath = path.join(recordingsDir, filename);
    
    logger.info(`Starting recording of ${name} (ID: ${id}) for ${duration} minutes`);
    
    // Update job status
    if (!scheduledJobs[id]) {
      logger.error(`Cannot find scheduled job with ID: ${id}`);
      return;
    }
    
    scheduledJobs[id].status = 'recording';
    scheduledJobs[id].currentRecording = filename;
    
    // Save status update
    saveSchedules();
    
    // Convert duration to seconds
    const durationSeconds = duration * 60;
    
    // Get audio quality from settings with specific bitrates
    let audioBitrate = '192k'; // Default medium quality (192 kbps)
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (settings.audioQuality === 'low') {
        audioBitrate = '96k';  // Low quality (96 kbps)
      } else if (settings.audioQuality === 'medium') {
        audioBitrate = '192k'; // Medium quality (192 kbps)
      } else if (settings.audioQuality === 'high') {
        audioBitrate = '320k'; // High quality (320 kbps)
      }
      logger.info(`Using audio bitrate: ${audioBitrate} for recording ${name}`);
    } catch (error) {
      logger.error('Error reading settings for audio quality:', error);
    }
    
    // Start FFmpeg recording process with constant bitrate encoding
    const ffmpegCommand = `ffmpeg -y -i "${url}" -t ${durationSeconds} -c:a libmp3lame -b:a ${audioBitrate} "${outputPath}"`;
    
    logger.info(`Executing command: ${ffmpegCommand}`);
    
    const recordingProcess = exec(ffmpegCommand, (error, stdout, stderr) => {
      if (error) {
        logger.error(`Recording error for ${name} (ID: ${id}): ${error.message}`);
        if (scheduledJobs[id]) {
          scheduledJobs[id].status = 'error';
          scheduledJobs[id].error = error.message;
          saveSchedules();
        }
        return;
      }
      
      logger.info(`Recording completed successfully: ${filename}`);
      
      // Update job status
      if (scheduledJobs[id]) {
        scheduledJobs[id].status = 'scheduled';
        scheduledJobs[id].lastRecording = filename;
        delete scheduledJobs[id].currentRecording;
        delete scheduledJobs[id].error; // Clear any previous errors
        saveSchedules();
      }
    });
    
    // Save reference to the recording process
    if (scheduledJobs[id]) {
      scheduledJobs[id].recordingProcess = recordingProcess;
    }
    
    // Handle early termination
    setTimeout(() => {
      if (recordingProcess && !recordingProcess.killed) {
        try {
          recordingProcess.kill();
          logger.info(`Terminated recording after ${duration} minutes: ${filename}`);
          
          // Update job status if it's still in recording state
          if (scheduledJobs[id] && scheduledJobs[id].status === 'recording') {
            scheduledJobs[id].status = 'scheduled';
            scheduledJobs[id].lastRecording = filename;
            delete scheduledJobs[id].currentRecording;
            saveSchedules();
          }
        } catch (error) {
          logger.error(`Error terminating recording process: ${error.message}`);
        }
      }
    }, (durationSeconds * 1000) + 5000); // Add 5 seconds buffer
  } catch (error) {
    logger.error(`Unexpected error in startRecording: ${error.message}`);
    if (scheduledJobs[id]) {
      scheduledJobs[id].status = 'error';
      scheduledJobs[id].error = `Internal error: ${error.message}`;
      saveSchedules();
    }
  }
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server running on port ${PORT}`);
}); 