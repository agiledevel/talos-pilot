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

An alternative of adding `dhcp` to the `public` zone was rejected: it would widen
exposure on the host's default zone for every future interface.

## Applied host remediation (owner-approved, 2026-10-09)

The owner approved a dedicated temporary zone for this fixture only. Both steps
below are reverted by the restoration checklist, and only interfaces created by
this provisioning command were ever placed in the zone.

1. A firewalld zone scoped to the fixture interfaces. `--add-forward` and
   `--add-masquerade` are required in addition to the `dhcp` service: Talos boots
   from an ISO that fetches the installer from the Image Factory, so guests need
   forwarded egress, not only a lease.

   ```sh
   sudo -n firewall-cmd --permanent --new-zone=talos-pilot-c4
   sudo -n firewall-cmd --permanent --zone=talos-pilot-c4 --add-service=dhcp
   sudo -n firewall-cmd --permanent --zone=talos-pilot-c4 --add-forward
   sudo -n firewall-cmd --permanent --zone=talos-pilot-c4 --add-masquerade
   sudo -n firewall-cmd --permanent --zone=talos-pilot-c4 --set-target=ACCEPT
   sudo -n firewall-cmd --reload
   ```

   As the bridge and its veth pair appear, bind them:
   `sudo -n firewall-cmd --zone=talos-pilot-c4 --change-interface=<name>`. The
   provisioner names the bridge deterministically from the cluster name, and on
   this host it was `talosb8c871e1`.

2. The legacy `iptables` FORWARD chain also has to be opened. Docker leaves
   `-P FORWARD DROP` in the legacy table, which drops forwarded guest traffic
   even though firewalld's nft ruleset accepts it, and the provisioner's own
   per-VM `CNI-*` chains are removed when `cluster create` exits early. The
   fixture-scoped rules used were:

   ```sh
   sudo -n iptables -I FORWARD -o talosb8c871e1 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
   sudo -n iptables -I FORWARD -i talosb8c871e1 -j ACCEPT
   sudo -n iptables -I FORWARD -s 10.79.0.0/24 ! -o talosb8c871e1 -j ACCEPT
   sudo -n iptables -I FORWARD -d 10.79.0.0/24 ! -i talosb8c871e1 -j ACCEPT
   sudo -n iptables -t nat -A POSTROUTING -s 10.79.0.0/24 ! -o talosb8c871e1 -j MASQUERADE
   ```

With both steps applied, guests obtained leases, synced time, installed Talos,
and reached `stage: running`. Two further facts are recorded because they cost a
full provisioning cycle each:

- `cluster create qemu` can time out on its own bootstrap wait while etcd is
  still starting. The fixture is then healthy but unbootstrapped; complete it
  with `sudo -n -E <talosctl> --talosconfig /tmp/tpc4/talosconfig --nodes
  10.79.0.2 bootstrap` and wait until `get members` lists the worker.
- The issued talosconfig selects one context and lists API endpoints only, while
  the C4 contract needs the node allowlist too. Add the recorded node addresses
  under that context's `nodes:` key before running the harness. This edits the
  client's target selection outside the repository and changes nothing in the
  cluster. A leftover config file from an earlier attempt makes talosctl rename
  the new context with a `-1` suffix, which then fails the harness identity gate;
  start from an empty state root.

## Host-issued identities (2026-10-09 run)

- QEMU bridge: `talosb8c871e1` on `10.79.0.1/24`, four guests
- Talos API endpoints: `10.79.0.2`, `10.79.0.3`, `10.79.0.4` (control planes)
- Node targets: `10.79.0.2`, `10.79.0.3`, `10.79.0.4` (controlplane),
  `10.79.0.5` (worker, deliberately not an API endpoint)
- Unassigned in-CIDR address used only for the failure cases: `10.79.0.250`
- Talos version reported by the API: `v1.14.1`; hostnames
  `talos-pilot-c4-20261009-controlplane-1..3` and `...-worker-1`
- Final talosconfig: one context named `talos-pilot-c4-20261009`, inline
  base64 `ca`/`crt`/`key`, admin role, 1,771 bytes, kept outside the repository
- Immutable image digests: not captured; the ISO preset resolved through the
  Image Factory, and the machine identity is pinned by `--talos-version v1.14.1`
  plus `--kubernetes-version v1.36.5`

These values are mirrored in machine-readable form in
[`tests/fixtures/talos-c4.json`](../../../tests/fixtures/talos-c4.json), which
the harness verifies.

## Harness command

Run from a repository checkout while the fixture above is provisioned:

```sh
pnpm talos:fixture -- --manifest tests/fixtures/talos-c4.json \
  --talosconfig /tmp/tpc4/talosconfig
```

[`scripts/talos-fixture.ts`](../../../scripts/talos-fixture.ts) takes file
*references* only — credential content never appears in an argument or an
environment value — rejects a talosconfig inside the repository, requires the
manifest identity, version pins, and non-empty literal endpoint/node allowlists,
rejects wildcard entries, rebuilds the packaged helper, then runs the ignored
Rust fixture tests. It fails if the manifest names anything other than
`talos-pilot-c4-20261009`, if the imported context's endpoints are not exactly
the recorded allowlist, or if a node is outside it.
[`src-tauri/tests/talos_fixture.rs`](../../../src-tauri/tests/talos_fixture.rs)
then proves the authenticated `Version` read, the node-pinned `MachineStatus`
projection, session-scoped cancellation of a live stream, a worker target that is
not an API endpoint, a read that fails over past an unreachable leading
endpoint, rejection of an out-of-allowlist node and an unknown session without
any helper work, `TALOS_CERTIFICATE_INVALID` for an unrelated authority, and
retryable `TALOS_UNAVAILABLE` for an unreachable endpoint. The helper process is
then shut down and reaped by the same service the application uses.

## Teardown and restoration checklist

1. Destroy only this fixture: the command in the section above.
2. Remove exactly the rules added for it: the five `iptables -D` counterparts of
   the rules above, then `sudo -n iptables -S FORWARD | grep -c 10.79.0` and the
   matching `nat` query must both report `0`.
3. `sudo -n firewall-cmd --permanent --delete-zone=talos-pilot-c4` and reload;
   `--get-zones` must return to
   `block dmz docker drop external home internal libvirt libvirt-routed nm-shared public trusted work`,
   `--get-active-zones` to `docker`/`libvirt`/`public (default)`, and
   `--get-default-zone` to `public`.
4. Remove `/tmp/tpc4` and any `/tmp/talos-pilot-c4-20261009` state directory, so
   no synthetic credential file outlives the cluster; verify no `qemu-system`
   process and no `talos*` bridge remain.

Executed on 2026-10-09 after the harness run: all four steps were verified, with
zero fixture rules left, the zone list and active zones back to the state
recorded above, and no QEMU process or bridge.
