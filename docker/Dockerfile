FROM node:22

# git — clone the app at build time
# openssh-server — required for `cf ssh` access on Cloud Foundry Docker deployments
# ca-certificates — HTTPS git clone and outbound service calls
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    openssh-server \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# CF SSH: sshd needs this directory at runtime
RUN mkdir -p /var/run/sshd

# Clone the application (always pulls latest main)
RUN git clone https://github.com/sap-pilot/btp-status /app

WORKDIR /app

# Install all npm workspace dependencies (includes the playwright package)
RUN npm ci

# Download the Playwright-managed Chromium binary and install every OS-level
# library it needs (libatk, libgbm, libnss3, libxkbcommon, etc.) in one step.
# --no-shell silences the "install system deps" interactive prompt.
RUN npx playwright install --with-deps chromium

# Build React client into server/public, then compile server TypeScript
RUN npm run build

# Cloud Foundry sets PORT dynamically at runtime; Express reads process.env.PORT.
# EXPOSE is documentation only — CF ignores it and uses its own routing.
EXPOSE 3000

CMD ["npm", "start"]
