use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(serde::Serialize, serde::Deserialize, Debug, Default, Clone)]
pub struct StoredSession {
    pub access_token: String,
    pub refresh_token: String,
    pub user_id: String,
}

fn session_file_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let _ = fs::create_dir_all(&dir);
    dir.push("session.json");
    Ok(dir)
}

#[tauri::command]
pub async fn store_session(app_handle: tauri::AppHandle, access_token: String, refresh_token: String, user_id: String) -> Result<(), String> {
    let path = session_file_path(&app_handle)?;
    let data = StoredSession { access_token, refresh_token, user_id };
    let json = serde_json::to_string(&data).map_err(|e| e.to_string())?;
    fs::write(&path, json.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_session(app_handle: tauri::AppHandle) -> Result<Option<StoredSession>, String> {
    let path = session_file_path(&app_handle)?;
    if !path.exists() {
        return Ok(None);
    }
    let contents = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if contents.trim().is_empty() {
        return Ok(None);
    }
    match serde_json::from_str::<StoredSession>(&contents) {
        Ok(s) => Ok(Some(s)),
        Err(e) => Err(e.to_string()),
    }
}
