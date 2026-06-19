#!/usr/bin/env bash
# Build, tag, and push the btp-status Docker image.
# Tags the image with the current git commit SHA (immutable) and also as :latest.
# Using a SHA tag guarantees Cloud Foundry pulls a fresh image on every deploy
# instead of reusing a cached :latest layer.
#
# Usage:
#   ./docker/build.sh                          # uses default registry sapux/btp-status
#   REGISTRY=ghcr.io/myorg ./docker/build.sh  # custom registry
#
# After pushing, deploy to CF without a full MTA build:
#   cf push btp-status-srv --docker-image <SHA tag printed below>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

REGISTRY="${REGISTRY:-docker.io/sapux}"
IMAGE="${REGISTRY}/btp-status"
SHA="$(git -C "${REPO_ROOT}" rev-parse --short HEAD)"
SHA_TAG="${IMAGE}:${SHA}"
LATEST_TAG="${IMAGE}:latest"

echo "==> Building ${SHA_TAG}"
docker build -f "${SCRIPT_DIR}/Dockerfile" \
  -t "${SHA_TAG}" \
  -t "${LATEST_TAG}" \
  "${REPO_ROOT}"

echo "==> Pushing ${SHA_TAG}"
docker push "${SHA_TAG}"
echo "==> Pushing ${LATEST_TAG}"
docker push "${LATEST_TAG}"

echo ""
echo "Images pushed:"
echo "  ${SHA_TAG}"
echo "  ${LATEST_TAG}"
echo ""
echo "To update the running CF app without a full MTA build:"
echo "  cf push btp-status-srv --docker-image ${SHA_TAG}"
echo ""
echo "To record the new image in mta.yaml for the next full MTA deploy:"
echo "  sed -i 's|image: .*btp-status:.*|image: ${SHA_TAG}|' ${REPO_ROOT}/mta.yaml"
