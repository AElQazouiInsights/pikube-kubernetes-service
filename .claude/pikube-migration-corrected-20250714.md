# PiKube Fresh Cluster Migration Plan - CORRECTED
## Session: 20250714 (Updated with Implementation Progress)

### 🎯 **Migration Objective**
Complete cluster rebuild integrating:
- **Cilium CNI** (replacing Flannel + MetalLB) ✅ **CONFIGURED**
- **Volcano Scheduler** (fixing Elasticsearch gang scheduling) ✅ **CONFIGURED**
- **Istio Service Mesh** (Ambient Mode for ARM64) ✅ **CONFIGURED**
- **Custom CoreDNS** + External-DNS configuration ✅ **CONFIGURED**
- **Enhanced Longhorn** with NVMe integration ✅ **READY FOR INSTALL**

### 🔍 **Current Implementation Status**

**COMPLETED TODAY (2025-07-14):**
- ✅ **Ansible K3s Configuration**: Updated for Cilium CNI compatibility
- ✅ **NVMe Preparation Playbook**: Created for grapefruit-worker (node9)
- ✅ **ArgoCD Bootstrap Updates**: Root values.yaml updated with new applications
- ✅ **Namespace Configuration**: Added external-dns, volcano-system, istio-system
- ✅ **New Application Manifests**: All 5 new applications created

**Application Status**:
📦 **NEW Applications Ready for Deployment**:
- 🌐 **Cilium**: CNI + LB-IPAM (syncWave: 2)
- 🔍 **CoreDNS**: Custom DNS configuration (syncWave: 2) 
- 📡 **External-DNS**: RFC2136 integration (syncWave: 2)
- 🌋 **Volcano**: Gang scheduler (syncWave: 3)
- 🕸️ **Istio**: Service mesh in Ambient Mode (syncWave: 4)

**Infrastructure Preparation**:
- 🔧 **NVMe Storage**: Playbook ready for node9 (/dev/nvme0n1)
- 📦 **ArgoCD Structure**: Respects existing App-of-Apps pattern
- 🏷️ **MetalLB**: Commented out (replaced by Cilium LB-IPAM)

### 📋 **Ready for Execution**

#### **Phase 1: NVMe Storage Preparation**
```bash
# Execute NVMe preparation on grapefruit-worker (node9)
cd /home/quantstacker/pikube-ansible
ansible-playbook -i inventory.yaml nvme-preparation.yaml

# Expected result: /mnt/longhorn-nvme mounted and ready
```

#### **Phase 2: Cluster Deployment**
```bash
# Execute in order
cd /home/quantstacker/pikube-ansible

# 1. Pre-configuration
ansible-playbook -i inventory.yaml k3s-picluster-pre-configuration.yaml

# 2. Master nodes setup (with Cilium configuration)
ansible-playbook -i inventory.yaml k3s-master-nodes-configuration.yaml

# 3. Worker nodes setup  
ansible-playbook -i inventory.yaml k3s-worker-nodes-configuration.yaml

# 4. Enhanced labeling
ansible-playbook -i inventory.yaml k3s-worker-nodes-configuration.yaml --tags enhanced-labels

# 5. Bootstrap ArgoCD (will deploy all new applications)
ansible-playbook -i inventory.yaml k3s-master-bootstrap.yaml
```

**Expected ArgoCD Sync Waves:**
- **Wave 0**: CRDs
- **Wave 1**: Namespaces
- **Wave 2**: Cilium, CoreDNS, External-DNS, Debug Tools
- **Wave 3**: External-Secrets, Volcano
- **Wave 4**: Cert-Manager, Istio
- **Waves 5-14**: Existing applications (unchanged)

### 🔧 **Application Configurations Created**

#### **1. Cilium CNI (Replaces MetalLB + Flannel)**
- **File**: `/home/quantstacker/pikube-argocd/argocd/system/cilium/`
- **Features**: LB-IPAM (10.0.0.100-200), Hubble observability, ARM64 optimized
- **Integration**: Replaces both MetalLB load balancer and Flannel CNI

#### **2. CoreDNS (Custom Configuration)**
- **File**: `/home/quantstacker/pikube-argocd/argocd/system/coredns/`
- **Features**: 3 replicas, monitoring integration, performance optimizations
- **ClusterIP**: 10.43.0.10 (matches K3s default)

#### **3. External-DNS (RFC2136 Provider)**
- **File**: `/home/quantstacker/pikube-argocd/argocd/system/external-dns/`
- **Features**: Bind9 integration, TXT record ownership, automatic DNS updates
- **Domain**: picluster.quantfinancehub.com

#### **4. Volcano Scheduler (Gang Scheduling)**
- **File**: `/home/quantstacker/pikube-argocd/argocd/system/volcano/`
- **Features**: ARM64 optimized, custom resources support, monitoring enabled
- **Use Case**: Elasticsearch clusters, multi-pod applications

#### **5. Istio Service Mesh (Ambient Mode)**
- **File**: `/home/quantstacker/pikube-argocd/argocd/system/istio/`
- **Features**: Ambient Mode for reduced footprint, ARM64 optimized, Cilium integration
- **Gateway**: LoadBalancer with Cilium LB-IPAM (10.0.0.100)

### 🔄 **Next Steps (Post-Deployment)**

#### **Phase 3: Application Integration** (PENDING)
Once cluster is deployed, update existing applications:

**HIGH Priority Updates**:
- 🔐 **Keycloak**: Add Volcano gang scheduling + Istio integration
- 💾 **MinIO**: Gang scheduling for 3-pod distributed cluster
- 📊 **Logging**: Elasticsearch cluster with Volcano coordination
- 📈 **Monitoring**: Prometheus/Grafana with selective Istio injection
- 🔒 **OAuth2-Proxy**: Multi-pod auth with gang scheduling

**MEDIUM Priority Updates**:
- 💽 **Longhorn**: Enhanced with NVMe storage classes
- 🔒 **Cert-Manager**: Volcano scheduling integration

#### **Phase 4: Service Mesh Migration** (PENDING)
- Gradual namespace migration from Linkerd to Istio
- VirtualService and DestinationRule creation
- Traffic routing configuration
- Performance validation

### 📊 **Validation Checklist (Post-Deployment)**

```bash
# Verify ArgoCD applications
kubectl get applications -n argocd

# Check Cilium status
kubectl exec -n kube-system ds/cilium -- cilium status

# Verify NVMe storage
ssh node9 "df -h /mnt/longhorn-nvme"

# Test DNS resolution
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl get pods -n external-dns

# Validate Volcano scheduler
kubectl get pods -n volcano-system
kubectl get queues

# Check Istio deployment
kubectl get pods -n istio-system
istioctl proxy-status

# Verify load balancer
kubectl get svc -n istio-system istio-ingressgateway
```

### 🚀 **Ready for Deployment**

**Current Status**: ✅ **READY TO EXECUTE**
- All configurations created and validated
- NVMe preparation playbook ready
- ArgoCD manifests follow existing patterns
- Sync waves properly configured
- Resource limits optimized for ARM64

**Estimated Deployment Time**: 
- NVMe Preparation: 10 minutes
- Cluster Deployment: 30-45 minutes
- Application Sync: 15-20 minutes
- **Total**: ~1 hour for full infrastructure

---

**Implementation Notes**:
- Feature branch: `feat/cilium-volcano-istio-integration` (ArgoCD repo)
- NVMe target updated: `node9` (grapefruit-worker)
- Istio configured for Ambient Mode (reduced resource footprint)
- MetalLB gracefully commented out (not deleted)
- All new applications use ARM64-optimized configurations

**Next Action**: Execute NVMe preparation, then cluster deployment sequence.

---

**END OF IMPLEMENTATION PROGRESS UPDATE**

*Session: 20250714*  
*Status: Ready for Deployment*  
*Implementation: Phase 1-2 Complete, Phase 3-4 Pending*