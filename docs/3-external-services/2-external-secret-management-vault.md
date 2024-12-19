---
title: Secret Management with HashiCorp Vault
permalink: /docs/2.3-vault-secret-management/
description: Deploying HashiCorp Vault as a Secret Manager for PiKube Kubernetes Service.
last_modified_at: "21-02-2024"
---

<p align="center">
    <img alt="secret-management-with-hashicorp-vault"
    src="../resources/external-services/harchicorp-vault.jpg"
    width="35%"
    height="%">
</p>

- [Setting Up HashiCorp Vault: A Step-by-Step Guide](#setting-up-hashicorp-vault-a-step-by-step-guide)
  - [Creating the Vault User and Group](#creating-the-vault-user-and-group)
  - [Preparing Vault's Storage and Configuration Directories](#preparing-vaults-storage-and-configuration-directories)
  - [Installing Vault](#installing-vault)
- [Implementing SSL Certificates for Vault with a Custom CA or Cloudflare using Let's Encrypt](#implementing-ssl-certificates-for-vault-with-a-custom-ca-or-cloudflare-using-lets-encrypt)
  - [Custom CA](#custom-ca)
  - [Cloudflare using Let's Encrypt](#cloudflare-using-lets-encrypt)
- [Configuring HashiCorp Vault with a Custom Configuration and Systemd Service](#configuring-hashicorp-vault-with-a-custom-configuration-and-systemd-service)
  - [Create vault config file](#create-vault-config-file)
  - [Create systemd service for Vault](#create-systemd-service-for-vault)
- [Streamlining Vault Initialization and Automatic Unseal](#streamlining-vault-initialization-and-automatic-unseal)
  - [Vault Initialization and Unseal](#vault-initialization-and-unseal)
    - [Manual Unsealing Process](#manual-unsealing-process)
    - [Automating Vault unsealing](#automating-vault-unsealing)
- [Configuring HashiCorp Vault: Setting Up and Managing Secrets](#configuring-hashicorp-vault-setting-up-and-managing-secrets)
  - [Utilizing the Root Token](#utilizing-the-root-token)
  - [Interacting with Vault's API](#interacting-with-vaults-api)
  - [Enabling the Key-Value (KV) Secrets Engine](#enabling-the-key-value-kv-secrets-engine)
  - [Establishing Vault Policies](#establishing-vault-policies)
  - [Testing Policy Effectiveness](#testing-policy-effectiveness)
- [Kubernetes Authentication Method with Vault](#kubernetes-authentication-method-with-vault)
- [Installing the External Secrets Operator](#installing-the-external-secrets-operator)

The PiKube Kubernetes Cluster utilizes HashiCorp Vault as its primary system for managing secrets. This system ensures the protection of sensitive data, such as user credentials, passwords, and API tokens, through advanced encryption methods.

- **Vault as an External Service:** Vault is deployed as an external service, situated on the gateway, distinct from the PiKube Kubernetes services within the K3S cluster. This distinct setup allows for effortless integration with the GitOps tool, **`ArgoCD`**, hereby facilitating the automated deployment of cluster services. The external positioning of Vault streamlines the management of secrets while leveraging its comprehensive security features, ensuring a robust and secure environment for sensitive data outside the Kubernetes cluster.

- **`Challenges of Kubernetes Integration:`** Deploying Vault within PiKube Kubernetes Service, either via the official Helm chart or community solutions like Banzai Bank-Vault, presents several challenges. A key issue is the dependency loop encountered when Vault is the sole repository for all secrets of Kubernetes services. This dependency necessitates an existing block storage solution, like Longhorn, because Vault requires Persistent Volumes. However, deploying such storage solutions themselves demands access to specific secrets, such as Minio credentials for backup configurations.

- **`Solution via External Secrets Operator:`** To address these challenges, the **External Secrets Operator** is employed. This tool extracts data from Vault and dynamically generates the required Kubernetes Secrets. As a result, it ensures the smooth and secure deployment of various services through ArgoCD, effectively overcoming the integration hurdles.

By integrating HashiCorp Vault with the External Secrets Operator, the PiKube cluster enhances its secret management capabilities, ensuring a secure and efficient service deployment process.

<p align="center">
    <img alt="cluster-gateway"
    src="../resources/external-services/pikube-secret-manager-external-service.drawio.svg"
    width="%"
    height="%">
</p>

## Setting Up HashiCorp Vault: A Step-by-Step Guide

### Creating the Vault User and Group

Opting for manual installation of Vault via binaries allows for version control. A system user, **`vault`**, is created without login permissions:

```bash
sudo groupadd vault
sudo useradd vault -g vault -r -s /sbin/nologin
```

### Preparing Vault's Storage and Configuration Directories

- Create Vault’s storage, configuration and log directories

```bash
# Create directories
sudo mkdir -p /var/lib/vault /etc/vault /etc/vault/plugin /etc/vault/policy /var/log/vault

# Set permissions
sudo chown -R vault:vault /var/lib/vault /etc/vault /var/log/vault
sudo chmod -R 750 /var/lib/vault /etc/vault /var/log/vault
```

This step ensures Vault has a dedicated log directory for operational transparency.

### Installing Vault

With the user, group, and directories set up, proceed to install Vault.

- install dependencies

```bash
sudo apt install jq unzip certbot python3-pip
sudo pip3 install certbot-dns-cloudflare
```

- Fetch the latest version of Vault and the system architecture:

```bash
export LATEST_VERSION=$(curl -s https://api.github.com/repos/hashicorp/vault/tags | jq -r '.[0].name' | tr -d 'v')
export ARCH="arm64"
echo "Latest Vault version is: $LATEST_VERSION and system architecture is: $ARCH" 
wget https://releases.hashicorp.com/vault/${LATEST_VERSION}/vault_${LATEST_VERSION}_linux_${ARCH}.zip
```

- install Vault

```bash
unzip vault_${LATEST_VERSION}_linux_${ARCH}.zip
chmod +x vault
sudo mv vault /usr/local/bin/
rm -rf vault_${LATEST_VERSION}_linux_${ARCH}.zip
```

## Implementing SSL Certificates for Vault with a Custom CA or Cloudflare using Let's Encrypt

Securing HashiCorp Vault's communication requires SSL certificates. While using certificates from well-known Certificate Authorities (CAs) like Let's Encrypt is common, creating a self-signed certificate with a custom CA offers flexibility and control.

### Custom CA

- Generate a self-signed root CA certificate that will be used to sign the Vault server's certificate

```bash
openssl req -x509 \
       -sha256 \
       -nodes \
       -newkey rsa:4096 \
       -subj "/CN=QuantFinanceHub CA" \
       -keyout rootCA.key -out rootCA.crt
```

- Prepare a Certificate Signing Request (CSR) for the Vault server, specifying the desired subject details

```bash
openssl req -new -nodes -newkey rsa:4096 \
            -keyout vault.key \
            -out vault.csr \
            -batch \
            -subj "/C=GB/ST=London/L=London/O=QuantFinanceHub CA/OU=picluster/CN=vault.picluster.quantfinancehub.com"
```

- Use the root CA to sign the CSR, including Subject Alternative Names (SANs) for DNS and IP access.

```bash
openssl x509 -req -days 365000 -set_serial 01 \
      -extfile <(printf "subjectAltName=DNS:vault.picluster.quantfinancehub.com,IP:127.0.0.1,IP:10.0.0.1") \
      -in vault.csr \
      -out vault.crt \
      -CA rootCA.crt \
      -CAkey rootCA.key
```

Once the certificate is created, public certificate and private key need to be installed in Vault server following this procedure:

- Copy the signed certificate to the Vault server's configuration directory

```bash
sudo cp vault.crt /etc/vault/tls/public.crt
sudo chown vault:vault /etc/vault/tls/public.crt
```

- Ensure the private key is also placed securely in the Vault server's configuration directory

```bash
sudo cp vault.key /etc/vault/tls/vault.key
sudo chown vault:vault /etc/vault/tls/vault.key
```

- For clients to trust the self-signed certificate, the root CA's certificate must be added to their trusted store

```bash
sudo cp rootCA.crt /etc/vault/tls/vault-ca.crt
sudo chown vault:vault /etc/vault/tls/vault-ca.crt
```

- Verify the Certificate Installation by checking the details of the installed CA certificate

```bash
sudo openssl x509 -in /etc/vault/tls/vault-ca.crt -text -noout
```

> ⚠️ Important Consideration
>
> *If accessing Vault through an IP address is required, ensure the IP is included in the SAN during certificate generation.*

### Cloudflare using Let's Encrypt

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
  -d vault.picluster.quantfinancehub.com \
  --preferred-challenges dns-01 \
  --agree-tos \
  --email your-email@domain.com
# Here quant-finance-hub@outlook.com
```

- Give vault user access to certificates:

```bash
sudo chown -R root:vault /etc/letsencrypt
sudo chmod -R 755 /etc/letsencrypt
sudo chmod -R 750 /etc/letsencrypt/live
sudo chmod -R 750 /etc/letsencrypt/archive
```

## Configuring HashiCorp Vault with a Custom Configuration and Systemd Service

### Create vault config file

- Create a Custom Configuration File named **`vault_main.hcl`** in **`/etc/vault`** to specify Vault's operational settings

**Using Custom CA**:

```bash
# Cluster address for server-to-server communication within a Vault cluster
cluster_addr  = "https://vault.picluster.quantfinancehub.com:8201"

# API address for client-to-server communication
api_addr      = "https://vault.picluster.quantfinancehub.com:8200"
# Note: If accessing Vault via IP address, ensure the IP is included in the SSL certificate's SAN

# Directory where Vault plugins are stored
plugin_directory = "/etc/vault/plugin"

# Enable the Vault UI
ui = true 

# Disable memory locking (mlock). Not recommended for production, but may be necessary on systems that do not support mlock
disable_mlock = true

# TCP listener configuration for incoming connections
listener "tcp" {
  address     = "0.0.0.0:8200"  # Listen on all interfaces
  tls_cert_file      = "/etc/vault/tls/public.crt"  # TLS certificate file for HTTPS
  tls_key_file       = "/etc/vault/tls/vault.key"   # TLS private key file for HTTPS
  tls_disable_client_certs = true  # Do not require client TLS certificates
}

# Storage backend configuration using Raft for high availability and data storage
storage "raft" {
  path = "/var/lib/vault"  # Directory where Raft data is stored
}

# Logging configuration (optional but recommended for monitoring and troubleshooting)
log_file   = "/var/log/vault/vault.log"  # Path to the log file
log_level  = "info"  # Log verbosity (e.g., "info", "debug")
```

**Cloudflare using Let's Encrypt**:

```bash
# vault_main.hcl - Place in /etc/vault/vault_main.hcl
# Cluster address for server-to-server communication
cluster_addr = "http://vault.picluster.quantfinancehub.com:8201"

# API address for client-to-server communication
api_addr = "http://vault.picluster.quantfinancehub.com:8200"

# Directory where Vault plugins are stored
plugin_directory = "/etc/vault/plugin"

# Enable the Vault UI (disabled for now)
ui = false 

# Disable memory locking (mlock)
disable_mlock = true

# TCP listener configuration
listener "tcp" {
  address = "0.0.0.0:8200"
  tls_cert_file = "/etc/letsencrypt/live/vault.picluster.quantfinancehub.com/fullchain.pem"
  tls_key_file = "/etc/letsencrypt/live/vault.picluster.quantfinancehub.com/privkey.pem"
  tls_disable_client_certs = true
}

# Storage backend configuration using Raft
storage "raft" {
  path = "/var/lib/vault"
}

# Logging configuration
log_file = "/var/log/vault/vault.log"
log_level = "info"
```

### Create systemd service for Vault

- Define a systemd service for Vault to facilitate its management via systemd commands in **`/etc/systemd/system/vault.service`**

```bash
[Unit]
Description="HashiCorp Vault - A tool for managing secrets"
Documentation=https://www.vaultproject.io/docs/
Requires=network-online.target
After=network-online.target
ConditionPathExists=/etc/vault/vault_main.hcl

[Service]
User=vault
Group=vault
ProtectSystem=full
ProtectHome=read-only
PrivateTmp=yes
PrivateDevices=yes
SecureBits=keep-caps
Capabilities=CAP_IPC_LOCK+ep
AmbientCapabilities=CAP_SYSLOG CAP_IPC_LOCK
CapabilityBoundingSet=CAP_SYSLOG CAP_IPC_LOCK
NoNewPrivileges=yes
ExecStart=/bin/sh -c 'exec /usr/local/bin/vault server -config=/etc/vault/vault_main.hcl -log-level=info'
ExecReload=/bin/kill --signal HUP $MAINPID
KillMode=process
KillSignal=SIGINT
Restart=on-failure
RestartSec=5
TimeoutStopSec=30
StartLimitInterval=60
StartLimitBurst=3
LimitNOFILE=524288
LimitNPROC=524288
LimitMEMLOCK=infinity
LimitCORE=0

[Install]
WantedBy=multi-user.target
```

> 📌 **Note**
>
> *This service start Vault server using vault UNIX group, loading environment variables located in **`/etc/vault/vault_main.hcl`** and executing the following startup command*
>
> ```bash
> /usr/local/vault server -config=/etc/vault/vault_main.hcl -log-level=info
> ```

- Activate the systemd service to ensure Vault starts automatically with the system and check it

```bash
sudo systemctl enable vault.service
sudo systemctl daemon-reload
sudo systemctl start vault.service
sudo systemctl status vault.service
```

- Use Vault's CLI or API to examine the current status, ensuring it's initialized and unsealed correctly

```bash
sudo VAULT_ADDR=https://vault.picluster.homelab.com:8200 VAULT_CACERT=/etc/vault/tls/vault-ca.crt vault status
```

The output should be like the following

```bash
Key                Value
---                -----
Seal Type          shamir
Initialized        false
Sealed             true
Total Shares       0
Threshold          0
Unseal Progress    0/0
Unseal Nonce       n/a
Version            1.15.0
Build Date         2023-09-22T16:53:10Z
Storage Type       raft
HA Enabled         true
```

It shows Vault server status as not initialized (Initialized = false) and sealed (Sealed = true).

- For convenience, set Vault's address and CA certificate in **`~/.bashrc`** to avoid repeated specification.

```bash
echo "export VAULT_ADDR=https://vault.picluster.homelab.com:8200" >> ~/.bashrc
echo "export VAULT_CACERT=/etc/vault/tls/vault-ca.crt" >> ~/.bashrc
source ~/.bashrc
```

- To maintain efficient log storage, configure log rotation for Vault's logs in **`/etc/logrotate.d/vault`**

```bash
# Begin log rotation configuration for HashiCorp Vault logs
echo "/var/log/vault/vault.log {
    daily                # Rotate the log files daily
    rotate 7             # Keep the last 7 days of log files
    compress             # Compress (gzip) the log files upon rotation
    delaycompress        # Delay compression until the next log rotation cycle
    missingok            # If the log file is missing, go on to the next one without issuing an error message
    notifempty           # Do not rotate the log file if it is empty
    create 0640 vault vault  # Create new log files with set permissions (0640) and owner/group (vault)
}" | sudo tee /etc/logrotate.d/vault
# This command writes the above configuration to /etc/logrotate.d/vault, effectively
# setting up log rotation for Vault's logs according to the specified rules.
```

## Streamlining Vault Initialization and Automatic Unseal

### Vault Initialization and Unseal

When Vault initializes, it produces a root key that is stored in its storage backend along with the rest of its data. This root key is encrypted and demands an unseal key for decryption.

Each time the Vault server starts, the unsealing process must take place. This involves providing unseal keys to reconstruct the original root key.

By default, Vault uses Shamir's Secret Sharing technique to divide the root key into several pieces, often referred to as key shares or unseal keys. A specific number of these pieces is essential to recreate the root key, which is then employed to decipher Vault's encrypted key.

To kickstart Vault, use the **`vault operator init`** command.

```bash
sudo -E vault operator init -key-shares=1 -key-threshold=1 -format=json > /etc/vault/unseal.json
```

or use the below command as sometimes the problem faced is due to shell redirection (>) permissions, not the permissions of the vault command itself. The redirection > is carried out by your shell (bash, in this case) with the current user's permissions, not with the permissions of the command preceding it.

```bash
sudo -E VAULT_ADDR=https://vault.picluster.quantfinancehub.com:8200 vault operator init -key-shares=1 -key-threshold=1 -format=json | sudo tee /etc/vault/unseal.json > /dev/null
```

The settings for key shares (**`-key-shares`**) and threshold (**`-key-threshold`**) are both configured to 1, meaning only a single key is required to unseal the Vault.
The result from the **`vault init`** command is saved to a file named **`/etc/vault/unseal.json`**. This file contains values for the unseal keys and the essential root token to access Vault.

```json
{
  "unseal_keys_b64": [
    "XMVWUBobHzYCiM8OxeI8IOhnVkjoIi3Djhm+z20R72w="
  ],
  "unseal_keys_hex": [
    "5cc556501a1b1f360288cf0ec5e23c20e8675648e8222dc38e19becf6d11ef6c"
  ],
  "unseal_shares": 1,
  "unseal_threshold": 1,
  "recovery_keys_b64": [],
  "recovery_keys_hex": [],
  "recovery_keys_shares": 0,
  "recovery_keys_threshold": 0,
  "root_token": "hvs.n1rsduB9RaanbvPUxvqeCQCv"
}
```

> ⚠️ Important Consideration
>
> *Ensure to create a backup of the **`/etc/vault/unseal.json`** file.*

- After initialization, Vault remains in a sealed state, inaccessible for normal operations

```bash
sudo - E vault status
```

```bash
Key                Value                
---                -----                
Seal Type          shamir               
Initialized        true                 
Sealed             true                 
Total Shares       1                    
Threshold          1                    
Unseal Progress    0/1                  
Unseal Nonce       n/a                  
Version            1.15.0               
Build Date         2023-09-22T16:53:10Z 
Storage Type       raft                 
HA Enabled         true                 
```

#### Manual Unsealing Process

- Utilize the **`vault operator unseal`** command with a key from **`unseal.json`**

```bash
sudo -E VAULT_ADDR=https://vault.picluster.homelab.com:8200 VAULT_CACERT=/etc/vault/tls/vault-ca.crt vault operator unseal $(sudo jq -r '.unseal_keys_b64[0]' /etc/vault/unseal.json)
```

```bash
Key                     Value
---                     -----
Seal Type               shamir
Initialized             true
Sealed                  false
Total Shares            1
Threshold               1
Version                 1.15.0
Build Date              2023-09-22T16:53:10Z
Storage Type            raft
Cluster Name            vault-cluster-993ccb13
Cluster ID              acb93e11-2738-51b0-19f4-ff346ee3319d
HA Enabled              true
HA Cluster              n/a
HA Mode                 standby
Active Node Address     <none>
Raft Committed Index    31
Raft Applied Index      31            
```

#### Automating Vault unsealing

To automate the unsealing of Vault upon startup, set up a systemd service.

- Create a script to manage the unseal process under **`/etc/vault/vault-unseal.sh`**. The script will utilize keys located in **`/etc/vault/unseal.json`**

```bash
#!/usr/bin/env sh

# Function to generate a timestamp in the format "Mon 01 2024 00:00:00 GMT"
timestamp() {
  date "+%b %d %Y %T %Z"
}

# Vault server URL. Replace the placeholder with the actual Vault server address.
URL=https://vault.picluster.quantfinancehub.com:8200

# Path to the file containing the unseal keys for Vault.
KEYS_FILE=/etc/vault/unseal.json

# Path to the log file where script output will be recorded.
LOG=/var/log/vault-unseal.log

# Flag to skip TLS verification in curl commands. Set to true to skip verification.
SKIP_TLS_VERIFY=true

# Parameters for curl command based on whether TLS verification is skipped.
CURL_PARAMS=$([ "$SKIP_TLS_VERIFY" = true ] && echo "-sk" || echo "-s")

# Ensure the log file exists and set its permissions correctly.
# These commands might fail if the script doesn't have the necessary permissions,
# so it's recommended to set up the log file and permissions outside this script.
touch $LOG
chown vault:vault $LOG
chmod 660 $LOG

# Log the start of the unseal process with a timestamp.
echo "$(timestamp): Vault-unseal initiated" | tee -a $LOG
echo "-------------------------------------------------------------------------------" | tee -a $LOG

# Check if Vault is initialized by querying its health endpoint.
initialized=$(curl $CURL_PARAMS $URL/v1/sys/health | jq '.initialized')

# If Vault is initialized, proceed with the unseal process.
if [ "$initialized" = true ]; then
  echo "$(timestamp): Vault is initialized" | tee -a $LOG

  # Continuously check if Vault is sealed and attempt to unseal it.
  while true; do
    status=$(curl $CURL_PARAMS $URL/v1/sys/health | jq '.sealed')
    
    # If Vault is sealed, attempt to unseal it using keys from the unseal.json file.
    if [ "$status" = true ]; then
        echo "$(timestamp): Vault is sealed. Attempting to unseal" | tee -a $LOG
        
        # Extract unseal keys from the JSON file and use them to unseal Vault.
        for i in $(jq -r '.unseal_keys_b64[]' $KEYS_FILE); do 
          curl $CURL_PARAMS --request PUT --data "{\"key\": \"$i\"}" $URL/v1/sys/unseal
        done

        # Wait for 10 seconds before checking the seal status again.
        sleep 10
    else
        # If Vault is unsealed, log the success and exit the loop.
        echo "$(timestamp): Vault successfully unsealed" | tee -a $LOG
        break
    fi
  done
else
  # If Vault is not initialized, log this status.
  echo "$(timestamp): Vault hasn't been initialized" | tee -a $LOG
fi
```

- Define the systemd service for Vault unseal under **`/etc/systemd/system/vault-unseal.service`**
This service is configured as a dependent of vault.service. Actions on vault.service will be cascaded to this service.

```bash
[Unit]
Description=Automate Vault Unsealing
After=vault.service
Requires=vault.service
PartOf=vault.service

[Service]
Type=oneshot
User=vault
Group=vault
ExecStartPre=/bin/sleep 10
ExecStart=/bin/sh -c '/etc/vault/vault-unseal.sh'
RemainAfterExit=false

[Install]
WantedBy=multi-user.target vault.service
```

- Activate and launch the systemd service.

```bash
sudo systemctl enable vault-unseal.service
sudo systemctl start vault-unseal.service
```

Now, every time Vault starts, it should automatically unseal, streamlining the process.

## Configuring HashiCorp Vault: Setting Up and Managing Secrets

Following the unsealing of HashiCorp Vault, it's essential to configure the server for operational use. This process involves utilizing the root token created during the initialization phase and setting up secret management capabilities through Vault's API and KV Secrets Engine.

### Utilizing the Root Token

First, set the environment variable **`VAULT_TOKEN`** with the root token found in the **`unseal.json`** file to authenticate subsequent Vault operations:

```bash
export VAULT_TOKEN=$(sudo jq -r '.root_token' /etc/vault/unseal.json)
```

>📢 Note
>
> *Vault's functionality extends beyond CLI commands, enabling operations through its API for comprehensive automation and integration capabilities. Always include the Vault token in the HTTP header as **`X-Vault-Token`** when making API requests.*

### Interacting with Vault's API

- Making a GET Request to retrieve data from Vault by specifying the endpoint

```bash
curl -k -H "X-Vault-Token: $VAULT_TOKEN" $VAULT_ADDR/<api_endpoint>
```

- Making a POST Request to retrieve data from Vault by specifying the endpoint

```bash
curl -k -X POST -H "X-Vault-Token: $VAULT_TOKEN" -d '{"key1":"value1", "key2":"value2"}' $VAULT_ADDR/<api_endpoint>
```

Please ensure to replace `<api_endpoint>` with the appropriate endpoint from the [**`Vault API documentation`**](https://developer.hashicorp.com/vault/api-docs).

### Enabling the Key-Value (KV) Secrets Engine

- Manage static secrets by initializing the KV (Key-Value) secrets engine, specifying its version and path

```bash
sudo -E vault secrets enable -version=2 -path=secret kv
```

This action activates the KV's second version at the **`/secret`** directory.

### Establishing Vault Policies

To facilitate access controls, set up Vault policies for both reading and modifying KV secrets.

Create a policy file named **`/etc/vault/policy/secrets-readwrite.hcl`** with the following content, and then apply it to Vault.

```bash
# Permissions for managing secrets
path "secret/*" {
  capabilities = ["create", "read", "update", "delete", "list", "patch"]
}

# Allow enabling and configuring auth methods (specifically for Kubernetes)
path "sys/auth/*" {
  capabilities = ["create", "read", "update", "delete"]
}
```

make sure the file inherited if the vault user/group

```bash
sudo chown -R vault:vault /etc/vault
sudo chmod -R 750 /etc/vault
```

- Apply the read-write policy

```bash
sudo -E vault policy write readwrite /etc/vault/policy/secrets-readwrite.hcl
```

- Similarly, define a read-only policy in **`/etc/vault/policy/secrets-read.hcl`** and register it with Vault

```bash
path "secret/*" {
  capabilities = [ "read" ]
}
```

make sure the file inherited if the vault user/group

```bash
sudo chown -R vault:vault /etc/vault
sudo chmod -R 750 /etc/vault
```

- Apply the read-only policy

```bash
sudo -E vault policy write readonly /etc/vault/policy/secrets-read.hcl
```

### Testing Policy Effectiveness

Verify that the policies are correctly enforced by attempting to write and read secrets with tokens bound to each policy.

- Test Writing a Secret (expected to fail with read-only token)

```bash
READ_TOKEN=$(sudo -E vault token create -policy="readonly" -field=token)
VAULT_TOKEN=$READ_TOKEN
sudo -E vault kv put secret/secret1 user="user1" password="3aZ0uA"
```

This should result in a permission denied error for the read-only token

- Successful Secret Writing (using the read-write token)

```bash
WRITE_TOKEN=$(sudo -E vault token create -policy="readwrite" -field=token)
VAULT_TOKEN=$WRITE_TOKEN
sudo -E vault kv put secret/secret1 user="user1" password="3aZ0uA"
```

If executed correctly, the below confirmation appears:

```bash
=== Secret Path ===
secret/data/secret1

======= Metadata =======
Key                Value
---                -----
created_time       2023-10-10T22:36:00.636388111Z
custom_metadata    <nil>
deletion_time      n/a
destroyed          false
version            1
```

- Lastly, using either token, retrieve the stored secret:

```bash
sudo -E vault kv get secret/secret1
```

This will display

```bash
=== Secret Path ===
secret/data/secret1

======= Metadata =======
Key                Value
---                -----
created_time       2023-10-10T22:36:00.636388111Z
custom_metadata    <nil>
deletion_time      n/a
destroyed          false
version            1

====== Data ======
Key         Value
---         -----
password    3aZ0uA
user        user1
```

## Kubernetes Authentication Method with Vault

The process of enabling Kubernetes authentication with Vault allows Pods within Kubernetes to authenticate with Vault using a Service Account Token. This authentication method facilitates secure token provision to Pods, simplifying secret management within Kubernetes clusters.

- Create **`vault`** Namespace

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml create namespace vault
```

- Create the service account **`vault-auth`** which will be used by Vault for Kubernetes authentication in **`vault-auth-service-account.yaml`**.

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: vault-auth
  namespace: vault
```

- Apply the configuration

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f vault-auth-service-account.yaml
```

- Vault's Kubernetes authentication method requires access to the Kubernetes TokenReview API. This step involves granting the **`vault-auth`** service account the necessary permissions. Save the following as **`vault-auth-clusterrolebinding.yaml`**

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: role-tokenreview-binding
  namespace: vault
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: system:auth-delegator
subjects:
  - kind: ServiceAccount
    name: vault-auth
    namespace: vault
```

- Apply the configuration

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f vault-auth-clusterrolebinding.yaml
```

- Create a Long-Lived Token for the Service Account. For Kubernetes v1.24 and above, where secrets containing long-lived tokens for service accounts are not automatically created, you need to manually create one. Save the following as **`vault-auth-secret.yaml`**

```yaml
apiVersion: v1
kind: Secret
type: kubernetes.io/service-account-token
metadata:
  name: vault-auth-secret
  namespace: vault
  annotations:
    kubernetes.io/service-account.name: vault-auth
```

- Apply the configuration

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f vault-auth-secret.yaml
```

- Retrieve the Service Account Token

```bash
KUBERNETES_SA_SECRET_NAME=$(kubectl --kubeconfig=/home/pi/.kube/config.yaml get secrets --output=json -n vault | jq -r '.items[].metadata | select(.name|startswith("vault-auth")).name')
TOKEN_REVIEW_JWT=$(kubectl --kubeconfig=/home/pi/.kube/config.yaml get secret $KUBERNETES_SA_SECRET_NAME -n vault -o jsonpath='{.data.token}' | base64 --decode)
```

- Obtain Kubernetes CA Certificate and API URL

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml config view --raw --minify --flatten --output='jsonpath={.clusters[].cluster.certificate-authority-data}' | base64 --decode > k3s_ca.crt
KUBERNETES_HOST=$(kubectl --kubeconfig=/home/pi/.kube/config.yaml config view -o jsonpath='{.clusters[].cluster.server}')
```

- Enable Kubernetes Authentication Method in Vault

```bash
sudo -E vault auth enable kubernetes
```

- Vault API can be also used

```bash
curl -k --header "X-Vault-Token:$VAULT_TOKEN" --request POST\
  --data '{"type":"kubernetes","description":"kubernetes auth"}' \
  https://vault.picluster.homelab.com:8200/v1/sys/auth/kubernetes
```

- Configure Vault to authenticate Kubernetes Pods using the retrieved Service Account token and Kubernetes API details

```bash
sudo -E vault write auth/kubernetes/config \
  token_reviewer_jwt="${TOKEN_REVIEW_JWT}" \
  kubernetes_host="${KUBERNETES_HOST}" \
  kubernetes_ca_cert=@k3s_ca.crt \
  disable_iss_validation=true
```

- Vault API can be also used

```bash
KUBERNETES_CA_CERT=$(kubectl --kubeconfig=/home/pi/.kube/config.yaml config view --raw --minify --flatten --output='jsonpath={.clusters[].cluster.certificate-authority-data}' | base64 --decode | awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}')

curl --cacert /etc/vault/tls/vault_ca.pem --header "X-Vault-Token:$VAULT_TOKEN" --request POST --data '{"kubernetes_host": "'"$KUBERNETES_HOST"'", "kubernetes_ca_cert":"'"$KUBERNETES_CA_CERT"'", "token_reviewer_jwt":"'"$TOKEN_REVIEW_JWT"'"}' https://vault.picluster.homemlab.com:8200/v1/auth/kubernetes/config
```

## Installing the External Secrets Operator

The **`External Secrets Operator`** enables secure and automated management of secrets in Kubernetes environments by integrating with external secret management systems like HashiCorp Vault. This guide outlines the steps for installing the External Secrets Operator via Helm, configuring it to work with Vault, and verifying its operation.

- Add the External Secrets Helm Repository

```bash
helm repo add external-secrets https://charts.external-secrets.io
```

- Update Helm Repository

```bash
helm repo update
```

- Create a Namespace for the External Secrets Operator

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml create namespace external-secrets
```

- Install the External Secrets Operator into the previously created namespace, enabling the installation of Custom Resource Definitions (CRDs)

```bash
helm --kubeconfig=/home/pi/.kube/config.yaml install external-secrets external-secrets/external-secrets -n external-secrets --set installCRDs=true
```

- Configure Vault Role specifically for the External Secrets Operator, assigning a read-only policy and a 24-hour TTL. This role binds to the external-secrets service account within the same namespace

```bash
sudo -E vault write auth/kubernetes/role/external-secrets \
  bound_service_account_names=external-secrets \
  bound_service_account_namespaces=external-secrets \
  policies=readonly \
  ttl=24h
```

- Alternatively, you can use the Vault API

```bash
curl -k --header "X-Vault-Token:$VAULT_TOKEN" --request POST \
  --data '{ "bound_service_account_names": "external-secrets", "bound_service_account_namespaces": "external-secrets", "policies": ["readonly"], "ttl" : "24h"}' \
  https://vault.picluster.homemlab.com:8200/v1/auth/kubernetes/role/external-secrets
```

- Create a ClusterSecretStore resource, named **`vault-cluster-secret-store.yaml`**, to define how the External Secrets Operator should connect to Vault

**For the Custom CA scenario**:

```yaml
cat <<EOF > vault-cluster-secret-store.yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: vault-backend
  namespace: external-secrets
spec:
  provider:
    vault:
      server: "https://vault.picluster.quantfinancehub.com:8200"
      caBundle: $(sudo cat /etc/vault/tls/vault-ca.crt | base64 | tr -d "\n")
      path: "secret"
      version: "v2"
      auth:
        kubernetes:
          mountPath: "kubernetes"
          role: "external-secrets"
EOF
```

Where **`<vault-custom-ca>`** can be retrieve

```bash
sudo cat /etc/vault/tls/vault-ca.crt | base64 | tr -d "\n"
```

**For the Cloudflare with Let's Encrypt scenario**:

```yaml
cat <<EOF > vault-cluster-secret-store.yaml
apiVersion: external-secrets.io/v1beta1
kind: ClusterSecretStore
metadata:
  name: vault-backend
  namespace: external-secrets
spec:
  provider:
    vault:
      server: "https://vault.picluster.quantfinancehub.com:8200"
      caBundle: $(sudo cat /etc/letsencrypt/live/vault.picluster.quantfinancehub.com/fullchain.pem | base64 | tr -d "\n")
      path: "secret"
      version: "v2"
      auth:
        kubernetes:
          mountPath: "kubernetes"
          role: "external-secrets"
EOF
```

- Apply the manifest

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f vault-cluster-secret-store.yaml
```

- Verify the ClusterSecretStore status

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml get clustersecretstore -n external-secrets
```

- Define an ExternalSecret resource, named **`vault-example-externalsecret.yaml`**, to manage the syncing of secrets from Vault to Kubernetes

```yaml
# Define the API version and kind of resource. This specifies the version of the ExternalSecrets API 
# and indicates that the resource is an ExternalSecret.
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret

# Metadata section is used to define the name and other information about the resource.
metadata:
  name: vault-example # The name of the ExternalSecret. This name is used within Kubernetes to identify this specific secret.

# The spec section contains the details about how the ExternalSecret should behave.
spec:

  # secretStoreRef specifies the reference to the SecretStore that holds information on how to access the secret backend.
  secretStoreRef:
    name: vault-backend # The name of the SecretStore or ClusterSecretStore resource that contains access information to the backend where the actual secrets are stored.
    kind: ClusterSecretStore # The kind of secret store. Here, it's a ClusterSecretStore, which means it's accessible across the entire Kubernetes cluster.

  # target specifies where and how the secret should be created within the Kubernetes cluster.
  target:
    name: mysecret # The name of the Kubernetes Secret that will be created or updated with the values fetched from the secret backend.

  # data is a list where each item specifies a particular secret data to be fetched and its mapping to the Kubernetes Secret.
  data:
    # First item in the data list
    - secretKey: password # The key under which the fetched secret value will be stored in the Kubernetes Secret.
      remoteRef:
        key: secret1 # The identifier for the secret in the secret backend. This is like the path or name of the secret in Vault.
        property: password # The specific field in the secret backend's secret to fetch. Here, it specifies that we want the 'password' field from 'secret1'.

    # Second item in the data list
    - secretKey: user # Another key for the Kubernetes Secret, under which another piece of fetched secret will be stored.
      remoteRef:
        key: secret1 # Again, specifying the same secret in the backend as above, but this time we will fetch a different field.
        property: user # Specifies that we want the 'user' field from 'secret1' in the secret backend.

# This YAML file creates or updates a Kubernetes Secret named 'mysecret' with 'password' and 'user' fields,
# fetched from a secret named 'secret1' in a Vault instance, as specified in the 'vault-backend' ClusterSecretStore.
```

- Apply the manifest

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml apply -f vault-example-externalsecret.yaml
```

- Check the **ExternalSecret`** status

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml get externalsecret -n 
```

- Confirm that the secret has been successfully synced to Kubernetes

```bash
kubectl --kubeconfig=/home/pi/.kube/config.yaml get secret mysecret -o yaml
```
