---
title: Kubernetes Networking Fundamentals
permalink: /docs/13-reference-docs/kubernetes-networking-fundamentals
---

# {{ $frontmatter.title }}

## Enabling Inter-Pod and Pod-to-Pod Communication Across Nodes (CNI)

Kubernetes itself does not provide built-in functionality for containers to communicate across different nodes. Instead, it operates under the assumption that each container (pod) has a unique, routable IP address within the cluster. To enable communication between containers across different nodes, networking solutions based on Pure Layer-3, VxLAN, or UDP models can be implemented.

The Container Network Interface (CNI) plugin system is essential for enabling this cross-node communication. Flannel represents one such solution, providing an overlay network that can operate using either UDP or VxLAN-based models.

The CNI plugin has several key responsibilities. It must insert a network interface into the container network namespace (for example, one end of a virtual ethernet (veth) pair) and make any necessary modifications on the host (such as attaching the other end of the veth into a bridge). Additionally, the plugin assigns IP addresses to interfaces and configures routes according to the IP Address Management section by calling the appropriate IP Address Management (IPAM) plugin.

## Enabling Kubernetes Services Load Balancing

In Kubernetes, a Service provides an abstract method for exposing applications running on a set of Pods as a network service. Kubernetes assigns individual IP addresses to Pods and provides a single DNS name (and single Virtual IP address) for a set of Pods, enabling load-balancing across them. This functionality relies on two critical components:

1. `kube-proxy`: Responsible for implementing the Virtual IP address and load balancing mechanism
2. `kube-dns`: Handles the mapping of DNS service names to virtual IP addresses

For a deeper understanding, refer to the [Kubernetes documentation on Service Concepts](https://kubernetes.io/docs/concepts/services-networking/service/).

### kube-proxy: Kubernetes Services Internal Load-balancing

The kube-proxy component plays a vital role in any Kubernetes deployment. Its primary function is to load-balance traffic directed at services (through Cluster IPs and Node Ports) to the appropriate backend pods.

Kube-proxy can operate in three distinct modes, each implemented using different data plane technologies:

1. User-space mode (legacy implementation, no longer commonly used)
2. Iptables proxy mode (default since Kubernetes v1.2)
3. IPVS mode (introduced in Kubernetes v1.8, GA in v1.11)

Both iptables and IPVS modes utilize the operating system's packet filtering layer (`netfilter`).

In iptables mode, kube-proxy monitors the Kubernetes control plane for changes in Service and Endpoint objects. For each Service, it creates iptables rules that capture traffic to the Service's clusterIP and port, redirecting that traffic to one of the Service's backend sets. For each Endpoint object, it establishes iptables rules to select a backend Pod.

By default, when operating in iptables mode, kube-proxy selects backends randomly. For more detailed information about IPVS functionality, consult the [IPVS documentation](https://github.com/kubernetes/kubernetes/blob/master/pkg/proxy/ipvs/README.md).

To summarize the process:

1. A service represents a collection of pods, each with their own IP address (e.g., 10.1.0.3, 10.2.3.5, 10.3.5.6)
2. Every Kubernetes service receives an IP address (e.g., 10.23.1.2)
3. The CNI plugin manages POD address allocation and ensures pod routability
4. kube-dns resolves Kubernetes service DNS names to IP addresses (mapping something like my-svc.my-namespace.svc.cluster.local to 10.23.1.2)
5. kube-proxy configures iptables rules for random load balancing between pods

When a request is made to my-svc.my-namespace.svc.cluster.local, it resolves to 10.23.1.2, and then iptables rules on the node (created by kube-proxy) randomly redirect it to one of the backend pod IPs (10.1.0.3, 10.2.3.5, or 10.3.5.6).

## Routing Incoming HTTP/HTTPS Traffic

The Ingress resource in Kubernetes exposes HTTP and HTTPS routes from outside the cluster to services within it. Traffic routing is controlled by rules defined in the Ingress resource.

An Ingress can be configured to:

- Provide services with externally-reachable URLs
- Load balance traffic
- Terminate SSL/TLS connections
- Offer name-based virtual hosting

The Ingress Controller component is responsible for implementing the Ingress rules. It typically needs to be deployed within the cluster, usually with an external load balancer to handle incoming traffic.

Every Ingress resource belongs to an IngressClass resource that contains information about the Ingress Controller implementing the class. This design allows different controllers to implement different Ingresses.

For comprehensive information, consult the [Kubernetes documentation on Ingress Controller Concepts](https://kubernetes.io/docs/concepts/services-networking/ingress/).

## Further Reading

For those interested in diving deeper into Kubernetes networking concepts, here are some valuable resources:

1. [Understanding Container Networking](https://blog.mbrt.dev/posts/container-network/)
2. [Deep Dive into Kubernetes Networking (Rancher Whitepaper)](https://more.suse.com/rs/937-DCH-261/images/Diving-Deep-Into-Kubernetes-Networking.pdf)
3. [Pod IP Address Allocation Process](https://ronaknathani.com/blog/2020/08/how-a-kubernetes-pod-gets-an-ip-address/)
4. [CNI GitHub Repository](https://github.com/containernetworking/cni)
5. [Understanding Flannel Networking](https://msazure.club/flannel-networking-demystify/)
6. [Creating Overlay Networks with Linux Bridges and VXLANs](https://ilearnedhowto.wordpress.com/2017/02/16/how-to-create-overlay-networks-using-linux-bridges-and-vxlans/)