# RadioRecorder - Professional Radio Show Recorder

A professional web application for scheduling and recording radio shows from internet streams. The application is containerized with Docker for easy deployment on any Linux server.

## Features

- **Simple Scheduling**: Schedule recordings with an easy-to-use day and time selection interface
- **High-Quality Audio**: Record in CD-quality audio up to 320kbps
- **Built-in Audio Player**: Listen to your recordings directly in the web interface
- **Smart Status Display**: Clear visual indicators show when recordings are in progress or completed
- **Web Interface**: Modern and responsive UI for managing recordings
- **Recording Management**: Browse, download, and delete recordings
- **Docker Containerized**: Ready to deploy on any Linux server with Docker
- **Direct IP Access**: Access the app directly via the server IP on port 80
- **Professional Look and Feel**: Clean, modern design with responsive layout

## Requirements

- Linux server with Docker and Docker Compose installed
- Internet connection for accessing radio streams
- At least 1GB of RAM and 5GB of disk space

## Installation

1. Clone this repository to your server:

```bash
git clone https://github.com/yourusername/radiorecorder.git
cd radiorecorder
```

2. Build and start the application using Docker Compose:

```bash
docker-compose up -d
```

3. Access the application by navigating to your server's IP address in a web browser.

## Usage

### Important: Configure Timezone First

Before creating any schedules, configure your timezone to ensure recordings start at the correct time:

1. Navigate to the "Settings" page
2. Change the "Time Zone" setting from the default "UTC" to your local timezone:
   - For UK users: Select "British Summer Time (BST)"
   - For other regions: Select the appropriate timezone for your location
3. Click "Save Settings"

This step is critical - if you skip it, your recordings will run according to UTC time which may be different from your local time.

### Scheduling a Recording

1. Navigate to the "Schedule" page
2. Fill out the form with the following information:
   - **Show Name**: Name for your recording
   - **Stream URL**: Direct URL to the radio stream (must be accessible from the server)
   - **Day of Week**: Select which day of the week to record (Monday through Sunday)
   - **Start Time**: Select the time when recording should start
   - **Duration**: How long to record in minutes
3. Click "Create Schedule"

### Managing Recordings

1. Navigate to the "Recordings" page
2. View a list of all your recordings
3. Use the built-in player to listen to recordings directly in the browser
4. Download or delete recordings as needed

### Status Indicators

The application shows clear status indicators for each scheduled recording:
- **Scheduled**: Waiting for the next scheduled time
- **Recording**: Currently recording the show
- **Recorded**: The show has been recorded at least once
- **Error**: An issue occurred during recording

## Updating

To update the application to the latest version:

```bash
cd radiorecorder
git pull
docker-compose down
docker-compose up -d --build
```

## Technical Details

- **Backend**: Node.js with Express
- **Frontend**: React with Next.js and Tailwind CSS
- **Recording**: FFmpeg for high-quality audio recording
- **Scheduling**: Node-cron for reliable scheduling
- **Containerization**: Docker and Docker Compose

## Troubleshooting

- **Missing recordings**: Check if the stream URL is accessible from the server
- **Scheduling issues**: Verify that your day and time selections are correct
- **Access problems**: Ensure that port 80 is open in your server's firewall
- **Incorrect recording times**: Make sure your timezone is properly configured in Settings

## License

MIT License

## Support

For issues or feature requests, please open an issue on the GitHub repository.

---

Built with ❤️ for radio enthusiasts. 