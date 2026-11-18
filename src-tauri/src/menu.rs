use tauri::menu::{
    AboutMetadata, Menu, MenuBuilder, MenuEvent, MenuItemBuilder, PredefinedMenuItem,
    SubmenuBuilder,
};
use tauri::{AppHandle, Emitter};

pub fn build_app_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, tauri::Error> {
    #[cfg_attr(not(target_os = "macos"), allow(unused_mut))]
    let mut builder = MenuBuilder::new(app);

    #[cfg(target_os = "macos")]
    {
        let about_meta = AboutMetadata {
            name: Some("SqlCraft".into()),
            version: Some(env!("CARGO_PKG_VERSION").into()),
            authors: Some(vec!["SqlCraft Contributors".into()]),
            copyright: Some("Copyright © 2026 SqlCraft Contributors".into()),
            comments: Some(
                "Cross-platform database workbench for MySQL, MariaDB, and PostgreSQL.".into(),
            ),
            license: Some("BUSL-1.1".into()),
            ..Default::default()
        };
        let app_sub = SubmenuBuilder::new(app, "SqlCraft")
            .item(&PredefinedMenuItem::about(
                app,
                Some("關於 SqlCraft"),
                Some(about_meta),
            )?)
            .separator()
            .item(
                &MenuItemBuilder::with_id("preferences", "偏好設定...")
                    .accelerator("CmdOrCtrl+,")
                    .build(app)?,
            )
            .separator()
            .item(&PredefinedMenuItem::hide(app, None)?)
            .item(&PredefinedMenuItem::hide_others(app, None)?)
            .item(&PredefinedMenuItem::show_all(app, None)?)
            .separator()
            .item(&PredefinedMenuItem::quit(app, None)?)
            .build()?;
        builder = builder.item(&app_sub);
    }

    let file_sub = SubmenuBuilder::new(app, "檔案")
        .item(
            &MenuItemBuilder::with_id("new_mysql", "新增 MySQL 連線...")
                .accelerator("CmdOrCtrl+N")
                .build(app)?,
        )
        .item(&MenuItemBuilder::with_id("new_mariadb", "新增 MariaDB 連線...").build(app)?)
        .item(&MenuItemBuilder::with_id("new_postgres", "新增 PostgreSQL 連線...").build(app)?)
        .separator()
        .item(
            &MenuItemBuilder::with_id("new_query", "新增查詢分頁")
                .accelerator("CmdOrCtrl+T")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("preferences", "偏好設定...")
                .accelerator("CmdOrCtrl+,")
                .build(app)?,
        )
        .build()?;

    let edit_sub = SubmenuBuilder::new(app, "編輯")
        .item(&PredefinedMenuItem::cut(app, None)?)
        .item(&PredefinedMenuItem::copy(app, None)?)
        .item(&PredefinedMenuItem::paste(app, None)?)
        .item(&PredefinedMenuItem::select_all(app, None)?)
        .build()?;

    let view_sub = SubmenuBuilder::new(app, "檢視")
        .item(&MenuItemBuilder::with_id("view_tables", "資料表").build(app)?)
        .item(&MenuItemBuilder::with_id("view_views", "檢視表").build(app)?)
        .item(&MenuItemBuilder::with_id("view_routines", "函式與程序").build(app)?)
        .separator()
        .item(
            &MenuItemBuilder::with_id("toggle_inspector", "切換右側資訊面板")
                .accelerator("CmdOrCtrl+I")
                .build(app)?,
        )
        .item(&MenuItemBuilder::with_id("toggle_theme", "切換深色 / 淺色主題").build(app)?)
        .item(
            &MenuItemBuilder::with_id("refresh", "重新整理")
                .accelerator("CmdOrCtrl+R")
                .build(app)?,
        )
        .build()?;

    let conn_sub = SubmenuBuilder::new(app, "連線")
        .item(&MenuItemBuilder::with_id("connect_selected", "開啟選取連線").build(app)?)
        .item(&MenuItemBuilder::with_id("demo_selected", "載入離線範例結構 (Demo)").build(app)?)
        .build()?;

    builder
        .item(&file_sub)
        .item(&edit_sub)
        .item(&view_sub)
        .item(&conn_sub)
        .build()
}

pub fn handle_menu_event(app: &AppHandle, event: MenuEvent) {
    let id = event.id().as_ref().to_string();
    let _ = app.emit("menu://action", id);
}
