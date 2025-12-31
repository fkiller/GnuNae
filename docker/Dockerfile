# GnuNae Sandbox Container
# 
# This image provides an isolated execution environment with:
# - Codex CLI for AI-powered automation
# - Playwright with browsers for web automation
# - noVNC for optional browser streaming
# - Python environment with custom tools

FROM mcr.microsoft.com/playwright:v1.40.0-jammy

# Set environment variables
ENV DEBIAN_FRONTEND=noninteractive \
    NODE_ENV=production \
    # Display for Xvfb
    DISPLAY=:99 \
    # CDP port (configurable via env)
    CDP_PORT=9222 \
    # API server port
    API_PORT=3000 \
    # VNC settings
    VNC_ENABLED=false \
    VNC_PORT=5900 \
    NOVNC_PORT=6080 \
    VNC_RESOLUTION=1280x720 \
    VNC_DEPTH=24

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    # VNC and display
    xvfb \
    x11vnc \
    fluxbox \
    # noVNC for web-based VNC
    novnc \
    websockify \
    # Python
    python3 \
    python3-pip \
    python3-venv \
    # Utilities
    curl \
    wget \
    jq \
    procps \
    # Pandoc for document conversion
    pandoc \
    # Clean up
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user for running the sandbox
RUN useradd -m -s /bin/bash sandbox \
    && mkdir -p /home/sandbox/.codex \
    && chown -R sandbox:sandbox /home/sandbox

# Install global Node.js packages
RUN npm install -g \
    @openai/codex \
    @playwright/mcp \
    typescript \
    ts-node \
    && npm cache clean --force

# Create Python virtual environment and install packages
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir \
    pypandoc \
    requests \
    beautifulsoup4 \
    lxml \
    pyyaml

# Create directories for the sandbox
RUN mkdir -p /app /workspace /var/log/sandbox \
    && chown -R sandbox:sandbox /app /workspace /var/log/sandbox

# Copy entrypoint and API server
COPY entrypoint.sh /entrypoint.sh
COPY api-server.js /app/api-server.js
RUN chmod +x /entrypoint.sh

# Copy Playwright MCP configuration
COPY playwright.config.ts /app/playwright.config.ts

# Expose ports
# 9222: Chrome DevTools Protocol (CDP)
# 3000: API server
# 5900: VNC
# 6080: noVNC web interface
EXPOSE 9222 3000 5900 6080

# Set working directory
WORKDIR /workspace

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${API_PORT}/health || exit 1

# Run as non-root user
USER sandbox

# Entrypoint
ENTRYPOINT ["/entrypoint.sh"]
