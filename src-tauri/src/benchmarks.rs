#[cfg(test)]
mod benchmarks {
    use std::time::Instant;
    use crate::metadata::read_metadata;
    use std::path::Path;
    use walkdir::WalkDir;
    use std::fs::File;
    use std::io::Read;

    #[test]
    fn benchmark_metadata_extraction() {
        let test_dir = Path::new("../test");
        if !test_dir.exists() { return; }

        let paths: Vec<_> = WalkDir::new(test_dir)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .map(|e| e.path().to_path_buf())
            .take(10)
            .collect();

        if paths.is_empty() { return; }

        println!("\n--- Metadata Extraction Benchmark ---");
        let start = Instant::now();
        for path in &paths {
            let item_start = Instant::now();
            let _ = read_metadata(path);
            println!("File: {:?}, Time: {:?}", path.file_name().unwrap(), item_start.elapsed());
        }
        println!("Total time for {} images: {:?}", paths.len(), start.elapsed());
    }

    #[test]
    fn benchmark_thumbnail_generation() {
        let test_dir = Path::new("../test");
        if !test_dir.exists() { return; }

        let paths: Vec<_> = WalkDir::new(test_dir)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .map(|e| e.path().to_string_lossy().to_string())
            .take(5)
            .collect();

        if paths.is_empty() { return; }

        println!("\n--- Thumbnail Generation Benchmark ---");
        let start = Instant::now();
        for path in &paths {
            let item_start = Instant::now();
            let img = image::open(Path::new(&path)).unwrap();
            let _ = img.thumbnail(512, 512);
            println!("File: {}, Time: {:?}", Path::new(&path).file_name().unwrap().to_string_lossy(), item_start.elapsed());
        }
        println!("Total time for {} thumbnails (in-memory resize): {:?}", paths.len(), start.elapsed());
    }

    #[test]
    fn benchmark_file_read_speed() {
        let test_dir = Path::new("../test");
        if !test_dir.exists() { return; }

        let paths: Vec<_> = WalkDir::new(test_dir)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
            .map(|e| e.path().to_path_buf())
            .collect();

        if paths.is_empty() { return; }

        println!("\n--- File Read Speed Benchmark ---");
        let start = Instant::now();
        let mut total_bytes = 0;
        for path in &paths {
            let mut file = File::open(path).unwrap();
            let mut buf = Vec::new();
            total_bytes += file.read_to_end(&mut buf).unwrap();
        }
        let elapsed = start.elapsed();
        println!("Read {} files ({} MB total) in {:?}", paths.len(), total_bytes / 1024 / 1024, elapsed);
        let mb_per_sec = (total_bytes as f64 / 1024.0 / 1024.0) / elapsed.as_secs_f64();
        println!("Average Speed: {:.2} MB/s", mb_per_sec);
    }

    #[test]
    fn benchmark_db_operations() {
        let temp_dir = tempfile::tempdir().unwrap();
        let db_path = temp_dir.path().join("test.db");
        
        println!("\n--- Database Performance Benchmark ---");
        
        let start = Instant::now();
        for _ in 0..100 {
            let _ = crate::db::DB::open(&db_path);
        }
        println!("Time to open/close DB 100 times: {:?}", start.elapsed());

        let mut db = crate::db::DB::open(&db_path).unwrap();
        let mut test_data = Vec::new();
        let info = crate::scanner::ImageInfo {
            path: "/test/path/img.png".to_string(),
            name: "img.png".to_string(),
            mtime: 12345678,
            size: 1024,
        };
        let meta = crate::metadata::ImageMetadata {
            prompt: Some("test prompt".to_string()),
            ..Default::default()
        };
        for i in 0..1000 {
            let mut info_clone = info.clone();
            info_clone.path = format!("/test/path/img_{}.png", i);
            test_data.push((info_clone, meta.clone()));
        }

        let start = Instant::now();
        let batch: Vec<_> = test_data.iter().map(|(i, m)| (i, m.clone())).collect();
        db.insert_images_batch(batch).unwrap();
        println!("Time to batch insert 1000 items: {:?}", start.elapsed());

        let start = Instant::now();
        for i in 0..1000 {
            let _ = db.get_metadata(&format!("/test/path/img_{}.png", i));
        }
        println!("Time to query 1000 individual items: {:?}", start.elapsed());
    }
}
