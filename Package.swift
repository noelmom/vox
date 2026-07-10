// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "VoxHelper",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "VoxHelper", targets: ["VoxHelper"]),
    ],
    dependencies: [
        .package(url: "https://github.com/sparkle-project/Sparkle", exact: "2.9.4"),
    ],
    targets: [
        .executableTarget(
            name: "VoxHelper",
            dependencies: [.product(name: "Sparkle", package: "Sparkle")],
            path: "voxhelper"
        ),
    ],
    swiftLanguageModes: [.v5]
)
