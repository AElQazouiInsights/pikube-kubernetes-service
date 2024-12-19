import{_ as t,c as o,a0 as i,o as n}from"./chunks/framework.pWuaoOf3.js";const a="/pikube-kubernetes-service/assets/dictionary.nK3BnTUJ.jpg",f=JSON.parse('{"title":"Glossary","description":"","frontmatter":{},"headers":[],"relativePath":"0-definitions.md","filePath":"0-definitions.md"}'),s={name:"0-definitions.md"};function r(c,e,d,l,u,g){return n(),o("div",null,e[0]||(e[0]=[i('<p align="center"><img alt="definitions" src="'+a+'" width="%" height="%"></p><hr><h1 id="glossary" tabindex="-1"><strong>Glossary</strong> <a class="header-anchor" href="#glossary" aria-label="Permalink to &quot;**Glossary**&quot;">​</a></h1><p>This <strong><code>glossary</code></strong> serves as a reference to help readers understand the meaning of specific terms or concepts used within <strong><code>pi-cluster</code></strong> home lab project, along with their definitions, explanations.</p><p>===</p><h2 id="table-of-content" tabindex="-1"><strong>Table of content</strong> <a class="header-anchor" href="#table-of-content" aria-label="Permalink to &quot;**Table of content**&quot;">​</a></h2><ul><li><a href="#glossary"><strong>Glossary</strong></a><ul><li><a href="#table-of-content"><strong>Table of content</strong></a></li><li><a href="#networking"><strong>Networking</strong></a><ul><li><a href="#i-routerfirewall"><strong>i. Router/Firewall</strong></a></li><li><a href="#ii-dns-domain-name-system"><strong>ii. DNS (Domain Name System)</strong></a></li><li><a href="#iii-ntp-network-time-protocol"><strong>iii. NTP (Network Time Protocol)</strong></a></li><li><a href="#iv-dhcp-dynamic-host-configuration-protocol"><strong>iv. DHCP (Dynamic Host Configuration Protocol)</strong></a></li></ul></li><li><a href="#cloud-environments-system-initialization"><strong>Cloud environments system initialization</strong></a><ul><li><a href="#i-cloud-init"><strong>i. Cloud-init</strong></a></li><li><a href="#ii-user-data"><strong>ii. User Data</strong></a></li><li><a href="#iii-network-config"><strong>iii. Network Config</strong></a></li></ul></li></ul></li></ul><hr><p><a id="networking"></a></p><h2 id="networking" tabindex="-1"><strong>Networking</strong> <a class="header-anchor" href="#networking" aria-label="Permalink to &quot;**Networking**&quot;">​</a></h2><p><a id="router-firewall"></a></p><h3 id="i-router-firewall" tabindex="-1"><strong>i. Router/Firewall</strong> <a class="header-anchor" href="#i-router-firewall" aria-label="Permalink to &quot;**i. Router/Firewall**&quot;">​</a></h3><p>A <strong><code>router</code></strong> is a networking device that connects different networks together, such as a local network and the internet.</p><p>A <strong><code>firewall</code></strong> is a security device or software that monitors and controls incoming and outgoing network traffic, helping to protect a network from unauthorized access or threats. Routers can include firewall features to enhance network security. The primary function of a router is to forward data packets between networks and manage network traffic.</p><p><a id="dns"></a></p><h3 id="ii-dns-domain-name-system" tabindex="-1"><strong>ii. DNS (Domain Name System)</strong> <a class="header-anchor" href="#ii-dns-domain-name-system" aria-label="Permalink to &quot;**ii. DNS (Domain Name System)**&quot;">​</a></h3><p><strong><code>DNS</code></strong> is a system that translates human-readable domain names (like &lt;www.example.com&gt;) into IP addresses, which are used by computers to locate and communicate with each other on the internet. It acts as a directory for the internet, allowing users to access websites using familiar domain names instead of numerical IP addresses. DNS servers store records that map domain names to IP addresses.</p><p><a id="ntp"></a></p><h3 id="iii-ntp-network-time-protocol" tabindex="-1"><strong>iii. NTP (Network Time Protocol)</strong> <a class="header-anchor" href="#iii-ntp-network-time-protocol" aria-label="Permalink to &quot;**iii. NTP (Network Time Protocol)**&quot;">​</a></h3><p><strong><code>NTP</code></strong> is a protocol used to synchronize the time of computer systems over a network. It ensures that the clocks of devices on a network are accurate and consistent. NTP servers provide the correct time to client devices, helping maintain synchronization for various network activities.</p><p><a id="dhcp"></a></p><h3 id="iv-dhcp-dynamic-host-configuration-protocol" tabindex="-1"><strong>iv. DHCP (Dynamic Host Configuration Protocol)</strong> <a class="header-anchor" href="#iv-dhcp-dynamic-host-configuration-protocol" aria-label="Permalink to &quot;**iv. DHCP (Dynamic Host Configuration Protocol)**&quot;">​</a></h3><p><strong><code>DHCP</code></strong> is a network protocol that automates the process of assigning IP addresses, subnet masks, default gateways, and other network configuration parameters to devices on a network. It simplifies the process of setting up and managing IP addresses for devices by dynamically assigning them as needed. DHCP servers manage IP address leases, ensuring efficient and organized IP address allocation.</p><p><em>📌 <strong>In summary, a router/firewall manages network traffic, DNS translates domain names into IP addresses, NTP ensures accurate time synchronization, and DHCP automates IP address assignment for devices on a network. Each component serves a specific role in networking and contributes to the overall functionality, security, and efficiency of a network environment</strong> 📌</em></p><p><a id="cloud-environments-system-initialization"></a></p><h2 id="cloud-environments-system-initialization" tabindex="-1"><strong>Cloud environments system initialization</strong> <a class="header-anchor" href="#cloud-environments-system-initialization" aria-label="Permalink to &quot;**Cloud environments system initialization**&quot;">​</a></h2><p><a id="cloud-init"></a></p><h3 id="i-cloud-init" tabindex="-1"><strong>i. Cloud-init</strong> <a class="header-anchor" href="#i-cloud-init" aria-label="Permalink to &quot;**i. Cloud-init**&quot;">​</a></h3><p><strong><code>cloud-init</code></strong> is an initialization system used in cloud environments to customize and configure virtual machines (VMs) when they are launched. It enables automation and consistency by allowing users to define configurations for VMs in a cloud-config format. These configurations can include user accounts, SSH keys, package installations, file content, and more. cloud-init processes these configurations during the VM&#39;s boot process, making it easier to set up instances on various cloud platforms.</p><p><a id="user-data"></a></p><h3 id="ii-user-data" tabindex="-1"><strong>ii. User Data</strong> <a class="header-anchor" href="#ii-user-data" aria-label="Permalink to &quot;**ii. User Data**&quot;">​</a></h3><p>In the context of cloud-init, <strong><code>user data</code></strong> refers to the configuration data provided when launching a new VM instance. This data is passed to the VM during its boot process and is processed by <strong><code>cloud-init</code></strong>. The <strong><code>user data</code></strong> is typically specified as a text string in the cloud-config format. It allows to customize the instance&#39;s initial setup by defining various configurations, such as creating users, installing software, running scripts, and more.</p><p><a id="network-config"></a></p><h3 id="iii-network-config" tabindex="-1"><strong>iii. Network Config</strong> <a class="header-anchor" href="#iii-network-config" aria-label="Permalink to &quot;**iii. Network Config**&quot;">​</a></h3><p>The <strong><code>network-config</code></strong> is a subset of the cloud-config format used by <strong><code>cloud-init</code></strong> to configure networking settings for VM instances. It allows to define networking parameters such as IP addresses, network interfaces, DNS servers, and more. By providing network configuration in the <strong><code>user data</code></strong>, it ensures that the VM&#39;s networking is properly configured when it boots up. This is especially useful for cases where a customized networking settings is needed beyond what the cloud provider&#39;s default configuration offers.</p><p><em>📌 <strong>In summary, cloud-init is a tool for initializing and configuring VMs in cloud environments. &quot;User data&quot; refers to the configuration data you provide to customize VMs during launch. &quot;Network config&quot; is a subset of user data used to set up networking settings for VM instances. Together, these concepts allow you to automate and customize the setup of VM instances in cloud environments</strong> 📌</em></p>',36)]))}const m=t(s,[["render",r]]);export{f as __pageData,m as default};
