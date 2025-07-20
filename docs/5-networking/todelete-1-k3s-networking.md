---
title: K3s Networking Overview
permalink: /docs/5-networking/1-k3s-networking
description: Comprehensive overview of K3s default networking components and configuration options for the PiKube Kubernetes Service cluster.
last_modified_at: "2025-07
-11"
---

# {{ $frontmatter.title }}

## Overview

K3s comes with a complete networking stack pre-configured and ready to use. This integrated approach simplifies cluster deployment while maintaining the flexibility to customize networking components as needed.

## Default Networking Stack

K3s includes four core networking components that provide complete cluster connectivity:

### Container Networking Interface (CNI)
- **[Flannel](https://github.com/flannel-io/flannel)**: Default CNI plugin enabling pod-to-pod communication across nodes using VXLAN overlay networking

### DNS Services  
- **[CoreDNS](https://coredns.io/)**: Cluster DNS server providing service discovery and name resolution for pods and services

### Ingress Controller
- **[Traefik](https://traefik.io/)**: HTTP reverse proxy and load balancer managing external access to cluster services

### Load Balancing
- **[Klipper Load Balancer](https://github.com/k3s-io/klipper-lb)**: Internal load balancer distributing traffic to services of type LoadBalancer

> [!TIP]
> **Additional Resources**
> 
> For deeper understanding of Kubernetes networking concepts, see [Kubernetes Networking Fundamentals](../13-further-reading/kubernetes-networking-fundamentals.md)

## Configuring Flannel as the CNI

By default, K3S utilizes Flannel as its CNI, with **`Virtual Extensible Local Area Network`** (VXLAN) as the default backend mechanism. Flannel operates within the K3S process as a backend routine.

To customize network settings, K3S allows the specification of server installation options for defining pod and service network **`Classless Inter-Domain Routing`** (CIDRs), as well as selecting the Flannel backend.

| k3s server option | default value | Description |
| ----- | ---- |---- |
| `--cluster-cidr` | "10.42.0.0/16" | CIDR for pod IP allocation |
| `--service-cidr` | "10.43.0.0/16" | CIDR for service IP allocation |
| `--flannel-backend` | "vxlan" | Backend type (none, vxlan, ipsec, host-gw, wireguard) |

Each node is allocated a subnet (10.42.X.0/24) from which pods receive their IP addresses.

**Network Interfaces Created by Flannel:**

- **flannel.1:** Acts as a VXLAN Tunnel Endpoint (VTEP), facilitating overlay networking. To view the **`flannel.1`** interface details, head to a PiKube Kubernetes Service node and run the below command

```bash
 ip -d addr show flannel.1
```

- **cni0:** A bridge interface providing a gateway for pod communication within the node subnet (10.42.X.1/24). To view the **`cni0`** interface details, head to a PiKube Kubernetes Service node and run the below command

```bash
 ip -d addr show cni0
```

Traffic between cni0 and flannel.1 is managed through IP routing enabled on each node.

> [!CAUTION] 🔜 WORK IN PROGRESS
TODO pikube-vxlan-network-with-flannel.drawio

## CoreDNS Configuration in K3S

K3S provides options to configure CoreDNS during server installation. CoreDNS is a flexible, extensible DNS server that can serve as the Kubernetes cluster DNS. Here are the configuration options available:

| k3s server option | default value | Description |
| ----- | ---- |---- |
| `--cluster-dns` | "10.43.0.10" | Specifies the cluster IP for the CoreDNS service. It should fall within the service CIDR range |
| `--cluster-domain` | "cluster.local" | Defines the cluster domain |

## Configuring Traefik as the Ingress Controller

[**`Traefik`**](https://traefik.io/) is an HTTP reverse proxy and load balancer designed to ease microservices deployment. It comes embedded with K3S installations and is deployed by default. However, for users seeking more control over Traefik's version and configuration, it's possible to disable the default installation and proceed with a manual setup.

To exclude the embedded Traefik during K3S installation, use the **`--disable traefik`** option. Additional configuration details and advanced options for Traefik are available in the [**`Traefik Ingress Controller Documentation`**](../5-networking/3-ingress-controller-traefik.md).

## Integrating Klipper-LB as the Load Balancer

By default, K3S deploys the [**`Klipper Load Balancer`**](https://github.com/k3s-io/klipper-lb) upon cluster initialization. In scenarios where other alternative load balancing solutions like `Metal LB` or `Cilium`  is preferred, it's necessary to disable `Klipper-LB`.

Disabling the embedded load balancer can be achieved by configuring all servers in the cluster with the **`--disable servicelb option`**. For those opting to install **`Metal LB`**, guidance and installation instructions are provided in the [**`Metal LB Documentation`**](../5-networking/2-load-balancer-metal-lb.md).

How to configure Cilium CNI Load balancer capabitily can be found in ["Cilium Documentation"](../5-networking/5-cilium-kubernetes-cni.md).
