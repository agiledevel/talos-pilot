#!/usr/bin/env bash
# Extract one declared data member, preserving its archive permissions (never
# ownership/ACLs/xattrs), into a new private directory. No package is installed.
set -euo pipefail
if [[ $# != 3 || ! -f $1 || ! $2 =~ ^\./usr/share/(doc/[a-z0-9][a-z0-9+.-]*/copyright|glib-2\.0/schemas/(gschema\.dtd|[A-Za-z0-9][A-Za-z0-9_.-]*\.gschema\.(xml|override)))$ ]]; then
  echo 'Usage: extract-deb-data.sh <authenticated.deb> <./declared-data-member> <new-directory>' >&2
  exit 1
fi
listing=$(timeout 15s bsdtar -tf "$1")
mapfile -t members <<< "$listing"
test "${#members[@]}" -le 4
data=()
for member in "${members[@]}"; do
  if [[ $member =~ ^data\.tar(\.(gz|xz|zst|bz2))?$ ]]; then data+=("$member"); fi
done
test "${#data[@]}" -eq 1
destination=$3
mkdir -m 700 -- "$destination"
cleanup() {
  local status=$?
  if [[ $status != 0 ]]; then rm -rf -- "$destination"; fi
  exit "$status"
}
trap cleanup EXIT
timeout 60s bsdtar -xOf "$1" "${data[0]}" |
  (ulimit -f 1024; timeout 60s bsdtar -xpf - --no-same-owner --no-acls --no-xattrs --no-fflags -C "$3" -- "$2")
