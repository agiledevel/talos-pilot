# C4 disposable Talos fixture allowlist

Status: **provisioned, exercised, and destroyed on 2026-10-09 and again on
2026-10-12; an additional F1a preflight provisioned and destroyed the fixture
on 2026-10-12 without running the harness; no fixture exists now.** The
2026-10-12 run executed the full
harness command with all four file references: six of the seven live rows
passed and the live retry-exhaustion row stayed open, recorded in the
[milestone ledger](../milestone-1.md#f1-packet-evidence-part-3-live-fixture-rows-on-the-unsandboxed-host--2026-10-12).
The owner then re-scoped that row and removed it from the harness, which now
holds six live rows; see the
[closure entry](../milestone-1.md#f1-closure-and-f2-acceptance--owner-decisions-2026-10-12).
The accounts of the first failed attempts below are historical. The diagnosis,
applied remediation, and restoration sections supersede their "do not retry" and
"no endpoint is allowlisted" statements.

This allowlist authorizes only the local C4 fixture below. It does not authorize
use of any other Docker, libvirt, Talos, or Kubernetes cluster.

## Identity and scope

| Field                         | Authorized value                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Fixture ID                    | `talos-pilot-c4-20261009`                                                                                       |
| Provisioner                   | Local QEMU through the official pinned `talosctl` 1.14.2 binary                                                 |
| Talos image                   | `ghcr.io/siderolabs/talos:v1.14.2`                                                                              |
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
    --talos-version v1.14.2 \
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

### Re-application authorization (2026-10-11)

The owner confirmed on 2026-10-11 that the same fixture-scoped remediation above
may be re-applied for the foundation completion phase, packets F1–F5. One
confirmation covers those packets. Nothing broader is authorized: no rule, zone,
or interface outside this fixture's own bridge and CIDR, and no change to the
host's default zone. Each session re-applies these rules only to reprovision,
destroys the fixture, and completes the restoration checklist below before it
ends, unless the owner separately agrees to leave something in place and the
session's ledger entry names it.

The Talos patch refresh that packet F1 had to perform — `talosctl`, the image,
the Go module, and this manifest together — was executed with the pins in the
identity table above; the [2026-10-12 identities below](#host-issued-identities-2026-10-12-run)
record the first executed run on `v1.14.2`, and the 2026-10-09 `v1.14.1`
section remains that run's historical record.

## F1 authorized fixture-local actions (2026-10-11)

Packet F1 performs three actions the earlier allowlist did not name. Each is
confined to this fixture and none mutates a Talos or Kubernetes resource.

**1. Issuing role-scoped client configurations.** The fixture issues only an
admin talosconfig, so F1 mints the reader and denied identities from it with the
pinned CLI, against the first control-plane endpoint:

```sh
sudo -n -E /developer/ifjkt/talos-pilot/src-tauri/.local-tools/talosctl \
  --talosconfig /tmp/tpc4/talosconfig --nodes 10.79.0.2 \
  config new /tmp/tpc4/talosconfig.reader --roles os:reader --crt-ttl 24h
sudo -n -E /developer/ifjkt/talos-pilot/src-tauri/.local-tools/talosctl \
  --talosconfig /tmp/tpc4/talosconfig --nodes 10.79.0.2 \
  config new /tmp/tpc4/talosconfig.etcdbackup --roles os:etcd:backup --crt-ttl 24h
```

This is certificate issuance, not a cluster change: `config new` calls
`/machine.MachineService/GenerateClientConfiguration`, whose handler in the
pinned Talos source signs a client certificate from the machine's existing
secrets bundle and persists nothing on the node
([`v1alpha1_server.go`](https://github.com/siderolabs/talos/blob/v1.14.2/internal/app/machined/internal/server/v1alpha1/v1alpha1_server.go)).
Both new contexts inherit the fixture's endpoints. Neither carries the node
list the probe needs, so each gets it the same way the admin context does, with
`talosctl config node 10.79.0.2 10.79.0.3 10.79.0.4 10.79.0.5`; this changes
only the client's target selection. All three files live under `/tmp/tpc4` and
are removed with it.

**2. Producing real status events and a real interruption on the worker only.**
The worker `10.79.0.5` is not a control plane, so neither action can affect etcd
quorum, and the three-control-plane set stays untouched:

```sh
sudo -n -E /developer/ifjkt/talos-pilot/src-tauri/.local-tools/talosctl \
  --talosconfig /tmp/tpc4/talosconfig --nodes 10.79.0.5 reboot
```

A reboot is the only lifecycle action authorized here. `/machine.MachineService/Reboot`
accepts `os:admin` and `os:operator` and is not granted to `os:reader`; `/Reset`
and `/Upgrade` remain forbidden. For a network interruption without a lifecycle
change, the worker's own QEMU process may be suspended and resumed with
`SIGSTOP`/`SIGCONT`, identified by the fixture's `--state` directory and machine
name — never by a wildcard, and never a control-plane guest.

**3. The Kubernetes API endpoint F3 will read.** The 2026-10-11 run resolved
it to `https://10.79.0.1:6443`: the provisioner's cluster VIP on the bridge
gateway, not a control-plane address. That address is outside the Talos
endpoint allowlist above, so F3 must add it as a Kubernetes endpoint rather than
reuse the Talos one, and must confirm the literal endpoint, CA, and server
version from `/tmp/tpc4/kubeconfig` at its own provisioning before its first
request. This entry records the endpoint's identity as belonging to the fixture;
it does not authorize an unverified address.

Neither action authorizes a host firewall, zone, or interface change beyond the
remediation recorded above, and both are removed by the restoration checklist.

### F1 part 2 execution form (2026-10-11)

Packet F1 part 2 executes the two authorized actions above through the live
fixture tests in `src-tauri/tests/talos_fixture.rs`, under exactly the recorded
authority:

- the worker reboot runs as `sudo -n -E <pinned talosctl> --talosconfig
  /tmp/tpc4/talosconfig --nodes <worker> reboot` — the recorded command — with
  the target asserted against the manifest node allowlist before dispatch. The
  pinned `talosctl` is passed by file reference (`--talosctl` to
  `pnpm talos:fixture`), never by inline content;
- the worker's QEMU process is suspended and resumed with `sudo -n kill
  -STOP/-CONT <pid>` only after the pid is resolved from `/proc` by **both**
  this fixture's `--state` directory and the machine name
  `talos-pilot-c4-20261009-worker-1`. No process that fails either match is
  ever signalled.

No new mutation is authorized by this entry: the reboot remains the only
lifecycle action, `/Reset` and `/Upgrade` remain forbidden, the three control
planes stay untouched, and every live case ends by waiting for the worker to
report `running` again before the next case starts.

Since the 2026-10-12 closure the harness no longer suspends the worker: the live
exhaustion row that did so was removed. The `SIGSTOP`/`SIGCONT` authority above
is unchanged, and packet F1a's live stall row is its next user.

## F3 Kubernetes list-probe actions (2026-10-13)

Document 02 is the only packet authorized to use this Kubernetes API endpoint.
The server endpoint `https://10.79.0.1:6443` and expected Kubernetes version
`v1.36.5` were last reported on 2026-10-12; document 02 must re-confirm both
against the current `/tmp/tpc4/kubeconfig` before its first live test. The
current run's cluster CA fingerprint is recorded in the checked manifest after
provisioning, then the harness verifies that it matches the kubeconfig before
any API request. A fingerprint mismatch, endpoint mismatch, or version mismatch
stops the run without setup or cleanup requests.
The current kubeconfig context is `admin@talos-pilot-c4-20261009`; the harness
checks this selected context before opening the Kubernetes session.

The setup credential is the fixture's admin kubeconfig, passed only as an
external file reference to `pnpm kubernetes:fixture`. It may perform only:

- change ownership of exactly `/tmp/tpc4/kubeconfig` to the harness user and
  keep its mode at `0600`, so the user-scoped harness can read it. This changes
  no credential bytes; the file is removed with `/tmp/tpc4` during restoration.

- `GET` the one named namespace `talos-pilot-list-probe` to prove it does not
  already exist, then create that namespace;
- create the `list-reader` ServiceAccount, the `list-reader` Role, and the
  `list-reader` RoleBinding inside that namespace; the Role grants only
  `get` and `list` on core `pods` in that namespace;
- create exactly 201 minimal synthetic Pods named
  `list-probe-000` through `list-probe-200` in that namespace, and request one
  short-lived ServiceAccount token through the `serviceaccounts/token`
  subresource for the restricted read test;
- read the fixture server version at `/version` before any fixture test, as
  directed by the owner on 2026-10-13.

No cluster-scoped resource may be created or changed, no other namespace may be
read or changed, and no Talos resource is changed. The generated ServiceAccount
token is held only in zeroizing backend memory and in a temporary kubeconfig
outside the repository; the harness removes that file on exit.

Cleanup authority is limited to deleting those exact 201 generated Pod names,
the named RoleBinding, Role, and ServiceAccount in the allowlisted namespace,
and finally the namespace only if its UID still matches the UID recorded at
creation. The harness verifies that the namespace is gone. It never cleans up a
namespace it did not create, one whose UID changed, or an object outside these
exact names. The runbook's fixture destroy-and-restore procedure remains
mandatory whether setup, a list read, or cleanup succeeds or fails.

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

## Host-issued identities (2026-10-12 run)

- Provisioned and destroyed on 2026-10-12 with the same fixture ID, CIDR,
  topology, and commands as the sections above; no bootstrap timeout, so the
  recorded fallback was not used.
- QEMU bridge: `talosb8c871e1` on `10.79.0.1/24`, four guests, bound to the
  `talos-pilot-c4` zone together with its four veths while the fixture existed.
- Talos API endpoints: `10.79.0.2`, `10.79.0.3`, `10.79.0.4`; node targets
  `10.79.0.2`–`10.79.0.5` (the worker is deliberately not an API endpoint);
  unassigned in-CIDR address `10.79.0.250` used only by the failure cases.
- Talos version reported by the API: `v1.14.2`; Kubernetes server version
  `v1.36.5`; hostnames `talos-pilot-c4-20261009-controlplane-1..3` and
  `...-worker-1`.
- Contexts: `talos-pilot-c4-20261009` (admin, 1,775 bytes) plus
  `reader@talos-pilot-c4-20261009` (1,789 bytes) and
  `etcd:backup@talos-pilot-c4-20261009` (1,811 bytes); each lists the four
  nodes. The three files were mode 600, readable by the unprivileged harness
  user, and removed with `/tmp/tpc4`.
- Kubernetes API endpoint: `https://10.79.0.1:6443`, unchanged from the
  2026-10-11 recording.
- Cached installer image: Image Factory ISO
  `376567988ad370138ad8b2698212367b8edcb69b5fd68c80be1f2ec7d603b4ba`
  (`v1.14.2` metal-amd64), SHA-256
  `e230299bf831f3de962b66226a29b45ca185d23a390a7eb2bd889c9e522846cd`.
- Pinned `talosctl` v1.14.2 SHA-256
  `c6c9552b0e5f767352c595fa1c0af4f186f697488646872955057d23990a66c4`, matching
  the release `sha256sum.txt` `talosctl-linux-amd64` entry.
- Restoration: both `10.79.0` rule counters `0`; zone list, default zone, and
  active zones back to the pre-provisioning baseline; `/tmp/tpc4` and any
  `/tmp/talos-pilot-c4-*` removed; no `qemu-system` process, `talos*` bridge, or
  fixture veth left; `10.79.0.0/24` routed through `tun0` again.

## Harness command

Run from a repository checkout while the fixture above is provisioned:

```sh
pnpm talos:fixture -- --manifest tests/fixtures/talos-c4.json \
  --talosconfig /tmp/tpc4/talosconfig
```

[`scripts/talos-fixture.ts`](../../../scripts/talos-fixture.ts) takes file
_references_ only — credential content never appears in an argument or an
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
   process and no `talos*` bridge or leftover fixture `veth` remain.

Step 3's expected active-zone tuple is host-state-dependent: the 2026-10-09 run
recorded `docker`/`libvirt`/`public`, and the 2026-10-11 run restored to
`docker`/`public` because `libvirtd` is inactive on this host and `virbr124` no
longer exists. Compare against the baseline captured immediately before
provisioning, not against the older tuple. The zone _list_, the default zone,
the two `iptables` counters, and the absence of fixture interfaces are the
invariants that must hold.

Executed on 2026-10-09 after the harness run: all four steps were verified, with
zero fixture rules left, the zone list and active zones back to the state
recorded above, and no QEMU process or bridge.

Executed again on 2026-10-12 after both harness runs: all four steps were
verified against a fresh pre-provisioning baseline, with zero fixture rules
left, the zone list, default zone, and active zones restored exactly,
`/tmp/tpc4` removed, and no QEMU process, `talos*` bridge, or fixture veth
remaining.
