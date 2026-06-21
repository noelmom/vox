#!/bin/bash
# Vox — one-shot setup script for macOS Apple Silicon
# Run once after cloning: bash setup.sh
set -e

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
RESET="\033[0m"

info()    { echo -e "${BOLD}[vox]${RESET} $*"; }
success() { echo -e "${GREEN}[vox] ✓ $*${RESET}"; }
warn()    { echo -e "${YELLOW}[vox] ⚠ $*${RESET}"; }
fail()    { echo -e "${RED}[vox] ✗ $*${RESET}"; exit 1; }

ROOT="$(cd "$(dirname "$0")" && pwd)"
APP_SUPPORT="$HOME/Library/Application Support/VoxForge"

# ── Already installed check ───────────────────────────────────────────────────
AGENT_PLIST="$HOME/Library/LaunchAgents/com.melolabdev.vox.plist"
HELPER_PLIST="$HOME/Library/LaunchAgents/com.melolabdev.vox-helper.plist"

if [[ -f "$AGENT_PLIST" ]] || [[ -f "$HELPER_PLIST" ]]; then
    echo ""
    echo -e "${YELLOW}${BOLD}Vox is already installed on this machine.${RESET}"
    echo ""
    echo "  setup.sh is a one-time operation. To update an existing install, run:"
    echo ""
    echo "    bash scripts/update.sh"
    echo ""
    echo "  If you intended a clean reinstall, uninstall first:"
    echo ""
    echo "    bash scripts/uninstall-agent.sh"
    echo "    bash scripts/uninstall-helper.sh"
    echo ""
    exit 1
fi

# ── Platform check ────────────────────────────────────────────────────────────
if [[ "$(uname)" != "Darwin" ]]; then
    fail "This script is for macOS only."
fi

ARCH=$(uname -m)
if [[ "$ARCH" != "arm64" ]]; then
    warn "This project is optimised for Apple Silicon (arm64). Detected: $ARCH"
    warn "CPU-only mode will be used. MPS acceleration unavailable."
fi

# ── Homebrew ──────────────────────────────────────────────────────────────────
info "Checking Homebrew..."
if ! command -v brew &>/dev/null; then
    info "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    eval "$(/opt/homebrew/bin/brew shellenv)"
fi
success "Homebrew $(brew --version | head -1)"

# ── ffmpeg ────────────────────────────────────────────────────────────────────
info "Checking ffmpeg..."
if ! brew list ffmpeg &>/dev/null; then
    info "Installing ffmpeg via Homebrew..."
    brew install ffmpeg
fi
success "ffmpeg $(ffmpeg -version 2>&1 | head -1 | awk '{print $3}')"

# ── Python 3.11 ───────────────────────────────────────────────────────────────
info "Checking Python..."
PYTHON=""

if brew list python@3.11 &>/dev/null; then
    PYTHON="$(brew --prefix python@3.11)/bin/python3.11"
elif command -v python3.11 &>/dev/null; then
    PYTHON="$(command -v python3.11)"
else
    info "Installing Python 3.11 via Homebrew..."
    brew install python@3.11
    PYTHON="$(brew --prefix python@3.11)/bin/python3.11"
fi

PYTHON_VERSION=$("$PYTHON" --version 2>&1)
success "$PYTHON_VERSION at $PYTHON"

# ── Permanent Application Support directory ───────────────────────────────────
info "Creating permanent application support directory..."
mkdir -p "$APP_SUPPORT/venv"
mkdir -p "$APP_SUPPORT/menubar"
success "Application Support: $APP_SUPPORT"

# ── Virtual environment (permanent location) ──────────────────────────────────
VENV="$APP_SUPPORT/venv"

if [[ ! -f "$VENV/bin/python" ]]; then
    info "Creating virtual environment at $VENV..."
    "$PYTHON" -m venv "$VENV"
fi

# Symlink .venv in project root → permanent venv (IDE / dev convenience)
ln -sfn "$VENV" "$ROOT/.venv"

VENV_PIP="$VENV/bin/pip"
success "Virtual environment ready at $VENV"

# ── pip ───────────────────────────────────────────────────────────────────────
info "Upgrading pip..."
"$VENV_PIP" install --upgrade pip --quiet
success "pip $("$VENV_PIP" --version | awk '{print $2}')"

# ── Python dependencies ───────────────────────────────────────────────────────
info "Installing Python dependencies (this may take a few minutes on first run)..."
"$VENV_PIP" install -r "$ROOT/requirements.txt"
success "All Python dependencies installed"

# ── Runtime directories ───────────────────────────────────────────────────────
info "Creating runtime directories..."
mkdir -p "$ROOT/voices" "$ROOT/outputs" "$ROOT/input/processed" "$ROOT/data"
mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$HOME/Library/Logs/VoxForge"
success "Directories ready"

# ── .env scaffold ─────────────────────────────────────────────────────────────
ENV_FILE="$ROOT/.env"
if [[ ! -f "$ENV_FILE" ]]; then
    info "Creating default .env..."
    cat > "$ENV_FILE" <<'EOF'
# Vox environment configuration
# All variables use the VOX_ prefix unless noted.

# Network
# VOX_HOST=0.0.0.0    # default — reachable from any device on the network
# VOX_PORT=8000

# Inference device: auto | mps | cpu
# VOX_DEVICE=auto

# ffmpeg (brew default for Apple Silicon)
# VOX_FFMPEG_PATH=/opt/homebrew/bin/ffmpeg

# Output file cleanup — how many hours to keep generated audio (0 = keep forever)
# VOX_OUTPUT_TTL_HOURS=24

# Text chunking limits
# VOX_DEFAULT_MAX_CHARS=450
# VOX_MIN_MAX_CHARS=100
# VOX_MAX_MAX_CHARS=3000

# Hugging Face token (optional, no VOX_ prefix — standard HF convention)
# Enables authenticated downloads: faster transfer rates and access to gated models.
# Generate a read-only token at https://huggingface.co/settings/tokens
# NEVER commit this value to git — this file is git-ignored for that reason.
# HF_TOKEN=hf_your_token_here
EOF
    success ".env created (all values commented — defaults apply)"
else
    warn ".env already exists, skipping"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}Vox is ready.${RESET}"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Add your Hugging Face token to .env (recommended):"
echo "     nano .env   →  uncomment HF_TOKEN=hf_your_token_here"
echo ""
echo "  2. Install the server LaunchAgent:"
echo "     bash scripts/install-agent.sh"
echo ""
echo "  3. Install the menu bar helper:"
echo "     bash scripts/install-helper.sh"
echo ""
echo "  4. Start the server from the menu bar icon, or:"
echo "     launchctl start com.melolabdev.vox"
echo ""
echo "  Manual start (no LaunchAgent):"
echo "     bash scripts/run.sh"
echo ""
echo "  Health check:  curl http://localhost:8000/health"
echo "  API docs:      http://localhost:8000/docs"
echo ""
