use tauri::Manager;

mod session_store;

#[tauri::command]
fn close_quick_add_window(_app: tauri::AppHandle) -> Result<(), String> {
    // Window closing not needed on mobile platforms
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        if let Some(window) = _app.get_webview_window("quick-add") {
            window.close().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
async fn update_widget(_app_handle: tauri::AppHandle, _todos_json: String, _is_logged_in: bool) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        println!("🚀 update_widget invoked (Android)");
        println!("  - todos_json length: {}", todos_json.len());
        println!("  - is_logged_in: {}", is_logged_in);

        // Write JSON payload the widget code expects
        let app_data_dir = "/data/data/com.hasu.todo/files";
        let widget_data_file = format!("{}/widget_data.json", app_data_dir);
        let json_payload = format!(r#"{{"todos":{},"is_logged_in":{}}}"#, todos_json, is_logged_in);

        match std::fs::write(&widget_data_file, json_payload.as_bytes()) {
            Ok(_) => {
                println!("✅ Wrote {} ({} bytes)", widget_data_file, json_payload.len());
                // Notify the AppWidgetProvider to refresh
                use tauri_plugin_shell::ShellExt;
                let broadcast = "am broadcast -a android.appwidget.action.APPWIDGET_UPDATE -n com.hasu.todo/.TodoWidgetProvider";
                match app_handle.shell().command("sh").args(["-c", broadcast]).output().await {
                    Ok(out) => {
                        println!("📡 Broadcast APPWIDGET_UPDATE sent (ok={}): {:?}", out.status.success(), out.status);
                    }
                    Err(e) => {
                        println!("⚠️ Failed to broadcast widget update: {}", e);
                    }
                }
            }
            Err(e) => {
                let msg = format!("Failed to write {}: {}", widget_data_file, e);
                println!("❌ {}", msg);
                return Err(msg);
            }
        }
    }
    
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            close_quick_add_window,
            update_widget,
            session_store::store_session,
            session_store::get_session
        ])
        .setup(|_app| {
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                use tauri_plugin_global_shortcut::{
                    Code,
                    GlobalShortcutExt,
                    Modifiers,
                    Shortcut,
                    ShortcutState
                };

                // Create Alt+C shortcut (Option+C on macOS)
                let alt_c_shortcut = Shortcut::new(
                    Some(Modifiers::ALT),
                    Code::KeyC
                );

                // Initialize the plugin with a handler
                let app_handle = _app.handle().clone();
                _app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |_app, shortcut, event| {
                            if shortcut == &alt_c_shortcut {
                                if let ShortcutState::Pressed = event.state() {
                                    // Check if quick-add window already exists
                                    if let Some(existing_window) = app_handle.get_webview_window("quick-add") {
                                        // Focus the existing window
                                        let _ = existing_window.show();
                                        let _ = existing_window.set_focus();
                                    } else {
                                        // Create new quick-add window
                                        let window_builder = tauri::WebviewWindowBuilder::new(
                                            &app_handle,
                                            "quick-add",
                                            tauri::WebviewUrl::App("index.html?mode=quick-add".into())
                                        )
                                        .title("Quick Add Task")
                                        .inner_size(400.0, 500.0)
                                        .min_inner_size(400.0, 500.0)
                                        .max_inner_size(400.0, 500.0)
                                        .resizable(false)
                                        .center()
                                        .focused(true)
                                        .always_on_top(true)
                                        .skip_taskbar(true)
                                        .decorations(false);

                                        if let Ok(window) = window_builder.build() {
                                            let _ = window.show();
                                            let _ = window.set_focus();
                                        }
                                    }
                                }
                            }
                        })
                        .build(),
                )?;

                // Register the shortcut
                _app.global_shortcut().register(alt_c_shortcut)?;
            }
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}