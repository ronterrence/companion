use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng, Payload},
    Aes256Gcm,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use keyring::v1::{Entry, Error as KeyringError};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::Path;
use thiserror::Error;

const ENCRYPTED_PREFIX: &str = "enc:v1:";
const KEYRING_SERVICE: &str = "eu.companionstudio.desktop";
const KEYRING_ACCOUNT: &str = "database-content-key";

#[derive(Debug, Error)]
pub enum StorageError {
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("secure storage error: {0}")]
    Keyring(String),
    #[error("encrypted data is invalid or has been modified")]
    Crypto,
    #[error("stored encryption key has an invalid length")]
    InvalidKey,
    #[error("stored companion manifest is invalid: {0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Clone)]
struct ContentCipher(Aes256Gcm);

impl ContentCipher {
    fn new(key: &[u8]) -> Result<Self, StorageError> {
        if key.len() != 32 { return Err(StorageError::InvalidKey); }
        Ok(Self(Aes256Gcm::new_from_slice(key).map_err(|_| StorageError::InvalidKey)?))
    }

    fn encrypt(&self, plaintext: &str, associated_data: &str) -> Result<String, StorageError> {
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let ciphertext = self.0.encrypt(&nonce, Payload { msg: plaintext.as_bytes(), aad: associated_data.as_bytes() }).map_err(|_| StorageError::Crypto)?;
        let mut envelope = nonce.to_vec();
        envelope.extend_from_slice(&ciphertext);
        Ok(format!("{ENCRYPTED_PREFIX}{}", BASE64.encode(envelope)))
    }

    fn decrypt(&self, stored: &str, associated_data: &str) -> Result<String, StorageError> {
        if !stored.starts_with(ENCRYPTED_PREFIX) { return Ok(stored.to_owned()); }
        let envelope = BASE64.decode(&stored[ENCRYPTED_PREFIX.len()..]).map_err(|_| StorageError::Crypto)?;
        if envelope.len() < 13 { return Err(StorageError::Crypto); }
        let (nonce, ciphertext) = envelope.split_at(12);
        let plaintext = self.0.decrypt(nonce.into(), Payload { msg: ciphertext, aad: associated_data.as_bytes() }).map_err(|_| StorageError::Crypto)?;
        String::from_utf8(plaintext).map_err(|_| StorageError::Crypto)
    }
}

fn load_or_create_content_key() -> Result<Vec<u8>, StorageError> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT).map_err(|error| StorageError::Keyring(error.to_string()))?;
    match entry.get_secret() {
        Ok(secret) if secret.len() == 32 => Ok(secret),
        Ok(_) => Err(StorageError::InvalidKey),
        Err(KeyringError::NoEntry) => {
            let key = Aes256Gcm::generate_key(&mut OsRng).to_vec();
            entry.set_secret(&key).map_err(|error| StorageError::Keyring(error.to_string()))?;
            Ok(key)
        }
        Err(error) => Err(StorageError::Keyring(error.to_string())),
    }
}

pub struct Database { connection: Connection, cipher: ContentCipher }

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInput { pub id: String, pub companion_id: String, pub created_at: String, pub execution_mode: String, pub memory_mode: String }

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MessageInput { pub id: String, pub session_id: String, pub role: String, pub content: String, pub created_at: String, pub provider: String }

#[derive(Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MemoryInput { pub id: String, pub companion_id: String, pub content: String, pub purpose: String, pub source_session_id: String, pub consented_at: String, pub expires_at: Option<String> }

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEventInput { pub id: String, #[serde(rename = "type")] pub event_type: String, pub created_at: String, pub policy_version: String, pub metadata: serde_json::Value }

impl Database {
    pub fn open(path: &Path) -> Result<Self, StorageError> {
        let key = load_or_create_content_key()?;
        Self::open_with_key(path, &key)
    }

    pub(crate) fn open_with_key(path: &Path, key: &[u8]) -> Result<Self, StorageError> {
        let connection = Connection::open(path)?;
        connection.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
          CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, companion_id TEXT NOT NULL, created_at TEXT NOT NULL, execution_mode TEXT NOT NULL, memory_mode TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS companions(id TEXT PRIMARY KEY, manifest_json TEXT NOT NULL, created_at TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL, provider TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS memories(id TEXT PRIMARY KEY, companion_id TEXT NOT NULL, content TEXT NOT NULL, purpose TEXT NOT NULL, source_session_id TEXT NOT NULL, consented_at TEXT NOT NULL, expires_at TEXT);
          CREATE TABLE IF NOT EXISTS audit_events(id TEXT PRIMARY KEY, event_type TEXT NOT NULL, created_at TEXT NOT NULL, policy_version TEXT NOT NULL, metadata_json TEXT NOT NULL);")?;
        connection.execute_batch("CREATE TABLE IF NOT EXISTS provider_records(kind TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(kind,id));")?;
        let mut database = Self { connection, cipher: ContentCipher::new(key)? };
        database.migrate_plaintext_content()?;
        Ok(database)
    }

    fn migrate_plaintext_content(&mut self) -> Result<(), StorageError> {
        let transaction = self.connection.transaction()?;
        {
            let mut select = transaction.prepare("SELECT id, manifest_json FROM companions WHERE manifest_json NOT LIKE 'enc:v1:%'")?;
            let rows: Vec<(String, String)> = select.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?.collect::<Result<_, _>>()?;
            drop(select);
            for (id, manifest) in rows {
                let encrypted = self.cipher.encrypt(&manifest, &format!("companion:{id}"))?;
                transaction.execute("UPDATE companions SET manifest_json=?1 WHERE id=?2", params![encrypted, id])?;
            }
        }
        {
            let mut select = transaction.prepare("SELECT id, content FROM messages WHERE content NOT LIKE 'enc:v1:%'")?;
            let rows: Vec<(String, String)> = select.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?.collect::<Result<_, _>>()?;
            drop(select);
            for (id, content) in rows {
                let encrypted = self.cipher.encrypt(&content, &format!("message:{id}"))?;
                transaction.execute("UPDATE messages SET content=?1 WHERE id=?2", params![encrypted, id])?;
            }
        }
        {
            let mut select = transaction.prepare("SELECT id, content FROM memories WHERE content NOT LIKE 'enc:v1:%'")?;
            let rows: Vec<(String, String)> = select.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?.collect::<Result<_, _>>()?;
            drop(select);
            for (id, content) in rows {
                let encrypted = self.cipher.encrypt(&content, &format!("memory:{id}"))?;
                transaction.execute("UPDATE memories SET content=?1 WHERE id=?2", params![encrypted, id])?;
            }
        }
        transaction.commit()?;
        Ok(())
    }

    pub fn save_session(&self, value: &SessionInput) -> Result<(), StorageError> {
        self.connection.execute("INSERT INTO sessions VALUES (?1,?2,?3,?4,?5)", params![value.id,value.companion_id,value.created_at,value.execution_mode,value.memory_mode])?; Ok(())
    }
    pub fn list_sessions(&self)->Result<Vec<SessionInput>,StorageError> {
        let mut statement=self.connection.prepare("SELECT id,companion_id,created_at,execution_mode,memory_mode FROM sessions ORDER BY created_at DESC")?;
        let rows=statement.query_map([],|r|Ok(SessionInput {id:r.get(0)?,companion_id:r.get(1)?,created_at:r.get(2)?,execution_mode:r.get(3)?,memory_mode:r.get(4)?}))?.collect::<Result<_,_>>()?;Ok(rows)
    }
    pub fn put_provider_record(&self,kind:&str,id:&str,value:&serde_json::Value)->Result<(),StorageError> {
        let encrypted=self.cipher.encrypt(&value.to_string(),&format!("provider:{kind}:{id}"))?;
        self.connection.execute("INSERT INTO provider_records(kind,id,payload,updated_at) VALUES (?1,?2,?3,datetime('now')) ON CONFLICT(kind,id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",params![kind,id,encrypted])?;Ok(())
    }
    pub fn provider_record(&self,kind:&str,id:&str)->Result<Option<serde_json::Value>,StorageError> {
        use rusqlite::OptionalExtension;
        let value:Option<String>=self.connection.query_row("SELECT payload FROM provider_records WHERE kind=?1 AND id=?2",params![kind,id],|row|row.get(0)).optional()?;
        value.map(|encrypted|Ok(serde_json::from_str(&self.cipher.decrypt(&encrypted,&format!("provider:{kind}:{id}"))?)?)).transpose()
    }
    pub fn provider_records(&self,kind:&str)->Result<Vec<serde_json::Value>,StorageError> {
        let mut statement=self.connection.prepare("SELECT id,payload FROM provider_records WHERE kind=?1 ORDER BY updated_at,id")?;
        let rows:Vec<(String,String)>=statement.query_map([kind],|row|Ok((row.get(0)?,row.get(1)?)))?.collect::<Result<_,_>>()?;
        rows.into_iter().map(|(id,value)|Ok(serde_json::from_str(&self.cipher.decrypt(&value,&format!("provider:{kind}:{id}"))?)?)).collect()
    }
    pub fn finish_provider_request(&self,id:&str,outcome:&serde_json::Value,message:Option<&MessageInput>,context:Option<(&str,&serde_json::Value)>)->Result<(),StorageError> {
        let transaction=self.connection.unchecked_transaction()?;
        let payload=self.cipher.encrypt(&outcome.to_string(),&format!("provider:request:{id}"))?;
        transaction.execute("UPDATE provider_records SET payload=?1,updated_at=datetime('now') WHERE kind='request' AND id=?2",params![payload,id])?;
        if let Some(message)=message {
            let content=self.cipher.encrypt(&message.content,&format!("message:{}",message.id))?;
            transaction.execute("INSERT INTO messages(id,session_id,role,content,created_at,provider) VALUES (?1,?2,?3,?4,?5,?6)",params![message.id,message.session_id,message.role,content,message.created_at,message.provider])?;
        }
        if let Some((session,value))=context {
            let encrypted=self.cipher.encrypt(&value.to_string(),&format!("provider:context:{session}"))?;
            transaction.execute("INSERT INTO provider_records(kind,id,payload,updated_at) VALUES ('context',?1,?2,datetime('now')) ON CONFLICT(kind,id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",params![session,encrypted])?;
        }
        transaction.commit()?;Ok(())
    }
    pub fn save_companion(&self, id: &str, manifest: &serde_json::Value) -> Result<(), StorageError> {
        let serialized = serde_json::to_string(manifest)?;
        let encrypted = self.cipher.encrypt(&serialized, &format!("companion:{id}"))?;
        self.connection.execute("INSERT INTO companions(id,manifest_json,created_at) VALUES (?1,?2,datetime('now')) ON CONFLICT(id) DO UPDATE SET manifest_json=excluded.manifest_json", params![id, encrypted])?;
        Ok(())
    }
    pub fn list_companions(&self) -> Result<Vec<serde_json::Value>, StorageError> {
        let mut statement = self.connection.prepare("SELECT id,manifest_json FROM companions ORDER BY created_at")?;
        let rows: Vec<(String, String)> = statement.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?.collect::<Result<_, _>>()?;
        rows.into_iter().map(|(id, encrypted)| {
            let serialized = self.cipher.decrypt(&encrypted, &format!("companion:{id}"))?;
            Ok(serde_json::from_str(&serialized)?)
        }).collect()
    }
    pub fn save_message(&self, value: &MessageInput) -> Result<(), StorageError> {
        let content = self.cipher.encrypt(&value.content, &format!("message:{}", value.id))?;
        self.connection.execute("INSERT INTO messages VALUES (?1,?2,?3,?4,?5,?6)", params![value.id,value.session_id,value.role,content,value.created_at,value.provider])?; Ok(())
    }
    pub fn list_messages(&self, session_id: &str) -> Result<Vec<MessageInput>, StorageError> {
        let mut statement = self.connection.prepare("SELECT id,session_id,role,content,created_at,provider FROM messages WHERE session_id=?1 ORDER BY created_at")?;
        let encrypted_rows: Vec<MessageInput> = statement.query_map([session_id], |row| Ok(MessageInput { id:row.get(0)?, session_id:row.get(1)?, role:row.get(2)?, content:row.get(3)?, created_at:row.get(4)?, provider:row.get(5)? }))?.collect::<Result<_, _>>()?;
        encrypted_rows.into_iter().map(|mut value| { value.content = self.cipher.decrypt(&value.content, &format!("message:{}", value.id))?; Ok(value) }).collect()
    }
    pub fn save_memory(&self, value: &MemoryInput) -> Result<(), StorageError> {
        let content = self.cipher.encrypt(&value.content, &format!("memory:{}", value.id))?;
        self.connection.execute("INSERT INTO memories VALUES (?1,?2,?3,?4,?5,?6,?7)", params![value.id,value.companion_id,content,value.purpose,value.source_session_id,value.consented_at,value.expires_at])?; Ok(())
    }
    pub fn list_memories(&self, companion_id: &str) -> Result<Vec<MemoryInput>, StorageError> {
        let mut statement = self.connection.prepare("SELECT id,companion_id,content,purpose,source_session_id,consented_at,expires_at FROM memories WHERE companion_id=?1")?;
        let encrypted_rows: Vec<MemoryInput> = statement.query_map([companion_id], |row| Ok(MemoryInput { id:row.get(0)?, companion_id:row.get(1)?, content:row.get(2)?, purpose:row.get(3)?, source_session_id:row.get(4)?, consented_at:row.get(5)?, expires_at:row.get(6)? }))?.collect::<Result<_, _>>()?;
        encrypted_rows.into_iter().map(|mut value| { value.content = self.cipher.decrypt(&value.content, &format!("memory:{}", value.id))?; Ok(value) }).collect()
    }
    pub fn delete_memory(&self, id: &str) -> Result<(), StorageError> { self.connection.execute("DELETE FROM memories WHERE id=?1", [id])?; Ok(()) }
    pub fn append_audit(&self, value: &AuditEventInput) -> Result<(), StorageError> { self.connection.execute("INSERT INTO audit_events VALUES (?1,?2,?3,?4,?5)", params![value.id,value.event_type,value.created_at,value.policy_version,value.metadata.to_string()])?; Ok(()) }
    pub fn list_audit_events(&self) -> Result<Vec<AuditEventInput>, StorageError> {
        let mut statement = self.connection.prepare("SELECT id,event_type,created_at,policy_version,metadata_json FROM audit_events ORDER BY created_at")?;
        let events = statement.query_map([], |row| { let metadata_json: String = row.get(4)?; Ok(AuditEventInput { id:row.get(0)?, event_type:row.get(1)?, created_at:row.get(2)?, policy_version:row.get(3)?, metadata:serde_json::from_str(&metadata_json).unwrap_or(serde_json::json!({})) }) })?.collect::<Result<_, _>>()?;
        Ok(events)
    }
}

#[cfg(test)]
mod tests {
    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "Writes disposable native Keychain entries; run write/read/delete phases in separate processes"]
    fn macos_keychain_integration() {
        use keyring::v1::{Entry, Error};
        let account = std::env::var("COMPANION_KEYCHAIN_TEST_ACCOUNT").expect("unique test account");
        let phase = std::env::var("COMPANION_KEYCHAIN_TEST_PHASE").expect("write/read/delete phase");
        let binary = Entry::new("eu.companionstudio.test.content-key", &account).unwrap();
        let api = Entry::new("eu.companionstudio.test.api-key", &account).unwrap();
        match phase.as_str() {
            "write" => {
                binary.set_secret(&[7_u8; 32]).unwrap();
                api.set_password("disposable-test-key").unwrap();
            }
            "read" => {
                assert_eq!(binary.get_secret().unwrap(), vec![7_u8; 32]);
                assert_eq!(api.get_password().unwrap(), "disposable-test-key");
            }
            "delete" => {
                binary.delete_credential().unwrap();
                api.delete_credential().unwrap();
                assert!(matches!(binary.get_secret(), Err(Error::NoEntry)));
                assert!(matches!(api.get_password(), Err(Error::NoEntry)));
            }
            _ => panic!("unknown Keychain test phase"),
        }
    }
    use super::*;

    fn database() -> Database { Database::open_with_key(Path::new(":memory:"), &[7_u8; 32]).unwrap() }
    fn session() -> SessionInput { SessionInput { id:"s1".into(), companion_id:"c1".into(), created_at:"now".into(), execution_mode:"local".into(), memory_mode:"session".into() } }

    #[test]
    fn messages_and_memories_are_encrypted_at_rest_and_round_trip() {
        let db = database();
        db.save_session(&session()).unwrap();
        let message = MessageInput { id:"msg1".into(), session_id:"s1".into(), role:"user".into(), content:"private message".into(), created_at:"now".into(), provider:"local".into() };
        let memory = MemoryInput { id:"mem1".into(), companion_id:"c1".into(), content:"private memory".into(), purpose:"personalisation".into(), source_session_id:"s1".into(), consented_at:"now".into(), expires_at:None };
        db.save_message(&message).unwrap();
        db.save_memory(&memory).unwrap();
        let stored_message: String = db.connection.query_row("SELECT content FROM messages WHERE id='msg1'", [], |row| row.get(0)).unwrap();
        let stored_memory: String = db.connection.query_row("SELECT content FROM memories WHERE id='mem1'", [], |row| row.get(0)).unwrap();
        assert!(stored_message.starts_with(ENCRYPTED_PREFIX));
        assert!(stored_memory.starts_with(ENCRYPTED_PREFIX));
        assert!(!stored_message.contains("private message"));
        assert!(!stored_memory.contains("private memory"));
        assert_eq!(db.list_messages("s1").unwrap(), vec![message]);
        assert_eq!(db.list_memories("c1").unwrap(), vec![memory]);
    }

    #[test]
    fn companion_manifests_are_encrypted_and_persisted() {
        let db = database();
        let manifest = serde_json::json!({"schemaVersion":"1.0","id":"custom-1","name":"Private Planner","riskClass":"limited","allowedCapabilities":[]});
        db.save_companion("custom-1", &manifest).unwrap();
        let stored: String = db.connection.query_row("SELECT manifest_json FROM companions WHERE id='custom-1'", [], |row| row.get(0)).unwrap();
        assert!(stored.starts_with(ENCRYPTED_PREFIX));
        assert!(!stored.contains("Private Planner"));
        assert_eq!(db.list_companions().unwrap(), vec![manifest]);
    }

    #[test]
    fn ciphertext_is_bound_to_record_identity_and_tampering_fails() {
        let db = database();
        db.save_session(&session()).unwrap();
        let first = MessageInput { id:"one".into(), session_id:"s1".into(), role:"user".into(), content:"first".into(), created_at:"1".into(), provider:"local".into() };
        let second = MessageInput { id:"two".into(), session_id:"s1".into(), role:"user".into(), content:"second".into(), created_at:"2".into(), provider:"local".into() };
        db.save_message(&first).unwrap(); db.save_message(&second).unwrap();
        db.connection.execute("UPDATE messages SET content=(SELECT content FROM messages WHERE id='one') WHERE id='two'", []).unwrap();
        assert!(matches!(db.list_messages("s1"), Err(StorageError::Crypto)));
    }

    #[test]
    fn plaintext_rows_are_migrated_on_open() {
        let path = std::env::temp_dir().join(format!("companion-studio-test-{}.sqlite3", uuid::Uuid::new_v4()));
        {
            let connection = Connection::open(&path).unwrap();
            connection.execute_batch("CREATE TABLE sessions(id TEXT PRIMARY KEY, companion_id TEXT, created_at TEXT, execution_mode TEXT, memory_mode TEXT); CREATE TABLE companions(id TEXT PRIMARY KEY, manifest_json TEXT, created_at TEXT); CREATE TABLE messages(id TEXT PRIMARY KEY, session_id TEXT, role TEXT, content TEXT, created_at TEXT, provider TEXT); CREATE TABLE memories(id TEXT PRIMARY KEY, companion_id TEXT, content TEXT, purpose TEXT, source_session_id TEXT, consented_at TEXT, expires_at TEXT); CREATE TABLE audit_events(id TEXT PRIMARY KEY, event_type TEXT, created_at TEXT, policy_version TEXT, metadata_json TEXT); INSERT INTO messages VALUES('legacy','s','user','legacy plaintext','now','prototype');").unwrap();
        }
        let db = Database::open_with_key(&path, &[9_u8; 32]).unwrap();
        let stored: String = db.connection.query_row("SELECT content FROM messages WHERE id='legacy'", [], |row| row.get(0)).unwrap();
        assert!(stored.starts_with(ENCRYPTED_PREFIX));
        assert_eq!(db.list_messages("s").unwrap()[0].content, "legacy plaintext");
        drop(db); let _ = std::fs::remove_file(path);
    }

    #[test]
    fn memories_are_scoped_and_deletable() {
        let db = database();
        let memory = MemoryInput { id:"m1".into(), companion_id:"c1".into(), content:"private".into(), purpose:"personalisation".into(), source_session_id:"s1".into(), consented_at:"now".into(), expires_at:None };
        db.save_memory(&memory).unwrap();
        assert_eq!(db.list_memories("c1").unwrap().len(), 1);
        assert!(db.list_memories("other").unwrap().is_empty());
        db.delete_memory("m1").unwrap();
        assert!(db.list_memories("c1").unwrap().is_empty());
    }
    #[test]
    fn provider_records_are_encrypted_and_completion_is_atomic() {
        let db=database();
        db.save_session(&SessionInput {id:"s".into(),companion_id:"c".into(),created_at:"now".into(),execution_mode:"cloud".into(),memory_mode:"session".into()}).unwrap();
        let pending=serde_json::json!({"status":"interrupted"});db.put_provider_record("request","r",&pending).unwrap();
        let outcome=serde_json::json!({"content":"private answer","usage":{"input":10}});
        let summary=serde_json::json!({"summary":"private summary","covered":2});
        let mut message=MessageInput {id:"reply-r".into(),session_id:"missing".into(),role:"assistant".into(),content:"private answer".into(),created_at:"now".into(),provider:"cloud".into()};
        assert!(db.finish_provider_request("r",&outcome,Some(&message),Some(("s",&summary))).is_err());assert_eq!(db.provider_record("request","r").unwrap(),Some(pending));assert!(db.provider_record("context","s").unwrap().is_none());
        message.session_id="s".into();db.finish_provider_request("r",&outcome,Some(&message),Some(("s",&summary))).unwrap();
        assert_eq!(db.list_messages("s").unwrap(),vec![message]);assert_eq!(db.provider_record("context","s").unwrap(),Some(summary));
        let stored:String=db.connection.query_row("SELECT payload FROM provider_records WHERE kind='context'",[],|r|r.get(0)).unwrap();assert!(stored.starts_with(ENCRYPTED_PREFIX));assert!(!stored.contains("private"));
        db.connection.execute("UPDATE provider_records SET payload=?1 WHERE kind='request'",[stored]).unwrap();assert!(db.provider_record("request","r").is_err());
    }
}
