---
title: Minio Installation on a Baremetal Server
permalink: /docs/3-external-services/1-s3-backup-backend-minio-setup-professional
description: Professional-grade configuration for MinIO S3 storage backend with enhanced security, monitoring, and enterprise features for the PiKube Kubernetes cluster backup infrastructure.
last_modified_at: "2025-07-10"
---

# {{ $frontmatter.title }}

<p align="center">
    <img alt="s3-backup-backend-minio-setup"
    src="../resources/external-services/minio.jpg"
    width="%"
    height="%">
</p>

MinIO is a robust distributed object storage server, offering flexibility in deployment either as a Kubernetes service or as a standalone setup in a bare-metal environment. For tasks like backing up or restoring a Kubernetes cluster, opting for the bare-metal installation proves advantageous, allowing MinIO to function as an external service to the cluster.

While MinIO's official documentation does cover the basics of a standalone installation on bare metal, this professional guide emphasizes creating a **secure, enterprise-grade multi-user MinIO environment** with enhanced monitoring, automated certificate management, and comprehensive backup strategies. The foundation for this installation guide is **`blueberry-master`**, a Raspberry Pi 4 with 4GB RAM, operating on the Ubuntu server OS.

For a more streamlined MinIO installation, we've employed Ansible, packaging the setup logic in a role aptly named **`minio.yaml`**. This role not only facilitates the deployment of both the MinIO Server and Client but also automates the creation of S3 buckets and configures user permissions and access controls for enhanced security.

## Create MinIO's UNIX user/group

To maintain enterprise-grade security and system isolation, we create a dedicated system user and group for **MinIO** with appropriate security constraints.

```bash
# Create MinIO system group
sudo groupadd --system minio

# Create MinIO system user with restricted permissions
sudo useradd --system --shell /bin/false --home-dir /var/lib/minio --create-home --group minio minio
```

**Security Enhancements:**

- **`--system`**: Creates a system user (UID < 1000) for service accounts
- **`--shell /bin/false`**: Prevents interactive login for security
- **`--home-dir /var/lib/minio`**: Dedicated home directory for MinIO data

**Verification Commands:**

```bash
# Check the Group
getent group minio

# Check the User
getent passwd minio

# Check User's Group Memberships
groups minio
```

## Create MinIO's S3 storage directory

This is the directory where all the S3 objects would be stored with proper security permissions.

```bash
sudo mkdir -p /storage/minio
sudo chown -R minio:minio /storage/minio
sudo chmod -R 750 /storage/minio
```

**Storage Monitoring:**

```bash
# Set up storage monitoring
sudo mkdir -p /var/log/minio
sudo chown -R minio:minio /var/log/minio
sudo chmod -R 750 /var/log/minio
```

## Set up MinIO's config directories

These directories are used for storing MinIO's configuration, SSL certificates, and policies with enhanced security.

```bash
sudo mkdir -p /etc/minio
sudo mkdir -p /etc/minio/ssl
sudo mkdir -p /etc/minio/policy
sudo chown -R minio:minio /etc/minio
sudo chmod -R 750 /etc/minio
```

## Obtain MinIO's server binary and client

Download the appropriate MinIO server binary (minio) and MinIO client (mc) for your architecture with enhanced verification.

Replace `<arch>` with either `amd64` or `arm64` depending on your architecture.

To get `<arch>` use this enhanced detection script:

```bash
ARCH=$(uname -m)

case $ARCH in
    x86_64)
        ARCH="amd64"
        ;;
    aarch64)
        ARCH="arm64"
        ;;
    *)
        echo "Unsupported architecture: $ARCH"
        exit 1
        ;;
esac

echo "Detected architecture: $ARCH"
```

**Professional Installation with Verification:**
```bash
# Download MinIO binaries
cd /tmp
wget https://dl.min.io/server/minio/release/linux-${ARCH}/minio
wget https://dl.min.io/client/mc/release/linux-${ARCH}/mc

# Set executable permissions
chmod +x minio mc

# Install to system directories
sudo mv minio /usr/local/bin/minio
sudo mv mc /usr/local/bin/mc

# Verify installation
minio --version
mc --version
```

## Set up MinIO's configuration file

This configuration file will contain vital environment variables with enhanced security and performance settings.

Create MinIO Config file **`/etc/minio/minio.conf`**:

```bash
# MinIO Server Configuration - Professional Edition
# PiKube Kubernetes Cluster Backup Backend

# MinIO local volumes
MINIO_VOLUMES="/storage/minio"

# MinIO server options with enhanced security
MINIO_OPTS="--address :9091 --console-address :9092 --certs-dir /etc/minio/ssl"

# Access Key of the server (change in production!)
MINIO_ROOT_USER="minioadmin"
# Secret key of the server (change in production!)
MINIO_ROOT_PASSWORD="supers1cret0"

# Regional configuration
MINIO_SITE_REGION="eu-west-1"

# MinIO server URL
MINIO_SERVER_URL="https://s3.quantfinancehub.com:9091"

# Professional enhancements
MINIO_BROWSER="on"
MINIO_PROMETHEUS_AUTH_TYPE="public"
```

> [!TIP] In production environments, generate strong passwords using:
>
> ```bash
> # Generate secure root password
>openssl rand -base64 32
> ```

MinIO is configured with the following parameters:

- MinIO Server API Port: 9091
- MinIO Console Port: 9092
- MinIO Storage data dir: /storage/minio
- MinIO Site Region: eu-west-1
- SSL certificates stored in: /etc/minio/ssl
- MinIO server URL: `https://s3.quantfinancehub.com:9091`

## Create systemd service for MinIO

Professional systemd service configuration with enhanced security and monitoring capabilities.

Create **`/etc/systemd/system/minio.service`**:

```bash
[Unit]
Description=MinIO S3 Compatible Object Storage
Documentation=https://docs.min.io
Wants=network-online.target
After=network-online.target
AssertFileIsExecutable=/usr/local/bin/minio

[Service]
Type=notify
WorkingDirectory=/usr/local/
User=minio
Group=minio

# Professional security enhancements
ProtectProc=invisible
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/storage/minio /var/log/minio

# Environment configuration
EnvironmentFile=/etc/minio/minio.conf

# Pre-start validation
ExecStartPre=/bin/bash -c "if [ -z \"${MINIO_VOLUMES}\" ]; then echo \"Variable MINIO_VOLUMES not set in /etc/minio/minio.conf\"; exit 1; fi"

# Start MinIO server
ExecStart=/usr/local/bin/minio server $MINIO_OPTS $MINIO_VOLUMES

# Enhanced restart policy
Restart=always
RestartSec=5

# Resource limits
LimitNOFILE=65536
TasksMax=infinity

# Graceful shutdown
TimeoutStopSec=30
SendSIGKILL=no

[Install]
WantedBy=multi-user.target
```

**Service Management:**

```bash
# Enable MinIO service
sudo systemctl daemon-reload
sudo systemctl enable minio.service
```

## SSL Certificates for MinIO

SSL/TLS configuration with automated certificate management.

### Custom CA (Development/Testing)

Create a self-signed CA key and certificate for development environments:

```bash
openssl req -x509 \
       -sha256 \
       -nodes \
       -newkey rsa:4096 \
       -subj "/CN=QuantFinanceHub CA" \
       -keyout rootCA.key -out rootCA.crt
```

Create SSL certificate for MinIO server:

```bash
openssl req -new -nodes -newkey rsa:4096 \
            -keyout minio.key \
            -out minio.csr \
            -batch \
            -subj "/C=GB/ST=London/L=London/O=QuantFinanceHub CA/OU=picluster/CN=s3.quantfinancehub.com"

openssl x509 -req -days 365000 -set_serial 01 \
      -extfile <(printf "subjectAltName=DNS:s3.quantfinancehub.com") \
      -in minio.csr \
      -out minio.crt \
      -CA rootCA.crt \
      -CAkey rootCA.key
```

Install certificates:

```bash
sudo cp minio.crt /etc/minio/ssl/public.crt
sudo cp minio.key /etc/minio/ssl/private.key
sudo chown minio:minio /etc/minio/ssl/{public.crt,private.key}
sudo chmod 600 /etc/minio/ssl/{public.crt,private.key}
```

Trust the self-signed certificate:

```bash
sudo cp rootCA.crt /usr/local/share/ca-certificates/
sudo update-ca-certificates
```

### Cloudflare using Let's Encrypt (Production)

```bash
# Install Certbot with Cloudflare plugin
sudo apt install certbot python3-certbot-dns-cloudflare

# Create secure credentials directory
sudo mkdir -p /root/.secrets/
sudo chmod 700 /root/.secrets/

# Create Cloudflare credentials file
sudo tee /root/.secrets/cloudflare.ini > /dev/null <<EOF
dns_cloudflare_api_token = your-cloudflare-api-token
EOF

sudo chmod 600 /root/.secrets/cloudflare.ini
```

Obtain Let's Encrypt certificate:

```bash
sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
  --dns-cloudflare-propagation-seconds 20 \
  -d s3.quantfinancehub.com \
  --preferred-challenges dns-01 \
  --agree-tos \
  --email admin@quantfinancehub.com \
  --non-interactive
```

Install certificates:

```bash
sudo cp /etc/letsencrypt/live/s3.quantfinancehub.com/fullchain.pem /etc/minio/ssl/public.crt
sudo cp /etc/letsencrypt/live/s3.quantfinancehub.com/privkey.pem /etc/minio/ssl/private.key
sudo chown minio:minio /etc/minio/ssl/{public.crt,private.key}
sudo chmod 600 /etc/minio/ssl/{public.crt,private.key}
```

#### Enable Automatic Certificate Renewal

Professional automated certificate renewal with logging:

```bash
sudo tee /etc/letsencrypt/renewal-hooks/deploy/minio-renewal.sh > /dev/null <<'EOF'
#!/bin/bash
# MinIO Certificate Renewal Hook - Professional Edition
set -e

CERT_DOMAIN="s3.quantfinancehub.com"
CERT_PATH="/etc/letsencrypt/live/${CERT_DOMAIN}"
MINIO_SSL_PATH="/etc/minio/ssl"
LOGFILE="/var/log/minio/cert-renewal.log"

# Copy renewed certificates
cp "${CERT_PATH}/fullchain.pem" "${MINIO_SSL_PATH}/public.crt"
cp "${CERT_PATH}/privkey.pem" "${MINIO_SSL_PATH}/private.key"

# Set proper ownership and permissions
chown minio:minio "${MINIO_SSL_PATH}/public.crt" "${MINIO_SSL_PATH}/private.key"
chmod 600 "${MINIO_SSL_PATH}/public.crt" "${MINIO_SSL_PATH}/private.key"

# Restart MinIO service
systemctl restart minio.service

# Log renewal
echo "$(date): MinIO certificates renewed and service restarted" >> "$LOGFILE"
EOF

sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/minio-renewal.sh
```

Test certificate renewal:

```bash
sudo certbot renew --dry-run
```

**Start MinIO service:**

```bash
sudo systemctl start minio.service
sudo systemctl status minio.service
```

## MinIO Configuration Buckets

Professional bucket configuration with enhanced security and monitoring.

Configure MinIO client connection:

```bash
sudo mc alias set PiKubeS3Vault https://s3.quantfinancehub.com:9091 minioadmin supers1cret0
sudo mc alias list
```

Create service-specific buckets:

```bash
# Create buckets for different services
sudo mc mb PiKubeS3Vault/k3s-longhorn
sudo mc mb PiKubeS3Vault/k3s-velero
sudo mc mb PiKubeS3Vault/restic

# Professional enhancement - Enable versioning
sudo mc version enable PiKubeS3Vault/k3s-longhorn
sudo mc version enable PiKubeS3Vault/k3s-velero
sudo mc version enable PiKubeS3Vault/restic
```

Create users with secure credentials:

```bash
# Generate secure passwords
LONGHORN_PASSWORD=$(openssl rand -base64 24)
VELERO_PASSWORD=$(openssl rand -base64 24)
RESTIC_PASSWORD=$(openssl rand -base64 24)

# Create service users
sudo mc admin user add PiKubeS3Vault longhorn "$LONGHORN_PASSWORD"
sudo mc admin user add PiKubeS3Vault velero "$VELERO_PASSWORD"
sudo mc admin user add PiKubeS3Vault restic "$RESTIC_PASSWORD"

# Store credentials securely
sudo tee /etc/minio/service-credentials.txt > /dev/null <<EOF
# MinIO Service Credentials - Keep Secure!
Longhorn: longhorn / $LONGHORN_PASSWORD
Velero: velero / $VELERO_PASSWORD
Restic: restic / $RESTIC_PASSWORD
EOF
sudo chmod 600 /etc/minio/service-credentials.txt
```

Create and assign access policies:

```bash
# Create Longhorn policy
sudo tee /etc/minio/policy/longhorn_policy.json > /dev/null <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:DeleteObject",
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:ListBucket",
        "s3:ListBucketVersions",
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::k3s-longhorn",
        "arn:aws:s3:::k3s-longhorn/*"
      ]
    }
  ]
}
EOF

# Create Velero policy
sudo tee /etc/minio/policy/velero_policy.json > /dev/null <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:DeleteObject",
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:ListBucket",
        "s3:ListBucketVersions",
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::k3s-velero",
        "arn:aws:s3:::k3s-velero/*"
      ]
    }
  ]
}
EOF

# Create Restic policy
sudo tee /etc/minio/policy/restic_policy.json > /dev/null <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:DeleteObject",
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:ListBucket",
        "s3:ListBucketVersions",
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::restic",
        "arn:aws:s3:::restic/*"
      ]
    }
  ]
}
EOF

# Create and assign policies
sudo mc admin policy create PiKubeS3Vault longhorn-policy /etc/minio/policy/longhorn_policy.json
sudo mc admin policy create PiKubeS3Vault velero-policy /etc/minio/policy/velero_policy.json
sudo mc admin policy create PiKubeS3Vault restic-policy /etc/minio/policy/restic_policy.json

# Attach policies to users
sudo mc admin policy attach PiKubeS3Vault longhorn-policy --user longhorn
sudo mc admin policy attach PiKubeS3Vault velero-policy --user velero
sudo mc admin policy attach PiKubeS3Vault restic-policy --user restic
```

Verify policy assignments:

```bash
sudo mc admin user info PiKubeS3Vault longhorn
sudo mc admin user info PiKubeS3Vault velero
sudo mc admin user info PiKubeS3Vault restic
```

## Monitoring and Maintenance

### Health Monitoring

Set up automated health monitoring:

```bash
# Create health check script
sudo tee /usr/local/bin/minio-health-check.sh > /dev/null <<'EOF'
#!/bin/bash
MINIO_ENDPOINT="https://s3.quantfinancehub.com:9091"
LOGFILE="/var/log/minio/health-check.log"

if curl -s -f "$MINIO_ENDPOINT/minio/health/live" > /dev/null 2>&1; then
    echo "$(date): MinIO health check PASSED" >> "$LOGFILE"
else
    echo "$(date): MinIO health check FAILED" >> "$LOGFILE"
    exit 1
fi
EOF

sudo chmod +x /usr/local/bin/minio-health-check.sh

# Add to cron for regular monitoring
echo "*/5 * * * * root /usr/local/bin/minio-health-check.sh" | sudo tee -a /etc/crontab
```

### Log Rotation

Configure log rotation:

```bash
sudo tee /etc/logrotate.d/minio > /dev/null <<EOF
/var/log/minio/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 640 minio minio
    postrotate
        systemctl reload minio.service
    endscript
}
EOF
```

## Test a Bucket

Comprehensive testing of MinIO deployment:

```bash
# Create test file
echo "MinIO Test - $(date)" > /tmp/testfile.txt

# Test each service account
for user in longhorn velero restic; do
    echo "Testing $user account..."
    
    # Upload test file
    sudo mc cp /tmp/testfile.txt "PiKubeS3Vault/k3s-${user}/"
    
    # Verify upload
    sudo mc ls "PiKubeS3Vault/k3s-${user}/"
    
    # Download and verify
    sudo mc cp "PiKubeS3Vault/k3s-${user}/testfile.txt" "/tmp/downloaded-${user}.txt"
    
    # Compare files
    if diff -q /tmp/testfile.txt "/tmp/downloaded-${user}.txt" > /dev/null; then
        echo "✅ $user account test PASSED"
    else
        echo "❌ $user account test FAILED"
    fi
    
    # Clean up
    sudo mc rm "PiKubeS3Vault/k3s-${user}/testfile.txt"
done

# Clean up test files
rm -f /tmp/testfile.txt /tmp/downloaded-*.txt
```

## Performance Monitoring

Monitor MinIO performance and health:

```bash
# Performance test
sudo mc admin speed test PiKubeS3Vault --duration 30s

# Storage information
sudo mc admin info PiKubeS3Vault

# Prometheus metrics (if enabled)
sudo mc admin prometheus generate PiKubeS3Vault
```
