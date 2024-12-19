---
title: Using Metal LB as a Load Balancer in K3S
permalink: /docs/5-networking/3-load-balancer-metal-lb/
description: How to disable default K3S load balancer and configure a custom Metal LB as load balancer in PiKube Kubernetes Service.
last_modified_at: "12-11-2023"
---

# {{ $frontmatter.title }}

<p align="center">
    <img alt="metal-lb"
    src="../resources/networking/metal-lb-logo.svg"
    width="30%"
    height="%">
</p>

<!-- - [{{ $frontmatter.title }}](#-frontmattertitle-)
  - [Disabling the Klipper Load Balancer](#disabling-the-klipper-load-balancer)
  - [Initial Services Post-Installation](#initial-services-post-installation)
  - [Why Choose Metal LB?](#why-choose-metal-lb)
  - [Metal LB's Role](#metal-lbs-role)
  - [How Metal LB Operates](#how-metal-lb-operates)
  - [Install Metal Load Balancer using Helm](#install-metal-load-balancer-using-helm) -->

Opting for **`Metal LB`** in place of the default **`Klipper Load Balancer`** in K3S is a strategic choice due to **`Metal LB`**'s versatility and broad compatibility with different Kubernetes distributions. Its adaptability across various environments renders **`Metal LB`** a more favorable option for load balancing needs in Kubernetes.

## Disabling the Klipper Load Balancer

To incorporate Metal LB, first disable the embedded Klipper Load Balancer in K3S. This is achieved using the **`--disable servicelb`** option during the K3S server installation performed during the [**`Master Nodes Set Up`**](https://github.com/Crypto-Aggressor/PiKube-Kubernetes-Cluster/blob/production/documentation/2.4-k3s-installation.md#3-setting-up-master-nodes).

## Initial Services Post-Installation

Following the K3S installation with the disabled service load balancer, the default started pods and services include:

- Pods (Displayed using kubectl get pods --all-namespaces)
- Services (Shown via kubectl get services --all-namespaces)

## Why Choose Metal LB?

In bare-metal Kubernetes clusters, services of type LoadBalancer remain in a "pending" state indefinitely, as seen above with the Traefik LoadBalancer service. Standard Kubernetes doesn't provide a network load balancer implementation for bare-metal environments. The typical options, "NodePort" and "externalIPs," have limitations for production use, often relegating bare-metal clusters to a secondary status.

## Metal LB's Role

MetalLB bridges this gap, offering a network load balancer that integrates with standard network equipment. It enables external services on bare-metal clusters to be accessible via a pool of external IP addresses.

## How Metal LB Operates

MetalLB operates in two key modes, Border Gateway Protocol (BGP) and Layer 2 Networking, and consists of two primary components:

- **Operational Modes**:

  - **`Layer 2 Mode`**

    - **`Universal Compatibility`**: Functions with any Ethernet network.
    - **`Leader Node Role`**: Designates a leader node to advertise Kubernetes LoadBalancer services to the local network, making it appear as if the node possesses multiple IP addresses. This node responds to ARP (IPv4) and NDP (IPv6) requests.
    - **`Simplicity and Compatibility:`**: Enables straightforward local network access to Kubernetes services, ideal for environments not requiring complex routing. While broadly compatible, it may lack the scalability and control of more intricate network setups.

  - **`BGP Mode`**

    - **`Router Requirements`**: Necessitates specific routers to function effectively.
    - **`Sophisticated Network Integration`**: Facilitates more dynamic and nuanced routing of traffic, making it suitable for environments demanding advanced routing capabilities and scalability.

- **MetalLB Components**:

  - **`Controller`**: Handles the allocation of IP addresses from a predefined pool, ensuring each service receives a unique external IP as needed.

  - **`Speaker`**: Operates as a DaemonSet pod on each worker node, announcing the service IPs allocated by the Controller, thus facilitating network communication.

TODO pikube-metal-lb-architecture.drawio

- **Understanding the Networking Modes:**

  - **`Layer 2 Networking:`** At the data link layer, this mode provides local network access to Kubernetes services. Primarily serving as a failover mechanism, the leader node channels traffic for a service IP and kube-proxy disperses it across the service's pods.

  - **`Border Gateway Protocol (BGP):`** A pivotal internet routing protocol, BGP in MetalLB allows for versatile and dynamic traffic routing, particularly beneficial in complex network environments where flexibility and scalability are paramount.

## Install Metal Load Balancer using Helm

- Add the **`Metal LB`** Helm Repository

```bash
helm repo add metallb https://metallb.github.io/metallb
```

- Update Helm Repositories to fetche the latest charts available in the **`Metal LB`** repository

```bash
helm repo update
```

- Create a dedicated namespace for **`Metal LB`** for organizational purposes

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml create namespace metal-lb
```

- Install **`Metal LB`** in the specified namespace using Helm

```bash
helm install metallb metallb/metallb --namespace metal-lb --kubeconfig=/home/pi/.kube/config.yaml
```

- Verify the Deployment by confirming that the **`Metal LB`** pods are running successfully in the metal-lb namespace

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml -n metal-lb get pod
```

- Configure the **`IP Address Pool`** and **`Announcement Method`** (Layer 2 advertisement) by creating the **`metal-lb-config.yaml`** file

```yaml
---
# MetalLB Address Pool Configuration
# This defines a range of IP addresses that Metal LB controls and can assign.
apiVersion: metallb.io/v1beta1
kind: IPAddressPool
metadata:
  name: picluster-pool
  namespace: metal-lb
spec:
  addresses:
  - 10.0.0.100-10.0.0.200

---
# Layer 2 Advertisement Configuration
# This section configures Metal LB to use Layer 2 mode to advertise IP addresses.
apiVersion: metallb.io/v1beta1
kind: L2Advertisement
metadata:
  name: main-l2-advertisement
  namespace: metal-lb
spec:
  ipAddressPools:
  - picluster-pool
```

- Apply the Manifest

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f metal-lb-config.yaml
```

After applying the configuration, **`Metal LB`** will assign external IP addresses from the defined pool to services of type LoadBalancer, like **`Traefik`**.

Check LoadBalancer Services by listing all services in the cluster to check if the LoadBalancer services have been assigned an external IP

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml get services --all-namespaces
```
