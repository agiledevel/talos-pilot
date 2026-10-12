# Talos fixture session runbook

Read the series [README](README.md) first. This runbook is the procedure for one session that uses the disposable Talos fixture. Documents 01 to 04 depend on it.

The [fixture allowlist](../../verification/fixtures/talos-c4-disposable.md) is the authority for what may touch the fixture and the host. The commands below were copied from it on 2026-10-12 for convenience. **If a command here differs from the allowlist, the allowlist wins**, and you record the difference in the [ledger](ledger.md). The allowlist also contains accounts of early failed attempts with "do not retry" statements; its later diagnosis, remediation, and restoration sections supersede those.

## What the fixture is

| Field                 | Value                                                                     |
| --------------------- | ------------------------------------------------------------------------- |
| Fixture ID            | `talos-pilot-c4-20261009` (the only ID the harness accepts)               |
| Provisioner           | Local QEMU through the pinned `talosctl` v1.14.2                          |
| Talos / Kubernetes    | v1.14.2 / v1.36.5                                                         |
| Topology              | 3 control planes and 1 worker                                             |
| Network               | `10.79.0.0/24` on bridge `talosb8c871e1`, gateway `10.79.0.1`             |
| Talos API endpoints   | `10.79.0.2`, `10.79.0.3`, `10.79.0.4` (control planes)                    |
| Nodes                 | `10.79.0.2` to `10.79.0.5`; the worker `10.79.0.5` is not an API endpoint |
| Unassigned address    | `10.79.0.250`, used only by failure cases                                 |
| Kubernetes API        | `https://10.79.0.1:6443` on the 2026-10-12 run; confirm it each time      |
| State and credentials | Everything under `/tmp/tpc4`, removed at the end of the session           |
| Manifest              | [`tests/fixtures/talos-c4.json`](../../../tests/fixtures/talos-c4.json)   |

The fixture holds only synthetic credentials that Talos generates. It is created and destroyed inside one session. Nothing is left running between sessions.

## Rules

- Touch only this fixture. Never contact, inspect, or change any other Docker, libvirt, Talos, or Kubernetes cluster, including the owner's `Win11 Jump` virtual machine.
- Change the host only by the remediation block below, and remove it before the session ends.
- The only Talos actions authorized after provisioning are: issuing the two role-scoped client configurations, rebooting the worker `10.79.0.5` with the admin identity, and sending `SIGSTOP` or `SIGCONT` to the worker's own QEMU process. No reset, no upgrade, and nothing on a control plane.
- Kubernetes actions are authorized only once the allowlist names them. Document 02 adds them before using them.
- **Amend the allowlist before an action it does not yet authorize, never afterwards.**
- If any step is denied by the session's permission policy, stop, restore what you have changed, and record it. Do not work around a denial.

## Step 0: the VPN route

The host routes `10.0.0.0/8` through a VPN interface, `tun0`. While the fixture bridge exists, its connected `/24` route takes precedence, so the host reaches the fixture instead of any VPN host in `10.79.0.0/24`. The owner accepted this indefinitely on 2026-10-12. Do not ask again.

Two things still apply. Never contact a VPN host in that range as part of fixture work. And at the end of the session, `ip route get 10.79.0.2` must match the baseline again, which shows the shadowing ended with the bridge.

## Step 1: tools

1. Provision the pinned toolchain as the series README describes.
2. Confirm `src-tauri/.local-tools/talosctl` reports v1.14.2 and that its SHA-256 matches the `talosctl-linux-amd64` entry in the v1.14.2 release's `sha256sum.txt`. On 2026-10-12 that value was `c6c9552b0e5f767352c595fa1c0af4f186f697488646872955057d23990a66c4`; verify it against the release, do not trust this line.

## Step 2: baseline before provisioning

Capture the host state and keep it in your scratch directory. You will compare against it at the end.

```sh
firewall-cmd --get-default-zone
firewall-cmd --get-zones
firewall-cmd --get-active-zones
sudo -n iptables -S FORWARD
sudo -n iptables -t nat -S POSTROUTING
ip -br link
ip -br addr
ip route get 10.79.0.2
pgrep -a qemu-system
ls -d /tmp/tpc4 /tmp/talos-pilot-c4-20261009
```

Before you continue, all of these must hold:

- no `qemu-system` process;
- no `talos*` bridge and no interface holding a `10.79.0.x` address;
- no rule mentioning `10.79.0` in either `iptables` listing;
- no zone named `talos-pilot-c4`;
- `/tmp/tpc4` and `/tmp/talos-pilot-c4-20261009` do not exist.

If any of them fails, something is left over from an earlier session. Clean only resources whose names begin with `talos-pilot-c4-20261009` or that the restoration checklist names, record what you found, and start again from this step.

On 2026-10-12 the zone list was `block dmz docker drop external home internal libvirt libvirt-routed nm-shared public trusted work`, with default `public`. Compare against your own baseline, not against this line.

## Step 3: host remediation

The guests need DHCP and forwarded egress, which the host's default firewall zone does not allow. Create the fixture-scoped zone first:

```sh
sudo -n firewall-cmd --permanent --new-zone=talos-pilot-c4
sudo -n firewall-cmd --permanent --zone=talos-pilot-c4 --add-service=dhcp
sudo -n firewall-cmd --permanent --zone=talos-pilot-c4 --add-forward
sudo -n firewall-cmd --permanent --zone=talos-pilot-c4 --add-masquerade
sudo -n firewall-cmd --permanent --zone=talos-pilot-c4 --set-target=ACCEPT
sudo -n firewall-cmd --reload
```

The bridge and its guest interfaces do not exist until provisioning starts. The remaining remediation is applied in step 4, as they appear.

## Step 4: provision

Start from an empty state root. A leftover config file makes `talosctl` rename the new context with a `-1` suffix, which then fails the harness identity check.

```sh
sudo -n mkdir -p /tmp/tpc4
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

This command runs for several minutes. Run it in the background and, while it runs, complete the remediation as the interfaces appear:

1. Wait for the bridge `talosb8c871e1` to exist (`ip -br link show talosb8c871e1`).
2. Bind the bridge and each guest interface attached to it to the fixture zone. List the attached interfaces with `ip -br link show master talosb8c871e1`, then for the bridge and each one:

   ```sh
   sudo -n firewall-cmd --zone=talos-pilot-c4 --change-interface=<name>
   ```

   Bind only interfaces attached to this bridge. The host also has Docker bridges with their own `veth` interfaces; never touch those.

3. Open the legacy `iptables` forwarding path for the fixture only:

   ```sh
   sudo -n iptables -I FORWARD -o talosb8c871e1 -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT
   sudo -n iptables -I FORWARD -i talosb8c871e1 -j ACCEPT
   sudo -n iptables -I FORWARD -s 10.79.0.0/24 ! -o talosb8c871e1 -j ACCEPT
   sudo -n iptables -I FORWARD -d 10.79.0.0/24 ! -i talosb8c871e1 -j ACCEPT
   sudo -n iptables -t nat -A POSTROUTING -s 10.79.0.0/24 ! -o talosb8c871e1 -j MASQUERADE
   ```

If `cluster create` times out on its own bootstrap wait while etcd is still starting, the fixture is healthy but unbootstrapped. Complete it once with:

```sh
sudo -n -E /developer/ifjkt/talos-pilot/src-tauri/.local-tools/talosctl \
  --talosconfig /tmp/tpc4/talosconfig --nodes 10.79.0.2 bootstrap
```

and wait until `get members` lists the worker. Record that you needed this fallback.

## Step 5: identities and verification before any test

1. Issue the reader and denied client configurations from the admin one:

   ```sh
   sudo -n -E /developer/ifjkt/talos-pilot/src-tauri/.local-tools/talosctl \
     --talosconfig /tmp/tpc4/talosconfig --nodes 10.79.0.2 \
     config new /tmp/tpc4/talosconfig.reader --roles os:reader --crt-ttl 24h
   sudo -n -E /developer/ifjkt/talos-pilot/src-tauri/.local-tools/talosctl \
     --talosconfig /tmp/tpc4/talosconfig --nodes 10.79.0.2 \
     config new /tmp/tpc4/talosconfig.etcdbackup --roles os:etcd:backup --crt-ttl 24h
   ```

   This signs client certificates and changes nothing on the cluster.

2. Give each of the three contexts the node list, with `talosctl --talosconfig <file> config node 10.79.0.2 10.79.0.3 10.79.0.4 10.79.0.5`. This edits only the client's target selection.
3. The three files are created by root. The test harness runs as your user and must read them. The 2026-10-12 run changed the ownership of exactly those three files to the harness user and kept mode 600. If the allowlist does not name that step when you read it, add it to the allowlist first.
4. Verify, and record in your ledger entry:
   - the Talos version each node reports is v1.14.2;
   - the Kubernetes server version is v1.36.5;
   - the context names are `talos-pilot-c4-20261009`, `reader@talos-pilot-c4-20261009`, and `etcd:backup@talos-pilot-c4-20261009`;
   - the endpoints and nodes match the manifest exactly.

   If anything differs from the manifest, stop. Do not edit the manifest to match an unexpected fixture without understanding why it differs.

## Step 6: run the Talos harness

```sh
pnpm talos:fixture -- --manifest tests/fixtures/talos-c4.json \
  --talosconfig /tmp/tpc4/talosconfig \
  --reader-talosconfig /tmp/tpc4/talosconfig.reader \
  --denied-talosconfig /tmp/tpc4/talosconfig.etcdbackup \
  --talosctl src-tauri/.local-tools/talosctl
```

The script takes file references only. It rejects a talosconfig inside the repository, checks the manifest identity and allowlists, rebuilds the helper, and runs the ignored tests in `src-tauri/tests/talos_fixture.rs`. Keep its full output in your scratch directory and copy the result lines into the ledger entry. Earlier sessions lost their logs; the ledger entry is the only durable record.

The reboot the harness issues waits for the node to be ready again. That took 9 and 16 minutes on 2026-10-12. Do not treat a long reboot as a hang.

## Step 7: destroy and restore

Do this at the end of every session, including one that failed or was interrupted.

1. Destroy only this fixture:

   ```sh
   sudo -n -E /developer/ifjkt/talos-pilot/src-tauri/.local-tools/talosctl \
     --state /tmp/tpc4/state \
     cluster destroy --name talos-pilot-c4-20261009 --force
   ```

2. Remove exactly the five `iptables` rules you added, using the `-D` counterpart of each. Then `sudo -n iptables -S FORWARD | grep -c 10.79.0` and the matching `nat` query must both print `0`.
3. Remove the zone: `sudo -n firewall-cmd --permanent --delete-zone=talos-pilot-c4`, then `sudo -n firewall-cmd --reload`.
4. Remove `/tmp/tpc4` and any `/tmp/talos-pilot-c4-20261009` directory, so no synthetic credential outlives the cluster.
5. Compare with the baseline from step 2. All of these must hold, and each goes into the ledger entry:
   - the zone list, default zone, and active zones equal the baseline;
   - both `10.79.0` rule counts are `0`;
   - no `qemu-system` process, no `talos*` bridge, no fixture interface, and no `10.79.0.x` address;
   - `ip route get 10.79.0.2` matches the baseline again.

If a restoration check fails, fix it before doing anything else, and record what was left and how you removed it.

## What to record

Every fixture session's ledger entry includes: the baseline, the commands run, whether the bootstrap fallback was needed, the verified versions and identities, the harness result lines, and the restoration evidence. Never record credential content, certificate bodies, or raw resource payloads.
