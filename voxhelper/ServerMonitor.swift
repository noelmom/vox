import AppKit
import Darwin

struct ServerState {
    var running   = false
    var addrLabel = "—"
    var cpu       = 0.0
    var ramUsed   = 0.0
    var ramTotal  = 0.0
}

class ServerMonitor {
    private var host = "0.0.0.0"
    private var port = "8000"
    private var timer: Timer?
    private var prevTicks: (UInt32, UInt32, UInt32, UInt32)?

    var onUpdate: ((ServerState) -> Void)?

    init() { readEnv() }

    func start() {
        poll()
        DispatchQueue.main.async {
            self.timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
                self?.poll()
            }
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    // ── .env reader ────────────────────────────────────────────────────────
    private func readEnv() {
        let path = NSHomeDirectory() + "/Library/Application Support/Vox/.env"
        guard let raw = try? String(contentsOfFile: path, encoding: .utf8) else { return }
        for line in raw.components(separatedBy: .newlines) {
            let t = line.trimmingCharacters(in: .whitespaces)
            guard !t.isEmpty, !t.hasPrefix("#"), t.contains("=") else { continue }
            let parts = t.components(separatedBy: "=")
            let key   = parts[0].trimmingCharacters(in: .whitespaces)
            let val   = parts.dropFirst().joined(separator: "=")
                .trimmingCharacters(in: .whitespaces)
                .trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
            if key == "VOX_HOST" { host = val }
            else if key == "VOX_PORT" { port = val }
        }
    }

    // ── Polling ────────────────────────────────────────────────────────────
    private func poll() {
        DispatchQueue.global(qos: .background).async { [weak self] in
            guard let self else { return }
            var s       = ServerState()
            s.running   = self.checkServer()
            s.addrLabel = self.addrLabel()
            s.cpu       = self.cpuPercent()
            let mem     = self.memGB()
            s.ramUsed   = mem.used
            s.ramTotal  = mem.total
            self.onUpdate?(s)
        }
    }

    // ── Health check ───────────────────────────────────────────────────────
    // Uses the port configured in .env (VOX_PORT), defaults to 8000 if not set
    private func checkServer() -> Bool {
        guard let portInt = Int(port) else { return false }
        let sock = socket(AF_INET, SOCK_STREAM, 0)
        guard sock != -1 else { return false }
        defer { close(sock) }

        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = UInt16(portInt).bigEndian
        addr.sin_addr.s_addr = inet_addr("127.0.0.1")

        let result = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                connect(sock, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        return result == 0
    }

    // ── Addressing ─────────────────────────────────────────────────────────
    func baseURL() -> String {
        let h = (host == "0.0.0.0" || host.isEmpty) ? lanIP() : host
        return "http://\(h):\(port)"
    }

    private func addrLabel() -> String {
        guard host != "127.0.0.1", host != "localhost" else {
            return "localhost:\(port)  ·  local only"
        }
        return "\(lanIP()):\(port)  ·  network accessible"
    }

    private func lanIP() -> String {
        let sock = socket(AF_INET, SOCK_DGRAM, 0)
        guard sock != -1 else { return "unknown" }
        defer { close(sock) }

        var dst = sockaddr_in()
        dst.sin_family = sa_family_t(AF_INET)
        dst.sin_port   = UInt16(80).bigEndian
        inet_pton(AF_INET, "8.8.8.8", &dst.sin_addr)
        _ = withUnsafePointer(to: &dst) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                connect(sock, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }

        var local = sockaddr_in()
        var len   = socklen_t(MemoryLayout<sockaddr_in>.size)
        _ = withUnsafeMutablePointer(to: &local) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                getsockname(sock, $0, &len)
            }
        }

        var buf = [CChar](repeating: 0, count: Int(INET_ADDRSTRLEN))
        _ = withUnsafePointer(to: &local.sin_addr) {
            $0.withMemoryRebound(to: Void.self, capacity: 1) {
                inet_ntop(AF_INET, $0, &buf, socklen_t(buf.count))
            }
        }
        return String(cString: buf)
    }

    // ── CPU % ──────────────────────────────────────────────────────────────
    private func cpuPercent() -> Double {
        var count = mach_msg_type_number_t(
            MemoryLayout<host_cpu_load_info>.size / MemoryLayout<integer_t>.size)
        var info = host_cpu_load_info()
        let kr: kern_return_t = withUnsafeMutablePointer(to: &info) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics(mach_host_self(), HOST_CPU_LOAD_INFO, $0, &count)
            }
        }
        guard kr == KERN_SUCCESS else { return 0 }

        let t = info.cpu_ticks
        let cur: (UInt32, UInt32, UInt32, UInt32) = (t.0, t.1, t.2, t.3)
        defer { prevTicks = cur }
        guard let prev = prevTicks else { return 0 }

        let dUser  = Double(cur.0 &- prev.0)
        let dSys   = Double(cur.1 &- prev.1)
        let dIdle  = Double(cur.2 &- prev.2)
        let dNice  = Double(cur.3 &- prev.3)
        let dTotal = dUser + dSys + dIdle + dNice
        guard dTotal > 0 else { return 0 }
        return ((dTotal - dIdle) / dTotal) * 100
    }

    // ── RAM ────────────────────────────────────────────────────────────────
    private func memGB() -> (used: Double, total: Double) {
        let gb    = 1_073_741_824.0
        let total = Double(ProcessInfo.processInfo.physicalMemory) / gb

        var stats = vm_statistics64_data_t()
        var count = mach_msg_type_number_t(
            MemoryLayout<vm_statistics64_data_t>.size / MemoryLayout<integer_t>.size)
        let kr: kern_return_t = withUnsafeMutablePointer(to: &stats) {
            $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
                host_statistics64(mach_host_self(), HOST_VM_INFO64, $0, &count)
            }
        }
        guard kr == KERN_SUCCESS else { return (0, total) }

        let page = Double(vm_page_size)
        let used = (Double(stats.active_count) + Double(stats.wire_count)) * page / gb
        return (used, total)
    }

    // ── launchctl ──────────────────────────────────────────────────────────
    func launchctl(_ args: String...) {
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/bin/launchctl")
        proc.arguments = args
        try? proc.run()
    }
}
