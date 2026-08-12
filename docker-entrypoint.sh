#!/bin/sh

echo "Starting KGmusic..."
echo "FNOS_ENV=$FNOS_ENV"
echo "DOWNLOAD_DIR=$DOWNLOAD_DIR"

# Ensure download directory exists (fnOS shared folder mount point)
mkdir -p /app/downloads
# Ensure internal data directory exists (logs, auth — not visible to users)
mkdir -p /app/data

# Diagnose mount point: is it really a mounted shared folder?
MOUNT_LOG="/app/data/.mount_diagnose.log"
{
  echo "==== $(date) ===="
  echo "FNOS_ENV=$FNOS_ENV"
  echo "DOWNLOAD_DIR=$DOWNLOAD_DIR"
  echo "-- /app/downloads mounted? --"
  mount | grep /app/downloads || echo "(no mount info)"
  echo "-- /app/downloads stat --"
  ls -ld /app/downloads
  echo "-- /app/downloads contents --"
  ls -la /app/downloads | head -20
  echo "-- write test --"
  if touch /app/downloads/.writable_test 2>&1; then
    echo "WRITABLE=yes"
    rm -f /app/downloads/.writable_test
  else
    echo "WRITABLE=no"
    chmod 777 /app/downloads 2>&1 || echo "chmod failed"
    # Try again after chmod
    if touch /app/downloads/.writable_test 2>&1; then
      echo "WRITABLE_AFTER_CHMOD=yes"
      rm -f /app/downloads/.writable_test
    else
      echo "WRITABLE_AFTER_CHMOD=no — files will be written inside container (will be lost on restart)"
    fi
  fi
} > "$MOUNT_LOG" 2>&1

cat "$MOUNT_LOG"

# Start services
echo 'Mobile client running @ http://127.0.0.1:8880/'
echo 'API running @ http://127.0.0.1:6521/'

# Start API in background
cd /app/KuGouMusicApi && node app.js --platform=lite &

# Start Nginx in foreground
nginx -g 'daemon off;'
