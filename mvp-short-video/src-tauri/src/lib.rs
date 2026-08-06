// Clips Studio · Tauri 桌面端后端
// 约定：所有文件/数据库操作命令均为 async（tokio）；rusqlite 为同步库，统一用
// spawn_blocking 包裹，避免阻塞异步运行时；长任务（渲染）通过事件流式上报进度并可取消。
use std::path::{Path, PathBuf};

use rusqlite::params;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;
use tokio::io::{AsyncBufReadExt, BufReader};

use std::collections::HashMap;

#[derive(Default)]
struct RenderState {
    child: tokio::sync::Mutex<Option<tokio::process::Child>>,
}

#[derive(Default)]
struct MediaState {
    jobs: tokio::sync::Mutex<HashMap<String, tokio::process::Child>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct CheckResult {
    exists: bool,
    source: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ImportedRecord {
    rel_path: String,
    hash: String,
    size: u64,
    name: String,
    duplicate: bool,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LibraryRecord {
    rel: String,
    hash: String,
    size: u64,
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenderJobInput {
    id: String,
    timeline: serde_json::Value,
}

fn app_data(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| "无法获取应用数据目录：".to_string() + &error.to_string())
}

fn assets_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app_data(app)?.join("assets");
    std::fs::create_dir_all(&dir)
        .map_err(|error| "创建素材目录失败：".to_string() + &error.to_string())?;
    Ok(dir)
}

fn renders_dir(app: &AppHandle, job_id: &str) -> Result<PathBuf, String> {
    let dir = app_data(app)?.join("renders").join(job_id);
    std::fs::create_dir_all(&dir)
        .map_err(|error| "创建渲染目录失败：".to_string() + &error.to_string())?;
    Ok(dir)
}

fn index_path(app: &AppHandle) -> PathBuf {
    app_data(app).unwrap_or_default().join("library-index.json")
}

async fn read_index(app: &AppHandle) -> Result<Vec<LibraryRecord>, String> {
    let path = index_path(app);
    if !tokio::fs::try_exists(&path)
        .await
        .map_err(|error| error.to_string())?
    {
        return Ok(Vec::new());
    }
    let content = tokio::fs::read_to_string(&path)
        .await
        .map_err(|error| "读取素材索引失败：".to_string() + &error.to_string())?;
    serde_json::from_str(&content)
        .map_err(|error| "解析素材索引失败：".to_string() + &error.to_string())
}

async fn write_index(app: &AppHandle, records: &[LibraryRecord]) -> Result<(), String> {
    let content = serde_json::to_string_pretty(records).map_err(|error| error.to_string())?;
    tokio::fs::write(index_path(app), content)
        .await
        .map_err(|error| "写入素材索引失败：".to_string() + &error.to_string())
}

async fn sha256_of(path: &Path) -> Result<String, String> {
    let path = path.to_path_buf();
    tokio::task::spawn_blocking(move || {
        let bytes = std::fs::read(&path)
            .map_err(|error| "读取文件失败：".to_string() + &error.to_string())?;
        let mut hasher = Sha256::new();
        hasher.update(&bytes);
        Ok::<String, String>(format!("{:x}", hasher.finalize()))
    })
    .await
    .map_err(|error| "哈希计算任务失败：".to_string() + &error.to_string())?
}

/// 弹出多选文件对话框（异步等待用户选择）。
#[tauri::command]
async fn pick_asset_files(app: AppHandle) -> Result<Vec<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .add_filter(
            "媒体素材",
            &["mp4", "mov", "webm", "jpg", "jpeg", "png", "webp", "svg"],
        )
        .pick_files(move |paths| {
            let selected: Vec<String> = paths
                .map(|items| {
                    items
                        .into_iter()
                        .filter_map(|file| file.into_path().ok())
                        .filter_map(|path| path.to_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();
            let _ = tx.send(selected);
        });
    let files = rx.await.map_err(|_| "文件选择对话框未返回结果。")?;
    Ok(files)
}

/// 批量导入本地文件到素材库：异步哈希、按 hash 去重、异步复制，并维护本机索引。
#[tauri::command]
async fn import_asset_files(
    app: AppHandle,
    paths: Vec<String>,
) -> Result<Vec<ImportedRecord>, String> {
    let dir = assets_dir(&app)?;
    let mut index = read_index(&app).await?;
    let mut imported: Vec<ImportedRecord> = Vec::new();

    for raw_path in paths {
        let source = PathBuf::from(raw_path);
        if !tokio::fs::try_exists(&source).await.unwrap_or(false) {
            continue;
        }
        let size = tokio::fs::metadata(&source)
            .await
            .map_err(|error| error.to_string())?
            .len();
        let hash = sha256_of(&source).await?;

        if let Some(existing) = index.iter().find(|record| record.hash == hash) {
            imported.push(ImportedRecord {
                rel_path: existing.rel.clone(),
                hash,
                size,
                name: existing.name.clone(),
                duplicate: true,
            });
            continue;
        }

        let file_name = source
            .file_name()
            .and_then(|name| name.to_str())
            .map(|name| name.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "-"))
            .unwrap_or_else(|| "asset.bin".to_string());
        let rel = format!("library/{}-{}", &hash[..16], file_name);
        let destination = dir.join(Path::new(&rel).file_name().unwrap_or_default());

        tokio::fs::copy(&source, &destination)
            .await
            .map_err(|error| "复制素材失败：".to_string() + &error.to_string())?;

        index.push(LibraryRecord {
            rel: rel.clone(),
            hash: hash.clone(),
            size,
            name: file_name,
        });
        imported.push(ImportedRecord {
            rel_path: rel,
            hash,
            size,
            name: source
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
                .to_string(),
            duplicate: false,
        });
    }

    write_index(&app, &index).await?;
    Ok(imported)
}

/// 检查素材文件是否真实存在（相对路径；异步磁盘校验）。
#[tauri::command]
async fn check_asset_exists(app: AppHandle, rel: String) -> Result<CheckResult, String> {
    let rel = rel.trim_start_matches('/').replace("public/", "");
    let candidates: Vec<(PathBuf, &str)> = if rel.starts_with("library/") {
        vec![(
            assets_dir(&app)?.join(rel.trim_start_matches("library/")),
            "library",
        )]
    } else {
        vec![
            (assets_dir(&app)?.join(rel.clone()), "library"),
            (
                std::env::current_dir()
                    .map_err(|error| error.to_string())?
                    .join("public")
                    .join(rel),
                "project",
            ),
        ]
    };

    for (path, source) in candidates {
        if tokio::fs::try_exists(&path)
            .await
            .map_err(|error| error.to_string())?
        {
            return Ok(CheckResult {
                exists: true,
                source: source.to_string(),
            });
        }
    }

    Ok(CheckResult {
        exists: false,
        source: String::new(),
    })
}

/// 把相对素材路径解析为磁盘绝对路径（仅用于本机预览，绝不写入导出包）。
#[tauri::command]
async fn resolve_asset_path(app: AppHandle, rel: String) -> Result<Option<String>, String> {
    let rel = rel.trim_start_matches('/').replace("public/", "");
    let candidates = if rel.starts_with("library/") {
        vec![assets_dir(&app)?.join(rel.trim_start_matches("library/"))]
    } else {
        vec![
            assets_dir(&app)?.join(rel.clone()),
            std::env::current_dir()
                .map_err(|error| error.to_string())?
                .join("public")
                .join(rel),
        ]
    };

    for path in candidates {
        if tokio::fs::try_exists(&path).await.unwrap_or(false) {
            return Ok(path.to_str().map(String::from));
        }
    }
    Ok(None)
}

/// 保存文本文件（异步保存对话框 + 异步写入），返回保存路径或 None（用户取消）。
#[tauri::command]
async fn save_text_file(
    app: AppHandle,
    default_name: String,
    content: String,
) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_file_name(&default_name)
        .save_file(move |path| {
            let _ = tx.send(path.and_then(|file| file.into_path().ok()));
        });
    let selected = rx.await.map_err(|_| "保存对话框未返回结果。")?;
    let Some(selected) = selected else {
        return Ok(None);
    };
    tokio::fs::write(&selected, content)
        .await
        .map_err(|error| "写入文件失败：".to_string() + &error.to_string())?;
    Ok(selected.to_str().map(String::from))
}

/// 启动 Remotion 渲染任务（异步）：写 props、spawn npx remotion render，
/// 进度日志通过 `render://<jobId>` 事件流式上报，支持取消。
#[tauri::command]
async fn run_render_job(
    app: AppHandle,
    state: State<'_, RenderState>,
    job: RenderJobInput,
) -> Result<String, String> {
    {
        let child_guard = state.child.lock().await;
        if child_guard.is_some() {
            return Err("已有渲染任务在运行，请先取消或等待完成。".to_string());
        }
    }

    let event = format!("render://{}", job.id);
    let job_dir = renders_dir(&app, &job.id)?;
    let props_path = job_dir.join("props.json");
    let output_path = job_dir.join("vertical-draft.mp4");

    tokio::fs::write(
        &props_path,
        serde_json::to_string_pretty(&job.timeline).map_err(|error| error.to_string())?,
    )
    .await
    .map_err(|error| "写入 props 失败：".to_string() + &error.to_string())?;

    let project_root = std::env::current_dir().map_err(|error| error.to_string())?;
    let npx = if cfg!(windows) { "npx.cmd" } else { "npx" };
    let mut command = tokio::process::Command::new(npx);
    command
        .current_dir(&project_root)
        .arg("remotion")
        .arg("render")
        .arg("src/index.ts")
        .arg("VerticalDraft")
        .arg(&output_path)
        .arg(format!("--props={}", props_path.display()))
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let mut child = command.spawn().map_err(|error| {
        "无法启动渲染进程（需要 Node.js 与项目依赖）：".to_string() + &error.to_string()
    })?;

    let stdout = child.stdout.take().ok_or("无法读取渲染输出。")?;
    let stderr = child.stderr.take().ok_or("无法读取渲染错误输出。")?;

    {
        let mut child_guard = state.child.lock().await;
        *child_guard = Some(child);
    }

    let mut stdout_lines = BufReader::new(stdout).lines();
    while let Some(line) = stdout_lines
        .next_line()
        .await
        .map_err(|error| error.to_string())?
    {
        let _ = app.emit(&event, serde_json::json!({"type": "log", "line": line}));
    }

    let mut stderr_lines = BufReader::new(stderr).lines();
    while let Some(line) = stderr_lines
        .next_line()
        .await
        .map_err(|error| error.to_string())?
    {
        let _ = app.emit(&event, serde_json::json!({"type": "log", "line": line}));
    }

    let status = {
        let mut child_guard = state.child.lock().await;
        match child_guard.take() {
            Some(mut running) => {
                let status = running.wait().await.map_err(|error| error.to_string())?;
                Some(status)
            }
            None => None, // 任务已被 cancel_render_job 接管并结束
        }
    };

    if let Some(status) = status {
        if status.success() {
            let _ = app.emit(
                &event,
                serde_json::json!({"type": "done", "output": output_path.to_string_lossy()}),
            );
            Ok(output_path.to_string_lossy().to_string())
        } else {
            let error = format!("渲染进程退出码：{}", status.code().unwrap_or(-1));
            let _ = app.emit(
                &event,
                serde_json::json!({"type": "failed", "error": error}),
            );
            Err(error)
        }
    } else {
        let _ = app.emit(
            &event,
            serde_json::json!({"type": "cancelled", "output": output_path.to_string_lossy()}),
        );
        Ok(output_path.to_string_lossy().to_string())
    }
}

/// 取消当前渲染任务（异步杀掉子进程）。
#[tauri::command]
async fn cancel_render_job(state: State<'_, RenderState>) -> Result<bool, String> {
    let mut child_guard = state.child.lock().await;
    if let Some(mut child) = child_guard.take() {
        let _ = child.kill().await;
        let _ = child.wait().await;
        Ok(true)
    } else {
        Ok(false)
    }
}

/// 前端窗口 chrome 就绪后调用：macOS 使用 Overlay 标题栏（保留原生红绿灯），
/// 其余平台在运行时去掉系统标题栏，由前端自绘窗口控制按钮。
#[tauri::command]
fn window_chrome_ready(_app: AppHandle) -> Result<(), String> {
    #[cfg(not(target_os = "macos"))]
    if let Some(window) = _app.get_webview_window("main") {
        window
            .set_decorations(false)
            .map_err(|error| format!("无法隐藏系统标题栏：{error}"))?;
    }
    Ok(())
}

fn db_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data(app)?.join("clips-studio.db"))
}

fn open_db(path: &Path) -> Result<rusqlite::Connection, String> {
    let conn = rusqlite::Connection::open(path)
        .map_err(|error| "打开数据库失败：".to_string() + &error.to_string())?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS kv (
           store TEXT NOT NULL,
           key TEXT NOT NULL,
           value TEXT NOT NULL,
           PRIMARY KEY (store, key)
         );
         CREATE TABLE IF NOT EXISTS blobs (
           key TEXT PRIMARY KEY,
           data BLOB NOT NULL
         );
         CREATE TABLE IF NOT EXISTS projects (
           id TEXT PRIMARY KEY,
           name TEXT NOT NULL,
           config TEXT NOT NULL,
           rules TEXT NOT NULL,
           assets_text TEXT NOT NULL,
           tags TEXT NOT NULL,
           authorization TEXT NOT NULL,
           saved_at TEXT NOT NULL
         );",
    )
    .map_err(|error| "初始化数据库失败：".to_string() + &error.to_string())?;
    Ok(conn)
}

async fn with_db<T, F>(app: &AppHandle, run: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(rusqlite::Connection) -> Result<T, String> + Send + 'static,
{
    let path = db_path(app)?;
    tokio::task::spawn_blocking(move || {
        let conn = open_db(&path)?;
        run(conn)
    })
    .await
    .map_err(|error| "数据库任务失败：".to_string() + &error.to_string())?
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProjectMeta {
    id: String,
    name: String,
    saved_at: String,
    draft_count: usize,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ProjectData {
    id: String,
    name: String,
    config: serde_json::Value,
    rules: serde_json::Value,
    assets_text: String,
    tags: serde_json::Value,
    authorization: serde_json::Value,
    saved_at: String,
}

/// 写入 kv 记录（workspace / drafts / draft_versions / assets / asset_authorization / render_jobs）。
#[tauri::command]
async fn db_put(
    app: AppHandle,
    store: String,
    key: String,
    value: serde_json::Value,
) -> Result<(), String> {
    let json = value.to_string();
    with_db(&app, move |conn| {
        conn.execute(
            "INSERT INTO kv (store, key, value) VALUES (?1, ?2, ?3)
             ON CONFLICT(store, key) DO UPDATE SET value = excluded.value",
            params![store, key, json],
        )
        .map_err(|error| error.to_string())?;
        Ok(())
    })
    .await
}

#[tauri::command]
async fn db_get(
    app: AppHandle,
    store: String,
    key: String,
) -> Result<Option<serde_json::Value>, String> {
    with_db(&app, move |conn| {
        let value: Option<String> = conn
            .query_row(
                "SELECT value FROM kv WHERE store = ?1 AND key = ?2",
                params![store, key],
                |row| row.get(0),
            )
            .ok()
            .flatten();
        Ok(value.and_then(|text| serde_json::from_str(&text).ok()))
    })
    .await
}

#[tauri::command]
async fn db_delete(app: AppHandle, store: String, key: String) -> Result<(), String> {
    with_db(&app, move |conn| {
        conn.execute(
            "DELETE FROM kv WHERE store = ?1 AND key = ?2",
            params![store, key],
        )
        .map_err(|error| error.to_string())?;
        Ok(())
    })
    .await
}

#[tauri::command]
async fn db_list_keys(app: AppHandle, store: String) -> Result<Vec<String>, String> {
    with_db(&app, move |conn| {
        let mut statement = conn
            .prepare("SELECT key FROM kv WHERE store = ?1 ORDER BY key")
            .map_err(|error| error.to_string())?;
        let keys = statement
            .query_map(params![store], |row| row.get(0))
            .map_err(|error| error.to_string())?
            .filter_map(|item| item.ok())
            .collect();
        Ok(keys)
    })
    .await
}

#[tauri::command]
async fn db_put_blob(app: AppHandle, key: String, data: Vec<u8>) -> Result<(), String> {
    with_db(&app, move |conn| {
        conn.execute(
            "INSERT INTO blobs (key, data) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET data = excluded.data",
            params![key, data],
        )
        .map_err(|error| error.to_string())?;
        Ok(())
    })
    .await
}

#[tauri::command]
async fn db_get_blob(app: AppHandle, key: String) -> Result<Option<Vec<u8>>, String> {
    with_db(&app, move |conn| {
        let data: Option<Vec<u8>> = conn
            .query_row(
                "SELECT data FROM blobs WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .ok()
            .flatten();
        Ok(data)
    })
    .await
}

#[tauri::command]
async fn db_delete_blob(app: AppHandle, key: String) -> Result<(), String> {
    with_db(&app, move |conn| {
        conn.execute("DELETE FROM blobs WHERE key = ?1", params![key])
            .map_err(|error| error.to_string())?;
        Ok(())
    })
    .await
}

/// 保存/更新一个商家项目（配置 + 规则 + 素材清单与标签/授权）。
#[tauri::command]
async fn project_save(
    app: AppHandle,
    project_id: String,
    name: String,
    config: serde_json::Value,
    rules: serde_json::Value,
    assets_text: String,
    tags: serde_json::Value,
    authorization: serde_json::Value,
    saved_at: String,
) -> Result<(), String> {
    with_db(&app, move |conn| {
        conn.execute(
            "INSERT INTO projects (id, name, config, rules, assets_text, tags, authorization, saved_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               config = excluded.config,
               rules = excluded.rules,
               assets_text = excluded.assets_text,
               tags = excluded.tags,
               authorization = excluded.authorization,
               saved_at = excluded.saved_at",
            params![
                project_id,
                name,
                config.to_string(),
                rules.to_string(),
                assets_text,
                tags.to_string(),
                authorization.to_string(),
                saved_at
            ],
        )
        .map_err(|error| error.to_string())?;
        Ok(())
    })
    .await
}

#[tauri::command]
async fn project_list(app: AppHandle) -> Result<Vec<ProjectMeta>, String> {
    with_db(&app, move |conn| {
        let mut statement = conn
            .prepare("SELECT id, name, saved_at FROM projects ORDER BY saved_at DESC")
            .map_err(|error| error.to_string())?;
        let metas = statement
            .query_map([], |row| {
                Ok(ProjectMeta {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    saved_at: row.get(2)?,
                    draft_count: 0,
                })
            })
            .map_err(|error| error.to_string())?
            .filter_map(|item| item.ok())
            .collect();
        Ok(metas)
    })
    .await
}

#[tauri::command]
async fn project_load(app: AppHandle, id: String) -> Result<Option<ProjectData>, String> {
    with_db(&app, move |conn| {
        let data = conn
            .query_row(
                "SELECT id, name, config, rules, assets_text, tags, authorization, saved_at
                 FROM projects WHERE id = ?1",
                params![id],
                |row| {
                    Ok(ProjectData {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        config: serde_json::from_str(&row.get::<_, String>(2)?)
                            .unwrap_or(serde_json::json!({})),
                        rules: serde_json::from_str(&row.get::<_, String>(3)?)
                            .unwrap_or(serde_json::json!({})),
                        assets_text: row.get(4)?,
                        tags: serde_json::from_str(&row.get::<_, String>(5)?)
                            .unwrap_or(serde_json::json!({})),
                        authorization: serde_json::from_str(&row.get::<_, String>(6)?)
                            .unwrap_or(serde_json::json!({})),
                        saved_at: row.get(7)?,
                    })
                },
            )
            .ok();
        Ok(data)
    })
    .await
}

#[tauri::command]
async fn project_delete(app: AppHandle, id: String) -> Result<(), String> {
    with_db(&app, move |conn| {
        conn.execute("DELETE FROM projects WHERE id = ?1", params![id])
            .map_err(|error| error.to_string())?;
        Ok(())
    })
    .await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(RenderState::default())
        .manage(MediaState::default())
        .invoke_handler(tauri::generate_handler![
            pick_asset_files,
            import_asset_files,
            check_asset_exists,
            resolve_asset_path,
            save_text_file,
            run_render_job,
            cancel_render_job,
            window_chrome_ready,
            db_put,
            db_get,
            db_delete,
            db_list_keys,
            db_put_blob,
            db_get_blob,
            db_delete_blob,
            project_save,
            project_list,
            project_load,
            project_delete,
            media_tools,
            media_probe,
            media_slice,
            media_transcribe,
            media_cancel
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// ---- 媒体处理（FFmpeg / Whisper）----
/// 全部异步：检测用 spawn_blocking，切片/转写用 tokio 子进程 + 事件流（media://<jobId>），可取消。

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct MediaTools {
    ffmpeg: Option<String>,
    ffprobe: Option<String>,
    whisper: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct MediaInfo {
    duration: Option<f64>,
    width: Option<u32>,
    height: Option<u32>,
    codec: Option<String>,
    size: Option<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MediaSliceJob {
    id: String,
    input_path: String,
    start: f64,
    duration: f64,
    output_name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MediaTranscribeJob {
    id: String,
    input_path: String,
    output_name: String,
    model: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TranscriptSegment {
    start: f64,
    end: f64,
    text: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct MediaSliceResult {
    rel_path: String,
    absolute_path: String,
    thumbnail_path: Option<String>,
    duration: f64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct MediaTranscribeResult {
    language: Option<String>,
    model: Option<String>,
    segments: Vec<TranscriptSegment>,
    srt_path: Option<String>,
}

fn detect_binary(names: &[&str]) -> Option<String> {
    for name in names {
        if let Ok(output) = std::process::Command::new(name).arg("-version").output() {
            if output.status.success() {
                return Some(name.to_string());
            }
        }
    }
    None
}

/// 探测本机媒体工具（ffmpeg / ffprobe / whisper.cpp CLI）。
#[tauri::command]
async fn media_tools() -> Result<MediaTools, String> {
    tokio::task::spawn_blocking(|| {
        Ok(MediaTools {
            ffmpeg: detect_binary(&["ffmpeg"]),
            ffprobe: detect_binary(&["ffprobe"]),
            whisper: detect_binary(&["whisper-cli", "whisper", "whisper-cpp"]),
        })
    })
    .await
    .map_err(|error| "媒体工具检测失败：".to_string() + &error.to_string())?
}

/// 用 ffprobe 读取媒体信息（时长 / 分辨率 / 编码 / 大小）。
#[tauri::command]
async fn media_probe(app: AppHandle, path: String) -> Result<Option<MediaInfo>, String> {
    let ffprobe = detect_binary(&["ffprobe"]);
    let Some(ffprobe) = ffprobe else {
        return Err("未检测到 ffprobe，请先安装 FFmpeg。".to_string());
    };
    let _ = &app;

    tokio::task::spawn_blocking(move || {
        let output = std::process::Command::new(&ffprobe)
            .args([
                "-v",
                "quiet",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                &path,
            ])
            .output()
            .map_err(|error| "ffprobe 执行失败：".to_string() + &error.to_string())?;
        if !output.status.success() {
            return Ok(None);
        }
        let parsed: serde_json::Value = serde_json::from_slice(&output.stdout)
            .map_err(|error| "解析 ffprobe 输出失败：".to_string() + &error.to_string())?;

        let video_stream = parsed["streams"].as_array().and_then(|streams| {
            streams
                .iter()
                .find(|stream| stream["codec_type"] == "video")
        });
        let format = parsed["format"].as_object().cloned().unwrap_or_default();

        Ok(Some(MediaInfo {
            duration: format
                .get("duration")
                .and_then(|value| value.as_str())
                .and_then(|text| text.parse::<f64>().ok())
                .or_else(|| {
                    video_stream
                        .and_then(|stream| stream["duration"].as_str())
                        .and_then(|text| text.parse::<f64>().ok())
                }),
            width: video_stream
                .and_then(|stream| stream["width"].as_u64())
                .map(|value| value as u32),
            height: video_stream
                .and_then(|stream| stream["height"].as_u64())
                .map(|value| value as u32),
            codec: video_stream
                .and_then(|stream| stream["codec_name"].as_str())
                .map(String::from),
            size: format
                .get("size")
                .and_then(|value| value.as_str())
                .and_then(|text| text.parse::<u64>().ok()),
        }))
    })
    .await
    .map_err(|error| "媒体探测任务失败：".to_string() + &error.to_string())?
}

async fn spawn_media_job(
    state: &State<'_, MediaState>,
    job_id: &str,
    command: &mut tokio::process::Command,
) -> Result<tokio::process::Child, String> {
    {
        let jobs = state.jobs.lock().await;
        if jobs.contains_key(job_id) {
            return Err("该媒体任务已在运行。".to_string());
        }
    }
    let child = command
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|error| "无法启动媒体处理进程：".to_string() + &error.to_string())?;
    {
        let mut jobs = state.jobs.lock().await;
        jobs.insert(job_id.to_string(), child);
    }
    let mut jobs = state.jobs.lock().await;
    let child = jobs.remove(job_id).ok_or("媒体任务状态异常。")?;
    Ok(child)
}

async fn stream_media_logs(
    app: &AppHandle,
    event: &str,
    mut child: tokio::process::Child,
    state: &State<'_, MediaState>,
    job_id: &str,
) -> Result<bool, String> {
    let stdout = child.stdout.take().ok_or("无法读取媒体进程输出。")?;
    let stderr = child.stderr.take().ok_or("无法读取媒体进程错误输出。")?;

    let mut stdout_lines = BufReader::new(stdout).lines();
    while let Some(line) = stdout_lines
        .next_line()
        .await
        .map_err(|error| error.to_string())?
    {
        let _ = app.emit(event, serde_json::json!({"type": "log", "line": line}));
    }
    let mut stderr_lines = BufReader::new(stderr).lines();
    while let Some(line) = stderr_lines
        .next_line()
        .await
        .map_err(|error| error.to_string())?
    {
        let _ = app.emit(event, serde_json::json!({"type": "log", "line": line}));
    }

    let status = {
        let mut jobs = state.jobs.lock().await;
        match jobs.remove(job_id) {
            Some(mut running) => {
                let status = running.wait().await.map_err(|error| error.to_string())?;
                Some(status)
            }
            None => None, // 已通过 media_cancel 移除
        }
    };

    match status {
        Some(status) if status.success() => Ok(true),
        Some(status) => Err(format!("媒体处理退出码：{}", status.code().unwrap_or(-1))),
        None => Err("媒体任务已取消。".to_string()),
    }
}

fn safe_file_stem(name: &str) -> String {
    let stem = Path::new(name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("clip");
    stem.replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "-")
}

/// 切片 + 转码：ffmpeg 按起止截取片段，转 h264/aac，输出到素材库 clips/ 目录并生成缩略图。
/// 通过 media://<jobId> 事件流式上报进度。
#[tauri::command]
async fn media_slice(
    app: AppHandle,
    state: State<'_, MediaState>,
    job: MediaSliceJob,
) -> Result<MediaSliceResult, String> {
    let ffmpeg = detect_binary(&["ffmpeg"]);
    let Some(ffmpeg) = ffmpeg else {
        return Err("未检测到 ffmpeg，请先安装 FFmpeg（brew install ffmpeg）。".to_string());
    };
    if !tokio::fs::try_exists(&job.input_path)
        .await
        .map_err(|error| error.to_string())?
    {
        return Err(format!("输入文件不存在：{}", job.input_path));
    }

    let event = format!("media://{}", job.id);
    let clips_dir = assets_dir(&app)?.join("clips");
    tokio::fs::create_dir_all(&clips_dir)
        .await
        .map_err(|error| "创建切片目录失败：".to_string() + &error.to_string())?;

    let stem = safe_file_stem(&job.output_name);
    let rel = format!("clips/{stem}.mp4");
    let output_path = clips_dir.join(format!("{stem}.mp4"));
    let thumb_path = clips_dir.join(format!("{stem}-thumb.jpg"));

    let start = job.start.max(0.0);
    let duration = job.duration.max(0.5);
    let mut command = tokio::process::Command::new(&ffmpeg);
    command
        .arg("-y")
        .arg("-ss")
        .arg(format!("{start:.2}"))
        .arg("-i")
        .arg(&job.input_path)
        .arg("-t")
        .arg(format!("{duration:.2}"))
        .arg("-c:v")
        .arg("libx264")
        .arg("-preset")
        .arg("veryfast")
        .arg("-crf")
        .arg("20")
        .arg("-c:a")
        .arg("aac")
        .arg("-movflags")
        .arg("+faststart")
        .arg(&output_path);

    let child = spawn_media_job(&state, &job.id, &mut command).await?;
    let ok = stream_media_logs(&app, &event, child, &state, &job.id).await?;
    if !ok {
        return Err("切片失败（ffmpeg 退出码非 0）。".to_string());
    }

    // 生成缩略图（首帧附近）。
    let mut thumb_command = tokio::process::Command::new(&ffmpeg);
    thumb_command
        .arg("-y")
        .arg("-ss")
        .arg("0.5")
        .arg("-i")
        .arg(&output_path)
        .arg("-frames:v")
        .arg("1")
        .arg("-vf")
        .arg("scale=320:-2")
        .arg(&thumb_path);
    let thumb_child = spawn_media_job(&state, &job.id, &mut thumb_command).await?;
    let _ = stream_media_logs(&app, &event, thumb_child, &state, &job.id).await;

    let _ = app.emit(
        &event,
        serde_json::json!({
            "type": "done",
            "relPath": rel,
            "absolutePath": output_path.to_string_lossy(),
            "thumbnailPath": thumb_path.to_string_lossy(),
            "duration": duration,
        }),
    );
    Ok(MediaSliceResult {
        rel_path: rel,
        absolute_path: output_path.to_string_lossy().to_string(),
        thumbnail_path: Some(thumb_path.to_string_lossy().to_string()),
        duration,
    })
}

/// Whisper 转写：先 ffmpeg 提取 16k 单声道 wav，再调用 whisper.cpp CLI 输出 JSON，
/// 解析 segments 并生成 SRT。通过 media://<jobId> 事件流式上报进度。
#[tauri::command]
async fn media_transcribe(
    app: AppHandle,
    state: State<'_, MediaState>,
    job: MediaTranscribeJob,
) -> Result<MediaTranscribeResult, String> {
    let ffmpeg = detect_binary(&["ffmpeg"]);
    let whisper = detect_binary(&["whisper-cli", "whisper", "whisper-cpp"]);
    let (Some(ffmpeg), Some(whisper)) = (ffmpeg, whisper) else {
        return Err(
            "转写需要 ffmpeg 与 whisper（whisper.cpp）：brew install ffmpeg whisper-cpp"
                .to_string(),
        );
    };
    if !tokio::fs::try_exists(&job.input_path)
        .await
        .map_err(|error| error.to_string())?
    {
        return Err(format!("输入文件不存在：{}", job.input_path));
    }

    let event = format!("media://{}", job.id);
    let work_dir = app_data(&app)?.join("transcribe");
    tokio::fs::create_dir_all(&work_dir)
        .await
        .map_err(|error| error.to_string())?;

    let stem = safe_file_stem(&job.output_name);
    let wav_path = work_dir.join(format!("{stem}.wav"));
    let out_prefix = work_dir.join(format!("{stem}-whisper"));

    // 1) 提取 16k 单声道 wav。
    let mut audio_command = tokio::process::Command::new(&ffmpeg);
    audio_command
        .arg("-y")
        .arg("-i")
        .arg(&job.input_path)
        .arg("-ar")
        .arg("16000")
        .arg("-ac")
        .arg("1")
        .arg(&wav_path);
    let audio_child = spawn_media_job(&state, &job.id, &mut audio_command).await?;
    let audio_ok = stream_media_logs(&app, &event, audio_child, &state, &job.id).await?;
    if !audio_ok {
        return Err("音频提取失败（ffmpeg 退出码非 0）。".to_string());
    }

    // 2) whisper.cpp 转写（-oj 输出 JSON，-of 指定前缀）。
    let model = job
        .model
        .clone()
        .unwrap_or_else(|| "models/ggml-base.bin".to_string());
    let mut whisper_command = tokio::process::Command::new(&whisper);
    whisper_command
        .arg("-m")
        .arg(&model)
        .arg("-f")
        .arg(&wav_path)
        .arg("-oj")
        .arg("-of")
        .arg(&out_prefix);
    let whisper_child = spawn_media_job(&state, &job.id, &mut whisper_command).await?;
    let whisper_ok = stream_media_logs(&app, &event, whisper_child, &state, &job.id).await?;
    if !whisper_ok {
        return Err("转写失败（whisper 退出码非 0），请确认模型文件路径正确。".to_string());
    }

    // 3) 解析 whisper.cpp JSON。
    let json_path = out_prefix.with_extension("json");
    let json_content = tokio::fs::read_to_string(&json_path)
        .await
        .map_err(|error| "读取转写结果失败：".to_string() + &error.to_string())?;
    let (language, segments) = parse_whisper_json(&json_content)?;

    // 4) 生成 SRT。
    let srt_path = work_dir.join(format!("{stem}.srt"));
    let mut srt = String::new();
    for (index, segment) in segments.iter().enumerate() {
        srt.push_str(&format!("{}\n", index + 1));
        srt.push_str(&format!(
            "{} --> {}\n{}\n\n",
            srt_timestamp(segment.start),
            srt_timestamp(segment.end),
            segment.text
        ));
    }
    tokio::fs::write(&srt_path, srt)
        .await
        .map_err(|error| "写入 SRT 失败：".to_string() + &error.to_string())?;

    let _ = app.emit(
        &event,
        serde_json::json!({
            "type": "done",
            "language": language,
            "model": job.model,
            "segments": segments,
            "srtPath": srt_path.to_string_lossy(),
        }),
    );
    Ok(MediaTranscribeResult {
        language,
        model: job.model,
        segments,
        srt_path: Some(srt_path.to_string_lossy().to_string()),
    })
}

fn parse_whisper_json(content: &str) -> Result<(Option<String>, Vec<TranscriptSegment>), String> {
    let parsed: serde_json::Value = serde_json::from_str(content)
        .map_err(|error| "解析转写结果失败：".to_string() + &error.to_string())?;

    let language = parsed["result"]["language"].as_str().map(String::from);
    let segments: Vec<TranscriptSegment> = parsed["transcription"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let from = item["offsets"]["from"].as_f64();
                    let to = item["offsets"]["to"].as_f64();
                    let text = item["text"].as_str()?.trim().to_string();
                    if text.is_empty() {
                        return None;
                    }
                    Some(TranscriptSegment {
                        start: from? / 1000.0,
                        end: to? / 1000.0,
                        text,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok((language, segments))
}

fn srt_timestamp(seconds: f64) -> String {
    let total_ms = (seconds * 1000.0).round() as i64;
    let hours = total_ms / 3_600_000;
    let minutes = (total_ms % 3_600_000) / 60_000;
    let secs = (total_ms % 60_000) / 1000;
    let millis = total_ms % 1000;
    format!("{hours:02}:{minutes:02}:{secs:02},{millis:03}")
}

/// 取消指定媒体任务。
#[tauri::command]
async fn media_cancel(state: State<'_, MediaState>, job_id: String) -> Result<bool, String> {
    let mut jobs = state.jobs.lock().await;
    if let Some(mut child) = jobs.remove(&job_id) {
        let _ = child.kill().await;
        let _ = child.wait().await;
        Ok(true)
    } else {
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_db_path() -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("clips-studio-test-{stamp}.db"))
    }

    #[test]
    fn kv_roundtrip_upserts_and_deletes() {
        let path = temp_db_path();
        let conn = open_db(&path).expect("open db");

        conn.execute(
            "INSERT INTO kv (store, key, value) VALUES ('workspace', 'main', '{\"a\":1}')
             ON CONFLICT(store, key) DO UPDATE SET value = excluded.value",
            params![],
        )
        .unwrap();

        let value: Option<String> = conn
            .query_row(
                "SELECT value FROM kv WHERE store = 'workspace' AND key = 'main'",
                [],
                |row| row.get(0),
            )
            .ok()
            .flatten();
        assert_eq!(value, Some("{\"a\":1}".to_string()));

        conn.execute(
            "INSERT INTO kv (store, key, value) VALUES ('workspace', 'main', '{\"b\":2}')
             ON CONFLICT(store, key) DO UPDATE SET value = excluded.value",
            params![],
        )
        .unwrap();
        let updated: String = conn
            .query_row(
                "SELECT value FROM kv WHERE store = 'workspace' AND key = 'main'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(updated, "{\"b\":2}");

        conn.execute(
            "DELETE FROM kv WHERE store = 'workspace' AND key = 'main'",
            params![],
        )
        .unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM kv", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 0);

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn blob_roundtrip() {
        let path = temp_db_path();
        let conn = open_db(&path).expect("open db");

        conn.execute(
            "INSERT INTO blobs (key, data) VALUES ('a', ?1)",
            params![vec![1u8, 2, 3, 4]],
        )
        .unwrap();
        let data: Option<Vec<u8>> = conn
            .query_row("SELECT data FROM blobs WHERE key = 'a'", [], |row| {
                row.get(0)
            })
            .ok()
            .flatten();
        assert_eq!(data, Some(vec![1, 2, 3, 4]));

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn project_upsert_list_load_delete() {
        let path = temp_db_path();
        let conn = open_db(&path).expect("open db");

        let save = |id: &str, name: &str| {
            conn.execute(
                "INSERT INTO projects (id, name, config, rules, assets_text, tags, authorization, saved_at)
                 VALUES (?1, ?2, '{}', '{}', '', '{}', '{}', ?3)
                 ON CONFLICT(id) DO UPDATE SET name = excluded.name, saved_at = excluded.saved_at",
                params![id, name, "2026-08-06T00:00:00Z"],
            )
            .unwrap();
        };

        save("p1", "民宿A");
        save("p2", "茶馆B");
        save("p1", "民宿A（改）");

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 2, "upsert 不产生重复项目");

        let rows: Vec<String> = conn
            .prepare("SELECT name FROM projects ORDER BY id")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .filter_map(|item| item.ok())
            .collect();
        assert_eq!(rows, vec!["民宿A（改）".to_string(), "茶馆B".to_string()]);

        conn.execute("DELETE FROM projects WHERE id = 'p1'", params![])
            .unwrap();
        let remaining: i64 = conn
            .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
            .unwrap();
        assert_eq!(remaining, 1);

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn parses_whisper_json_output() {
        let sample = r#"{
          "result": {"language": "zh"},
          "transcription": [
            {"offsets": {"from": 0, "to": 2500}, "text": " 大家好 "},
            {"offsets": {"from": 2500, "to": 5000}, "text": ""},
            {"offsets": {"from": 5000, "to": 7500}, "text": "这是小院"}
          ]
        }"#;
        let (language, segments) = parse_whisper_json(sample).expect("parse ok");
        assert_eq!(language.as_deref(), Some("zh"));
        assert_eq!(segments.len(), 2, "空文本分段被过滤");
        assert_eq!(segments[0].start, 0.0);
        assert_eq!(segments[0].end, 2.5);
        assert_eq!(segments[0].text, "大家好");
        assert_eq!(segments[1].text, "这是小院");
    }

    #[test]
    fn srt_timestamp_formats_frames() {
        assert_eq!(srt_timestamp(0.0), "00:00:00,000");
        assert_eq!(srt_timestamp(3.5), "00:00:03,500");
        assert_eq!(srt_timestamp(3661.25), "01:01:01,250");
    }
}
