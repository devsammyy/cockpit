#!/usr/bin/env bash
# ─── Alibaba Cloud ECS Deployment Script ───
# Provisions an ECS instance and bootstraps the full production stack:
# application, monitoring overlay, backup cron, and firewall notes.
# Prerequisites: aliyun CLI configured (aliyun configure), SSH key pair
# registered in the region, Security Group and VSwitch created (see
# docs/operations/alibaba-cloud-integration.md for the console walkthrough).
set -euo pipefail

# ─── Configuration ───
REGION="${ALICLOUD_REGION:-ap-southeast-1}"
INSTANCE_TYPE="${ECS_INSTANCE_TYPE:-ecs.g7.xlarge}"
IMAGE_ID="${ECS_IMAGE_ID:-ubuntu_22_04_x64_20G_alibase_20240101.vhd}"
SECURITY_GROUP_ID="${ECS_SECURITY_GROUP_ID:?Set ECS_SECURITY_GROUP_ID}"
VSWITCH_ID="${ECS_VSWITCH_ID:?Set ECS_VSWITCH_ID}"
KEY_PAIR_NAME="${ECS_KEY_PAIR:-qwen-autopilot-key}"
INSTANCE_NAME="qwen-autopilot-prod"
REPO_URL="${REPO_URL:-https://github.com/devsammyy/qwen_hack.git}"
# Image tag to deploy (git SHA from CI or release version like v1.2.3)
IMAGE_TAG="${IMAGE_TAG:-latest}"
ACR_REGISTRY="${ACR_REGISTRY:-registry.ap-southeast-1.aliyuncs.com}"
ACR_NAMESPACE="${ACR_NAMESPACE:-qwen-autopilot}"
# ACR credentials (required for pulling images)
ACR_USERNAME="${ACR_USERNAME:?Set ACR_USERNAME}"
ACR_PASSWORD="${ACR_PASSWORD:?Set ACR_PASSWORD}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Qwen Autopilot — Alibaba Cloud ECS Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Region:          ${REGION}"
echo "Instance Type:   ${INSTANCE_TYPE}"
echo ""

# ─── Step 1: Create ECS Instance ───
echo "[1/5] Creating ECS instance..."
INSTANCE_ID=$(aliyun ecs CreateInstance \
  --RegionId "${REGION}" \
  --InstanceType "${INSTANCE_TYPE}" \
  --ImageId "${IMAGE_ID}" \
  --SecurityGroupId "${SECURITY_GROUP_ID}" \
  --VSwitchId "${VSWITCH_ID}" \
  --InstanceName "${INSTANCE_NAME}" \
  --KeyPairName "${KEY_PAIR_NAME}" \
  --InternetMaxBandwidthOut 100 \
  --SystemDisk.Category cloud_essd \
  --SystemDisk.Size 100 \
  --Description "Qwen Autopilot AI Platform - Production" \
  --Tags.1.Key "project" \
  --Tags.1.Value "qwen-autopilot" \
  --Tags.2.Key "environment" \
  --Tags.2.Value "production" \
  2>/dev/null | jq -r '.InstanceId') || true

if [ -z "${INSTANCE_ID}" ] || [ "${INSTANCE_ID}" = "null" ]; then
  echo "  ℹ️  Instance may already exist. Looking up..."
  INSTANCE_ID=$(aliyun ecs DescribeInstances \
    --RegionId "${REGION}" \
    --InstanceName "${INSTANCE_NAME}" \
    2>/dev/null | jq -r '.Instances.Instance[0].InstanceId')
fi

echo "  ✅ Instance ID: ${INSTANCE_ID}"

# ─── Step 2: Allocate Public IP ───
echo "[2/5] Allocating public IP..."
aliyun ecs AllocatePublicIpAddress --InstanceId "${INSTANCE_ID}" 2>/dev/null || true

# ─── Step 3: Start Instance ───
echo "[3/5] Starting ECS instance..."
aliyun ecs StartInstance --InstanceId "${INSTANCE_ID}" 2>/dev/null || true
sleep 30

# ─── Step 4: Get Public IP ───
echo "[4/5] Retrieving public IP..."
PUBLIC_IP=$(aliyun ecs DescribeInstances \
  --RegionId "${REGION}" \
  --InstanceIds "[\"${INSTANCE_ID}\"]" \
  2>/dev/null | jq -r '.Instances.Instance[0].PublicIpAddress.IpAddress[0]')

echo "  ✅ Public IP: ${PUBLIC_IP}"

# ─── Step 5: Bootstrap Instance ───
echo "[5/5] Bootstrapping instance (Docker, repo, secrets, stack, backups)..."
ssh -o StrictHostKeyChecking=no -i ~/.ssh/"${KEY_PAIR_NAME}".pem root@"${PUBLIC_IP}" \
  REPO_URL="${REPO_URL}" \
  QWEN_API_KEY="${QWEN_API_KEY:-}" \
  IMAGE_TAG="${IMAGE_TAG}" \
  ACR_REGISTRY="${ACR_REGISTRY}" \
  ACR_NAMESPACE="${ACR_NAMESPACE}" \
  ACR_USERNAME="${ACR_USERNAME}" \
  ACR_PASSWORD="${ACR_PASSWORD}" \
  'bash -s' << 'REMOTE_SCRIPT'
set -euo pipefail

# Install Docker
if ! command -v docker > /dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker && systemctl start docker
fi

# Clone / update repository
mkdir -p /opt/qwen-autopilot
cd /opt/qwen-autopilot
if [ ! -d ".git" ]; then
  git clone "${REPO_URL}" .
else
  git fetch origin main && git reset --hard origin/main
fi

# Create production environment from template with generated secrets
if [ ! -f .env ]; then
  cp .env.production.example .env
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 16)|" .env
  sed -i "s|^JWT_ACCESS_TOKEN_SECRET=.*|JWT_ACCESS_TOKEN_SECRET=$(openssl rand -hex 32)|" .env
  sed -i "s|^CREDENTIAL_ENCRYPTION_KEY=.*|CREDENTIAL_ENCRYPTION_KEY=$(openssl rand -hex 16)|" .env
  sed -i "s|^GRAFANA_ADMIN_PASSWORD=.*|GRAFANA_ADMIN_PASSWORD=$(openssl rand -hex 12)|" .env
  if [ -n "${QWEN_API_KEY:-}" ]; then
    sed -i "s|^QWEN_API_KEY=.*|QWEN_API_KEY=${QWEN_API_KEY}|" .env
  fi
  # Set image tag for pinned deployment
  sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=${IMAGE_TAG}|" .env
  chmod 600 .env
  echo "Generated .env — review QWEN_API_KEY and CORS_ORIGINS before go-live"
fi

# Login to ACR
docker login \
  --username="${ACR_USERNAME}" \
  --password="${ACR_PASSWORD}" \
  "${ACR_REGISTRY}"

# Deploy application + monitoring stack using pinned images from ACR
export IMAGE_TAG ACR_REGISTRY ACR_NAMESPACE
docker compose -f docker-compose.production.yml -f docker-compose.monitoring.yml pull backend frontend
docker compose -f docker-compose.production.yml -f docker-compose.monitoring.yml up -d --remove-orphans

# Install nightly backups + weekly restore verification
./infrastructure/scripts/install-backup-cron.sh

echo "✅ Qwen Autopilot deployed"
REMOTE_SCRIPT

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Deployment Complete!"
echo "  Instance:  ${INSTANCE_ID}"
echo "  IP:        ${PUBLIC_IP}"
echo "  App:       http://${PUBLIC_IP}"
echo "  API:       http://${PUBLIC_IP}/api/v1/health"
echo "  Grafana:   http://${PUBLIC_IP}/grafana/"
echo ""
echo "  Next steps:"
echo "  1. Point DNS at ${PUBLIC_IP} (Alibaba Cloud DNS)"
echo "  2. Enable TLS: ./infrastructure/scripts/enable-tls.sh <domain> <email>"
echo "  3. Configure GitHub secrets for CI/CD (see docs/operations/ci-cd.md)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
