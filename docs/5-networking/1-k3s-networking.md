---
title: K3S Networking
permalink: /docs/5-networking/1-k3s-networking
description: An overview of the default networking components in K3S and instructions for their configuration in PiKube Kubernetes Service.
last_modified_at: "28-02-2024"
---

- [Default Networking Components in K3S](#default-networking-components-in-k3s)
- [Configuring Flannel as the CNI](#configuring-flannel-as-the-cni)
- [CoreDNS Configuration in K3S](#coredns-configuration-in-k3s)
- [Configuring Traefik as the Ingress Controller](#configuring-traefik-as-the-ingress-controller)
- [Integrating Klipper-LB as the Load Balancer](#integrating-klipper-lb-as-the-load-balancer)

## Default Networking Components in K3S

K3S includes a set of pre-configured networking components essential for enabling basic Kubernetes networking capabilities:

- [**`Flannel`**](https://github.com/flannel-io/flannel): A **`Container Networking Interface`** (CNI) plugin used to facilitate pod-to-pod communication.
- [**`CoreDNS`**](https://coredns.io/): Provides DNS services for the cluster, enabling name resolution across services and pods.
[**`Traefik`**](https://traefik.io/): An ingress controller that manages external access to services within the cluster.
- [**`Klipper Load Balancer`**](https://github.com/k3s-io/klipper-lb): An internal load balancer for distributing traffic to services.

<a id="configuring-flannel-as-the-cni"></a>

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

TODO pikube-vxlan-network-with-flannel.drawio

<a id="coredns-configuration-in-k3s"></a>

## CoreDNS Configuration in K3S

K3S provides options to configure CoreDNS during server installation. CoreDNS is a flexible, extensible DNS server that can serve as the Kubernetes cluster DNS. Here are the configuration options available:

| k3s server option | default value | Description |
| ----- | ---- |---- |
| `--cluster-dns` | "10.43.0.10" | Specifies the cluster IP for the CoreDNS service. It should fall within the service CIDR range |
| `--cluster-domain` | "cluster.local" | Defines the cluster domain |

<a id="configuring-traefik-as-the-ingress-ontroller"></a>

## Configuring Traefik as the Ingress Controller

[**`Traefik`**](https://traefik.io/) is an HTTP reverse proxy and load balancer designed to ease microservices deployment. It comes embedded with K3S installations and is deployed by default. However, for users seeking more control over Traefik's version and configuration, it's possible to disable the default installation and proceed with a manual setup.

To exclude the embedded Traefik during K3S installation, use the **`--disable traefik`** option. Additional configuration details and advanced options for Traefik are available in the [**`Traefik Ingress Controller Documentation`**](https://github.com/Crypto-Aggressor/PiKube-Kubernetes-Cluster/blob/production/documentation/2.7-ingress-controller-traefik.md).

<a id="integrating-klipper-lb-as-the Load Balancer"></a>

## Integrating Klipper-LB as the Load Balancer

By default, K3S deploys the [**`Klipper Load Balancer`**](https://github.com/k3s-io/klipper-lb) (Klipper-LB) upon cluster initialization. In scenarios where Metal LB or another load balancing solution is preferred, it's necessary to disable Klipper-LB.

Disabling the embedded load balancer can be achieved by configuring all servers in the cluster with the **`--disable servicelb option`**. For those opting to install **`Metal LB`**, guidance and installation instructions are provided in the [**`Metal LB Documentation`**](https://github.com/Crypto-Aggressor/PiKube-Kubernetes-Cluster/blob/production/documentation/2.6-load-balancer-metal-lb.md).
