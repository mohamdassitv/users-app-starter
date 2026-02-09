#!/bin/bash
# Quick test script to verify container auto-start is working

echo "======================================"
echo "Container Auto-Start Verification"
echo "======================================"
echo ""

# Check users-app container
echo "1. Checking main application container..."
docker ps --filter "name=users-app" --format "table {{.Names}}\t{{.Status}}"
echo ""

# Check if any exam containers exist
echo "2. Checking for exam containers..."
EXAM_COUNT=$(docker ps -aq --filter "name=exam-" | wc -l)
echo "Found $EXAM_COUNT exam containers"
if [ $EXAM_COUNT -gt 0 ]; then
    docker ps -a --filter "name=exam-" --format "table {{.Names}}\t{{.Status}}"
fi
echo ""

# Check upstream container if it exists
echo "3. Checking upstream container status..."
UPSTREAM=$(docker ps -q --filter "name=upstream")
if [ ! -z "$UPSTREAM" ]; then
    echo "✓ Upstream container found: $UPSTREAM"
    echo "Status:"
    docker ps --filter "name=upstream" --format "table {{.Names}}\t{{.Status}}"
    echo ""
    echo "Last 10 log lines:"
    docker logs --tail 10 $UPSTREAM
else
    echo "ℹ No upstream container running (start an exam from admin panel first)"
fi
echo ""

# Check waf-nginx container if it exists
echo "4. Checking WAF NGINX container..."
WAF=$(docker ps -q --filter "name=waf-nginx")
if [ ! -z "$WAF" ]; then
    echo "✓ WAF container found: $WAF"
    echo "Status:"
    docker ps --filter "name=waf-nginx" --format "table {{.Names}}\t{{.Status}}"
    echo ""
    echo "Testing NGINX config (should have intentional typo):"
    docker exec $WAF cat /etc/nginx/conf.d/default.conf | grep "proxy_set_header Host"
else
    echo "ℹ No WAF container running (start an exam from admin panel first)"
fi
echo ""

echo "======================================"
echo "Summary"
echo "======================================"
echo "To test container auto-start:"
echo "1. Open: http://34.255.197.158:8081/admin-login.html"
echo "2. Login as admin"
echo "3. Click 'Start Exam' for a candidate"
echo "4. Wait 60 seconds"
echo "5. Run this script again to see all containers"
echo ""
echo "Expected: 13 containers with 'Up' status"
echo "- 1x waf-nginx (WAF with bug)"
echo "- 1x upstream (Node.js backend)"
echo "- 3x branch containers (tokyo, osaka, kyoto)"
echo "- 5x gateway containers (g1-g4, phoenix)"
echo "- 3x routing containers (leaf01, leaf02, router)"
echo ""
