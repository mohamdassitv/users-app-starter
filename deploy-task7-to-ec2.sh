#!/bin/bash
# Deploy Task 7 to EC2
# =====================

EC2_IP="34.255.197.158"
PEM_FILE="ExamForNewCandidates.pem"
EC2_USER="ubuntu"

echo "========================================="
echo "🚀 Deploying Task 7 to EC2"
echo "========================================="
echo ""

# Check if PEM file exists
if [ ! -f "$PEM_FILE" ]; then
    echo "❌ Error: PEM file not found: $PEM_FILE"
    exit 1
fi

# Fix PEM file permissions
chmod 400 "$PEM_FILE"

echo "📁 Preparing files for upload..."

# Create temporary directory
TEMP_DIR="temp-task7-deploy"
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

# Copy files
cp "lab/src/public/task/waf-troubleshooting.html" "$TEMP_DIR/"
cp -r "waf-lab" "$TEMP_DIR/"

echo "✅ Files prepared"
echo ""

echo "📤 Uploading files to EC2..."

# Upload files
scp -i "$PEM_FILE" "$TEMP_DIR/waf-troubleshooting.html" "${EC2_USER}@${EC2_IP}:~/"
scp -i "$PEM_FILE" -r "$TEMP_DIR/waf-lab" "${EC2_USER}@${EC2_IP}:~/"

echo "✅ Files uploaded"
echo ""

echo "🔧 Configuring Task 7 on EC2..."

# Create remote deployment script
cat > "$TEMP_DIR/deploy-remote.sh" << 'EOFSCRIPT'
#!/bin/bash
CONTAINER=$(docker ps --format '{{.Names}}' | grep -E 'lab-app|app' | head -n 1)

if [ -z "$CONTAINER" ]; then
    echo "❌ No container found"
    docker ps
    exit 1
fi

echo "✅ Found container: $CONTAINER"

# Copy files to container
docker cp ~/waf-troubleshooting.html $CONTAINER:/app/lab/src/public/task/waf-troubleshooting.html
echo "✅ Copied waf-troubleshooting.html"

docker cp ~/waf-lab $CONTAINER:/app/waf-lab
echo "✅ Copied waf-lab directory"

# Verify files
echo ""
echo "📋 Verifying files..."
docker exec $CONTAINER ls -la /app/lab/src/public/task/waf-troubleshooting.html
docker exec $CONTAINER ls -la /app/waf-lab/

echo ""
echo "========================================="
echo "✅ Task 7 Deployment Complete!"
echo "========================================="
EOFSCRIPT

# Upload and execute remote script
scp -i "$PEM_FILE" "$TEMP_DIR/deploy-remote.sh" "${EC2_USER}@${EC2_IP}:~/"
ssh -i "$PEM_FILE" "${EC2_USER}@${EC2_IP}" "bash ~/deploy-remote.sh"

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
echo "========================================="
echo "✅ DEPLOYMENT SUCCESSFUL!"
echo "========================================="
echo ""
echo "🔗 Access Task 7:"
echo "   http://${EC2_IP}:8081/tasks.html"
echo ""
echo "📝 Task 7 should now appear in the tasks list"
echo ""
echo "🐳 To start the WAF lab on EC2:"
echo "   ssh -i $PEM_FILE ${EC2_USER}@${EC2_IP}"
echo "   cd waf-lab"
echo "   docker-compose up -d"
echo ""
echo "⚠️  Note: Make sure port 8090 is open in Security Group for WAF access"
echo ""
