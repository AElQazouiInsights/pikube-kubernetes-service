---
title: K3S Installation
permalink: /documentation/5-networking/2-k3s-installation/
description: How to install K3s, a lightweight kubernetes distribution, in the PiKube Kubernetes Service. Single master node and high availability deployment can be used.
last_modified_at: "12-11-2023"
---

<p align="center">
    <img alt="k3s-installation"
    src="../resources/networking/k3s-logo.svg"
    width="%"
    height="%">
</p>

- [Node Pre-configuration](#node-pre-configuration)
- [Configuring a High-Availability K3s Cluster](#configuring-a-high-availability-k3s-cluster)
  - [Load Balancer setup with HA Proxy](#load-balancer-setup-with-ha-proxy)
  - [Setting Up Master Nodes](#setting-up-master-nodes)
  - [Update Master Nodes](#update-master-nodes)
  - [Setting Up Worker Nodes](#setting-up-worker-nodes)
  - [Update Worker Nodes](#update-worker-nodes)
- [Interacting with K3S](#interacting-with-k3s)
  - [Leveraging kubectl](#leveraging-kubectl)
  - [Leveraging Helm](#leveraging-helm)
  - [Leveraging K9S](#leveraging-k9s)
- [K3S Cluster automatic upgrade](#k3s-cluster-automatic-upgrade)
- [Resetting the K3S Cluster](#resetting-the-k3s-cluster)
- [Enable Ansible-driven remote deployment for K3S Cluster](#enable-ansible-driven-remote-deployment-for-k3s-cluster)

<p align="center">
    <img alt="k3s-installation"
    src="../resources/networking/how-k3s-works.svg"
    width="%"
    height="%">
</p>

**`K3S`** simplifies the traditional Kubernetes setup by encapsulating all its processes into a singular binary. This binary can be rolled out on servers, adopting one of two specific roles: either **`k3s-server`** or **`k3s-agent`**.

- **`k3s-server`**: This role initializes all the control plane processes of Kubernetes, including the API, Scheduler, and Controller. Additionally, it also runs worker processes such as Kubelet and kube-proxy. This means that a master node can double up as a worker node too.

- **`k3s-agent`**: This role focuses solely on the worker processes of Kubernetes, which are the Kubelet and kube-proxy.

For the setup, the Kubernetes cluster will span 7 nodes

- **`blueberry-master`** - *node 1*
- **`strawberry-master`** - *node 2*
- **`blackberry-master`** - *node 3*
- **`cranberry-worker`** - *node 4*
- **`raspberry-worker`** - *node 5*
- **`orange-worker`** - *node 6*
- **`mandarine-worker`** - *node 7*

Among these, `node 1` to `node 3` will be designated as the `control-plane`, whereas `node 4` to `node 7` will function as `worker nodes`.

## Node Pre-configuration

Configure iptables for Bridged Traffic to ensure iptables can observe bridged traffic

- Load the **`br_netfilter`** kernel module
  
```bash
echo "br_netfilter" | sudo tee /etc/modules-load.d/k8s.conf
```

- Adjust settings to enable netfilter for bridged IPv6 and IPv4 traffic

```bash
cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-ip6tables = 1
net.bridge.bridge-nf-call-iptables = 1
EOF
```

- Apply the updated system control settings

```bash
sudo sysctl --system
```

> 🚨 Warning
>
> - *Deactivate Swap Memory (Applicable only for x86 nodes so not applicable to Raspberry Pis & Orange Pis)*
>
> ```bash
> sudo swapoff -a
> ```
>
> *To make this change persistent, open **`/etc/fstab`** and comment out the line related to swap memory.*

- Activate **`cgroup`** functionalities on Raspberry Pi Nodes by updating **`/boot/firmware/cmdline.txt`**.  **`cgroup`** functionalities activation on Orange Pi Nodes is not needed.

```bash
cgroup_enable=cpuset cgroup_memory=1 cgroup_enable=memory
```

To apply all the changes and ensure they take effect, reboot the server or node

## Configuring a High-Availability K3s Cluster

To achieve high availability (HA) with K3s:

- Deploy a minimum of three server nodes. These nodes will manage the Kubernetes API and oversee the control plane services.
- Utilize an embedded etcd datastore, a shift from the default embedded SQLite used in single-server configurations.

<p align="center">
    <img alt="k3s-installation"
    src="../resources/networking/k3s-high-availability.drawio.svg"
    width="%"
    height="%">
</p>

<a id="load-balancer-setup-with-ha-proxy"></a>

### Load Balancer setup with HA Proxy

For continuous availability of the Kubernetes API, implement a load balancer. In this setup, HAProxy will be used, a prominent network load balancer.

> 📌 **`Note:`**
>
> *For HA installations with K3s, configuration parameters will be supplied via config files rather than direct arguments or environment variables during installation.*
>
> *HAProxy load balancer will reside on the gateway node.*
>
> 📢 **`Important:`**
>
> *This specific configuration presents a single point of failure since HAProxy isn't in an HA mode. To achieve a genuine high-availability setup for the load balancer, pair HAProxy with Keepalived.*

- Installing and Configuring **`HAProxy`**

```bash
sudo apt install haproxy
```

- Edit the HAProxy configuration at **`/etc/haproxy/haproxy.cfg`**

```ini
#---------------------------------------------------------------------
# Global settings
#---------------------------------------------------------------------
global
  # Define the logging services
  log /dev/log  local0
  log /dev/log  local1 notice
  
  # Specify the HAProxy user and group
  user haproxy
  group haproxy

  # Run as a daemon
  daemon
  
  # Chroot directory for added security
  chroot /var/lib/haproxy

  # Admin socket for management
  stats socket /run/haproxy/admin.sock mode 660 level admin expose-fd listeners
  stats timeout 30s

#---------------------------------------------------------------------
# Default settings
#---------------------------------------------------------------------
defaults
  # Use the global logging settings
  log global
  
  # Mode & options
  mode http
  option httplog
  option dontlognull

  # Retry settings
  retries 3

  # Timeouts for various operations
  timeout http-request 10s
  timeout queue 20s
  timeout connect 10s
  timeout client 1h
  timeout server 1h
  timeout http-keep-alive 10s
  timeout check 10s

  # HTTP error files
  errorfile 400 /etc/haproxy/errors/400.http
  errorfile 403 /etc/haproxy/errors/403.http
  errorfile 408 /etc/haproxy/errors/408.http
  errorfile 500 /etc/haproxy/errors/500.http
  errorfile 502 /etc/haproxy/errors/502.http
  errorfile 503 /etc/haproxy/errors/503.http
  errorfile 504 /etc/haproxy/errors/504.http

#---------------------------------------------------------------------
# Frontend for Kubernetes API Server
#---------------------------------------------------------------------
frontend k8s_apiserver
    # Listen on all interfaces on port 6443
    bind *:6443
    
    # TCP mode with logging
    mode tcp
    option tcplog

    # Send incoming traffic to the backend
    default_backend k8s_controlplane

#---------------------------------------------------------------------
# Backend for Kubernetes Control Plane
#---------------------------------------------------------------------
backend k8s_controlplane
    # Health check settings
    option httpchk GET /healthz
    http-check expect status 200

    # TCP mode with SSL checks
    mode tcp
    option ssl-hello-chk

    # Load balancing strategy
    balance roundrobin

    # List of control plane nodes
    server blueberry-master 10.0.0.10:6443 check
    server strawberry-master 10.0.0.11:6443 check
    server blackberry-master 10.0.0.12:6443 check

#---------------------------------------------------------------------
# Stats settings (add this section to resolve the warning)
#---------------------------------------------------------------------
listen stats
    bind *:9000
    mode http
    stats enable
    stats hide-version
    stats uri /stats
    stats realm Haproxy\ Statistics
    stats auth admin:admin

    # Set the required timeouts for the 'stats' section
    timeout client  10m
    timeout connect 10m
    timeout server  10m
```

With this setup, **`HAProxy`** will distribute API server requests (on TCP port 6443) between the three master nodes using a **`round-robin strategy`**. The designated IP address for the Kubernetes API corresponds to the gateway's IP.

- Restart HAProxy

```bash
sudo systemctl restart haproxy
```

- Check HAProxy config is valid

```bash
sudo haproxy -c -f /etc/haproxy/haproxy.cfg
```

- Enable HAProxy at Boot

```bash
systemctl enable haproxy
```

### Setting Up Master Nodes

> 🚨 **`IMPORTANT`**
>
> *Before going further, [**`Node Pre-configuration`**](https://github.com/Crypto-Aggressor/PiKube-Kubernetes-Cluster/blob/production/documentation/2.4-k3s-installation.md#1-node-pre-configuration) need to be completed.*

For a High-Availability configuration, the embedded etcd datastore will be utilized. A comprehensive guide can be found in the K3S documentation under [**`High Availability with Embedded etcd`**](https://docs.k3s.io/datastore/ha-embedded)

- Initialize Configuration Directory

```bash
sudo mkdir -p /etc/rancher/k3s
```

- Establish a shared cluster token to be stored in **`/etc/rancher/k3s/cluster-token`**. This token acts as a shared secret for all cluster nodes—both master and worker. Generate a random token, insert it in **`/etc/rancher/k3s/cluster-token`** file and grant it the right permissions.

```bash
PIKUBE_TOKEN=$(openssl rand -base64 32)
echo "secret1" | sudo tee /etc/rancher/k3s/cluster-token
sudo chmod 600 /etc/rancher/k3s/cluster-token
```

- Craft the K3S Kubelet Configuration in **`/etc/rancher/k3s/kubelet.config`** to use **`--token-file`** argument during installation instead of the **`K3S_TOKEN`** environment variable

```yaml
apiVersion: kubelet.config.k8s.io/v1beta1
kind: KubeletConfiguration
shutdownGracePeriod: 30s
shutdownGracePeriodCriticalPods: 10s
```

- Formulate a K3S configuration file at **`/etc/rancher/k3s/config.yaml`** to activates Kubernetes' "Graceful Node Shutdown" feature

```yaml
token-file: /etc/rancher/k3s/cluster-token
disable:
- local-storage
- servicelb
- traefik
etcd-expose-metrics: true
kube-controller-manager-arg:
- bind-address=0.0.0.0
- terminated-pod-gc-threshold=10
kube-proxy-arg:
- metrics-bind-address=0.0.0.0
kube-scheduler-arg:
- bind-address=0.0.0.0
kubelet-arg:
- config=/etc/rancher/k3s/kubelet.config
node-taint:
- node-role.kubernetes.io/master=true:NoSchedule
tls-san:
- 10.0.0.1
- gateway.picluster.homelab.com
write-kubeconfig-mode: 644
```

> 📌 Note
>
> *The configuration parameters mirror the command-line arguments usually used with K3S. For instance, **`token-file: /etc/rancher/k3s/cluster-token`** equates to **`--token-file /etc/rancher/k3s/cluster-token`***

- In this setup, we're emphasizing:

  - The use of the **`token-file`** parameter instead of the **`K3S_TOKEN`** environment variable
  - The inclusion of the K3S API load balancer IP via the **`tls-san`** parameter for the TLS certificate
  - The exposition of etcd metrics with **`etcd-expose-metrics`**

- Deploy the Primary Master Node **`blueberry-master`**

```bash
curl -sfL https://get.k3s.io | sh -s - server --cluster-init
```

- Roll Out the Secondary Master Nodes **`strawberry-master`**, and **`blackberry-master`**

```bash
curl -sfL https://get.k3s.io | sudo sh -s - server --server https://gateway.picluster.homelab.com:6443
```

### Update Master Nodes

From **`blueberry-master`** get the node token

```bash
node_token=$(sudo cat /var/lib/rancher/k3s/server/node-token)
```

- Stop the running Master node

```bash
sudo systemctl stop k3s
```

- Ensure *`jq`* is installed

```bash
sudo apt install jq -y
```

- Get the latest K3S version

```bash
latest_version=$(curl -s https://api.github.com/repos/k3s-io/k3s/releases/latest | jq -r '.tag_name')
```

- Upgrade to the latest version

```bash
curl -sfL https://get.k3s.io | sudo INSTALL_K3S_VERSION=$latest_version sh -s - server --server https://gateway.picluster.homelab.com:6443 --token $node_token
```

### Setting Up Worker Nodes

- Initialize Configuration Directory

```bash
sudo mkdir -p /etc/rancher/k3s
```

- Retreive **`cluster-token`** used to setup the Master Nodes and insert it in **`/etc/rancher/k3s/cluster-token`**. This token acts as a shared secret for all cluster nodes—both master and worker
  
```bash
echo "secret1" | sudo tee /etc/rancher/k3s/cluster-token
sudo chmod 600 /etc/rancher/k3s/cluster-token
```

- Craft the K3S Kubelet Configuration in **`/etc/rancher/k3s/kubelet.config`** to use **`--token-file`** argument during installation instead of the **`K3S_TOKEN`** environment variable

```yaml
apiVersion: kubelet.config.k8s.io/v1beta1
kind: KubeletConfiguration
shutdownGracePeriod: 30s
shutdownGracePeriodCriticalPods: 10s
```

- Formulate a K3S configuration file at **`/etc/rancher/k3s/config.yaml`** to activates Kubernetes' "Graceful Node Shutdown" feature

```yaml
token-file: /etc/rancher/k3s/cluster-token
node-label:
  - 'node_type=worker'
kubelet-arg:
  - 'config=/etc/rancher/k3s/kubelet.config'
kube-proxy-arg:
  - 'metrics-bind-address=0.0.0.0'
```

> 📌 Note
>
> *This setup is equivalent to running k3s with the following arguments:*
>
> **--token-file /etc/rancher/k3s/cluster-token**
>
> **--node-label 'node_type=worker'**
>
> **--kubelet-arg 'config=/etc/rancher/k3s/kubelet.config'**
>
> **--kube-proxy-arg 'metrics-bind-address=0.0.0.0'**

- Installing the Agent Node

```bash
curl -sfL https://get.k3s.io | sh -s - agent --server https://gateway.picluster.quantfinancehub.com:6443
```

- Label the Worker Nodes from within **`gateway`**

```bash
kubectl label nodes <worker-node-name> node-role.kubernetes.io/worker=worker
```

### Update Worker Nodes

From **`blueberry-master`** get the node token

```bash
node_token=$(sudo cat /var/lib/rancher/k3s/server/node-token)
```

On target node, export the token retrieved

```bash
export node_token=Master_Node_Key
```

- Stop the running Worker node

```bash
sudo systemctl stop k3s-agent
```

- Ensure *`jq`* is installed

```bash
sudo apt install jq -y
```

- Get the latest K3S version

```bash
latest_version=$(curl -s https://api.github.com/repos/k3s-io/k3s/releases/latest | jq -r '.tag_name')
```

- Upgrade to the latest version

```bash
 curl -sfL https://get.k3s.io | K3S_URL=https://gateway.picluster.quantfinancehub.com:6443 K3S_TOKEN="$node_token" INSTALL_K3S_VERSION="$latest_version" sh -
```

## Interacting with K3S

To set up remote access to the Kubernetes Cluster from **`gateway`**, begin by retrieving the **`k3s-config.yaml`** file from the primary master node, **`blueberry-master`**. This file, integral to K3s configuration, contains essential information such as:

- **`Kubernetes Configuration`**: Standard settings for your Kubernetes cluster, as Kubernetes typically relies on YAML files for configuration.

- **`Cluster Settings`**: Specific settings for the K3s distribution, including server URLs and authentication data, crucial for the operation and communication of K3s nodes and clients within the cluster.

- **`Context and Credential Information`**: Details defining default clusters, users, and namespaces, along with user credentials like client certificates or tokens.

- **`Client Configuration`**: This enables tools like kubectl, the Kubernetes command-line tool, to interact with your K3s cluster when used as a kubeconfig file.

- **`Edge Computing Optimizations`**: Given K3s’s emphasis on edge computing, the file may contain configurations tailored for low-resource environments, aiming to reduce memory and CPU usage.

Follow these commands to transfer and configure the file:

- On **`blueberry-master`**: copy **`k3s.yaml`**, setting appropriate permissions:

```bash
sudo cp /etc/rancher/k3s/k3s.yaml ~/k3s.yaml
sudo chown pi:users ~/k3s.yaml
```

- On **`gateway`**: create a **`.kube`** folder and copy **`k3s.yaml`** from **`blueberry-master`**, renaming it to **`config.yaml`**.

- Modify the server address to match the gateway's IP instead of the default loopback address:

```bash
sudo scp -i ~/.ssh/gateway-pi pi@blueberry-master:~/k3s.yaml ~/.kube/config.yaml
sudo chown root:root /home/pi/.kube -R
sudo chmod 644 /home/pi/.kube/config.yaml
sudo nano ~/.kube/config.yaml
# In the file, replace 'server: https://127.0.0.1:6443' with 'server: https://10.0.0.1:6443'
```

### Leveraging kubectl

Install **`kubectl`**, Kubernetes's command-line tool, on the **`gateway`**:

- Download the latest stable version of **`kubectl`** for Linux (ARM64 architecture):

```bash
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/arm64/kubectl"
```

- Make the downloaded file executable:

```bash
chmod +x kubectl
```

Move the executable to **`/usr/local/bin`** to make it available system-wide:

```bash
sudo mv kubectl /usr/local/bin/
```

- (Optional) Remove the downloaded file if it's no longer needed:

```bash
rm kubectl
```

### Leveraging Helm

Install **`helm`**, Kubernetes's package manager, on the **`gateway`**:

- Download the Helm Installation Script: This script will automatically fetch the latest version of Helm and install it:

```bash
curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
```

- Make the downloaded file executable:

```bash
chmod 700 get_helm.sh
```

Run the Installation Script: This will install Helm on the system:

```bash
./get_helm.sh
```

- (Optional) Remove the downloaded file if it's no longer needed:

```bash
rm get_helm.sh
```

### Leveraging K9S

Install **`K9s`**, on the **`gateway`**, a terminal-based UI to interact with the Kubernetes clusters, providing a more efficient and streamlined way to manage Kubernetes resources.

```bash
# Fetch the latest k9s release version, download, extract, and install it
curl -s https://api.github.com/repos/derailed/k9s/releases/latest \
| grep "browser_download_url.*Linux_arm64.tar.gz" \
| cut -d : -f 2,3 \
| tr -d \" \
| wget -qi -
tar -zxvf k9s_Linux_arm64.tar.gz k9s \
&& sudo mv k9s /usr/local/bin/ \
&& rm k9s_Linux_arm64.tar.gz
```

## K3S Cluster automatic upgrade

K3s clusters can be seamlessly upgraded using the **`Rancher’s system-upgrade-controller`**. This controller utilizes a **`Custom Resource Definition`** (CRD) named **`"Plan"`** to schedule and execute upgrades in accordance with the specified upgrade plans.
For more comprehensive details, refer to the [**`K3S Automated Upgrades documentation`**](https://docs.k3s.io/upgrades/automated).

From **`gateway`**, install Rancher’s System Upgrade Controller by deploying the controller in **`pi-cluster`** using **`kubectl`**:

```bash
sudo kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f https://github.com/rancher/system-upgrade-controller/releases/latest/download/system-upgrade-controller.yaml
```

Check the output

```bash
namespace/system-upgrade created
serviceaccount/system-upgrade created
clusterrolebinding.rbac.authorization.k8s.io/system-upgrade created
configmap/default-controller-env created
deployment.apps/system-upgrade-controller created
```

To **`Configure Upgrade Plans`**, at least two separate upgrade plans needs to be set up : one for the server (master) nodes and another for the agent (worker) nodes.

- Get the latest K3S version

```bash
latest_version=$(curl -s https://api.github.com/repos/k3s-io/k3s/releases/latest | jq -r '.tag_name')
```

- Replace **`<new_version>`** with **`$latest_version`** value on both plans.

- Plan for Master Nodes creating **`k3s-server-upgrade.yaml`** on **`gateway`**:

```bash
apiVersion: upgrade.cattle.io/v1
kind: Plan
metadata:
  name: k3s-server
  namespace: system-upgrade
  labels:
    k3s-upgrade: server
spec:
  nodeSelector:
    matchExpressions:
      - key: node-role.kubernetes.io/control-plane
        operator: Exists
  serviceAccountName: system-upgrade
  concurrency: 1
  cordon: true  # Cordon node before upgrade
  upgrade:
    image: rancher/k3s-upgrade
  version: <new_version>
```

- Plan for Worker Nodes creating **`k3s-agent-upgrade.yaml`** on **`gateway`**:

```bash
apiVersion: upgrade.cattle.io/v1
kind: Plan
metadata:
  name: k3s-agent
  namespace: system-upgrade
  labels:
    k3s-upgrade: agent
spec:
  nodeSelector:
    matchExpressions:
      - key: node-role.kubernetes.io/control-plane
        operator: DoesNotExist
  serviceAccountName: system-upgrade
  prepare:  # Ensures server nodes are upgraded first
    image: rancher/k3s-upgrade
    args:
      - prepare
      - k3s-server
  concurrency: 1
  cordon: true  # Cordon node before upgrade
  upgrade:
    image: rancher/k3s-upgrade
  version: <new_version>
```

- Execute Upgrade Plans:

```bash
sudo kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f k3s-server-upgrade.yaml -f k3s-agent-upgrade.yaml
```

Check the output

```bash
plan.upgrade.cattle.io/k3s-server created
plan.upgrade.cattle.io/k3s-agent created
```

## Resetting the K3S Cluster

To reset the K3S cluster, run the K3S uninstallation scripts on both the master and worker nodes. This process will remove the K3S installation and configurations from each node.

- On Worker Nodes: Perform this step on each of the worker nodes in the cluster. Run the following command to uninstall K3S from a worker node:

```bash
/usr/local/bin/k3s-agent-uninstall.sh
sudo rm -rf /etc/rancher /var/lib/rancher /var/lib/kubelet /etc/cni /var/lib/etcd /run/k3s /run/flannel /usr/local/bin/k3s /usr/local/bin/kubectl /var/lib/containerd/
```

- On Master Nodes: Similarly, on each master node, execute the command below to uninstall K3S:

```bash
/usr/local/bin/k3s-uninstall.sh
sudo rm -rf /etc/rancher /var/lib/rancher /var/lib/kubelet /etc/cni /var/lib/etcd /run/k3s /run/flannel /usr/local/bin/k3s /usr/local/bin/kubectl /var/lib/containerd/
```

This approach ensures that K3S is properly removed from all nodes, effectively resetting the cluster. Remember, these commands must be executed on each node individually.

## Enable Ansible-driven remote deployment for K3S Cluster

To enable Ansible-driven remote deployment of pods in your K3s cluster, configure the primary master by installing the kubernetes Python package on **`blueberry-master`**. This package is necessary for the Ansible [**`kubernetes.core collection`**](https://github.com/ansible-collections/kubernetes.core) to interact with your Kubernetes cluster.

```bash
echo 'export PATH=$PATH:/home/pi/.local/bin' >> ~/.bashrc
source ~/.bashrc
sudo apt install python3-pip -y
pip3 install kubernetes
```
