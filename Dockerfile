FROM node:18-slim

# Install dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    cron \
    curl \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Build the frontend
RUN npm run build

# Expose port 80
EXPOSE 80

# Start the application
CMD ["npm", "start"] 