#!/bin/bash
#
# Automated Deployment Script for users-app-starter
# EC2 Instance: i-099cfcb81d04c8923 (ExamForCandidates)
# Public IP: 3.254.60.64
# Date: December 3, 2025
#

set -e

echo "=========================================="
echo "  Users App Deployment to EC2"
echo "  Instance: i-099cfcb81d04c8923"
echo "  IP: 3.254.60.64"
echo "=========================================="
echo ""

# Update system
echo "📦 Updating system packages..."
sudo apt-get update -y
sudo apt-get upgrade -y

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

# Install Docker Compose
echo "🔧 Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo "✓ Docker Compose installed successfully"
else
    echo "✓ Docker Compose already installed"
fi

# Install Git
echo "📚 Installing Git..."
if ! command -v git &> /dev/null; then
    sudo apt-get install -y git
    echo "✓ Git installed successfully"
else
    echo "✓ Git already installed"
fi

# Verify installations
echo ""
echo "📋 Verifying installations..."
docker --version
docker-compose --version
git --version

# Clone or update repository
echo ""
echo "📂 Setting up application..."
cd ~
if [ -d "users-app-starter" ]; then
    echo "Repository exists, pulling latest changes..."
    cd users-app-starter
    git pull origin main
else
    echo "Cloning repository..."
    git clone https://github.com/mohamdassitv/users-app-starter.git
    cd users-app-starter
fi

# Stop existing containers
echo ""
echo "🛑 Stopping existing containers..."
sudo docker-compose down || true

# Build and start containers
echo ""
echo "🚀 Building and starting containers..."
sudo docker-compose up -d --build

# Wait for containers to start
echo ""
echo "⏳ Waiting for containers to initialize..."
sleep 10

# Show container status
echo ""
echo "📊 Container Status:"
sudo docker ps

# Show logs
echo ""
echo "📜 Application Logs (last 30 lines):"
sudo docker-compose logs --tail=30 app

# Configure firewall
echo ""
echo "🔥 Configuring firewall..."
sudo ufw allow 22/tcp || true
sudo ufw allow 3100/tcp || true
sudo ufw allow 80/tcp || true
sudo ufw allow 443/tcp || true
echo "✓ Firewall configured"

echo ""
echo "=========================================="
echo "  ✅ Deployment Complete!"
echo "=========================================="
echo ""
echo "🌐 Your application is now running at:"
echo "   http://3.254.60.64:3100"
echo ""
echo "📋 Useful commands:"
echo "   View logs:        sudo docker-compose logs -f app"
echo "   Restart app:      sudo docker-compose restart app"
echo "   Stop all:         sudo docker-compose down"
echo "   Rebuild:          sudo docker-compose up -d --build"
echo ""
echo "🎯 Next steps:"
echo "   1. Open http://3.254.60.64:3100 in your browser"
echo "   2. Ensure Security Group allows inbound port 3100"
echo "   3. Test all 6 tasks in the application"
echo ""
