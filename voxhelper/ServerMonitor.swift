import AppKit
import Darwin
import IOKit

struct ServerState {
    var running   = false
    var addrLabel = "—"
    var modelLabel = "Model —"
    var studioBuildLabel = "Studio vunknown · unknown"
    var cpu       = 0.0
    var gpu: Double?
    var ramUsed   = 0.0
    var ramTotal  = 0.0
}

class ServerMonitor {
    private var host = "127.0.0.1"
    private var port = "8000"
    private var timer: Timer?
    private var prevTicks: (UInt32, UInt32, UInt32, UInt32)?

    var onUpdate: ((ServerState) -> Void)?

    init() { readEnv() }

    func start() {
        poll()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            self?.poll()
        }
        DispatchQueue.main.async {
            self.timer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
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
            let parts = t.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
            guard parts.count == 2 else { continue }
            let key   = parts[0].trimmingCharacters(in: .whitespaces)
            let val   = String(parts[1])
                .split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false)[0]
                .trimmingCharacters(in: .whitespaces)
                .trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
            if key == "VOX_HOST", !val.isEmpty { host = val }
            else if key == "VOX_PORT", Int(val) != nil { port = val }
        }
    }

    // ── Polling ────────────────────────────────────────────────────────────
    private func poll() {
        DispatchQueue.global(qos: .background).async { [weak self] in
            guard let self else { return }
            self.readEnv()
            var s       = ServerState()
            s.running   = self.checkServer()
            s.addrLabel = self.addrLabel()
            s.modelLabel = self.modelLabel(running: s.running)
            s.studioBuildLabel = self.studioBuildLabel()
            s.cpu       = self.cpuPercent()
            s.gpu       = self.gpuPercent()
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

    private func studioBuildLabel() -> String {
        let path = NSHomeDirectory() + "/Library/Application Support/Vox/build_info.json"
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
              let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return "Studio vunknown · unknown"
        }
        let version = raw["version"] as? String ?? "unknown"
        let commit = raw["commit"] as? String ?? "unknown"
        return "Studio v\(version) · \(commit)"
    }

    private func modelLabel(running: Bool) -> String {
        guard running else { return "Model unavailable" }
        guard let url = URL(string: "http://127.0.0.1:\(port)/api/v1/status") else {
            return "Model unknown"
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = 1.2

        let semaphore = DispatchSemaphore(value: 0)
        var label = "Model checking…"
        URLSession.shared.dataTask(with: request) { data, _, _ in
            defer { semaphore.signal() }
            guard let data,
                  let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let model = raw["model"] as? [String: Any] else {
                label = "Model starting…"
                return
            }
            let state = model["state"] as? String ?? "unknown"
            switch state {
            case "ready": label = "Model ready"
            case "loading": label = "Model loading…"
            case "error": label = "Model error"
            case "not_loaded": label = "Model waiting…"
            default: label = "Model \(state)"
            }
        }.resume()

        _ = semaphore.wait(timeout: .now() + 1.4)
        return label
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

    // ── GPU % ──────────────────────────────────────────────────────────────
    // Apple does not expose one stable public GPU-utilization API. IOKit does
    // publish accelerator performance counters on many Apple Silicon systems,
    // so this is intentionally best-effort and non-fatal.
    private func gpuPercent() -> Double? {
        var iterator: io_iterator_t = 0
        let match = IOServiceMatching("IOAccelerator")
        guard IOServiceGetMatchingServices(kIOMainPortDefault, match, &iterator) == KERN_SUCCESS else {
            return nil
        }
        defer { IOObjectRelease(iterator) }

        while true {
            let service = IOIteratorNext(iterator)
            if service == 0 { break }
            defer { IOObjectRelease(service) }

            if let value = gpuPercent(from: service) {
                return min(100, max(0, value))
            }
        }

        return nil
    }

    private func gpuPercent(from service: io_object_t) -> Double? {
        var props: Unmanaged<CFMutableDictionary>?
        guard IORegistryEntryCreateCFProperties(service, &props, kCFAllocatorDefault, 0) == KERN_SUCCESS,
              let dict = props?.takeRetainedValue() as? [String: Any] else {
            return nil
        }

        return findGpuPercent(in: dict)
    }

    private func findGpuPercent(in value: Any) -> Double? {
        if let dict = value as? [String: Any] {
            for key in [
                "Device Utilization %",
                "GPU Core Utilization",
                "GPU Activity(%)",
                "GPU Activity %",
                "Busy %",
                "Utilization %"
            ] {
                if let number = numericPercent(dict[key]) {
                    return number
                }
            }

            if let stats = dict["PerformanceStatistics"], let number = findGpuPercent(in: stats) {
                return number
            }

            for nested in dict.values {
                if let number = findGpuPercent(in: nested) {
                    return number
                }
            }
        } else if let array = value as? [Any] {
            for nested in array {
                if let number = findGpuPercent(in: nested) {
                    return number
                }
            }
        }

        return nil
    }

    private func numericPercent(_ value: Any?) -> Double? {
        switch value {
        case let n as NSNumber:
            return n.doubleValue
        case let n as Double:
            return n
        case let n as Float:
            return Double(n)
        case let n as Int:
            return Double(n)
        case let n as UInt64:
            return Double(n)
        case let n as String:
            return Double(n.trimmingCharacters(in: CharacterSet(charactersIn: "% ")))
        default:
            return nil
        }
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
        let used = (Double(stats.active_count) + Double(stats.wire_count) + Double(stats.compressor_page_count)) * page / gb
        return (used, total)
    }

    // ── launchctl ──────────────────────────────────────────────────────────
    func launchctl(_ args: String...) {
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/bin/launchctl")
        proc.arguments = args
        try? proc.run()
    }

    func stopServer() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            self.launchctl("stop", "gui/\(getuid())/com.melolabdev.vox")
            self.waitForServerStop(seconds: 3)

            guard self.checkServer() || self.hasUvicornProcess() else {
                self.poll()
                return
            }

            self.pkill(signal: "TERM")
            self.waitForServerStop(seconds: 2)

            if self.checkServer() || self.hasUvicornProcess() {
                self.pkill(signal: "KILL")
                self.waitForServerStop(seconds: 1)
            }

            self.poll()
        }
    }

    private func waitForServerStop(seconds: Int) {
        guard seconds > 0 else { return }
        for _ in 0..<seconds {
            if !checkServer() && !hasUvicornProcess() { return }
            Thread.sleep(forTimeInterval: 1)
        }
    }

    private func hasUvicornProcess() -> Bool {
        runQuiet("/usr/bin/pgrep", ["-f", "uvicorn api.main:app"])
    }

    private func pkill(signal: String) {
        _ = runQuiet("/usr/bin/pkill", ["-\(signal)", "-f", "uvicorn api.main:app"])
    }

    @discardableResult
    private func runQuiet(_ executable: String, _ arguments: [String]) -> Bool {
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: executable)
        proc.arguments = arguments
        proc.standardOutput = Pipe()
        proc.standardError = Pipe()
        do {
            try proc.run()
            proc.waitUntilExit()
            return proc.terminationStatus == 0
        } catch {
            return false
        }
    }
}
