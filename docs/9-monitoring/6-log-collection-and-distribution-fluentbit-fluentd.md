---
title: Log Collection and Distribution (Fluentbit/Fluentd)
permalink: /docs/9-monitoring/6-log-collection-and-distribution-fluentbit-fluentd
description: Instructions for deploying log collection, aggregation, and distribution within the PiKube Kubernetes cluster. Utilize a forwarder/aggregator setup with Fluentbit and Fluentd. Logs are directed to Elasticsearch and Loki, enabling log analysis through Kibana and Grafana.
last_modified_at: "11-12-2024"
---

<div style="display: flex; justify-content: center; align-items: center;">
    <div style="flex: 0 0 auto; margin-right: 60px;">
        <img src="/resources/monitoring/fluentbit.svg" alt="Fluentbit" width="400" />
    </div>
    <div style="flex: 0 0 auto;">
        <img src="/resources/monitoring/fluentd.svg" alt="Fluentd" width="350" />
    </div>
</div>

- [Fluentd Aggregator Installation](#fluentd-aggregator-installation)
  - [Customized Fluentd Image](#customized-fluentd-image)
  - [Deploying Fluentd in K3S](#deploying-fluentd-in-k3s)
- [Fluentd Helm Chart Configuration Details](#fluentd-helm-chart-configuration-details)
  - [Deployment Configuration](#deployment-configuration)
  - [Environment Variables for Fluentd Container](#environment-variables-for-fluentd-container)
  - [Volume Mounts and Additional Volumes](#volume-mounts-and-additional-volumes)
  - [Service and Additional Configurations](#service-and-additional-configurations)
  - [Fluentd Configuration Files](#fluentd-configuration-files)
  - [Fluentd Configuration Files in ConfigMaps](#fluentd-configuration-files-in-configmaps)
    - [Sources Configuration (`01_sources.conf`)](#sources-configuration-01_sourcesconf)
    - [Filters Configuration (`02_filters.conf`)](#filters-configuration-02_filtersconf)
    - [Dispatch Configuration (`03_dispatch.conf`)](#dispatch-configuration-03_dispatchconf)
    - [Outputs Configuration (`04_outputs.conf`)](#outputs-configuration-04_outputsconf)
  - [Elasticsearch Specific Configuration](#elasticsearch-specific-configuration)
- [Fluentbit Forwarder Installation](#fluentbit-forwarder-installation)
  - [FluentBit Forwarder-Only Architecture](#fluentbit-forwarder-only-architecture)
- [Logs from External Nodes](#logs-from-external-nodes)
  - [Automated Installation with Ansible](#automated-installation-with-ansible)
  - [Manual FluentBit Configuration for External Nodes](#manual-fluentbit-configuration-for-external-nodes)

In this documentation, we will implement a Forwarder/Aggregator logging architecture within the Kubernetes cluster using Fluentbit and Fluentd.

Both Fluentbit and Fluentd are capable of functioning as forwarders and/or aggregators.

For a comprehensive comparison between Fluentbit and Fluentd, refer to the [**`Fluentbit documentation: "Fluentd & Fluent Bit"`**](https://docs.fluentbit.io/manual/about/fluentd-and-fluent-bit).

**Key Differences**:

- **Memory Footprint**: Fluentbit is a lightweight alternative to Fluentd, utilizing only approximately 640 KB of memory.
- **Plugin Availability**: Fluentd supports a larger variety of plugins (including input, output, and filter connectors), which must be installed as gem libraries. In contrast, Fluentbit's plugins are readily available without the need for additional installations.

In this deployment, `Fluentbit` will be deployed as the forwarder since its existing plugins suffice for collecting and parsing Kubernetes and host logs. `Fluentd` will be used as the aggregator to take advantage of its broader range of available plugins.

## Fluentd Aggregator Installation

Fluentd will be deployed as a log aggregator, gathering all logs forwarded by Fluentbit agents and utilizing Elasticsearch (ES) as the backend for log routing.

Instead of deploying Fluentd as a DaemonSet, it will be set up as a Kubernetes Deployment. This allows for multiple pod replicas within the service, ensuring accessibility by Fluentbit pods.

### Customized Fluentd Image

The [**`official Fluentd images`**](https://github.com/fluent/fluentd-docker-image) do not include essential plugins such as Elasticsearch, Prometheus monitoring, etc., which are required for our setup.

Alternatively, [**`Fluentd images designed for Kubernetes`**](https://github.com/fluent/fluentd-kubernetes-daemonset) are available. However, these are tailored for parsing Kubernetes logs and deploying Fluentd as a forwarder rather than an aggregator. Additionally, each image corresponds to a specific output plugin (e.g., one for `Elasticsearch`, another for `Kafka`).

Given the potential future requirement to configure the aggregator to dispatch logs to other sources (like `Kafka` for building an analytics data pipeline), I have decided to create a customized Fluentd image. This image includes only the necessary plugins and contains default configurations for deploying Fluentd as an aggregator.

::: warning
The [**`fluentd-kubernetes-daemonset images`**](https://github.com/fluent/fluentd-kubernetes-daemonset) can be utilized to deploy Fluentd as a Deployment. To output to Elasticsearch, simply choose the appropriate [**`image tag`**](https://hub.docker.com/r/fluent/fluentd-kubernetes-daemonset/tags).

Alternatively, you can build your own custom Docker image or use my version available in the `AElqazouiInsights/fluentd-aggregator GitHub repository`.

A multi-architecture (amd64/arm64) image is available on Docker Hub:

- `AElqazouiInsights/fluentd-aggregator:v1.17.1-debian-1.0`
:::

To customize the [**`official Fluentd Docker image`**](https://github.com/fluent/fluentd-docker-image), follow the project's guide: [**`"Customizing the image to install additional plugins"`**](https://github.com/fluent/fluentd-docker-image#3-customize-dockerfile-to-install-plugins-optional).

**Required Plugins**:

- `fluent-plugin-elasticsearch`: Utilizes Elasticsearch as the backend for routing logs. This plugin supports the creation of index templates and ILM policies associated with them when creating new indices in ES.
- `fluent-plugin-prometheus`: Enables Prometheus-based monitoring.
- `fluent-plugin-record-modifier`: Provides a faster and more lightweight `record_modifier` filter compared to the embedded `transform_record` filter.
- `fluent-plugin-grafana-loki`: Facilitates routing logs to Loki.

Additionally, the default Fluentd configuration can be incorporated into the customized Docker image, configuring Fluentd as a log aggregator. This setup will collect logs from forwarders (Fluentbit/Fluentd) and route all logs to Elasticsearch.

This Fluentd configuration within the Docker image can be overridden during container deployment in Kubernetes by using a [**`ConfigMap`**](https://kubernetes.io/es/docs/concepts/configuration/configmap/) mounted as a volume or by using a [**`bind mount`**](https://docs.docker.com/storage/bind-mounts) when running with docker run. In both cases, the target volume should correspond to where Fluentd expects its configuration files (`/fluentd/etc` in the official images).

::: important

When configuring the `fluent-plugin-elasticsearch`, it is necessary to specify a particular sniffer class to handle reconnection logic to Elasticsearch (`sniffer_class_name Fluent::Plugin::ElasticsearchSimpleSniffer`). Refer to the [**`fluent-plugin-elasticsearch documentation: Sniffer Class Name`**](https://github.com/uken/fluent-plugin-elasticsearch#sniffer-class-name) for more details.

The path to this sniffer class must be provided as a parameter to the `fluentd` command using the `-r` option. Failing to do so will result in an error from the Fluentd command.

Therefore, the `entrypoint.sh` script in the customized Docker image should be modified to automatically include the path to the sniffer class:

```bash
# Locate the sniffer Ruby class within the plugin
SIMPLE_SNIFFER=$( gem contents fluent-plugin-elasticsearch | grep elasticsearch_simple_sniffer.rb )

# Run the Fluentd command with the -r option to load the required Ruby class
fluentd -c ${FLUENTD_CONF} ${FLUENTD_OPT} -r ${SIMPLE_SNIFFER}
```

:::

**Example Dockerfile for the customized image**:

Below is an example of how the Dockerfile for the customized Fluentd image can be structured

```dockerfile
ARG BASE_IMAGE=fluent/fluentd:v1.17.1-debian-1.0

FROM $BASE_IMAGE

## 1. Install Fluentd Plugins

# Switch to the root user to install dependencies
USER root

RUN buildDeps="sudo make gcc g++ libc-dev" \
 && apt-get update \
 && apt-get install -y --no-install-recommends $buildDeps \
 && sudo gem install fluent-plugin-elasticsearch -v '~> 5.4.3' \
 && sudo gem install fluent-plugin-prometheus -v '~> 2.2' \
 && sudo gem install fluent-plugin-record-modifier -v '~> 2.2' \
 && sudo gem install fluent-plugin-grafana-loki -v '~> 1.2' \
 && sudo gem sources --clear-all \
 && SUDO_FORCE_REMOVE=yes \
    apt-get purge -y --auto-remove \
                  -o APT::AutoRemove::RecommendsImportant=false \
                  $buildDeps \
 && rm -rf /var/lib/apt/lists/* \
 && rm -rf /tmp/* /var/tmp/* /usr/lib/ruby/gems/*/cache/*.ge

## 2. (Optional) Add Custom Fluentd Configuration Files for Aggregation

COPY ./conf/fluent.conf /fluentd/etc/
COPY ./conf/forwarder.conf /fluentd/etc/
COPY ./conf/prometheus.conf /fluentd/etc/

## 3. Update Entrypoint to Configure the Sniffer Class
COPY entrypoint.sh /fluentd/entrypoint.sh

# Set environment variables
ENV FLUENTD_OPT=""

## 4. Switch to the Fluent User to Run Fluentd
# Running as the fluent user avoids needing privileges to access /var/log directories
USER fluent
ENTRYPOINT ["tini",  "--", "/fluentd/entrypoint.sh"]
CMD ["fluentd"]
```

**Breakdown of the Dockerfile**:

- **Base Image**: Starts with the official Fluentd Docker image.
- **Install Plugins**:
  - Switches to the root user to install necessary build dependencies.
  - Installs the required Fluentd plugins using gem install.
  - Cleans up to reduce the image size by removing build dependencies and cached files.
- **Add Configuration Files**:
  - Copies custom Fluentd configuration files into the appropriate directory within the container.
- **Configure Entrypoint**:
  - Replaces the default entrypoint.sh with a customized version that includes the sniffer class configuration.
- **User Permissions**:
  - Switches back to the `fluent` user to run Fluentd, enhancing security by avoiding the need for root privileges.

### Deploying Fluentd in K3S

Fluentd will **NOT** be deployed as a privileged DaemonSet since it doesn't require access to Kubernetes logs or APIs. Instead, it will be deployed using the following Kubernetes resources:

- **Cert-Manager's Certificate Resource**: Allows Cert-Manager to automatically generate a Kubernetes TLS Secret containing Fluentd's TLS certificate, enabling secure communication between forwarders and the aggregator.
- **Kubernetes Secret Resource**: Stores a shared secret used to authenticate forwarders when they connect to Fluentd.
- **Kubernetes Deployment Resource**: Deploys Fluentd as a stateless Pod. The number of replicas can be adjusted to ensure high availability (HA) for the service.
- **Kubernetes Service Resource**: Utilizes the ClusterIP type to expose Fluentd endpoints to other Pods and processes, such as Fluentbit forwarders and Prometheus.
- **Kubernetes ConfigMap Resources**: Contains Fluentd configuration files and Elasticsearch (ES) index template definitions.

::: warning

The [**`official Fluentd Helm chart`**](https://github.com/fluent/helm-charts/tree/main/charts/fluentd) also supports deploying Fluentd as a Deployment or StatefulSet instead of a DaemonSet. When deploying as a Deployment, Kubernetes [**`Horizontal Pod Autoscaler (HPA)`**](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/) is supported.

For HA, Fluentd aggregators should be deployed using a Kubernetes Deployment with multiple replicas. Additionally, [**`Kubernetes HPA`**](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/) should be configured to automatically scale the number of replicas based on load.

All the aforementioned Kubernetes resources, except for the TLS certificate and shared secret, are automatically created by the Helm chart. Utilizing the Helm chart simplifies both installation and maintenance processes.

:::

**Installation Procedure**:

To enable TLS in Fluentd, specify the paths to the TLS certificate and private key files. The TLS Secret containing these files will be mounted in the Fluentd Pod at a designated location (`/etc/fluent/certs`), allowing Fluentd to utilize them.

Utilize Cert-Manager's `ClusterIssuer` named `letsencrypt-issuer`, which was created during the [**`Cert-Manager installation`**](../6-certificate-management/1-tls-certificates-cert-manager.md) using `Cloudflare` for DNS challenges, to automatically generate Fluentd's TLS Secret.

- Create the Certificate Resource, `fluents-certificate.yaml`

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: fluentd-tls
  namespace: logging
spec:
  secretName: fluentd-tls
  duration: 2160h # 90 days
  renewBefore: 360h # 15 days
  commonName: fluentd.picluster.quantfinancehub.com
  isCA: false
  privateKey:
    algorithm: ECDSA
    size: 256
  usages:
    - server auth
    - client auth
  dnsNames:
    - fluentd.picluster.quantfinancehub.com
  issuerRef:
    name: letsencrypt-issuer
    kind: ClusterIssuer
    group: cert-manager.io
```

Cert-Manager will automatically generate a Secret similar to the following

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: fluentd-tls
  namespace: logging
type: kubernetes.io/tls
data:
  ca.crt: <base64-encoded CA certificate>
  tls.crt: <base64-encoded TLS certificate>
  tls.key: <base64-encoded private key>
```

- Generate a base64-encoded shared key for forwarder protocol

```bash
echo -n 'supersecret' | base64
```

- Create the `fluentd-shared-key.yaml` Secret

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: fluentd-shared-key
  namespace: logging
type: Opaque
data:
  fluentd-shared-key: <base64-encoded password>
```

- Create a ConfigMap with Elasticsearch Index Templates, `fluentd-configmap-elasticsearch-index-templates.yaml`. This ConfigMap contains dynamic index templates that Fluentd's Elasticsearch plugin will utilize

```yaml
# Elasticsearch Index Template for Fluentd Logs
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluentd-template
  namespace: logging
data:
  fluentd-es-template.json: |-
    {
      "index_patterns": ["fluentd-<<TAG>>-*"],
      "template": {
        "settings": {
          "index": {
            "lifecycle": {
              "name": "fluentd-policy",
              "rollover_alias": "fluentd-<<TAG>>"
            },
            "number_of_shards": "<<shard>>",
            "number_of_replicas": "<<replica>>"
          }
        },
        "mappings": {
          "dynamic_templates": [
            {
              "message_field": {
                "path_match": "message",
                "match_mapping_type": "string",
                "mapping": {
                  "type": "text",
                  "norms": false
                }
              }
            },
            {
              "string_fields": {
                "match": "*",
                "match_mapping_type": "string",
                "mapping": {
                  "type": "text",
                  "norms": false,
                  "fields": {
                    "keyword": { "type": "keyword", "ignore_above": 256 }
                  }
                }
              }
            }
          ],
          "properties": {
            "@timestamp": { "type": "date" }
          }
        }
      }
    }
```

- Deploy Certificate, Secret and ConfigMap manifests

```bash
kubectl apply -f fluents-certificate.yaml -f fluentd-shared-key.yaml -f fluentd-configmap-elasticsearch-index-templates.yaml
```

- Add the Fluent Helm Repository

```bash
helm repo add fluent https://fluent.github.io/helm-charts
```

- Update the Helm Repository

```bash
helm repo update
```

- Create a Fluentd custom configuration, `fluentd-values.yaml` for Helm chart configuration

```yaml
---
# Fluentd Image Configuration
image:
  repository: "aelqazouiInsights/fluentd-aggregator" # Will be changed to "aelqazouiInsights/fluentd-aggregator"
  pullPolicy: "IfNotPresent"
  tag: "v1.17.1-debian-1.0"

# Deployment Settings
kind: "Deployment"
replicaCount: 1
autoscaling:
  enabled: true
  minReplicas: 1
  maxReplicas: 100
  targetCPUUtilizationPercentage: 80

# Disable ServiceAccount and RBAC as Fluentd doesn't require Kubernetes API access
serviceAccount:
  create: false
rbac:
  create: false

# Security Context Configuration
securityContext:
  capabilities:
    drop:
      - ALL
  readOnlyRootFilesystem: false
  runAsNonRoot: true
  runAsUser: 1000

# Environment Variables for Fluentd Pods
env:
  - name: FLUENT_ELASTICSEARCH_HOST
    value: efk-es-http
  - name: FLUENT_ELASTICSEARCH_PORT
    value: "9200"
  - name: FLUENT_ELASTICSEARCH_USER
    valueFrom:
      secretKeyRef:
        name: "es-fluentd-user-file-realm"
        key: username
  - name: FLUENT_ELASTICSEARCH_PASSWORD
    valueFrom:
      secretKeyRef:
        name: "es-fluentd-user-file-realm"
        key: password
  - name: FLUENTD_FORWARD_SEC_SHARED_KEY
    valueFrom:
      secretKeyRef:
        name: fluentd-shared-key
        key: fluentd-shared-key
  - name: LOKI_URL
    value: "http://loki-gateway"
  - name: LOKI_USERNAME
    value: ""
  - name: LOKI_PASSWORD
    value: ""

# Volume and VolumeMount Configurations
volumes:
  - name: fluentd-tls
    secret:
      secretName: fluentd-tls
  - name: etcfluentd-template
    configMap:
      name: fluentd-template
      defaultMode: 0777

volumeMounts:
  - name: etcfluentd-template
    mountPath: /etc/fluent/template
  - mountPath: /etc/fluent/certs
    name: fluentd-tls
    readOnly: true

# Service Configuration
service:
  type: "ClusterIP"
  annotations: {}
  ports:
    - name: forwarder
      protocol: TCP
      containerPort: 24224

# List of Fluentd Plugins to Install
plugins: []
# Example: - fluent-plugin-out-http

# Disable Creation of Additional ConfigMaps
configMapConfigs: []

# Fluentd Configuration Files
fileConfigs:
  01_sources.conf: |-
    ## Logs from Fluentbit Forwarders
    <source>
      @type forward
      @label @FORWARD
      bind "#{ENV['FLUENTD_FORWARD_BIND'] || '0.0.0.0'}"
      port "#{ENV['FLUENTD_FORWARD_PORT'] || '24224'}"
      # Enable TLS
      <transport tls>
          cert_path /etc/fluent/certs/tls.crt
          private_key_path /etc/fluent/certs/tls.key
      </transport>
      # Enable Access Security
      <security>
        self_hostname "#{ENV['FLUENTD_FORWARD_SEC_SELFHOSTNAME'] || 'fluentd-aggregator'}"
        shared_key "#{ENV['FLUENTD_FORWARD_SEC_SHARED_KEY'] || 'sharedkey'}"
      </security>
    </source>
    ## Enable Prometheus Endpoint
    <source>
      @type prometheus
      @id in_prometheus
      bind "0.0.0.0"
      port 24231
      metrics_path "/metrics"
    </source>
    <source>
      @type prometheus_monitor
      @id in_prometheus_monitor
    </source>
    <source>
      @type prometheus_output_monitor
      @id in_prometheus_output_monitor
    </source>
  02_filters.conf: |-
    <label @FORWARD>
      # Re-route Fluentd Logs and Discard Them
      <match kube.var.log.containers.fluentd**>
        @type relabel
        @label @FLUENT_LOG
      </match>
      ## Extract Kubernetes Fields
      <filter kube.**>
        @type record_modifier
        remove_keys kubernetes, __dummy__, __dummy2__
        <record>
          __dummy__   ${ p = record["kubernetes"]["labels"]["app"]; p.nil? ? p : record['app'] = p; }
          __dummy2__   ${ p = record["kubernetes"]["labels"]["app.kubernetes.io/name"]; p.nil? ? p : record['app'] = p; }
          namespace ${ record.dig("kubernetes","namespace_name") }
          pod ${ record.dig("kubernetes", "pod_name") }
          container ${ record.dig("kubernetes", "container_name") }
          host ${ record.dig("kubernetes", "host")}
        </record>
      </filter>
      <match **>
        @type relabel
        @label @DISPATCH
      </match>
    </label>
  03_dispatch.conf: |-
    <label @DISPATCH>
      # Calculate Prometheus Metrics
      <filter **>
        @type prometheus
        <metric>
          name fluentd_input_status_num_records_total
          type counter
          desc The total number of incoming records
          <labels>
            tag ${tag}
            hostname ${host}
          </labels>
        </metric>
      </filter>
      # Duplicate Log Stream to Multiple Outputs
      <match **>
        @type copy
        <store>
          @type relabel
          @label @OUTPUT_ES
        </store>
        <store>
          @type relabel
          @label @OUTPUT_LOKI
        </store>  
      </match>
    </label>
  04_outputs.conf: |-
    <label @OUTPUT_ES>
      # Configure Index Name Based on Namespace and Container
      <filter kube.**>
        @type record_transformer
        enable_ruby
        <record>
          index_app_name ${record['namespace'] + '.' + record['container']}
        </record>
      </filter>
      <filter host.**>
        @type record_transformer
        enable_ruby
        <record>
          index_app_name "host"
        </record>
      </filter>
      # Send Logs to Elasticsearch
      <match **>
        @type elasticsearch
        @id out_es
        @log_level info
        include_tag_key true
        host "#{ENV['FLUENT_ELASTICSEARCH_HOST']}"
        port "#{ENV['FLUENT_ELASTICSEARCH_PORT']}"
        scheme http
        user "#{ENV['FLUENT_ELASTICSEARCH_USER'] || use_default}"
        password "#{ENV['FLUENT_ELASTICSEARCH_PASSWORD'] || use_default}"

        # Reconnection and Reload Settings
        reconnect_on_error true
        reload_on_failure true
        reload_connections false

        # HTTP Request Timeout
        request_timeout 15s
        
        # Log Elasticsearch HTTP API Errors
        log_es_400_reason true

        # Prevent Errors in Elasticsearch 7.x
        suppress_type_name true

        # Specify Sniffer Class
        sniffer_class_name Fluent::Plugin::ElasticsearchSimpleSniffer
      
        # Disable Logstash Format
        logstash_format false

        # Define Index Name
        index_name fluentd-${index_app_name}

        # Specify Time Key
        time_key time

        # Include @timestamp Field
        include_timestamp true

        # ILM Settings with Rollover Support
        # https://github.com/uken/fluent-plugin-elasticsearch/blob/master/README.Troubleshooting.md#enable-index-lifecycle-management
        index_date_pattern ""
        enable_ilm true
        ilm_policy_id fluentd-policy
        ilm_policy {"policy":{"phases":{"hot":{"min_age":"0ms","actions":{"rollover":{"max_size":"10gb","max_age":"7d"}}},"warm":{"min_age":"2d","actions":{"shrink":{"number_of_shards":1},"forcemerge":{"max_num_segments":1}}},"delete":{"min_age":"7d","actions":{"delete":{"delete_searchable_snapshot":true}}}}}}
        ilm_policy_overwrite true
        
        # Index Template Configuration
        use_legacy_template false
        template_overwrite true
        template_name fluentd-${index_app_name}
        template_file "/etc/fluent/template/fluentd-es-template.json"
        customize_template {"<<shard>>": "1","<<replica>>": "0", "<<TAG>>":"${index_app_name}"}
        
        remove_keys index_app_name

        <buffer tag, index_app_name>
          flush_thread_count "#{ENV['FLUENT_ELASTICSEARCH_BUFFER_FLUSH_THREAD_COUNT'] || '8'}"
          flush_interval "#{ENV['FLUENT_ELASTICSEARCH_BUFFER_FLUSH_INTERVAL'] || '5s'}"
          chunk_limit_size "#{ENV['FLUENT_ELASTICSEARCH_BUFFER_CHUNK_LIMIT_SIZE'] || '2M'}"
          queue_limit_length "#{ENV['FLUENT_ELASTICSEARCH_BUFFER_QUEUE_LIMIT_LENGTH'] || '32'}"
          retry_max_interval "#{ENV['FLUENT_ELASTICSEARCH_BUFFER_RETRY_MAX_INTERVAL'] || '30'}"
          retry_forever true
        </buffer>
      </match>
    </label>
    <label @OUTPUT_LOKI>
      # Rename `log_processed` to `message`
      <filter kube.**>
        @type record_modifier
        remove_keys __dummy__, log_processed
        <record>
          __dummy__ ${if record.has_key?('log_processed'); record['message'] = record['log_processed']; end; nil}
        </record>
      </filter>
      # Send Logs to Loki
      <match **>
        @type loki
        @id out_loki
        @log_level info
        url "#{ENV['LOKI_URL']}"
        username "#{ENV['LOKI_USERNAME'] || use_default}"
        password "#{ENV['LOKI_PASSWORD'] || use_default}"
        extra_labels {"job": "fluentd"}
        line_format json
        <label>
           app
           container
           pod
           namespace
           host
           filename
        </label>
        <buffer>
          flush_thread_count 8
          flush_interval 5s
          chunk_limit_size 2M
          queue_limit_length 32
          retry_max_interval 30
          retry_forever true
        </buffer>
      </match>
    </label>
```

- Install the Helm Chart

```bash
helm install fluentd fluent/fluentd -f fluentd-values.yaml --namespace logging
```

- Create, `fluents-forward-endpoint-service.yaml`, a service resource to expose Fluentd Forward Endpoint externally (LoadBalancer service type)

::: warning

The Helm chart creates a Service resource of type ClusterIP that exposes both forwarder and metrics ports. To make only the forward port accessible externally, an additional Service resource should be created.

:::

```yaml
apiVersion: v1
kind: Service
metadata:
  labels:
    app: fluentd
  name: fluentd-ext
  namespace: logging
spec:
  ports:
    - name: forward-ext
      port: 24224
      protocol: TCP
      targetPort: 24224
  selector:
    app.kubernetes.io/instance: fluentd
    app.kubernetes.io/name: fluentd
  sessionAffinity: None
  type: LoadBalancer
  loadBalancerIP: 10.0.0.101
```

- Install the manifest

```bash
kubectl apply -f fluents-forward-endpoint-service.yaml
```

The Fluentd forward service will be accessible on port `24224` with the IP `10.0.0.101` (an IP from the MetalLB address pool). This IP address should be mapped to a DNS record, `fluentd.picluster.quantfinance.com`, within the gateway DNSMasq configuration.

- Verify Fluentd deployment status

```bash
kubectl get all -l app.kubernetes.io/name=fluentd -n logging
```

## Fluentd Helm Chart Configuration Details

Fluentd is deployed as a Deployment, with environment variables passed to the pod and various ConfigMaps mounted as volumes. These ConfigMaps include Fluentd configuration files and TLS secrets required for secure communication with Fluent Bit forwarders.

### Deployment Configuration

**Fluentd Image Configuration**:

```yaml
image:
  repository: "aelqazouiInsights/fluentd-aggregator"
  pullPolicy: "IfNotPresent"
  tag: "v1.17.1-debian-1.0"
```

**Deployment Settings**:

```yaml
kind: "Deployment"

# Number of Fluentd replicas
replicaCount: 1

# Horizontal Pod Autoscaling (HPA) Configuration
autoscaling:
  enabled: true
  minReplicas: 1
  maxReplicas: 100
  targetCPUUtilizationPercentage: 80

# Service Account and RBAC Configuration
serviceAccount:
  create: false
rbac:
  create: false

# Security Context Configuration
securityContext:
  capabilities:
    drop:
      - ALL
  readOnlyRootFilesystem: false
  runAsNonRoot: true
  runAsUser: 1000
```

**Key Points**:

- **Deployment Type**: Fluentd is deployed as a `Deployment` with a single replica (replicaCount: 1).
- **Image Details**: Uses a custom Fluentd image (`aelqazouiInsights/fluentd-aggregator`) with tag `v1.17.1-debian-1.0`.
- **Autoscaling**: Enabled Horizontal Pod Autoscaling (HPA) to scale between 1 and 100 replicas based on CPU utilization.
- **Service Account & RBAC**: Disabled creation of service accounts and RBAC roles since Fluentd does not require access to the Kubernetes API.
- **Security Context**: Runs Fluentd as a non-root user (`runAsUser: 1000`) with all capabilities dropped for enhanced security.

### Environment Variables for Fluentd Container

**Environment Variable Configuration**:

```yaml
env:
  # Elasticsearch Configuration
  - name: FLUENT_ELASTICSEARCH_HOST
    value: efk-es-http
  - name: FLUENT_ELASTICSEARCH_PORT
    value: "9200"
  - name: FLUENT_ELASTICSEARCH_USER
    value: "elastic"
  - name: FLUENT_ELASTICSEARCH_PASSWORD
    valueFrom:
      secretKeyRef:
        name: "efk-es-elastic-user"
        key: elastic

  # Fluentd Forward Security
  - name: FLUENTD_FORWARD_SEC_SHARED_KEY
    valueFrom:
      secretKeyRef:
        name: fluentd-shared-key
        key: fluentd-shared-key

  # Loki Configuration
  - name: LOKI_URL
    value: "http://loki-gateway"
  - name: LOKI_USERNAME
    value: ""
  - name: LOKI_PASSWORD
    value: ""
```

**Configuration Highlights**:

- **Elasticsearch Setting**s:

  - **Host & Port**: Specifies the Elasticsearch service (`efk-es-http`) and port (`9200`).
  - **Credentials**: Uses the `elastic` user with the password retrieved from the `efk-es-elastic-user` secret.

- **Fluentd Forward Security**:

  - **Shared Key**: Retrieves the shared key from the `fluentd-shared-key` secret for secure communication with Fluent Bit forwarders.

- **Loki Settings**:

  - **URL**: Points to the Loki gateway service (`http://loki-gateway`).
  - **Authentication**: Username and password are left empty, as authentication is not configured by default.

**Additional Notes**:

- **Main Configuration File** (`FLUENTD_CONF`):

  - **Path**: `/etc/fluent/fluent.conf`
  - **Usage**: The `FLUENTD_CONF` environment variable directs the Docker image to load the main configuration from `/fluentd/conf/${FLUENTD_CONF}`. Ensure that a relative path from `/fluentd/conf/` is provided to match the Docker image's environment variable definition.

### Volume Mounts and Additional Volumes

**Volume Configuration**:

```yaml
# Disable mounting of log directories
mountVarLogDirectory: false
mountDockerContainersDirectory: false

# Additional Volumes for ES Templates and TLS Certificates
volumes:
  - name: etcfluentd-template
    configMap:
      name: fluentd-template
      defaultMode: 0777
  - name: fluentd-tls
    secret:
      secretName: fluentd-tls

# Volume Mounts Configuration
volumeMounts:
  - name: etcfluentd-template
    mountPath: /etc/fluent/template
  - name: fluentd-tls
    mountPath: /etc/fluent/certs
    readOnly: true
```

**Configuration Details**:

- **Log Directories**:

- **Disabled**: By setting `mountVarLogDirectory` and `mountDockerContainersDirectory` to `false`, Fluentd does not mount the default log directories, as it is not directly reading container logs.

- **Additional Volumes**:

  - **ES Templates**:

    - **ConfigMap**: `fluentd-template` is mounted at `/etc/fluent/template`.
    - **Permissions**: Set to `0777` to ensure Fluentd can read the templates.

  - **TLS Certificates**:

    - **Secret**: `fluentd-tls` containing the TLS certificate and key is mounted at `/etc/fluent/certs` as read-only.

**ConfigMap Mounts**:

- **Fluentd Main Configuration** (`fluentd-main`):

  - **Mount Path**: `/etc/fluent.conf`
  - **Content**: Contains the main Fluentd configuration file (`fluent.conf`).

- **Fluentd Configuration Directory** (`fluentd-config`):

  - **Mount Path**: `/etc/fluent/config.d/`
  - **Content**: Includes all configuration files referenced by the main `fluent.conf`.

- **ES Templates** (`fluentd-template`):

  - **Mount Path**: `/etc/fluent/template`
  - **Purpose**: Stores Elasticsearch index templates used by the Fluentd Elasticsearch plugin.

- **TLS Certificates** (`fluentd-tls`):

  - **Mount Path**: `/etc/fluent/certs`
  - **Content**: Contains TLS certificates and keys for secure communication with Fluent Bit forwarders.

### Service and Additional Configurations

**Service Configuration**:

```yaml
service:
  type: "ClusterIP"
  annotations: {}
  ports:
    - name: forwarder
      protocol: TCP
      containerPort: 24224
```

**Key Points**:

- **Service Type**: Configured as `ClusterIP` to expose the Fluentd forwarder port within the cluster.
- **Ports**:
  - **Forwarder Port**: Exposes port `24224` for receiving logs from Fluent Bit forwarders.
  - **Prometheus Metrics**: The Helm chart also exposes the Prometheus metrics endpoint on port `24231` by default.

**Plugin and ConfigMap Configurations**:

```yaml
plugins: []
configMapConfigs: []
```

- **Plugins**: List of Fluentd plugins to install. Can be configured to include additional plugins as needed.
- **ConfigMap Configs**: Allows loading additional Fluentd configuration directories. Setting to `null` avoids loading default ConfigMaps created by the Helm chart, which may contain systemd input plugin configurations and default Prometheus settings.

**Important Note**:

- **Avoid Unwanted Configurations**: To prevent Fluentd from loading default configurations that may interfere with your setup, set `configMapConfigs` to `null`.

### Fluentd Configuration Files

**Main Configuration File** (`fluent.conf`):

Mounted from the `fluentd-main` ConfigMap at `/etc/fluent.conf`.

```ini
# Disregard Fluentd's own logs to prevent infinite loops.
<label @FLUENT_LOG>
  <match **>
    @type null
    @id ignore_fluent_logs
  </match>
</label>

@include config.d/*.conf
```

**Configuration Highlights**:

- **Self-Log Discarding**:

  - Routes Fluentd's internal logs labeled as `@FLUENT_LOG` to a null output, effectively ignoring them.

- **Include Directory**:

  - Includes all configuration files from the `/etc/fluent/config.d`/ directory, allowing for modular and organized configuration management.

**Note**:

- **No Need to Modify** `fluent.conf`: The default content created by the Helm chart is sufficient and does not require changes.

### Fluentd Configuration Files in ConfigMaps

**Configuration Directory** (`fluentd-config ConfigMap`):

Includes all configuration files located in `/etc/fluent/config.d/`

#### Sources Configuration (`01_sources.conf`)

```xml
## Logs from Fluent Bit Forwarders
<source>
  @type forward
  @label @FORWARD
  bind "#{ENV['FLUENTD_FORWARD_BIND'] || '0.0.0.0'}"
  port "#{ENV['FLUENTD_FORWARD_PORT'] || '24224'}"
  # Enable TLS
  <transport tls>
      cert_path /etc/fluent/certs/tls.crt
      private_key_path /etc/fluent/certs/tls.key
  </transport>
  # Enable Access Security
  <security>
    self_hostname "#{ENV['FLUENTD_FORWARD_SEC_SELFHOSTNAME'] || 'fluentd-aggregator'}"
    shared_key "#{ENV['FLUENTD_FORWARD_SEC_SHARED_KEY'] || 'sharedkey'}"
  </security>
</source>

## Enable Prometheus Metrics Endpoint
<source>
  @type prometheus
  @id in_prometheus
  bind "0.0.0.0"
  port 24231
  metrics_path "/metrics"
</source>
<source>
  @type prometheus_monitor
  @id in_prometheus_monitor
</source>
<source>
  @type prometheus_output_monitor
  @id in_prometheus_output_monitor
</source>
```

**Functionality**:

- **Forward Input**:
  - **Purpose**: Receives logs from Fluent Bit forwarders or other Fluentd instances.
  - **Security**: Configured with TLS and a shared key for secure communication.

- **Prometheus Metrics**:
  - **Purpose**: Exposes Fluentd's metrics for monitoring via Prometheus.
  - **Endpoints**: Configured to serve metrics on `/metrics` at port `24231`.

#### Filters Configuration (`02_filters.conf`)

```xml
<label @FORWARD>
  # Redirect Fluentd's own logs
  <match kube.var.log.containers.fluentd**>
    @type relabel
    @label @FLUENT_LOG
  </match>

  ## Extract Kubernetes Metadata
  <filter kube.**>
    @type record_modifier
    remove_keys kubernetes, __dummy__, __dummy2__
    <record>
      __dummy__   ${ p = record["kubernetes"]["labels"]["app"]; p.nil? ? p : record['app'] = p; }
      __dummy2__   ${ p = record["kubernetes"]["labels"]["app.kubernetes.io/name"]; p.nil? ? p : record['app'] = p; }
      namespace ${ record.dig("kubernetes","namespace_name") }
      pod ${ record.dig("kubernetes", "pod_name") }
      container ${ record.dig("kubernetes", "container_name") }
      node_name ${ record.dig("kubernetes", "host")}
    </record>
  </filter>

  # Route Remaining Logs to Dispatch Label
  <match **>
    @type relabel
    @label @DISPATCH
  </match>
</label>
```

**Functionality**:

- **Log Routing**:
  - **Fluentd Logs**: Redirects Fluentd's own logs to the `@FLUENT_LOG` label to prevent log loops.

- **Kubernetes Metadata Extraction**:
  - **Purpose**: Extracts relevant Kubernetes metadata such as `namespace`, `pod`, `container`, and `node_name` from the logs.
  - **Transformation**: Removes the original `kubernetes` object and adds simplified fields for easier querying and indexing.

- **Dispatching**:
  - **Purpose**: Routes all processed logs to the `@DISPATCH` label for further processing and forwarding.

#### Dispatch Configuration (`03_dispatch.conf`)

```xml
<label @DISPATCH>
  # Generate Prometheus Metrics for Incoming Logs
  <filter **>
    @type prometheus
    <metric>
      name fluentd_input_status_num_records_total
      type counter
      desc The total number of incoming records
      <labels>
        tag ${tag}
        hostname ${hostname}
      </labels>
    </metric>
  </filter>

  # Forward Logs to Multiple Outputs
  <match **>
    @type copy
    <store>
      @type relabel
      @label @OUTPUT_ES
    </store>
    <store>
      @type relabel
      @label @OUTPUT_LOKI
    </store>
  </match>
</label>
```

**Functionality**:

- **Prometheus Metrics**:
  - **Purpose**: Counts the number of incoming log records, labeled by `tag` and `hostname`, and exposes them as Prometheus metrics (`fluentd_input_status_num_records_total`).

- **Log Forwarding**:
  - **Purpose**: Uses the copy plugin to duplicate the log stream and route it to both Elasticsearch (`@OUTPUT_ES`) and Loki (`@OUTPUT_LOKI`) outputs.

#### Outputs Configuration (`04_outputs.conf`)

```xml
<label @OUTPUT_ES>
  # Set Up Index Naming Based on Namespace or Container
  <filter kube.**>
    @type record_transformer
    enable_ruby
    <record>
      index_app_name ${record['namespace']}
    </record>
  </filter>
  <filter host.**>
    @type record_transformer
    enable_ruby
    <record>
      index_app_name "host"
    </record>
  </filter>

  # Elasticsearch Output Configuration
  <match **>
    @type elasticsearch
    @id out_es
    @log_level info
    include_tag_key true
    host "#{ENV['FLUENT_ELASTICSEARCH_HOST']}"
    port "#{ENV['FLUENT_ELASTICSEARCH_PORT']}"
    scheme http
    user "#{ENV['FLUENT_ELASTICSEARCH_USER'] || use_default}"
    password "#{ENV['FLUENT_ELASTICSEARCH_PASSWORD'] || use_default}"

    # Connection Settings
    reconnect_on_error true
    reload_on_failure true
    reload_connections false

    # HTTP Request Timeout
    request_timeout 15s

    # Logging and Template Settings
    log_es_400_reason true
    suppress_type_name true
    sniffer_class_name Fluent::Plugin::ElasticsearchSimpleSniffer
    logstash_format false

    # Index Naming and Lifecycle Management (ILM)
    index_name fluentd-${index_app_name}
    time_key time
    include_timestamp true
    enable_ilm true
    ilm_policy_id fluentd-policy
    ilm_policy {
      "policy": {
        "phases": {
          "hot": {
            "min_age": "0ms",
            "actions": {
              "rollover": {
                "max_size": "10gb",
                "max_age": "7d"
              }
            }
          },
          "warm": {
            "min_age": "2d",
            "actions": {
              "shrink": {
                "number_of_shards": 1
              },
              "forcemerge": {
                "max_num_segments": 1
              }
            }
          },
          "delete": {
            "min_age": "7d",
            "actions": {
              "delete": {
                "delete_searchable_snapshot": true
              }
            }
          }
        }
      }
    }
    ilm_policy_overwrite true

    # Index Template Settings
    use_legacy_template false
    template_overwrite true
    template_name fluentd-${index_app_name}
    template_file "/etc/fluent/template/fluentd-es-template.json"
    customize_template {"<<shard>>": "1","<<replica>>": "0", "<<TAG>>":"${index_app_name}"}
    remove_keys index_app_name

    # Buffer Configuration
    <buffer tag, index_app_name>
      flush_thread_count "#{ENV['FLUENT_ELASTICSEARCH_BUFFER_FLUSH_THREAD_COUNT'] || '8'}"
      flush_interval "#{ENV['FLUENT_ELASTICSEARCH_BUFFER_FLUSH_INTERVAL'] || '5s'}"
      chunk_limit_size "#{ENV['FLUENT_ELASTICSEARCH_BUFFER_CHUNK_LIMIT_SIZE'] || '2M'}"
      queue_limit_length "#{ENV['FLUENT_ELASTICSEARCH_BUFFER_QUEUE_LIMIT_LENGTH'] || '32'}"
      retry_max_interval "#{ENV['FLUENT_ELASTICSEARCH_BUFFER_RETRY_MAX_INTERVAL'] || '30'}"
      retry_forever true
    </buffer>
  </match>
</label>

<label @OUTPUT_LOKI>
  # Rename 'log_processed' to 'message'
  <filter kube.**>
    @type record_modifier
    remove_keys __dummy__, log_processed
    <record>
      __dummy__ ${if record.has_key?('log_processed'); record['message'] = record['log_processed']; end; nil}
    </record>
  </filter>

  # Loki Output Configuration
  <match **>
    @type loki
    @id out_loki_kube
    @log_level info
    url "#{ENV['LOKI_URL']}"
    username "#{ENV['LOKI_USERNAME'] || use_default}"
    password "#{ENV['LOKI_PASSWORD'] || use_default}"
    extra_labels {"job": "fluentd"}
    line_format json
    <label>
      app
      container
      pod
      namespace
      host
      filename
    </label>
    <buffer>
      flush_thread_count 8
      flush_interval 5s
      chunk_limit_size 2M
      queue_limit_length 32
      retry_max_interval 30
      retry_forever true
    </buffer>
  </match>
</label>
```

**Functionality**:

- **Elasticsearch Output** (`@OUTPUT_ES`):
  - **Index Naming**: Dynamically names indices based on the Kubernetes namespace (`fluentd-${index_app_name}`).
  - **ILM Policy**: Applies an Index Lifecycle Management (ILM) policy (`fluentd-policy`) to manage index rollover, shrinking, force merging, and deletion phases.
  - **Templates**: Utilizes dynamic index templates with shard and replica settings customized via `customize_template`.
  - **Buffering**: Configures buffering parameters to control log flushing, chunk sizes, and retry intervals.

- **Loki Output** (`@OUTPUT_LOKI`):
  - **Log Transformation**: Renames the `log_processed` field to `message` for compatibility with Loki.
  - **Configuration**: Sends logs to Loki with additional labels (`app`, `container`, `pod`, `namespace`, `host`, `filename`, and `job`).
  - **Buffering**: Sets buffering parameters similar to the Elasticsearch output for efficient log handling.

**Additional Notes**:

- **Elasticsearch Configuration**:
  - **Security**: Uses environment variables to securely pass Elasticsearch credentials.
  - **Index Lifecycle Management**: Configures ILM policies to automate index management, ensuring efficient storage and retention.

- **Loki Configuration**:
  - **Authentication**: Default settings assume no authentication is required. Modify `LOKI_USERNAME` and `LOKI_PASSWORD` if authentication is enabled.
  - **Labels**: Adds contextual labels to each log stream for better organization and querying in Loki.

### Elasticsearch Specific Configuration

The Fluentd Elasticsearch plugin is configured to manage index templates and ILM policies automatically. This setup ensures that logs are correctly indexed and that index management is handled efficiently.

**Index Templates**:

**Purpose**: Controls how Elasticsearch maps and indexes log fields.
**Configuration**: Uses dynamic index templates to create separate indices for each Kubernetes namespace (`fluentd-namespace`) with a common ILM policy.

**ILM Policy**:

```json
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": {
            "max_size": "10gb",
            "max_age": "7d"
          }
        }
      },
      "warm": {
        "min_age": "2d",
        "actions": {
          "shrink": {
            "number_of_shards": 1
          },
          "forcemerge": {
            "max_num_segments": 1
          }
        }
      },
      "delete": {
        "min_age": "7d",
        "actions": {
          "delete": {
            "delete_searchable_snapshot": true
          }
        }
      }
    }
  }
}
```

- **Phases**:

  - **Hot**: Initial phase where indices are actively written to. Rolls over when they reach 10GB or 7 days old.
  - **Warm**: Indices are optimized by shrinking shards and force merging segments after 2 days.
  - **Delete**: Indices are deleted after 7 days to manage storage and retention.

**Dynamic Index Template**:

```json
{
  "index_patterns": ["fluentd-<<TAG>>-*"],
  "template": {
    "settings": {
      "index": {
        "lifecycle": {
          "name": "fluentd-policy",
          "rollover_alias": "fluentd-<<TAG>>"
        },
        "number_of_shards": "<<shard>>",
        "number_of_replicas": "<<replica>>"
      }
    },
    "mappings": {
      "dynamic_templates": [
        {
          ...
        }
      ]
    }
  }
}
```

- **Customization**:
  - **Placeholders**: `<<TAG>>`, `<<shard>>`, and `<<replica>>` are dynamically replaced based on the `customize_template` settings.
  - **Shards & Replicas**: Configured to optimize index performance and storage.

- **Purpose**:
  - **Efficient Index Management**: Automates the creation and lifecycle of indices, ensuring logs are stored efficiently and old data is purged according to retention policies.
  - **Avoids Data Type Mismatches**: By creating separate indices per namespace, it prevents ingestion errors related to data type mismatches, especially when using `Merge_Log` in Fluent Bit's Kubernetes filter.

## Fluentbit Forwarder Installation

Fluent Bit is a lightweight and efficient log processor ideal for collecting and parsing Kubernetes logs. It can be deployed as a DaemonSet pod within your Kubernetes cluster. For comprehensive installation instructions, refer to the [**`Fluent Bit Kubernetes Documentation`**](https://docs.fluentbit.io/manual/installation/kubernetes).

To expedite the installation process, you can utilize the available [**`Fluent Bit Helm chart`**](https://github.com/fluent/helm-charts/tree/main/charts/fluent-bit). Customize the Fluent Bit configuration by providing appropriate Helm chart values.

- Add the Fluentbit helm repository

```bash
helm repo add fluent https://fluent.github.io/helm-charts
```

- Ensure you have the latest charts by updating your Helm repositories

```bash
helm repo update
```

- Customize the Fluentbit deployment by creating a `fluentbit-values.yaml` file. This file defines environment variables, configurations, and additional settings for Fluentbit

```yaml
# fluentbit-values.yaml
# Fluent Bit Helm Chart Values

env:
  - name: FLUENT_AGGREGATOR_HOST
    value: "fluentd"
  - name: FLUENT_AGGREGATOR_PORT
    value: "24224"
  - name: FLUENT_AGGREGATOR_SHARED_KEY
    valueFrom:
      secretKeyRef:
        name: fluentd-shared-key
        key: fluentd-shared-key
  - name: FLUENT_SELFHOSTNAME
    valueFrom:
      fieldRef:
        fieldPath: spec.nodeName
  - name: TZ
    value: "Europe/London"

config:
  service: |
    [SERVICE]
        Daemon Off
        Flush 1
        Log_Level info
        Parsers_File parsers.conf
        Parsers_File custom_parsers.conf
        HTTP_Server On
        HTTP_Listen 0.0.0.0
        HTTP_Port 2020
        Health_Check On
        storage.path /var/log/fluentbit/storage
        storage.sync normal
        storage.checksum off
        storage.backlog.mem_limit 5M
        storage.metrics on

  # Input Configuration
  inputs: |
    [INPUT]
        Name tail
        Alias input.kube
        Path /var/log/containers/*.log
        Path_Key filename
        multiline.parser docker, cri
        DB /var/log/fluentbit/flb_kube.db
        Tag kube.*
        Mem_Buf_Limit 5MB
        storage.type filesystem
        Skip_Long_Lines On

    [INPUT]
        Name tail
        Alias input.host
        Tag host.*
        DB /var/log/fluentbit/flb_host.db
        Path /var/log/auth.log,/var/log/syslog
        Path_Key filename
        Mem_Buf_Limit 5MB
        storage.type filesystem
        Parser iso8601   # Use the new ISO8601 parser
        Skip_Long_Lines On

  # Output Configuration
  outputs: |
    [OUTPUT]
        Name forward
        Alias output.aggregator
        Match *
        Host ${FLUENT_AGGREGATOR_HOST}
        Port ${FLUENT_AGGREGATOR_PORT}
        Self_Hostname ${FLUENT_SELFHOSTNAME}
        Shared_Key ${FLUENT_AGGREGATOR_SHARED_KEY}
        tls On
        tls.verify Off

  # Custom Parsers
  customParsers: |
    [PARSER]
        Name iso8601
        Format regex
        Regex ^(?<time>[\d-]+T[\d:\.]+[\+\-]\d{2}:\d{2})\s+(?<host>[^ ]+)\s+(?<ident>[^\:]+)\:?(?<message>.*)$
        Time_Key time
        Time_Format %Y-%m-%dT%H:%M:%S.%L%z
        Time_Keep Off

    [PARSER]
        Name syslog-rfc3164-nopri
        Format regex
        Regex /^(?<time>[^ ]* {1,2}[^ ]* [^ ]*) (?<host>[^ ]*) (?<ident>[a-zA-Z0-9_\/\.\-]*)(?:\[(?<pid>[0-9]+)\])?(?:[^\:]*\:)? *(?<message>.*)$/
        Time_Key time
        Time_Format %b %d %H:%M:%S
        Time_Keep Off

  # Filters Configuration
  filters: |
    [FILTER]
        Name multiline
        Match *
        multiline.key_content log
        multiline.parser java,python,go

    [FILTER]
        Name kubernetes
        Match kube.*
        Buffer_Size 512k
        Kube_Tag_Prefix kube.var.log.containers.
        Merge_Log On
        Merge_Log_Key log_processed
        Merge_Log_Trim Off
        Keep_Log Off
        K8S-Logging.Parser On
        K8S-Logging.Exclude On
        Annotations Off
        Labels On

    [FILTER]
        Name modify
        Match kube.*
        Remove _p
        Rename log message

    [FILTER]
        Name lua
        Match host.*
        Script /fluent-bit/scripts/adjust_ts.lua
        Call local_timestamp_to_UTC

tolerations:
  - key: node-role.kubernetes.io/control-plane
    operator: Exists
    effect: NoSchedule

initContainers:
  - name: init-fluentbit-directory
    image: busybox
    command: ['/bin/sh', '-c', 'mkdir -p /var/log/fluentbit/tail-db /var/log/fluentbit/storage']
    volumeMounts:
      - name: varlog
        mountPath: /var/log

extraContainers:
  - name: json-exporter
    image: quay.io/prometheuscommunity/json-exporter
    command: ['/bin/json_exporter']
    args: ['--config.file=/etc/json-exporter/json-exporter-config.yml']
    ports:
      - containerPort: 7979
        name: http
        protocol: TCP
    volumeMounts:
      - name: json-exporter-config
        mountPath: /etc/json-exporter/json-exporter-config.yml
        subPath: json-exporter-config.yml

extraFiles:
  json-exporter-config.yml: |
    modules:
      default:
        metrics:
          - name: fluentbit_storage_layer
            type: object
            path: '{.storage_layer}'
            help: The total number of chunks in the fs storage
            values:
              fs_chunks_up: '{.chunks.fs_chunks_up}'
              fs_chunks_down: '{.chunks.fs_chunks_down}'

extraVolumes:
  - name: fluent-bit-scripts
    configMap:
      name: fluent-bit-scripts
      defaultMode: 0755
  - name: json-exporter-config
    configMap:
      name: json-exporter-config
      items:
        - key: json-exporter-config.yml
          path: json-exporter-config.yml

extraVolumeMounts:
  - name: fluent-bit-scripts
    mountPath: /fluent-bit/scripts
    readOnly: true
  - name: json-exporter-config
    mountPath: /etc/json-exporter/json-exporter-config.yml
    subPath: json-exporter-config.yml
```

- Create `fluent-bit-json-exporter-config.yaml` ConfigMap to provide the necessary configuration for the json-exporter sidecar container

```yaml
modules:
  default:
    metrics:
      - name: fluentbit_storage_layer
        type: object
        path: '{.storage_layer}'
        help: The total number of chunks in the fs storage
        values:
          fs_chunks_up: '{.chunks.fs_chunks_up}'
          fs_chunks_down: '{.chunks.fs_chunks_down}'
```

- Create the ConfigMap

```bash
kubectl create configmap json-exporter-config -n logging --from-file=fluent-bit-json-exporter-config.yaml
```

- Created a ConfigMap, `fluent-bit-scripts-configmap.yaml`, to provide to Fluent Bit pod the lua script

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: fluent-bit-scripts
  namespace: logging
data:
  adjust_ts.lua: |
    function local_timestamp_to_UTC(tag, timestamp, record)
        local utcdate   = os.date("!*t", timestamp)
        local localdate = os.date("*t", timestamp)
        localdate.isdst = false -- Disable daylight saving time adjustment
        local_time_diff = os.difftime(os.time(localdate), os.time(utcdate))
        return 1, timestamp - local_time_diff, record
    end
```

- Deploy the ConfigMap

```bash
kubectl apply -f fluent-bit-scripts-configmap.yaml
```

- Deploy Fluent Bit using the customized

```bash
helm install fluent-bit fluent/fluent-bit -f fluentbit-values.yaml --namespace logging
```

- Check the status of Fluent Bit resources to ensure successful deployment

```bash
kubectl get all -l app.kubernetes.io/name=fluent-bit -n logging
```

**Configuration Breakdown**:

- **Environment Variables** (`env`):

  - **Fluentd Aggregator Details**:
    - `FLUENT_AGGREGATOR_HOST`: Hostname of the Fluentd aggregator service.
    - `FLUENT_AGGREGATOR_PORT`: Port for Fluentd aggregator (default 24224).
    - `FLUENT_AGGREGATOR_SHARED_KEY`: Shared key for secure communication, retrieved from the fluentd-shared-key secret.
    - `FLUENT_SELFHOSTNAME`: Automatically set to the node's name where the Fluent Bit pod is running.

  - **Time Zone (TZ)**: Set to `Europe/London` to ensure accurate timestamp parsing for logs without timezone information.

- **Fluent Bit Configuration** (`config`):
  - **Service Section** (`[SERVICE]`):
    - Configures Fluent Bit's operational settings, including enabling the HTTP server for remote monitoring and setting up filesystem-based storage for buffering.

- **Inputs Section** (`[INPUT]`):
  - **Container Logs** (`input.kube`):
    - Tails Kubernetes container logs located at `/var/log/containers/*.log`.
    - Utilizes multiline parsing for Docker and CRI log formats.
    - Tags logs with `kube.*` for Kubernetes-specific processing.

- **System Logs** (`input.host`):
- Tails OS-level logs from `/var/log/auth.log` and `/var/log/syslog`.
- Uses a custom parser `syslog-rfc3164-nopri` for parsing syslog entries without priority fields.
- Tags logs with `host.*` for system-level processing.

- **Outputs Section** (`[OUTPUT]`):
  - Forward to Fluentd Aggregator (output.aggregator):
    - Forwards all logs (`Match *`) to the Fluentd aggregator using TLS for secure transmission.
    - Utilizes environment variables to configure host, port, and shared key.

- **Custom Parsers** (`customParsers`):
  - Defines a custom parser `syslog-rfc3164-nopri` to accurately parse Ubuntu system logs lacking priority fields.

- **Filters Section** (`[FILTER]`):
  - **Multiline Filter**:
    - Combines multi-line log entries, such as stack traces from Java, Python, and Go applications.
  - **Kubernetes Filter**:
    - Enriches Kubernetes logs with metadata like `namespace`, `pod name`, `container name`, and `node name`.
    - Configured with an increased `Buffer_Size` of `512k` to handle large metadata responses.
  - **Modify Filter**:
    - Removes unnecessary fields (_p) and renames log to message for consistency.
  - **Lua Filter**:
    - Executes a Lua script to adjust timestamps from local time to UTC for system logs.

- **Additional Configurations**:
  - **Tolerations**:
    - Allows Fluent Bit pods to be scheduled on master nodes by tolerating the `control-plane` taint.
  - **Init Containers**:
    - Ensures that necessary directories for Fluent Bit's database and storage are created before the main container starts.
  **Sidecar Containers**:
    - **JSON Exporter** (`json-exporter`):
      - Translates Fluent Bit's JSON storage metrics into Prometheus-compatible metrics.
      - Configured via `json-exporter-config.yml` to expose metrics like `fs_chunks_up` and `fs_chunks_down`.
  - **Extra Files**:
    - **JSON Exporter Configuration** (`json-exporter-config.yml`):
      - Defines how JSON metrics from Fluent Bit are mapped to Prometheus metrics.

### FluentBit Forwarder-Only Architecture

For scenarios where you prefer a forwarder-only architecture without an aggregation layer, adjust the Helm chart configurations accordingly

- Remove FluentBit's configurations related to Fluentd aggregator and set up direct forwarding to Elasticsearch.

```yaml
env:
  # Elasticsearch Configuration
  - name: FLUENT_ELASTICSEARCH_HOST
    value: "efk-es-http"
  - name: FLUENT_ELASTICSEARCH_PORT
    value: "9200"
  - name: FLUENT_ELASTICSEARCH_USER
    value: "elastic"
  - name: FLUENT_ELASTICSEARCH_PASSWORD
    valueFrom:
      secretKeyRef:
        name: "efk-es-elastic-user"
        key: elastic
  # Time Zone Configuration
  - name: TZ
    value: "Europe/London"
```

- Configure Fluent Bit to send logs directly to Elasticsearch instead of the Fluentd aggregator

```yaml
config:
  outputs: |
    [OUTPUT]
        Name es
        Match *
        Host ${FLUENT_ELASTICSEARCH_HOST}
        Port ${FLUENT_ELASTICSEARCH_PORT}
        Logstash_Format True
        Logstash_Prefix logstash
        Suppress_Type_Name True
        Include_Tag_Key True
        Tag_Key tag
        HTTP_User ${FLUENT_ELASTICSEARCH_USER}
        HTTP_Passwd ${FLUENT_ELASTICSEARCH_PASSWORD}
        tls False
        tls.verify False
        Retry_Limit False
```

**Configuration Highlights**:

- **Elasticsearch Output**:
  - **Purpose**: Directly sends all matched logs (`Match *`) to Elasticsearch.
  - **TLS Settings**: Disabled (`tls False`) assuming that TLS is managed by the cluster's service mesh.
  - **Type Suppression**: `Suppress_Type_Name True` avoids errors related to deprecated type names in Elasticsearch APIs.
  - **Retry Policy**: Unlimited retries (`Retry_Limit False`) to ensure log delivery persistence.

**Important Consideration**:

- **Suppress Type Name**: Enabling `Suppress_Type_Name` (`True`) avoids compatibility issues with Elasticsearch versions 7.x and above, where type names are deprecated and can cause ingestion errors.

## Logs from External Nodes

To collect logs from nodes outside the Kubernetes cluster (e.g., `gateway` nodes), FluentBit should be installed and configured to forward logs to the Fluentd aggregator service running within the cluster. Official installation packages for Ubuntu are available, and comprehensive instructions can be found in the [**`Fluent Bit Ubuntu Installation Documentation`**](https://docs.fluentbit.io/manual/installation/linux/ubuntu).

### Automated Installation with Ansible

Log collection and configuration for external nodes have been automated using Ansible through the [**`aelqazouiInsights.fluentbit`**](https://galaxy.ansible.com/aelqazouiInsights/fluentbit) role. This Ansible role handles the installation and configuration of Fluent Bit on external nodes.

### Manual FluentBit Configuration for External Nodes

The configuration for external nodes is similar to the DaemonSet configuration but excludes Kubernetes-specific log collection and filtering, focusing solely on OS-level logs. Refer to the [**`Fluent Bit official documentation`**](https://docs.fluentbit.io/manual/installation/linux/ubuntu).

- Add the Fluent Bit GPG Key

```bash
curl https://packages.fluentbit.io/fluentbit.key | gpg --dearmor | sudo tee /usr/share/keyrings/fluentbit-keyring.gpg > /dev/null
sudo chmod a+r /usr/share/keyrings/fluentbit-keyring.gpg
```

- Add a supported Fluent Bit repository

```bash
echo "deb [signed-by=/usr/share/keyrings/fluentbit-keyring.gpg] https://packages.fluentbit.io/ubuntu/<CODENAME> <CODENAME> main" | sudo tee /etc/apt/sources.list.d/fluent-bit.list
```

Replace `<CODENAME>` your [**`Ubuntu codename`**](https://wiki.ubuntu.com/Releases) if Fluent Bit provides a repository for it.

- Refresh the local package index and install Fluent Bit

```bash
sudo apt-get update
sudo apt-get install fluent-bit
```

- Edit the main configuration file `/etc/fluent-bit/fluent-bit.conf`, to include `service` settings, `input` `sources`, `filters`, and `output` destinations

```ini
[SERVICE]
    Daemon Off
    Flush 1
    Log_Level info
    Parsers_File parsers.conf
    Parsers_File custom_parsers.conf
    HTTP_Server On
    HTTP_Listen 0.0.0.0
    HTTP_Port 2020
    Health_Check On

[INPUT]
    Name tail
    Tag host.*
    DB /run/fluentbit-state.db
    Path /var/log/auth.log,/var/log/syslog
    Parser syslog-rfc3164-nopri

[FILTER]
    Name lua
    Match host.*
    Script /etc/fluent-bit/adjust_ts.lua
    Call local_timestamp_to_UTC

[OUTPUT]
    Name forward
    Match *
    Host fluentd.picluster.quantfinancehub.com
    Port 24224
    Self_Hostname gateway
    Shared_Key supersecret # Define previously in fluentd-shared-key.yaml
    tls true
    tls.verify false
```

- Define input sources to collect logs from various locations in `/etc/fluent-bit/custom_parsers.conf`

```ini
[PARSER]
    Name syslog-rfc3164-nopri
    Format regex
    Regex /^(?<time>[^ ]* {1,2}[^ ]* [^ ]*) (?<host>[^ ]*) (?<ident>[a-zA-Z0-9_\/\.\-]*)(?:\[(?<pid>[0-9]+)\])?(?:[^\:]*\:)? *(?<message>.*)$/
    Time_Key time
    Time_Format %b %d %H:%M:%S
    Time_Keep False
```

FluentBit employs a Lua script, `adjust_ts.lua`, to convert local timestamps to UTC, ensuring consistency across log entries.

- Create the Lua script `/etc/fluent-bit/adjust_ts.lua` to convert local timestamps to UTC

```lua
function local_timestamp_to_UTC(tag, timestamp, record)
    local utcdate   = os.date("!*t", timestamp)
    local localdate = os.date("*t", timestamp)
    localdate.isdst = false -- Disable daylight saving time adjustment
    local_time_diff = os.difftime(os.time(localdate), os.time(utcdate))
    return 1, timestamp - local_time_diff, record
end
```

- Start, enable and check the status of FluentBit Service

```bash
sudo systemctl enable fluent-bit
sudo systemctl start fluent-bit
sudo systemctl status fluent-bit
```
