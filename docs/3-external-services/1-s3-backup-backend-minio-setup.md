---
title: Minio Installation on a Baremetal Server
permalink: /docs/3-external-services/1-s3-backup-backend-minio-setup
description: How to configure a Single-board computer (Raspberry Pi or Orange Pi) as router/firewall of our Kubernetes Cluster providing connectivity and basic services (DNS, DHCP, NTP).
last_modified_at: "06-10-2023"
---

# {{ $frontmatter.title }}

<p align="center">
    <img alt="s3-backup-backend-minio-setup"
    src="../resources/external-services/minio.jpg"
    width="%"
    height="%">
</p>

<!-- - [{{ $frontmatter.title }}](#-frontmattertitle-)
  - [Create minio’s UNIX user/group](#create-minios-unix-usergroup)
  - [Create Minio’s S3 storage directory](#create-minios-s3-storage-directory)
  - [Set up Minio’s config directories](#set-up-minios-config-directories)
  - [Obtain Minio's server binary and client](#obtain-minios-server-binary-and-client)
  - [Set up Minio's configuration file](#set-up-minios-configuration-file)
  - [Create systemd service for Minio](#create-systemd-service-for-minio)
  - [SSL Certificates for Minio](#ssl-certificates-for-minio)
    - [Custom CA](#custom-ca)
    - [Cloudflare using Let's Encrypt](#cloudflare-using-lets-encrypt)
      - [Enable Automatic Certificate Renewal](#enable-automatic-certificate-renewal)
  - [Minio Configuration Buckets](#minio-configuration-buckets)
  - [Test a Bucket](#test-a-bucket) -->

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

Self-signed certificates with a custom CA will be used instead using a trusted certificate authority (CA) for Minio server ensures that clients (browsers, SDKs, etc.) will trust the SSL certificate by default. One of the most popular and free CAs is Let's Encrypt, which provides free SSL certificates.

### Custom CA

- Create a self-signed CA key and self-signed certificate

```bash
openssl req -x509 \
       -sha256 \
       -nodes \
       -newkey rsa:4096 \
       -subj "/CN=QuantFinanceHub CA" \
       -keyout rootCA.key -out rootCA.crt
```

- Create a SSL certificate for Minio server signed using the custom CA

```bash
openssl req -new -nodes -newkey rsa:4096 \
            -keyout minio.key \
            -out minio.csr \
            -batch \
            -subj "/C=GB/ST=London/L=London/O=QuantFinanceHub CA/OU=picluster/CN=s3.quantfinancehub.com"
```

```bash
openssl x509 -req -days 365000 -set_serial 01 \
      -extfile <(printf "subjectAltName=DNS:s3.quantfinancehub.com") \
      -in minio.csr \
      -out minio.crt \
      -CA rootCA.crt \
      -CAkey rootCA.key
```

Once the certificate is created, public certificate and private key need to be installed in Minio server following this procedure:

- Copy public certificate minio.crt as /etc/minio/ssl/public.crt

```bash
sudo cp minio.crt /etc/minio/ssl/public.crt
sudo chown minio:minio /etc/minio/ssl/public.crt
```

- Copy private key minio.key as /etc/minio/ssl/private.key

```bash
sudo cp minio.key /etc/minio/ssl/private.key
sudo chown minio:minio /etc/minio/ssl/private.key
```

**`Trust the Self-Signed Certificate`** on the Client Machine: This involves adding the self-generated **`rootCA certificate`** (**`rootCA.crt`** in the procedure) to the trusted certificate store on the machine where you are running the mc command. This will make the mc client trust the certificate presented by your Minio server.

```bash
sudo cp rootCA.crt /usr/local/share/ca-certificates/
sudo update-ca-certificates
```

- Restart minio server.

```bash
sudo systemctl restart minio.service
```

### Cloudflare using Let's Encrypt

- Install Certbot if not already installed

```bash
sudo apt install certbot python3-certbot-dns-cloudflare
```

- Set up Cloudflare credentials

```bash
# Create directory with secure permissions
sudo mkdir -p /root/.secrets/
sudo chmod 0700 /root/.secrets/

# Create credentials file
sudo nano /root/.secrets/cloudflare.ini
# Add: dns_cloudflare_api_token = your-cloudflare-api-token

# Secure the file
sudo chmod 0400 /root/.secrets/cloudflare.ini
```

- Get Let's Encrypt certificate:

```bash
sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
  -d s3.quantfinancehub.com \
  --preferred-challenges dns-01 \
  --agree-tos \
  --email quant-finance-hub@outlook.com
# Here quant-finance-hub@outlook.com
```

- Install certificates

```bash
sudo cp /etc/letsencrypt/live/s3.quantfinancehub.com/fullchain.pem /etc/minio/ssl/public.crt
sudo cp /etc/letsencrypt/live/s3.quantfinancehub.com/privkey.pem /etc/minio/ssl/private.key
sudo chown minio:minio /etc/minio/ssl/{public.crt,private.key}
sudo chmod 600 /etc/minio/ssl/{public.crt,private.key}
```

- Restart Minio service

```bash
sudo systemctl restart minio.service
```

#### Enable Automatic Certificate Renewal

To ensure the updated certificates are always in use, you can automate the renewal and application process:

- Add a renewal hook for Certbot, to copy the new certificates and restart Minio

```bash
sudo nano /etc/letsencrypt/renewal-hooks/deploy/minio-renewal.sh
```

```bash
#!/bin/bash
cp /etc/letsencrypt/live/s3.quantfinancehub.com/fullchain.pem /etc/minio/ssl/public.crt
cp /etc/letsencrypt/live/s3.quantfinancehub.com/privkey.pem /etc/minio/ssl/private.key
chown minio:minio /etc/minio/ssl/{public.crt,private.key}
chmod 600 /etc/minio/ssl/{public.crt,private.key}
systemctl restart minio.service
```

- Make the script executable

```bash
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/minio-renewal.sh
```

- Simulate a renewal to test the hook

```bash
sudo certbot renew --dry-run
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

- Create a sample file and upload it to, for instance, the `longhorn` bucket

```bash
echo "Test file content" > testfile.txt
sudo mc cp testfile.txt PiKubeS3Vault/longhorn/
```

- Verify that the file was successfully uploaded. You should see `testfile.txt` listed in the output

```bash
sudo mc ls PiKubeS3Vault/longhorn
```

- Download and verify the file

```bash
sudo mc cp PiKubeS3Vault/longhorn/testfile.txt downloaded_testfile.txt
cat downloaded_testfile.txt
```

- Clean up

```bash
sudo mc cp PiKubeS3Vault/longhorn/testfile.txt downloaded_testfile.txt
cat downloaded_testfile.txt
```
