import{_ as o,c as r,a0 as a,o as i}from"./chunks/framework.p2VkXzrt.js";const m=JSON.parse('{"title":"Observability Framework","description":"Comprehensive observability framework tailored for PiKube Kubernetes Service, integrating Grafana Loki for logs, Prometheus for metrics, and Grafana Tempo for traces. Enhanced with a Logs Analytics framework leveraging Elasticsearch and Kibana.","frontmatter":{"title":"Observability Framework","permalink":"/docs/monitoring/2-observability-framework","description":"Comprehensive observability framework tailored for PiKube Kubernetes Service, integrating Grafana Loki for logs, Prometheus for metrics, and Grafana Tempo for traces. Enhanced with a Logs Analytics framework leveraging Elasticsearch and Kibana.","last_modified_at":"03-03-2024"},"headers":[],"relativePath":"9-monitoring/2-observability-framework.md","filePath":"9-monitoring/2-observability-framework.md"}'),t={name:"9-monitoring/2-observability-framework.md"};function n(s,e,l,c,g,d){return i(),r("div",null,e[0]||(e[0]=[a('<h2 id="observability-framework" tabindex="-1">Observability Framework <a class="header-anchor" href="#observability-framework" aria-label="Permalink to &quot;Observability Framework&quot;">​</a></h2><p>This document outlines an integrated observability and monitoring framework specifically designed for PiKube Kubernetes Service:</p><p>TODO pikube-observability-architecture.drawio</p><p>The framework facilitates comprehensive monitoring of application <strong><code>traces</code></strong>, <strong><code>logs</code></strong>, and <strong><code>metrics</code></strong>, offering a unified dashboard that consolidates all application data for easy <strong><code>visualization</code></strong> and <strong><code>analysis</code></strong>.</p><p>The observability framework incorporates the following key components:</p><ul><li><a href="https://grafana.com/oss/loki/" target="_blank" rel="noreferrer"><strong><code>Loki</code></strong></a> for logging</li><li><a href="https://grafana.com/oss/tempo/" target="_blank" rel="noreferrer"><strong><code>Grafana Tempo</code></strong></a> for distributed tracing</li><li><a href="https://prometheus.io/" target="_blank" rel="noreferrer"><strong><code>Prometheus</code></strong></a> for monitoring</li><li><a href="https://grafana.com/oss/grafana/" target="_blank" rel="noreferrer"><strong><code>Grafana</code></strong></a> as the unified interface</li></ul><p>Additionally, the framework includes a log analytics component built on <a href="https://www.elastic.co/elasticsearch" target="_blank" rel="noreferrer"><strong><code>Elasticsearch</code></strong></a> and <a href="https://www.elastic.co/fr/kibana" target="_blank" rel="noreferrer"><strong><code>Kibana</code></strong></a>, enhancing its logging capabilities.</p><p>TODO pikube-logs-observability-analytics.drawio</p><p>A unified log collection and distribution layer, implemented using Fluent Bit/Fluentd, channels logs to both the <strong><code>Log Analytics platform, Elasticsearch</code></strong> and the <strong><code>Log Monitoring platform, Loki</code></strong>.</p><h2 id="framework-deployment-guide" tabindex="-1">Framework Deployment Guide <a class="header-anchor" href="#framework-deployment-guide" aria-label="Permalink to &quot;Framework Deployment Guide&quot;">​</a></h2><p>Detailed steps for deploying the observability framework are provided in the following sections:</p><ul><li><p><strong>Logging</strong></p><ul><li>Overview of Logging Architecture (EFK + LG)</li><li>Guide for Loki Installation and Configuration (Log Aggregation)</li><li>Steps for Elasticsearch and Kibana Installation and Configuration (Log Analytics)</li><li>Instructions for Fluent Bit/Fluentd Installation and Configuration (Log Collection and Distribution)</li></ul></li><li><p><strong>Monitoring</strong></p><ul><li>Prometheus Installation and Configuration Guide</li></ul></li><li><p><strong>Distributed Tracing</strong></p><ul><li>Grafana Tempo Installation and Configuration Guide</li></ul></li></ul>',12)]))}const p=o(t,[["render",n]]);export{m as __pageData,p as default};
