use tauri::State;

use crate::drivers::ConnectionManager;
use crate::models::{
    BatchQueryResponse, ColumnInfo, ConnectionProfile, ConnectionTestResult, DatabaseInfo,
    ForeignKeyInfo, IndexInfo, QueryResultSet, RoutineInfo, SavedQuery, SchemaInfo, SequenceInfo,
    TableInfo, ViewInfo,
};
use crate::storage::ProfileStore;

pub struct AppState {
    pub store: ProfileStore,
    pub connections: ConnectionManager,
}

#[tauri::command]
pub async fn list_profiles(state: State<'_, AppState>) -> Result<Vec<ConnectionProfile>, String> {
    state.store.list_profiles().await
}

#[tauri::command]
pub async fn save_profile(
    state: State<'_, AppState>,
    profile: ConnectionProfile,
) -> Result<ConnectionProfile, String> {
    state.store.save_profile(&profile).await
}

#[tauri::command]
pub async fn delete_profile(
    state: State<'_, AppState>,
    profile_id: String,
) -> Result<(), String> {
    state.connections.disconnect_profile(&profile_id).await;
    state.store.delete_profile(&profile_id).await
}

#[tauri::command]
pub async fn test_connection(
    state: State<'_, AppState>,
    profile: ConnectionProfile,
) -> Result<ConnectionTestResult, String> {
    state.connections.test_connection(&profile).await
}

#[tauri::command]
pub async fn connect_profile(
    state: State<'_, AppState>,
    profile_id: String,
) -> Result<ConnectionTestResult, String> {
    let profile = state.store.get_profile(&profile_id).await?;
    state.connections.connect_profile(&profile).await
}

#[tauri::command]
pub async fn connect_adhoc_profile(
    state: State<'_, AppState>,
    profile: ConnectionProfile,
) -> Result<ConnectionTestResult, String> {
    state.connections.connect_profile(&profile).await
}

#[tauri::command]
pub async fn disconnect_profile(
    state: State<'_, AppState>,
    profile_id: String,
) -> Result<(), String> {
    state.connections.disconnect_profile(&profile_id).await;
    Ok(())
}

#[tauri::command]
pub async fn list_databases(
    state: State<'_, AppState>,
    profile_id: String,
) -> Result<Vec<DatabaseInfo>, String> {
    let drv = state.connections.get_driver(&profile_id).await?;
    drv.list_databases().await
}

#[tauri::command]
pub async fn list_schemas(
    state: State<'_, AppState>,
    profile_id: String,
    database: String,
) -> Result<Vec<SchemaInfo>, String> {
    let drv = state.connections.get_driver(&profile_id).await?;
    drv.list_schemas(&database).await
}

#[tauri::command]
pub async fn list_tables(
    state: State<'_, AppState>,
    profile_id: String,
    database: String,
    schema: Option<String>,
) -> Result<Vec<TableInfo>, String> {
    let drv = state.connections.get_driver(&profile_id).await?;
    drv.list_tables(&database, schema.as_deref()).await
}

#[tauri::command]
pub async fn list_views(
    state: State<'_, AppState>,
    profile_id: String,
    database: String,
    schema: Option<String>,
) -> Result<Vec<ViewInfo>, String> {
    let drv = state.connections.get_driver(&profile_id).await?;
    drv.list_views(&database, schema.as_deref()).await
}

#[tauri::command]
pub async fn list_columns(
    state: State<'_, AppState>,
    profile_id: String,
    database: String,
    schema: Option<String>,
    table: String,
) -> Result<Vec<ColumnInfo>, String> {
    let drv = state.connections.get_driver(&profile_id).await?;
    drv.list_columns(&database, schema.as_deref(), &table).await
}

#[tauri::command]
pub async fn list_indexes(
    state: State<'_, AppState>,
    profile_id: String,
    database: String,
    schema: Option<String>,
    table: String,
) -> Result<Vec<IndexInfo>, String> {
    let drv = state.connections.get_driver(&profile_id).await?;
    drv.list_indexes(&database, schema.as_deref(), &table).await
}

#[tauri::command]
pub async fn list_foreign_keys(
    state: State<'_, AppState>,
    profile_id: String,
    database: String,
    schema: Option<String>,
    table: String,
) -> Result<Vec<ForeignKeyInfo>, String> {
    let drv = state.connections.get_driver(&profile_id).await?;
    drv.list_foreign_keys(&database, schema.as_deref(), &table)
        .await
}

#[tauri::command]
pub async fn list_routines(
    state: State<'_, AppState>,
    profile_id: String,
    database: String,
    schema: Option<String>,
) -> Result<Vec<RoutineInfo>, String> {
    let drv = state.connections.get_driver(&profile_id).await?;
    drv.list_routines(&database, schema.as_deref()).await
}

#[tauri::command]
pub async fn list_sequences(
    state: State<'_, AppState>,
    profile_id: String,
    database: String,
    schema: Option<String>,
) -> Result<Vec<SequenceInfo>, String> {
    let drv = state.connections.get_driver(&profile_id).await?;
    drv.list_sequences(&database, schema.as_deref()).await
}

#[tauri::command]
pub async fn get_object_ddl(
    state: State<'_, AppState>,
    profile_id: String,
    database: String,
    schema: Option<String>,
    object_type: String,
    object_name: String,
) -> Result<String, String> {
    let drv = state.connections.get_driver(&profile_id).await?;
    drv.get_object_ddl(&database, schema.as_deref(), &object_type, &object_name)
        .await
}

#[tauri::command]
pub async fn execute_query(
    state: State<'_, AppState>,
    profile_id: String,
    database: Option<String>,
    schema: Option<String>,
    sql: String,
    query_id: Option<String>,
) -> Result<QueryResultSet, String> {
    let drv = state.connections.get_driver(&profile_id).await?;
    if let Some(ref qid) = query_id {
        let token = state.connections.register_query_token(qid).await;
        let res = tokio::select! {
            _ = token.cancelled() => Err("Query cancelled by user".to_string()),
            r = drv.execute_query(database.as_deref(), schema.as_deref(), &sql) => r,
        };
        state.connections.clear_query_token(qid).await;
        res
    } else {
        drv.execute_query(database.as_deref(), schema.as_deref(), &sql)
            .await
    }
}

#[tauri::command]
pub async fn execute_batch(
    state: State<'_, AppState>,
    profile_id: String,
    database: Option<String>,
    schema: Option<String>,
    sql_batch: String,
    query_id: Option<String>,
) -> Result<BatchQueryResponse, String> {
    let drv = state.connections.get_driver(&profile_id).await?;
    if let Some(ref qid) = query_id {
        let token = state.connections.register_query_token(qid).await;
        let res = tokio::select! {
            _ = token.cancelled() => Err("Batch execution cancelled by user".to_string()),
            r = drv.execute_batch(database.as_deref(), schema.as_deref(), &sql_batch) => r,
        };
        state.connections.clear_query_token(qid).await;
        res
    } else {
        drv.execute_batch(database.as_deref(), schema.as_deref(), &sql_batch)
            .await
    }
}

#[tauri::command]
pub async fn cancel_query(
    state: State<'_, AppState>,
    query_id: String,
) -> Result<bool, String> {
    Ok(state.connections.cancel_query(&query_id).await)
}

#[tauri::command]
pub async fn list_saved_queries(
    state: State<'_, AppState>,
    profile_id: Option<String>,
) -> Result<Vec<SavedQuery>, String> {
    state.store.list_saved_queries(profile_id.as_deref()).await
}

#[tauri::command]
pub async fn save_query(
    state: State<'_, AppState>,
    query: SavedQuery,
) -> Result<SavedQuery, String> {
    state.store.save_query(&query).await
}

#[tauri::command]
pub async fn delete_saved_query(
    state: State<'_, AppState>,
    query_id: String,
) -> Result<(), String> {
    state.store.delete_saved_query(&query_id).await
}
