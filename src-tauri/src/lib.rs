mod storage;

use std::sync::Mutex;
use storage::{AuditEventInput, Database, MemoryInput, MessageInput, SessionInput};
use tauri::Manager;

fn validate_companion_manifest(companion: &serde_json::Value) -> Result<&str, String> {
    if companion.get("schemaVersion").and_then(|value| value.as_str()) != Some("1.0") { return Err("unsupported companion schema".into()); }
    let id = companion.get("id").and_then(|value| value.as_str()).filter(|value| value.len() >= 2).ok_or("companion id is required")?;
    let risk = companion.get("riskClass").and_then(|value| value.as_str()).ok_or("risk classification is required")?;
    if !matches!(risk, "minimal" | "limited") { return Err(format!("unsupported risk classification: {risk}")); }
    let forbidden = ["credit-scoring", "candidate-ranking", "medical-diagnosis", "biometric-categorisation", "emotion-recognition-biometric", "dependency-encouragement", "subliminal-manipulation"];
    let allowed = companion.get("allowedCapabilities").and_then(|value| value.as_array()).ok_or("allowed capabilities are required")?;
    if let Some(capability) = allowed.iter().filter_map(|value| value.as_str()).find(|value| forbidden.contains(value)) {
        return Err(format!("forbidden capability: {capability}"));
    }
    Ok(id)
}

#[tauri::command]
fn save_companion(db: tauri::State<'_, Mutex<Database>>, companion: serde_json::Value) -> Result<(), String> {
    let id = validate_companion_manifest(&companion)?.to_owned();
    db.lock().map_err(|_| "database lock poisoned".to_string())?.save_companion(&id, &companion).map_err(|error| error.to_string())
}

#[tauri::command]
fn list_companions(db: tauri::State<'_, Mutex<Database>>) -> Result<Vec<serde_json::Value>, String> {
    let companions = db.lock().map_err(|_| "database lock poisoned".to_string())?.list_companions().map_err(|error| error.to_string())?;
    companions.into_iter().map(|companion| { validate_companion_manifest(&companion)?; Ok(companion) }).collect()
}

#[tauri::command]
fn save_session(db: tauri::State<'_, Mutex<Database>>, session: SessionInput) -> Result<(), String> {
    db.lock().map_err(|_| "database lock poisoned".to_string())?.save_session(&session).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_message(db: tauri::State<'_, Mutex<Database>>, message: MessageInput) -> Result<(), String> {
    db.lock().map_err(|_| "database lock poisoned".to_string())?.save_message(&message).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_messages(db: tauri::State<'_, Mutex<Database>>, session_id: String) -> Result<Vec<MessageInput>, String> {
    db.lock().map_err(|_| "database lock poisoned".to_string())?.list_messages(&session_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_memory(db: tauri::State<'_, Mutex<Database>>, memory: MemoryInput, consent: bool) -> Result<(), String> {
    if !consent { return Err("durable memory requires explicit consent".into()); }
    db.lock().map_err(|_| "database lock poisoned".to_string())?.save_memory(&memory).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_memories(db: tauri::State<'_, Mutex<Database>>, companion_id: String) -> Result<Vec<MemoryInput>, String> {
    db.lock().map_err(|_| "database lock poisoned".to_string())?.list_memories(&companion_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_memory(db: tauri::State<'_, Mutex<Database>>, id: String) -> Result<(), String> {
    db.lock().map_err(|_| "database lock poisoned".to_string())?.delete_memory(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn append_audit(db: tauri::State<'_, Mutex<Database>>, event: AuditEventInput) -> Result<(), String> {
    db.lock().map_err(|_| "database lock poisoned".to_string())?.append_audit(&event).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_audit_events(db: tauri::State<'_, Mutex<Database>>) -> Result<Vec<AuditEventInput>, String> {
    db.lock().map_err(|_| "database lock poisoned".to_string())?.list_audit_events().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let path = app.path().app_data_dir()?.join("companion-studio.sqlite3");
            std::fs::create_dir_all(path.parent().expect("database parent"))?;
            app.manage(Mutex::new(Database::open(&path)?));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![save_companion, list_companions, save_session, save_message, list_messages, save_memory, list_memories, delete_memory, append_audit, list_audit_events])
        .run(tauri::generate_context!())
        .expect("error while running Companion Studio");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_boundary_rejects_high_risk_and_forbidden_companions() {
        let high_risk = serde_json::json!({"schemaVersion":"1.0","id":"bad","riskClass":"high","allowedCapabilities":[]});
        assert!(validate_companion_manifest(&high_risk).unwrap_err().contains("unsupported risk"));
        let forbidden = serde_json::json!({"schemaVersion":"1.0","id":"bad","riskClass":"limited","allowedCapabilities":["credit-scoring"]});
        assert!(validate_companion_manifest(&forbidden).unwrap_err().contains("forbidden capability"));
    }
}
