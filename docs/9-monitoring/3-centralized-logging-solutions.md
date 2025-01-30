---

title: Centralized Logging Solutions
permalink: /docs/monitoring/3-centralized-logging-solutions
description: Deployment guide for centralized logging solutions in PiKube Kubernetes Service, offering two distinct options, EFK stack (Elasticsearch, Fluentd/Fluentbit, Kibana) and FLG Stack (Fluentbit/Fluentd, Loki, Grafana).
last_modified_at: "03-03-2024"
---

# {{ $frontmatter.title }}

<p align="center">
    <img alt="service-mesh-with-linkerd"
    src="../resources/monitoring/logging-in-kubernetes-efk-vs-plg-stack.svg"
    width="%"
    height="%">
</p>

## Overview of Centralized Logging Solutions

For Kubernetes clusters, two primary logging solutions are available, each serving as a centralized approach for log management:

- **EFK Stack (Elasticsearch-Fluentd/Fluentbit-Kibana):**

  - [**`Elasticsearch`**](https://www.elastic.co/elasticsearch) acts as the storage and search engine for logs.
  - [**`Fluentd`**](https://www.fluentd.org/)/[**`Fluentbit`**](https://fluentbit.io/) is utilized for log collection, aggregation, and distribution.
  - [**`Kibana`**](https://www.elastic.co/kibana) serves as the interface for log visualization.

This stack is widely recognized for its comprehensive log management and analytics capabilities. However, due to Elasticsearch indexing the entirety of log content, it demands significant storage and memory resources.

- **PLG Stack (Promtail-Loki-Grafana):**

  - [**`Promtail`**](https://grafana.com/docs/loki/latest/send-data/promtail/) is the log collector, specifically designed to gather logs and forward them to Loki.
  - [**`Loki`**](https://grafana.com/oss/loki/) serves as the log storage and aggregation system, efficiently managing logs with a design inspired by Prometheus.
  - [**`Grafana`**](https://grafana.com/oss/grafana/) is the visualization layer, providing a powerful interface for querying and visualizing logs stored in Loki.

Loki offers a more resource-efficient alternative to Elasticsearch by indexing log streams with labels instead of their content, making it suitable for scalable, multi-tenant log aggregation in Kubernetes environments.

Both stacks can coexist within a cluster to offer a blend of observability and advanced log analytics.

**The PiKube Kubernetes Service logging architecture will have the followinng key components:**

- **`Loki:`** Central to the observability platform, Loki facilitates the management of logs with Prometheus-style labels, enabling the integration of metrics (Prometheus), logs (Loki), and traces (Jaeger) within the same Grafana dashboards. This integration allows for a comprehensive view of cluster services.

- **`Elasticsearch/Kibana:`** Offers advanced log analytics capabilities. Unlike Loki, which indexes log labels, Elasticsearch indexes the full content of logs, with Kibana providing a suite of visualization tools for in-depth analysis.

- **`Log Collection, Aggregation, and Distribution:`** A unified architecture based on Fluentbit/Fluentd allows for the distribution of logs to both storage platforms (ES and Loki), avoiding the need for separate log collectors. Fluentbit/Fluentd is preferred over Promtail due to its versatility in collecting logs from various sources, not limited to Kubernetes, and its ability to parse, filter, and route logs to multiple destinations.

>📢 Note
>
> *The choice between deploying the **`EFK stack`**, the **`PLG stack`**, or both, lies with the user, with either option leveraging the same log collection and distribution layer provided by Fluentbit/Fluentd.*

The architecture is depicted below:

TODO pikube-efk-loki-architecture.drawio

This solution extends beyond Kubernetes cluster logs to include external node logs (e.g., gateway node).

## Log Collection in Kubernetes Clusters

### Collecting Container Logs

Kubernetes captures the log streams, **`stdout`** and **`stderr`**, of containerized applications and stores them as log files on the host nodes, typically found in **`/var/log/containers`**. Tools like Fluentd or Fluentbit are employed to monitor these log files, enabling the filtering, transformation, and forwarding of log data to a centralized logging backend such as Elasticsearch.

For a comprehensive understanding of Kubernetes' logging architecture, refer to the [**`Cluster-level logging architectures`**](https://kubernetes.io/docs/concepts/cluster-administration/logging/) section in the official Kubernetes documentation. The approach utilizing node-level log agents, implemented through Fluentd/Fluentbit collectors, runs as a Kubernetes DaemonSet. This configuration grants them sufficient privileges to access the host's file system where the container logs are stored (e.g., **`/var/logs/containers`** in K3S).

[**`The official Helm charts for Fluentbit and Fluentd`**](https://github.com/fluent/helm-charts) facilitate the deployment of these pods as privileged DaemonSets, granting them access to the host's **/var/logs`** directory. These same Fluentd/Fluentbit agents can also gather and interpret logs from systemd services and other operating system-level logs found in /var/logs (such as syslog and kern.log).

> ⚠️ Important consideration about Kubernetes Log Format Variations
>
> *The log format in Kubernetes varies with the container runtime. Docker uses JSON format for logs, while K3S, employing the containerd runtime, adopts the CRI log format outlined as follows:*
>
> ```bash
> <time_stamp> <stream_type> <P/F> <log>
> ```
>
> *Where*
>
> - **<time_stamp>** is formatted as **%Y-%m-%dT%H:%M:%S.%L%z**, including the UTC offset.
> - **<stream_type>** indicates either **stdout** or **stderr**.
> - **<P/F>** denotes whether a log line is partial (P) for multiline logs or a full log line (F).
> - **<log\>** is the actual log message.
>
> *Fluentd/Fluentbit offers built-in parsers for the CRI log format.*

### Kubernetes System Logs

In K3S, all Kubernetes components (API server, scheduler, controller, kubelet, kube-proxy, etc.) operate within a single process (k3s). This process logs its output to **`/var/log/syslog`** when managed by **`systemd`**. Parsing this file is essential for collecting logs from Kubernetes components.

**To view K3S logs directly:**

- On the master node

```bash
sudo journalctl -u k3s
```

- On worker nodes

```bash
sudo journalctl -u k3s-agent
```

### Operating System Logs

The same DaemonSet deployed for collecting container logs can also harvest operating system logs located in **`/var/logs`**.

> ⚠️ Important consideration about Parsing Ubuntu's Syslog-Format Logs
>
> *Ubuntu's system logs stored in /var/logs (like auth.log, syslog, and kern.log) adopt a syslog format but omit the priority field and use the system's local time for timestamps:*
>
> ```bash
> <time_stamp> <host> <process>[<PID>] <message>
> ```
>
> *Where*
>
> - **<time_stamp>** is formatted as **%b %d %H:%M:%S**, showing the local date and time without the UTC offset.
> - **<host\>** is the hostname.
> - **<process\>** and **<PID\>** identify the logging process.
>
> *Fluentd/Fluentbit offers built-in parsers for the CRI log format.
>
> *A custom parser configuration for Fluentbit/Fluentd is required to handle these logs effectively.*

## Architectures for Log Collection, Aggregation, and Distribution

Two distinct architectures utilizing Fluentbit and Fluentd are available for implementation:

<!-- TODO pikube-logging-forwarder-only.drawio
TODO pikube-logging-forwarder-aggregator.drawio

<table>
  <tr>
    <td><img src="../resources/monitoring/pikube-logging-forwarder-only.drawio.svg" alt="Logging Forwarder Only Architecture" width="400" /></td>
    <td><img src="../resources/monitoring/pikube-logging-forwarder-aggregator.drawio.svg" alt="Logging Forwarder-Aggregator Architecture" width="400" /></td>
  </tr>
</table> -->

### Forwarder-Only Architecture

In this approach, a logging agent (either Fluentbit or Fluentd) is deployed directly at the data source locations, such as Kubernetes nodes, virtual machines, or bare metal servers. These agents are responsible for collecting, parsing, and filtering logs at the edge and directly forwarding them to a designated backend service.

**Advantages:**

Eliminates the need for an aggregator, with each agent managing [**`backpressure`**](https://docs.fluentbit.io/manual/administration/backpressure).

**Disadvantages:**

Configuring or updating the setup across multiple agents can be challenging.
Introducing additional destinations for the log data requires significant changes.

### Forwarder-Aggregator Architecture

This model also deploys lightweight logging agents at the data sources for initial log processing. However, it distinguishes itself by forwarding the processed data to a more capable Fluentd or Fluent Bit instance (the aggregator) for additional processing and filtering before being sent to the final backends.

**Advantages:**

- Reduces resource consumption at the data source level, optimizing throughput.
- Allows the processing capabilities to be scaled and managed more effectively at the aggregator level.
- Simplifies the addition of new backends by centralizing configuration changes to the aggregator, rather than each forwarder.

**Disadvantages:**

- Requires dedicated resources to maintain the aggregator instance.

With the forwarder-aggregator architecture, the aggregator layer offers flexibility in log processing, enabling the distribution of logs to various backends like Elasticsearch and Loki. This architecture also supports the addition of other backends, such as Kafka, to facilitate data streaming analytics (incorporating technologies like Apache Spark, Flink, etc.) and specific application log routing.

>📢 Note
>
> *The forwarder-aggregator architecture will be implemented in the cluster. For a detailed exploration of common architectural patterns with Fluentbit and Fluentd, refer to [**`Common Architecture Patterns with Fluentd and Fluent Bit`**](https://fluentbit.io/blog/2020/12/03/common-architecture-patterns-with-fluentd-and-fluent-bit/).*

## Installation Guide for Logging Solutions

This guide outlines the steps for setting up a comprehensive logging solution, detailing the installation process across different components:

- [**`Log Aggregation with Grafana Loki`**](../9-monitoring/4-log-aggregation-loki.md)
- [**`Log Analytics with Elasticsearch and Kibana`**](../9-monitoring/5-log-analytics-elasticsearch-kibana.md)
- [**`Log Collection and Distribution (Fluentbit/Fluentd)`**](../9-monitoring/6-log-collection-and-distribution-fluentbit-fluentd.md)