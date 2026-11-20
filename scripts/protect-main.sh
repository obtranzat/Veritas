#!/usr/bin/env bash
# Apply the GitHub main-branch protection ruleset (.github/rulesets/protect-main.json)
# Requires either authenticated `gh` CLI OR `GITHUB_TOKEN` (repo admin scope) env var.
set -euo pipefail

REPO="${1:-obtranzat/Veritas}"
RULESET_FILE=".github/rulesets/protect-main.json"

if [ ! -f "$RULESET_FILE" ]; then
  echo "Error: $RULESET_FILE not found. Run from repository root." >&2
  exit 1
fi

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  echo "Applying ruleset to ${REPO} via GitHub CLI..."
  gh api "repos/${REPO}/rulesets" \
    --method POST \
    -H "Accept: application/vnd.github+json" \
    --input "$RULESET_FILE"
  echo "Done. Main branch is now protected."
  exit 0
fi

if [ -z "${GITHUB_TOKEN:-}" ]; then
  cat >&2 <<'EOF'
Error: Neither an authenticated `gh` session nor `GITHUB_TOKEN` environment variable is set.
Option 1 (GitHub Web UI — easiest):
  Open https://github.com/obtranzat/Veritas/settings/rules -> New ruleset -> Import a ruleset
  and upload `.github/rulesets/protect-main.json`.

Option 2 (CLI):
  export GITHUB_TOKEN="your_admin_pat_here"
  bash scripts/protect-main.sh obtranzat/Veritas
EOF
  exit 1
fi

echo "Applying ruleset to ${REPO} via GitHub REST API..."
curl -fsS -X POST "https://api.github.com/repos/${REPO}/rulesets" \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -d @"$RULESET_FILE"
echo ""
echo "Done. Main branch on ${REPO} is now protected."
