//! Native application contracts and desktop startup.

pub mod contracts;
pub mod helper;

/// Starts the Tauri desktop application.
pub fn run() {
    if let Err(error) = tauri::Builder::default().run(tauri::generate_context!()) {
        eprintln!("Talos Pilot could not start: {error}");
        std::process::exit(1);
    }
}
