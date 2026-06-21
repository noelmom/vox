# scripts/

Helper scripts for managing the Vox server.

---

## Normal workflow (LaunchAgent)

Install once after `setup.sh`:

```bash
bash scripts/install-agent.sh
```

Then control the server with `launchctl`:

```bash
launchctl start  com.melolabdev.vox                         # start
launchctl stop   com.melolabdev.vox                         # stop
launchctl kickstart -k gui/$(id -u)/com.melolabdev.vox      # restart
tail -f ~/Library/Logs/VoxForge/vox.log                     # live logs
tail -f ~/Library/Logs/VoxForge/vox-error.log               # error logs
```

---

## Manual start (troubleshooting / development)

Use `scripts/run.sh` to start the server directly in your terminal — no LaunchAgent involved. Useful when:

- The LaunchAgent isn't installed yet
- You're debugging a startup crash and want live output in your terminal
- You need to test a config change without reloading the agent
- `launchctl start` isn't responding and you need to rule out the agent itself

```bash
bash scripts/run.sh
```

The server prints its address and API docs URL on startup. Logs stream directly to the terminal. Press `Ctrl-C` to stop.

> **Note:** If the LaunchAgent is also loaded and running, stop it first to avoid a port conflict:
> ```bash
> launchctl stop com.melolabdev.vox
> bash scripts/run.sh
> ```

---

## Script reference

| Script | Purpose |
|--------|---------|
| `install-agent.sh` | Register the **server** LaunchAgent with macOS launchd. Re-run after moving the project or changing the plist. |
| `uninstall-agent.sh` | Unload and remove the server LaunchAgent. Server stops immediately. |
| `install-helper.sh` | Install the **menu bar helper** LaunchAgent. Installs rumps + psutil, then loads the helper (auto-starts on login). |
| `uninstall-helper.sh` | Unload and remove the helper LaunchAgent. Icon disappears from menu bar. |
| `run.sh` | Start the server manually in the foreground. Bypasses launchd entirely. |
