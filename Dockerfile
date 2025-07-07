# Stage 1: Build the frontend (Angular)
FROM node:18 AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build -- --configuration=production

# Stage 2: Set up the backend (Node.js)
FROM node:18-slim
# Install curl for health checks
# RUN apt-get update && apt-get install -y --no-install-recommends curl && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --only=production
COPY backend/ ./backend

# Copy the built frontend files into the backend's static directory
COPY --from=frontend-build /app/frontend/dist/frontend/browser /app/backend/public

# Run as non-root user for security
USER node

# Expose the backend port
EXPOSE 3000

# Environment variables (default values, can be overridden)
ENV PORT=3000
ENV NODE_ENV=production

# Start the backend server
CMD ["node", "backend/server.js"]