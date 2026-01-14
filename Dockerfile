# Dockerfile for Railway voice-service deployment
# Must deploy from project root to access tools/ directory

FROM node:20-slim

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
COPY voice-server/package*.json ./voice-server/

# Install root dependencies (for tools/_core/ modules like ajv)
RUN npm install --ignore-scripts --no-optional || npm install --ignore-scripts

# Install voice-server dependencies
WORKDIR /app/voice-server
RUN npm install

# Copy application code
WORKDIR /app
COPY tools/ ./tools/
COPY lib/ ./lib/
COPY voice-server/ ./voice-server/
COPY prompts/ ./prompts/

# Set working directory for runtime
WORKDIR /app

# Expose port (Railway sets PORT automatically)
EXPOSE 8080

# Start command
CMD ["sh", "-c", "cd voice-server && npm start"]
