#!/bin/bash
#
# Deployment Script for users-app-starter
# EC2 Instance: i-0fc5a91af937f1212 (ExamForNewCandidates)
# Public IP: 34.255.197.158
# DNS: ec2-34-255-197-158.eu-west-1.compute.amazonaws.com
# Date: January 18, 2026
#

set -e

echo "=========================================="
echo "  Users App Deployment to EC2"
echo "  Instance: i-0fc5a91af937f1212"
echo "  IP: 34.255.197.158"
echo "  Region: eu-west-1"
echo "=========================================="
echo ""

# Update system
echo "📦 Updating system packages..."
sudo apt-get update -y

# Install Docker
echo "🐳 Installing Docker..."
if ! command -v docker &> /dev/null; then
    sudo apt-get install -y ca-certificates curl gnupg lsb-release
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    sudo apt-get update -y
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    sudo usermod -aG docker ubuntu
    echo "✓ Docker installed successfully"
else
    echo "✓ Docker already installed"
fi

# Verify Docker installation
echo ""
echo "📋 Verifying Docker installation..."
docker --version

# Create app directory
echo ""
echo "📂 Setting up application directory..."
mkdir -p ~/app
cd ~/app

# Note: Files should already be uploaded via scp
if [ ! -f "Dockerfile" ]; then
    echo "❌ ERROR: Application files not found!"
    echo "Please upload files using:"
    echo "scp -i ExamForNewCandidates.pem -r lab ubuntu@34.255.197.158:~/app/"
    exit 1
fi

# Stop existing containers
echo ""
echo "🛑 Stopping existing containers..."
docker stop users-app 2>/dev/null || true
docker rm users-app 2>/dev/null || true

# Build Docker image
echo ""
echo "🏗️  Building Docker image..."
docker build -t users-app .

# Create state directory if it doesn't exist
echo ""
echo "📁 Setting up state directory..."
mkdir -p ~/app/lab/state

# Start container with proper configuration
echo ""
echo "🚀 Starting users-app container..."
docker run -d \
  --name users-app \
  -p 8081:8081 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v ~/app/lab/state:/app/lab/state \
  --privileged \
  --restart unless-stopped \
  users-app

# Wait for container to start
echo ""
echo "⏳ Waiting for container to initialize..."
sleep 10

# Show container status
echo ""
echo "📊 Container Status:"
docker ps | grep users-app

# Show logs
echo ""
echo "📜 Application Logs (last 30 lines):"
docker logs --tail=30 users-app

# Verify application is responding
echo ""
echo "🔍 Checking application health..."
sleep 5
if curl -s http://localhost:8081 > /dev/null; then
    echo "✅ Application is responding!"
else
    echo "⚠️  Application may not be ready yet. Check logs with: docker logs users-app"
fi

echo ""
echo "=========================================="
echo "✅ Deployment Complete!"
echo "=========================================="
echo ""
echo "🌐 Your application is available at:"
echo "   http://34.255.197.158:8081"
echo "   http://ec2-34-244-246-180.eu-west-1.compute.amazonaws.com:8081"
echo ""
echo "📋 Useful commands:"
echo "   docker logs users-app           # View logs"
echo "   docker logs -f users-app        # Follow logs"
echo "   docker restart users-app        # Restart container"
echo "   docker stop users-app           # Stop container"
echo "   docker exec -it users-app sh    # Shell access"
echo ""
echo "⚠️  Security Group Configuration:"
echo "   Make sure these ports are open:"
echo "   - Port 22 (SSH)"
echo "   - Port 8081 (Application)"
echo ""
