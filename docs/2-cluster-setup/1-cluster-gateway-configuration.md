---
title: Cluster Gateway Configuration
permalink: /2-cluster-setup/1-cluster-gateway-configuration
description: How to configure a Single-board computer (Raspberry Pi or Orange Pi) as router/firewall of our Kubernetes Cluster providing connectivity and basic services (DNS, DHCP, NTP).
last_modified_at: "18-06-2023"
---

# {{ $frontmatter.title }}

<p align="center">
    <img alt="cluster-gateway"
    src="../resources/cluster-setup/gateway.jpg"
    width="25%"
    height="%">
</p>

**`gateway`**, a Raspberry Pi 4B, 4GB, is used as **`Router`** and **`Firewall`** for the home lab, isolating the **`pi-cluster`** from the home network. It will also provide `DNS`, `NTP` and `DHCP` services to the lab network. In case of deployment using centralized SAN storage architectural option, gateway is providing `SAN` services also.

This **`gateway`**, is connected to the home network using its WIFI interface (wlan0) and to the LAN Switch using the eth interface (eth0).

In order to ease the automation with Ansible, OS installed on gateway is the same as the one installed in the nodes of the cluster (node1-node7): **Ubuntu 22.04 64 bits**.

## Storage configuration

**`gateway`** node is based on a Raspberry Pi 4B, 4GB booting from a MicroSD, a dedicated disks storage architecture based on a **`SanDisk Industrial EDGE MicroSD 32GB CLASS 10 A1`**, optimized for stable and reliable operations.

## Network configuration

The **`WIFI interface`** (wlan0) will be used to be connected to the **`home network`** using static IP address **`192.168.1.10/24`**, while **`ethernet interface`** (eth0) will be connected to the lan switch, lab network, using static IP address **`10.0.0.1/24`**.
Static IP address in the home network, will enable the configuration of static routes on the Windows laptop and Virtual Machine or Windows Subsystem for Linux running on it (pimaster) to access the cluster nodes without physically connect the laptop to the lan switch with an ethernet cable.

## OS installation and initial configuration

**`Ubuntu Server 22.04.x LTS`** can be installed on **`Raspberry PI`** using a [**`preconfigured cloud image`**](https://ubuntu.com/download/raspberry-pi) that need to be copied to SDCard

**`Raspberry Pi`** will be configured to boot Ubuntu OS from a MicroSD. The initial Ubuntu 22.04.x LTS configuration on the Single-board computers will be automated using [**`cloud-init`**](https://github.com/Crypto-Aggressor/PiKube-Kubernetes-Cluster/blob/production/documentation/0-definitions.md#cloud-init) configuration files, i.e. [**`user-data`**](https://github.com/Crypto-Aggressor/PiKube-Kubernetes-Cluster/blob/production/documentation/0-definitions.md#user-data) and [**`network-config`**](https://github.com/Crypto-Aggressor/PiKube-Kubernetes-Cluster/blob/production/documentation/0-definitions.md#network-config) for **`gateway`**.

Ubuntu cloud-init configuration files within the image, **`/boot/user-data`** and **`/boot/network-config)`**, will be modified before the first startup using **`user-data`** and **`network-config`** templates

- Burn the Ubuntu OS image to a SD-card using *[**`Raspberry PI Imager`**](https://www.raspberrypi.com/software/) or [**`Balena Etcher`**](https://etcher.balena.io/)

- Mofify **`user-data`** and **`network-config`** within **`/boot`** directory in the SDCard

<div class="centered-table">

| Dedicated Disks |
|:---------------:|
| [user-data for gateway](https://github.com/Crypto-Aggressor/PiKube-Kubernetes-Cluster/blob/production/build/metal/raspberry-pi/cloud-init/gateway/user-data) |
| [network-config for gateway](https://github.com/Crypto-Aggressor/PiKube-Kubernetes-Cluster/blob/production/build/metal/raspberry-pi/cloud-init/gateway/network-config) |

</div>

**Example cloud-init YAML file for gateway Configuration**:

  ```yaml
  #cloud-config

  # Set TimeZone and Locale for UK
  timezone: Europe/London
  locale: en_GB.UTF-8

  # Hostname
  hostname: gateway

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

- From Windows laptop copy private key **`my-key`** to the **`gateway`**

```bash
scp -i ~/.ssh/gateway-pi ~/.ssh/gateway-pi pi@192.168.8.10:~/.ssh/gateway-pi
```

- Modify file **`/boot/network-config`** following the [**`network-config template`**](https://github.com/Crypto-Aggressor/PiKube-Kubernetes-Cluster/blob/production/build/metal/raspberry-pi/clout-init/gateway/network-config)

The following YAML configuration snippet describes network configuration settings using Netplan, a YAML-based network configuration utility in Linux. This configuration is for both wired (eth0) and wireless (wlan0) network interfaces. It allows for manual configuration of IP addresses, gateway, DNS, and wireless network connection settings, providing flexibility and control over network configurations in Linux environments

```yaml
# Cloud-init netplan configuration

version: 2 # Specifies that the configuration uses version 2 of the YAML format
# Wired Ethernet Configuration
ethernets: # Specifies network configurations for Ethernet interfaces
  eth0: # Specifies network configurations for Ethernet interfaces
    dhcp4: false # Disables DHCPv4 for the eth0 interface, indicating manual IP configuration
    addresses: [10.0.0.1/24] # Assigns the IP address 10.0.0.1 with a subnet mask of 255.255.255.0 (equivalent to /24) to the eth0 interface
# Wireless Configuration
wifis: # Specifies network configurations for wireless interfaces
  wlan0: # Represents the wireless interface named "wlan0"
    dhcp4: false # Disables DHCPv4 for the wlan0 interface, indicating manual IP configuration
    optional: true # Marks the wlan0 interface as optional, meaning it won't prevent booting if it's unavailable
    access-points: # Specifies the list of available Wi-Fi access points
      "<SSID_NAME>": # Replace with the SSID (Wi-Fi network name) of the network you want to connect to
        password: "<SSID_PASSWD>" # Replace with the password for the specified SSID
    addresses: [192.168.8.10/24] # Assigns the IP address 192.168.8.10 with a subnet mask of 255.255.255.0 (equivalent to /24) to the wlan0 interface
    gateway4: 192.168.8.1 # Specifies the IPv4 gateway address
    nameservers: # Specifies DNS server addresses for name resolution
      addresses: [80.58.61.250,80.58.61.254] # Specifies the DNS server addresses 80.58.61.250 and 80.58.61.254
```

- Once the **`gateway`** is booted initiate from the Windows laptop an ssh connection using the private key

```bash
ssh -i ~/.ssh/private-ssh-key -q pi@192.168.8.10
```

### Configuration Steps

- Update **`gateway`** OS

```bash
sudo apt update && sudo apt full-upgrade -y
```

- Reboot the **`gateway`**

```bash
sudo shutdown -r now
```

- Free the **`gateway`** resources from unused packages

```bash
sudo snap list
snap remove lxd && snap remove core18 && snap remove snapd
sudo apt purge snapd
sudo apt autoremove
```

- Install useful utility scripts

```bash
sudo apt install libraspberrypi-bin
sudo apt install net-tools
sudo apt install arp-scan
sudo apt install inetutils-traceroute
sudo apt install libraspberrypi-bin
sudo apt install net-tools
sudo apt install arp-scan
sudo apt install inetutils-traceroute
sudo apt install nftables
sudo apt install linux-modules-extra-raspi
sudo apt install dnsmasq
sudo apt install iptables-persistent
sudo apt install netfilter-persistent
sudo apt install haproxy
sudo apt install fake-hwclock
sudo apt install bridge-utils
sudo apt install chrony
sudo apt install apache2-utils
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
> *Since Raspberry Pi gateway in the cluster is configured as headless server without monitors and is using the server version of Ubuntu distribution (without the desktop GUI), the reserved GPU memory for Raspberry Pi can be set to the lowest possible value (16MB).*

- Reboot the **`gateway`**

```bash
sudo shutdown -r now
```

- Enabling VXLAN module (Ubuntu 22.04) for Raspbery Pi only

```bash
sudo apt install linux-modules-extra-raspi && sudo shutdown -r now
```

## Router/Firewall Configuration

To transform **`gateway`** into a router, it's essential to configure Ubuntu to permit IP packet forwarding. This can be achieved by integrating **`net.ipv4.ip_forward=1`** into the **`/etc/sysctl.conf`** file.

```bash
echo "net.ipv4.ip_forward=1" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

> 📌 **Note**
>
> *To set up Filtering and Forwarding Rules, the use of **`iptables`** package can be used, executing the following commands*
>
> ```bash
> sudo apt install iptables
> sudo iptables -t nat -A POSTROUTING -o wlan0 -j MASQUERADE
> sudo iptables -A FORWARD -i wlan0 -o eth0 -m state --state RELATED,ESTABLISHED -j ACCEPT
> sudo iptables -A FORWARD -i eth0 -o wlan0 -j ACCEPT
> ```
>
> *However, for more advanced router or firewall configurations, consider employing the nftables package.*

**`nftables`** is recognized as the contemporary alternative to **`iptables`**. It brings forward superior flexibility, user-friendliness, scalability, and efficient packet classification. Both utilities are grounded on the netfilter kernel module. The community maintainers highlight that **`nftables`** is where innovative features within netfilter are introduced.

From Debian's 11th release (Buster) onwards, **`nftables`** has been endorsed as the default firewall package, thereby replacing **`iptables`** ([Debian's nftables documentation](https://wiki.debian.org/nftables)). With this release, nf_tables serves as the default backend for **`iptables`**, made possible through the iptables-nft layer. This allows the utilization of **`iptables`** syntax in tandem with the nf_tables kernel subsystem. Similarly, starting from Ubuntu 20.10, the ip-tables package now encompasses xtables-nft commands, which are akin to **`iptables`** commands but leverage the **`nftables`** kernel API, thus streamlining the transition from **`iptables`** to **`nftables`**.

Given the robust support it has from the Linux community, it's anticipated that **`iptables`** may be phased out in the near future, placing **`nftables`** in the forefront, therefore will be used for this project.

- As a prerequisites, let's ensure **`nftables`** is installed. If not, install it using the distribution's package manager.

```bash
sudo apt update && sudo apt install nftables
```

### Initial Setup

- Begin by flushing any existing rules to start with a clean slate

```bash
sudo nft flush ruleset
```

<a id="base-configuration"></a>

### Base Configuration

- Create a new configuration file at **`/etc/nftables.conf`**

```bash
sudo nano /etc/nftables.conf
```

- Paste the main configuration contents into this file. This file serves as the primary entry point and will include other files containing rule definitions.

```ini
#!/usr/sbin/nft -f
# Ansible managed

# Clear current ruleset to apply new rules.
flush ruleset

# Include definitions of common terms and sets to be used in the rules.
include "/etc/nftables.d/defines.nft"

# Filter table for controlling traffic.
table inet filter {
    # Global chain for state management.
    chain global {
        # Allow established and related connections.
        ct state established,related accept
        # Drop invalid connections.
        ct state invalid drop
    }

    # Include predefined sets.
    include "/etc/nftables.d/sets.nft"
    # Include rules for incoming traffic.
    include "/etc/nftables.d/filter-input.nft"
    # Include rules for outgoing traffic.
    include "/etc/nftables.d/filter-output.nft"
    # Include rules for forwarding traffic.
    include "/etc/nftables.d/filter-forward.nft"
}

# Table for Network Address Translation (NAT).
table ip nat {
    # Include predefined sets.
    include "/etc/nftables.d/sets.nft"
    # Include rules for prerouting (destination NAT).
    include "/etc/nftables.d/nat-prerouting.nft"
    # Include rules for postrouting (source NAT).
    include "/etc/nftables.d/nat-postrouting.nft"
}
```

### Define Common Terms and Sets

- Create a directory to hold additional nftables rule files:

```bash
sudo mkdir /etc/nftables.d/
```

- In **`/etc/nftables.d/`**, create a file named **`defines.nft`**

```bash
sudo nano /etc/nftables.d/defines.nft
```

- Copy the definitions for common terms and sets (e.g., port numbers, interface names, etc.) into this file.

```ini
# broadcast and multicast
define badcast_addr = { 255.255.255.255, 224.0.0.1, 224.0.0.251 } # Broadcast and Multicast addresses (IPv4)
define ip6_badcast_addr = { ff02::16 } # Multicast address (IPv6)

# in_tcp_accept
define in_tcp_accept = {
    ssh,           # SSH protocol
    https,         # HTTPS protocol
    http,          # HTTP protocol
    9100,          # Node exporter (Prometheus)
    8200, 8201,    # Vault ports
    6443,          # Kubernetes API server
    iscsi-target   # iSCSI target port
}

# in_udp_accept
define in_udp_accept = {
    snmp,          # SNMP protocol
    domain,        # DNS protocol
    ntp,           # NTP protocol
    bootps,        # BOOTP/DHCP server
    69             # TFTP protocol
}

# out_tcp_accept
define out_tcp_accept = {
    http,          # HTTP protocol
    https,         # HTTPS protocol
    ssh            # SSH protocol
}

# out_udp_accept
define out_udp_accept = {
    domain,        # DNS protocol
    bootps,        # BOOTP/DHCP server
    ntp            # NTP protocol
}

# lan_interface
define lan_interface = eth0      # Internal LAN interface

# wan_interface
define wan_interface = wlan0     # External WAN interface

# lan_network
define lan_network = 10.0.0.0/24 # LAN IP range

# forward_tcp_accept
define forward_tcp_accept = {
    http,          # HTTP protocol
    https,         # HTTPS protocol
    ssh,           # SSH protocol
    9091           # MinIO browser
}

# forward_udp_accept
define forward_udp_accept = {
    domain,        # DNS protocol
    ntp            # NTP protocol
}

# Vault listening ports
define vault_ports = { 8200, 8201 }
```

### Rule Files for Specific Traffic Types

For clarity and modularity, the rules will be separated based on the type of traffic:

#### Input Traffic

- Create a file named **`filter-input.nft`**

```bash
sudo nano /etc/nftables.d/filter-input.nft
```

- Paste the rules pertaining to incoming traffic.

```ini
chain input {
    # Policy: By default, drop all incoming traffic 
    type filter hook input priority 0; policy drop;

    # General global rules (e.g. established/related traffic)
    jump global

    # No specific unwanted traffic to drop, thus placeholder for future rules if necessary
    # (none)

    # No specific unwanted IPv6 traffic to drop, thus placeholder for future rules if necessary
    # (none)

    # Accept all traffic coming to/from the localhost interface
    # This ensures processes and services running on the same machine can communicate with each other
    iif lo accept

    # Allow all ICMP traffic (IPv4 and IPv6)
    # ICMP is used for ping requests, error messages and other network diagnostic purposes
    meta l4proto { icmp, icmpv6 } accept

    # Allow incoming UDP traffic based on a predefined set of ports
    # The specific ports are defined in the 'in_udp_accept' set (e.g. domain, ntp)
    udp dport @in_udp_accept ct state new accept

    # Allow incoming TCP traffic based on a predefined set of ports
    # The specific ports are defined in the 'in_tcp_accept' set (e.g. http, https, ssh)
    tcp dport @in_tcp_accept ct state new accept

    # Log dropped traffic
    log prefix "[INPUT DROP]:" limit rate 2/minute
    drop
}
```

#### Forwarded Traffic

- Create a file named **`filter-forward.nft`**

```bash
sudo nano /etc/nftables.d/filter-forward.nft
```

- Paste the rules regarding forwarded traffic.

```ini
chain prerouting {
    # Policy: Drop any forwarded traffic by default
    type filter hook forward priority 0; policy drop;

    # General global rules (e.g. established/related traffic)
    jump global

    # Allow specific LAN to WAN TCP traffic
    # This rule checks if the source is from our LAN and destination is WAN
    # and allows specific TCP ports defined in forward_tcp_accept
    iifname $lan_interface ip saddr $lan_network oifname $wan_interface tcp dport @forward_tcp_accept ct state new accept

    # Allow specific LAN to WAN UDP traffic
    # Similar to the above, but for UDP ports defined in forward_udp_accept
    iifname $lan_interface ip saddr $lan_network oifname $wan_interface udp dport @forward_udp_accept ct state new accept

    # Allow incoming SSH traffic from WAN to our LAN
    # This rule checks for incoming SSH traffic from the WAN and forwards it to our LAN
    iifname $wan_interface oifname $lan_interface ip daddr $lan_network tcp dport ssh ct state new accept

    # Allow incoming HTTP and HTTPS traffic from WAN to our LAN
    iifname $wan_interface oifname $lan_interface ip daddr $lan_network tcp dport { http, https } ct state new accept

    # Allow s3 (MinIO) traffic from WAN to a specific IP in our LAN
    # This rule allows traffic to ports 9091 and 9092 (typically used by MinIO) on IP 10.0.0.10
    iifname $wan_interface oifname $lan_interface ip daddr 10.0.0.10 tcp dport { 9091, 9092 } ct state new accept

    # Allow port-forwarding traffic (e.g. for Kubernetes services) from WAN to IP 10.0.0.10 on port 8080
    iifname $wan_interface oifname $lan_interface ip daddr 10.0.0.10 tcp dport 8080 ct state new accept

    # Allow Vault traffic from WAN to a specific IP in our LAN on Vault's ports
    # This rule forwards traffic to Vault's ports (8200 and 8201) on IP 10.0.0.10
    iifname $wan_interface oifname $lan_interface ip daddr 10.0.0.10 tcp dport $vault_ports ct state new accept

    # Note for users: Instructions on how to use kubectl for port-forwarding
    # kubectl port-forward svc/[service-name] -n [namespace] [external-port]:[internal-port] --address 0.0.0.0

    # Log dropped forwarded traffic
    log prefix "[FORWARD DROP]:" limit rate 2/minute
    drop
}
```

#### Output Traffic

- Create a file named **`filter-output.nft`**

```bash
sudo nano /etc/nftables.d/filter-output.nft
```

- Paste the rules concerning outgoing traffic.

```ini
chain output {
    # Policy: By default, allow all outgoing traffic
    # The purpose of this is to ensure the machine can freely initiate connections to external resources
    # without any hindrance.
    type filter hook output priority 0; policy accept;

    # At this time, there are no specific output filters.
    # This section serves as a placeholder for any future specific output rules that may be required.
    # For instance, if in the future there's a need to block specific outgoing traffic or
    # limit the machine's connections to certain external resources, those rules would be added here.

    # Log NAT prerouting decisions
    log prefix "[NAT PREROUTING]:" limit rate 5/minute
}
```

#### NAT (Network Address Translation)

- Create two files, **`nat-prerouting.nft`** and **`nat-postrouting.nft`**

```bash
sudo nano /etc/nftables.d/nat-prerouting.nft
sudo nano /etc/nftables.d/nat-postrouting.nft
```

- Paste the respective NAT rules into these files.

```ini
chain prerouting {
    # Policy: Process Network Address Translation (NAT) before routing decisions have been made.
    # This is typically used to translate the destination addresses of packets that are entering the network.
    # This is commonly used in port forwarding scenarios where you want to direct traffic
    # coming into a public IP to a private IP inside the network.
    type nat hook prerouting priority 0;

    # Log NAT prerouting decisions
    log prefix "[NAT PREROUTING]:" limit rate 5/minute
}
```

```ini
chain postrouting {
    # Policy: Process Network Address Translation (NAT) after routing decisions have been made.
    # This is typically used to translate the source addresses of packets that are leaving the network.
    type nat hook postrouting priority 100;

    # Masquerade: This is a form of Source NAT (SNAT).
    # When a packet leaves the network, its source address is replaced by the address of the machine
    # doing the masquerading (in this case, the gateway).
    # The masquerade target is used for dynamically-assigned IPs where the IP address can change at any time.
    # It will use the current IP address of the outgoing interface.
    # This ensures that replies can return to the machine that sent them, even if the network's public IP changes.
    ip saddr $lan_network oifname $wan_interface masquerade

    # Log NAT postrouting decisions
    log prefix "[NAT POSTROUTING]:" limit rate 5/minute
}
```

#### Sets

- Create a file named **`sets.nft`**:

```bash
sudo nano /etc/nftables.d/sets.nft
```

- Paste the definitions for the various sets of IPs, ports, etc., that will be referenced in the rules.

```ini
# Define a set to match addresses that should be treated as blackholes (i.e., to be dropped).
set blackhole {
    type ipv4_addr;
    # Use the predefined list of badcast addresses.
    elements = $badcast_addr
}

# Define a set for TCP services that should be allowed for forwarded traffic.
set forward_tcp_accept {
    type inet_service; flags interval;
    # Combine the predefined forward TCP accept services with Vault ports.
    elements = $forward_tcp_accept
}

# Define a set for UDP services that should be allowed for forwarded traffic.
set forward_udp_accept {
    type inet_service; flags interval;
    elements = $forward_udp_accept
}

# Define a set for TCP services that should be allowed for incoming traffic.
set in_tcp_accept {
    type inet_service; flags interval;
    # Combine the predefined incoming TCP accept services with Vault ports.
    elements = $in_tcp_accept
}

# Define a set for UDP services that should be allowed for incoming traffic.
set in_udp_accept {
    type inet_service; flags interval;
    elements = $in_udp_accept
}

# Define a set to match IPv6 addresses that should be treated as blackholes.
set ip6_blackhole {
    type ipv6_addr;
    elements = $ip6_badcast_addr
}

# Define a set for TCP services that should be allowed for outgoing traffic.
set out_tcp_accept {
    type inet_service; flags interval;
    elements = $out_tcp_accept
}

# Define a set for UDP services that should be allowed for outgoing traffic.
set out_udp_accept {
    type inet_service; flags interval;
    elements = $out_udp_accept
}
```

### Apply Configuration

- Load the ruleset

```bash
sudo nft -f /etc/nftables.conf
```

### Testing

Once rules applied, test the configuration. Ensure that:

- Services are still accessible.
- Unwanted traffic is blocked.
- Logging works as expected (check `/var/log/syslog` or the appropriate log file on the system).

### Persistence

To ensure nftables rules are applied on boot, enable the nftables service:

```bash
sudo systemctl enable nftables
sudo systemctl start nftables
```

### Configuring static routes to access the cluster from the home network

To access the cluster nodes from the home network, a static route needs to be added to use `gateway` as the router for the lab network (10.0.0.0/24).

This route needs to be added to the Laptop and the VM running the `pimaster` node.

- Adding a static route in Windows laptop using powershell or cmd:

```dos
ROUTE -P ADD 10.0.0.0 MASK 255.255.255.0 192.168.0.10 METRIC 1
```

Adding a static route in Linux VM running on the laptop (VirtualBox):

Modify `/etc/netplan/50-cloud-init.yaml` to add the static route:

```yaml
network:
  version: 2
  ethernets:
    enp0s3:
      dhcp4: no
      addresses: [192.168.56.20/24] # Host Only VirtualBox network
    enp0s8:
      dhcp4: yes # Home network IP address
      routes:
      - to: 10.0.0.0/24 # Cluster Lab Network
        via: 192.168.1.11 # `gateway` static IP address in the home network  
```

Note: This is the pimaster VirtualBOX network configuration:

Eth0 (enp0s3) is connected to the VBox Host-Only adapter (laptop only connection).
Eth1 (enp0s8) is connected to the VBox Bridge adapter (home network connection).

## DHCP/DNS Configuration

**`dnsmasq`** is utilized as a lightweight DHCP/DNS server. For automating configuration tasks, the ansible role [**`quantfinancehub.dnsmasq`**](https://galaxy.ansible.com/quantfinance/dnsmasq) has been developed.

### Installation and configuration of dnsmasq

```bash
sudo apt install dnsmasq
```

- Edit the file /etc/dnsmasq.d/dnsmasq.conf:

```ini
# Inventory
# This section provides an inventory of devices with their MAC IDs.
# Raspberry Pi 4B with 4GB RAM  - 2nd case - MAC ID d8:3a:dd:02:a3:d7 - gateway
# Asus ROG Flow Z13             - WSL      - MAC ID 00:15:5d:85:35:cb - ansible
# Raspberry Pi 4B with 4GB RAM  - 3rd case - MAC ID e4:5f:01:f5:c1:ae - blueberry-master
# Raspberry Pi 4B with 8GB RAM  - 4th case - MAC ID e4:5f:01:df:31:a2 - strawberry-master
# Raspberry Pi 4B with 8GB RAM  - 5th case - MAC ID dc:a6:32:73:69:c9 - blackberry-master
# Raspberry Pi 5 with 8GB RAM   - 6th case - MAC ID d8:3a:dd:b6:12:77 - cranberry-worker
# Raspberry Pi 3B+ with 1GB RAM - 1st case - MAC ID b8:27:eb:d2:40:87 - raspberry-worker
# Orange Pi 5 with 16GB RAM     - 1st case - eth0 MAC ID d2:22:4c:9e:b4:6c, wlan0 MAC ID e4:5f:01:2f:54:82 - orange-worker
# Orange Pi 5 with 16GB RAM     - 2nd case - MAC ID 4a:7f:14:dd:f0:35 - mandarine-worker

# Interface Configuration
interface=eth0
except-interface=lo
listen-address=10.0.0.1
bind-interfaces

# DNS Configuration
server=80.58.61.250
server=80.58.61.254
domain-needed
bogus-priv
local=/picluster.homelab.com/
domain=picluster.homelab.com

# DHCP Configuration
dhcp-range=10.0.0.32,10.0.0.128,12h

# Pre-allocated DHCP configurations for devices.
dhcp-host=d8:3a:dd:02:a3:d7,10.0.0.1   # gateway
dhcp-host=00:15:5d:85:35:cb,10.0.0.2   # ansible
dhcp-host=e4:5f:01:f5:c1:ae,10.0.0.10  # blueberry-master
dhcp-host=e4:5f:01:df:31:a2,10.0.0.11  # strawberry-master
dhcp-host=dc:a6:32:73:69:c9,10.0.0.12  # blackberry-master
dhcp-host=d8:3a:dd:b6:12:77,10.0.0.13  # cranberry-worker
dhcp-host=b8:27:eb:d2:40:87,10.0.0.14  # raspberry-worker
dhcp-host=d2:22:4c:9e:b4:6c,10.0.0.15  # orange-worker
dhcp-host=4a:7f:14:dd:f0:35,10.0.0.16  # mandarine-worker

# Hostname to IP mappings for devices and services.
host-record=gateway.picluster.homelab.com,10.0.0.1
host-record=ansible.picluster.homelab.com,10.0.0.2
host-record=blueberry-master.picluster.homelab.com,10.0.0.10
host-record=strawberry-master.picluster.homelab.com,10.0.0.11
host-record=blackberry-master.picluster.homelab.com,10.0.0.12
host-record=cranberry-worker.picluster.homelab.com,10.0.0.13
host-record=raspberry-worker.picluster.homelab.com,10.0.0.14
host-record=orange-worker.picluster.homelab.com,10.0.0.15
host-record=mandarine-worker.picluster.homelab.com,10.0.0.16

# Logging Configuration
log-queries
log-dhcp
```

- Restarting the dnsmasq service:

```bash
sudo systemctl restart dnsmasq
```

### Configuring Ansible Role

DHCP static IP leases and DNS records are automatically taken from the ansible inventory file for **`hosts with ip`**, **`hostname`**, and **`mac`** variables defined. Refer to the **`ansible/inventory.yml`** file.

DNS/DHCP specific configuration, dnsmasq role variables for the gateway host, are located in the **`ansible/host_vars/gateway.yaml`** file.

### Useful Commands

- Checking DHCP leases on the DHCP server:

```bash
cat /var/lib/misc/dnsmasq.leases
```

- Checking DHCP lease on DHCP Clients:

```bash
cat /var/lib/dhcp/dhclient.leases
```

- Releasing the current DHCP lease (DHCP client):

```bash
sudo dhclient -r <interface>
```

- Obtaining a new DHCP lease (DHCP client):

```bash
sudo dhclient <interface>
```

- Releasing a DHCP lease (DHCP server):

```bash
sudo dhcp_release <interface> <address> <MAC address> <client_id>
```

**`<interface>`**, **`<address>`**, **`<MAC address>`**, and **`<client_id>`** are columns in the file **`/var/lib/misc/dnsmasq.leases`**.

### Additional configuration: Updating DNS resolver

- To specify the DNS server to be used, modify the file **`/etc/systemd/resolved.conf`**

```bash
[Resolve]
DNS=10.0.0.1
Domains=picluster.homelab.com
```

- Restart the systemd-resolve service:

```bash
sudo systemctl restart systemd-resolved
```

## NTP Server Configuration

**`chrony`** is used for configuring NTP synchronization. The **`gateway`** hosts an NTP server, and the rest of the cluster nodes are configured as NTP clients. The ansible role [**quantfinancehub.ntp**](https://galaxy.ansible.com/quantfinancehub/ntp) facilitates automating NTP configuration tasks.

- Installation of chrony

```bash
sudo apt install chrony
```

- Configuration of chrony in **`/etc/chrony/chrony.conf`**

On the gateway:

```bash
pool 0.ubuntu.pool.ntp.org iburst
pool 1.ubuntu.pool.ntp.org iburst
pool 2.ubuntu.pool.ntp.org iburst
pool 3.ubuntu.pool.ntp.org iburst

allow 10.0.0.0/24
```

On nodes (blueberry-master, strawberry-master, etc.):

```bash
server 10.0.0.1 iburst
```

- Restart Chrony on gateay and each node

```bash
sudo systemctl restart chrony
```

- Check Chrony status ongatewau and each node

```bash
sudo systemctl status chrony
```

### Chrony Commands

- Checking time synchronization:

```bash
timedatectl
```

- Viewing Chrony's activity:

```bash
chronyc activity
```

- Viewing a detailed list of time servers:

```bash
chronyc sources
```

- Confirming Chrony synchronization:

```bash
chronyc tracking
```
