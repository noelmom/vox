import AppKit

class AppDelegate: NSObject, NSApplicationDelegate {
    private var controller: StatusBarController?
    private let updater = VoxUpdater()

    func applicationDidFinishLaunching(_ notification: Notification) {
        controller = StatusBarController(updater: updater)
    }

    func applicationWillTerminate(_ notification: Notification) {
        controller?.teardown()
    }
}
