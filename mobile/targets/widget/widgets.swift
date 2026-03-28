import WidgetKit
import SwiftUI
import AppIntents
import Foundation
import UIKit

// MARK: - Adaptive contrast (black in light mode, white in dark mode — always legible)
private extension Color {
    static let adaptiveContrast = Color(UIColor { trait in
        trait.userInterfaceStyle == .dark ? .white : .black
    })
}

// MARK: - Explicit content colors for legibility on custom backgrounds
private func contentColors(for style: String, systemScheme: ColorScheme, renderingMode: WidgetRenderingMode) -> (primary: Color, secondary: Color, expiry: Color) {
    if renderingMode == .accented { return (.primary, .secondary, .orange) }

    let primary: Color
    switch style {
    case "ocean":
        primary = .white
    case "softclay":
        primary = Color(hex: "#333333")
    case "aurora":
        primary = Color(hex: "#1F2937") // fixed dark — aurora is always a light background
    case "default":
        primary = .primary
    case "plum", "deepspace", "dark", "gradient", "mermaid", "sunset":
        primary = .white
    default:
        primary = .primary
    }
    // 0.85 for dark backgrounds (better legibility on OLED); 0.75 for light
    let secondaryOpacity = ["plum", "deepspace", "dark", "gradient", "mermaid", "sunset"].contains(style) ? 0.85 : 0.75

    // Expiry color chosen to be legible against each specific background.
    let expiry: Color
    switch style {
    case "sunset":
        expiry = .white               // Golden Hour is orange-toned — orange would vanish
    case "gradient", "mermaid", "ocean", "plum":
        expiry = Color(hex: "#FFD60A") // yellow — readable on dark/vibrant backgrounds
    case "aurora":
        expiry = Color(hex: "#4338CA") // deep indigo — readable on light pink/lavender
    case "softclay":
        expiry = Color(hex: "#0369A1") // sky blue — clearly distinct on warm cream
    case "deepspace":
        expiry = Color(hex: "#67E8F9") // cyan-300 — bright and visible on near-black
    default:
        expiry = .orange
    }

    return (primary, primary.opacity(secondaryOpacity), expiry)
}

// MARK: - WidgetFamily helpers
private extension WidgetFamily {
    var isAccessory: Bool {
        switch self {
        case .accessoryCircular, .accessoryInline, .accessoryRectangular: return true
        default: return false
        }
    }
}

// MARK: - Map display names from widget config to internal style keys
private func widgetBackgroundStyle(from raw: String) -> String {
    switch raw {
    case "Mint-Violet": return "gradient"
    case "Aurora": return "aurora"
    case "Ocean": return "ocean"
    case "Plum Noir": return "plum"
    case "Mermaidcore": return "mermaid"
    case "Golden Hour": return "sunset"
    case "Deep Space": return "deepspace"
    case "Soft Clay": return "softclay"
    default: return "default"
    }
}

// MARK: - Premium Widget Background (2026 palette + tint-aware)
@available(iOS 17.0, *)
struct WidgetBackgroundView: View {
    let style: String
    @Environment(\.widgetRenderingMode) var renderingMode

    var body: some View {
        Group {
            if renderingMode == .accented {
                Color.black.opacity(0.8)
            } else {
                switch style {
                case "aurora":
                    LinearGradient(
                        colors: [Color(hex: "#C7D2FE"), Color(hex: "#F9A8D4")],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                case "ocean":
                    LinearGradient(
                        colors: [Color(hex: "#0EA5E9"), Color(hex: "#06B6D4")],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                case "plum":
                    Color(hex: "#2B1538")
                case "mermaid":
                    Color(hex: "#0E7490")
                case "sunset":
                    LinearGradient(
                        colors: [Color(hex: "#E11D48"), Color(hex: "#EA580C")],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                case "dark":
                    Color.adaptiveContrast
                case "deepspace":
                    Color(hex: "#101417")
                case "softclay":
                    Color(hex: "#F4EBD2")
                case "gradient":
                    LinearGradient(
                        colors: [Color(hex: "#047857"), Color(hex: "#5B21B6")],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                default:
                    Color(.systemBackground)
                }
            }
        }
    }
}

// MARK: - Color Extension for Hex
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 128, 128, 128) // Gray fallback
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

// MARK: - "Until …" subtitle (time follows system 12h/24h — Settings → General → Date & Time)
private func widgetExpiryText(expiry: Date) -> String {
    let timeFormatter = DateFormatter()
    timeFormatter.locale = .current
    timeFormatter.calendar = Calendar.current
    timeFormatter.dateStyle = .none
    timeFormatter.timeStyle = .short
    let timeStr = timeFormatter.string(from: expiry)
    if Calendar.current.isDateInToday(expiry) {
        return "until \(timeStr)"
    }
    let dateFormatter = DateFormatter()
    dateFormatter.locale = .current
    dateFormatter.calendar = Calendar.current
    dateFormatter.setLocalizedDateFormatFromTemplate("MMMd")
    return "until \(dateFormatter.string(from: expiry)), \(timeStr)"
}

// MARK: - Status Summary (Provider owns; View renders)
struct StatusSummary {
    let available: Int
    let busy: Int

    static func from(_ friends: [FriendStatusWidgetItem]) -> StatusSummary {
        let available = friends.filter { $0.effectiveOptionLabel == "Available" }.count
        let busy = friends.filter { $0.effectiveOptionLabel == "Busy" }.count
        return StatusSummary(available: available, busy: busy)
    }
}

// MARK: - Provider
@available(iOS 17.0, *)
struct Provider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> SimpleEntry {
     // 1. Hard-coded mocks ONLY. No disk reading. 
     // This ensures the widget "frame" appears instantly.
     SimpleEntry(
         date: Date(),
         configuration: ConfigurationAppIntent(),
         friends: Array(mockStatuses.prefix(4)),
         isPlaceholder: true,
         hasAnyFriends: true,
         isPremium: false // Placeholder: no IO
     )
    }

    func snapshot(for configuration: ConfigurationAppIntent, in context: Context) async -> SimpleEntry {
    let allFriends = FriendDataService.shared.fetchAllFriends()
    let family = context.family
    let friendsToShow: [FriendStatusWidgetItem]
    let hasAnyFriends: Bool
    if context.isPreview {
        switch family {
        case .accessoryCircular, .accessoryInline, .accessoryRectangular:
            friendsToShow = mockStatuses // Use full mocks for summary counts (available/busy)
        default:
            friendsToShow = Array(mockStatuses.prefix(4))
        }
        hasAnyFriends = true
    } else {
        let limit: Int
        switch family {
        case .accessoryCircular, .accessoryInline, .accessoryRectangular: limit = 16
        default: limit = 4
        }
        friendsToShow = Array(allFriends.prefix(limit))
        hasAnyFriends = !allFriends.isEmpty
    }
    let isPremium = FriendDataService.shared.fetchIsPremium()
    let summary = StatusSummary.from(friendsToShow)
    return SimpleEntry(date: Date(), configuration: configuration, friends: friendsToShow, summary: summary, hasAnyFriends: hasAnyFriends, isPremium: isPremium)
    }
    
    func timeline(for configuration: ConfigurationAppIntent, in context: Context) async -> Timeline<SimpleEntry> {
        let allFriends = FriendDataService.shared.fetchAllFriends()
        let isPremium = FriendDataService.shared.fetchIsPremium()
        let family = context.family

        var filteredFriends: [FriendStatusWidgetItem]
        if let selectedFriends = configuration.selectedFriends, !selectedFriends.isEmpty {
            let selectedIDs = selectedFriends.map { $0.id }
            filteredFriends = Array(selectedIDs.compactMap { id in allFriends.first(where: { $0.id == id }) })
        } else {
            filteredFriends = Array(allFriends)
        }

        // Cap only by what each widget size can visually fit; app controls the friend list.
        let maxFriends: Int
        switch family {
        case .systemSmall: maxFriends = 4
        case .systemMedium: maxFriends = 8
        case .systemLarge: maxFriends = 24
        case .accessoryCircular, .accessoryInline, .accessoryRectangular:
            maxFriends = 16 // Pass enough to compute available/busy summary counts
        default: maxFriends = 16
        }
        filteredFriends = Array(filteredFriends.prefix(maxFriends))

    let hasAnyFriends = !allFriends.isEmpty
    let summary = StatusSummary.from(filteredFriends)
    let entry = SimpleEntry(date: Date(), configuration: configuration, friends: filteredFriends, summary: summary, hasAnyFriends: hasAnyFriends, isPremium: isPremium)
        
        // 1. Find the friend whose status expires SOONEST
        let now = Date()
        let nextExpiry = filteredFriends
            .compactMap { $0.expiresAt }
            .filter { $0 > now }
            .min()

        // 2. Timeline policy: event-driven, not polling
        // - If there's an upcoming expiry → refresh exactly when it expires
        // - If no expiry → .atEnd = no periodic wakeups (app/push triggers reload)
        if let nextExpiry = nextExpiry {
            return Timeline(entries: [entry], policy: .after(nextExpiry))
        } else {
            return Timeline(entries: [entry], policy: .atEnd)
        }
    }
}

struct SimpleEntry: TimelineEntry {
    let date: Date
    let configuration: ConfigurationAppIntent
    let friends: [FriendStatusWidgetItem]
    let summary: StatusSummary
    let isPlaceholder: Bool
    let hasAnyFriends: Bool
    let isPremium: Bool

    init(date: Date, configuration: ConfigurationAppIntent, friends: [FriendStatusWidgetItem], summary: StatusSummary? = nil, isPlaceholder: Bool = false, hasAnyFriends: Bool = true, isPremium: Bool = false) {
        self.date = date
        self.configuration = configuration
        self.friends = friends
        self.summary = summary ?? StatusSummary.from(friends)
        self.isPlaceholder = isPlaceholder
        self.hasAnyFriends = hasAnyFriends
        self.isPremium = isPremium
    }
    
    // High priority relevance for immediate background updates when status changes
    // This tells iOS this update is important and should refresh quickly
    var relevance: TimelineEntryRelevance? {
        // Don't set relevance for placeholders
        guard !isPlaceholder else { return nil }
        // High score (100) tells iOS this is fresh, important data
        return TimelineEntryRelevance(score: 100)
    }
}

// MARK: - Lock Screen (summary only: KPI / compact / stacked)
struct LockScreenWidgetView: View {
    let entry: SimpleEntry
    let family: WidgetFamily

    var body: some View {
        switch family {
        case .accessoryCircular:
            ZStack {
                AccessoryWidgetBackground()
                Circle()
                    .stroke(.primary.opacity(0.3), lineWidth: 2)
                VStack(spacing: 2) {
                    Text("Available")
                        .font(.system(size: 9, weight: .medium))
                    Text("\(entry.summary.available)")
                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                }
            }
        case .accessoryInline:
            if entry.friends.isEmpty {
                Text("Add friends to see status")
            } else {
                Text("Available \(entry.summary.available) · Busy \(entry.summary.busy)")
            }
        case .accessoryRectangular:
            if entry.friends.isEmpty {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Add friends")
                    Text("Open app to get started")
                        .font(.caption)
                }
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Available \(entry.summary.available)")
                    Text("Busy \(entry.summary.busy)")
                }
            }
        default:
            EmptyView()
        }
    }
}

// MARK: - Home Screen UI
struct HomeScreenWidgetView: View {
    let entry: SimpleEntry
    let family: WidgetFamily
    @Environment(\.widgetRenderingMode) var renderingMode
    @Environment(\.colorScheme) var systemColorScheme

    var body: some View {
        let raw: String = entry.isPremium ? entry.configuration.backgroundStyle ?? "Default" : "Default"
        let style = widgetBackgroundStyle(from: raw.isEmpty ? "Default" : raw)
        let colors = contentColors(for: style, systemScheme: systemColorScheme, renderingMode: renderingMode)

        ZStack(alignment: .topTrailing) {
            VStack(alignment: .leading, spacing: 0) {
                if entry.friends.isEmpty {
                    emptyState(colors: colors)
                } else {
                    VStack(alignment: .leading, spacing: 0) {
                        if #available(iOS 17.0, *) {
                            // Large 8×3 grid is dense; reserve less space under refresh control.
                            Spacer().frame(height: family == .systemLarge ? 20 : 28)
                        } else {
                            EmptyView()
                        }
                        homeContent(colors: colors)
                    }
                }
            }
            if #available(iOS 17.0, *), !entry.friends.isEmpty {
                Button(intent: RefreshWidgetIntent()) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(colors.secondary)
                        .widgetAccentable()
                        .padding(6)
                        .background(Circle().fill(.ultraThinMaterial))
                }
                .buttonStyle(.plain)
                .invalidatableContent()
                .padding(.top, 4)
                .padding(.trailing, 4)
            } else {
                EmptyView()
            }
        }
        .contentTransition(.interpolate)
        .redacted(reason: entry.isPlaceholder ? .placeholder : [])
    }

    /// Shows that the friend added a note; open the app to read it (privacy + space).
    @ViewBuilder
    private func noteIndicatorIfNeeded(_ friend: FriendStatusWidgetItem, tint: Color, fontSize: CGFloat) -> some View {
        if friend.hasNonEmptyNote {
            Image(systemName: "note.text")
                .font(.system(size: fontSize, weight: .semibold))
                .foregroundColor(tint.opacity(0.88))
                .accessibilityLabel("Has a note")
                .layoutPriority(1)
        }
    }

    @ViewBuilder private func emptyState(colors: (primary: Color, secondary: Color, expiry: Color)) -> some View {
        VStack(spacing: 4) {
            Spacer()
            if entry.hasAnyFriends {
                Text("No friends selected").font(.system(size: 13, weight: .medium)).foregroundColor(colors.secondary)
                Text("Hold to select").font(.system(size: 11)).foregroundColor(colors.secondary.opacity(0.9))
            } else {
                Text("Add some friends").font(.system(size: 13, weight: .medium)).foregroundColor(colors.secondary)
                Text("Open the app to get started").font(.system(size: 11)).foregroundColor(colors.secondary.opacity(0.9))
            }
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }

    @ViewBuilder private func homeContent(colors: (primary: Color, secondary: Color, expiry: Color)) -> some View {
        switch family {
        case .systemSmall:
            VStack(alignment: .leading, spacing: 6) {
                ForEach(entry.friends.prefix(4)) { friend in
                    smallDetailedRow(friend, primaryColor: colors.primary, secondaryColor: colors.secondary)
                }
            }
        case .systemLarge:
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 3), spacing: 2) {
                ForEach(entry.friends) { friend in
                    largeGridCell(friend, primaryColor: colors.primary, secondaryColor: colors.secondary, expiryColor: colors.expiry)
                }
            }
            .padding(.horizontal, 3)
            .padding(.top, 2)
        default:
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 0) {
                ForEach(entry.friends.prefix(8)) { friend in
                    mediumDetailedRow(friend, primaryColor: colors.primary, secondaryColor: colors.secondary, expiryColor: colors.expiry)
                }
            }
            .modifier(HomeScreenWidgetView.TrailingPaddingModifier())
        }
    }

    @ViewBuilder private func largeGridCell(_ friend: FriendStatusWidgetItem, primaryColor: Color, secondaryColor: Color, expiryColor: Color) -> some View {
        let isExpired = friend.isExpired
        let optionLabel = friend.effectiveOptionLabel
        let optionEmoji = friend.effectiveOptionEmoji
        let expiryText: String? = {
            guard !isExpired, let expiry = friend.expiresAt, expiry > Date() else { return nil }
            return widgetExpiryText(expiry: expiry)
        }()
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 5) {
                Text(optionEmoji)
                    .font(.system(size: 10))
                    .widgetAccentable()
                HStack(spacing: 3) {
                    Text(friend.firstName)
                        .font(.system(size: 10, weight: .bold))
                        .foregroundColor(isExpired ? secondaryColor : primaryColor)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                        .privacySensitive()
                    noteIndicatorIfNeeded(friend, tint: secondaryColor, fontSize: 8)
                }
            }
            Text(isExpired ? "Available" : optionLabel)
                .font(.system(size: 8))
                .foregroundColor(secondaryColor)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .id("status-\(friend.id)-\(isExpired)")
            if let text = expiryText {
                Text(text)
                    .font(.system(size: 7, weight: .medium, design: .rounded))
                    .foregroundColor(expiryColor)
                    .lineLimit(1)
                    .minimumScaleFactor(0.65)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder private func smallDetailedRow(_ friend: FriendStatusWidgetItem, primaryColor: Color, secondaryColor: Color) -> some View {
        let isExpired = friend.isExpired
        let optionLabel = friend.effectiveOptionLabel
        let optionEmoji = friend.effectiveOptionEmoji
        HStack(alignment: .center, spacing: 8) {
            Text(optionEmoji)
                .font(.system(size: 12))
                .animation(.spring(response: 0.3, dampingFraction: 0.6), value: optionEmoji)
                .widgetAccentable()
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 4) {
                    Text(friend.firstName)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(isExpired ? secondaryColor : primaryColor)
                        .lineLimit(1)
                        .privacySensitive()
                    noteIndicatorIfNeeded(friend, tint: secondaryColor, fontSize: 10)
                }
                Text(isExpired ? "Available" : optionLabel)
                    .font(.system(size: 10))
                    .foregroundColor(secondaryColor)
                    .lineLimit(1)
                    .id("status-\(friend.id)-\(isExpired)")
                    .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
            Spacer(minLength: 0)
        }
        .animation(.easeInOut, value: isExpired)
    }

    @ViewBuilder private func mediumDetailedRow(_ friend: FriendStatusWidgetItem, primaryColor: Color, secondaryColor: Color, expiryColor: Color) -> some View {
        let isExpired = friend.isExpired
        let optionLabel = friend.effectiveOptionLabel
        let optionEmoji = friend.effectiveOptionEmoji
        let expiryText: String? = {
            guard !isExpired, let expiry = friend.expiresAt, expiry > Date() else { return nil }
            return widgetExpiryText(expiry: expiry)
        }()
        HStack(alignment: .top, spacing: 5) {
            Text(optionEmoji)
                .font(.system(size: 12))
                .animation(.spring(response: 0.3, dampingFraction: 0.6), value: optionEmoji)
                .widgetAccentable()
                .padding(.top, 1)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 4) {
                    Text(friend.firstName)
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(isExpired ? secondaryColor : primaryColor)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                        .privacySensitive()
                    noteIndicatorIfNeeded(friend, tint: secondaryColor, fontSize: 9)
                }
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(isExpired ? "Available" : optionLabel)
                        .font(.system(size: 9))
                        .foregroundColor(secondaryColor)
                        .lineLimit(1)
                        .id("status-\(friend.id)-\(isExpired)")
                    if let text = expiryText {
                        Spacer(minLength: 2)
                        Text(text)
                            .font(.system(size: 8, weight: .medium, design: .rounded))
                            .foregroundColor(expiryColor)
                            .lineLimit(1)
                            .minimumScaleFactor(0.72)
                            .multilineTextAlignment(.trailing)
                            .transition(.asymmetric(insertion: .scale, removal: .opacity))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.vertical, 3)
        .animation(.easeInOut, value: isExpired)
    }

    struct TrailingPaddingModifier: ViewModifier {
        func body(content: Content) -> some View {
            Group {
                if #available(iOS 17.0, *) {
                    // Reserve space for the refresh control without shrinking both columns as much as 32pt.
                    content.padding(.trailing, 14)
                } else {
                    content
                }
            }
        }
    }
}

// MARK: - Entry Router
struct WidgetEntryView: View {
    let entry: SimpleEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        Group {
            if family.isAccessory {
                LockScreenWidgetView(entry: entry, family: family)
            } else {
                HomeScreenWidgetView(entry: entry, family: family)
            }
        }
        .containerBackground(for: .widget) {
            if !family.isAccessory {
                let raw: String = entry.isPremium ? entry.configuration.backgroundStyle ?? "Default" : "Default"
                let style = widgetBackgroundStyle(from: raw.isEmpty ? "Default" : raw)
                WidgetBackgroundView(style: style)
            }
        }
    }
}

// MARK: - Widget Definition
@available(iOS 17.0, *)
struct InstantStatusWidget: Widget {
    let kind: String = "InstantStatusWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: ConfigurationAppIntent.self, provider: Provider()) { entry in
            WidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Friend Status")
        .description("See your friends' current status.")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .systemLarge,
            .accessoryCircular,
            .accessoryInline,
            .accessoryRectangular
        ])
    }
}

// MARK: - Mock Data
/// ~2 days from now (+ offset) for multi-day "until …" in previews. Plain `TimeInterval` literals keep the type checker fast.
private let mockExpiresTwoDaysLater: Date = Date().addingTimeInterval(189_000) // 48h + 4h30m
private let mockExpiresTwoDaysLaterPM: Date = Date().addingTimeInterval(223_200) // 48h + 14h

private func makeMockStatuses() -> [FriendStatusWidgetItem] {
    let a: FriendStatusWidgetItem = FriendStatusWidgetItem(id: "1", firstName: "Alex", lastName: nil, optionId: "busy-id", optionLabel: "Busy", optionEmoji: "🟠", optionColor: "#F59E0B", note: "In a meeting", expiresAt: Date().addingTimeInterval(1800), updatedAt: Date().addingTimeInterval(-300))
    let b: FriendStatusWidgetItem = FriendStatusWidgetItem(id: "2", firstName: "Emma", lastName: nil, optionId: "available-id", optionLabel: "Available", optionEmoji: "🟢", optionColor: "#10B981", note: nil, expiresAt: mockExpiresTwoDaysLater, updatedAt: Date().addingTimeInterval(-1200))
    let c: FriendStatusWidgetItem = FriendStatusWidgetItem(id: "3", firstName: "John", lastName: nil, optionId: "focus-id", optionLabel: "Focus", optionEmoji: "🟣", optionColor: "#8B5CF6", note: nil, expiresAt: mockExpiresTwoDaysLaterPM, updatedAt: Date().addingTimeInterval(-3600))
    let d: FriendStatusWidgetItem = FriendStatusWidgetItem(id: "4", firstName: "Alice", lastName: nil, optionId: "dnd-id", optionLabel: "Do Not Disturb", optionEmoji: "🔴", optionColor: "#EF4444", note: "Coding", expiresAt: Date().addingTimeInterval(2400), updatedAt: Date())
    return [a, b, c, d]
}

let mockStatuses: [FriendStatusWidgetItem] = makeMockStatuses()

// MARK: - Previews
#Preview("Small Detailed - 4 Friends", as: .systemSmall) {
    InstantStatusWidget()
} timeline: {
    SimpleEntry(
        date: .now,
        configuration: {
            var config = ConfigurationAppIntent()
            config.selectedFriends = [
                FriendEntity(id: "1", name: "Alex"),
                FriendEntity(id: "2", name: "Emma"),
                FriendEntity(id: "3", name: "John"),
                FriendEntity(id: "4", name: "Alice")
            ]
            config.backgroundStyle = "Mint-Violet"
            return config
        }(),
        friends: mockStatuses,
        hasAnyFriends: true,
        isPremium: true
    )
}


#Preview("Medium Widget - 8 Friends", as: .systemMedium) {
    InstantStatusWidget()
} timeline: {
    SimpleEntry(
        date: .now,
        configuration: {
            var config = ConfigurationAppIntent()
            config.backgroundStyle = "Aurora"
            return config
        }(),
        friends: [
            FriendStatusWidgetItem(id: "1", firstName: "Alex", lastName: nil, optionId: "busy-id", optionLabel: "Busy", optionEmoji: "🟠", optionColor: "#F59E0B", note: "In a meeting", expiresAt: Date().addingTimeInterval(1800), updatedAt: Date()),
            FriendStatusWidgetItem(id: "2", firstName: "Emma", lastName: nil, optionId: "available-id", optionLabel: "Available", optionEmoji: "🟢", optionColor: "#10B981", note: "Available now", expiresAt: nil, updatedAt: Date()),
            FriendStatusWidgetItem(id: "3", firstName: "John", lastName: nil, optionId: "focus-id", optionLabel: "Focus", optionEmoji: "🟣", optionColor: "#8B5CF6", note: "Deep work", expiresAt: nil, updatedAt: Date()),
            FriendStatusWidgetItem(id: "4", firstName: "James", lastName: nil, optionId: "dnd-id", optionLabel: "Do Not Disturb", optionEmoji: "🔴", optionColor: "#EF4444", note: "Do not disturb", expiresAt: Date().addingTimeInterval(3600), updatedAt: Date()),
            FriendStatusWidgetItem(id: "5", firstName: "Kevin", lastName: nil, optionId: "available-id", optionLabel: "Available", optionEmoji: "🟢", optionColor: "#10B981", note: nil, expiresAt: mockExpiresTwoDaysLater, updatedAt: Date()),
            FriendStatusWidgetItem(id: "6", firstName: "Henry", lastName: nil, optionId: "busy-id", optionLabel: "Busy", optionEmoji: "🟠", optionColor: "#F59E0B", note: "In a call", expiresAt: Date().addingTimeInterval(600), updatedAt: Date()),
            FriendStatusWidgetItem(id: "7", firstName: "Melissa", lastName: nil, optionId: "social-id", optionLabel: "Social", optionEmoji: "🩷", optionColor: "#EC4899", note: "At a party", expiresAt: mockExpiresTwoDaysLaterPM, updatedAt: Date()),
            FriendStatusWidgetItem(id: "8", firstName: "Eve", lastName: nil, optionId: "commute-id", optionLabel: "Commute", optionEmoji: "🔵", optionColor: "#3B82F6", note: "Driving", expiresAt: nil, updatedAt: Date())
        ],
        hasAnyFriends: true,
        isPremium: true
    )
}

private let mockLargeStatuses: [FriendStatusWidgetItem] = {
    let names = [
        "Alex", "Emma", "John", "James", "Kevin", "Henry", "Melissa", "Eve",
        "Noah", "Olivia", "Liam", "Ava", "Mason", "Sophia", "Ethan", "Isabella",
        "Mia", "Lucas", "Charlotte", "Benjamin", "Amelia", "Daniel", "Harper", "Matthew",
    ]
    let options: [(label: String, emoji: String, color: String)] = [
        ("Available", "🟢", "#10B981"), ("Busy", "🟠", "#F59E0B"), ("Focus", "🟣", "#8B5CF6"),
        ("Do Not Disturb", "🔴", "#EF4444"), ("Social", "🩷", "#EC4899"), ("Commute", "🔵", "#3B82F6")
    ]
    return names.enumerated().map { i, name in
        let opt = options[i % options.count]
        let expiresAt: Date? = {
            switch i % 5 {
            case 0: return mockExpiresTwoDaysLater
            case 1: return mockExpiresTwoDaysLaterPM
            case 2: return Date().addingTimeInterval(3600)
            default: return nil
            }
        }()
        return FriendStatusWidgetItem(id: "\(i+1)", firstName: name, lastName: nil, optionId: "opt-\(i)", optionLabel: opt.label, optionEmoji: opt.emoji, optionColor: opt.color, note: nil, expiresAt: expiresAt, updatedAt: Date())
    }
}()

#Preview("Large Widget - 24 Friends", as: .systemLarge) {
    InstantStatusWidget()
} timeline: {
    SimpleEntry(
        date: .now,
        configuration: { var c = ConfigurationAppIntent(); c.backgroundStyle = "Deep Space"; return c }(),
        friends: mockLargeStatuses,
        hasAnyFriends: true,
        isPremium: true
    )
}

#Preview("Lock - Circular", as: .accessoryCircular) {
    InstantStatusWidget()
} timeline: {
    SimpleEntry(date: .now, configuration: ConfigurationAppIntent(), friends: mockStatuses, hasAnyFriends: true, isPremium: true)
}

#Preview("Lock - Inline", as: .accessoryInline) {
    InstantStatusWidget()
} timeline: {
    SimpleEntry(date: .now, configuration: ConfigurationAppIntent(), friends: mockStatuses, hasAnyFriends: true, isPremium: true)
}

#Preview("Lock - Rectangular", as: .accessoryRectangular) {
    InstantStatusWidget()
} timeline: {
    SimpleEntry(date: .now, configuration: ConfigurationAppIntent(), friends: Array(mockStatuses.prefix(2)), hasAnyFriends: true, isPremium: true)
}
