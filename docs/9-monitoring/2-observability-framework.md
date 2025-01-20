---
title: Observability Framework
permalink: /docs/monitoring/2-observability-framework
description: Comprehensive observability framework tailored for PiKube Kubernetes Service, integrating Grafana Loki for logs, Prometheus for metrics, and Grafana Tempo for traces. Enhanced with a Logs Analytics framework leveraging Elasticsearch and Kibana.
last_modified_at: "03-03-2024"
---

# {{ $frontmatter.title }}

## Observability Framework

This document outlines an integrated observability and monitoring framework specifically designed for PiKube Kubernetes Service:

> [!CAUTION] 🔜 WORK IN PROGRESS
TODO pikube-observability-architecture.drawio

The framework facilitates comprehensive monitoring of application **`traces`**, **`logs`**, and **`metrics`**, offering a unified dashboard that consolidates all application data for easy **`visualization`** and **`analysis`**.

The observability framework incorporates the following key components:

- [**`Loki`**](https://grafana.com/oss/loki/) for logging
- [**`Grafana Tempo`**](https://grafana.com/oss/tempo/) for distributed tracing
- [**`Prometheus`**](https://prometheus.io/) for monitoring
- [**`Grafana`**](https://grafana.com/oss/grafana/) as the unified interface

Additionally, the framework includes a log analytics component built on [**`Elasticsearch`**](https://www.elastic.co/elasticsearch) and [**`Kibana`**](https://www.elastic.co/fr/kibana), enhancing its logging capabilities.

> [!CAUTION] 🔜 WORK IN PROGRESS
TODO pikube-logs-observability-analytics.drawio

A unified log collection and distribution layer, implemented using Fluent Bit/Fluentd, channels logs to both the **`Log Analytics platform, Elasticsearch`** and the **`Log Monitoring platform, Loki`**.

## Framework Deployment Guide

Detailed steps for deploying the observability framework are provided in the following sections:

- **Logging**
  - Overview of Logging Architecture (EFK + LG)
  - Guide for Loki Installation and Configuration (Log Aggregation)
  - Steps for Elasticsearch and Kibana Installation and Configuration (Log Analytics)
  - Instructions for Fluent Bit/Fluentd Installation and Configuration (Log Collection and Distribution)

- **Monitoring**
  - Prometheus Installation and Configuration Guide

- **Distributed Tracing**
  - Grafana Tempo Installation and Configuration Guide
