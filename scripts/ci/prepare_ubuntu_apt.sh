#!/usr/bin/env bash
set -euo pipefail

# Only change the disposable GitHub runner, never a developer workstation.
if [[ "${GITHUB_ACTIONS:-}" != "true" ]]; then
  echo 'This setup is restricted to GitHub Actions runners' >&2
  exit 1
fi

# Azure's mirror DNS failed in run 43046266839. Keep Ubuntu signing checks;
# switch only the runner mirror list to Ubuntu's official HTTPS archive.
if [[ -f /etc/apt/apt-mirrors.txt ]]; then
  printf '%s\n' 'https://archive.ubuntu.com/ubuntu/' | sudo tee /etc/apt/apt-mirrors.txt >/dev/null
fi
printf '%s\n' 'Acquire::Retries "2";' 'Acquire::http::Timeout "30";' 'Acquire::https::Timeout "30";' \
  | sudo tee /etc/apt/apt.conf.d/80-rslhelper-ci-timeouts >/dev/null
