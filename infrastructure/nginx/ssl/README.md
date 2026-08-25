# Placeholder for SSL certificates

# In production, use Alibaba Cloud Certificate Service or Let's Encrypt

#

# Required files:

# ssl/server.crt - SSL certificate

# ssl/server.key - Private key

# ssl/ca.crt - CA bundle (optional)

#

# Generate self-signed cert for testing:

# openssl req -x509 -nodes -days 365 -newkey rsa:2048 \

# -keyout server.key -out server.crt \

# -subj "/CN=qwen-autopilot.example.com"
