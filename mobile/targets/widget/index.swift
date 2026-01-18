import WidgetKit
import SwiftUI

@main
struct exportWidgets: WidgetBundle {
    var body: some Widget {
        // Export only the InstantStatusWidget
        InstantStatusWidget()
        // Note: widgetControl() and WidgetLiveActivity() are example widgets and should not be exported
    }
}
