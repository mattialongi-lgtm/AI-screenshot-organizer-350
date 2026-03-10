import SwiftUI
import SwiftData

@main
struct ScreenshotOrganizerApp: App {
    var sharedModelContainer: ModelContainer = {
        let schema = Schema([
            Screenshot.self,
        ])
        let modelConfiguration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)

        do {
            return try ModelContainer(for: schema, configurations: [modelConfiguration])
        } catch {
            fatalError("Could not create ModelContainer: \(error)")
        }
    }()

    var body: some Scene {
        WindowGroup {
            LibraryView()
        }
        .modelContainer(sharedModelContainer)
    }
}
