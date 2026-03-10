import Foundation
import Photos
import SwiftUI
import SwiftData

@Observable
class PhotoImportService: NSObject, PHPhotoLibraryChangeObserver {
    private var modelContext: ModelContext?
    var isAutoImportEnabled: Bool = false {
        didSet {
            UserDefaults.standard.set(isAutoImportEnabled, forKey: "autoImportEnabled")
        }
    }
    
    var isScanning: Bool = false
    var progress: Double = 0
    
    init(modelContext: ModelContext? = nil) {
        self.modelContext = modelContext
        self.isAutoImportEnabled = UserDefaults.standard.bool(forKey: "autoImportEnabled")
        super.init()
        PHPhotoLibrary.shared().register(self)
    }
    
    func setContext(_ context: ModelContext) {
        self.modelContext = context
    }
    
    func requestPermission(completion: @escaping (Bool) -> Void) {
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
            DispatchQueue.main.async {
                completion(status == .authorized || status == .limited)
            }
        }
    }
    
    func scanForScreenshots() {
        guard !isScanning else { return }
        isScanning = true
        progress = 0
        
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self = self else { return }
            
            let fetchOptions = PHFetchOptions()
            fetchOptions.predicate = NSPredicate(format: "mediaSubtype == %d", PHAssetMediaSubtype.photoScreenshot.rawValue)
            fetchOptions.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
            
            let allScreenshots = PHAsset.fetchAssets(with: .image, options: fetchOptions)
            let total = allScreenshots.count
            
            allScreenshots.enumerateObjects { (asset, index, stop) in
                self.importAssetIfNeeded(asset)
                DispatchQueue.main.async {
                    self.progress = Double(index + 1) / Double(total)
                }
            }
            
            DispatchQueue.main.async {
                self.isScanning = false
            }
        }
    }
    
    private func importAssetIfNeeded(_ asset: PHAsset) {
        guard let context = modelContext else { return }
        
        let localId = asset.localIdentifier
        
        // Check if already imported
        let descriptor = FetchDescriptor<Screenshot>(predicate: #Predicate { $0.sourceId == localId })
        let existing = try? context.fetch(descriptor)
        
        if existing?.isEmpty ?? true {
            let newScreenshot = Screenshot(
                createdAt: asset.creationDate ?? Date(),
                source: "Photos",
                sourceId: localId
            )
            
            // Fetch thumbnail
            let manager = PHImageManager.default()
            let options = PHImageRequestOptions()
            options.isSynchronous = true
            options.deliveryMode = .opportunistic
            
            manager.requestImage(for: asset, targetSize: CGSize(width: 300, height: 300), contentMode: .aspectFill, options: options) { image, _ in
                if let image = image {
                    newScreenshot.thumbnailData = image.jpegData(compressionQuality: 0.7)
                }
            }
            
            context.insert(newScreenshot)
            try? context.save()
            
            // Trigger analysis pipeline
            Task {
                await AnalysisPipeline.shared.process(newScreenshot)
            }
        }
    }
    
    // MARK: - PHPhotoLibraryChangeObserver
    func photoLibraryDidChange(_ changeInstance: PHChange) {
        guard isAutoImportEnabled else { return }
        
        // In a real app, we would fetch the screenshots album and check for changes
        // For this demo, we trigger a scan when changes occur
        DispatchQueue.main.async {
            self.scanForScreenshots()
        }
    }
}
