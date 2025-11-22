PiKube — Longhorn Rework Session (2025-11-16, late)

Goal: Make Longhorn’s design and documentation truly match PiKube’s NVMe/SD reality, and prove an install path that is correct from a fresh cluster, even though this session’s uninstall got stuck mid-way.

---

## 1) What we learned about Longhorn’s defaults

- Longhorn’s behavior with `defaultSettings.defaultDataPath` is:
  - It **creates a default disk on every Longhorn node** at that path, with `allowScheduling: true`, unless further constrained.
  - It does **not** know by itself which nodes are NVMe vs SD — it just uses the path.
- When we installed Longhorn with:
  - `defaultSettings.defaultDataPath: "/var/lib/longhorn/fast"`
  - And no “labeled nodes only” setting,
  - The `nodes.longhorn.io` CRs showed a default disk on **every worker**, including SD‑only nodes, all with `allowScheduling: true` and `path: /var/lib/longhorn/fast`.
- That conflicted with the conceptual intent (“fast tier = NVMe only”), because SD nodes suddenly had “fast” disks too.

Key takeaway: the doc must explicitly configure **which nodes should get default disks**—otherwise Longhorn will use **all** workers.

---

## 2) Storage reality check (NVMe and SD)

We re‑audited all nodes:

- Masters (10.0.0.10–12):
  - SD only (`mmcblk0` ~120GB each).
  - Root on `mmcblk0p2`, no data mounts, no NVMe.
- `cranberry-worker` (RPi 5):
  - SD only (`mmcblk0` ~240GB), `/` on `mmcblk0p2`.
- `orange-worker`, `mandarine-worker` (OPi 5):
  - SD only (`mmcblk1` ~240GB), `/` on `mmcblk1p2`.
- `lemon-worker`, `clementine-worker`, `grapefruit-worker` (OPi 5 Ultra):
  - SD (`mmcblk1p2`) as `/` plus **NVMe** (`nvme0n1` ~931GB).
  - We standardized NVMe usage by:
    - Creating an ext4 filesystem on `nvme0n1p1` on each Ultra node.
    - Mounting it persistently at `/var/lib/longhorn/fast` via `/etc/fstab`:
      - `UUID=... /var/lib/longhorn/fast ext4 defaults,noatime 0 0`

After cleanup:

- All three Ultra nodes have a clean NVMe filesystem at `/var/lib/longhorn/fast`.
- All SD cards are healthy and only used for root OS (no stray `/mnt/longhorn-nvme` mounts).

---

## 3) Final Longhorn strategy baked into the doc

File: `docs/8-storage/1-distributed-block-storage-longhorn.md`

The doc now describes a clean, from‑scratch strategy:

### 3.1 Storage tiers and paths

- **Fast tier (NVMe)** – primary tier for PiKube
  - Nodes: `lemon-worker`, `clementine-worker`, `grapefruit-worker` (OPi 5 Ultra).
  - Path: `/var/lib/longhorn/fast` mounted on each of these nodes (NVMe).
  - Longhorn disks: one disk per NVMe node pointing to `/var/lib/longhorn/fast`, tagged `fast` (or `nvme`).
  - StorageClass: `longhorn` (default) uses only `fast` disks.
  - This is what normal PiKube PVCs should use.

- **Slow tier (SD)** – optional expansion tier
  - Nodes: any workers where you want to expose SD capacity to Longhorn.
  - Path: `/var/lib/longhorn/slow` if/when it is enabled.
  - Longhorn disks: disks on SD paths tagged `slow`.
  - StorageClass: `longhorn-slow`, not default; used explicitly for cold/bulk, non‑critical data.

### 3.2 iSCSI and multipath

- iSCSI section now clearly states:
  - `nfs-common`, `open-iscsi`, `cryptsetup`, `dmsetup` are **mandatory** on all nodes.
  - Quick validation commands added (`dpkg -l ...`, `systemctl is-active iscsid`).
- Multipath section:
  - PiKube **does** run `multipathd` on OPi workers.
  - We **keep multipath** for future SAN use but blacklist `sd*` so multipath does not touch Longhorn local disks.
  - The blacklist snippet remains:
    ```ini
    blacklist {
      devnode "^sd[a-z0-9]+"
    }
    ```
  - Doc clarifies this is to stop multipath from claiming Longhorn volumes, not to disable multipath entirely.

### 3.3 NGINX ingress and SSO roadmap

- `longhorn-values.yaml` Ingress block is now PiKube‑specific:
  - NGINX ingress for `longhorn.picluster.quantfinancehub.com` with:
    - Basic auth via `nginx/basic-auth-secret`.
    - TLS via `cert-manager` and `letsencrypt-issuer`.
- New warning:
  - This is a **bootstrap** security model.
  - Long term, Longhorn UI (like other GUIs) will sit behind **Keycloak + OAuth2-Proxy** per `docs/7-single-sign-on/1-sso-with-keycloak-and-oauth2-proxy.md`.
  - Doc explicitly states that the Ingress will be updated later to use OAuth2‑Proxy instead of static basic auth.

### 3.4 The crucial correction: labeled nodes for default disks

The biggest behavior gap was fixed by adding an explicit **Step 2** and Helm setting:

1. **Label only NVMe nodes before installing Longhorn:**

   ```bash
   kubectl label node lemon-worker      node.longhorn.io/create-default-disk=true
   kubectl label node clementine-worker node.longhorn.io/create-default-disk=true
   kubectl label node grapefruit-worker node.longhorn.io/create-default-disk=true
   ```

2. **Set `createDefaultDiskLabeledNodes: true` in `longhorn-values.yaml`:**

   ```yaml
   defaultSettings:
     # Only create default disks on labeled storage nodes
     createDefaultDiskLabeledNodes: true
     # PiKube: use NVMe fast tier on Ultra workers
     defaultDataPath: "/var/lib/longhorn/fast"
   ```

With these two together, on a **fresh** install:

- Longhorn only auto‑creates default disks on nodes labeled `node.longhorn.io/create-default-disk=true`.
- Those disks live at `/var/lib/longhorn/fast` which is NVMe on those three nodes.
- SD‑only nodes no longer get default Longhorn data disks by default.

This makes the doc a true source of truth: following it exactly yields the intended NVMe‑only fast tier.

---

## 4) What happened in the cluster during this session

### 4.1 First Longhorn install (before doc fix)

- We installed Longhorn with:
  - `defaultDataPath: "/var/lib/longhorn/fast"`.
  - No `createDefaultDiskLabeledNodes` and no pre‑labels.
- Result:
  - `nodes.longhorn.io` showed default disks on **all workers** at `/var/lib/longhorn/fast` with `allowScheduling: true`.
  - On NVMe nodes, this was correct; on SD‑only nodes, this meant Longhorn would happily use SD for replicas, undermining the “NVMe fast tier only” idea.
- We patched in‑cluster:
  - Set `allowScheduling: false` for the default disks on `cranberry-worker`, `orange-worker`, `mandarine-worker`.
  - Left NVMe nodes schedulable.
  - This brought runtime behavior in line with the design, but it was a **manual fix**, not encoded in the install process.

### 4.2 Uninstall attempt

- We tried to completely remove Longhorn to validate the clean install path:
  - `helm uninstall longhorn -n longhorn-system`.
  - `kubectl delete ns longhorn-system`.
  - Deleting Longhorn webhooks (validator/mutator).
  - Deleting Longhorn CRDs and CR objects.
- The namespace got stuck in `Terminating` due to:
  - Webhook references (`longhorn-admission-webhook` service missing).
  - Remaining Longhorn CRDs (`backuptargets.longhorn.io`, `engineimages.longhorn.io`, `nodes.longhorn.io`) and their resources.
- We partially cleaned up CRDs and CRs, but the API still showed:
  - `longhorn-system` as `Terminating`.
  - Some Longhorn CRDs reporting as present even after delete attempts (slow/uncooperative control plane in this environment).
- In a real environment, the recommended approach would be to:
  - Follow the official Longhorn uninstall procedure step‑by‑step.
  - Ensure all volumes are removed/migrated.
  - Delete all Longhorn CRs, then CRDs, then namespace, and only then reinstall.

Given the time and environment constraints, we stopped short of a fully pristine uninstall, but we **did**:

- Understand the behavior gap (default disks everywhere).
- Fix the **documentation** so a fresh install will be correct without manual patching.

---

## 5) Cluster health snapshot (post‑Longhorn work)

- Core namespaces are healthy:
  - `kube-system`, `kube-public`, `kube-node-lease`, `default`.
  - Platform: `metal-lb`, `nginx`, `cert-manager`, `external-secrets`, `vault`, `system-upgrade`, `external-dns`, `volcano-system`, `argocd` (untouched this session).
- The temporary Longhorn install has been mostly torn down, but `longhorn-system` namespace is still in `Terminating` due to CRD cleanup issues in this sandbox.
- NVMe mounts remain **clean and correct**:
  - On `lemon`, `clementine`, `grapefruit`: `/dev/nvme0n1p1` mounted at `/var/lib/longhorn/fast`, ~916GB free.
  - SD root filesystems are intact and unaffected.

---

## 6) How to install Longhorn correctly next time (from the doc)

When ready to reinstall Longhorn on a fresh or fully cleaned PiKube:

1. **Prepare NVMe on the three Ultra workers:**
   - Partition and format `nvme0n1` as ext4 and mount at `/var/lib/longhorn/fast` with a persistent `/etc/fstab` entry on:
     - `lemon-worker`, `clementine-worker`, `grapefruit-worker`.
2. **Label only NVMe nodes for default disks:**
   - As per the doc:
     ```bash
     kubectl label node lemon-worker      node.longhorn.io/create-default-disk=true
     kubectl label node clementine-worker node.longhorn.io/create-default-disk=true
     kubectl label node grapefruit-worker node.longhorn.io/create-default-disk=true
     ```
3. **Create `longhorn-values.yaml` with:**
   - `defaultSettings.createDefaultDiskLabeledNodes: true`.
   - `defaultSettings.defaultDataPath: "/var/lib/longhorn/fast"`.
   - NGINX ingress + basic auth + TLS block as in the doc.
4. **Install Longhorn via Helm:**
   - `helm repo add longhorn https://charts.longhorn.io`  
   - `helm repo update`  
   - `kubectl create namespace longhorn-system`  
   - `helm install longhorn longhorn/longhorn -n longhorn-system -f longhorn-values.yaml`
5. **Verify:**
   - `kubectl -n longhorn-system get pods` → all Longhorn components running.
   - `kubectl get sc` → `longhorn (default)` present.
   - Create `testing-longhorn` namespace + PVC + Pod per doc, verify `Hello Longhorn` persists across Pod re‑creation.

Following these steps, the behavior will match the doc **without** any manual patching: fast tier = NVMe only, slow tier available later if/when you enable it.

---

## 7) Next session focus

- Decide when/how to complete the Longhorn uninstall in this environment (possibly by following the official uninstall guide and/or restarting the control plane).
- Once the control plane is clean:
  - Reinstall Longhorn following the updated doc exactly and run the PVC/Pod persistence test.
  - Start integrating Longhorn with higher‑level workloads:
    - Elasticsearch / logging with Volcano gang scheduling.
    - Prometheus + kube‑prometheus‑stack using Longhorn as default storage.
- Begin planning the SSO integration (Keycloak + OAuth2‑Proxy) for Longhorn and other UIs, so we can replace basic auth ingress with a unified SSO front door.

