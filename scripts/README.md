# scripts/

Helper scripts for managing the Vox server.

---

## Normal workflow (LaunchAgent)

Install with the unified entry point:

```bash
bash vox.sh install       # guided install
bash vox.sh update        # update existing install
bash vox.sh uninstall     # remove agents, keep user data by default
```

Then control the server with `launchctl`:

```bash
launchctl kickstart gui/$(id -u)/com.noelmom.vox          # start
launchctl stop gui/$(id -u)/com.noelmom.vox               # stop
launchctl kickstart -k gui/$(id -u)/com.noelmom.vox       # restart
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
> launchctl stop gui/$(id -u)/com.noelmom.vox
> bash scripts/run.sh
> ```

---

## Script reference

| Script | Purpose |
|--------|---------|
| `../vox.sh` | **Unified entry point.** `install`, `update`, `uninstall` with flags (`--yes`, `--token`, `--purge`, `--zip`). Use this for all normal workflows. |
| `uninstall.sh` | Shared uninstall implementation used by `vox.sh uninstall` and the helper menu. Removes LaunchAgents and apps; preserves user data unless `--purge` is passed. |
| `install-agent.sh` | Register the **server** LaunchAgent with macOS launchd. Syncs `api/` and `ui/` to Application Support. |
| `uninstall-agent.sh` | Stop and remove the server LaunchAgent. |
| `install-helper.sh` | Install the **menu bar helper** LaunchAgent. Stops the running helper, copies VoxHelper.app from the DMG with `ditto`, and registers the LaunchAgent. |
| `uninstall-helper.sh` | Stop and remove the helper LaunchAgent. Icon disappears from menu bar. |
| `run.sh` | Start the server manually in the foreground. Bypasses launchd entirely. |
| `update.sh` | Pull latest changes + sync deps + re-register agents only when installed build differs. Supports `--force`, `--no-restart`, `--agent-only`, and `--helper-only`. |
| `release.sh` | Release finalizer: after a candidate package and appcast have passed hosted verification, it can tag, push, and create the GitHub release only with explicit approval. It never builds, signs, uploads, or changes an appcast. |
| `appcast.py` | Renders and verifies local Sparkle stable/beta package appcast candidates. It cannot publish; it signs only a staged local package through the Keychain-backed Sparkle tool. |
| `verify-package-candidate.sh` | Read-only package smoke check: verifies signature, Gatekeeper, stapling, required payload paths, and absence of protected runtime data. It never installs the package. |
| `verify-published-candidate.sh` | Read-only HTTPS probe: binds a hosted appcast/package to immutable local candidate provenance, then verifies SHA-256, Sparkle signature, package signature, Gatekeeper, and stapling. |

### Sparkle appcast candidates

Prepare packages and release notes first, then render the candidate locally. The package URL must already be the final immutable HTTPS location; this command never uploads or publishes anything.

```bash
python3 scripts/appcast.py render \
  --version 1.2.3 --build 2026071001 --channel stable \
  --package /staging/Vox-1.2.3.pkg \
  --url https://updates.example.com/vox/releases/Vox-1.2.3.pkg \
  --notes /staging/1.2.3.md --output /staging/appcast.xml
python3 scripts/appcast.py verify --appcast /staging/appcast.xml --package /staging/Vox-1.2.3.pkg \
  --channel stable --verify-signature
```

`--verify-signature` asks Sparkle's Keychain-backed signing tool to cryptographically validate the staged package; `prepare-release-candidate.sh` always performs this check. The private EdDSA key remains in the release operator's Keychain. Do not add it to an environment variable, command line, appcast, or repository.

Before an installer smoke test, inspect the final staged package without installing it:

```bash
bash scripts/verify-package-candidate.sh /staging/Vox-1.2.3.pkg
```

After the separately approved package upload—but before publishing the
appcast—verify the exact hosted bytes. This probe only downloads and checks the
candidate; it never uploads, tags, or publishes.

```bash
bash scripts/verify-published-candidate.sh \
  .release-candidates/1.2.3-2026071001
```

The probe takes the exact package URL, version, build, channel, and SHA-256
from the candidate's provenance record and archives a uniquely named successful
probe alongside that record. Once the package probe passes, publish the
appcast as the final update-host mutation, then repeat the command with the
appcast URL to validate the complete live pair:

```bash
bash scripts/verify-published-candidate.sh \
  .release-candidates/1.2.3-2026071001 \
  https://updates.example.com/vox/appcast.xml
```

Candidate evidence cannot be overwritten.

### Release repository target

`release.sh` creates GitHub releases against `noelmom/vox` by default. Versions with a suffix such as `-rc11` are marked as prereleases; plain versions such as `1.0.0` are public releases:

```bash
bash scripts/prepare-release-candidate.sh 1.0.0-rc9 2026071001 2026070001 \
  /staging/Vox-1.0.0-rc9.pkg https://updates.example.com/vox/releases/Vox-1.0.0-rc9.pkg \
  /staging/1.0.0-rc9.md beta 2026-07-10T14:00:00Z
```

That prepares local evidence only. Build/sign/notarize the package first, upload it to its immutable URL, run the package-only hosted probe, publish the appcast, and run the full hosted probe before finalization.

The target is explicit because GitHub CLI repo inference can be unreliable after repo renames or redirects. To test releases against a fork, override it:

```bash
RELEASE_REPO=owner/repo VOX_RELEASE_PUBLISH=1 \
VOX_RELEASE_EVIDENCE=.release-candidates/1.0.0-rc9-2026071001 \
VOX_RELEASE_APPCAST_URL=https://updates.example.com/vox/appcast.xml \
bash scripts/release.sh 1.0.0-rc9 --publish
```

GitHub Releases intentionally publish only `Vox-<version>.pkg`. `assets/Vox.dmg` is built for the manual/script install path, but it is not uploaded as a release asset because it only contains the two app bundles and can confuse testers.

The script checks `gh auth status` again right before creating the GitHub release. If the signing/notarization flow waited on a keychain prompt for a while and GitHub upload fails, run `gh auth login -h github.com` and retry the release upload or rerun the release with a new version.

For repository-wide operating procedures, release caveats, signing notes, and agent expectations, see [`../AGENTS.md`](../AGENTS.md).
