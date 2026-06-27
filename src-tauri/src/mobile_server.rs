use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::sse::{Event, KeepAlive, Sse},
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::sync::{Arc, Mutex};
use tokio::sync::{broadcast, oneshot};
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;
use tauri::Manager;
use notify::{EventKind, RecursiveMode, Watcher};
use crate::db::DbState;
use std::path::{Path, PathBuf};

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MobileServerSettings {
    pub enabled: bool,
    pub port: u16,
    pub local_only: bool,
    pub authorized_folders: Vec<String>,
    /// NSFW keywords used to hide images from the feed when SFW mode is on. `serde(default)`
    /// keeps older front-ends (that don't send this field) deserializing cleanly.
    #[serde(default)]
    pub nsfw_tags: Vec<String>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MobileState {
    pub recent_folders: Vec<String>,
    pub authorized_folders: Vec<String>,
}

pub struct ServerHandle {
    pub shutdown_tx: oneshot::Sender<()>,
}

/// A new image observed by the live-feed watcher. `folder` is the normalized (forward-slash)
/// active folder the event belongs to, so each SSE subscriber can ignore events for folders
/// other than the one it is watching.
#[derive(Clone, Serialize)]
pub struct FeedEvent {
    pub folder: String,
    pub path: String,
    pub name: String,
}

pub struct GlobalMobileState {
    pub settings: MobileServerSettings,
    pub state: MobileState,
    pub handle: Option<ServerHandle>,
    pub app_handle: Option<tauri::AppHandle>,
    /// Broadcast channel fanning live-feed events out to every connected `/api/feed` stream.
    pub feed_tx: broadcast::Sender<FeedEvent>,
    /// The single active folder watcher. Re-targeted as mobile clients change folders, so the
    /// feed always follows whatever folder the phone is currently browsing.
    pub feed_watcher: Option<notify::RecommendedWatcher>,
    pub feed_folder: Option<String>,
}

pub type SharedState = Arc<Mutex<GlobalMobileState>>;

#[derive(Deserialize)]
pub struct SubfoldersQuery {
    pub path: String,
}

#[derive(Deserialize)]
pub struct ImagesQuery {
    pub folder: String,
    /// "1"/"true" enables SFW mode: images whose prompt/filename match an NSFW keyword
    /// are excluded from the feed.
    #[serde(default)]
    pub sfw: Option<String>,
}

#[derive(Deserialize)]
pub struct ImageQuery {
    pub path: String,
    /// "1"/"true" serves the image as a download (Content-Disposition: attachment) so mobile
    /// browsers save it to the device instead of displaying it inline.
    #[serde(default)]
    pub dl: Option<String>,
}

#[derive(Deserialize)]
pub struct FeedQuery {
    pub folder: String,
}

/// Is `p` a real image we want to surface in the live feed? Excludes hidden/system subfolders
/// (`_Trash`, `_Keep`, dotfolders) so re-shelving an image doesn't re-announce it.
fn is_feed_image(p: &Path) -> bool {
    let ext_ok = p
        .extension()
        .map(|e| {
            let e = e.to_string_lossy().to_lowercase();
            e == "png" || e == "jpg" || e == "jpeg" || e == "webp"
        })
        .unwrap_or(false);
    if !ext_ok {
        return false;
    }
    !p.components().any(|c| {
        let s = c.as_os_str().to_string_lossy();
        s.starts_with('_') || s.starts_with('.')
    })
}

/// Point the single live-feed watcher at `folder` (recursive), recreating it only when the
/// target actually changes. New image files under the folder are broadcast to feed_tx.
fn ensure_feed_watcher(state: &SharedState, folder: &str) {
    let normalized = folder.replace('\\', "/");
    let tx = {
        let gs = state.lock().unwrap();
        if gs.feed_folder.as_deref() == Some(normalized.as_str()) && gs.feed_watcher.is_some() {
            return; // already watching this folder
        }
        gs.feed_tx.clone()
    };

    let folder_for_cb = normalized.clone();
    let mut watcher = match notify::RecommendedWatcher::new(
        move |res: notify::Result<notify::Event>| {
            let event = match res {
                Ok(e) => e,
                Err(_) => return,
            };
            if !matches!(event.kind, EventKind::Create(_) | EventKind::Modify(_)) {
                return;
            }
            for p in event.paths {
                if is_feed_image(&p) {
                    let name = p
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    let path = p.to_string_lossy().replace('\\', "/");
                    log::debug!("Live feed event: {} ({} subscribers)", path, tx.receiver_count());
                    let _ = tx.send(FeedEvent {
                        folder: folder_for_cb.clone(),
                        path,
                        name,
                    });
                }
            }
        },
        notify::Config::default(),
    ) {
        Ok(w) => w,
        Err(e) => {
            log::warn!("Failed to create feed watcher: {}", e);
            return;
        }
    };

    // notify (ReadDirectoryChangesW on Windows) needs a native-separator path. The folder the
    // phone sends may use `/` (root/recent folders are stored normalized) or `\` (subfolders
    // from read_dir), so convert to the platform separator before watching.
    let watch_target: String = if std::path::MAIN_SEPARATOR == '\\' {
        normalized.replace('/', "\\")
    } else {
        normalized.clone()
    };
    if let Err(e) = watcher.watch(Path::new(&watch_target), RecursiveMode::Recursive) {
        log::warn!("Failed to watch feed folder {}: {}", watch_target, e);
        return;
    }
    log::info!("Live feed watching {} (recursive)", watch_target);

    let mut gs = state.lock().unwrap();
    gs.feed_watcher = Some(watcher); // dropping the previous watcher stops the old folder
    gs.feed_folder = Some(normalized);
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionRequest {
    pub path: String,
    pub action: String,
    /// For the `undo` action: which bucket the file was moved into ("keep" | "trash").
    #[serde(default)]
    pub prev_action: Option<String>,
}

/// Helper to check if a path is within approved roots
fn is_path_authorized(path: &Path, gs: &GlobalMobileState) -> bool {
    let mut roots: Vec<PathBuf> = gs.settings.authorized_folders.iter().map(PathBuf::from).collect();
    roots.extend(gs.state.recent_folders.iter().map(PathBuf::from));

    // Normalize target path: handle Windows prefix and case
    let target = match path.canonicalize() {
        Ok(p) => p,
        Err(_) => return false,
    };

    for root in roots {
        if let Ok(abs_root) = root.canonicalize() {
            // Check if target is equal to or a subpath of root
            if target.starts_with(&abs_root) {
                return true;
            }
        }
    }
    false
}

pub async fn start_server(shared_state: SharedState) {
    let (settings, shutdown_tx) = {
        let mut gs = shared_state.lock().unwrap();
        if gs.handle.is_some() {
            return;
        }
        let (tx, rx) = oneshot::channel();
        gs.handle = Some(ServerHandle { shutdown_tx: tx });
        (gs.settings.clone(), rx)
    };

    if !settings.enabled {
        return;
    }

    let addr = if settings.local_only {
        SocketAddr::from(([127, 0, 0, 1], settings.port))
    } else {
        SocketAddr::from(([0, 0, 0, 0], settings.port))
    };

    let app = Router::new()
        .route("/", get(root_handler))
        .route("/api/state", get(get_state_handler))
        .route("/api/subfolders", get(get_subfolders_handler))
        .route("/api/images", get(get_images_handler))
        .route("/api/image", get(get_image_handler))
        .route("/api/feed", get(get_feed_handler))
        .route("/api/action", post(post_action_handler))
        .layer(CorsLayer::permissive())
        .with_state(shared_state.clone());

    log::info!("Mobile server starting on {}", addr);

    let listener = match tokio::net::TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            log::error!("Failed to bind to {}: {}", addr, e);
            return;
        }
    };

    let server = axum::serve(listener, app)
        .with_graceful_shutdown(async {
            shutdown_tx.await.ok();
            log::info!("Mobile server shutting down");
        });

    if let Err(e) = server.await {
        log::error!("Server error: {}", e);
    }
}

async fn root_handler() -> Html<&'static str> {
    Html(include_str!("mobile_index.html"))
}

async fn get_state_handler(State(state): State<SharedState>) -> Json<MobileState> {
    let gs = state.lock().unwrap();
    Json(gs.state.clone())
}

async fn get_subfolders_handler(
    State(state): State<SharedState>,
    Query(query): Query<SubfoldersQuery>,
) -> impl IntoResponse {
    let path = Path::new(&query.path);
    {
        let gs = state.lock().unwrap();
        if !is_path_authorized(path, &gs) {
            log::warn!("Access denied for subfolders: {:?}", path);
            return (StatusCode::FORBIDDEN, "Access denied").into_response();
        }
    }

    let mut folders = Vec::new();
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let name = p.file_name().unwrap_or_default().to_string_lossy().to_string();
                if !name.starts_with('.') && name != "_Trash" && name != "_Keep" {
                    folders.push(serde_json::json!({
                        "path": p.to_string_lossy(),
                        "name": name
                    }));
                }
            }
        }
    }
    folders.sort_by(|a, b| a["name"].as_str().unwrap().cmp(b["name"].as_str().unwrap()));
    Json(folders).into_response()
}

async fn get_images_handler(
    State(state): State<SharedState>,
    Query(query): Query<ImagesQuery>,
) -> impl IntoResponse {
    let path = Path::new(&query.folder);

    let sfw_mode = matches!(query.sfw.as_deref(), Some("1") | Some("true"));

    // Pull what we need from shared state (auth, NSFW keywords, app handle) under one lock.
    let (nsfw_tags, app_handle) = {
        let gs = state.lock().unwrap();
        if !is_path_authorized(path, &gs) {
            log::warn!("Access denied for images: {:?}", path);
            return (StatusCode::FORBIDDEN, "Access denied").into_response();
        }
        (gs.settings.nsfw_tags.clone(), gs.app_handle.clone())
    };

    // Build a filename -> NSFW lookup only when SFW mode is requested. Keyed by lowercase
    // basename (filenames are unique within a folder) to sidestep path-separator/normalization
    // differences between disk paths and DB-stored paths. Images not found in the index are
    // treated as SFW (shown) so a stale/partial index never blanks the feed.
    let nsfw_names: Option<std::collections::HashSet<String>> = if sfw_mode {
        let matcher = crate::nsfw::NsfwMatcher::new(&nsfw_tags);
        if matcher.is_empty() {
            None
        } else if let Some(app) = app_handle {
            let db_state = app.state::<DbState>();
            let guard = db_state.0.lock().unwrap();
            match guard.as_ref().map(|db| db.get_folder_prompts(&query.folder)) {
                Some(Ok(prompts)) => {
                    let mut set = std::collections::HashSet::new();
                    for (p, prompt) in prompts {
                        let base = Path::new(&p)
                            .file_name()
                            .map(|n| n.to_string_lossy().to_lowercase())
                            .unwrap_or_default();
                        if base.is_empty() {
                            continue;
                        }
                        if matcher.is_nsfw(prompt.as_deref(), Some(&base)) {
                            set.insert(base);
                        }
                    }
                    Some(set)
                }
                _ => None,
            }
        } else {
            None
        }
    } else {
        None
    };

    let mut images = Vec::new();
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if let Some(ext) = p.extension() {
                let ext = ext.to_string_lossy().to_lowercase();
                if ext == "png" || ext == "jpg" || ext == "jpeg" || ext == "webp" {
                    let name = p.file_name().unwrap().to_string_lossy().to_string();
                    if let Some(blocked) = &nsfw_names {
                        if blocked.contains(&name.to_lowercase()) {
                            continue;
                        }
                    }
                    images.push(serde_json::json!({
                        "path": p.to_string_lossy(),
                        "name": name
                    }));
                }
            }
        }
    }

    images.sort_by(|a, b| a["name"].as_str().unwrap().cmp(b["name"].as_str().unwrap()));
    Json(images).into_response()
}

async fn get_image_handler(State(state): State<SharedState>, Query(query): Query<ImageQuery>) -> Response {
    let path = Path::new(&query.path);
    {
        let gs = state.lock().unwrap();
        if !is_path_authorized(path, &gs) {
            return (StatusCode::FORBIDDEN, "Access denied").into_response();
        }
    }

    match std::fs::read(path) {
        Ok(data) => {
            let mime = if query.path.to_lowercase().ends_with(".png") { "image/png" }
                       else if query.path.to_lowercase().ends_with(".webp") { "image/webp" }
                       else { "image/jpeg" };
            let mut builder = Response::builder().header(axum::http::header::CONTENT_TYPE, mime);
            if matches!(query.dl.as_deref(), Some("1") | Some("true")) {
                // Force a download with the original filename. RFC 5987 filename* covers
                // non-ASCII names (e.g. Korean) for browsers that support it.
                let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "image".into());
                let encoded: String = percent_encoding::utf8_percent_encode(&name, percent_encoding::NON_ALPHANUMERIC).to_string();
                let ascii: String = name.chars().map(|c| if c.is_ascii() && c != '"' { c } else { '_' }).collect();
                builder = builder.header(
                    axum::http::header::CONTENT_DISPOSITION,
                    format!("attachment; filename=\"{}\"; filename*=UTF-8''{}", ascii, encoded),
                );
            }
            builder.body(axum::body::Body::from(data)).unwrap()
        }
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Failed to read image").into_response(),
    }
}

/// Server-Sent Events stream of new images appearing in `folder` (recursive). The phone opens
/// this for whatever folder it is currently browsing; the watcher re-targets accordingly, so
/// the live feed follows the phone even as the ComfyUI output folder changes.
async fn get_feed_handler(
    State(state): State<SharedState>,
    Query(query): Query<FeedQuery>,
) -> impl IntoResponse {
    let folder = query.folder.clone();
    {
        let gs = state.lock().unwrap();
        if !is_path_authorized(Path::new(&folder), &gs) {
            return (StatusCode::FORBIDDEN, "Access denied").into_response();
        }
    }

    ensure_feed_watcher(&state, &folder);

    let normalized = folder.replace('\\', "/");
    let rx = { state.lock().unwrap().feed_tx.subscribe() };

    let stream = BroadcastStream::new(rx).filter_map(move |res| match res {
        Ok(ev) if ev.folder == normalized => match Event::default().event("new-image").json_data(&ev) {
            Ok(e) => Some(Ok::<Event, Infallible>(e)),
            Err(_) => None,
        },
        // Ignore events for other folders and Lagged notifications.
        _ => None,
    });

    Sse::new(stream).keep_alive(KeepAlive::default()).into_response()
}

async fn post_action_handler(
    State(state): State<SharedState>,
    Json(payload): Json<ActionRequest>,
) -> impl IntoResponse {
    use crate::file_ops;

    let path_str = payload.path.clone();
    let original = PathBuf::from(&path_str);

    // For `undo`, the file currently lives in the _Keep/_Trash bucket, so that is the
    // path that exists on disk and must be authorized (the original does not exist yet).
    let undo_current: Option<PathBuf> = if payload.action == "undo" {
        let subdir = match payload.prev_action.as_deref() {
            Some("keep") => "_Keep",
            Some("trash") => "_Trash",
            _ => return (StatusCode::BAD_REQUEST, "Missing or invalid prevAction for undo").into_response(),
        };
        match (original.parent(), original.file_name()) {
            (Some(parent), Some(name)) => Some(parent.join(subdir).join(name)),
            _ => return (StatusCode::BAD_REQUEST, "Invalid path for undo").into_response(),
        }
    } else {
        None
    };

    let auth_path: &Path = undo_current.as_deref().unwrap_or(&original);

    let app_handle = {
        let gs = state.lock().unwrap();
        if !is_path_authorized(auth_path, &gs) {
            log::warn!("Access denied for action: {:?} with path: {:?}", payload.action, auth_path);
            return (StatusCode::FORBIDDEN, "Access denied").into_response();
        }
        gs.app_handle.clone()
    };

    if let Some(app) = app_handle {
        let db_state = app.state::<DbState>();

        log::info!("Executing mobile action: {} on {:?}", payload.action, original);

        let result = match payload.action.as_str() {
            "keep" => file_ops::move_to_keep_impl(db_state.inner(), vec![path_str]),
            "trash" => file_ops::delete_to_trash_impl(db_state.inner(), vec![path_str]),
            "skip" => Ok(()),
            "undo" => {
                let current = undo_current.expect("undo_current set for undo action");
                file_ops::undo_move_impl(db_state.inner(), &path_str, &current.to_string_lossy())
            }
            _ => Err("Invalid action".to_string()),
        };

        match result {
            Ok(_) => (StatusCode::OK, "Action processed").into_response(),
            Err(e) => {
                log::error!("Action failed: {}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, e).into_response()
            }
        }
    } else {
        (StatusCode::INTERNAL_SERVER_ERROR, "App handle not available").into_response()
    }
}

#[tauri::command]
pub async fn update_mobile_server(
    settings: MobileServerSettings,
    recent_folders: Vec<String>,
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedState>,
) -> Result<(), String> {
    log::info!("update_mobile_server called: enabled={}, port={}, localOnly={}, authorized_folders={:?}", settings.enabled, settings.port, settings.local_only, settings.authorized_folders);
    let mut gs = state.lock().unwrap();
    
    if gs.app_handle.is_none() {
        gs.app_handle = Some(app);
    }

    let restart_needed = gs.settings.port != settings.port || 
                         gs.settings.local_only != settings.local_only ||
                         (gs.settings.enabled != settings.enabled && settings.enabled);
    
    let stop_needed = gs.settings.enabled && !settings.enabled;

    gs.settings = settings.clone();
    gs.state.recent_folders = recent_folders;
    gs.state.authorized_folders = settings.authorized_folders;

    if stop_needed || restart_needed {
        if let Some(handle) = gs.handle.take() {
            let _ = handle.shutdown_tx.send(());
        }
    }

    if (restart_needed || gs.handle.is_none()) && gs.settings.enabled {
        let state_clone = Arc::clone(&state.inner());
        tauri::async_runtime::spawn(async move {
            start_server(state_clone).await;
        });
    }

    Ok(())
}

#[tauri::command]
pub fn get_local_ip() -> Option<String> {
    use std::net::UdpSocket;
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    socket.local_addr().ok().map(|addr| addr.ip().to_string())
}
