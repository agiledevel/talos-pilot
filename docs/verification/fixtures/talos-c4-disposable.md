# C4 disposable Talos fixture allowlist

Status: **pre-registered; not yet provisioned**

This allowlist authorizes only the local C4 fixture below. It does not authorize
use of any other Docker, libvirt, Talos, or Kubernetes cluster.

## Identity and scope

| Field | Authorized value |
| --- | --- |
| Fixture ID | `talos-pilot-c4-20261009` |
| Provisioner | Local QEMU through the official pinned `talosctl` 1.14.1 binary |
| Talos image | `ghcr.io/siderolabs/talos:v1.14.1` |
| Kubernetes version | `v1.36.5` |
| Topology | 3 control planes and 1 worker |
| Cluster CIDR | `10.79.0.0/24` |
| Talos config destination | `/tmp/talos-pilot-c4-20261009/talosconfig` |
| Kubernetes config destination | `/tmp/talos-pilot-c4-20261009/kubeconfig` via `KUBECONFIG` |
| Talos state directory | `/tmp/talos-pilot-c4-20261009/talosctl-state` |
| Credentials | Synthetic Talos-generated CA and client certificate; derive a separate `os:reader` config for read/stream tests |
| Mutations | No Talos or Kubernetes mutations after fixture provisioning; C4 probes are read-only |

Before provisioning, verify that this exact name, state path, and CIDR are
unused. After provisioning, replace the pending network fields below with the
reported endpoint, Kubernetes endpoint, and node addresses; those exact values
are the only network identities the C4 integration harness may target. Do not
use wildcard endpoint or node entries.

## Provision and teardown

The fixture will be created with the pinned binary and isolated destinations:

```sh
TALOSCONFIG=/tmp/talos-pilot-c4-20261009/talosconfig \
KUBECONFIG=/tmp/talos-pilot-c4-20261009/kubeconfig \
talosctl --state /tmp/talos-pilot-c4-20261009/talosctl-state \
  cluster create qemu \
  --name talos-pilot-c4-20261009 \
  --cidr 10.79.0.0/24 \
  --talos-version v1.14.1 \
  --kubernetes-version v1.36.5 \
  --controlplanes 3 \
  --workers 1 \
  --presets iso
```

The exact provisioner output, endpoint allowlist, image digests, and client
version will be recorded here once it is created. Synthetic config files remain
outside the repository and must be removed after the cluster is destroyed.

Teardown is restricted to this fixture name and state path:

```sh
talosctl --state /tmp/talos-pilot-c4-20261009/talosctl-state \
  cluster destroy --name talos-pilot-c4-20261009
```

After teardown, verify the exact QEMU domains, network, and state directory are
gone. If provisioning partially fails, inspect only names beginning with
`talos-pilot-c4-20261009` and clean only those resources.

## Pending host-issued identities

- QEMU control-plane/worker IP allowlist: pending provisioning
- Host Talos API endpoint(s): pending provisioning
- Host Kubernetes API endpoint: pending provisioning
- Immutable Talos/Kubernetes image digests: pending image resolution
- Final talosconfig effective role and certificate expiry: pending generation
