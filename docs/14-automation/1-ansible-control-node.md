---
title: Ansible Control Node
permalink: /docs/14-automation/ansible-controle-node
description: Configuring an Ansible Control Node for our Raspberry Pi Kubernetes Cluster. The control node automates cluster configuration tasks using Ansible. Instructions include setting up the control node using a Docker container running on a Linux server, VM, or Windows Subsystem for Linux (WSL).
last_modified_at: "14-01-2025"
---

This guide explains how to configure an Ansible Control Node for automating the setup and management of our PiKube Kubernetes Service. The control node, named `pikube-controller`, orchestrates configuration tasks using Ansible. You can set up the control node on a `Linux server`, a `VirtualBox VM`, or directly on your Windows laptop using `Windows Subsystem for Linux (WSL)`.

## Choosing Your Control Node Environment

You have multiple options for setting up your Ansible Control Node (`pikube-controller`):

- **Windows Subsystem for Linux (WSL)**:
  - Ideal for users on Windows who prefer a native Linux environment without the overhead of a virtual machine.

- **Ubuntu Desktop**:
  - Suitable for users running Ubuntu on their desktop machines.

- **VirtualBox VM**:
  - Provides an isolated environment, beneficial for testing and development.

- **Linux Server**:
  - Best for dedicated environments where resources are allocated specifically for Ansible tasks.

> [!NOTE]
> This guide primarily focuses on setting up the control node using WSL, but instructions can be adapted for other environments as needed.

## Installing Ansible Runtime Environment

The Ansible Runtime Environment (`ansible-runner`) is encapsulated within a Docker container, ensuring consistency and ease of management.

### Installing Docker

Following the official [documentation](https://docs.docker.com/engine/install/ubuntu/).

- Uninstall old versions of docker

```bash
sudo apt-get remove docker docker-engine docker.io containerd runc
```

- Update package index and install prerequisites

```bash
sudo apt-get update && sudo apt-get install \
  apt-transport-https \
  ca-certificates \
  curl \
  gnupg \
  lsb-release -y
```

- Add Docker’s Official GPG Key

```bash
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
```

- Set up the stable repository

```bash
echo \
  "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

- Install docker engine

```bash
sudo apt-get update && sudo apt-get install docker-ce docker-ce-cli containerd.io -y
```

- Manage docker as a non-root user

  - Create docker group

    ```bash
    sudo groupadd docker
    ```

  - Add your user to docker group

    ```bash
    sudo usermod -aG docker $USER
    ```

  - Apply group changes by login out and back in to apply the group membership changes

- Enable docker to start on boot

```bash
sudo systemctl enable docker.service
sudo systemctl enable containerd.service
```

- Configure docker daemon

  - Edit file `/etc/docker/daemon.json`

    ```json
    {
        "exec-opts": ["native.cgroupdriver=systemd"],
        "log-driver": "json-file",
        "log-opts": {
        "max-size": "100m"
        },
        "storage-driver": "overlay2",
        "data-root": "/data/docker"  
    }
    ```	

    - **Parameters**:
      - `exec-opts`: Sets the cgroup driver to `systemd` for better integration with Kubernetes.
      - `log-driver`: Configures Docker to use the `json-file` logging driver with a maximum log size.
      - `storage-driver`: Uses `overlay2` for improved performance.
      - `data-root`: (Optional) Changes the default storage directory to `/data/docker`.
      - Refer to the [**`documentation`**](https://docs.docker.com/engine/reference/commandline/dockerd/#daemon-configuration-file) for all possible options.

  - Restart docker

    ```bash
    sudo systemctl restart docker
    ```

### Installing Docker Compose

Docker Compose simplifies the management of multi-container Docker applications.

- Check latest version by visiting the [**`Docker Compose Releases`**](https://github.com/docker/compose/releases) page to identify the latest version. Replace `v2.32.3` with the latest version if different.

- Download docker compose binary
  
```bash
sudo curl -L "https://github.com/docker/compose/releases/download/v2.32.3/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
```

- Apply executable permissions

```bash
sudo chmod +x /usr/local/bin/docker-compose
```

- Verify installation

  ```bash
  docker-compose --version
  ```

### Creating the Ansible-Runner Docker Environment

The Ansible-Runner environment encapsulates all necessary tools and dependencies for executing Ansible playbooks.

### Directory Structure

Ensure your project has the following directory and file structure:

```init
📁
├── 📁 ansible-runner
│   ├── 📁 build
│   │   ├── requirements.txt
│   │   └── requirements.yaml
│   │   └── ansible_runner_setup.yaml
│   ├── 📁 certbot
│   │   ├── 📁 config
│   │   ├── 📁 log
│   │   └── 📁 work
│   ├── docker-compose.yaml
│   ├── Dockerfile
│   └── 📁 runner
│       ├── 📁 .ssh
│       ├── 📁 .vault
│       ├── 📁 .gnugp
│       └── 📁 scripts
│           ├── generate_gpg_key.sh
│           └── generate_vault_password.sh
├──📁 ansible
    ├── ansible.cfg
    ├── inventory.yaml
    ├── 📁 roles 
```

- `ansible-runner` directory:
  - Contains Docker image building and running files.
  - Hosts directories mounted as volumes when running the Docker container.

- `ansible` directory:
  - Follows a typical Ansible project structure with configurations, inventories, and roles.

### Building the Ansible-Runner Docker Image

- Navigate to the `ansible-runner` directory

```bash
cd ansible-runner
```

- The `Dockerfile` sets up the Ansible environment with necessary dependencies.

```dockerfile
FROM ghcr.io/helmfile/helmfile:v0.167.1 AS helmfile

FROM python:3.10-slim

ARG ANSIBLE_GALAXY_CLI_COLLECTION_OPTS=--ignore-certs
ARG ANSIBLE_GALAXY_CLI_ROLE_OPTS=--ignore-certs

# Install system dependencies
RUN apt-get update -qq && \
    apt-get install -y sudo git apt-utils python3-pip pwgen gnupg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Upgrade pip and install Ansible
RUN pip3 install --upgrade pip setuptools
RUN pip3 install ansible-core ansible-runner certbot

# Add and install Python dependencies
ADD build /build
WORKDIR /build
RUN pip3 install -r requirements.txt

# Install Ansible roles and collections
RUN ansible-galaxy role install $ANSIBLE_GALAXY_CLI_ROLE_OPTS -r requirements.yaml --roles-path "/usr/share/ansible/roles"
RUN ANSIBLE_GALAXY_DISABLE_GPG_VERIFY=1 ansible-galaxy collection install $ANSIBLE_GALAXY_CLI_COLLECTION_OPTS -r requirements.yaml --collections-path "/usr/share/ansible/collections"

# Configure Ansible Runner
RUN ansible-playbook ansible_runner_setup.yaml

# Copy helmfile binary
COPY --from=helmfile /usr/local/bin/helmfile /usr/local/bin/helmfile

ENV USER runner
ENV FOLDER /home/runner

# Create a non-root user
RUN groupadd $USER && \
    useradd $USER -m -d $FOLDER -g $USER -s /bin/bash && \
    echo $USER 'ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

# Create necessary directories with proper permissions
RUN for dir in \
      /runner \
      /var/lib/letsencrypt \
      /etc/letsencrypt \
      /var/log/letsencrypt ; \
    do mkdir -p $dir && chown $USER:$USER $dir && chmod 775 $dir; done

# Switch to non-root user
USER $USER

# Set environment variable for GPG
RUN echo "export GPG_TTY=$(tty)" >> /home/runner/.bashrc

WORKDIR /runner
```

> [!NOTE]
> **Key Components**:
>
> - **Base Images**:
>   - `helmfile`: For managing Helm charts.
>   - `python:3.10-slim`: Lightweight Python environment.
> - **Installed Packages**:
>   - **System Dependencies**: `sudo`, `git`, `pip`, `pwgen`, `gnupg`.
>   - **Python Packages**: `ansible-core`, `ansible-runner`, `certbot`, and additional dependencies from `requirements.txt`.
> - **Ansible Configuration**:
>   - Installs Ansible roles and collections defined in `requirements.yaml`.
>   - Runs `ansible_runner_setup.yaml` to finalize setup.
> - User Setup:
>   - Creates a non-root user `runner` with necessary permissions.
> - **Helmfile Integration**:
>   - Copies the `helmfile` binary for managing Helm charts.

- Build the Docker Image

```bash
docker build -t ansible-runner .
```

#### Configuring Docker Compose

The `docker-compose.yaml` file manages the Ansible-Runner container.

```yaml
version: '3.8'

services:
  ansible-runner:
    image: ansible-runner
    build:
      context: .
    command: tail -f /dev/null
    container_name: ansible-runner
    restart: unless-stopped
    volumes:
      - ./../ansible:/runner
      - ./../kubernetes:/kubernetes
      - ./runner/.gnupg:/home/runner/.gnupg
      - ./runner/.vault:/home/runner/.vault
      - ./runner/.secrets:/home/runner/.secrets
      - ./runner/scripts:/home/runner/scripts
      - ./runner/.ssh:/home/runner/.ssh
      - ./runner/.kube:/home/runner/.kube
      - ./certbot/log:/var/log/letsencrypt
      - ./certbot/config:/etc/letsencrypt
      - ./certbot/work:/var/lib/letsencrypt
```

> [!NOTE]
> **Explanation**:
>
> - **Service**: `ansible-runner`
> - **Image**: Built from the local `Dockerfile`.
> - **Command**: Keeps the container running (`tail -f /dev/null`).
> - **Volumes**:
>   - Mounts project directories and configuration files into the container for seamless access.

- Start the `ansible-runner` container:

```bash
docker-compose up --detach
```

- Interacting with the `ansible-runner` container

  - Execute commands

  ```bash
  docker exec -it ansible-runner <command>
  ```

  > [!TIP]
  > Replace `<command>` with the desired command, e.g., `ansible-playbook playbook.yaml`.

  - Access shell

  ```bash
  docker exec -it ansible-runner /bin/bash
  ```

## Configuring Ansible

Proper configuration ensures that Ansible operates smoothly and targets the correct hosts with appropriate variables.

### Ansible Project Directory Structure

Organize your Ansible project following the [typical directory layout](https://docs.ansible.com/ansible/latest/tips_tricks/sample_setup.html#sample-directory-layout) to maintain clarity and scalability:

```ini
📁 ansible
├── 📁 host_vars
├── 📁 group_vars
├── 📁 vars
├── 📁 tasks
├── 📁 templates
├── 📁 roles 
├── ansible.cfg
├── inventory.yaml
├── playbook1.yaml
├── playbook2.yaml
```

**Directory Descriptions**:

- `host_vars` and `group_vars`:
  - Contain Ansible variables specific to individual hosts and host groups, respectively.
- `vars`:
  - Houses variable files used across multiple playbooks or roles.
- `tasks`:
  - Stores task files that define specific actions to be executed by playbooks.
- `templates`:
  - Contains Jinja2 template files used by playbooks for dynamic configuration file generation.
- `roles`:
  - Encapsulates reusable Ansible roles, each containing its own tasks, handlers, defaults, and more.

### Ansible Configuration File (ansible.cfg)

The `ansible.cfg` file defines configuration settings for Ansible, such as paths to roles, collections, and the inventory file.

Create or edit the `ansible.cfg` file in your Ansible project directory (`~/ansible/ansible.cfg`) with the following content:

```ini
[defaults]
# Inventory file location
inventory = ./inventory.yml

# Number of parallel execution threads
forks = 5

# Paths to search for roles, separated by colon
roles_path = ./roles:/usr/share/ansible/roles

# Paths to search for collections, separated by colon
collections_path = ./collections:/usr/share/ansible/collections

# Disable SSH host key checking (use with caution)
host_key_checking = false
```

> [!IMPORTANT]
> All Ansible commands (`ansible`, `ansible-galaxy`, `ansible-playbook`, `ansible-vault`) should be executed within the `~/ansible` directory in your WSL environment. This ensures that Ansible uses the configuration defined in `~/ansible/ansible.cfg`. Playbooks and related Ansible resources are expected to be launched from this directory.

### Encrypting Secrets and Key Variables

[Ansible Vault](https://docs.ansible.com/ansible/latest/user_guide/vault.html) is utilized to encrypt sensitive information such as passwords, keys, and tokens within Ansible variable files.

To streamline the encryption and decryption process, all sensitive variables are stored in a dedicated file, `vars/vault.yaml`, which is encrypted using Ansible Vault.

**`vault.yaml` Structure**

The vault.yaml file is a YAML file that contains a single variable `vault`, which is a dictionary holding all the necessary secrets.

Sample `vars/vault.yaml`:

```yaml
---
vault:
  # K3s secrets
  k3s:
    k3s_token: s1cret0
  # Traefik secrets
  traefik:
    basic_auth:
      user: admin
      passwd: s1cret0
  # Minio S3 secrets
  minio:
    root:
      user: root
      key: supers1cret0
    restic:
      user: restic
      key: supers1cret0
...
```

**Steps to Encrypt `vault.yaml`**:

- Edit `vars/vault.yaml` and populate the file with your own values for each key, password, or secret.

- Execute the following command to encrypt the `vault.yaml` file

  ```bash
  ansible-vault encrypt vault.yaml
  ```

  - **Prompt**: Enter a secure Ansible Vault password when prompted.
  - **Result**: The `vault.yaml` file becomes encrypted and unreadable in plain text.

> [!NOTE]
>
> - To decrypt the file and view its contents:
>
> ```bash
> ansible-vault decrypt vault.yaml
> ```
>
> - To view the contents without decrypting:
>
> ```bash
> ansible-vault view vault.yaml 
> ```

### Automate Ansible Vault Decryption with GPG

To avoid manually entering the Ansible Vault password each time you run playbooks, you can automate the decryption process using GPG encryption.

**Prerequisites**:

- GnuPG is used to encrypt and decrypt the Ansible Vault passphrase securely.

  - Install GnuPG:

    ```bash
    sudo apt install gnupg -y
    ```

  - Verify installation:

    ```bash
    gpg --help
    ```

  - Generate a GPG Key Pair:

    ```bash
    gpg --full-generate-key
    ```

  - **Process**: Provide your name, email address, and a passphrase when prompted.

  - **Example Output**:

    ```bash
    gpg (GnuPG) 2.2.4; Copyright (C) 2017 Free Software Foundation, Inc.
    This is free software: you are free to change and redistribute it.
    There is NO WARRANTY, to the extent permitted by law.

    GnuPG needs to construct a user ID to identify your key.

    Real name: Amine
    Email address: quant-finance-hub@outlook.com
    You selected this USER-ID:
        "Amine <quant-finance-hub@outlook.com>"

    Change (N)ame, (E)mail, or (O)kay/(Q)uit? O
    We need to generate a lot of random bytes. It is a good idea to perform
    some other action (type on the keyboard, move the mouse, utilize the
    disks) during the prime generation; this gives the random number
    generator a better chance to gain enough entropy.
    gpg: /home/quantstacker/.gnupg/trustdb.gpg: trustdb created
    gpg: key D59E854B5DD93199 marked as ultimately trusted
    gpg: directory '/home/quantstacker/.gnupg/openpgp-revocs.d' created
    gpg: revocation certificate stored as '/home/quantstacker/.gnupg/openpgp-revocs.d/A4745167B84C8C9A227DC898D59E854B5DD93199.rev'
    public and secret key created and signed.

    pub   rsa3072 2021-08-13 [SC] [expires: 2023-08-13]
          A4745167B84C8C9A227DC898D59E854B5DD93199
    uid                      Amine <quant-finance-hub@outlook.com>
    sub   rsa3072 2021-08-13 [E] [expires: 2023-08-13]
    Passphrase: Provide a strong passphrase to secure your GPG key.
    ```

  - **Passphrase**: Provide a strong passphrase to secure your GPG key.

- Generate and encrypt the Vault password
  - Install `pwgen`

    ```bash
    sudo apt install pwgen -y
    ```

  - Generate a Vault password and encrypt with GPG

    ```bash
    mkdir -p $HOME/.vault
    pwgen -n 71 -C | head -n1 | gpg --armor --recipient quant-finance-hub@outlook.com -e -o $HOME/.vault/vault_passphrase.gpg
    ```

    - Replace `quant-finance-hub@outlook.com` with the email address associated with your GPG key.
    - **Result**: The vault passphrase is encrypted and stored at `$HOME/.vault/vault_passphrase.gpg`.

- Create a script that Ansible will use to decrypt the vault passphrase on the fly

  ```bash
  echo '#!/bin/sh
  gpg --batch --use-agent --decrypt $HOME/.vault/vault_passphrase.gpg' > $HOME/.vault/vault_pass.sh
  chmod +x $HOME/.vault/vault_pass.sh
  ```

  - **Explanation**:
    - The script decrypts the vault passphrase using GPG when invoked.
    - Ensure the script has executable permissions.

- Configure Ansible to use the Vault password file by editing your `ansible.cfg` file

```ini
[defaults]
vault_password_file = /home/quantstacker/.vault/vault_pass.sh
```

> [!IMPORTANT]
> Ensure the path points to the correct location of `vault_pass.sh` in your WSL environment.

> [!NOTE]
> If you have cloned this repository and steps 3 (Generate and Encrypt the Vault Password) and 4 (Create a Vault Password Script) are already completed, you can skip generating the vault password and script.

#### Best Practices

- **Version Control**:
  - Do Not commit `vault.yaml` in its decrypted form to version control systems like Git.
  - Commit only the encrypted `vault.yaml` and ensure that the vault passphrase and GPG keys are securely stored and not tracked in version control.
- Secure GPG Keys:
  - Protect your GPG private keys with strong passphrases.
  - Regularly back up your GPG keys to prevent loss.
- **Access Control**:
  - Limit access to the `~/.vault` directory and its contents to authorized users only.

## Setting Up SSH Keys for Remote Connections

Secure and passwordless SSH access is essential for Ansible to manage remote nodes efficiently.

### Generating SSH Keys

Instead of using the default `id_rsa` and `id_rsa.pub` filenames, we'll generate SSH keys named `pikube-controller` and `pikube-controller.pub`. This naming convention clearly associates the keys with the **Ansible-Controller**.

- **On WSL**:

  - Generate a new SSH key pair with the desired name using the following command:

    ```bash
    ssh-keygen -t rsa -b 4096 -C "pikube@ansible-controller" -f ~/.ssh/pikube-controller
    ```

  - **Parameters**:
    - `-t rsa`: Specifies the type of key to create (RSA).
    - `-b 4096`: Defines the number of bits in the key for enhanced security.
    - `-C "pikube@ansible-controller"`: Adds a comment, typically your email, for identification.
    - `-f ~/.ssh/pikube-controller`: Specifies the filename for the generated key pair.

  - **Interactive Prompts**:
    - **Enter passphrase (optional)**: For added security, you can set a passphrase. Otherwise, press Enter to proceed without one.
    - **Enter same passphrase again**: Confirm the passphrase if set.

    - **Output**:
      - **Private Key**: `~/.ssh/pikube-controller`
      - **Public Key**: `~/.ssh/pikube-controller.pub`

- **On Windows (using PuTTY)**:
  - Open **PuTTYgen**.
  - Click **"Generate"** and move the mouse cursor around to generate randomness.
  - Once generated, enter a **Key Comment** (e.g., `pikube@ansible-controller`) for identification.
  - (Optional) Enter a Key Passphrase for added security.
  - Click **"Save private key"** and name it `pikube-controller.ppk`.
  - Copy the Public Key from the PuTTYgen window or save it as `pikube-controller.pub`.
  - Convert to OpenSSH Format (Optional):
    - If you prefer using OpenSSH keys within WSL, convert the PuTTY-generated keys:

      ```bash
      puttygen pikube-controller.ppk -O private-openssh -o ~/.ssh/pikube-controller
      puttygen pikube-controller.ppk -O public-openssh -o ~/.ssh/pikube-controller.pub
      ```

### Configuring SSH Access

Ensure that the content of `~/.ssh/pikube-controller.pub` is added to the ssh_authorized_keys field in the `user-data` files during the Ubuntu OS installation of each Raspberry Pi node.

Example `user-data` Configuration:

```yaml
ssh_authorized_keys:
  - ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDsVSvxBitgaOiqeX4foCfhIe4yZj+OOaWP+wFuoUOBCZMWQ3cW188nSyXhXKfwYK50oo44O6UVEb2GZiU9bLOoy1fjfiGMOnmp3AUVG+e6Vh5aXOeLCEKKxV3I8LjMXr4ack6vtOqOVFBGFSN0ThaRTZwKpoxQ+pEzh+Q4cMJTXBHXYH0eP7WEuQlPIM/hmhGa4kIw/A92Rm0ZlF2H6L2QzxdLV/2LmnLAkt9C+6tH62hepcMCIQFPvHVUqj93hpmNm9MQI4hM7uK5qyH8wGi3nmPuX311km3hkd5O6XT5KNZq9Nk1HTC2GHqYzwha/cAka5pRUfZmWkJrEuV3sNAl pikube@ansible-controller
```

## Installing Ansible Development Environment with Micromamba

To establish a comprehensive Ansible development environment within WSL, the following setup is recommended:

- **Docker**: Utilized by Molecule, Ansible's testing tool, for building testing environments.
- **Vagrant and KVM**: Employed by Molecule to automate the testing of roles that require virtual machines instead of Docker containers (e.g., Storage roles).
- **Ansible and Molecule Packages**: Managed using Micromamba, a lightweight and efficient environment manager, to ensure dependency isolation and reproducibility.

### Set Up Micromamba

- Install Micromamba

```bash
# Create a directory for Micromamba
mkdir -p ~/.micromamba/bin

# Download Micromamba binary
curl -L https://micromamba.snakepit.net/api/micromamba/linux-64/latest | tar -xvj -C ~/.micromamba/bin

# Create a symlink for easy access
ln -s ~/.micromamba/bin/micromamba ~/.local/bin/micromamba
```

- Initialize Micromamba to configure your shell

```bash
micromamba shell init -s bash -p ~/micromamba
```

>[!NOTE]
> Replace bash with your shell of choice if different (e.g., zsh).

> [!TIP]
> To avoid typing multiple time `micromamba`, create an `alias` `mm` in `.bashrc`

- To apply the changes, either restart your terminal or source your shell configuration

```bash
source ~/.bashrc
```

- Create a new environment named `ansible` with Python 3.12

```bash
micromamba create -n ansible-env python=3.12
```

- Test the environement

```bash
micromamba activate ansible
```

- With the environment activated, install `Ansible`, `Molecule`, and other necessary tools

```bash
micromamba install -c conda-forge ansible molecule yamllint ansible-lint jmespath molecule-docker docker molecule-vagrant
```