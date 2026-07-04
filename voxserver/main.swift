import Foundation
import Darwin

// ── Read .env ────────────────────────────────────────────────────────────────

func readEnv() -> [String: String] {
    let path = NSHomeDirectory() + "/Library/Application Support/Vox/.env"
    guard let contents = try? String(contentsOfFile: path, encoding: .utf8) else { return [:] }
    var env: [String: String] = [:]
    for line in contents.components(separatedBy: .newlines) {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty, !trimmed.hasPrefix("#") else { continue }
        let parts = trimmed.split(separator: "=", maxSplits: 1)
        guard parts.count == 2 else { continue }
        let key = String(parts[0]).trimmingCharacters(in: .whitespaces)
        let value = String(parts[1])
            .split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false)[0]
            .trimmingCharacters(in: .whitespaces)
            .trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
        env[key] = value
    }
    return env
}

func normalizedHost(_ raw: String?) -> String {
    let host = (raw ?? "127.0.0.1").trimmingCharacters(in: .whitespacesAndNewlines)
    return host.isEmpty ? "127.0.0.1" : host
}

func normalizedPort(_ raw: String?) -> Int {
    guard let raw else { return 8000 }
    let portText = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let port = Int(portText), port > 0, port <= 65535 else { return 8000 }
    return port
}

func normalizedDevice(_ raw: String?) -> String {
    let device = (raw ?? "auto").trimmingCharacters(in: .whitespacesAndNewlines)
    return device.isEmpty ? "auto" : device
}

func acquireStartupLock() {
    let path = NSHomeDirectory() + "/Library/Application Support/Vox/vox-server.lock"
    let fd = open(path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
    guard fd != -1 else {
        fputs("[vox-server] Could not open startup lock: \(String(cString: strerror(errno)))\n", stderr)
        exit(1)
    }

    if flock(fd, LOCK_EX | LOCK_NB) != 0 {
        fputs("[vox-server] Server startup already in progress — exiting.\n", stderr)
        exit(0)
    }

    ftruncate(fd, 0)
    let pidText = "\(getpid())\n"
    pidText.withCString { ptr in
        _ = write(fd, ptr, strlen(ptr))
    }
}

// ── Port check ───────────────────────────────────────────────────────────────

func portInUse(_ port: Int) -> Bool {
    let sock = socket(AF_INET, SOCK_STREAM, 0)
    guard sock != -1 else { return false }
    defer { close(sock) }
    var tv = timeval(tv_sec: 1, tv_usec: 0)
    setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, &tv, socklen_t(MemoryLayout<timeval>.size))
    var addr = sockaddr_in()
    addr.sin_family = sa_family_t(AF_INET)
    addr.sin_port = UInt16(port).bigEndian
    addr.sin_addr.s_addr = inet_addr("127.0.0.1")
    return withUnsafePointer(to: &addr) {
        $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
            connect(sock, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) == 0
        }
    }
}

// ── Main ─────────────────────────────────────────────────────────────────────

acquireStartupLock()
let env = readEnv()
let host = normalizedHost(env["VOX_HOST"])
let port = normalizedPort(env["VOX_PORT"])
let device = normalizedDevice(env["VOX_DEVICE"])

if portInUse(port) {
    fputs("[vox-server] Server already running on port \(port) — exiting.\n", stderr)
    exit(0)
}

let appSupport = NSHomeDirectory() + "/Library/Application Support/Vox"
let uvicorn    = appSupport + "/venv/bin/uvicorn"

// Build environment for the exec'd process
var execEnv = ProcessInfo.processInfo.environment
// Merge all .env variables (includes HF_TOKEN, etc.)
for (key, value) in env {
    execEnv[key] = value
}
// Override with explicit VOX_* settings
execEnv["VOX_HOST"]   = host
execEnv["VOX_DEVICE"] = device
execEnv["VOX_PORT"]   = String(port)

// Convert to C strings
let args: [String] = [uvicorn, "api.main:app", "--host", host, "--port", String(port)]
let cArgs = args.map { strdup($0) } + [nil]
let cEnv  = execEnv.map { strdup("\($0.key)=\($0.value)") } + [nil]

// Change working directory to app support so api package resolves correctly
FileManager.default.changeCurrentDirectoryPath(appSupport)

// Replace this process with uvicorn — launchd tracks the uvicorn PID directly
execve(uvicorn, cArgs, cEnv)

// execve only returns on failure
fputs("[vox-server] execve failed: \(String(cString: strerror(errno)))\n", stderr)
exit(1)
