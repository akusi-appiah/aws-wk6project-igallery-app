# Stage 1: Build the frontend (Angular)
FROM node:18 AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build -- --configuration=production

# Stage 2: Set up the backend (Node.js)
FROM node:18-slim
# Install curl or wget for health checks
USER root
# RUN apt-get update && apt-get install -y curl && apt-get clean && rm -rf /var/lib/apt/lists/*
RUN apt-get update && \
    apt-get install -y curl net-tools && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --only=production
COPY backend/ ./backend

# Copy the built frontend files into the backend's static directory
COPY --from=frontend-build /app/frontend/dist/frontend/browser /app/backend/public

# Health check script (simplified)
RUN echo '#!/bin/sh\n\
curl -f http://localhost:3000/health || exit 1' > /healthcheck.sh && \
    chmod +x /healthcheck.sh

USER node 



# Expose the backend port
EXPOSE 3000

# Environment variables (default values, can be overridden)
ENV PORT=3000
ENV NODE_ENV=production

# Start the backend server
CMD ["node", "backend/server.js"]