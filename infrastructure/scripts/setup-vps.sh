#!/bin/bash
set -euo pipefail

# =============================================================================
# Pyramid Backstage — one-time VPS bootstrap. Run once on a fresh Hetzner Cloud
# server (Ubuntu 24.04) as root:  sudo bash setup-vps.sh
# Installs Docker, creates the `deploy` user, hardens SSH + firewall.
# =============================================================================

APP_DIR="/opt/pyramid"
DEPLOY_USER="deploy"

echo "=== Pyramid Backstage VPS setup ==="

echo "[1/8] Updating system..."
apt-get update && apt-get upgrade -y

echo "[2/8] Installing base packages..."
apt-get install -y ca-certificates curl gnupg lsb-release ufw fail2ban unattended-upgrades apt-listchanges

echo "[3/8] Installing Docker..."
if ! command -v docker &>/dev/null; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" \
        > /etc/apt/sources.list.d/docker.list
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable docker && systemctl start docker
fi

echo "[4/8] Verifying Docker Compose..."
docker compose version || apt-get install -y docker-compose-plugin

echo "[5/8] Creating deploy user..."
if ! id "$DEPLOY_USER" &>/dev/null; then
    useradd -m -s /bin/bash "$DEPLOY_USER"
    usermod -aG docker "$DEPLOY_USER"
    mkdir -p /home/$DEPLOY_USER/.ssh
    chmod 700 /home/$DEPLOY_USER/.ssh
    touch /home/$DEPLOY_USER/.ssh/authorized_keys
    chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys
    chown -R $DEPLOY_USER:$DEPLOY_USER /home/$DEPLOY_USER/.ssh
fi

echo "[6/8] Creating app directory..."
mkdir -p $APP_DIR/{nginx/conf.d,db,certbot/conf,certbot/www,scripts}
chown -R $DEPLOY_USER:$DEPLOY_USER $APP_DIR

echo "[7/8] Configuring firewall..."
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "[8/8] Hardening (fail2ban, SSH, auto-updates)..."
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 7200
EOF
systemctl enable fail2ban && systemctl restart fail2ban

if ! grep -q "^# Hardened by setup-vps.sh" /etc/ssh/sshd_config; then
    cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak
    cat >> /etc/ssh/sshd_config <<'EOF'

# Hardened by setup-vps.sh
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
X11Forwarding no
AllowTcpForwarding no
EOF
fi

cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
systemctl enable unattended-upgrades && systemctl start unattended-upgrades

echo ""
echo "=== Setup complete ==="
echo "VPS IP: $(hostname -I | awk '{print $1}')"
echo ""
echo "NEXT:"
echo "  1. Add your deploy SSH PUBLIC key:"
echo "       echo 'ssh-ed25519 AAAA... you@host' >> /home/$DEPLOY_USER/.ssh/authorized_keys"
echo "  2. Verify login:  ssh $DEPLOY_USER@<VPS_IP>"
echo "  3. Apply hardened SSH:  systemctl restart ssh"
echo "  4. Set GitHub repo secrets, then push to main to deploy."
