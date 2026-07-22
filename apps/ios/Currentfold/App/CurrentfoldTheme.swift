import CurrentfoldBrand
import Observation
import SwiftUI

@MainActor
@Observable
final class CurrentfoldTheme {
    let accent = CurrentfoldBrand.current
    let brandPaper = CurrentfoldBrand.paper
    let brandInk = CurrentfoldBrand.ink

    var canvas: Color { Color(uiColor: .systemBackground) }
    var secondaryCanvas: Color { Color(uiColor: .secondarySystemBackground) }
    var primaryLabel: Color { Color(uiColor: .label) }
    var secondaryLabel: Color { Color(uiColor: .secondaryLabel) }
}
