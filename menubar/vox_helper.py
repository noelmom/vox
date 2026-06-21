#!/usr/bin/env python3
"""
Vox menu bar helper.
Controls the Vox server LaunchAgent and shows live CPU / RAM stats.
"""
import json
import os
import socket
import subprocess
import threading
import urllib.error
import urllib.request
import webbrowser

import psutil
import rumps
from AppKit import NSApplication, NSApplicationActivationPolicyAccessory

SERVER_LABEL  = "com.melolabdev.vox"
POLL_INTERVAL = 5   # seconds between status + stats refresh
HEALTH_PATH   = "/health"


class VoxHelper(rumps.App):
    def __init__(self):
        super().__init__("Vox", quit_button=None)

        # Read host/port from .env so the helper stays in sync with the server
        self._host, self._port = self._read_env()

        # ── Menu items ────────────────────────────────────────────────────
        # no-op keeps items "enabled" so macOS renders them in full label color
        _noop = lambda _: None

        self._status_item  = rumps.MenuItem("Stopped…")
        self._addr_item    = rumps.MenuItem(self._addr_label(),   callback=_noop)
        self._copy_item    = rumps.MenuItem("⎘  Copy Address",   callback=self._copy_address)
        self._open_item    = rumps.MenuItem("↗  Open in Browser",  callback=self._open_browser)
        self._input_item   = rumps.MenuItem("📁  Open Input Folder", callback=self._open_input)

        self._cpu_item     = rumps.MenuItem("⚡  CPU   —",        callback=_noop)
        self._ram_item     = rumps.MenuItem("🧠  RAM   —",        callback=_noop)

        self._start_item   = rumps.MenuItem("▶  Start Server",    callback=self._start)
        self._stop_item    = rumps.MenuItem("■  Stop Server",     callback=self._stop)
        self._restart_item = rumps.MenuItem("↺  Restart Server",  callback=self._restart)

        self._logs_item    = rumps.MenuItem("📋  View Logs",      callback=self._view_logs)
        self._quit_item    = rumps.MenuItem("Quit Helper",        callback=self._quit)

        self.menu = [
            self._status_item,
            self._addr_item,
            self._copy_item,
            self._open_item,
            self._input_item,
            None,
            self._cpu_item,
            self._ram_item,
            None,
            self._start_item,
            self._stop_item,
            self._restart_item,
            None,
            self._logs_item,
            None,
            self._quit_item,
        ]

        # Kick off the polling loop on a single persistent daemon thread
        self._running = False
        self._stop_event = threading.Event()
        self._poll_thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._poll_thread.start()

        # Hide from Dock and Cmd+Tab — must fire on the main run loop,
        # so use rumps.Timer (not threading.Timer which is a background thread)
        self._dock_timer = rumps.Timer(self._hide_dock_icon, 0.5)
        self._dock_timer.start()

    # ── Helpers ───────────────────────────────────────────────────────────

    def _hide_dock_icon(self, timer):
        try:
            NSApplication.sharedApplication().setActivationPolicy_(
                NSApplicationActivationPolicyAccessory
            )
        except Exception:
            pass
        timer.stop()

    def _read_env(self):
        host, port = "0.0.0.0", "8000"
        env_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", ".env")
        )
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    k, _, v = line.partition("=")
                    v = v.strip().strip('"').strip("'")
                    if k.strip() == "VOX_HOST" and v:
                        host = v
                    elif k.strip() == "VOX_PORT" and v:
                        port = v
        return host, port

    def _is_local_only(self):
        return self._host in ("127.0.0.1", "localhost")

    def _lan_ip(self):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                s.connect(("8.8.8.8", 80))
                return s.getsockname()[0]
        except Exception:
            return "unknown"

    def _addr_label(self):
        if self._is_local_only():
            return f"localhost:{self._port}  ·  local only"
        ip = self._lan_ip()
        return f"{ip}:{self._port}  ·  network accessible"

    def _base_url(self):
        host = "localhost" if self._host in ("0.0.0.0", "") else self._host
        return f"http://{host}:{self._port}"

    def _check_server(self):
        try:
            url = self._base_url() + HEALTH_PATH
            with urllib.request.urlopen(url, timeout=2) as r:
                return r.status == 200
        except Exception:
            return False

    def _launchctl(self, *args):
        subprocess.run(["launchctl", *args], capture_output=True)

    # ── Polling loop ──────────────────────────────────────────────────────

    def _poll_loop(self):
        """Single persistent daemon thread — polls forever, no allocation churn."""
        while not self._stop_event.wait(POLL_INTERVAL):
            self._poll()

    def _poll(self):
        running = self._check_server()
        self._running = running

        # Menu bar title — dot gives at-a-glance status without opening menu
        self.title = "🟢 Vox" if running else "🔴 Vox"

        # Status — green circle when up, red when down
        self._status_item.title = "Running…" if running else "Stopped…"

        # Address row — always current
        self._addr_item.title = self._addr_label()

        # Copy + Open only useful when server is up
        self._copy_item.set_callback(self._copy_address if running else None)
        self._open_item.set_callback(self._open_browser if running else None)

        # Start / Stop / Restart — grey out actions that don't apply
        self._start_item.set_callback(None if running else self._start)
        self._stop_item.set_callback(self._stop if running else None)
        self._restart_item.set_callback(self._restart if running else None)

        # System stats — always visible regardless of server state
        cpu = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory()
        used_gb  = mem.used  / (1024 ** 3)
        total_gb = mem.total / (1024 ** 3)
        self._cpu_item.title = f"⚡  CPU   {cpu:.0f}%"
        self._ram_item.title = f"🧠  RAM   {used_gb:.1f} / {total_gb:.0f} GB"

    # ── Callbacks ─────────────────────────────────────────────────────────

    def _start(self, _):
        self._launchctl("start", SERVER_LABEL)

    def _stop(self, _):
        self._launchctl("stop", SERVER_LABEL)

    def _restart(self, _):
        uid = os.getuid()
        self._launchctl("kickstart", "-k", f"gui/{uid}/{SERVER_LABEL}")

    def _copy_address(self, _):
        addr = self._base_url() + "/app"
        subprocess.run("pbcopy", input=addr.encode(), check=True)
        rumps.notification("Vox", "Copied to clipboard", addr, sound=False)

    def _open_browser(self, _):
        webbrowser.open(self._base_url() + "/app")

    def _open_input(self, _):
        input_dir = os.path.expanduser("~/Library/Application Support/Vox/input")
        os.makedirs(input_dir, exist_ok=True)
        subprocess.run(["open", input_dir])

    def _view_logs(self, _):
        log = os.path.expanduser("~/Library/Logs/Vox/vox.log")
        subprocess.run(["open", "-a", "Console", log])

    def _quit(self, _):
        self._stop_event.set()
        rumps.quit_application()


if __name__ == "__main__":
    VoxHelper().run()
