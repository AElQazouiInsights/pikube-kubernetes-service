// .vitepress/config.js
import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

// Export the VitePress configuration using defineConfig for better TypeScript support and IntelliSense
export default withMermaid(
    defineConfig({
        // **Site Metadata**
        title: 'PiKube Documentation', // The title of your documentation site
        description: 'Comprehensive documentation for the PiKube Kubernetes Service.', // A brief description of your site
        base: '/pikube-kubernetes-service/', // Base URL the site will be deployed at (adjust if deploying to a sub-path)

        // **Theme Configuration**
        themeConfig: {
            // **Logo Configuration**
            logo: '/pi.svg', // Path to your site's logo image. Ensure 'pie.svg' is in the 'public' directory
            outline: 'deep', // This will ensure that the TOC includes deeper levels of headings, creating a nested structure
            // **Navigation Bar**
            nav: [
            { text: 'Home', link: '/' }, // Link to the home page
            { text: 'Docs', link: '/1-project-architecture-purpose/1-project-purpose' }, // Link to the documentation section
            ],

            // **Sidebar Configuration**
            sidebar: {
            '/': [ // Applies to all routes starting with '/'
                {
                text: 'Project Architecture & Purpose',
                collapsed: true,
                items: [
                    { text: 'Project Purpose', link: '/1-project-architecture-purpose/1-project-purpose' },
                    { text: 'Architecture', link: '/1-project-architecture-purpose/2-architecture' },
                ],
                },
                {
                text: 'Cluster Setup',
                collapsed: true,
                items: [
                    { text: 'Gateway Configuration', link: '/2-cluster-setup/1-cluster-gateway-configuration' },
                    { text: 'Nodes Configuration', link: '/2-cluster-setup/2-cluster-nodes-configuration' },
                    { text: 'DNS Architecture', link: '/2-cluster-setup/3-dns-architecture' },
                ],
                },
                {
                text: 'External Services',
                collapsed: true,
                items: [
                    { text: 'S3 Backup Backend (Minio)', link: '/3-external-services/1-s3-backup-backend-minio-setup' },
                    { text: 'External Secret Management (Vault)', link: '/3-external-services/2-external-secret-management-vault' },
                ],
                },
                {
                text: 'Kubernetes',
                collapsed: true,
                items: [
                    { text: 'K3s Installation', link: '/4-kubernetes/1-k3s-installation' },
                    { text: 'Debug Pod Concept', link: '/4-kubernetes/2-debug-pod' },
                    { text: 'Volcano Scheduler', link: '/4-kubernetes/3-volcano-scheduler' },
                ],
                },
                {
                text: 'Networking',
                collapsed: true,
                items: [
                    { text: 'K3s Networking', link: '/5-networking/1-k3s-networking' },
                    { text: 'Load Balancer (Metal LB)', link: '/5-networking/2-load-balancer-metal-lb' },
                    { text: 'Ingress Controller (Traefik)', link: '/5-networking/3-ingress-controller-traefik' },
                    { text: 'Ingress Controller (Nginx)', link: '/5-networking/4-ingress-controller-nginx' },
                ],
                },
                {
                text: 'Certificate Management',
                collapsed: true,
                items: [
                    { text: 'TLS Certificates (Cert-Manager)', link: '/6-certificate-management/1-tls-certificates-cert-manager' },
                ],
                },
                {
                text: 'Single Sign-On',
                collapsed: true,
                items: [
                    { text: 'SSO with Keycloak and OAuth2 Proxy', link: '/7-single-sign-on/1-sso-with-keycloak-and-oauth2-proxy' },
                ],
                },
                {
                text: 'Storage',
                collapsed: true,
                items: [
                    { text: 'Distributed Block Storage (Longhorn)', link: '/8-storage/1-distributed-block-storage-longhorn' },
                    { text: 'S3 Object Storage Service (Minio)', link: '/8-storage/2-s3-object-storage-service-minio' },
                ],
                },
                {
                text: 'Monitoring & Observability',
                collapsed: true,
                items: [
                    { text: 'Metrics Server', link: '/9-monitoring/1-metrics-server' },
                    { text: 'Observability Framework', link: '/9-monitoring/2-observability-framework' },
                    { text: 'Centralized Logging Solutions', link: '/9-monitoring/3-centralized-logging-solutions' },
                    { text: 'Log Aggregation (Loki)', link: '/9-monitoring/4-log-aggregation-loki' },
                    { text: 'Log Analytics (Elasticsearch/Kibana)', link: '/9-monitoring/5-log-analytics-elasticsearch-kibana' },
                    { text: 'Log Collection (FluentBit/Fluentd)', link: '/9-monitoring/6-log-collection-and-distribution-fluentbit-fluentd' },
                    { text: 'Monitoring (Prometheus)', link: '/9-monitoring/7-monitoring-prometheus' },
                    { text: 'Distributed Tracing (Tempo)', link: '/9-monitoring/8-distributed-tracing-tempo' },
                ],
                },
                {
                text: 'Backup',
                collapsed: true,
                items: [
                    { text: 'Backup and Restore', link: '/10-backup/1-backup-and-restore' },
                    { text: 'Restic System Backup', link: '/10-backup/1-restic-system-backup' },
                ],
                },
                {
                text: 'Automation',
                collapsed: true,
                items: [
                    { text: 'Ansible Control Node', link: '/14-automation/1-ansible-control-node' },
                ],
                },
                {
                text: 'AI Intelligent Operations',
                collapsed: true,
                items: [
                    { text: 'Introduction to AI Agents', link: '/15-ai-intelligent-operations/1-introduction-to-ai-agents' },
                    { text: 'Architecture and Design', link: '/15-ai-intelligent-operations/2-architecture-and-design' },
                    { text: 'Prerequisites and Foundation', link: '/15-ai-intelligent-operations/3-prerequisites-and-foundation' },
                    { text: 'Storage Layer Setup', link: '/15-ai-intelligent-operations/4-storage-layer-setup' },
                    { text: 'Agent Core Implementation', link: '/15-ai-intelligent-operations/5-agent-core-implementation' },
                    { text: 'Tool Development', link: '/15-ai-intelligent-operations/6-tool-development' },
                    { text: 'Memory Management', link: '/15-ai-intelligent-operations/7-memory-management' },
                    { text: 'Guardrails and Safety', link: '/15-ai-intelligent-operations/8-guardrails-and-safety' },
                    { text: 'Deployment and GitOps', link: '/15-ai-intelligent-operations/9-deployment-and-gitops' },
                    { text: 'Monitoring and Observability', link: '/15-ai-intelligent-operations/10-monitoring-and-observability' },
                    { text: 'Testing and Validation', link: '/15-ai-intelligent-operations/11-testing-and-validation' },
                    { text: 'Production Operations', link: '/15-ai-intelligent-operations/12-production-operations' },
                ],
                },
                {
                text: 'GitOps',
                collapsed: true,
                items: [
                    { text: 'GitOps with ArgoCD', link: '/11-gitops/1-gitops-with-argocd' },
                ],
                },
                {
                text: 'Microservices',
                collapsed: true,
                items: [
                    { text: 'Databases', link: '/12-microservices/1-databases' },
                    { text: 'Service Mesh (Linkerd)', link: '/12-microservices/2-service-mesh-linkerd' },
                    { text: 'Service Mesh (Istio)', link: '/12-microservices/3-service-mesh-istio' },
                    { text: 'Kafka', link: '/12-microservices/4-kafka' },
                    { text: 'Hasura Finance Application', link: '/12-microservices/5-finance-app-hasura' }
                ],
                },
                {
                text: 'Further Reading',
                collapsed: true,
                items: [
                    { text: 'Kubernetes Commands and Tools Guide', link: '/13-further-reading/utilities' },
                    { text: 'Kubernetes Networking Fundamentals', link: '/13-further-reading/kubernetes-networking-fundamentals' },
                ],
                },
                {
                text: 'Miscellaneous',
                collapsed: true,
                items: [
                    { text: 'Definitions', link: '/0-definitions' },
                    // Include other standalone markdown files
                    // Example:
                    { text: 'Additional Configurations', link: '/2.7-ingress-controller-traefik' },
                ],
                },
            ],
            },

            // **Edit Link Configuration**
            editLink: {
            pattern: 'https://github.com/YourUsername/PiKube-Kubernetes-Cluster/edit/main/docs/:path', // URL pattern for the "Edit this page" link
            text: 'Edit this page on GitHub', // Text for the edit link
            },

            // **Social Links**
            socialLinks: [
            { icon: 'github', link: 'https://github.com/YourUsername/PiKube-Kubernetes-Cluster' }, // Link to your GitHub repository
            ],

            // **Footer Configuration**
            footer: {
            message: 'Documentation licensed under MIT.', // Message displayed in the footer
            copyright: 'Copyright © 2024 Amine El Qazoui', // Copyright information
            },
        },

        // **Markdown Configuration** (merged both settings)
        markdown: {
            toc: false,  // This disables the TOC globally
            mermaid: true,  // Enable mermaid diagrams
            // Map unsupported languages to supported ones
            languageAlias: {
                'config': 'ini',      // Use ini highlighting for config files
                'conf': 'nginx',      // Use nginx highlighting for conf files
                'init': 'ini',        // Use ini highlighting for init files
                'logql': 'sql',       // LogQL is query-based, use SQL highlighting
                'promql': 'sql'       // PromQL is query-based, use SQL highlighting
            }
        },
    })
)