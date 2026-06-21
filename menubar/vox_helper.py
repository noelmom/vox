#!/usr/bin/env python3
"""
Vox menu bar helper.
Controls the Vox server LaunchAgent and shows live CPU / RAM stats.
"""
import json
import os
import subprocess
import threading
import urllib.error
import urllib.request
import webbrowser

import psutil
import rumps

SERVER_LABEL  = "com.melolabdev.vox"
POLL_INTERVAL = 5   # seconds between status + stats refresh
HEALTH_PATH   = "/health"


class VoxHelper(rumps.App):
    def __init__(self):
        super().__init__("Vox", quit_button=None)

        # Read host/port from .env so the helper stays in sync with the server
        self._host, self._port = self._read_env()

        # ── Menu items ────────────────────────────────────────────────────
        self._status_item  = rumps.MenuItem("○  Stopped")
        self._addr_item    = rumps.MenuItem(self._addr_label())
        self._open_item    = rumps.MenuItem("Open in Browser", callback=self._open_browser)

        self._cpu_item     = rumps.MenuItem("CPU  —")
        self._ram_item     = rumps.MenuItem("RAM  —")

        self._start_item   = rumps.MenuItem("Start Server",    callback=self._start)
        self._stop_item    = rumps.MenuItem("Stop Server",     callback=self._stop)
        self._restart_item = rumps.MenuItem("Restart Server",  callback=self._restart)

        self._logs_item    = rumps.MenuItem("View Logs",       callback=self._view_logs)
        self._quit_item    = rumps.MenuItem("Quit Helper",     callback=self._quit)

        self.menu = [
            self._status_item,
            self._addr_item,
            self._open_item,
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

        # Kick off the polling loop
        self._running = False
        self._poll()

    # ── Helpers ───────────────────────────────────────────────────────────

    def _read_env(self):
        host, port = "localhost", "8000"
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
                    if k.strip() == "VOX_HOST" and v not in ("", "0.0.0.0"):
                        host = v
                    elif k.strip() == "VOX_PORT" and v:
                        port = v
        return host, port

    def _addr_label(self):
        return f"{self._host} · port {self._port}"

    def _base_url(self):
        return f"http://{self._host}:{self._port}"

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

    def _poll(self):
        running = self._check_server()
        self._running = running

        # Menu bar title
        self.title = "● Vox" if running else "○ Vox"

        # Status + address
        self._status_item.title  = "●  Running" if running else "○  Stopped"
        self._addr_item.title    = self._addr_label()

        # Open in Browser only makes sense when server is up
        self._open_item.set_callback(self._open_browser if running else None)

        # Start / Stop / Restart — grey out actions that don't apply
        self._start_item.set_callback(None if running else self._start)
        self._stop_item.set_callback(self._stop if running else None)
        self._restart_item.set_callback(self._restart if running else None)

        # System stats
        cpu = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory()
        used_gb  = mem.used  / (1024 ** 3)
        total_gb = mem.total / (1024 ** 3)
        self._cpu_item.title = f"CPU  {cpu:.0f}%"
        self._ram_item.title = f"RAM  {used_gb:.1f} / {total_gb:.0f} GB"

        # Schedule next poll
        threading.Timer(POLL_INTERVAL, self._poll).start()

    # ── Callbacks ─────────────────────────────────────────────────────────

    def _start(self, _):
        self._launchctl("start", SERVER_LABEL)

    def _stop(self, _):
        self._launchctl("stop", SERVER_LABEL)

    def _restart(self, _):
        uid = os.getuid()
        self._launchctl("kickstart", "-k", f"gui/{uid}/{SERVER_LABEL}")

    def _open_browser(self, _):
        webbrowser.open(self._base_url() + "/app")

    def _view_logs(self, _):
        log = os.path.expanduser("~/Library/Logs/VoxForge/vox.log")
        subprocess.run(["open", "-a", "Console", log])

    def _quit(self, _):
        rumps.quit_application()


if __name__ == "__main__":
    VoxHelper().run()
