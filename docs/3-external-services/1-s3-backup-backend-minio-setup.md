---
title: Minio Installation on a Baremetal Server
permalink: /docs/3-external-services/1-s3-backup-backend-minio-setup
description: How to configure a Single-board computer (Raspberry Pi or Orange Pi) as router/firewall of our Kubernetes Cluster providing connectivity and basic services (DNS, DHCP, NTP).
last_modified_at: "2025-11-06"
---

# {{ $frontmatter.title }}

<p align="center">
    <img alt="s3-backup-backend-minio-setup"
    src="../resources/external-services/minio.jpg"
    width="%"
    height="%">
</p>

Minio is a robust distributed object storage server, offering flexibility in deployment either as a Kubernetes service or as a standalone setup in a bare-metal environment. For tasks like backing up or restoring a Kubernetes cluster, opting for the bare-metal installation proves advantageous, allowing Minio to function as an external service to the cluster.

While Minio's official documentation does cover the basics of a standalone installation on bare metal, this guide emphasizes creating a secure multi-user Minio environment. The foundation for this installation guide is **`blueberry-master`**, a Raspberry Pi 4 with 4GB RAM, operating on the Ubuntu server OS.

For a more streamlined Minio installation, we've employed Ansible, packaging the setup logic in a role aptly named **`minio.yaml`**. This role not only facilitates the deployment of both the Minio Server and Client but also automates the creation of S3 buckets and configures user permissions and access controls for enhanced security.

## Create minio’s UNIX user/group

To keep things secure and maintainable, we're creating a separate user and group for **`Minio`**.

```bash
sudo groupadd minio
sudo useradd minio -g minio
```

**`sudo groupadd minio`**:

- This command creates a new group named **`minio`**:.
  - **`sudo`**: ensures that the command is executed with superuser privileges, which are typically required when adding new groups to a system.
  - **`groupadd`** is the command that adds a new group.

- **`sudo useradd minio -g minio`**:

  - This command creates a new user named **`minio`**.
  - The -g minio option specifies that the new user minio should be added to the minio group (which was created in the previous command).
  - sudo is used again to run the command with superuser privileges.
  - useradd is the command that adds a new user.

After executing these commands, a new user named and a new group named **`minio`** will be created. The **`minio`** user will be a member of the **`minio`** group.

Check the Group:

```bash
getent group minio
```

Check the User:

```bash
getent passwd minio
```

Check User's Group Memberships:

```bash
groups minio
```

## Create Minio’s S3 storage directory

This is the directory where all the S3 objects would be stored.

```bash
sudo mkdir -p /storage/minio
sudo chown -R minio:minio /storage/minio
sudo chmod -R 750 /storage/minio
```

## Set up Minio’s config directories

These directories are used for storing Minio's configuration, SSL certificates, and policies.

```bash
sudo mkdir -p /etc/minio
sudo mkdir -p /etc/minio/ssl
sudo mkdir -p /etc/minio/policy
sudo chown -R minio:minio /etc/minio
sudo chmod -R 750 /etc/minio
```

## Obtain Minio's server binary and client

Download the appropriate Minio server binary (minio) and Minio client (mc) for your architecture and move them to a system-wide accessible location.

Replace `<arch>` with either `amd64` or `arm64` depending on your architecture.

to get `<arch>` use this script

```bash
ARCH=$(uname -m)

if [ "$ARCH" == "x86_64" ]; then
    ARCH="amd64"
elif [ "$ARCH" == "aarch64" ]; then
    ARCH="arm64"
else
    echo "Unsupported architecture"
    exit 1
fi
```

For instance, this home-lab is using an `arm64` architecture.

```bash
wget https://dl.min.io/server/minio/release/linux-arm64/minio
wget https://dl.minio.io/client/mc/release/linux-arm64/mc
chmod +x minio
chmod +x mc
sudo mv minio /usr/local/bin/minio
sudo mv mc /usr/local/bin/mc
```

## Set up Minio's configuration file

This configuration file will contain vital environment variables that the Minio server will utilize.
Create minio Config file **`/etc/minio/minio.conf`**.

```bash
# Minio local volumes.
MINIO_VOLUMES="/storage/minio"

# Minio cli options.
MINIO_OPTS="--address :9091 --console-address :9092 --certs-dir /etc/minio/ssl"

# Access Key of the server.
MINIO_ROOT_USER="<admin_user>" # Here minioadmin
# Secret key of the server.
MINIO_ROOT_PASSWORD="<admin_user_passwd>" # Here supers1cret0
# Minio server region
MINIO_SITE_REGION="eu-west-1"
# Minio server URL
MINIO_SERVER_URL="https://s3.quantfinancehub.com:9091"
```

Minio is configured with the following parameters:

- Minio Server API Port 9091 (MINIO_OPTS=”–address :9091”)
- Minio Console Port: 9092 (MINIO_OPTS=”–console-address :9092”)
- Minio Storage data dir (MINIO_VOLUMES): /storage/minio
- Minio Site Region (MINIO_SITE_REGION): eu-west-1
- SSL certificates stored in (MINIO_OPTS=”–certs-dir /etc/minio/ssl”): /etc/minio/ssl.
- Minio server URL (MINIO_SERVER_URL): Url used to connect to Minio Server API

## Create systemd service for Minio

Having a systemd service allows for easy management of the Minio server using standard system commands.

add in **`/etc/systemd/system/minio.service**

```bash
[Unit]
Description=MinIO
Documentation=https://docs.min.io
Wants=network-online.target
After=network-online.target
AssertFileIsExecutable=/usr/local/bin/minio

[Service]
WorkingDirectory=/usr/local/

User=minio
Group=minio
ProtectProc=invisible

EnvironmentFile=/etc/minio/minio.conf
ExecStartPre=/bin/bash -c "if [ -z \"${MINIO_VOLUMES}\" ]; then echo \"Variable MINIO_VOLUMES not set in /etc/minio/minio.conf\"; exit 1; fi"

ExecStart=/usr/local/bin/minio server $MINIO_OPTS $MINIO_VOLUMES

# Let systemd restart this service always
Restart=always

# Specifies the maximum file descriptor number that can be opened by this process
LimitNOFILE=65536

# Specifies the maximum number of threads this process can create
TasksMax=infinity

# Disable timeout logic and wait until process is stopped
TimeoutStopSec=infinity
SendSIGKILL=no

[Install]
WantedBy=multi-user.target
```

This service start minio server using `minio UNIX group`, loading environment variables located in `/etc/minio/minio.conf` and executing the following startup command:

```bash
/usr/local/minio server $MINIO_OPTS $MINIO_VOLUMES
```

- Activate Minio systemd service to ensure a start on system boot.

```bash
sudo systemctl enable minio.service
```

## SSL Certificates for Minio

Securing Minio with SSL/TLS certificates is essential for production deployments. This section covers two certificate strategies, each suited to different deployment scenarios.

### Certificate Strategy Decision Tree

Choose your certificate approach based on your infrastructure:

| **Scenario** | **Recommended Approach** | **Pros** | **Cons** |
|--------------|-------------------------|----------|----------|
| **Have a domain name** (e.g., quantfinancehub.com) with Cloudflare DNS | **Let's Encrypt with Cloudflare DNS-01** ✅ | • Automatically trusted by all clients<br>• Free and automated<br>• 90-day validity with auto-renewal<br>• Works for internal services | • Requires domain ownership<br>• Requires Cloudflare account<br>• Needs DNS API access |
| **No domain name** or isolated lab environment | **Self-Signed with Custom CA** | • Complete control<br>• No external dependencies<br>• Works offline<br>• Never expires (if configured) | • Requires manual trust setup on all clients<br>• Browser warnings without trust<br>• Manual certificate management |

> [!TIP]
> **For PiKube with quantfinancehub.com domain**: This deployment uses **Let's Encrypt with Cloudflare DNS-01 challenge**, allowing automatic certificate issuance for internal services (e.g., `s3.quantfinancehub.com`) without exposing them to the internet.

### Option 1: Self-Signed Certificates (No Domain Required)

This approach creates your own Certificate Authority (CA) to sign certificates. Ideal for lab environments or when you don't have a domain name.

#### Step 1: Create Root Certificate Authority

```bash
# Generate self-signed root CA
openssl req -x509 \
       -sha256 \
       -nodes \
       -newkey rsa:4096 \
       -subj "/CN=QuantFinanceHub CA" \
       -keyout rootCA.key -out rootCA.crt \
       -days 36500
```

This creates:

- `rootCA.key`: Private key for your CA (keep secure!)
- `rootCA.crt`: Public CA certificate (distribute to clients)

#### Step 2: Generate Minio Server Certificate

```bash
# Create certificate signing request (CSR)
openssl req -new -nodes -newkey rsa:4096 \
            -keyout minio.key \
            -out minio.csr \
            -batch \
            -subj "/C=GB/ST=London/L=London/O=QuantFinanceHub CA/OU=picluster/CN=s3.quantfinancehub.com"

# Sign the CSR with your CA
openssl x509 -req -days 36500 -set_serial 01 \
      -extfile <(printf "subjectAltName=DNS:s3.quantfinancehub.com,DNS:s3.picluster.quantfinancehub.com,IP:10.0.0.10") \
      -in minio.csr \
      -out minio.crt \
      -CA rootCA.crt \
      -CAkey rootCA.key
```

> [!NOTE]
> The `subjectAltName` includes both DNS names and IP addresses for flexible access.

#### Step 3: Install Certificates in Minio

```bash
# Copy public certificate
sudo cp minio.crt /etc/minio/ssl/public.crt
sudo chown minio:minio /etc/minio/ssl/public.crt

# Copy private key
sudo cp minio.key /etc/minio/ssl/private.key
sudo chown minio:minio /etc/minio/ssl/private.key
sudo chmod 600 /etc/minio/ssl/private.key
```

#### Step 4: Trust the CA on Client Machines

For clients to trust your Minio server, install the CA certificate:

**On Ubuntu/Debian (including Raspberry Pi nodes):**

```bash
sudo cp rootCA.crt /usr/local/share/ca-certificates/quantfinancehub-ca.crt
sudo update-ca-certificates
```

**On Windows:**
Import `rootCA.crt` via Certificate Manager (certmgr.msc) → Trusted Root Certification Authorities

#### Step 5: Restart Minio

```bash
sudo systemctl restart minio.service
```

### Option 2: Let's Encrypt with Cloudflare DNS-01 Challenge ✅ RECOMMENDED

This approach uses Let's Encrypt to issue trusted certificates via Cloudflare's DNS API. This is the **recommended approach for the PiKube cluster** with the quantfinancehub.com domain.

#### Prerequisites

- Domain name managed by Cloudflare DNS (e.g., quantfinancehub.com)
- Cloudflare API token with DNS edit permissions

#### Step 1: Create Cloudflare API Token

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **My Profile** → **API Tokens** → **Create Token**
3. Use the **Edit zone DNS** template
4. Configure:
   - **Permissions**: `Zone → DNS → Edit`
   - **Zone Resources**: `Include → Specific zone → quantfinancehub.com`
5. Click **Continue to summary** → **Create Token**
6. **Copy the token immediately** (shown only once)

#### Step 2: Install Certbot with Cloudflare Plugin

```bash
sudo apt update
sudo apt install certbot python3-certbot-dns-cloudflare -y
```

#### Step 3: Configure Cloudflare Credentials

```bash
# Create secure directory
sudo mkdir -p /root/.secrets/
sudo chmod 0700 /root/.secrets/

# Create credentials file
sudo nano /root/.secrets/cloudflare.ini
```

Add the following content (replace with your actual token):

```ini
# Cloudflare API token for DNS-01 challenge
dns_cloudflare_api_token = your-cloudflare-api-token-here
```

Secure the file:

```bash
sudo chmod 0400 /root/.secrets/cloudflare.ini
```

#### Step 4: Request Let's Encrypt Certificate

```bash
sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
  -d s3.quantfinancehub.com \
  --preferred-challenges dns-01 \
  --agree-tos \
  --email quant-finance-hub@outlook.com \
  --non-interactive
```

This creates certificates at:

- `/etc/letsencrypt/live/s3.quantfinancehub.com/fullchain.pem`
- `/etc/letsencrypt/live/s3.quantfinancehub.com/privkey.pem`

#### Step 5: Install Certificates in Minio

```bash
sudo cp /etc/letsencrypt/live/s3.quantfinancehub.com/fullchain.pem /etc/minio/ssl/public.crt
sudo cp /etc/letsencrypt/live/s3.quantfinancehub.com/privkey.pem /etc/minio/ssl/private.key
sudo chown minio:minio /etc/minio/ssl/{public.crt,private.key}
sudo chmod 600 /etc/minio/ssl/{public.crt,private.key}
```

#### Step 6: Restart Minio

```bash
sudo systemctl restart minio.service
```

### Automatic Certificate Renewal (Let's Encrypt Only)

Let's Encrypt certificates are valid for **90 days** and must be renewed regularly. Ubuntu includes automatic renewal via systemd timer.

#### Understanding the Auto-Renewal System

Ubuntu's certbot package installs a systemd timer that runs twice daily:

```bash
# Check the renewal timer status
sudo systemctl status certbot.timer
```

The timer configuration:

- **Runs**: Twice daily at 00:00 and 12:00
- **Random delay**: Up to 12 hours to distribute load
- **Renewal threshold**: Certificates within 30 days of expiry

Verify timer schedule:

```bash
sudo systemctl list-timers certbot.timer
```

#### Post-Renewal Hook for Minio

After certificate renewal, Minio must be restarted to use the new certificates. Create a deployment hook:

```bash
sudo nano /etc/letsencrypt/renewal-hooks/deploy/minio-renewal.sh
```

Add the following content:

```bash
#!/bin/bash
#
# Minio Certificate Renewal Hook
# Executed after successful certificate renewal
# Location: /etc/letsencrypt/renewal-hooks/deploy/minio-renewal.sh
#

set -e

# Certificate paths
CERT_DOMAIN="s3.quantfinancehub.com"
FULLCHAIN="/etc/letsencrypt/live/${CERT_DOMAIN}/fullchain.pem"
PRIVKEY="/etc/letsencrypt/live/${CERT_DOMAIN}/privkey.pem"

# Minio SSL paths
MINIO_CERT="/etc/minio/ssl/public.crt"
MINIO_KEY="/etc/minio/ssl/private.key"

# Log file
LOG="/var/log/letsencrypt/minio-renewal.log"

# Logging function
log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG"
}

log "Starting Minio certificate renewal process"

# Verify source certificates exist
if [ ! -f "$FULLCHAIN" ] || [ ! -f "$PRIVKEY" ]; then
    log "ERROR: Source certificates not found"
    exit 1
fi

# Copy certificates
log "Copying new certificates to Minio"
cp "$FULLCHAIN" "$MINIO_CERT"
cp "$PRIVKEY" "$MINIO_KEY"

# Set ownership and permissions
chown minio:minio "$MINIO_CERT" "$MINIO_KEY"
chmod 600 "$MINIO_CERT" "$MINIO_KEY"

# Restart Minio service
log "Restarting Minio service"
if systemctl restart minio.service; then
    log "Minio successfully restarted with new certificates"
else
    log "ERROR: Failed to restart Minio service"
    exit 1
fi

# Verify Minio is running
sleep 5
if systemctl is-active --quiet minio.service; then
    log "Minio is running and healthy"
else
    log "WARNING: Minio service is not active after restart"
fi

log "Minio certificate renewal completed successfully"
```

Make the script executable:

```bash
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/minio-renewal.sh
```

#### Testing Auto-Renewal

Test the renewal process without actually renewing:

```bash
# Dry-run test (simulates renewal without making changes)
sudo certbot renew --dry-run

# Check the hook execution in the output
# Look for: "Running deploy hook for s3.quantfinancehub.com"
```

Force a renewal to test the hook (only if needed):

```bash
sudo certbot renew --cert-name s3.quantfinancehub.com --force-renewal
```

Check the hook log:

```bash
sudo tail -f /var/log/letsencrypt/minio-renewal.log
```

#### Certificate Expiry Monitoring

Monitor certificate expiration:

```bash
# Check certificate validity
sudo certbot certificates

# Check specific certificate expiry
sudo openssl x509 -in /etc/letsencrypt/live/s3.quantfinancehub.com/fullchain.pem -noout -enddate
```

Expected output:

```init
notAfter=Feb 4 21:55:17 2026 GMT
```

#### Troubleshooting Renewal Issues

**Issue: Renewal fails with DNS propagation errors**

```bash
# Solution: Increase DNS propagation wait time
sudo certbot renew --dns-cloudflare-propagation-seconds 60
```

**Issue: Hook not executing**

```bash
# Check hook directory permissions
sudo ls -la /etc/letsencrypt/renewal-hooks/deploy/

# Manually run the hook to test
sudo /etc/letsencrypt/renewal-hooks/deploy/minio-renewal.sh
```

**Issue: Minio fails to start after renewal**

```bash
# Check Minio logs
sudo journalctl -u minio.service -n 50 --no-pager

# Verify certificate ownership
sudo ls -la /etc/minio/ssl/

# Manually verify certificate
sudo openssl x509 -in /etc/minio/ssl/public.crt -text -noout | grep -E 'Subject:|Issuer:|Not After'
```

### Verification and Testing

After certificate installation (either method), verify the setup:

#### Test Minio Service

```bash
# Check Minio status
sudo systemctl status minio.service

# Test HTTPS connection
curl -I https://s3.quantfinancehub.com:9091/minio/health/live

# Verify certificate details
openssl s_client -connect s3.quantfinancehub.com:9091 -showcerts </dev/null 2>/dev/null | openssl x509 -noout -text | grep -E 'Subject:|Issuer:|Not After'
```

#### Test Minio Client (mc) Connection

```bash
# Configure mc alias (will prompt for credentials if not set)
mc alias set myminio https://s3.quantfinancehub.com:9091 minioadmin supers1cret0

# Test connection
mc admin info myminio
```

## Minio Configuration Buckets

- Configure minio client: mc connection alias to minio server

```bash
sudo mc alias set <minio_alias> <minio_url> <minio_root_user> <minio_root_password>
```

Where

- `<minio_alias>`: PiKubeS3Vault
- `<minio_url>`: https://s3.quantfinancehub.com:9091
- `<minio_root_user>`: minioadmin
- `<minio_root_password>`: supers1cret0

To check the alias as sudo user

```bash
sudo mc alias list
```

The following buckets need to be created for backing-up different cluster components:

- Longhorn Backup: **`k3s-longhorn`**
- Velero Backup: **`k3s-velero`**
- OS backup: **`restic`**

  - Start by creating the required buckets using Minio's CLI (mc):

  ```bash
  sudo mc mb <minio_alias>/k3s-longhorn
  sudo mc mb <minio_alias>/k3s-velero
  sudo mc mb <minio_alias>/restic
  ```

  - Create users with specific credentials:

  ```bash
  sudo mc admin user add <minio_alias> longhorn longhorn_password
  sudo mc admin user add <minio_alias> velero velero_password
  sudo mc admin user add <minio_alias> restic restic_password
  ```

  Replace `longhorn_password`, `velero_password`, and `restic_password` with the desired passwords for these users.

  To list all users in a MinIO setup using the mc command-line tool

  ```bash
  sudo mc admin user list <minio_alias>
  ```

  In case the user password is forgotten, it needs to be reset

  ```bash
  sudo mc admin user add <minio_alias> longhorn longhorn_password
  sudo mc admin user add <minio_alias> velero velero_password
  sudo mc admin user add <minio_alias> restic restic_password
  ```

  - Create Policies, Access Control Lists (ACLs)

  Policies in MinIO are akin to AWS S3 bucket policies. They define permissions on the buckets and objects. The policies are JSON-based ACLs that grant or deny actions on the buckets and/or the objects within them.

  For each user, create a separate policy granting them read-write access to their respective buckets.

  First, let's create the policy files:

  For the `longhorn` user:

  ```json
  // Save this as /etc/minio/policy/longhorn_policy.json
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "s3:DeleteObject",
          "s3:GetObject",
          "s3:ListBucket",
          "s3:PutObject"
        ],
        "Resource": [
          "arn:aws:s3:::k3s-longhorn",
          "arn:aws:s3:::k3s-longhorn/*"
        ]
      }
    ]
  }
  ```

  For the `velero` user:

  ```json
  // Save this as /etc/minio/policy/velero_policy.json
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "s3:DeleteObject",
          "s3:GetObject",
          "s3:ListBucket",
          "s3:PutObject"
        ],
        "Resource": [
          "arn:aws:s3:::k3s-velero",
          "arn:aws:s3:::k3s-velero/*"
        ]
      }
    ]
  }
  ```

  For the `restic` user:

  ```json
  // Save this as /etc/minio/policy/restic_policy.json
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "s3:DeleteObject",
          "s3:GetObject",
          "s3:ListBucket",
          "s3:PutObject"
        ],
        "Resource": [
          "arn:aws:s3:::restic",
          "arn:aws:s3:::restic/*"
        ]
      }
    ]
  }
  ```

  - Now, assign these policies to the respective users:

  ```bash
  sudo mc admin policy create <minio_alias> longhorn /etc/minio/policy/longhorn_policy.json
  sudo mc admin policy create <minio_alias> velero /etc/minio/policy/velero_policy.json
  sudo mc admin policy create <minio_alias> restic /etc/minio/policy/restic_policy.json
  ```

  - Assign Policies to Users by linking the created policies to the corresponding users:

  ```bash
  sudo mc admin policy attach <minio_alias> longhorn --user longhorn
  sudo mc admin policy attach <minio_alias> velero --user velero
  sudo mc admin policy attach <minio_alias> restic --user restic
  ```

  To verify if the policy has been successfully attached to the user

  ```bash
  sudo mc admin user info <minio_alias> longhorn
  sudo mc admin user info <minio_alias> velero
  sudo mc admin user info <minio_alias> restic
  ```

Now, Minio server is set up with three buckets (`k3s-longhorn`, `k3s-velero`, and `restic`), three users (`longhorn`, `velero`, and `restic`), and access policies granting each user read-write permissions only to their respective buckets.

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