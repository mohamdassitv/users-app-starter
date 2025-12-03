#!/bin/bash
# EC2 Deployment Script for Users App Starter
# Run this script on your EC2 instance

set -e

echo "========================================="
echo "🚀 Starting Deployment to EC2"
echo "========================================="

# Update system
echo "📦 Updating system packages..."
sudo yum update -y

# Install Docker
echo "🐳 Installing Docker..."
sudo yum install -y docker git
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -a -G docker ec2-user

# Install Docker Compose
echo "🔧 Installing Docker Compose..."
sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installations
echo "✅ Verifying installations..."
docker --version
docker-compose --version

# Clone repository
echo "📥 Cloning repository..."
cd ~
if [ -d "users-app-starter" ]; then
    echo "Directory exists, pulling latest changes..."
    cd users-app-starter
    git pull origin main
else
    git clone https://github.com/mohamdassitv/users-app-starter.git
    cd users-app-starter
fi

# Build and start containers
echo "🏗️  Building and starting containers..."
docker-compose down || true
docker-compose up -d --build

# Wait for containers to start
echo "⏳ Waiting for containers to start..."
sleep 10

# Check container status
echo "📊 Container Status:"
docker ps

# Show logs
echo "📝 Application Logs:"
docker-compose logs --tail=50 app

echo ""
echo "========================================="
echo "✅ Deployment Complete!"
echo "========================================="
echo ""
echo "🌐 Your application should be available at:"
echo "   http://108.129.251.79:3100"
echo ""
echo "⚠️  Make sure to open port 3100 in your Security Group:"
echo "   - Type: Custom TCP"
echo "   - Port: 3100"
echo "   - Source: 0.0.0.0/0"
echo ""
echo "📋 Useful commands:"
echo "   docker ps                    # View running containers"
echo "   docker-compose logs -f app   # Follow app logs"
echo "   docker-compose restart       # Restart all containers"
echo "   docker-compose down          # Stop all containers"
echo ""
