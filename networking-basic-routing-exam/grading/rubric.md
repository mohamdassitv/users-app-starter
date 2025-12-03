# Grading Rubric

- ✅ **Routes configured on both leaves (40%)**
  - `leaf-01` has default via `192.168.178.2`
  - `leaf-02` has default via `10.0.0.2`

- ✅ **Router forwards IPv4 packets (40%)**
  - `/proc/sys/net/ipv4/ip_forward` equals `1`

- ✅ **Connectivity tests (20%)**
  - `leaf-01 -> leaf-02` ping succeeds
  - `leaf-02 -> leaf-01` ping succeeds

The included `make grade` script automates these checks.
