// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    io::{BufRead, BufReader, Write},
    process::{Command, Stdio},
    sync::Mutex,
};

use tauri::{Manager, State};

use tauri_plugin_dialog;
struct Bridge(std::process::Child);
type Shared = Mutex<Option<Bridge>>;

#[tauri::command]
fn send(payload: String, state: State<Shared>) -> Result<String, String> {
    let mut guard = state.lock().unwrap();
    let child = guard.as_mut().ok_or("bridge missing")?;
    let stdin = child.0.stdin.as_mut().ok_or("stdin")?;
    let stdout = child.0.stdout.as_mut().ok_or("stdout")?;

    writeln!(stdin, "{payload}").map_err(|e| e.to_string())?;
    let mut line = String::new();
    BufReader::new(stdout)
        .read_line(&mut line)
        .map_err(|e| e.to_string())?;
    Ok(line)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let exe =
                std::env::current_exe()?
                    .parent()
                    .unwrap()
                    .join(if cfg!(target_os = "windows") {
                        "populator.exe"
                    } else {
                        "populator"
                    });
            let child = Command::new(exe)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .spawn()
                .expect("spawn python");

            app.manage(Mutex::new(Some(Bridge(child))));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![send])
        .run(tauri::generate_context!())
        .expect("run tauri");
}
