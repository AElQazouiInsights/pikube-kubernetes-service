# Enhanced TLS Certificate Guide for PiKube External Services
**Comprehensive Guide for Minio & Vault SSL/TLS Certificates**
**Date:** 2025-11-06

---

## 🔐 Certificate Strategy Overview

This guide covers two approaches for securing external services with TLS certificates:

### **Option 1: Self-Signed Certificates with Custom CA**
**Use When:** You don't have a registered domain name
**Pros:** Free, works offline, full control
**Cons:** Browser warnings, manual trust configuration on clients
**Best For:** Development, testing, isolated networks

### **Option 2: Let's Encrypt with Cloudflare DNS** ✅ **RECOMMENDED**
**Use When:** You have a registered domain (e.g., quantfinancehub.com)
**Pros:** Trusted by all browsers, automatic renewal, no warnings
**Cons:** Requires domain ownership, internet connectivity
**Best For:** Production environments, external access

---

## 📋 Prerequisites

### For Self-Signed Certificates:
```bash
# Install OpenSSL (usually pre-installed)
sudo apt install openssl -y
```

### For Let's Encrypt with Cloudflare:
```bash
# Install Certbot and Cloudflare DNS plugin
sudo apt install certbot python3-certbot-dns-cloudflare -y
```

**Cloudflare Requirements:**
1. Domain registered and using Cloudflare nameservers
2. Cloudflare API token with DNS edit permissions
3. DNS A records pointing to your services

---

## 🔧 Option 1: Self-Signed Certificates (No Domain Required)

### Step 1: Create a Self-Signed Root CA

This CA will be used to sign certificates for all your services:

```bash
# Generate Root CA private key and certificate
openssl req -x509 \
       -sha256 \
       -nodes \
       -newkey rsa:4096 \
       -days 3650 \
       -subj "/CN=QuantFinanceHub CA/O=QuantFinanceHub/C=GB" \
       -keyout rootCA.key \
       -out rootCA.crt

# Secure the CA private key
chmod 600 rootCA.key
```

### Step 2: Generate Service Certificate

**For Minio (s3.quantfinancehub.com):**

```bash
# Create certificate signing request (CSR)
openssl req -new -nodes -newkey rsa:4096 \
            -keyout minio.key \
            -out minio.csr \
            -batch \
            -subj "/C=GB/ST=London/L=London/O=QuantFinanceHub/OU=PiKube/CN=s3.quantfinancehub.com"

# Sign the certificate with our CA
# Include both DNS and IP addresses for flexibility
openssl x509 -req -days 3650 -set_serial 01 \
      -extfile <(printf "subjectAltName=DNS:s3.quantfinancehub.com,DNS:s3,IP:10.0.0.10") \
      -in minio.csr \
      -out minio.crt \
      -CA rootCA.crt \
      -CAkey rootCA.key

# Clean up CSR
rm minio.csr
```

**For Vault (vault.picluster.quantfinancehub.com):**

```bash
# Create certificate signing request (CSR)
openssl req -new -nodes -newkey rsa:4096 \
            -keyout vault.key \
            -out vault.csr \
            -batch \
            -subj "/C=GB/ST=London/L=London/O=QuantFinanceHub/OU=PiKube/CN=vault.picluster.quantfinancehub.com"

# Sign the certificate with our CA
# Include DNS, IP, and localhost for flexibility
openssl x509 -req -days 3650 -set_serial 02 \
      -extfile <(printf "subjectAltName=DNS:vault.picluster.quantfinancehub.com,DNS:vault,IP:127.0.0.1,IP:10.0.0.1") \
      -in vault.csr \
      -out vault.crt \
      -CA rootCA.crt \
      -CAkey rootCA.key

# Clean up CSR
rm vault.csr
```

### Step 3: Install Self-Signed Certificates

**For Minio:**

```bash
# Install on blueberry-master (10.0.0.10)
sudo cp minio.crt /etc/minio/ssl/public.crt
sudo cp minio.key /etc/minio/ssl/private.key
sudo chown minio:minio /etc/minio/ssl/{public.crt,private.key}
sudo chmod 600 /etc/minio/ssl/{public.crt,private.key}

# Restart Minio
sudo systemctl restart minio
```

**For Vault:**

```bash
# Install on gateway (192.168.0.10)
sudo mkdir -p /etc/vault/tls
sudo cp vault.crt /etc/vault/tls/public.crt
sudo cp vault.key /etc/vault/tls/vault.key
sudo cp rootCA.crt /etc/vault/tls/vault-ca.crt
sudo chown vault:vault /etc/vault/tls/{public.crt,vault.key,vault-ca.crt}
sudo chmod 600 /etc/vault/tls/{public.crt,vault.key}

# Restart Vault
sudo systemctl restart vault
```

### Step 4: Trust the CA on Client Machines

**On Linux (Ubuntu/Debian):**

```bash
# Copy the root CA to trusted certificates
sudo cp rootCA.crt /usr/local/share/ca-certificates/quantfinancehub-ca.crt
sudo update-ca-certificates

# Verify
sudo openssl verify -CAfile /etc/ssl/certs/ca-certificates.crt /etc/minio/ssl/public.crt
```

**On macOS:**

```bash
# Add to system keychain
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain rootCA.crt
```

**On Windows:**

```powershell
# Import to Trusted Root Certification Authorities
certutil -addstore -f "ROOT" rootCA.crt
```

---

## 🌐 Option 2: Let's Encrypt with Cloudflare DNS-01 ✅ **RECOMMENDED**

### Why Cloudflare DNS-01 Challenge?

- **Works Behind Firewall:** No need to expose ports 80/443 to the internet
- **Wildcard Support:** Can issue wildcard certificates
- **Internal Services:** Perfect for services on private networks (10.0.0.0/24)
- **Automated:** Fully automated with certbot

### Step 1: Obtain Cloudflare API Token

1. Log in to Cloudflare Dashboard
2. Go to **My Profile** → **API Tokens**
3. Click **Create Token**
4. Use template: **Edit zone DNS**
5. Permissions:
   - **Zone** → **DNS** → **Edit**
6. Zone Resources:
   - **Include** → **Specific zone** → **quantfinancehub.com**
7. Create token and **copy it immediately**

### Step 2: Configure Cloudflare Credentials

```bash
# Create secure directory for credentials
sudo mkdir -p /root/.secrets/
sudo chmod 0700 /root/.secrets/

# Create credentials file
sudo nano /root/.secrets/cloudflare.ini

# Add your API token:
dns_cloudflare_api_token = your-cloudflare-api-token-here

# Secure the file (IMPORTANT!)
sudo chmod 0400 /root/.secrets/cloudflare.ini
```

### Step 3: Request Certificates from Let's Encrypt

**For Minio (s3.quantfinancehub.com):**

```bash
# Request certificate using DNS-01 challenge
sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
  -d s3.quantfinancehub.com \
  --preferred-challenges dns-01 \
  --agree-tos \
  --email your-email@domain.com \
  --non-interactive

# Certificate will be saved to:
# /etc/letsencrypt/live/s3.quantfinancehub.com/fullchain.pem
# /etc/letsencrypt/live/s3.quantfinancehub.com/privkey.pem
```

**For Vault (vault.picluster.quantfinancehub.com):**

```bash
# Request certificate using DNS-01 challenge
sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
  -d vault.picluster.quantfinancehub.com \
  --preferred-challenges dns-01 \
  --agree-tos \
  --email your-email@domain.com \
  --non-interactive

# Certificate will be saved to:
# /etc/letsencrypt/live/vault.picluster.quantfinancehub.com/fullchain.pem
# /etc/letsencrypt/live/vault.picluster.quantfinancehub.com/privkey.pem
```

### Step 4: Configure Service to Use Let's Encrypt Certificates

**For Minio:**

Update `/etc/minio/minio.conf`:

```bash
# Minio will look for certificates in /etc/minio/ssl/
# Create symlinks to Let's Encrypt certificates
sudo ln -sf /etc/letsencrypt/live/s3.quantfinancehub.com/fullchain.pem /etc/minio/ssl/public.crt
sudo ln -sf /etc/letsencrypt/live/s3.quantfinancehub.com/privkey.pem /etc/minio/ssl/private.key

# Set ownership (Minio needs to read these)
sudo chown -h minio:minio /etc/minio/ssl/{public.crt,private.key}

# Restart Minio
sudo systemctl restart minio
```

**For Vault:**

Update `/etc/vault/vault_main.hcl`:

```hcl
listener "tcp" {
  address = "0.0.0.0:8200"
  tls_cert_file = "/etc/letsencrypt/live/vault.picluster.quantfinancehub.com/fullchain.pem"
  tls_key_file = "/etc/letsencrypt/live/vault.picluster.quantfinancehub.com/privkey.pem"
  tls_disable_client_certs = true
}
```

**Give Vault access to Let's Encrypt certificates:**

```bash
# Vault user needs read access to Let's Encrypt directories
sudo chown -R root:vault /etc/letsencrypt
sudo chmod -R 755 /etc/letsencrypt
sudo chmod -R 750 /etc/letsencrypt/live
sudo chmod -R 750 /etc/letsencrypt/archive

# Restart Vault
sudo systemctl restart vault
```

---

## 🔄 Automatic Certificate Renewal

### Understanding Certbot Auto-Renewal

Let's Encrypt certificates are valid for **90 days**. Certbot automatically renews certificates when they have **30 days or less** remaining.

### Renewal Methods Comparison

| Method | Frequency | Reliability | Setup Complexity | Recommended |
|--------|-----------|-------------|------------------|-------------|
| **Systemd Timer** | Twice daily | ⭐⭐⭐⭐⭐ | Low | ✅ **YES** |
| **Cron Job** | Daily | ⭐⭐⭐⭐ | Low | Alternative |
| **Manual** | On-demand | ⭐⭐ | None | ❌ No |

### Method 1: Systemd Timer ✅ **RECOMMENDED** (Default on Ubuntu)

Certbot installs a systemd timer by default that runs twice daily.

**Check Timer Status:**

```bash
# View timer schedule
systemctl list-timers certbot.timer

# Check timer configuration
systemctl cat certbot.timer

# View service configuration
systemctl cat certbot.service

# Check last renewal attempt
sudo journalctl -u certbot.service -n 50
```

**Default Timer Configuration:**
```ini
[Timer]
OnCalendar=*-*-* 00,12:00:00
RandomizedDelaySec=43200
Persistent=true
```

This runs at 00:00 and 12:00 daily with a random delay up to 12 hours.

**Verify Timer is Enabled:**

```bash
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
sudo systemctl status certbot.timer
```

### Method 2: Cron Job (Alternative)

If you prefer cron over systemd timers:

```bash
# Edit root crontab
sudo crontab -e

# Add this line to run twice daily at random times
0 0,12 * * * /usr/bin/certbot renew --quiet --random-delay-on-renew
```

Or for a single daily run:

```bash
# Run at 3:30 AM daily
30 3 * * * /usr/bin/certbot renew --quiet
```

**⚠️ Important:** If using cron, disable the systemd timer to avoid conflicts:

```bash
sudo systemctl disable certbot.timer
sudo systemctl stop certbot.timer
```

### Testing Auto-Renewal

**Dry Run Test (Recommended):**

```bash
# Test renewal without actually renewing
sudo certbot renew --dry-run

# Test specific certificate
sudo certbot renew --cert-name vault.picluster.quantfinancehub.com --dry-run
```

**Force Renewal (for testing hooks):**

```bash
# Force renew even if not due
sudo certbot renew --cert-name vault.picluster.quantfinancehub.com --force-renewal
```

---

## 🔗 Post-Renewal Hooks

After certificates renew, services need to be reloaded/restarted to use the new certificates.

### Renewal Hook Types

Certbot supports three hook types:

1. **pre-hook**: Runs before any renewal attempt
2. **post-hook**: Runs after successful renewal
3. **deploy-hook**: Runs only if certificate was actually renewed

**Deploy hooks are RECOMMENDED** as they only run when necessary.

### Create Renewal Hooks Directory Structure

```bash
sudo mkdir -p /etc/letsencrypt/renewal-hooks/pre
sudo mkdir -p /etc/letsencrypt/renewal-hooks/post
sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
```

### Minio Renewal Hook

Create `/etc/letsencrypt/renewal-hooks/deploy/minio-restart.sh`:

```bash
#!/bin/bash
# Minio Certificate Renewal Hook
# Runs only when s3.quantfinancehub.com certificate is renewed

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a /var/log/certbot-hooks.log
}

# Check if this renewal is for the Minio certificate
if [ "$RENEWED_LINEAGE" = "/etc/letsencrypt/live/s3.quantfinancehub.com" ]; then
    log "Minio certificate renewed. Restarting Minio service..."

    # Restart Minio service (runs on blueberry-master, 10.0.0.10)
    # Use SSH if running from gateway, or direct systemctl if on same host
    if [ "$(hostname)" = "gateway" ]; then
        ssh -i /home/pi/.ssh/gateway-pi pi@10.0.0.10 'sudo systemctl restart minio'
        log "Minio service restart command sent to 10.0.0.10"
    else
        systemctl restart minio
        log "Minio service restarted locally"
    fi

    log "Minio certificate renewal complete"
else
    log "Skipping Minio restart (certificate not for s3.quantfinancehub.com)"
fi
```

**Make it executable:**

```bash
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/minio-restart.sh
```

### Vault Renewal Hook

Create `/etc/letsencrypt/renewal-hooks/deploy/vault-restart.sh`:

```bash
#!/bin/bash
# Vault Certificate Renewal Hook
# Runs only when vault.picluster.quantfinancehub.com certificate is renewed

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a /var/log/certbot-hooks.log
}

# Check if this renewal is for the Vault certificate
if [ "$RENEWED_LINEAGE" = "/etc/letsencrypt/live/vault.picluster.quantfinancehub.com" ]; then
    log "Vault certificate renewed. Restarting Vault service..."

    # Restart Vault service (runs on gateway)
    systemctl restart vault

    # Wait for Vault to start
    sleep 5

    # Run unseal script
    log "Running Vault unseal script..."
    sudo -u vault /etc/vault/vault-unseal.sh >> /var/log/certbot-hooks.log 2>&1

    log "Vault certificate renewal and unseal complete"
else
    log "Skipping Vault restart (certificate not for vault.picluster.quantfinancehub.com)"
fi
```

**Make it executable:**

```bash
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/vault-restart.sh
```

### Universal Renewal Hook (Alternative)

If you prefer a single hook for all services:

Create `/etc/letsencrypt/renewal-hooks/deploy/restart-services.sh`:

```bash
#!/bin/bash
# Universal Certificate Renewal Hook
# Restarts services based on which certificate was renewed

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a /var/log/certbot-hooks.log
}

log "Certificate renewed: $RENEWED_LINEAGE"
log "Domains: $RENEWED_DOMAINS"

# Restart services based on certificate renewed
case "$RENEWED_LINEAGE" in
    */s3.quantfinancehub.com)
        log "Restarting Minio..."
        if [ "$(hostname)" = "gateway" ]; then
            ssh -i /home/pi/.ssh/gateway-pi pi@10.0.0.10 'sudo systemctl restart minio'
        else
            systemctl restart minio
        fi
        ;;

    */vault.picluster.quantfinancehub.com)
        log "Restarting Vault..."
        systemctl restart vault
        sleep 5
        sudo -u vault /etc/vault/vault-unseal.sh >> /var/log/certbot-hooks.log 2>&1
        ;;

    *)
        log "No specific service restart configured for this certificate"
        ;;
esac

log "Hook execution complete"
```

### Test Renewal Hooks

```bash
# Test hooks with dry run
sudo certbot renew --dry-run

# Test specific certificate renewal (forces renewal)
sudo certbot renew --cert-name vault.picluster.quantfinancehub.com --force-renewal

# Check hook logs
sudo tail -f /var/log/certbot-hooks.log
```

---

## 📊 Certificate Monitoring

### Check Certificate Expiry

**For Minio:**

```bash
# Check certificate expiry date
sudo openssl x509 -in /etc/letsencrypt/live/s3.quantfinancehub.com/fullchain.pem -noout -dates

# Check certificate details
sudo openssl x509 -in /etc/letsencrypt/live/s3.quantfinancehub.com/fullchain.pem -noout -text
```

**For Vault:**

```bash
# Check certificate expiry date
sudo openssl x509 -in /etc/letsencrypt/live/vault.picluster.quantfinancehub.com/fullchain.pem -noout -dates

# Via Vault API
curl -sk https://10.0.0.1:8200/v1/sys/health | jq .
```

### List All Certificates

```bash
# List all certbot-managed certificates
sudo certbot certificates

# Detailed output
sudo certbot certificates --debug
```

### Certificate Expiry Monitoring Script

Create `/usr/local/bin/check-cert-expiry.sh`:

```bash
#!/bin/bash
# Certificate Expiry Monitoring Script
# Alerts when certificates are expiring soon

WARN_DAYS=30
CRIT_DAYS=7

check_cert() {
    local cert_path=$1
    local cert_name=$2

    if [ ! -f "$cert_path" ]; then
        echo "❌ Certificate not found: $cert_name ($cert_path)"
        return
    fi

    # Get expiry date
    expiry_date=$(openssl x509 -in "$cert_path" -noout -enddate | cut -d= -f2)
    expiry_epoch=$(date -d "$expiry_date" +%s)
    current_epoch=$(date +%s)
    days_left=$(( ($expiry_epoch - $current_epoch) / 86400 ))

    # Status
    if [ $days_left -lt $CRIT_DAYS ]; then
        echo "🚨 CRITICAL: $cert_name expires in $days_left days!"
    elif [ $days_left -lt $WARN_DAYS ]; then
        echo "⚠️  WARNING: $cert_name expires in $days_left days"
    else
        echo "✅ OK: $cert_name valid for $days_left days"
    fi
}

echo "=== Certificate Expiry Check - $(date) ==="
check_cert "/etc/letsencrypt/live/vault.picluster.quantfinancehub.com/fullchain.pem" "Vault"
check_cert "/etc/letsencrypt/live/s3.quantfinancehub.com/fullchain.pem" "Minio/S3"
```

**Make executable and run weekly:**

```bash
sudo chmod +x /usr/local/bin/check-cert-expiry.sh

# Add to crontab (runs every Monday at 9 AM)
sudo crontab -e
0 9 * * 1 /usr/local/bin/check-cert-expiry.sh | mail -s "Certificate Expiry Report" admin@example.com
```

---

## 🔧 Troubleshooting

### Common Issues

#### Issue 1: Certbot Renewal Failed

**Check logs:**

```bash
sudo journalctl -u certbot -n 100
sudo tail -100 /var/log/letsencrypt/letsencrypt.log
```

**Common causes:**
- Cloudflare API token expired or invalid
- DNS propagation timeout
- Rate limits hit (5 renewals per week)

**Solution:**

```bash
# Test renewal manually
sudo certbot renew --dry-run --verbose

# Check Cloudflare credentials
sudo cat /root/.secrets/cloudflare.ini
```

#### Issue 2: Service Not Using New Certificate

**Symptoms:** Certificate renewed but service still uses old cert

**Solution:**

```bash
# Check if renewal hook ran
sudo journalctl -u certbot -n 50 | grep -i hook

# Manually restart service
sudo systemctl restart minio  # or vault

# Verify new certificate loaded
openssl s_client -connect 10.0.0.10:9091 -servername s3.quantfinancehub.com < /dev/null 2>/dev/null | openssl x509 -noout -dates
```

#### Issue 3: Permission Denied Errors

**Symptoms:** Service can't read certificate files

**Solution:**

```bash
# For Vault
sudo chown -R root:vault /etc/letsencrypt
sudo chmod -R 755 /etc/letsencrypt
sudo chmod -R 750 /etc/letsencrypt/live
sudo chmod -R 750 /etc/letsencrypt/archive

# For Minio (if using symlinks)
sudo chown -h minio:minio /etc/minio/ssl/*
```

#### Issue 4: Vault Sealed After Restart

**Symptoms:** Vault sealed after certificate renewal

**Solution:**

Ensure the renewal hook includes the unseal step:

```bash
# Check vault-unseal service
systemctl status vault-unseal

# Check unseal log
sudo tail -20 /var/log/vault/vault-unseal.log

# Manually unseal
sudo systemctl start vault-unseal
```

---

## 📋 Quick Reference

### Certificate Locations

**Let's Encrypt:**
```
Certificates: /etc/letsencrypt/live/<domain>/
- fullchain.pem (certificate + chain)
- privkey.pem (private key)
- cert.pem (certificate only)
- chain.pem (chain only)

Archives: /etc/letsencrypt/archive/<domain>/
Renewal Configs: /etc/letsencrypt/renewal/<domain>.conf
```

**Minio:**
```
Config: /etc/minio/minio.conf
Certificates: /etc/minio/ssl/
- public.crt
- private.key
```

**Vault:**
```
Config: /etc/vault/vault_main.hcl
Certificates: Referenced directly from /etc/letsencrypt/live/
```

### Useful Commands

```bash
# List certificates
sudo certbot certificates

# Renew all certificates
sudo certbot renew

# Renew specific certificate
sudo certbot renew --cert-name vault.picluster.quantfinancehub.com

# Test renewal (dry run)
sudo certbot renew --dry-run

# Force renewal
sudo certbot renew --force-renewal

# Delete certificate
sudo certbot delete --cert-name vault.picluster.quantfinancehub.com

# View certbot logs
sudo journalctl -u certbot -f
sudo tail -f /var/log/letsencrypt/letsencrypt.log
```

---

## ✅ Best Practices

1. **Always use Let's Encrypt for production** if you have a domain
2. **Enable systemd timer** for automatic renewals (default on Ubuntu)
3. **Set up renewal hooks** to restart services after renewal
4. **Monitor certificate expiry** with automated scripts
5. **Test renewals regularly** with `--dry-run`
6. **Backup unseal keys** for Vault (`/etc/vault/unseal.json`)
7. **Keep Cloudflare API token secure** (chmod 400)
8. **Use DNS-01 challenge** for internal services (no port forwarding needed)
9. **Document your setup** for future reference
10. **Set up email notifications** for renewal failures

---

**Last Updated:** 2025-11-06
**Status:** ✅ Production Ready
**Auto-Renewal:** ✅ Enabled (Systemd Timer)
