pub mod commands;
pub mod drivers;
pub mod menu;
pub mod models;
pub mod storage;
pub mod tunnel;

use tauri::Manager;

use crate::commands::AppState;
use crate::drivers::ConnectionManager;
use crate::storage::ProfileStore;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let store = tauri::async_runtime::block_on(ProfileStore::open_default())
                .map_err(|e| Box::new(std::io::Error::new(std::io::ErrorKind::Other, e)))?;
            app.manage(AppState {
                store,
                connections: ConnectionManager::new(),
            });
            if let Ok(app_menu) = menu::build_app_menu(app.handle()) {
                let _ = app.set_menu(app_menu);
            }
            Ok(())
        })
        .on_menu_event(|app, event| {
            menu::handle_menu_event(app, event);
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_profiles,
            commands::save_profile,
            commands::delete_profile,
            commands::test_connection,
            commands::connect_profile,
            commands::connect_adhoc_profile,
            commands::disconnect_profile,
            commands::list_databases,
            commands::list_schemas,
            commands::list_tables,
            commands::list_views,
            commands::list_columns,
            commands::list_indexes,
            commands::list_foreign_keys,
            commands::list_routines,
            commands::list_sequences,
            commands::get_object_ddl,
            commands::execute_query,
            commands::execute_batch,
            commands::cancel_query,
            commands::list_saved_queries,
            commands::save_query,
            commands::delete_saved_query,
            commands::get_app_config,
            commands::save_app_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running SqlCraft Tauri application");
}
