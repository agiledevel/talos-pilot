# C4 disposable Talos fixture allowlist

Status: **pre-registered; not yet provisioned**

This allowlist authorizes only the local C4 fixture below. It does not authorize
use of any other Docker, libvirt, Talos, or Kubernetes cluster.

## Identity and scope

| Field                         | Authorized value                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Fixture ID                    | `talos-pilot-c4-20261009`                                                                                       |
| Provisioner                   | Local QEMU through the official pinned `talosctl` 1.14.1 binary                                                 |
| Talos image                   | `ghcr.io/siderolabs/talos:v1.14.1`                                                                              |
| Kubernetes version            | `v1.36.5`                                                                                                       |
| Topology                      | 3 control planes and 1 worker                                                                                   |
| Cluster CIDR                  | `10.79.0.0/24`                                                                                                  |
| Talos config destination      | `/tmp/tpc4/talosconfig`                                                                                         |
| Kubernetes config destination | `/tmp/tpc4/kubeconfig` via `KUBECONFIG`                                                                         |
| Talos state directory         | `/tmp/tpc4/state`                                                                                               |
| Credentials                   | Synthetic Talos-generated CA and client certificate; derive a separate `os:reader` config for read/stream tests |
| Mutations                     | No Talos or Kubernetes mutations after fixture provisioning; C4 probes are read-only                            |

Before provisioning, verify that this exact name, state path, and CIDR are
unused. After provisioning, replace the pending network fields below with the
reported endpoint, Kubernetes endpoint, and node addresses; those exact values
are the only network identities the C4 integration harness may target. Do not
use wildcard endpoint or node entries.

## Provision and teardown

The host's QEMU network setup requires root, so the pinned CLI runs with
`sudo -E`. It uses a short isolated state root because QEMU Unix monitor socket
paths must remain below the kernel's 108-byte socket-path limit. A first
unprivileged attempt stopped before creating any QEMU processes due to the
host-network permission requirement. A privileged attempt using the longer
`/tmp/talos-pilot-c4-20261009` root created machine files but QEMU could not
start because its monitor socket path exceeded the limit. That exact fixture
state/network was destroyed with its unique cluster name, and the shorter
`/tmp/tpc4` root was reserved before retry. The corrected invocation is:

```sh
sudo -n -E sh -c 'umask 077; cd /tmp/tpc4; \
  TALOSCONFIG=/tmp/tpc4/talosconfig \
  KUBECONFIG=/tmp/tpc4/kubeconfig \
  /developer/ifjkt/talos-pilot/src-tauri/.local-tools/talosctl \
    --state /tmp/tpc4/state \
    cluster create qemu \
    --name talos-pilot-c4-20261009 \
    --cidr 10.79.0.0/24 \
    --talos-version v1.14.1 \
    --kubernetes-version v1.36.5 \
    --controlplanes 3 \
    --workers 1 \
    --presets iso \
    --talosconfig-destination /tmp/tpc4/talosconfig'
```

The first short-path attempt started all four QEMU VMs but did not complete:
Talos logs showed DHCP requests on `enp0s6` receiving no offer, and the
provisioner timed out connecting to `10.79.0.2:50000` with `no route to host`.
The exact fixture was destroyed with the command below. No C4 endpoint is
currently allowlisted, and no Talos or Kubernetes API was reached. Do not
retry the QEMU fixture until the host's bridge/DHCP path is understood. The
host firewall/network configuration was inspected but not changed. Synthetic
config files remain outside the repository and must be removed after fixture
work is complete.

Teardown is restricted to this fixture name and state path:

```sh
sudo -n -E /developer/ifjkt/talos-pilot/src-tauri/.local-tools/talosctl \
  --state /tmp/tpc4/state \
  cluster destroy --name talos-pilot-c4-20261009 --force
```

After teardown, verify the exact QEMU domains, network, and state directory are
gone, then remove `/tmp/tpc4`. If provisioning partially fails, inspect only names beginning with
`talos-pilot-c4-20261009` and clean only those resources.

## Pending host-issued identities

- QEMU control-plane/worker IP allowlist: pending provisioning
- Host Talos API endpoint(s): pending provisioning
- Host Kubernetes API endpoint: pending provisioning
- Immutable Talos/Kubernetes image digests: pending image resolution
- Final talosconfig effective role and certificate expiry: pending generation
- Provisioning attempt: failed on 2026-10-09 because QEMU guest DHCP received no offer; exact cluster destroyed

## Host bridge and DHCP diagnosis (2026-10-09, read-only)

`talosctl cluster create qemu` v1.14.1 exposes only `--cidr` for networking; it has
no user-mode/SLIRP option, so the fixture necessarily uses a host bridge with the
provisioner's in-process DHCP server on the bridge gateway address. Read-only host
inspection on this machine found:

- `firewalld` is `running`, the default zone is `public`, and `public` lists only
  `dhcpv6-client` — it does not allow the `dhcp` service.
- Active zones cover only the pre-existing interfaces: `docker` (`docker0`,
  `br-d8d3b40ca545`), `libvirt` (`virbr124`), `public` (`wlo1`). A bridge created
  by the provisioner has no zone assignment and therefore inherits `public`.
- `enp2s0` has no carrier; the host reaches the network over `wlo1`
  (`192.168.0.46/24`). No `dnsmasq` binary is installed, and no QEMU process or
  `talos-pilot-c4-*` bridge remained from the destroyed attempts.

This explains the recorded symptom exactly: guest DISCOVER frames on `enp0s6`
reached the bridge, but UDP/67 replies were filtered by the `public` zone, so no
offer arrived and `10.79.0.2:50000` was unreachable. It also means the earlier
attempts did not exercise any Talos or Kubernetes API.

Concrete resolution requiring an owner decision (it changes host firewall state,
which is outside the repository and was deliberately not modified):

1. Before provisioning, bind the fixture bridge to a dedicated firewalld zone that
   allows only `dhcp` for its own subnet, for example
   `sudo -n firewall-cmd --permanent --new-zone=talos-pilot-c4`,
   `--zone=talos-pilot-c4 --permanent --add-service=dhcp`, then
   `--zone=talos-pilot-c4 --add-interface=<provisioner bridge>` and reload.
2. Provision the documented command unchanged, record the issued addresses in the
   pending fields above, and run the C4/C5 gates.
3. Destroy the fixture with the allowlisted teardown, then
   `sudo -n firewall-cmd --permanent --delete-zone=talos-pilot-c4` and reload, and
   verify `--get-active-zones` matches the pre-attempt state recorded here.

An alternative of adding `dhcp` to the `public` zone was rejected: it would widen
exposure on the host's default zone for every future interface. Until the owner
approves a firewall change, C4 integration evidence stays blocked and the fixture
must not be retried.
