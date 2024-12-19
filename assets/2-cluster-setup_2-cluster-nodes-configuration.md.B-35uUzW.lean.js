import{_ as e,c as n,j as i,a as t,t as l,a0 as r,o}from"./chunks/framework.pWuaoOf3.js";const h="/pikube-kubernetes-service/assets/raspberry-icon-1.CG7N6r18.jpg",p="/pikube-kubernetes-service/assets/circuit-board-icon-1.CfifDMRF.jpg",d="/pikube-kubernetes-service/assets/orange-icon-1.CFMmqCPI.jpg",m=JSON.parse('{"title":"Cluster Nodes Configuration","description":"A configuration guide for setting up the nodes of the PiKube Kubernetes Cluster. It covers the setup for Ubuntu cloud-init configuration files, basic OS configuration, and storage options for both Raspberry Pi and Orange Pi nodes.","frontmatter":{"title":"Cluster Nodes Configuration","permalink":"/docs/2-cluster-setup/2-cluster-nodes-configuration","description":"A configuration guide for setting up the nodes of the PiKube Kubernetes Cluster. It covers the setup for Ubuntu cloud-init configuration files, basic OS configuration, and storage options for both Raspberry Pi and Orange Pi nodes.","last_modified_at":"19-02-2024"},"headers":[],"relativePath":"2-cluster-setup/2-cluster-nodes-configuration.md","filePath":"2-cluster-setup/2-cluster-nodes-configuration.md"}'),k={name:"2-cluster-setup/2-cluster-nodes-configuration.md"},c={id:"frontmatter-title",tabindex:"-1"};function g(a,s,u,y,F,b){return o(),n("div",null,[i("h1",c,[t(l(a.$frontmatter.title)+" ",1),s[0]||(s[0]=i("a",{class:"header-anchor",href:"#frontmatter-title","aria-label":'Permalink to "{{ $frontmatter.title }}"'},"​",-1))]),s[1]||(s[1]=r('<div style="display:flex;justify-content:center;align-items:center;"><div style="flex:0 0 auto;margin-right:60x;"><img src="'+h+'" alt="Raspberry Pi" width="100"></div><div style="flex:0 0 auto;"><img src="'+p+'" alt="Single Board Computing" width="100"></div><div style="flex:0 0 auto;"><img src="'+d+`" alt="Orange Pi" width="100"></div></div><h2 id="cluster-composition" tabindex="-1">Cluster Composition <a class="header-anchor" href="#cluster-composition" aria-label="Permalink to &quot;Cluster Composition&quot;">​</a></h2><p>The PiKube Kubernetes Cluster comprises:</p><ul><li><p><strong>3 Master Nodes:</strong></p><ul><li><code>blueberry-master</code> (Raspberry Pi 4B, 4GB)</li><li><code>strawberry-master</code> (Raspberry Pi 4B, 8GB)</li><li><code>blackberry-master</code> (Raspberry Pi 4B, 8GB)</li></ul></li><li><p><strong>4 Worker Nodes:</strong></p><ul><li><code>cranberry-worker</code> (Raspberry Pi 5, 8GB)</li><li><code>raspberry-worker</code> (Raspberry Pi 3B+, 1GB)</li><li><code>orange-worker</code> (Orange Pi 5B, 16GB)</li><li><code>mandarine-worker</code> (Orange Pi 5B, 16GB)</li></ul></li></ul><h2 id="raspberry-pi-nodes" tabindex="-1">Raspberry Pi Nodes <a class="header-anchor" href="#raspberry-pi-nodes" aria-label="Permalink to &quot;Raspberry Pi Nodes&quot;">​</a></h2><h3 id="raspberry-storage-configuration" tabindex="-1">Raspberry Storage Configuration <a class="header-anchor" href="#raspberry-storage-configuration" aria-label="Permalink to &quot;Raspberry Storage Configuration&quot;">​</a></h3><p>Nodes boot from an SD Card or SSD Disk, based on the selected storage architecture.</p><p><strong>Dedicated Disks Storage Architecture:</strong> High-performance microSD cards are utilized for efficient operation and data management across the cluster nodes, with specific configurations highlighted below:</p><ul><li><p><strong><code>SanDisk Extreme PRO MicroSDXC</code></strong> for <strong><code>blackberry-master</code></strong>: 128 GB, up to 200 MB/s speed, A2 App Performance, UHS-I Class 10, U3, V30, ensuring superior performance and durability.</p></li><li><p><strong><code>SAMSUNG EVO Select MicroSD-Memory-Card</code></strong> for <strong><code>strawberry-master</code></strong> and <strong><code>cranberry-worker</code></strong>: 256GB, designed to provide ample storage for extensive Kubernetes operations.</p></li><li><p><strong><code>SanDisk SDSQXAO MicroSDXC UHS-I U3</code></strong> for <strong><code>blueberry-master</code></strong>: 128GB, enhancing speed and reliability for master node operations.</p></li><li><p><strong><code>SanDisk Industrial EDGE MicroSD</code></strong> for <strong><code>raspberry-worker</code></strong>: 32GB CLASS 10 A1, optimized for stable and reliable operations.</p></li></ul><p><strong>Centralized SAN Architecture:</strong> Planned for future implementation to further enhance storage solutions.</p><h3 id="os-installation-and-initial-configuration" tabindex="-1">OS Installation and Initial Configuration <a class="header-anchor" href="#os-installation-and-initial-configuration" aria-label="Permalink to &quot;OS Installation and Initial Configuration&quot;">​</a></h3><p><strong><code>Ubuntu Server 24.04.x LTS</code></strong> is the chosen operating system for Raspberry Pi nodes, installed using a <a href="https://ubuntu.com/download/raspberry-pi" target="_blank" rel="noreferrer"><strong><code>preconfigured cloud image</code></strong></a>. Initial configuration leverages cloud-init configuration files, specifically <strong><code>user-data</code></strong>, which is modified prior to the first startup.</p><ul><li><strong><code>Procedure</code></strong>: Burn the Ubuntu OS image onto an SD-card using tools such as <a href="https://www.raspberrypi.com/software/" target="_blank" rel="noreferrer"><strong><code>Raspberry PI Imager</code></strong></a> or <a href="https://etcher.balena.io/" target="_blank" rel="noreferrer"><strong><code>Balena Etcher</code></strong></a>. Modify the <strong><code>user-data</code></strong> file within the <strong><code>/boot</code></strong> directory on the SD Card to customize the initial setup.</li></ul><div class="centered-table"><table tabindex="0"><thead><tr><th style="text-align:center;">Dedicated Disks</th></tr></thead><tbody><tr><td style="text-align:center;"><a href="https://github.com/AElQazouiInsights/pikube-kubernetes-service/metal/cloud-init/raspberry-pi/nodes/user-data" target="_blank" rel="noreferrer">user-data</a></td></tr></tbody></table></div><p><strong>Example cloud-init YAML file for Node Configuration</strong>:</p><div class="language-yaml vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">yaml</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">#cloud-config</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Set TimeZone and Locale for UK</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">timezone</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">Europe/London</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">locale</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">en_GB.UTF-8</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Hostname</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">hostname</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&lt;node-name&gt;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># cloud-init not managing hosts file. only hostname is added</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">manage_etc_hosts</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">localhost</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">users</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  # not using default ubuntu user</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">  - </span><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">pi</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    primary_group</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">users</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    groups</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: [</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">adm</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">admin</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    shell</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">/bin/bash</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    sudo</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">ALL=(ALL) NOPASSWD:ALL</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    lock_passwd</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">    ssh_authorized_keys</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">      - </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">&lt;public-key&gt;</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Reboot to enable Wifi configuration (more details in network-config file)</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">power_state</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">:</span></span>
<span class="line"><span style="--shiki-light:#22863A;--shiki-dark:#85E89D;">  mode</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: </span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">reboot</span></span></code></pre></div><h3 id="generating-ssh-keys" tabindex="-1">Generating SSH Keys <a class="header-anchor" href="#generating-ssh-keys" aria-label="Permalink to &quot;Generating SSH Keys&quot;">​</a></h3><p>Secure Shell (SSH) keys are a pair of cryptographic keys that can be used to authenticate to an SSH server as an alternative to password-based logins. A private key, which is secret, and a public key, which is shared, are used in the authentication process. Here is a procedure to generate an SSH key pair, referred to as my_key in the cloud-config examples:</p><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ssh-keygen</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -t</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> rsa</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -b</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 4096</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -f</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ~/.ssh/key-generation</span></span></code></pre></div><p>This command creates a private key <strong><code>key-generation</code></strong> and a public key <strong><code>key-generation.pub</code></strong> in the <strong><code>~/.ssh/</code></strong> directory.</p><ul><li>Connect and update each node</li></ul><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> apt-get</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> update</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> &amp;&amp; </span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> apt-get</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> upgrade</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -y</span></span></code></pre></div><ul><li>Change default GPU Memory Split by adding to <strong><code>/boot/firmware/config.txt</code></strong></li></ul><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Set GPU Memory Allocation</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Adjust the amount of memory allocated to the GPU.</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># For headless mode and non-graphical applications, a lower value is often sufficient.</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Value is in megabytes (MB). Default is 64.</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># Recommended: 16 for headless scenarios, adjust as needed.</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">gpu_mem</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">16</span></span></code></pre></div><div class="tip custom-block github-alert"><p class="custom-block-title">TIP</p><p></p><p>Since Raspberry Pis in the cluster are configured as headless servers without monitors and are using the server version of Ubuntu distribution (without the desktop GUI), the reserved GPU memory for Raspberry Pis can be set to the lowest possible value (16MB).</p></div><h2 id="orange-pi-nodes" tabindex="-1">Orange Pi Nodes <a class="header-anchor" href="#orange-pi-nodes" aria-label="Permalink to &quot;Orange Pi Nodes&quot;">​</a></h2><h3 id="orange-storage-configuration" tabindex="-1">Orange Storage Configuration <a class="header-anchor" href="#orange-storage-configuration" aria-label="Permalink to &quot;Orange Storage Configuration&quot;">​</a></h3><p>Orange Pi nodes can boot from an SD Card or SSD Disk, contingent on the chosen storage architecture.</p><p><strong>Dedicated Disks Storage Architecture</strong>: The PiKube Kubernetes cluster utilizes high-performance microSD cards to meet the specific storage demands of each node, ensuring efficient operation and data management. The configurations include:</p><ul><li><p><strong>SanDisk Extreme PLUS MicroSDXC</strong> for <strong><code>orange-worker</code></strong>: 128 GB with A2 App Performance, speeds up to 170 MB/s, Class 10, U3, V30, optimized for rapid data processing and reliability.</p></li><li><p><strong>SAMSUNG EVO Select MicroSD-Memory-Card</strong> for <strong><code>mandarine-worker</code></strong>: 256GB, designed to enhance storage capacity for demanding applications.</p></li></ul><p><strong>Centralized SAN Architecture</strong>: Future plans include the integration of a centralized SAN architecture to further enhance storage capabilities.</p><h3 id="manual-os-installation-and-initial-configuration" tabindex="-1">Manual OS Installation and Initial Configuration <a class="header-anchor" href="#manual-os-installation-and-initial-configuration" aria-label="Permalink to &quot;Manual OS Installation and Initial Configuration&quot;">​</a></h3><p><strong><code>Ubuntu Server 22.04.x LTS</code></strong> is the chosen operating system for Orange Pi nodes, installed using a <a href="https://github.com/Joshua-Riek/ubuntu-rockchip/releases" target="_blank" rel="noreferrer"><strong><code>preconfigured cloud image</code></strong></a>. For Orange Pi devices, IP addresses are now assigned based on Client Identifiers instead of MAC addresses, unlike the Raspberry Pi devices.</p><h4 id="identifying-orange-pi-ip-address-and-remote-connection" tabindex="-1">Identifying Orange Pi IP Address and Remote Connection <a class="header-anchor" href="#identifying-orange-pi-ip-address-and-remote-connection" aria-label="Permalink to &quot;Identifying Orange Pi IP Address and Remote Connection&quot;">​</a></h4><p>Prior to configuring Orange Pi nodes within the PiKube Kubernetes Cluster, it&#39;s essential to identify each node&#39;s IP address allocated via DHCP for secure remote connectivity and configuration.</p><ul><li><p><strong>Identifying Orange Pi IP Address</strong>: From <code>gateway</code> configured with <code>dnsmasq</code> and <code>DHCP</code> services, the <code>arp -a</code> command lists known IP addresses on the network, aiding in identifying IP addresses allocated to Orange Pi nodes.</p></li><li><p><strong>Remote Connection</strong>: Connect to the Orange Pi using SSH with the default credentials (username: <code>ubuntu</code>, password: <code>ubuntu</code>) by replacing <code>ip_address</code> with the actual IP address identified. During the first connection, type <code>yes</code> when prompted to accept the host&#39;s SSH key, followed by a prompt to change the default <code>ubuntu</code> password. Use <code>qwerty</code> as a temporary password.</p></li></ul><h4 id="configuration-steps" tabindex="-1">Configuration Steps <a class="header-anchor" href="#configuration-steps" aria-label="Permalink to &quot;Configuration Steps&quot;">​</a></h4><ul><li><strong>Log in to the Orange Pi using the identified IP address</strong>:</li></ul><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ssh</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> ubuntu@ip_address</span></span></code></pre></div><ul><li>Update the System</li></ul><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> apt-get</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> update</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> &amp;&amp; </span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> apt-get</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> upgrade</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -y</span></span></code></pre></div><ul><li>Set Timezone and Locale</li></ul><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> timedatectl</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> set-timezone</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> Europe/London</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> locale-gen</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> en_GB.UTF-8</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> update-locale</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> LANG=en_GB.UTF-8</span></span></code></pre></div><ul><li>Set Hostname (orange or mandarine)</li></ul><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> hostnamectl</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> set-hostname</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> X-worker</span></span></code></pre></div><ul><li>Create User pi</li></ul><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> adduser</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> pi</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> usermod</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -aG</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> sudo,adm</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> pi</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> chsh</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -s</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /bin/bash</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> pi</span></span>
<span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">echo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &#39;pi ALL=(ALL) NOPASSWD:ALL&#39;</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> |</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tee</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -a</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /etc/sudoers</span></span></code></pre></div><ul><li>Set Up SSH for User pi</li></ul><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> mkdir</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -p</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /home/pi/.ssh</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> chmod</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 700</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /home/pi/.ssh</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> touch</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /home/pi/.ssh/authorized_keys</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> chmod</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> 600</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /home/pi/.ssh/authorized_keys</span></span></code></pre></div><ul><li>Add Public SSH Key by replacing &quot;public-ssh-key&quot; with the actual SSH public key generated</li></ul><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">echo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> &quot;public-ssh-key&quot;</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> |</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> tee</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /home/pi/.ssh/authorized_keys</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># it should be in this format</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># echo &quot;ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCvE8ju9IxfwyEj0NSJhqrI2sob6QfpEuCAJurNc2XA54/pldF3CpvJlijTOPk2Q3m115DIE/MIGbltki8z59JdMmd/k+kxoXKfF/oZJmolyr6A6sxmtOyi+2Zcf+T/XPg6OEvYfIV3dK5lsIEUl4fDYRIGKcnzVplfJ/lG7N6IV55zvVzFTaehVA1HasLpJ2wDUUQVGMSnWFf16N8r0CscZebxZAzZoHB1SLUEZcQ3EkcM0+DMRXb9jtvLnnLJ6QNLnYOwS4gQ3Myrh2I1IyhnZIA2UQyYyqL1Z3iFfM27NhRFS8WvltDF1a58uXlN9p8bp6/dZRJnzMhNXrAMkwVixGx+nfmO9RNWHDQU7kUJEqmzXuyf6TjGtl1Csk+YvYpe+m1p4plyXDed5O3NtdHQ0O5BbXii5bLceTY2KucI15Mf4ClWihdVLmipRgwzNSmlZMoI8TRspOaTTI8KZ/VKvmbrKSBaNPKxTkP9+0J3fQPk10Qwc6xOJx80/ldOn30= amine@Who-Am-I&quot; | sudo tee /home/pi/.ssh/authorized_keys</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;"># ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCvE8ju9IxfwyEj0NSJhqrI2sob6QfpEuCAJurNc2XA54/pldF3CpvJlijTOPk2Q3m115DIE/MIGbltki8z59JdMmd/k+kxoXKfF/oZJmolyr6A6sxmtOyi+2Zcf+T/XPg6OEvYfIV3dK5lsIEUl4fDYRIGKcnzVplfJ/lG7N6IV55zvVzFTaehVA1HasLpJ2wDUUQVGMSnWFf16N8r0CscZebxZAzZoHB1SLUEZcQ3EkcM0+DMRXb9jtvLnnLJ6QNLnYOwS4gQ3Myrh2I1IyhnZIA2UQyYyqL1Z3iFfM27NhRFS8WvltDF1a58uXlN9p8bp6/dZRJnzMhNXrAMkwVixGx+nfmO9RNWHDQU7kUJEqmzXuyf6TjGtl1Csk+YvYpe+m1p4plyXDed5O3NtdHQ0O5BbXii5bLceTY2KucI15Mf4ClWihdVLmipRgwzNSmlZMoI8TRspOaTTI8KZ/VKvmbrKSBaNPKxTkP9+0J3fQPk10Qwc6xOJx80/ldOn30= amine@Who-Am-I</span></span></code></pre></div><ul><li>Change Ownership of the SSH Directory</li></ul><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> chown</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -R</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> pi:pi</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /home/pi/.ssh</span></span></code></pre></div><p>Since the Orange Pi devices use the <code>end1</code> interface and require consistent IP assignments despite changing MAC addresses, configure <code>systemd-networkd</code> to use a unique <strong>Client Identifier</strong>.</p><ul><li>Identify the Network Interface</li></ul><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">systemctl</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> is-active</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> systemd-networkd</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">systemctl</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> is-active</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> NetworkManager</span></span></code></pre></div><ul><li>Create or edit the .network configuration file</li></ul><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> nano</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> /etc/systemd/network/10-end1.network</span></span></code></pre></div><ul><li>Replace <code>unique-client-id</code> with a unique identifier for each Orange Pi device (e.g., <code>orange-worker</code>, <code>mandarine-worker</code>).</li></ul><div class="language-ini vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">ini</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">[Match]</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">Name</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">=end1</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">[Network]</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">DHCP</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">=yes</span></span>
<span class="line"></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">[DHCP]</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">ClientIdentifier</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">=&lt;uique-client-id&gt;</span></span></code></pre></div><ul><li>Restart <code>systemd-networkd</code> service</li></ul><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> systemctl</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> restart</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> systemd-networkd</span></span></code></pre></div><ul><li>Verify IP address assignment (e.g.,<code> 10.0.0.15</code>).</li></ul><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">ip</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> addr</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> show</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> end1</span></span></code></pre></div><ul><li>Reboot the system</li></ul><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">sudo</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> shutdown</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -r</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> now</span></span></code></pre></div><div class="note custom-block github-alert"><p class="custom-block-title">NOTE</p><p></p><p>To enable the WIFI interface (wlan0) on Orange Pi, if needed, follow this <a href="https://github.com/Joshua-Riek/ubuntu-rockchip/wiki/Orange-Pi-5" target="_blank" rel="noreferrer"><strong><code>wiki</code></strong></a>.</p></div>`,67))])}const f=e(k,[["render",g]]);export{m as __pageData,f as default};
