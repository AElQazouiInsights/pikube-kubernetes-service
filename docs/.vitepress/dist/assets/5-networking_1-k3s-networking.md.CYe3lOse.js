import{_ as t,c as n,a0 as a,o as i}from"./chunks/framework.p2VkXzrt.js";const p=JSON.parse('{"title":"K3S Networking","description":"An overview of the default networking components in K3S and instructions for their configuration in PiKube Kubernetes Service.","frontmatter":{"title":"K3S Networking","permalink":"/docs/5-networking/1-k3s-networking","description":"An overview of the default networking components in K3S and instructions for their configuration in PiKube Kubernetes Service.","last_modified_at":"28-02-2024"},"headers":[],"relativePath":"5-networking/1-k3s-networking.md","filePath":"5-networking/1-k3s-networking.md"}'),r={name:"5-networking/1-k3s-networking.md"};function o(s,e,l,d,c,h){return i(),n("div",null,e[0]||(e[0]=[a('<ul><li><a href="#default-networking-components-in-k3s">Default Networking Components in K3S</a></li><li><a href="#configuring-flannel-as-the-cni">Configuring Flannel as the CNI</a></li><li><a href="#coredns-configuration-in-k3s">CoreDNS Configuration in K3S</a></li><li><a href="#configuring-traefik-as-the-ingress-controller">Configuring Traefik as the Ingress Controller</a></li><li><a href="#integrating-klipper-lb-as-the-load-balancer">Integrating Klipper-LB as the Load Balancer</a></li></ul><h2 id="default-networking-components-in-k3s" tabindex="-1">Default Networking Components in K3S <a class="header-anchor" href="#default-networking-components-in-k3s" aria-label="Permalink to &quot;Default Networking Components in K3S&quot;">​</a></h2><p>K3S includes a set of pre-configured networking components essential for enabling basic Kubernetes networking capabilities:</p><ul><li><a href="https://github.com/flannel-io/flannel" target="_blank" rel="noreferrer"><strong><code>Flannel</code></strong></a>: A <strong><code>Container Networking Interface</code></strong> (CNI) plugin used to facilitate pod-to-pod communication.</li><li><a href="https://coredns.io/" target="_blank" rel="noreferrer"><strong><code>CoreDNS</code></strong></a>: Provides DNS services for the cluster, enabling name resolution across services and pods. <a href="https://traefik.io/" target="_blank" rel="noreferrer"><strong><code>Traefik</code></strong></a>: An ingress controller that manages external access to services within the cluster.</li><li><a href="https://github.com/k3s-io/klipper-lb" target="_blank" rel="noreferrer"><strong><code>Klipper Load Balancer</code></strong></a>: An internal load balancer for distributing traffic to services.</li></ul><p><a id="configuring-flannel-as-the-cni"></a></p><h2 id="configuring-flannel-as-the-cni" tabindex="-1">Configuring Flannel as the CNI <a class="header-anchor" href="#configuring-flannel-as-the-cni" aria-label="Permalink to &quot;Configuring Flannel as the CNI&quot;">​</a></h2><p>By default, K3S utilizes Flannel as its CNI, with <strong><code>Virtual Extensible Local Area Network</code></strong> (VXLAN) as the default backend mechanism. Flannel operates within the K3S process as a backend routine.</p><p>To customize network settings, K3S allows the specification of server installation options for defining pod and service network <strong><code>Classless Inter-Domain Routing</code></strong> (CIDRs), as well as selecting the Flannel backend.</p><table tabindex="0"><thead><tr><th>k3s server option</th><th>default value</th><th>Description</th></tr></thead><tbody><tr><td><code>--cluster-cidr</code></td><td>&quot;10.42.0.0/16&quot;</td><td>CIDR for pod IP allocation</td></tr><tr><td><code>--service-cidr</code></td><td>&quot;10.43.0.0/16&quot;</td><td>CIDR for service IP allocation</td></tr><tr><td><code>--flannel-backend</code></td><td>&quot;vxlan&quot;</td><td>Backend type (none, vxlan, ipsec, host-gw, wireguard)</td></tr></tbody></table><p>Each node is allocated a subnet (10.42.X.0/24) from which pods receive their IP addresses.</p><p><strong>Network Interfaces Created by Flannel:</strong></p><ul><li><strong>flannel.1:</strong> Acts as a VXLAN Tunnel Endpoint (VTEP), facilitating overlay networking. To view the <strong><code>flannel.1</code></strong> interface details, head to a PiKube Kubernetes Service node and run the below command</li></ul><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> ip</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -d</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> addr</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> show</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> flannel.1</span></span></code></pre></div><ul><li><strong>cni0:</strong> A bridge interface providing a gateway for pod communication within the node subnet (10.42.X.1/24). To view the <strong><code>cni0</code></strong> interface details, head to a PiKube Kubernetes Service node and run the below command</li></ul><div class="language-bash vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">bash</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> ip</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> -d</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> addr</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> show</span><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;"> cni0</span></span></code></pre></div><p>Traffic between cni0 and flannel.1 is managed through IP routing enabled on each node.</p><p>TODO pikube-vxlan-network-with-flannel.drawio</p><p><a id="coredns-configuration-in-k3s"></a></p><h2 id="coredns-configuration-in-k3s" tabindex="-1">CoreDNS Configuration in K3S <a class="header-anchor" href="#coredns-configuration-in-k3s" aria-label="Permalink to &quot;CoreDNS Configuration in K3S&quot;">​</a></h2><p>K3S provides options to configure CoreDNS during server installation. CoreDNS is a flexible, extensible DNS server that can serve as the Kubernetes cluster DNS. Here are the configuration options available:</p><table tabindex="0"><thead><tr><th>k3s server option</th><th>default value</th><th>Description</th></tr></thead><tbody><tr><td><code>--cluster-dns</code></td><td>&quot;10.43.0.10&quot;</td><td>Specifies the cluster IP for the CoreDNS service. It should fall within the service CIDR range</td></tr><tr><td><code>--cluster-domain</code></td><td>&quot;cluster.local&quot;</td><td>Defines the cluster domain</td></tr></tbody></table><p><a id="configuring-traefik-as-the-ingress-ontroller"></a></p><h2 id="configuring-traefik-as-the-ingress-controller" tabindex="-1">Configuring Traefik as the Ingress Controller <a class="header-anchor" href="#configuring-traefik-as-the-ingress-controller" aria-label="Permalink to &quot;Configuring Traefik as the Ingress Controller&quot;">​</a></h2><p><a href="https://traefik.io/" target="_blank" rel="noreferrer"><strong><code>Traefik</code></strong></a> is an HTTP reverse proxy and load balancer designed to ease microservices deployment. It comes embedded with K3S installations and is deployed by default. However, for users seeking more control over Traefik&#39;s version and configuration, it&#39;s possible to disable the default installation and proceed with a manual setup.</p><p>To exclude the embedded Traefik during K3S installation, use the <strong><code>--disable traefik</code></strong> option. Additional configuration details and advanced options for Traefik are available in the <a href="https://github.com/Crypto-Aggressor/PiKube-Kubernetes-Cluster/blob/production/documentation/2.7-ingress-controller-traefik.md" target="_blank" rel="noreferrer"><strong><code>Traefik Ingress Controller Documentation</code></strong></a>.</p><p><a id="integrating-klipper-lb-as-the Load Balancer"></a></p><h2 id="integrating-klipper-lb-as-the-load-balancer" tabindex="-1">Integrating Klipper-LB as the Load Balancer <a class="header-anchor" href="#integrating-klipper-lb-as-the-load-balancer" aria-label="Permalink to &quot;Integrating Klipper-LB as the Load Balancer&quot;">​</a></h2><p>By default, K3S deploys the <a href="https://github.com/k3s-io/klipper-lb" target="_blank" rel="noreferrer"><strong><code>Klipper Load Balancer</code></strong></a> (Klipper-LB) upon cluster initialization. In scenarios where Metal LB or another load balancing solution is preferred, it&#39;s necessary to disable Klipper-LB.</p><p>Disabling the embedded load balancer can be achieved by configuring all servers in the cluster with the <strong><code>--disable servicelb option</code></strong>. For those opting to install <strong><code>Metal LB</code></strong>, guidance and installation instructions are provided in the <a href="https://github.com/Crypto-Aggressor/PiKube-Kubernetes-Cluster/blob/production/documentation/2.6-load-balancer-metal-lb.md" target="_blank" rel="noreferrer"><strong><code>Metal LB Documentation</code></strong></a>.</p>',29)]))}const u=t(r,[["render",o]]);export{p as __pageData,u as default};
