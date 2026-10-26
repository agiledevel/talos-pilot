#!/usr/bin/env bash
# Hosted Ubuntu only. Isolated apt sources retain Ubuntu's signed metadata and
# package hashes; no runner-wide mirror/configuration changes and no host use.
set -euo pipefail

apt_get() {
  sudo --preserve-env=APT_CONFIG apt-get "$@"
}

# Bound network-only phases, never kill dpkg halfway through configuration.
fetch_packages() {
  local mirror=$1
  shift
  printf 'deb [signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] %s %s main restricted universe multiverse\n' "$mirror" "$VERSION_CODENAME" > "$apt_root/sources.list"
  printf 'deb [signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] %s %s-updates main restricted universe multiverse\n' "$mirror" "$VERSION_CODENAME" >> "$apt_root/sources.list"
  printf 'deb [signed-by=/usr/share/keyrings/ubuntu-archive-keyring.gpg] https://security.ubuntu.com/ubuntu %s-security main restricted universe multiverse\n' "$VERSION_CODENAME" >> "$apt_root/sources.list"
  timeout 90s sudo --preserve-env=APT_CONFIG apt-get update --error-on=any &&
    timeout 180s sudo --preserve-env=APT_CONFIG apt-get install -y --no-install-recommends --download-only "$@"
}

install_packages() {
  if ! fetch_packages https://archive.ubuntu.com/ubuntu "$@"; then
    echo '::warning title=Ubuntu mirror::Primary download failed; trying the official Azure Ubuntu mirror once.'
    fetch_packages https://azure.archive.ubuntu.com/ubuntu "$@" || return $?
  fi
  # Authentication happened during update/download. No new network work is
  # permitted while dpkg runs; a missing archive is a failure, never a bypass.
  apt_get install -y --no-install-recommends --no-download "$@"
}

# Parse the pinned CLI's report without evaluating shell fragments or accepting
# an unexpected CLI failure as an empty dependency list.
browser_packages() {
  local report=$1 status=$2
  if [[ $status == 0 && $report == 'All system dependencies are installed.' ]]; then
    return 0
  fi
  local header=${report%%$'\n'*}
  if [[ $status != 1 || ! $header =~ ^Missing\ system\ dependencies\ \(([1-9][0-9]*)\):$ ]]; then
    echo 'Unrecognised Playwright dependency report.' >&2
    return 1
  fi
  local expected=${BASH_REMATCH[1]} line
  local parsed=()
  while IFS= read -r line; do
    if [[ ! $line =~ ^\ \ [a-z0-9][a-z0-9+.:-]*$ ]]; then
      echo 'Invalid Playwright dependency package.' >&2
      return 1
    fi
    parsed+=("${line#  }")
  done <<< "${report#*$'\n'}"
  if [[ ${#parsed[@]} != "$expected" || ${#parsed[@]} -gt 200 ]]; then
    echo 'Playwright dependency count mismatch or limit exceeded.' >&2
    return 1
  fi
  printf '%s\n' "${parsed[@]}"
}

main() {
  if [[ ${RUNNER_ENVIRONMENT:-} != github-hosted || ${RUNNER_OS:-} != Linux ]]; then
    echo 'Run this provisioning script only on an ephemeral GitHub-hosted Linux runner.' >&2
    return 1
  fi
  # shellcheck source=/dev/null
  source /etc/os-release
  if [[ $ID != ubuntu || ! $VERSION_CODENAME =~ ^(jammy|noble)$ ]]; then
    echo 'Only Ubuntu 22.04 and 24.04 are supported.' >&2
    return 1
  fi
  apt_root=$(mktemp -d "${RUNNER_TEMP:?}/talos-apt.XXXXXX")
  trap 'sudo rm -rf -- "$apt_root"' EXIT
  export APT_CONFIG="$apt_root/apt.conf"
  mkdir -p "$apt_root/lists/partial" "$apt_root/archives/partial" "$apt_root/sourceparts"
  chmod 755 "$apt_root"
  # _apt can read metadata and write its own partial downloads without disabling
  # its sandbox. The entire directory belongs to this ephemeral runner's job.
  sudo chown _apt "$apt_root/lists/partial" "$apt_root/archives/partial"
  printf 'Dir::Etc::sourcelist "%s/sources.list";\nDir::Etc::sourceparts "%s/sourceparts";\nDir::State::lists "%s/lists";\nDir::Cache::archives "%s/archives";\nAcquire::Retries "1";\nAcquire::http::Timeout "15";\nAcquire::https::Timeout "15";\nAPT::Get::Assume-Yes "true";\n' "$apt_root" "$apt_root" "$apt_root" "$apt_root" > "$APT_CONFIG"
  local mode=${1:-}
  local packages=(libwebkit2gtk-4.1-dev libgtk-3-dev libdbus-1-dev libxdo-dev build-essential pkg-config)
  case "$mode" in
    security) ;;
    native) packages+=(xvfb) ;;
    # The release build also inspects the RPM/AppImage payloads with rpm2cpio and cpio.
    release) packages+=(librsvg2-dev patchelf libfuse2 rpm cpio) ;;
    browser)
      # Ask the pinned Playwright CLI which system packages are missing. Its
      # dry-run exits 1 when packages are missing; other failures must not be
      # mistaken for an empty package list. Never eval CLI output.
      fetch_packages https://archive.ubuntu.com/ubuntu ca-certificates || fetch_packages https://azure.archive.ubuntu.com/ubuntu ca-certificates || return $?
      local report parsed status=0
      report=$(node node_modules/@playwright/test/cli.js install-deps --dry-run chromium) || status=$?
      parsed=$(browser_packages "$report" "$status") || return $?
      if [[ -z $parsed ]]; then
        printf '%s\n' "$report"
        return 0
      fi
      mapfile -t packages <<< "$parsed"
      ;;
    *) echo "Unknown prerequisite mode: $mode" >&2; return 1 ;;
  esac
  install_packages "${packages[@]}"
  if [[ $mode == browser ]]; then
    node node_modules/@playwright/test/cli.js install-deps --dry-run chromium
  fi
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  main "$@"
fi
