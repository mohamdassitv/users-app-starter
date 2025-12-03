#!/bin/sh
# Automated grading script for Task 5: Configure Basic Routing

set -e

echo "════════════════════════════════════════════════════════════════"
echo "  Task 5: Configure Basic Routing - Automated Grading"
echo "════════════════════════════════════════════════════════════════"
echo ""

TOTAL_SCORE=0
MAX_SCORE=100

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_test() {
    echo "${BLUE}[TEST]${NC} $1"
}

print_pass() {
    echo "${GREEN}[PASS]${NC} $1 (+$2 points)"
    TOTAL_SCORE=$((TOTAL_SCORE + $2))
}

print_fail() {
    echo "${RED}[FAIL]${NC} $1"
}

print_warn() {
    echo "${YELLOW}[WARN]${NC} $1"
}

# Test 1: Check if containers are running (10 points)
print_test "Checking if lab containers are running..."
if docker ps --format '{{.Names}}' | grep -q "nbr-leaf01" && \
   docker ps --format '{{.Names}}' | grep -q "nbr-leaf02" && \
   docker ps --format '{{.Names}}' | grep -q "nbr-router"; then
    print_pass "All containers are running" 10
else
    print_fail "Not all containers are running. Please start the lab first."
    echo "Run: docker compose up -d"
    exit 1
fi

# Test 2: Check leaf-01 default route (20 points)
print_test "Checking default route on leaf-01..."
LEAF01_ROUTE=$(docker exec nbr-leaf01 ip route show default 2>/dev/null || echo "")
if echo "$LEAF01_ROUTE" | grep -q "192.168.178.2"; then
    print_pass "Default route configured correctly on leaf-01" 20
else
    print_fail "Default route not found or incorrect on leaf-01"
    echo "Expected: default via 192.168.178.2"
    echo "Got: $LEAF01_ROUTE"
fi

# Test 3: Check leaf-02 default route (20 points)
print_test "Checking default route on leaf-02..."
LEAF02_ROUTE=$(docker exec nbr-leaf02 ip route show default 2>/dev/null || echo "")
if echo "$LEAF02_ROUTE" | grep -q "10.0.0.2"; then
    print_pass "Default route configured correctly on leaf-02" 20
else
    print_fail "Default route not found or incorrect on leaf-02"
    echo "Expected: default via 10.0.0.2"
    echo "Got: $LEAF02_ROUTE"
fi

# Test 4: Check IP forwarding on router (15 points)
print_test "Checking IP forwarding on router..."
IP_FORWARD=$(docker exec nbr-router cat /proc/sys/net/ipv4/ip_forward 2>/dev/null || echo "0")
if [ "$IP_FORWARD" = "1" ]; then
    print_pass "IP forwarding enabled on router" 15
else
    print_fail "IP forwarding is disabled on router"
    echo "Expected: 1"
    echo "Got: $IP_FORWARD"
fi

# Test 5: Check connectivity leaf-01 -> leaf-02 (17 points)
print_test "Testing connectivity from leaf-01 to leaf-02..."
if docker exec nbr-leaf01 ping -c 3 -W 2 10.0.0.20 >/dev/null 2>&1; then
    print_pass "leaf-01 can reach leaf-02" 17
else
    print_fail "leaf-01 cannot reach leaf-02"
fi

# Test 6: Check connectivity leaf-02 -> leaf-01 (18 points)
print_test "Testing connectivity from leaf-02 to leaf-01..."
if docker exec nbr-leaf02 ping -c 3 -W 2 192.168.178.10 >/dev/null 2>&1; then
    print_pass "leaf-02 can reach leaf-01" 18
else
    print_fail "leaf-02 cannot reach leaf-01"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  Final Score: ${GREEN}${TOTAL_SCORE}/${MAX_SCORE}${NC}"
echo "════════════════════════════════════════════════════════════════"
echo ""

if [ $TOTAL_SCORE -eq $MAX_SCORE ]; then
    echo "${GREEN}★ EXCELLENT! All tests passed!${NC}"
    echo "You have successfully configured basic routing between the networks."
elif [ $TOTAL_SCORE -ge 70 ]; then
    echo "${YELLOW}⚠ GOOD! Most tests passed.${NC}"
    echo "Review the failed tests and try again."
elif [ $TOTAL_SCORE -ge 50 ]; then
    echo "${YELLOW}⚠ PARTIAL. Some configuration is missing.${NC}"
    echo "Check the task guide and retry the configuration."
else
    echo "${RED}✗ NEEDS WORK. Please review the instructions.${NC}"
    echo "Make sure to:"
    echo "  1. Add default routes on both leaf nodes"
    echo "  2. Enable IP forwarding on the router"
    echo "  3. Verify with ping commands"
fi

echo ""
echo "Run './scripts/grade.sh' again after making corrections."
echo ""

exit 0
