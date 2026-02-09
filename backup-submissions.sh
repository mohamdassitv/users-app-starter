#!/bin/bash

# Daily Backup Script for Candidate Submissions
# NEVER deletes any submission data - only creates backups

BACKUP_DIR="/home/ubuntu/backups"
DATE=$(date +%Y%m%d_%H%M%S)
LOGFILE="$HOME/backup.log"

echo "=== Submission Backup - $(date) ===" >> $LOGFILE

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup state.json (contains all candidate data and answers)
if [ -f "/home/ubuntu/app/lab/state/state.json" ]; then
    cp /home/ubuntu/app/lab/state/state.json $BACKUP_DIR/state_$DATE.json
    echo "Backed up state.json" >> $LOGFILE
fi

# Backup all session directories (contains answer files)
if [ -d "/home/ubuntu/app/lab/state/sessions" ]; then
    tar -czf $BACKUP_DIR/sessions_$DATE.tar.gz -C /home/ubuntu/app/lab/state sessions/
    echo "Backed up sessions directory" >> $LOGFILE
fi

# Keep only last 7 days of backups (state files)
find $BACKUP_DIR -name "state_*.json" -mtime +7 -delete 2>/dev/null
find $BACKUP_DIR -name "sessions_*.tar.gz" -mtime +7 -delete 2>/dev/null

# Show backup status
echo "Current backups:" >> $LOGFILE
ls -lh $BACKUP_DIR >> $LOGFILE 2>&1

echo "Backup complete" >> $LOGFILE
echo "" >> $LOGFILE
