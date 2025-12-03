# Reference Solution

### 1) Configure `leaf-01` (net-1)

```sh
ip route del default || true
ip route add default via 192.168.178.2
```

### 2) Configure `leaf-02` (net-2)

```sh
ip route del default || true
ip route add default via 10.0.0.2
```

### 3) Enable IPv4 forwarding on `router`

```sh
echo 1 > /proc/sys/net/ipv4/ip_forward
# (alternative)
# sysctl -w net.ipv4.ip_forward=1
```

### 4) Verify

```sh
# from leaf-01
ping -c 3 10.0.0.20

# from leaf-02
ping -c 3 192.168.178.10
```

**Why it works**: The leaves now point unknown destinations to the router (their default gateway). With IP forwarding enabled, the router routes between its two interfaces.
