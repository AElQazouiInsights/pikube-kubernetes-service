---
title: PiKube Kubernetes Service - An Integrated Kubernetes Environment
permalink: /docs/1-project-architecture-purpose/2-architecture
description: An overview of the PiKube Kubernetes Service architecture featuring a Kubernetes cluster, which includes the cluster nodes, a firewall, and an Ansible control node, along with the networking setup and cluster storage design.
last_modified_at: "03-02-2024"
---

## Structural Overview

The PiKube Kubernetes cluster is architected with a mix of nodes, each playing a vital role:

<p align="center">
    <img alt="pikube-cluster-network-node-architecture"
    src="../design/pikube-cluster-network-node-architecture.drawio.svg"
    width="%"
    height="%">
</p>

### Gateway Node

**1 Gateway Node:**

- Name: gateway (Raspberry Pi 4B, 4GB)
- Role: Acts as the cluster's primary router and firewall.

### Master Nodes

**3 Master Nodes:**

- blueberry-master (Raspberry Pi 4B, 4GB)
- strawberry-master (Raspberry Pi 4B, 8GB)
- blackberry-master (Raspberry Pi 4B, 8GB)

### Worker Nodes

**4 Worker Nodes:**

- cranberry-worker  (Raspberry Pi 5, 8GB)
- raspberry-worker  (Raspberry Pi 3B+, 1GB)
- orange-worker     (Orange Pi 5B, 16GB)
- mandarine-worker  (Orange Pi 5B, 16GB)

### Networking Hardware

The network's backbone is an 8-port Gigabit LAN switch, providing Layer 2 connectivity. The **`gateway`**, connects the cluster to the Internet, serving as a router and firewall. It connects to the LAN switch and to the home network via WiFi, creating a secure network environment for the cluster.

### Networking Services

The **`gateway`** node offers essential networking services:

- [Router/Firewall](https://github.com/Crypto-Aggressor/PiKube-Kubernetes-Cluster/blob/production/documentation/0-definitions.md#router-firewall): Controls internet access and network security.
- [DNS](https://github.com/Crypto-Aggressor/PiKube-Kubernetes-Cluster/blob/production/documentation/0-definitions.md#dns): Domain Name System services.
- [NTP](https://github.com/Crypto-Aggressor/PiKube-Kubernetes-Cluster/blob/production/documentation/0-definitions.md#ntp): Network Time Protocol for time synchronization.
- [DHCP](https://github.com/Crypto-Aggressor/PiKube-Kubernetes-Cluster/blob/production/documentation/0-definitions.md#dhcp): Dynamic Host Configuration Protocol for network management.

For enhanced Kubernetes API availability, an HAProxy load balancer is deployed on the gateway.

### Ansible Control Node

The **`pimaster`**, an Ansible control node, is a Docker Linux VM on a Windows laptop or Windows Subsystem for Linux. It manages the cluster's configuration, connecting to the home network and facilitating communication with cluster nodes.

## Node Hardware Specifications

### Raspberry Pi 4B

Specifications:

- **CPU:** Broadcom BCM2711, Quad-core Cortex-A72 (ARM v8), 1.5GHz
- **RAM:** 2GB/4GB/8GB LPDDR4-3200 SDRAM options
- **Disk:** MicroSD card for booting and storage; USB disk (Flash Disk or SSD via USB to SATA adapter) for additional storage

Hardware Components Used:

- **Units:** Raspberry Pi 4 Model B (4GB and 8GB configurations) for cluster nodes; Raspberry Pi 4 Model B (4GB) as router/firewall.
- **Storage:** Various MicroSD cards for storage solutions, including 128GB and 256GB SAMSUNG EVO Select Micro SD-Memory-Cards.
- **SSD Connectivity:** USB to SATA adapters for SSD connectivity (planned for future use).
- **Cooling:** Cooling solutions including a Pi Rack Case; SSD Rack Case planned for future.
- **Power Supply:** Enhanced with a DEYF 5V 4A multi-charging cable featuring three Type C and one Micro USB connectors, alongside an Anker PowerPort 60W 6-port with PowerIQ technology for efficient multi-device charging.

### Raspberry Pi 5

Specifications:

- **CPU:** Broadcom BCM2712, Quad-core Cortex-A76 (ARM v8), 2.4GHz
- **RAM:** 2GB/4GB/8GB options
- **Disk:** SDCard or USB disk (Flash Disk or SSD via USB to SATA adapter)

Hardware Components Used:

- **Units:** Raspberry Pi 5 Model B with 8GB RAM for cluster nodes.
- **Storage:** Various MicroSD cards for storage solutions, including 128GB and 256GB SAMSUNG EVO Select Micro SD-Memory-Cards.
- **SSD Connectivity:** USB to SATA adapters for SSD connectivity (planned for future use).
- **Cooling:** Cooling solutions including a Pi Rack Case; SSD Rack Case planned for future.
- **Power Supply:** Enhanced with a DEYF 5V 4A multi-charging cable featuring three Type C and one Micro USB connectors, alongside an Anker PowerPort 60W 6-port with PowerIQ technology for efficient multi-device charging.

### Orange Pi 5

Specifications:

- **CPU:** Rockchip RK3588S, 8-core 64-bit processor with Big.Little architecture (4xCortex-A76 @ 2.4GHz and 4xCortex-A55 @ 1.8GHz)
- **RAM:** 4GB/8GB/16GB LPDDR4/4X
- **Disk:** MicroSD card for booting and storage; USB disk (Flash Disk or SSD via USB to SATA adapter) for additional storage

Hardware Components Used:

- **Units:** Orange Pi 5 Model B units with 16GB RAM for cluster nodes.
- **Storage:** Various MicroSD cards for storage solutions, including 128GB and 256GB SAMSUNG EVO Select Micro SD-Memory-Cards.
- **SSD Connectivity:** USB to SATA adapters for SSD connectivity (planned for future use).
- **Cooling:** Cooling solutions including a Pi Rack Case; SSD Rack Case planned for future.
- **Power Supply:** Enhanced with a DEYF 5V 4A multi-charging cable featuring three Type C and one Micro USB connectors, alongside an Anker PowerPort 60W 6-port with PowerIQ technology for efficient multi-device charging.

## Network Infrastructure

The network infrastructure is tailored to provide high-speed, reliable connectivity for the PiKube Cluster, utilizing advanced networking hardware and high-quality cabling. The foundation of the network is established through a TP-Link switch, the TL-SG108S, chosen for its straightforward plug-and-play setup. To enhance the network's capabilities, particularly for future scalability and more sophisticated management features, the incorporation of a TP-Link TL-SG608E switch is planned. This addition is set to extend the network's functionality with remote management capabilities and VLAN support, essential for efficiently managing traffic and enhancing security across the cluster. All nodes are interconnected using superior Cat8 Ethernet cables, leveraging their Gigabit Ethernet ports to maximize data transfer speeds.

### Networking Hardware

- **TP-Link TL-SG108S:** 8-port Gigabit Ethernet unmanaged switch.
- **TP-Link TL-SG608E (planned):** 8-port managed switch with VLAN support.
- **Ethernet Cables:** 8 UGREEN Cat 8 cables 40Gbps 2000MHz for reliable, high-speed connections.

## Storage Solutions

The PiKube Kubernetes cluster leverages a variety of high-performance microSD cards to meet the specific storage demands of each node, ensuring efficient operation and data management. Below, the storage configurations are grouped by the type of microSD card used:

### SanDisk Extreme PLUS MicroSDXC

- **`orange-worker`**: 128 GB with A2 App Performance, up to 170 MB/s, Class 10, U3, V30. Optimized for high-speed data processing and reliability.

### SanDisk Extreme PRO MicroSDXC

- **`blackberry-master`**: 128 GB, capable of speeds up to 200 MB/s, with A2 App Performance, UHS-I Class 10, U3, V30. Designed for superior performance and durability.

### SAMSUNG EVO Select MicroSD-Memory-Card

- **`strawberry-master`**: 256GB, providing ample storage for extensive Kubernetes master node operations.
- **`cranberry-worker`**: 256GB, to support worker node tasks with high storage capacity.
- **`mandarine-worker`**: 256GB, enhancing storage capabilities for demanding applications.

### SanDisk SDSQXAO MicroSDXC UHS-I U3

- **`blueberry-master`**: 128GB, offering enhanced speed and reliability for the master node's operations.

### SanDisk Industrial EDGE MicroSD

- **`gateway`**: 32GB CLASS 10 A1, ensuring stable and reliable system operations for the cluster's gateway.
- **`raspberry-worker`**: 32GB CLASS 10 A1, tailored for the operational requirements of the Raspberry Pi 3B+ with optimal performance and reliability.
