// .vitepress/config.js
import { defineConfig } from 'vitepress'

// Export the VitePress configuration using defineConfig for better TypeScript support and IntelliSense
export default defineConfig({
    // **Site Metadata**
    title: 'PiKube Documentation', // The title of your documentation site
    description: 'Comprehensive documentation for the PiKube Kubernetes Service.', // A brief description of your site
    base: '/pikube-kubernetes-service/', // Base URL the site will be deployed at (adjust if deploying to a sub-path)
    
    markdown: {
        toc: false // This disables the TOC globally
        },
    
      // **Theme Configuration**
    themeConfig: {
        // **Logo Configuration**
        logo: '/pie.svg', // Path to your site's logo image. Ensure 'pie.svg' is in the 'public' directory
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
            text: 'Project Architecture & Purpose', // Section title in the sidebar
            collapsed: true, // Whether the section is collapsed by default
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
                // Add specific markdown files under /10-backup/ if available
                // Example:
                // { text: 'Backup Strategy', link: '/10-backup/backup-strategy' },
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
                { text: 'Service Mesh (Linkerd)', link: '/12-microservices/2-service-mesh-linkerd' },
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
})
