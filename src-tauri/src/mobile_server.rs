use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{Html, IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;
use tauri::Manager;
use crate::db::DbState;
use crate::scanner::WatcherState;
use std::path::{Path, PathBuf};

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MobileServerSettings {
    pub enabled: bool,
    pub port: u16,
    pub local_only: bool,
    pub authorized_folders: Vec<String>,
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

pub struct GlobalMobileState {
    pub settings: MobileServerSettings,
    pub state: MobileState,
    pub handle: Option<ServerHandle>,
    pub app_handle: Option<tauri::AppHandle>,
}

pub type SharedState = Arc<Mutex<GlobalMobileState>>;

#[derive(Deserialize)]
pub struct SubfoldersQuery {
    pub path: String,
}

#[derive(Deserialize)]
pub struct ImagesQuery {
    pub folder: String,
}

#[derive(Deserialize)]
pub struct ImageQuery {
    pub path: String,
}

#[derive(Deserialize)]
pub struct ActionRequest {
    pub path: String,
    pub action: String,
}

/// Helper to check if a path is within approved roots
fn is_path_authorized(path: &Path, gs: &GlobalMobileState) -> bool {
    let mut roots: Vec<PathBuf> = gs.settings.authorized_folders.iter().map(PathBuf::from).collect();
    roots.extend(gs.state.recent_folders.iter().map(PathBuf::from));

    let target = match path.canonicalize() {
        Ok(p) => p,
        Err(_) => return false,
    };

    for root in roots {
        if let Ok(abs_root) = root.canonicalize() {
            if target.starts_with(abs_root) {
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
    {
        let gs = state.lock().unwrap();
        if !is_path_authorized(path, &gs) {
            return (StatusCode::FORBIDDEN, "Access denied").into_response();
        }
    }

    let mut images = Vec::new();
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if let Some(ext) = p.extension() {
                let ext = ext.to_string_lossy().to_lowercase();
                if ext == "png" || ext == "jpg" || ext == "jpeg" || ext == "webp" {
                    images.push(serde_json::json!({
                        "path": p.to_string_lossy(),
                        "name": p.file_name().unwrap().to_string_lossy()
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
            Response::builder()
                .header(axum::http::header::CONTENT_TYPE, mime)
                .body(axum::body::Body::from(data))
                .unwrap()
        }
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Failed to read image").into_response(),
    }
}

async fn post_action_handler(
    State(state): State<SharedState>,
    Json(payload): Json<ActionRequest>,
) -> impl IntoResponse {
    use crate::file_ops;
    
    let path_str = payload.path.clone();
    let path = Path::new(&path_str);
    
    let app_handle = {
        let gs = state.lock().unwrap();
        if !is_path_authorized(path, &gs) {
            return (StatusCode::FORBIDDEN, "Access denied").into_response();
        }
        gs.app_handle.clone()
    };

    if let Some(app) = app_handle {
        let db_state = app.state::<DbState>();
        let watcher_state = app.state::<WatcherState>();

        let result = match payload.action.as_str() {
            "keep" => file_ops::move_to_keep(db_state, watcher_state, vec![path_str]).map_err(|e| e.to_string()),
            "trash" => file_ops::delete_to_trash(db_state, watcher_state, vec![path_str]).map_err(|e| e.to_string()),
            "skip" => Ok(()),
            _ => Err("Invalid action".to_string()),
        };

        match result {
            Ok(_) => (StatusCode::OK, "Action processed").into_response(),
            Err(e) => (StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
        }
    } else {
        (StatusCode::INTERNAL_SERVER_ERROR, "App handle not available").into_response()
    }
}

#[tauri::command]
pub async fn update_mobile_server(
    settings: MobileServerSettings,
    recentFolders: Vec<String>,
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
    gs.state.recent_folders = recentFolders;
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
