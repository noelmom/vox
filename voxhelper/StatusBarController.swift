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
    private let ramItem     = NSMenuItem(title: "🧠  RAM   —",            action: nil, keyEquivalent: "")
    private let startItem   = NSMenuItem(title: "▶  Start Server",       action: nil, keyEquivalent: "")
    private let stopItem    = NSMenuItem(title: "■  Stop Server",        action: nil, keyEquivalent: "")
    private let restartItem = NSMenuItem(title: "↺  Restart Server",     action: nil, keyEquivalent: "")
    private let logsItem    = NSMenuItem(title: "📋  View Logs",          action: nil, keyEquivalent: "")
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
        [statusItem, addrItem, cpuItem, ramItem].forEach { $0.isEnabled = false }
        [copyItem, openItem, inputItem, startItem, stopItem,
         restartItem, logsItem, quitItem].forEach { $0.target = self }

        copyItem.action    = #selector(copyAddress)
        openItem.action    = #selector(openBrowser)
        inputItem.action   = #selector(openInput)
        startItem.action   = #selector(startServer)
        stopItem.action    = #selector(stopServer)
        restartItem.action = #selector(restartServer)
        logsItem.action    = #selector(viewLogs)
        quitItem.action    = #selector(quitApp)

        let menu = NSMenu()
        for i in [statusItem, addrItem, copyItem, openItem, inputItem,
                  NSMenuItem.separator(),
                  cpuItem, ramItem,
                  NSMenuItem.separator(),
                  startItem, stopItem, restartItem,
                  NSMenuItem.separator(),
                  logsItem,
                  NSMenuItem.separator(),
                  quitItem] { menu.addItem(i) }

        item.menu = menu
        item.button?.title = "🔴 Vox"
    }

    // ── State ──────────────────────────────────────────────────────────────
    private func apply(_ state: ServerState) {
        item.button?.title  = state.running ? "🟢 Vox" : "🔴 Vox"
        statusItem.title    = state.running ? "Running…" : "Stopped…"
        addrItem.title      = state.addrLabel
        copyItem.action     = state.running ? #selector(copyAddress)   : nil
        openItem.action     = state.running ? #selector(openBrowser)   : nil
        startItem.action    = state.running ? nil                      : #selector(startServer)
        stopItem.action     = state.running ? #selector(stopServer)    : nil
        restartItem.action  = state.running ? #selector(restartServer) : nil
        cpuItem.title       = "⚡  CPU   \(Int(state.cpu.rounded()))%"
        ramItem.title       = "🧠  RAM   \(String(format: "%.1f", state.ramUsed)) / \(Int(state.ramTotal)) GB"
    }

    // ── Actions ────────────────────────────────────────────────────────────
    @objc private func copyAddress() {
        let url = monitor.baseURL() + "/app"
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(url, forType: .string)
        let prev = item.button?.title ?? "🟢 Vox"
        item.button?.title = "✓ Vox"
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            self?.item.button?.title = prev
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

    @objc private func quitApp() {
        teardown()
        NSApplication.shared.terminate(nil)
    }
}
