import AppKit

class StatusBarController: NSObject {
    private let item: NSStatusItem
    private let monitor: ServerMonitor
    private let updater: VoxUpdater
    private var lastUpdaterPreferenceRefresh = Date.distantPast
    private var restartUntil: Date?

    private let statusItem  = NSMenuItem(title: "Vox is starting…", action: nil, keyEquivalent: "")
    private let addrItem    = NSMenuItem(title: "On this Mac", action: nil, keyEquivalent: "")
    private let copyItem    = NSMenuItem(title: "Copy Studio Address", action: nil, keyEquivalent: "")
    private let openItem    = NSMenuItem(title: "Open Vox Studio", action: nil, keyEquivalent: "")
    private let primaryServerItem = NSMenuItem(title: "Start Vox Server", action: nil, keyEquivalent: "")
    private let inputItem   = NSMenuItem(title: "Open Input Folder", action: nil, keyEquivalent: "")
    private let supportItem = NSMenuItem(title: "Visit Support Page", action: nil, keyEquivalent: "")
    private let cpuItem     = NSMenuItem(title: "CPU  —", action: nil, keyEquivalent: "")
    private let gpuItem     = NSMenuItem(title: "GPU  —", action: nil, keyEquivalent: "")
    private let ramItem     = NSMenuItem(title: "Memory  —", action: nil, keyEquivalent: "")
    private let modelItem   = NSMenuItem(title: "Model —", action: nil, keyEquivalent: "")
    private let studioBuildItem = NSMenuItem(title: "Studio vunknown · unknown", action: nil, keyEquivalent: "")
    private let helperBuildItem = NSMenuItem(title: "Helper vunknown · unknown", action: nil, keyEquivalent: "")
    private let startItem   = NSMenuItem(title: "Start Server", action: nil, keyEquivalent: "")
    private let stopItem    = NSMenuItem(title: "Stop Server", action: nil, keyEquivalent: "")
    private let restartItem = NSMenuItem(title: "Restart Server", action: nil, keyEquivalent: "")
    private let pairingItem = NSMenuItem(title: "Pair a Device…", action: nil, keyEquivalent: "")
    private let updateItem  = NSMenuItem(title: "Check for Updates…", action: nil, keyEquivalent: "")
    private let recoveryUpdateItem = NSMenuItem(title: "Recovery / Source Update…", action: nil, keyEquivalent: "")
    private let helperLoginItem = NSMenuItem(title: "Start Helper at Login", action: nil, keyEquivalent: "")
    private let serverLoginItem = NSMenuItem(title: "Start Server at Login", action: nil, keyEquivalent: "")
    private let logsItem    = NSMenuItem(title: "View Logs", action: nil, keyEquivalent: "")
    private let uninstallItem = NSMenuItem(title: "Uninstall Vox…",        action: nil, keyEquivalent: "")
    private let quitItem    = NSMenuItem(title: "Quit Helper",            action: nil, keyEquivalent: "")

    init(updater: VoxUpdater) {
        item    = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        monitor = ServerMonitor()
        self.updater = updater
        super.init()
        setupMenu()
        monitor.onUpdate = { [weak self] state in
            DispatchQueue.main.async { self?.apply(state) }
        }
        monitor.start()
    }

    func teardown() {
        monitor.stop()
        NSStatusBar.system.removeStatusItem(item)
    }

    // ── Menu setup ─────────────────────────────────────────────────────────
    private func setupMenu() {
        [statusItem, addrItem, cpuItem, gpuItem, ramItem, modelItem, studioBuildItem, helperBuildItem].forEach { $0.isEnabled = false }
        [copyItem, openItem, primaryServerItem, inputItem, supportItem, startItem, stopItem,
         restartItem, pairingItem, updateItem, recoveryUpdateItem, helperLoginItem, serverLoginItem, logsItem, uninstallItem, quitItem].forEach { $0.target = self }

        copyItem.action    = #selector(copyAddress)
        openItem.action    = #selector(openBrowser)
        primaryServerItem.action = #selector(startServer)
        inputItem.action   = #selector(openInput)
        supportItem.action = #selector(openSupport)
        startItem.action   = #selector(startServer)
        stopItem.action    = #selector(stopServer)
        restartItem.action = #selector(restartServer)
        pairingItem.action = #selector(createPairingCode)
        updateItem.action  = updater.canCheckForUpdates ? #selector(checkForUpdates) : nil
        recoveryUpdateItem.action = #selector(recoveryUpdate)
        helperLoginItem.action = #selector(toggleHelperLogin)
        serverLoginItem.action = #selector(toggleServerLogin)
        logsItem.action    = #selector(viewLogs)
        uninstallItem.action = #selector(confirmUninstall)
        quitItem.action    = #selector(quitApp)

        let controlsMenu = NSMenu(title: "Server controls")
        controlsMenu.addItem(stopItem)

        let filesMenu = NSMenu(title: "Files")
        [copyItem, inputItem, logsItem].forEach(filesMenu.addItem)

        let diagnosticsMenu = NSMenu(title: "Diagnostics")
        [modelItem, cpuItem, gpuItem, ramItem, NSMenuItem.separator(), studioBuildItem, helperBuildItem].forEach(diagnosticsMenu.addItem)

        let updatesMenu = NSMenu(title: "Updates & support")
        [updateItem, recoveryUpdateItem, NSMenuItem.separator(), helperLoginItem, serverLoginItem, NSMenuItem.separator(), supportItem].forEach(updatesMenu.addItem)

        let controlsItem = NSMenuItem(title: "Server Controls", action: nil, keyEquivalent: "")
        controlsItem.submenu = controlsMenu
        let filesItem = NSMenuItem(title: "Files", action: nil, keyEquivalent: "")
        filesItem.submenu = filesMenu
        let diagnosticsItem = NSMenuItem(title: "Diagnostics", action: nil, keyEquivalent: "")
        diagnosticsItem.submenu = diagnosticsMenu
        let updatesItem = NSMenuItem(title: "Updates & Support", action: nil, keyEquivalent: "")
        updatesItem.submenu = updatesMenu

        let menu = NSMenu()
        menu.delegate = self
        for i in [statusItem, addrItem,
                  NSMenuItem.separator(),
                  openItem, primaryServerItem, pairingItem,
                  NSMenuItem.separator(),
                  controlsItem, filesItem, diagnosticsItem, updatesItem,
                  NSMenuItem.separator(),
                  quitItem, uninstallItem] { menu.addItem(i) }

        item.menu = menu
        applyMenuBarIcon(running: false)
    }

    // ── State ──────────────────────────────────────────────────────────────
    private func apply(_ state: ServerState) {
        if Date().timeIntervalSince(lastUpdaterPreferenceRefresh) > 30 {
            lastUpdaterPreferenceRefresh = Date()
            updater.refreshPreferences(from: URL(string: monitor.loopbackURL() + "/api/v1/preferences")!)
        }
        let restarting = isRestarting(state: state)
        applyMenuBarIcon(running: state.running && !restarting)
        statusItem.title    = restarting ? "Vox is restarting…" : (state.running ? "Vox is ready" : "Vox is stopped")
        addrItem.title      = state.addrLabel
        copyItem.action     = state.running ? #selector(copyAddress)   : nil
        openItem.action     = state.running ? #selector(openBrowser)   : nil
        primaryServerItem.title = state.running ? "Restart Vox Server" : "Start Vox Server"
        primaryServerItem.action = state.running ? #selector(restartServer) : #selector(startServer)
        startItem.action    = state.running ? nil                      : #selector(startServer)
        stopItem.action     = state.running ? #selector(stopServer)    : nil
        restartItem.action  = state.running ? #selector(restartServer) : nil
        pairingItem.action  = state.running && state.networkAccessible ? #selector(createPairingCode) : nil
        cpuItem.title       = "CPU  \(Int(state.cpu.rounded()))%"
        gpuItem.title       = state.gpu.map { "GPU  \(Int($0.rounded()))%" } ?? "GPU  unavailable"
        ramItem.title       = "Memory  \(String(format: "%.1f", state.ramUsed)) / \(Int(state.ramTotal)) GB"
        modelItem.title     = state.modelLabel
        studioBuildItem.title = state.studioBuildLabel
        helperBuildItem.title = helperBuildLabel()
    }

    private func helperBuildLabel() -> String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "unknown"
        let commit = info?["VoxBuildCommit"] as? String ?? helperBuildInfo()["commit"] ?? "unknown"
        return "Helper v\(version) · \(commit)"
    }

    private func helperBuildInfo() -> [String: String] {
        guard let url = Bundle.main.url(forResource: "build_info", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return [:]
        }
        return raw.reduce(into: [String: String]()) { result, pair in
            result[pair.key] = String(describing: pair.value)
        }
    }

    // ── Actions ────────────────────────────────────────────────────────────
    @objc private func copyAddress() {
        let url = monitor.baseURL() + "/app"
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(url, forType: .string)
        let prev = item.button?.image
        item.button?.image = makeMenuBarIcon(running: true, copied: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.item.button?.image = prev
        }
    }

    @objc private func openBrowser() {
        guard let url = URL(string: monitor.baseURL() + "/app") else { return }
        NSWorkspace.shared.open(url)
    }

    @objc private func openInput() {
        let path = NSHomeDirectory() + "/Library/Application Support/Vox/input"
        try? FileManager.default.createDirectory(atPath: path, withIntermediateDirectories: true)
        NSWorkspace.shared.open(URL(fileURLWithPath: path))
    }

    @objc private func openSupport() {
        NSWorkspace.shared.open(URL(string: "https://noelmom.github.io")!)
    }

    @objc private func startServer() {
        primaryServerItem.action = nil
        statusItem.title = "Vox is starting…"
        applyMenuBarIcon(running: false)
        monitor.startServer { [weak self] succeeded in
            guard let self else { return }
            if !succeeded { self.showServerActionError(action: "start") }
        }
    }

    @objc private func stopServer() {
        monitor.stopServer()
    }

    @objc private func restartServer() {
        restartUntil = Date().addingTimeInterval(15)
        statusItem.title = "Restarting…"
        applyMenuBarIcon(running: false)
        primaryServerItem.action = nil
        monitor.restartServer { [weak self] succeeded in
            guard let self else { return }
            if !succeeded {
                self.restartUntil = nil
                self.showServerActionError(action: "restart")
            }
        }
    }

    private func showServerActionError(action: String) {
        statusItem.title = "Unable to \(action) Vox"
        let alert = NSAlert()
        alert.messageText = "Unable to \(action) Vox Server"
        alert.informativeText = "Open Files → View Logs to inspect the server log, then try again."
        alert.alertStyle = .warning
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }

    @objc private func createPairingCode() {
        guard let url = URL(string: monitor.loopbackURL() + "/api/v1/auth/pairing-codes") else { return }
        pairingItem.title = "Creating pairing code…"
        pairingItem.action = nil

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 5
        URLSession.shared.dataTask(with: request) { [weak self] data, response, _ in
            guard let self else { return }
            let status = (response as? HTTPURLResponse)?.statusCode
            let payload = data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
            let code = payload?["code"] as? String
            DispatchQueue.main.async {
                self.pairingItem.title = "⌁  Pair a Device…"
                self.pairingItem.action = #selector(StatusBarController.createPairingCode)
                guard status == 200, let code else {
                    self.showPairingError()
                    return
                }
                self.showPairingCode(code)
            }
        }.resume()
    }

    private func showPairingCode(_ code: String) {
        let alert = NSAlert()
        alert.messageText = "Pair a device with Vox"
        alert.informativeText = "Enter this one-time code on the device:\n\n\(code)\n\nThe code expires in five minutes. Pair only on a trusted LAN; Vox uses HTTP unless you provide trusted TLS."
        alert.alertStyle = .informational
        alert.addButton(withTitle: "Copy Code")
        alert.addButton(withTitle: "Done")
        if alert.runModal() == .alertFirstButtonReturn {
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(code, forType: .string)
        }
    }

    private func showPairingError() {
        let alert = NSAlert()
        alert.messageText = "Unable to create pairing code"
        alert.informativeText = "Make sure the Vox server is running, then try again."
        alert.alertStyle = .warning
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }

    @objc private func checkForUpdates() {
        updater.checkForUpdates()
    }

    @objc private func recoveryUpdate() {
        _ = runCommandInTerminal(updateCommand())
    }

    private func isRestarting(state: ServerState) -> Bool {
        guard let deadline = restartUntil else { return false }
        if state.running {
            restartUntil = nil
            return false
        }
        if Date() > deadline {
            restartUntil = nil
            return false
        }
        return true
    }

    @objc private func viewLogs() {
        let log = NSHomeDirectory() + "/Library/Logs/Vox/vox.log"
        NSWorkspace.shared.open(URL(fileURLWithPath: log))
    }

    @objc private func toggleHelperLogin() {
        toggleRunAtLoad(plistPath: NSHomeDirectory() + "/Library/LaunchAgents/com.noelmom.vox-helper.plist")
        refreshLoginStates()
    }

    @objc private func toggleServerLogin() {
        toggleRunAtLoad(plistPath: NSHomeDirectory() + "/Library/LaunchAgents/com.noelmom.vox.plist")
        refreshLoginStates()
    }

    @objc private func confirmUninstall() {
        let alert = NSAlert()
        alert.messageText = "Uninstall Vox?"
        alert.informativeText = "This removes the Vox server, menu bar helper, and launch agents. Your voices, recordings, settings, and data will be kept."
        alert.alertStyle = .warning
        alert.addButton(withTitle: "Uninstall")
        alert.addButton(withTitle: "Cancel")

        guard alert.runModal() == .alertFirstButtonReturn else { return }
        runUninstallInTerminal()
    }

    private func runUninstallInTerminal() {
        guard let command = uninstallCommand() else {
            showUninstallError("Could not find the Vox uninstall script. Run `bash vox.sh uninstall` from your Vox folder.")
            return
        }

        if !runCommandInTerminal(command) {
            showUninstallError("Could not open Terminal to uninstall Vox.")
        }
    }

    private func runCommandInTerminal(_ command: String) -> Bool {
        let script = """
        tell application "Terminal"
          activate
          do script "\(appleScriptEscaped(command))"
        end tell
        """

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = ["-e", script]
        do {
            try process.run()
            return true
        } catch {
            return false
        }
    }

    private func uninstallCommand() -> String? {
        let candidates = [
            NSHomeDirectory() + "/Library/Application Support/Vox/scripts/uninstall.sh",
            "/Library/Application Support/Vox/Bootstrap/vox.sh",
        ]

        for path in candidates where FileManager.default.fileExists(atPath: path) {
            if path.hasSuffix("vox.sh") {
                return "bash \(shellQuoted(path)) uninstall --yes; echo; read -n 1 -s -r -p 'Press any key to close...'"
            }
            return "bash \(shellQuoted(path)); echo; read -n 1 -s -r -p 'Press any key to close...'"
        }
        return nil
    }

    private func updateCommand() -> String {
        let candidates = [
            NSHomeDirectory() + "/Library/Application Support/Vox/scripts/update.sh",
            "/Library/Application Support/Vox/Bootstrap/vox.sh",
        ]
        for path in candidates where FileManager.default.fileExists(atPath: path) {
            if path.hasSuffix("vox.sh") {
                return "bash \(shellQuoted(path)) update --yes; echo; read -n 1 -s -r -p 'Press any key to close...'"
            }
            return "bash \(shellQuoted(path)); echo; read -n 1 -s -r -p 'Press any key to close...'"
        }
        return "echo 'Vox update script not found.'; echo; read -n 1 -s -r -p 'Press any key to close...'"
    }

    private func refreshLoginStates() {
        helperLoginItem.state = runAtLoad(plistPath: NSHomeDirectory() + "/Library/LaunchAgents/com.noelmom.vox-helper.plist") ? .on : .off
        serverLoginItem.state = runAtLoad(plistPath: NSHomeDirectory() + "/Library/LaunchAgents/com.noelmom.vox.plist") ? .on : .off
    }

    private func runAtLoad(plistPath: String) -> Bool {
        guard let dict = NSMutableDictionary(contentsOfFile: plistPath) else { return false }
        return dict["RunAtLoad"] as? Bool ?? false
    }

    private func toggleRunAtLoad(plistPath: String) {
        guard let dict = NSMutableDictionary(contentsOfFile: plistPath) else { return }
        let current = dict["RunAtLoad"] as? Bool ?? false
        dict["RunAtLoad"] = !current
        guard dict.write(toFile: plistPath, atomically: true) else { return }
        monitor.launchctl("unload", plistPath)
        monitor.launchctl("load", plistPath)
    }

    private func showUninstallError(_ message: String) {
        let alert = NSAlert()
        alert.messageText = "Unable to uninstall Vox"
        alert.informativeText = message
        alert.alertStyle = .critical
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }

    private func shellQuoted(_ value: String) -> String {
        return "'" + value.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }

    private func appleScriptEscaped(_ value: String) -> String {
        return value
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
    }

    @objc private func quitApp() {
        teardown()
        NSApplication.shared.terminate(nil)
    }

    // ── Menu bar icon ──────────────────────────────────────────────────────
    private func applyMenuBarIcon(running: Bool) {
        guard let button = item.button else { return }
        button.title = ""
        button.imagePosition = .imageOnly
        button.alphaValue = running ? 1 : 0.38
        button.image = makeMenuBarIcon(running: running)
    }

    private func makeMenuBarIcon(running: Bool, copied: Bool = false) -> NSImage {
        if !copied, let image = bundledMenuBarIcon(named: "VoxMenuBarTemplate") {
            return image
        }

        let size = NSSize(width: 44, height: 18)
        let image = NSImage(size: size)

        image.lockFocus()
        NSColor.black.set()

        let paragraph = NSMutableParagraphStyle()
        paragraph.alignment = .center
        let attrs: [NSAttributedString.Key: Any] = [
            .font: NSFont.monospacedSystemFont(ofSize: 12, weight: .semibold),
            .foregroundColor: NSColor.black,
            .paragraphStyle: paragraph,
        ]

        let label = copied ? "VOX" : "VOX"
        NSString(string: label).draw(in: NSRect(x: 0, y: 4.2, width: size.width, height: 13), withAttributes: attrs)

        if copied {
            drawCheck(in: size)
        } else if running {
            drawPulseUnderline(in: size)
        } else {
            drawBrokenUnderline(in: size)
        }

        image.unlockFocus()
        image.isTemplate = true
        return image
    }

    private func bundledMenuBarIcon(named name: String) -> NSImage? {
        guard let url = Bundle.main.url(forResource: name, withExtension: "png"),
              let image = NSImage(contentsOf: url) else {
            return nil
        }
        image.size = NSSize(width: 22, height: 22)
        image.isTemplate = true
        return image
    }

    private func drawPulseUnderline(in size: NSSize) {
        let path = NSBezierPath()
        path.lineWidth = 1.3
        path.lineCapStyle = .round
        path.lineJoinStyle = .round
        path.move(to: NSPoint(x: 12, y: 3.2))
        path.line(to: NSPoint(x: 18, y: 3.2))
        path.line(to: NSPoint(x: 21, y: 6.0))
        path.line(to: NSPoint(x: 24, y: 1.6))
        path.line(to: NSPoint(x: 27, y: 3.2))
        path.line(to: NSPoint(x: 32, y: 3.2))
        path.stroke()
    }

    private func drawBrokenUnderline(in size: NSSize) {
        let left = NSBezierPath()
        left.lineWidth = 1.3
        left.lineCapStyle = .round
        left.move(to: NSPoint(x: 12, y: 3.2))
        left.line(to: NSPoint(x: 20, y: 3.2))
        left.stroke()

        let right = NSBezierPath()
        right.lineWidth = 1.3
        right.lineCapStyle = .round
        right.move(to: NSPoint(x: 25, y: 3.2))
        right.line(to: NSPoint(x: 32, y: 3.2))
        right.stroke()
    }

    private func drawCheck(in size: NSSize) {
        let path = NSBezierPath()
        path.lineWidth = 1.5
        path.lineCapStyle = .round
        path.lineJoinStyle = .round
        path.move(to: NSPoint(x: 35, y: 5.2))
        path.line(to: NSPoint(x: 38, y: 2.6))
        path.line(to: NSPoint(x: 43, y: 8.0))
        path.stroke()
    }
}

extension StatusBarController: NSMenuDelegate {
    func menuWillOpen(_ menu: NSMenu) {
        refreshLoginStates()
    }
}
