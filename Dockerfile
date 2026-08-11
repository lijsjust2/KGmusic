# Stage 1: Build Mobile Frontend (build platform, avoids QEMU for npm install)
FROM --platform=$BUILDPLATFORM node:20-alpine AS mobile-builder
WORKDIR /app
COPY mobile ./mobile
RUN cd mobile && npm install && npm run build

# Stage 2: Install API dependencies (build platform, avoids QEMU for npm install)
# 依赖均为纯 JS 包，可安全跨架构复制到目标镜像
FROM --platform=$BUILDPLATFORM node:20-alpine AS api-builder
WORKDIR /app
COPY KuGouMusicApi ./KuGouMusicApi
RUN cd KuGouMusicApi && npm install --production

# Stage 3: Setup Combined App (target platform)
FROM node:20-alpine AS base
WORKDIR /app

# Install Nginx
RUN apk add --no-cache nginx

# Copy API with pre-installed dependencies (from build platform to avoid QEMU)
COPY --from=api-builder /app/KuGouMusicApi ./KuGouMusicApi

# Copy built mobile frontend static assets from the mobile builder stage
COPY --from=mobile-builder /app/mobile/dist/ ./mobile-dist/

# Copy startup script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Expose ports
# For mobile frontend served by Nginx
EXPOSE 8880
# For API
EXPOSE 6521

# Copy Nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Set environment variables
ENV PORT=6521
ENV HOST=0.0.0.0
ENV FNOS_ENV=false
ENV DOWNLOAD_DIR=/app/downloads

# Create download directory (fnOS shared folder mount point)
RUN mkdir -p /app/downloads

# Use entrypoint script
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
