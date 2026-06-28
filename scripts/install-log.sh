#!/bin/bash
# Shared installer logging. Source this after ROOT is set.

setup_install_log() {
  local script_name="$1"
  local log_dir="$HOME/Library/Logs/Vox"
  local log_file="$log_dir/install.log"
  local git_sha="unknown"

  mkdir -p "$log_dir"

  if command -v git >/dev/null 2>&1 && [[ -n "${ROOT:-}" ]]; then
    git_sha="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")"
  fi

  {
    echo ""
    echo "===== $script_name ====="
    echo "Started: $(date)"
    echo "macOS: $(sw_vers -productVersion 2>/dev/null || echo "unknown")"
    echo "Arch: $(uname -m 2>/dev/null || echo "unknown")"
    echo "Git: $git_sha"
    echo ""
  } >> "$log_file"

  sync
  exec > >(tee -a "$log_file") 2>&1
  echo "[vox] Install log: $log_file"
}
