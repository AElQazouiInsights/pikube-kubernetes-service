<p align="center">
    <img alt="definitions"
    src="./resources/0-definitions/dictionary.jpg"
    width="%"
    height="%">
</p>

<hr>

# **Glossary**

This **`glossary`** serves as a reference to help readers understand the meaning of specific terms or concepts used within **`pi-cluster`** home lab project, along with their definitions, explanations.

===

## **Table of content**

- [**Glossary**](#glossary)
  - [**Table of content**](#table-of-content)
  - [**Networking**](#networking)
    - [**i. Router/Firewall**](#i-routerfirewall)
    - [**ii. DNS (Domain Name System)**](#ii-dns-domain-name-system)
    - [**iii. NTP (Network Time Protocol)**](#iii-ntp-network-time-protocol)
    - [**iv. DHCP (Dynamic Host Configuration Protocol)**](#iv-dhcp-dynamic-host-configuration-protocol)
  - [**Cloud environments system initialization**](#cloud-environments-system-initialization)
    - [**i. Cloud-init**](#i-cloud-init)
    - [**ii. User Data**](#ii-user-data)
    - [**iii. Network Config**](#iii-network-config)

<hr>

<a id="networking"></a>

## **Networking**

<a id="router-firewall"></a>

### **i. Router/Firewall**

A **`router`** is a networking device that connects different networks together, such as a local network and the internet.

A **`firewall`** is a security device or software that monitors and controls incoming and outgoing network traffic, helping to protect a network from unauthorized access or threats.
Routers can include firewall features to enhance network security.
The primary function of a router is to forward data packets between networks and manage network traffic.

<a id="dns"></a>

### **ii. DNS (Domain Name System)**

**`DNS`** is a system that translates human-readable domain names (like <www.example.com>) into IP addresses, which are used by computers to locate and communicate with each other on the internet.
It acts as a directory for the internet, allowing users to access websites using familiar domain names instead of numerical IP addresses.
DNS servers store records that map domain names to IP addresses.

<a id="ntp"></a>

### **iii. NTP (Network Time Protocol)**

**`NTP`** is a protocol used to synchronize the time of computer systems over a network.
It ensures that the clocks of devices on a network are accurate and consistent.
NTP servers provide the correct time to client devices, helping maintain synchronization for various network activities.

<a id="dhcp"></a>

### **iv. DHCP (Dynamic Host Configuration Protocol)**

**`DHCP`** is a network protocol that automates the process of assigning IP addresses, subnet masks, default gateways, and other network configuration parameters to devices on a network.
It simplifies the process of setting up and managing IP addresses for devices by dynamically assigning them as needed.
DHCP servers manage IP address leases, ensuring efficient and organized IP address allocation.

*📌 **In summary, a router/firewall manages network traffic, DNS translates domain names into IP addresses, NTP ensures accurate time synchronization, and DHCP automates IP address assignment for devices on a network. Each component serves a specific role in networking and contributes to the overall functionality, security, and efficiency of a network environment** 📌*

<a id="cloud-environments-system-initialization"></a>

## **Cloud environments system initialization**

<a id="cloud-init"></a>

### **i. Cloud-init**

**`cloud-init`** is an initialization system used in cloud environments to customize and configure virtual machines (VMs) when they are launched. It enables automation and consistency by allowing users to define configurations for VMs in a cloud-config format. These configurations can include user accounts, SSH keys, package installations, file content, and more. cloud-init processes these configurations during the VM's boot process, making it easier to set up instances on various cloud platforms.

<a id="user-data"></a>

### **ii. User Data**

In the context of cloud-init, **`user data`** refers to the configuration data provided when launching a new VM instance. This data is passed to the VM during its boot process and is processed by **`cloud-init`**. The **`user data`** is typically specified as a text string in the cloud-config format. It allows to customize the instance's initial setup by defining various configurations, such as creating users, installing software, running scripts, and more.

<a id="network-config"></a>

### **iii. Network Config**

The **`network-config`** is a subset of the cloud-config format used by **`cloud-init`** to configure networking settings for VM instances. It allows to define networking parameters such as IP addresses, network interfaces, DNS servers, and more. By providing network configuration in the **`user data`**, it ensures that the VM's networking is properly configured when it boots up. This is especially useful for cases where a customized networking settings is needed beyond what the cloud provider's default configuration offers.

*📌 **In summary, cloud-init is a tool for initializing and configuring VMs in cloud environments. "User data" refers to the configuration data you provide to customize VMs during launch. "Network config" is a subset of user data used to set up networking settings for VM instances. Together, these concepts allow you to automate and customize the setup of VM instances in cloud environments** 📌*