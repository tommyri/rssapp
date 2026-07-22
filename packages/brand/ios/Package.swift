// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "CurrentfoldBrand",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(name: "CurrentfoldBrand", targets: ["CurrentfoldBrand"]),
    ],
    targets: [
        .target(
            name: "CurrentfoldBrand",
            resources: [.process("Resources")]
        ),
    ]
)
