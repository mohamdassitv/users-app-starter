# Networking Exam: Configure Basic Routing

A complete, self-contained hands-on exam that mirrors the *iximiuz* lab.
It includes:

- A beautiful single-page UI (`index.html`) for the prompt and quick commands.
- A real Docker-based lab to practice and grade yourself.
- Reference solution and a grader.

![Topology](assets/topology.png)

---

## Quick Start (Hands-On)

```bash
# 1) Build the tiny lab image and bring up the three nodes
make up

# 2) Open shells
make sh-leaf01   # shell in leaf-01
make sh-router   # shell in router
make sh-leaf02   # shell in leaf-02

# 3) Do the tasks
#   leaf-01: ip route del default || true; ip route add default via 192.168.178.2
#   leaf-02: ip route del default || true; ip route add default via 10.0.0.2
#   router:  echo 1 > /proc/sys/net/ipv4/ip_forward

# 4) Verify
make grade

# 5) Reset lab (optional)
make reset
```

> **Note**: We intentionally remove default routes on leaf nodes at startup to make the exercise realistic.
> The router starts with IPv4 forwarding disabled by default (Linux default).

## What You Should Achieve

- leaf-01 (192.168.178.10/24) can ping leaf-02 (10.0.0.20/16) via router (192.168.178.2 ↔ 10.0.0.2).
- leaf-02 can ping leaf-01 back.
- Router has IPv4 forwarding enabled.

## Files Overview

```
networking-basic-routing-exam/
├─ index.html            # Polished exam UI
├─ css/style.css         # Styling
├─ js/app.js             # Interactions (copy buttons, tabs, theme)
├─ assets/topology.png   # Diagram (local copy)
├─ image/Dockerfile      # Tiny lab image (Alpine + iproute2 + iputils)
├─ docker-compose.yml    # Three containers on two networks
├─ Makefile              # up/reset/grade helpers
├─ scripts/grade.sh      # Grader (pings + ip_forward check)
├─ scripts/solution.sh   # Apply the reference solution quickly
├─ scripts/seed.sh       # Boot-time tweaks for containers
├─ scripts/leaf01_setup.sh
├─ scripts/leaf02_setup.sh
├─ scripts/router_setup.sh
├─ grading/rubric.md     # What gets checked and how
├─ solution.md           # Step-by-step explanation
└─ README.md             # This file
```

## Requirements

- Docker Desktop / Docker Engine + Compose plugin
- Internet access to build the small Alpine-based image

## Uninstall

```bash
make down
```

Enjoy, and good luck!
