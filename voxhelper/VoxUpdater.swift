import AppKit

#if canImport(Sparkle)
import Sparkle

/// Owns the normal native update path. The package build links Sparkle; the
/// conditional fallback keeps source-only diagnostics builds usable.
final class VoxUpdater: NSObject, SPUUpdaterDelegate {
    private lazy var updaterController = SPUStandardUpdaterController(
        startingUpdater: true,
        updaterDelegate: self,
        userDriverDelegate: nil
    )

    override init() {
        super.init()
        _ = updaterController
    }

    var canCheckForUpdates: Bool { updaterController.updater.canCheckForUpdates }

    func checkForUpdates() {
        updaterController.checkForUpdates(nil)
    }

    func allowedChannels(for updater: SPUUpdater) -> Set<String> {
        UserDefaults.standard.string(forKey: "vox.update-channel") == "beta" ? ["beta"] : []
    }

    func updater(_ updater: SPUUpdater, didFinishUpdateCycleFor updateCheck: SPUUpdateCheck, error: Error?) {
        guard let error else { return }
        NSLog("Vox update cycle finished with error: %@", error.localizedDescription)
    }
}
#else
final class VoxUpdater: NSObject {
    var canCheckForUpdates: Bool { true }

    func checkForUpdates() {
        let alert = NSAlert()
        alert.messageText = "Native updates are unavailable in this source build"
        alert.informativeText = "Install the signed Vox package to receive Sparkle updates, or use the Recovery / source update action."
        alert.alertStyle = .informational
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }
}
#endif
