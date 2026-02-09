#!/bin/sh
# Setup script to simulate high disk usage on gateway-phoenix

echo "Setting up disk issue simulation for gateway-phoenix..."

# Create /var/log/crash directory with dummy crash files
mkdir -p /var/log/crash
cd /var/log/crash

echo "Creating crash dump files..."
# Create crash files (small size - just enough to simulate the scenario)
for i in $(seq 1 5); do
    dd if=/dev/zero of="crash_dump_2025_01_${i}.log" bs=1K count=100 2>/dev/null
done

# Create DLPDIR/ftp structure with subdirectories
export DLPDIR="/opt/dlp"
mkdir -p $DLPDIR/ftp

cd $DLPDIR/ftp

echo "Creating FTP transfer directories..."
# Create directories that match the cleanup patterns in the playbook (minimal files)
for i in $(seq 0 3); do
    mkdir -p "0${i}_transfer"
    mkdir -p "1${i}_backup"
    mkdir -p "3${i}_temp"
    # Add small dummy files in each directory
    for j in $(seq 1 2); do
        dd if=/dev/zero of="0${i}_transfer/file_${j}.dat" bs=1K count=10 2>/dev/null
        dd if=/dev/zero of="1${i}_backup/backup_${j}.dat" bs=1K count=10 2>/dev/null
        dd if=/dev/zero of="3${i}_temp/temp_${j}.dat" bs=1K count=10 2>/dev/null
    done
done

# Set the DLPDIR environment variable permanently for the container
echo "export DLPDIR=/opt/dlp" >> /etc/profile
echo "export DLPDIR=/opt/dlp" >> /root/.profile

# Create a custom df command that shows fake high disk usage
cat > /usr/local/bin/df << 'EOFDF'
#!/bin/sh
# Custom df command that shows realistic disk usage scenario
# After cleanup, it will show reduced usage

if [ "$1" = "-h" ]; then
    # Check if cleanup has been done
    CRASH_COUNT=$(ls /var/log/crash 2>/dev/null | wc -l)
    FTP_0_COUNT=$(ls -d /opt/dlp/ftp/0* 2>/dev/null | wc -l)
    FTP_1_COUNT=$(ls -d /opt/dlp/ftp/1* 2>/dev/null | wc -l)
    
    # If crash files are removed and 0*/1* directories are gone, show lower usage
    if [ "$CRASH_COUNT" -lt 10 ] && [ "$FTP_0_COUNT" -eq 0 ] && [ "$FTP_1_COUNT" -eq 0 ]; then
        cat << EOF
Filesystem                Size      Used Available Use% Mounted on
overlay                   50G       15G       35G  30% /
tmpfs                     64M         0       64M   0% /dev
tmpfs                    7.8G         0      7.8G   0% /sys/fs/cgroup
/dev/sda1                 50G       15G       35G  30% /etc/hosts
shm                       64M         0       64M   0% /dev/shm
EOF
    else
        # Show high disk usage
        cat << EOF
Filesystem                Size      Used Available Use% Mounted on
overlay                   50G       43G        7G  86% /
tmpfs                     64M         0       64M   0% /dev
tmpfs                    7.8G         0      7.8G   0% /sys/fs/cgroup
/dev/sda1                 50G       43G        7G  86% /etc/hosts
shm                       64M         0       64M   0% /dev/shm
EOF
    fi
else
    # For non -h calls, use real df
    /bin/df "$@"
fi
EOFDF

chmod +x /usr/local/bin/df

echo "Disk issue simulation setup complete!"
echo "Current disk usage:"
/usr/local/bin/df -h /

echo ""
echo "Files created in /var/log/crash:"
ls -lh /var/log/crash | head -10

echo ""
echo "Directories in \$DLPDIR/ftp:"
ls -d $DLPDIR/ftp/*/ | head -10
