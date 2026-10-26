#!/usr/bin/env bash
# Extract a built RPM into a caller-owned temporary directory; never install it.
# RPM 4.17 rpm2cpio compares copied bytes with LONGARCHIVESIZE even when that
# optional tag is absent in Tauri's rpm-rs output, then silently exits 1 after
# copying the payload. libarchive handles that format without ignoring errors.
set -euo pipefail

if [[ $# != 2 || ! -f $1 || ! -d $2 ]]; then
  echo 'Usage: extract-rpm.sh <existing-package.rpm> <existing-private-directory>' >&2
  exit 1
fi

printf 'Inspecting RPM payload with libarchive: %s\n' "$1"
# The destination belongs to this inspection, not to a system install. Never
# restore archive owners. A corrupt archive, missing tool or timeout is fatal.
timeout 60s bsdtar --no-same-owner -xf "$1" -C "$2"
