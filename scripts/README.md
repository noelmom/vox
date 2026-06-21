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
tail -f ~/Library/Logs/Vox/vox.log                     # live logs
tail -f ~/Library/Logs/Vox/vox-error.log               # error logs
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
| `build-apps.sh` | **Dev machine only.** Compile, sign, and zip both `.app` bundles into `assets/`. Run before committing when helper or server launcher code changes. |
| `install-agent.sh` | Register the **server** LaunchAgent with macOS launchd. Installs `VoxServer.app` from `assets/VoxServer.app.zip` if present. |
| `uninstall-agent.sh` | Unload and remove the server LaunchAgent. Server stops immediately. |
| `install-helper.sh` | Install the **menu bar helper** LaunchAgent. Installs `VoxHelper.app` from `assets/VoxHelper.app.zip` if present. |
| `uninstall-helper.sh` | Unload and remove the helper LaunchAgent. Icon disappears from menu bar. |
| `run.sh` | Start the server manually in the foreground. Bypasses launchd entirely. |
| `update.sh` | Pull latest changes + sync deps + re-register both agents. Works with git repos (`bash scripts/update.sh`) or zip installs (`bash scripts/update.sh /path/to/new-folder`). |

---

## Pre-signed app bundles (`assets/*.app.zip`)

`assets/VoxHelper.app.zip` and `assets/VoxServer.app.zip` are pre-signed app bundles committed to git. The install scripts unzip them directly — no Xcode or signing cert required on the user's machine.

### When to regenerate

Regenerate the zips any time you change:
- `menubar/vox_helper.py` — helper behaviour or UI
- The Swift launcher source inside `build-apps.sh` (helper or server)
- `assets/Vox.icns` — app icon
- `CFBundleVersion` or any Info.plist field in `build-apps.sh`

Run on your dev machine (requires Developer ID Application cert in Keychain):

```bash
bash scripts/build-apps.sh
git add assets/VoxHelper.app.zip assets/VoxServer.app.zip
git commit -m "chore: rebuild signed app bundles"
```

### Old zips

Delete the old zips before committing the new ones — just overwrite them. Git keeps the history so old builds are always recoverable via `git show <commit>:assets/VoxHelper.app.zip` if ever needed. There is no reason to keep multiple versions of the zips in the working tree.
