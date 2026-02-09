#!/bin/bash

# Automated Docker Cleanup Script
# Removes stopped exam containers and unused images
# SAFE: Only removes STOPPED containers, never running ones

LOGFILE=~/docker-cleanup.log

echo "=== Docker Cleanup - $(date) ===" >> $LOGFILE

# Check if any exam is currently running
RUNNING_EXAMS=$(docker ps --filter name=exam- --filter status=running -q | wc -l)
if [ $RUNNING_EXAMS -gt 0 ]; then
    echo "Active exam detected ($RUNNING_EXAMS containers) - safe mode" >> $LOGFILE
fi

# Remove ONLY stopped exam containers (NEVER running ones)
echo "Removing stopped exam containers..." >> $LOGFILE
STOPPED=$(docker ps -a --filter name=exam- --filter status=exited -q)
if [ -n "$STOPPED" ]; then
    echo "$STOPPED" | xargs docker rm >> $LOGFILE 2>&1
else
    echo "No stopped containers" >> $LOGFILE
fi

# Only prune images if NO exam running (preserve alpine:3.20 in cache)
if [ $RUNNING_EXAMS -eq 0 ]; then
    echo "Pruning unused images..." >> $LOGFILE
    docker image prune -af >> $LOGFILE 2>&1
else
    echo "Skipping image prune (exam running)" >> $LOGFILE
fi

# Disk usage
df -h / >> $LOGFILE
echo "" >> $LOGFILE
