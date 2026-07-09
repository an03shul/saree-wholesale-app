#!/usr/bin/env bash
#
# One-command deploy for Gopiram Saree.
#
#   ./scripts/deploy.sh            # deploy everything (backend + mobile web)
#   ./scripts/deploy.sh --backend  # backend only  (push both remotes -> Railway)
#   ./scripts/deploy.sh --web       # mobile web only (build + reclaim Pages prod)
#   ./scripts/deploy.sh --no-push   # skip git push (web build/deploy only)
#
# Why this exists (see CLAUDE.md "Deployment gotchas"):
#   * Railway watches the `nayvert` remote, NOT `origin`. Pushing only origin
#     deploys nothing, silently. This script always pushes BOTH.
#   * The Cloudflare Pages Git auto-build clobbers production on every push with
#     an empty 404ing deployment. To reclaim prod you must wait for that
#     auto-build to land, THEN `wrangler pages deploy` again so yours is newest.
#
set -euo pipefail

# --- config ---------------------------------------------------------------
PAGES_PROJECT="gopiram-app"
BRANCH="main"
REMOTES=(origin nayvert)
AUTOBUILD_WAIT_SECS=180   # max time to wait for the CF Git auto-build to settle

# --- locate repo root -----------------------------------------------------
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# --- pretty logging -------------------------------------------------------
if [[ -t 1 ]]; then
  B=$'\033[1m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; C=$'\033[36m'; X=$'\033[0m'
else
  B=""; G=""; Y=""; R=""; C=""; X=""
fi
step() { echo "${B}${C}==>${X} ${B}$*${X}"; }
ok()   { echo "${G}✔${X} $*"; }
warn() { echo "${Y}!${X} $*"; }
die()  { echo "${R}✗${X} $*" >&2; exit 1; }

# --- args -----------------------------------------------------------------
DO_BACKEND=1; DO_WEB=1; DO_PUSH=1
if [[ $# -gt 0 ]]; then
  for arg in "$@"; do
    case "$arg" in
      --backend) DO_BACKEND=1; DO_WEB=0 ;;
      --web)     DO_BACKEND=0; DO_WEB=1 ;;
      --no-push) DO_PUSH=0 ;;
      -h|--help) sed -n '2,17p' "$0" | sed 's/^#//'; exit 0 ;;
      *) die "unknown arg: $arg (try --help)" ;;
    esac
  done
fi

# --- preflight ------------------------------------------------------------
command -v git >/dev/null      || die "git not found"
current_branch="$(git rev-parse --abbrev-ref HEAD)"
[[ "$current_branch" == "$BRANCH" ]] || warn "on branch '${current_branch}', not '${BRANCH}' — deploying it anyway"
if [[ -n "$(git status --porcelain)" ]]; then
  warn "working tree has uncommitted changes — only COMMITTED code will deploy"
fi

# --- 1. build mobile web (local) ------------------------------------------
# Build before pushing so the local artifact is ready and the CF auto-build
# has time to run concurrently while we build.
if [[ $DO_WEB -eq 1 ]]; then
  command -v npx >/dev/null || die "npx not found (need Node/npm for the web build)"
  step "Building mobile web (expo export + inject-pwa)"
  ( cd mobile && npm run build:web )
  [[ -d mobile/dist ]] || die "build produced no mobile/dist"
  ok "web build ready at mobile/dist"
fi

# --- 2. push to both remotes (triggers Railway + CF auto-build) -----------
autobuild_baseline=""
if [[ $DO_PUSH -eq 1 ]]; then
  if [[ $DO_WEB -eq 1 ]] && command -v npx >/dev/null; then
    # Fingerprint the newest Pages deployment BEFORE pushing so we can detect
    # the auto-build that the push is about to trigger.
    autobuild_baseline="$(npx wrangler pages deployment list --project-name "$PAGES_PROJECT" 2>/dev/null | sed -n '4p' || true)"
  fi
  for r in "${REMOTES[@]}"; do
    step "Pushing ${BRANCH} → ${r}"
    git push "$r" "$BRANCH"
    ok "pushed to ${r}"
  done
  [[ $DO_BACKEND -eq 1 ]] && ok "backend rollout triggered on Railway via 'nayvert' (build + Litestream restore takes a few min)"
else
  warn "skipping git push (--no-push)"
fi

# --- 3. reclaim Cloudflare Pages production -------------------------------
if [[ $DO_WEB -eq 1 ]]; then
  if [[ $DO_PUSH -eq 1 ]]; then
    step "Waiting for the CF Git auto-build to settle before reclaiming prod"
    deadline=$(( SECONDS + AUTOBUILD_WAIT_SECS ))
    settled=0
    while (( SECONDS < deadline )); do
      latest="$(npx wrangler pages deployment list --project-name "$PAGES_PROJECT" 2>/dev/null | sed -n '4p' || true)"
      # Wait until a NEW deployment appeared and it's no longer building/queued.
      if [[ -n "$latest" && "$latest" != "$autobuild_baseline" ]] \
         && ! grep -qiE 'building|queued|in progress' <<<"$latest"; then
        settled=1; break
      fi
      sleep 5
    done
    if [[ $settled -eq 1 ]]; then
      ok "auto-build settled"
    else
      warn "auto-build not detected/settled within ${AUTOBUILD_WAIT_SECS}s — deploying anyway; if prod 404s, re-run: ./scripts/deploy.sh --web --no-push"
    fi
  fi
  step "Deploying mobile/dist → Pages '${PAGES_PROJECT}' (reclaims production)"
  npx wrangler pages deploy mobile/dist --project-name "$PAGES_PROJECT"
  ok "mobile web is live (app.gopiramsarees.in / ${PAGES_PROJECT}.pages.dev)"
fi

echo
ok "${B}Deploy complete.${X}"
[[ $DO_BACKEND -eq 1 && $DO_PUSH -eq 1 ]] && echo "  • Backend: verify rollout by probing changed behavior — /api/health has no version marker."
