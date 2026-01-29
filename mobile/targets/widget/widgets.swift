import WidgetKit
import SwiftUI
import AppIntents
import Foundation

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
         hasAnyFriends: true
     )
    }

    func snapshot(for configuration: ConfigurationAppIntent, in context: Context) async -> SimpleEntry {
    // 2. Try to get real data for a realistic preview
    let allFriends = FriendDataService.shared.fetchAllFriends()
    
    // Fallback logic
    let friendsToShow: [FriendStatusWidgetItem]
    let hasAnyFriends: Bool
    if context.isPreview {
        // Use mocks ONLY for Gallery preview
        friendsToShow = Array(mockStatuses.prefix(4))
        hasAnyFriends = true // Preview always shows friends
    } else {
        // Use real data (empty array if no friends)
        friendsToShow = Array(allFriends.prefix(4))
        hasAnyFriends = !allFriends.isEmpty
    }
    
    return SimpleEntry(date: Date(), configuration: configuration, friends: friendsToShow, hasAnyFriends: hasAnyFriends)
    }
    
    func timeline(for configuration: ConfigurationAppIntent, in context: Context) async -> Timeline<SimpleEntry> {
        let allFriends = FriendDataService.shared.fetchAllFriends()
        print("📊 Widget Timeline: Fetched \(allFriends.count) friends from storage")
        
        var filteredFriends: [FriendStatusWidgetItem] = []

        // If user hasn't selected specific friends, automatically show first 8 friends
        // This provides a good default experience without requiring configuration
        if let selectedFriends = configuration.selectedFriends, !selectedFriends.isEmpty {
            // User has selected specific friends - show only those in selection order
            let selectedIDs = selectedFriends.map { $0.id }
            filteredFriends = selectedIDs.compactMap { id in
                allFriends.first(where: { $0.id == id })
            }
            print("📊 Widget Timeline: User selected \(selectedIDs.count) friends, found \(filteredFriends.count) matches")
        } else {
            filteredFriends = Array(allFriends.prefix(8))
            print("📊 Widget Timeline: No selection, showing first \(filteredFriends.count) friends")
        }

        let hasAnyFriends = !allFriends.isEmpty
        let entry = SimpleEntry(date: Date(), configuration: configuration, friends: filteredFriends, hasAnyFriends: hasAnyFriends)
        print("📊 Widget Timeline: Created entry with \(entry.friends.count) friends, hasAnyFriends: \(hasAnyFriends)")
        
        // 1. Find the friend whose status expires SOONEST
        let nextExpiry = filteredFriends.compactMap { $0.expiresAt }
            .filter { $0 > Date() }
            .min()
        
        // 2. Set the refresh to that expiry time, or 15 mins (whichever is sooner)
        // We use the SOONER of: the next expiry OR a 15-minute safety catch
        let fifteenMins = Date().addingTimeInterval(900) // 15 minutes
        let refreshDate = nextExpiry != nil ? min(nextExpiry!, fifteenMins) : fifteenMins
        
        return Timeline(entries: [entry], policy: .after(refreshDate))
    }
}

struct SimpleEntry: TimelineEntry {
    let date: Date
    let configuration: ConfigurationAppIntent
    let friends: [FriendStatusWidgetItem]
    let isPlaceholder: Bool
    let hasAnyFriends: Bool // Track if user has any friends at all
    
    init(date: Date, configuration: ConfigurationAppIntent, friends: [FriendStatusWidgetItem], isPlaceholder: Bool = false, hasAnyFriends: Bool = true) {
        self.date = date
        self.configuration = configuration
        self.friends = friends
        self.isPlaceholder = isPlaceholder
        self.hasAnyFriends = hasAnyFriends
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

// MARK: - UI Logic
struct WidgetEntryView: View {
  let entry: SimpleEntry
  @Environment(\.widgetFamily) var family
  @Environment(\.widgetRenderingMode) var renderingMode

    var body: some View {
          ZStack(alignment: .topTrailing) {
              VStack(alignment: .leading, spacing: 0) {
                  if entry.friends.isEmpty {
                      // Empty state: Show message based on whether user has friends or not
                      VStack(spacing: 4) {
                          Spacer()
                          if entry.hasAnyFriends {
                              // User has friends but none selected or visible
                              Text("No friends selected")
                                  .font(.system(size: 13, weight: .medium))
                                  .foregroundColor(.secondary)
                              Text("Hold to select")
                                  .font(.system(size: 11))
                                  .foregroundColor(.secondary.opacity(0.7))
                          } else {
                              // User has no friends at all
                              Text("Add some friends")
                                  .font(.system(size: 13, weight: .medium))
                                  .foregroundColor(.secondary)
                              Text("Open the app to get started")
                                  .font(.system(size: 11))
                                  .foregroundColor(.secondary.opacity(0.7))
                          }
                          Spacer()
                      }
                      .frame(maxWidth: .infinity, maxHeight: .infinity)
                      .padding()
                  } else {
                      VStack(alignment: .leading, spacing: 0) {
                          // Add top padding to make room for refresh button
                          if #available(iOS 17.0, *) {
                              Spacer()
                                  .frame(height: 28) // Space for refresh button
                          } else {
                              EmptyView()
                          }
                          
                          switch family {
                          case .systemSmall:
                              // Small shows 4 max
                              VStack(alignment: .leading, spacing: 6) {
                                  ForEach(entry.friends.prefix(4)) { friend in
                                      smallDetailedRow(friend)
                                  }
                              }
                          default:
                              // Medium shows 8 max in 2 columns
                              LazyVGrid(columns: [
                                  GridItem(.flexible(), spacing: 10),
                                  GridItem(.flexible(), spacing: 10)
                              ], spacing: 0) {
                                  ForEach(entry.friends.prefix(8)) { friend in
                                      mediumDetailedRow(friend)
                                  }
                              }
                              .modifier(TrailingPaddingModifier())
                          }
                      }
                  }
              }
              
              // Refresh button in top right corner (iOS 17+)
              if #available(iOS 17.0, *), !entry.friends.isEmpty {
                  Button(intent: RefreshWidgetIntent()) {
                      Image(systemName: "arrow.clockwise")
                          .font(.system(size: 12, weight: .semibold))
                          .foregroundStyle(.secondary)
                          .padding(6)
                          .background(
                              Circle()
                                  .fill(.ultraThinMaterial)
                          )
                  }
                  .buttonStyle(.plain)
                  .invalidatableContent()
                  .padding(.top, 4)
                  .padding(.trailing, 4)
              } else {
                  EmptyView()
              }
          }
          .containerBackground(.clear, for: .widget)
          .contentTransition(.interpolate) // Smoothly cross-fades text numbers and colors
          .redacted(reason: entry.isPlaceholder ? .placeholder : [])
      }
    // --- NEW SMALL DETAILED ROW ---
  @ViewBuilder
  private func smallDetailedRow(_ friend: FriendStatusWidgetItem) -> some View {
      let isExpired = friend.isExpired
      let optionLabel = friend.effectiveOptionLabel
      let optionEmoji = friend.effectiveOptionEmoji
      let optionColor = friend.effectiveOptionColor
      
      // Pre-compute expiry display values outside ViewBuilder
      let expiryText: String? = {
          guard !isExpired, let expiry = friend.expiresAt, expiry > Date() else { return nil }
          let isToday = Calendar.current.isDateInToday(expiry)
          let timeFormatter = DateFormatter()
          timeFormatter.timeStyle = .short
          
          if isToday {
              return "until \(timeFormatter.string(from: expiry))"
          } else {
              let dateFormatter = DateFormatter()
              dateFormatter.dateFormat = "MMM d"
              return "until \(dateFormatter.string(from: expiry)), \(timeFormatter.string(from: expiry))"
          }
      }()
      
      HStack(alignment: .center, spacing: 8) {
          // 1. Status Dot - uses option color with spring animation
          Circle()
              .fill(Color(hex: optionColor))
              .frame(width: 8, height: 8)
              .animation(.spring(response: 0.3, dampingFraction: 0.6), value: optionColor)
          
          // 2. Name and Note (Stacked)
          VStack(alignment: .leading, spacing: 0) {
              Text(friend.firstName)
                  .font(.system(size: 13, weight: .bold))
                  .foregroundColor(isExpired ? .secondary : .primary)
                  .lineLimit(1)
              
              // Show option label when expired, otherwise show note or option label
              // Note changes with fade + slide transition
              Text(isExpired ? "Available" : (friend.note ?? optionLabel))
                  .font(.system(size: 10))
                  .foregroundColor(.secondary)
                  .lineLimit(1)
                  .id("note-\(friend.id)-\(isExpired)") // Forces fresh transition when state flips
                  .transition(.opacity.combined(with: .move(edge: .bottom)))
          }
          
          Spacer() // Pushes the expiry time to the far right
          
          // 3. Expiry time (ONLY show if NOT expired and future expiry exists)
          if let text = expiryText {
              Text(text)
                  .font(.system(size: 9, weight: .medium, design: .rounded))
                  .foregroundColor(.orange)
                  .multilineTextAlignment(.trailing)
                  .transition(.asymmetric(insertion: .scale, removal: .opacity))
          }
      }
      .animation(.easeInOut, value: isExpired) // Animates the whole row layout
  }

  @ViewBuilder
  private func mediumDetailedRow(_ friend: FriendStatusWidgetItem) -> some View {
      let isExpired = friend.isExpired
      let optionLabel = friend.effectiveOptionLabel
      let optionEmoji = friend.effectiveOptionEmoji
      let optionColor = friend.effectiveOptionColor
      
      // Pre-compute expiry display values outside ViewBuilder
      let expiryText: String? = {
          guard !isExpired, let expiry = friend.expiresAt, expiry > Date() else { return nil }
          let isToday = Calendar.current.isDateInToday(expiry)
          let timeFormatter = DateFormatter()
          timeFormatter.timeStyle = .short
          
          if isToday {
              return "until \(timeFormatter.string(from: expiry))"
          } else {
              let dateFormatter = DateFormatter()
              dateFormatter.dateFormat = "MMM d"
              return "until \(dateFormatter.string(from: expiry)), \(timeFormatter.string(from: expiry))"
          }
      }()
      
      HStack(alignment: .center, spacing: 8) {
          // Status Dot - uses option color with spring animation
          Circle()
              .fill(Color(hex: optionColor))
              .frame(width: 8, height: 8)
              .animation(.spring(response: 0.3, dampingFraction: 0.6), value: optionColor)

          VStack(alignment: .leading, spacing: 0) {
              HStack(spacing: 4) {
                  Text(friend.firstName)
                      .font(.system(size: 13, weight: .bold))
                      .foregroundColor(isExpired ? .secondary : .primary)
                      .lineLimit(1)
                  
                  // Expiry time (Only if NOT expired and future expiry exists)
                  if let text = expiryText {
                      Text(text)
                          .font(.system(size: 9, weight: .medium, design: .rounded))
                          .foregroundColor(.orange)
                          .lineLimit(1)
                          .transition(.asymmetric(insertion: .scale, removal: .opacity))
                  }
              }
              .frame(maxWidth: .infinity, alignment: .leading) // Ensure proper alignment

              // Show option label when expired, otherwise show note or option label
              // Note changes with fade + slide transition
              Text(isExpired ? "Available" : (friend.note ?? optionLabel))
                  .font(.system(size: 10))
                  .foregroundColor(.secondary)
                  .lineLimit(1)
                  .id("note-\(friend.id)-\(isExpired)") // Forces fresh transition when state flips
                  .transition(.opacity.combined(with: .move(edge: .bottom)))
          }
          Spacer(minLength: 0)
      }
      .padding(.vertical, 4)
      .animation(.easeInOut, value: isExpired) // Animates the whole row layout
  }

    // Helper ViewModifier for conditional trailing padding
    struct TrailingPaddingModifier: ViewModifier {
        func body(content: Content) -> some View {
            Group {
                if #available(iOS 17.0, *) {
                    content.padding(.trailing, 32) // Space for refresh button
                } else {
                    content
                }
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
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Mock Data
let mockStatuses: [FriendStatusWidgetItem] = [
    FriendStatusWidgetItem(id: "1", firstName: "Alex", lastName: nil, optionId: "busy-id", optionLabel: "Busy", optionEmoji: "🟠", optionColor: "#F59E0B", note: "In a meeting", expiresAt: Date().addingTimeInterval(1800), updatedAt: Date().addingTimeInterval(-300)),
    FriendStatusWidgetItem(id: "2", firstName: "Emma", lastName: nil, optionId: "available-id", optionLabel: "Available", optionEmoji: "🟢", optionColor: "#10B981", note: nil, expiresAt: nil, updatedAt: Date().addingTimeInterval(-1200)),
    FriendStatusWidgetItem(id: "3", firstName: "John", lastName: nil, optionId: "focus-id", optionLabel: "Focus", optionEmoji: "🟣", optionColor: "#8B5CF6", note: nil, expiresAt: nil, updatedAt: Date().addingTimeInterval(-3600)),
    FriendStatusWidgetItem(id: "4", firstName: "Alice", lastName: nil, optionId: "dnd-id", optionLabel: "Do Not Disturb", optionEmoji: "🔴", optionColor: "#EF4444", note: "Coding", expiresAt: Date().addingTimeInterval(2400), updatedAt: Date())
]

// MARK: - Previews
#Preview("Small Detailed - 4 Friends", as: .systemSmall) {
    InstantStatusWidget()
} timeline: {
    SimpleEntry(
        date: .now,
        configuration: {
            let config = ConfigurationAppIntent()
            config.selectedFriends = [
                FriendEntity(id: "1", name: "Alex"),
                FriendEntity(id: "2", name: "Emma"),
                FriendEntity(id: "3", name: "John"),
                FriendEntity(id: "4", name: "Arda")
            ]
            return config
        }(),
        friends: mockStatuses,
        hasAnyFriends: true
    )
}


#Preview("Medium Widget - 8 Friends", as: .systemMedium) {
    InstantStatusWidget()
} timeline: {
    SimpleEntry(
        date: .now,
        configuration: ConfigurationAppIntent(),
        friends: [
            FriendStatusWidgetItem(id: "1", firstName: "Alex", lastName: nil, optionId: "busy-id", optionLabel: "Busy", optionEmoji: "🟠", optionColor: "#F59E0B", note: "In a meeting", expiresAt: Date().addingTimeInterval(1800), updatedAt: Date()),
            FriendStatusWidgetItem(id: "2", firstName: "Emma", lastName: nil, optionId: "available-id", optionLabel: "Available", optionEmoji: "🟢", optionColor: "#10B981", note: "Available now", expiresAt: nil, updatedAt: Date()),
            FriendStatusWidgetItem(id: "3", firstName: "John", lastName: nil, optionId: "focus-id", optionLabel: "Focus", optionEmoji: "🟣", optionColor: "#8B5CF6", note: "Deep work", expiresAt: nil, updatedAt: Date()),
            FriendStatusWidgetItem(id: "4", firstName: "Arda", lastName: nil, optionId: "dnd-id", optionLabel: "Do Not Disturb", optionEmoji: "🔴", optionColor: "#EF4444", note: "Do not disturb", expiresAt: Date().addingTimeInterval(3600), updatedAt: Date()),
            FriendStatusWidgetItem(id: "5", firstName: "Kerem", lastName: nil, optionId: "available-id", optionLabel: "Available", optionEmoji: "🟢", optionColor: "#10B981", note: nil, expiresAt: nil, updatedAt: Date()),
            FriendStatusWidgetItem(id: "6", firstName: "Hasan", lastName: nil, optionId: "busy-id", optionLabel: "Busy", optionEmoji: "🟠", optionColor: "#F59E0B", note: "In a call", expiresAt: Date().addingTimeInterval(600), updatedAt: Date()),
            FriendStatusWidgetItem(id: "7", firstName: "Melisa", lastName: nil, optionId: "social-id", optionLabel: "Social", optionEmoji: "🩷", optionColor: "#EC4899", note: "At a party", expiresAt: nil, updatedAt: Date()),
            FriendStatusWidgetItem(id: "8", firstName: "Ece", lastName: nil, optionId: "commute-id", optionLabel: "Commute", optionEmoji: "🔵", optionColor: "#3B82F6", note: "Driving", expiresAt: nil, updatedAt: Date())
        ],
        hasAnyFriends: true
    )
}
