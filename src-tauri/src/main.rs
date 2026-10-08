//! Native desktop host. Cluster services are introduced in later foundation increments.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Err(error) = tauri::Builder::default().run(tauri::generate_context!()) {
        eprintln!("Talos Pilot could not start: {error}");
        std::process::exit(1);
    }
}
