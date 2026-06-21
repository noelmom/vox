import AppKit
import Darwin

// ── Single-instance enforcement via flock ─────────────────────────────────
// The OS releases the lock the instant the process dies, so there is no
// race condition between a dying instance and a new one starting up.

private var _lockFD: Int32 = -1

func acquireInstanceLock() -> Bool {
    let dir  = NSHomeDirectory() + "/Library/Application Support/Vox"
    let path = dir + "/.helper.lock"
    try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    _lockFD = open(path, O_RDWR | O_CREAT, 0o644)
    guard _lockFD != -1 else { return false }
    // F_SETLK is non-blocking: returns -1 immediately if another process holds the lock.
    // The OS releases the lock when the process exits, regardless of how it exits.
    var fl = flock()
    fl.l_type   = Int16(F_WRLCK)
    fl.l_whence = Int16(SEEK_SET)
    fl.l_start  = 0
    fl.l_len    = 0
    return withUnsafeMutablePointer(to: &fl) { fcntl(_lockFD, F_SETLK, $0) != -1 }
}

// ── Entry point ───────────────────────────────────────────────────────────
guard acquireInstanceLock() else { exit(0) }

let app      = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
