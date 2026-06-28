import AppKit

class StatusBarController {
    private let item: NSStatusItem
    private let monitor: ServerMonitor

    private let statusItem  = NSMenuItem(title: "Stopped…",              action: nil, keyEquivalent: "")
    private let addrItem    = NSMenuItem(title: "—",                     action: nil, keyEquivalent: "")
    private let copyItem    = NSMenuItem(title: "⎘  Copy Address",       action: nil, keyEquivalent: "")
    private let openItem    = NSMenuItem(title: "↗  Open in Browser",    action: nil, keyEquivalent: "")
    private let inputItem   = NSMenuItem(title: "📁  Open Input Folder", action: nil, keyEquivalent: "")
    private let cpuItem     = NSMenuItem(title: "⚡  CPU   —",            action: nil, keyEquivalent: "")
    private let gpuItem     = NSMenuItem(title: "◈  GPU   —",            action: nil, keyEquivalent: "")
    private let ramItem     = NSMenuItem(title: "🧠  RAM   —",            action: nil, keyEquivalent: "")
    private let startItem   = NSMenuItem(title: "▶  Start Server",       action: nil, keyEquivalent: "")
    private let stopItem    = NSMenuItem(title: "■  Stop Server",        action: nil, keyEquivalent: "")
    private let restartItem = NSMenuItem(title: "↺  Restart Server",     action: nil, keyEquivalent: "")
    private let logsItem    = NSMenuItem(title: "📋  View Logs",          action: nil, keyEquivalent: "")
    private let uninstallItem = NSMenuItem(title: "Uninstall Vox…",        action: nil, keyEquivalent: "")
    private let quitItem    = NSMenuItem(title: "Quit Helper",            action: nil, keyEquivalent: "")

    init() {
        item    = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        monitor = ServerMonitor()
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
        [statusItem, addrItem, cpuItem, gpuItem, ramItem].forEach { $0.isEnabled = false }
        [copyItem, openItem, inputItem, startItem, stopItem,
         restartItem, logsItem, uninstallItem, quitItem].forEach { $0.target = self }

        copyItem.action    = #selector(copyAddress)
        openItem.action    = #selector(openBrowser)
        inputItem.action   = #selector(openInput)
        startItem.action   = #selector(startServer)
        stopItem.action    = #selector(stopServer)
        restartItem.action = #selector(restartServer)
        logsItem.action    = #selector(viewLogs)
        uninstallItem.action = #selector(confirmUninstall)
        quitItem.action    = #selector(quitApp)

        let menu = NSMenu()
        for i in [statusItem, addrItem, copyItem, openItem, inputItem,
                  NSMenuItem.separator(),
                  cpuItem, gpuItem, ramItem,
                  NSMenuItem.separator(),
                  startItem, stopItem, restartItem,
                  NSMenuItem.separator(),
                  logsItem,
                  NSMenuItem.separator(),
                  uninstallItem,
                  quitItem] { menu.addItem(i) }

        item.menu = menu
        applyMenuBarIcon(running: false)
    }

    // ── State ──────────────────────────────────────────────────────────────
    private func apply(_ state: ServerState) {
        applyMenuBarIcon(running: state.running)
        statusItem.title    = state.running ? "Running…" : "Stopped…"
        addrItem.title      = state.addrLabel
        copyItem.action     = state.running ? #selector(copyAddress)   : nil
        openItem.action     = state.running ? #selector(openBrowser)   : nil
        startItem.action    = state.running ? nil                      : #selector(startServer)
        stopItem.action     = state.running ? #selector(stopServer)    : nil
        restartItem.action  = state.running ? #selector(restartServer) : nil
        cpuItem.title       = "⚡  CPU   \(Int(state.cpu.rounded()))%"
        gpuItem.title       = state.gpu.map { "◈  GPU   \(Int($0.rounded()))%" } ?? "◈  GPU   unavailable"
        ramItem.title       = "🧠  RAM   \(String(format: "%.1f", state.ramUsed)) / \(Int(state.ramTotal)) GB"
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

    @objc private func startServer() {
        monitor.launchctl("kickstart", "gui/\(getuid())/com.melolabdev.vox")
    }

    @objc private func stopServer() {
        monitor.launchctl("stop", "gui/\(getuid())/com.melolabdev.vox")
    }

    @objc private func restartServer() {
        monitor.launchctl("kickstart", "-k", "gui/\(getuid())/com.melolabdev.vox")
    }

    @objc private func viewLogs() {
        let log = NSHomeDirectory() + "/Library/Logs/Vox/vox.log"
        NSWorkspace.shared.open(URL(fileURLWithPath: log))
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
        } catch {
            showUninstallError("Could not open Terminal to uninstall Vox.")
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
        button.image = makeMenuBarIcon(running: running)
    }

    private func makeMenuBarIcon(running: Bool, copied: Bool = false) -> NSImage {
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
