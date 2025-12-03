# Task 5: Configure Basic Routing

## Overview

A hands-on networking challenge that tests your understanding of Linux routing fundamentals. You'll configure routing between two isolated networks using a dual-homed router.

## Scenario

You have three Linux machines on two different networks:

- **leaf-01**: `192.168.178.10/24` on `net-1`
- **router**: Dual-homed gateway
  - Interface 1: `192.168.178.2/24` (net-1)
  - Interface 2: `10.0.0.2/16` (net-2)
- **leaf-02**: `10.0.0.20/16` on `net-2`

Currently, leaf-01 and leaf-02 cannot communicate because:
1. They're on different subnets
2. They don't have routes to reach each other
3. The router doesn't forward packets by default

## Learning Objectives

- Understand IP routing fundamentals
- Configure default routes on Linux
- Enable IP forwarding on a Linux router
- Verify network connectivity with ping
- Troubleshoot routing issues

## Lab Setup

### Prerequisites
- Docker Desktop or Docker Engine with Compose
- Terminal access
- Basic understanding of IP networking

### Starting the Lab

```bash
cd networking-basic-routing-exam
docker compose up -d
```

### Accessing the Nodes

```bash
# Open three terminals:
docker exec -it nbr-leaf01 sh   # Terminal 1
docker exec -it nbr-router sh   # Terminal 2
docker exec -it nbr-leaf02 sh   # Terminal 3
```

## Tasks

### Task 1: Configure leaf-01 Routing

Add a default route on leaf-01 pointing to the router:

```bash
ip route add default via 192.168.178.2
```

**Verification:**
```bash
ip route show
# Should show: default via 192.168.178.2 dev eth0
```

### Task 2: Configure leaf-02 Routing

Add a default route on leaf-02 pointing to the router:

```bash
ip route add default via 10.0.0.2
```

**Verification:**
```bash
ip route show
# Should show: default via 10.0.0.2 dev eth0
```

### Task 3: Enable IP Forwarding on Router

Enable packet forwarding on the router:

```bash
echo 1 > /proc/sys/net/ipv4/ip_forward
```

Or alternatively:
```bash
sysctl -w net.ipv4.ip_forward=1
```

**Verification:**
```bash
cat /proc/sys/net/ipv4/ip_forward
# Should output: 1
```

### Task 4: Test Connectivity

From leaf-01, ping leaf-02:
```bash
ping -c 3 10.0.0.20
```

From leaf-02, ping leaf-01:
```bash
ping -c 3 192.168.178.10
```

Both pings should succeed with 0% packet loss.

## How It Works

### Packet Flow: leaf-01 → leaf-02

1. **leaf-01 sends packet to 10.0.0.20**
   - Checks routing table
   - No direct route to 10.0.0.0/16
   - Uses default route to 192.168.178.2

2. **Router receives packet on eth0 (192.168.178.2)**
   - IP forwarding is enabled
   - Checks routing table for 10.0.0.20
   - Forwards packet out eth1 (10.0.0.2)

3. **leaf-02 receives packet**
   - Processes the packet
   - Sends reply back to 192.168.178.10
   - Uses its default route to 10.0.0.2

4. **Router forwards reply back to leaf-01**
   - Symmetric path
   - Bidirectional communication established

## Common Issues & Troubleshooting

### Issue 1: Ping fails with "Network unreachable"
**Cause:** No default route configured  
**Solution:** Add default route on the leaf node

### Issue 2: Ping times out (no response)
**Cause:** IP forwarding disabled on router  
**Solution:** Enable IP forwarding with `sysctl -w net.ipv4.ip_forward=1`

### Issue 3: Ping works one way but not the other
**Cause:** Default route missing on one leaf node  
**Solution:** Configure default routes on both leaf-01 and leaf-02

### Useful Debugging Commands

```bash
# Check interfaces and IP addresses
ip addr show
ip -br addr

# Check routing table
ip route show
route -n

# Check IP forwarding status
cat /proc/sys/net/ipv4/ip_forward

# Trace route path
traceroute 10.0.0.20

# Check connectivity without DNS
ping -c 3 -n 10.0.0.20

# Monitor network traffic (if tcpdump is available)
tcpdump -i any icmp
```

## Key Concepts

### Default Route
A catch-all route used when no specific route matches the destination. Typically points to a gateway that knows how to reach other networks.

### IP Forwarding
A kernel parameter that allows a Linux system to forward packets between network interfaces. Disabled by default for security reasons.

### Gateway
A router or system that connects two or more networks and forwards packets between them.

### Routing Table
A data structure that stores routes to different network destinations. The kernel consults this table when routing packets.

## Grading Criteria

Your submission will be evaluated on:

1. **Correctness (50%)**
   - Default routes properly configured
   - IP forwarding enabled
   - Bidirectional connectivity working

2. **Documentation (30%)**
   - Commands used are documented
   - Results are clearly stated
   - Understanding demonstrated in explanation

3. **Troubleshooting (20%)**
   - Ability to verify configuration
   - Understanding of packet flow
   - Explanation of why IP forwarding is necessary

## Lab Management

```bash
# Check container status
docker compose ps

# View logs
docker compose logs

# Stop lab
docker compose down

# Reset lab (removes all configurations)
docker compose down -v
docker compose up -d

# Remove everything
docker compose down -v
docker network prune -f
```

## Additional Resources

- [Linux Advanced Routing & Traffic Control HOWTO](https://lartc.org/howto/)
- [iproute2 Documentation](https://wiki.linuxfoundation.org/networking/iproute2)
- [IP Forwarding and Routing](https://www.kernel.org/doc/Documentation/networking/ip-sysctl.txt)

## Notes

- All configurations are **non-persistent**. They will be lost when containers restart.
- For persistent routing, you would typically use configuration files like `/etc/network/interfaces` or NetworkManager.
- The lab uses Alpine Linux with iproute2 and iputils packages installed.

## Time Estimate

- Setup: 5 minutes
- Configuration: 10-15 minutes
- Testing & Documentation: 10 minutes
- **Total: 25-30 minutes**

---

**Good luck! 🚀**
