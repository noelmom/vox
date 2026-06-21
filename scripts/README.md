# scripts/

Helper scripts for managing the Vox server.

---

## Normal workflow (LaunchAgent)

Install with the unified entry point:

```bash
bash vox.sh install       # guided install
bash vox.sh update        # update existing install
bash vox.sh uninstall     # remove agents
```

Then control the server with `launchctl`:

```bash
launchctl kickstart gui/$(id -u)/com.melolabdev.vox          # start
launchctl stop gui/$(id -u)/com.melolabdev.vox               # stop
launchctl kickstart -k gui/$(id -u)/com.melolabdev.vox       # restart
tail -f ~/Library/Logs/Vox/vox.log                           # live logs
tail -f ~/Library/Logs/Vox/vox-error.log                     # error logs
```

---

## Manual start (troubleshooting / development)

Use `scripts/run.sh` to start the server directly in your terminal — no LaunchAgent involved. Useful when:

- The LaunchAgent isn't installed yet
- You're debugging a startup crash and want live output in your terminal
- You need to test a config change without reloading the agent
- `launchctl` isn't responding and you need to rule out the agent itself

```bash
bash scripts/run.sh
```

The server prints its address and API docs URL on startup. Logs stream directly to the terminal. Press `Ctrl-C` to stop.

> **Note:** If the LaunchAgent is also loaded and running, stop it first to avoid a port conflict:
> ```bash
> launchctl stop gui/$(id -u)/com.melolabdev.vox
> bash scripts/run.sh
> ```

---

## Script reference

| Script | Purpose |
|--------|---------|
| `../vox.sh` | **Unified entry point.** `install`, `update`, `uninstall` with flags (`--yes`, `--token`, `--purge`, `--zip`). Use this for all normal workflows. |
| `install-agent.sh` | Register the **server** LaunchAgent with macOS launchd. Syncs `api/` and `ui/` to Application Support. |
| `uninstall-agent.sh` | Stop and remove the server LaunchAgent. |
| `install-helper.sh` | Install the **menu bar helper** LaunchAgent. Installs rumps + psutil and starts the helper. |
| `uninstall-helper.sh` | Stop and remove the helper LaunchAgent. Icon disappears from menu bar. |
| `run.sh` | Start the server manually in the foreground. Bypasses launchd entirely. |
| `update.sh` | Pull latest changes + sync deps + re-register both agents. Called by `vox.sh update` — can also be run directly. |
