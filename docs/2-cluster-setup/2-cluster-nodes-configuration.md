---
title: Cluster Nodes Configuration
permalink: /docs/2-cluster-setup/2-cluster-nodes-configuration
description: A configuration guide for setting up the nodes of the PiKube Kubernetes Cluster. It covers the setup for Ubuntu cloud-init configuration files, basic OS configuration, and storage options for both Raspberry Pi and Orange Pi nodes.
last_modified_at: "19-02-2024"
---

# {{ $frontmatter.title }}

- [{{ $frontmatter.title }}](#-frontmattertitle-)
  - [Cluster Composition](#cluster-composition)
  - [Raspberry Pi Nodes Configuration](#raspberry-pi-nodes-configuration)
    - [Storage Configuration](#storage-configuration)
    - [OS Installation and Initial Configuration](#os-installation-and-initial-configuration)
    - [Generating SSH Keys](#generating-ssh-keys)
  - [Orange Pi Nodes](#orange-pi-nodes)
    - [Storage Configuration](#storage-configuration-1)
    - [Manual OS Installation and Initial Configuration](#manual-os-installation-and-initial-configuration)
      - [Identifying Orange Pi IP Address and Remote Connection](#identifying-orange-pi-ip-address-and-remote-connection)
      - [Configuration Steps](#configuration-steps)

## Cluster Composition

The PiKube Kubernetes Cluster comprises:

**3 Master Nodes:**

- blueberry-master (Raspberry Pi 4B, 4GB)
- strawberry-master (Raspberry Pi 4B, 8GB)
- blackberry-master (Raspberry Pi 4B, 8GB)

**4 Worker Nodes:**

- cranberry-worker  (Raspberry Pi 5, 8GB)
- raspberry-worker  (Raspberry Pi 3B+, 1GB)
- orange-worker     (Orange Pi 5B, 16GB)
- mandarine-worker  (Orange Pi 5B, 16GB)

## Raspberry Pi Nodes Configuration

### Storage Configuration

Nodes boot from an SD Card or SSD Disk, based on the selected storage architecture.

**Dedicated Disks Storage Architecture:** High-performance microSD cards are utilized for efficient operation and data management across the cluster nodes, with specific configurations highlighted below:

- **`SanDisk Extreme PRO MicroSDXC`** for **`blackberry-master`**: 128 GB, up to 200 MB/s speed, A2 App Performance, UHS-I Class 10, U3, V30, ensuring superior performance and durability.

- **`SAMSUNG EVO Select MicroSD-Memory-Card`** for **`strawberry-master`** and **`cranberry-worker`**: 256GB, designed to provide ample storage for extensive Kubernetes operations.

- **`SanDisk SDSQXAO MicroSDXC UHS-I U3 for **`blueberry-master`**: 128GB, enhancing speed and reliability for master node operations.

- **`SanDisk Industrial EDGE MicroSD for **`raspberry-worker`**: 32GB CLASS 10 A1, optimized for stable and reliable operations.

**Centralized SAN Architecture:** Planned for future implementation to further enhance storage solutions.

### OS Installation and Initial Configuration

**`Ubuntu Server 22.04.x LTS`** is the chosen operating system for Raspberry Pi nodes, installed using a [**`preconfigured cloud image`**](https://ubuntu.com/download/raspberry-pi). Initial configuration leverages cloud-init configuration files, specifically **`user-data`**, which is modified prior to the first startup.

- **`Procedure`**: Burn the Ubuntu OS image onto an SD-card using tools such as [**`Raspberry PI Imager`**](https://www.raspberrypi.com/software/) or [**`Balena Etcher`**](https://etcher.balena.io/). Modify the **`user-data`** file within the **`/boot`** directory on the SD Card to customize the initial setup.

<div class="centered-table">

|  Dedicated Disks  |
|:-----------------:|
| [user-data for blueberry-master](https://github.com/Crypto-Aggressor/PiKube-Kubernetes-Cluster/blob/production/build/metal/raspberry-pi/cloud-init/nodes/blueberry-master/user-data) |
| [user-data for strawberry-master](https://github.com/Crypto-Aggressor/PiKube-Kubernetes-Cluster/blob/production/build/metal/raspberry-pi/cloud-init/nodes/strawberry-master/user-data) |
| [user-data for cranberry-worker](https://github.com/Crypto-Aggressor/PiKube-Kubernetes-Cluster/blob/production/build/metal/raspberry-pi/cloud-init/nodes/cranberry-worker/user-data) |
| [user-data for raspberry-worker](https://github.com/Crypto-Aggressor/PiKube-Kubernetes-Cluster/blob/production/build/metal/raspberry-pi/cloud-init/nodes/raspberry-worker/user-data) |

</div>

**Example cloud-init YAML file for Node Configuration**:

  ```yaml
  #cloud-config

  # Set TimeZone and Locale for UK
  timezone: Europe/London
  locale: en_GB.UTF-8

  # Hostname
  hostname: nodeX

  # cloud-init not managing hosts file. only hostname is added
  manage_etc_hosts: localhost

  users:
    # not using default ubuntu user
    - name: pi
      primary_group: users
      groups: [adm, admin]
      shell: /bin/bash
      sudo: ALL=(ALL) NOPASSWD:ALL
      lock_passwd: true
      ssh_authorized_keys:
        - my-key

  # Reboot to enable Wifi configuration (more details in network-config file)
  power_state:
    mode: reboot
  ```

### Generating SSH Keys

Secure Shell (SSH) keys are a pair of cryptographic keys that can be used to authenticate to an SSH server as an alternative to password-based logins. A private key, which is secret, and a public key, which is shared, are used in the authentication process. Here is a procedure to generate an SSH key pair, referred to as my_key in the cloud-config examples:

```bash
ssh-keygen -t rsa -b 4096 -f ~/.ssh/my-key
```

This command creates a private key **`my-key`** and a public key **`my-key.pub`** in the **`~/.ssh/`** directory.

- Connect and update each node

```bash
sudo apt-get update && sudo apt-get upgrade -y
```

- Change default GPU Memory Split by adding to **`/boot/firmware/config.txt`**

```bash
# Set GPU Memory Allocation
# Adjust the amount of memory allocated to the GPU.
# For headless mode and non-graphical applications, a lower value is often sufficient.
# Value is in megabytes (MB). Default is 64.
# Recommended: 16 for headless scenarios, adjust as needed.
gpu_mem=16
```

> 📌 **Note**
>
> *Since Raspberry Pis in the cluster are configured as headless servers without monitors and are using the server version of Ubuntu distribution (without the desktop GUI), the reserved GPU memory for Raspberry Pis can be set to the lowest possible value (16MB).*

## Orange Pi Nodes

### Storage Configuration

Orange Pi nodes can boot from an SD Card or SSD Disk, contingent on the chosen storage architecture.

**Dedicated Disks Storage Architecture**: The PiKube Kubernetes cluster utilizes high-performance microSD cards to meet the specific storage demands of each node, ensuring efficient operation and data management. The configurations include:

- **SanDisk Extreme PLUS MicroSDXC** for **`orange-worker`**: 128 GB with A2 App Performance, speeds up to 170 MB/s, Class 10, U3, V30, optimized for rapid data processing and reliability.

- **SAMSUNG EVO Select MicroSD-Memory-Card** for **`mandarine-worker`**: 256GB, designed to enhance storage capacity for demanding applications.

**Centralized SAN Architecture**: Future plans include the integration of a centralized SAN architecture to further enhance storage capabilities.

### Manual OS Installation and Initial Configuration

**`Ubuntu Server 22.04.x LTS`** is the chosen operating system for Orange Pi nodes, installed using a [**`preconfigured cloud image`**](https://github.com/Joshua-Riek/ubuntu-rockchip/releases). For Orange Pi devices, IP addresses are now assigned based on Client Identifiers instead of MAC addresses, unlike the Raspberry Pi devices.

#### Identifying Orange Pi IP Address and Remote Connection

Prior to configuring Orange Pi nodes within the PiKube Kubernetes Cluster, it's essential to identify each node's IP address allocated via DHCP for secure remote connectivity and configuration.

- **Identifying Orange Pi IP Address**: From `gateway` configured with `dnsmasq` and `DHCP` services, the `arp -a` command lists known IP addresses on the network, aiding in identifying IP addresses allocated to Orange Pi nodes.

- **Remote Connection**: Connect to the Orange Pi using SSH with the default credentials (username: `ubuntu`, password: `ubuntu`) by replacing `ip_address` with the actual IP address identified. During the first connection, type `yes` when prompted to accept the host's SSH key, followed by a prompt to change the default `ubuntu` password. Use `qwerty` as a temporary password.

#### Configuration Steps

- **Log in to the Orange Pi using the identified IP address**:

```bash
ssh ubuntu@ip_address
```

- Update the System

```bash
sudo apt-get update && sudo apt-get upgrade -y
```

- Set Timezone and Locale

```bash
sudo timedatectl set-timezone Europe/London
sudo locale-gen en_GB.UTF-8
sudo update-locale LANG=en_GB.UTF-8
```

- Set Hostname (orange or mandarine)

```bash
sudo hostnamectl set-hostname X-worker
```

- Create User pi

```bash
sudo adduser pi
sudo usermod -aG sudo,adm pi
sudo chsh -s /bin/bash pi
echo 'pi ALL=(ALL) NOPASSWD:ALL' | sudo tee -a /etc/sudoers
```

- Set Up SSH for User pi

```bash
sudo mkdir -p /home/pi/.ssh
sudo chmod 700 /home/pi/.ssh
sudo touch /home/pi/.ssh/authorized_keys
sudo chmod 600 /home/pi/.ssh/authorized_keys
```

- Add Public SSH Key by replacing "public-ssh-key" with the actual SSH public key generated

```bash
echo "public-ssh-key" | sudo tee /home/pi/.ssh/authorized_keys
# it should be in this format
# echo "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCvE8ju9IxfwyEj0NSJhqrI2sob6QfpEuCAJurNc2XA54/pldF3CpvJlijTOPk2Q3m115DIE/MIGbltki8z59JdMmd/k+kxoXKfF/oZJmolyr6A6sxmtOyi+2Zcf+T/XPg6OEvYfIV3dK5lsIEUl4fDYRIGKcnzVplfJ/lG7N6IV55zvVzFTaehVA1HasLpJ2wDUUQVGMSnWFf16N8r0CscZebxZAzZoHB1SLUEZcQ3EkcM0+DMRXb9jtvLnnLJ6QNLnYOwS4gQ3Myrh2I1IyhnZIA2UQyYyqL1Z3iFfM27NhRFS8WvltDF1a58uXlN9p8bp6/dZRJnzMhNXrAMkwVixGx+nfmO9RNWHDQU7kUJEqmzXuyf6TjGtl1Csk+YvYpe+m1p4plyXDed5O3NtdHQ0O5BbXii5bLceTY2KucI15Mf4ClWihdVLmipRgwzNSmlZMoI8TRspOaTTI8KZ/VKvmbrKSBaNPKxTkP9+0J3fQPk10Qwc6xOJx80/ldOn30= amine@Who-Am-I" | sudo tee /home/pi/.ssh/authorized_keys
# ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCvE8ju9IxfwyEj0NSJhqrI2sob6QfpEuCAJurNc2XA54/pldF3CpvJlijTOPk2Q3m115DIE/MIGbltki8z59JdMmd/k+kxoXKfF/oZJmolyr6A6sxmtOyi+2Zcf+T/XPg6OEvYfIV3dK5lsIEUl4fDYRIGKcnzVplfJ/lG7N6IV55zvVzFTaehVA1HasLpJ2wDUUQVGMSnWFf16N8r0CscZebxZAzZoHB1SLUEZcQ3EkcM0+DMRXb9jtvLnnLJ6QNLnYOwS4gQ3Myrh2I1IyhnZIA2UQyYyqL1Z3iFfM27NhRFS8WvltDF1a58uXlN9p8bp6/dZRJnzMhNXrAMkwVixGx+nfmO9RNWHDQU7kUJEqmzXuyf6TjGtl1Csk+YvYpe+m1p4plyXDed5O3NtdHQ0O5BbXii5bLceTY2KucI15Mf4ClWihdVLmipRgwzNSmlZMoI8TRspOaTTI8KZ/VKvmbrKSBaNPKxTkP9+0J3fQPk10Qwc6xOJx80/ldOn30= amine@Who-Am-I
```

- Change Ownership of the SSH Directory

```bash
sudo chown -R pi:pi /home/pi/.ssh
```

Since the Orange Pi devices use the `end1` interface and require consistent IP assignments despite changing MAC addresses, configure `systemd-networkd` to use a unique **Client Identifier**.

- Identify the Network Interface

```bash
systemctl is-active systemd-networkd
systemctl is-active NetworkManager
```

- Create or edit the .network configuration file

```bash
sudo nano /etc/systemd/network/10-end1.network
```

- Replace `unique-client-id` with a unique identifier for each Orange Pi device (e.g., `orange-worker`, `mandarine-worker`).

```ini
[Match]
Name=end1

[Network]
DHCP=yes

[DHCP]
ClientIdentifier=<uique-client-id>
```

- Restart `systemd-networkd` service

```bash
sudo systemctl restart systemd-networkd
```

- Verify IP address assignment (e.g.,` 10.0.0.15`).

```bash
ip addr show end1
```

- Reboot the system

```bash
sudo shutdown -r now
```

> 📢 Note
>
> *To enable the WIFI interface (wlan0) on Orange Pi, if needed, follow this [**`wiki`**](https://github.com/Joshua-Riek/ubuntu-rockchip/wiki/Orange-Pi-5).*
