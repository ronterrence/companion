use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Catalog {
    pub id: String,
    pub name: String,
    pub filename: String,
    pub revision: String,
    pub url: String,
    pub size: u64,
    pub sha256: String,
    pub license: String,
    pub license_url: String,
    pub minimum_ram: u64,
    pub recommended_ram: u64,
    pub runtime: String,
}
pub fn catalog() -> Catalog {
    serde_json::from_str(include_str!("../model-catalog.json")).expect("bundled model catalog")
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    pub state: String,
    pub downloaded: u64,
    pub total: u64,
    pub error: Option<String>,
    pub installed: bool,
    pub available_ram: Option<u64>,
}
pub struct LocalModel {
    pub directory: PathBuf,
    pub status: Mutex<ModelStatus>,
    pub cancel: AtomicBool,
    pub process: Mutex<Option<RuntimeProcess>>,
}
impl LocalModel {
    pub fn new(directory: PathBuf) -> Self {
        let c = catalog();
        let installed = directory.join(&c.filename).is_file();
        let downloaded = fs::metadata(directory.join(format!("{}.partial", c.filename)))
            .map(|m| m.len())
            .unwrap_or(0);
        Self {
            directory,
            status: Mutex::new(ModelStatus {
                state: if installed {
                    "installed"
                } else {
                    "not-installed"
                }
                .into(),
                downloaded,
                total: c.size,
                installed,
                error: None,
                available_ram: physical_ram(),
            }),
            cancel: AtomicBool::new(false),
            process: Mutex::new(None),
        }
    }
    pub fn snapshot(&self) -> ModelStatus {
        let mut process = self.process.lock().unwrap();
        if let Some(child) = process.as_mut() {
            if !matches!(child.child.try_wait(), Ok(None)) {
                *process = None;
                self.update(
                    "failed",
                    Some("Local model stopped unexpectedly. Retry starting it.".into()),
                );
            }
        }
        self.status.lock().unwrap().clone()
    }
    pub fn update(&self, state: &str, error: Option<String>) {
        let mut status = self.status.lock().unwrap();
        status.state = state.into();
        status.error = error;
    }
    pub fn download(&self) -> Result<(), String> {
        self.cancel.store(false, Ordering::SeqCst);
        let result = self.download_inner(&catalog());
        if let Err(error) = &result {
            self.update(
                if error == "Download paused." {
                    "paused"
                } else {
                    "failed"
                },
                Some(error.clone()),
            );
        }
        result
    }
    fn download_inner(&self, c: &Catalog) -> Result<(), String> {
        if physical_ram().is_some_and(|bytes| bytes < c.minimum_ram) {
            return Err("Local model requires at least 4 GB of physical RAM. Use an API provider on this computer.".into());
        }
        fs::create_dir_all(&self.directory).map_err(|_| "Cannot create model folder.")?;
        let final_path = self.directory.join(&c.filename);
        if final_path.is_file() {
            self.update("verifying", None);
            verify_file(&final_path, c)?;
            self.update("installed", None);
            return Ok(());
        }
        let partial = self.directory.join(format!("{}.partial", c.filename));
        let mut offset = fs::metadata(&partial).map(|m| m.len()).unwrap_or(0);
        if offset > c.size {
            File::create(&partial).map_err(|_| "Cannot reset partial download.")?;
            offset = 0;
        }
        let available =
            fs2::available_space(&self.directory).map_err(|_| "Cannot check free disk space.")?;
        check_space(available, c.size, offset)?;
        self.update("downloading", None);
        if offset < c.size {
            let client = Client::builder()
                .https_only(!cfg!(test))
                .connect_timeout(Duration::from_secs(15))
                .timeout(Duration::from_secs(1800))
                .redirect(reqwest::redirect::Policy::limited(5))
                .build()
                .map_err(|_| "Cannot create download connection.")?;
            let mut request = client.get(&c.url);
            if offset > 0 {
                request = request.header(reqwest::header::RANGE, format!("bytes={offset}-"));
            }
            let mut response = request
                .send()
                .map_err(|_| "Download connection failed. Retry to resume.")?;
            let append = validate_resume(
                response.status().as_u16(),
                response
                    .headers()
                    .get(reqwest::header::CONTENT_RANGE)
                    .and_then(|v| v.to_str().ok()),
                offset,
                c.size,
            )?;
            if !append {
                offset = 0;
                check_space(available, c.size, 0)?;
            }
            let mut file = OpenOptions::new()
                .create(true)
                .write(true)
                .append(append)
                .truncate(!append)
                .open(&partial)
                .map_err(|_| "Cannot write model download.")?;
            let mut buffer = [0u8; 64 * 1024];
            loop {
                if self.cancel.load(Ordering::SeqCst) {
                    return Err("Download paused.".into());
                }
                let count = response
                    .read(&mut buffer)
                    .map_err(|_| "Download interrupted. Retry to resume.")?;
                if count == 0 {
                    break;
                }
                if offset + count as u64 > c.size {
                    return Err("Download exceeded the expected size.".into());
                }
                file.write_all(&buffer[..count])
                    .map_err(|_| "Cannot write model. Check free disk space.")?;
                offset += count as u64;
                self.status.lock().unwrap().downloaded = offset;
            }
            file.sync_all()
                .map_err(|_| "Cannot finish model download.")?;
        }
        if self.cancel.load(Ordering::SeqCst) {
            return Err("Download paused.".into());
        }
        self.update("verifying", None);
        if let Err(error) = verify_file(&partial, c) {
            // Keep truncated files resumable; discard corrupt complete files so retry can recover.
            if fs::metadata(&partial)
                .map(|m| m.len() == c.size)
                .unwrap_or(false)
            {
                let _ = fs::remove_file(&partial);
            }
            return Err(error);
        }
        fs::rename(&partial, &final_path).map_err(|_| "Cannot install the verified model.")?;
        self.status.lock().unwrap().installed = true;
        self.update("installed", None);
        Ok(())
    }
    pub fn start(&self, runtime_directory: &Path) -> Result<(), String> {
        if self.snapshot().state == "ready" {
            return Ok(());
        }
        self.update("verifying", None);
        let result = self.start_inner(runtime_directory);
        if let Err(error) = &result {
            self.stop();
            self.update("failed", Some(error.clone()));
        }
        result
    }
    fn start_inner(&self, runtime_directory: &Path) -> Result<(), String> {
        let c = catalog();
        if physical_ram().is_some_and(|bytes| bytes < c.minimum_ram) {
            return Err("Local model requires at least 4 GB of physical RAM.".into());
        }
        verify_file(&self.directory.join(&c.filename), &c)?;
        self.update("starting", None);
        let listener = std::net::TcpListener::bind("127.0.0.1:0")
            .map_err(|_| "Cannot allocate a local port.")?;
        let port = listener
            .local_addr()
            .map_err(|_| "Cannot read local port.")?
            .port();
        drop(listener);
        let secret = uuid::Uuid::new_v4().to_string();
        let mut command = Command::new(runtime_directory.join(if cfg!(windows) {
            "llama-server.exe"
        } else {
            "llama-server"
        }));
        command
            .current_dir(runtime_directory)
            .args([
                "--host",
                "127.0.0.1",
                "--port",
                &port.to_string(),
                "--api-key",
                &secret,
                "--ctx-size",
                "4096",
                "--parallel",
                "1",
                "--n-gpu-layers",
                gpu_layers(),
                "--no-webui",
                "--jinja",
                "--reasoning-budget",
                "0",
                "--model",
            ])
            .arg(self.directory.join(&c.filename))
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }
        let child = command
            .spawn()
            .map_err(|_| "Bundled model runtime could not start. Reinstall the app or retry.")?;
        let process = RuntimeProcess::new(child, port, secret.clone())?;
        *self.process.lock().unwrap() = Some(process);
        let client = Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(2))
            .build()
            .map_err(|_| "Cannot check local model.")?;
        let started = Instant::now();
        while started.elapsed() < Duration::from_secs(90) {
            if self.snapshot().state == "failed" {
                return Err("Local runtime exited during startup.".into());
            }
            if client
                .get(format!("http://127.0.0.1:{port}/health"))
                .bearer_auth(&secret)
                .send()
                .is_ok_and(|r| r.status().is_success())
            {
                self.update("ready", None);
                return Ok(());
            }
            std::thread::sleep(Duration::from_millis(250));
        }
        Err("Local model startup timed out. Retry or use an API provider.".into())
    }
    pub fn connection(&self) -> Result<(String, String), String> {
        if self.snapshot().state != "ready" {
            return Err("Local model is not ready. Start it in Settings.".into());
        }
        let process = self.process.lock().unwrap();
        let process = process.as_ref().ok_or("Local model is not running.")?;
        Ok((
            format!("http://127.0.0.1:{}/v1/chat/completions", process.port),
            process.secret.clone(),
        ))
    }
    pub fn stop(&self) {
        self.update("stopping", None);
        self.process.lock().unwrap().take();
        self.update(
            if self.directory.join(catalog().filename).is_file() {
                "installed"
            } else {
                "not-installed"
            },
            None,
        );
    }
    pub fn remove(&self) -> Result<(), String> {
        self.stop();
        for name in [
            catalog().filename.clone(),
            format!("{}.partial", catalog().filename),
        ] {
            let path = self.directory.join(name);
            if path.exists() {
                fs::remove_file(path).map_err(|_| "Cannot remove model file.")?;
            }
        }
        let mut status = self.status.lock().unwrap();
        status.installed = false;
        status.downloaded = 0;
        status.state = "not-installed".into();
        Ok(())
    }
}
fn check_space(available: u64, size: u64, offset: u64) -> Result<(), String> {
    if available < size.saturating_sub(offset) + 64 * 1024 * 1024 {
        Err("Not enough free disk space for the model.".into())
    } else {
        Ok(())
    }
}
fn validate_resume(
    status: u16,
    range: Option<&str>,
    offset: u64,
    size: u64,
) -> Result<bool, String> {
    if status == 200 {
        return Ok(false);
    }
    if status == 206 && range == Some(format!("bytes {offset}-{}/{size}", size - 1).as_str()) {
        return Ok(offset > 0);
    }
    Err("Download server returned an unexpected response. Retry later.".into())
}
fn verify_file(path: &Path, c: &Catalog) -> Result<(), String> {
    let mut file = File::open(path).map_err(|_| "Model not installed. Download it in Settings.")?;
    if file.metadata().map_err(|_| "Cannot inspect model.")?.len() != c.size {
        return Err("Model download is incomplete. Retry to resume.".into());
    }
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let count = file.read(&mut buffer).map_err(|_| "Cannot verify model.")?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    if format!("{:x}", hasher.finalize()) != c.sha256 {
        return Err("Model checksum mismatch. Remove the model and download again.".into());
    }
    Ok(())
}
pub struct RuntimeProcess {
    child: Child,
    port: u16,
    secret: String,
    #[cfg(windows)]
    job: isize,
}
impl RuntimeProcess {
    fn new(mut child: Child, port: u16, secret: String) -> Result<Self, String> {
        #[cfg(windows)]
        unsafe {
            use std::os::windows::io::AsRawHandle;
            use windows_sys::Win32::{Foundation::CloseHandle, System::JobObjects::*};
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                let _ = child.kill();
                let _ = child.wait();
                return Err("Cannot manage local model process.".into());
            }
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &limits as *const _ as _,
                std::mem::size_of_val(&limits) as u32,
            ) == 0
                || AssignProcessToJobObject(job, child.as_raw_handle() as _) == 0
            {
                let _ = child.kill();
                let _ = child.wait();
                CloseHandle(job);
                return Err("Cannot attach local model process cleanup.".into());
            }
            return Ok(Self {
                child,
                port,
                secret,
                job: job as isize,
            });
        }
        #[cfg(not(windows))]
        {
            let _ = &mut child;
            Ok(Self {
                child,
                port,
                secret,
            })
        }
    }
}
impl Drop for RuntimeProcess {
    fn drop(&mut self) {
        #[cfg(windows)]
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.job as _);
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
fn gpu_layers() -> &'static str {
    // Hosted macOS VMs may not expose a GPU. This override is absent from production builds.
    #[cfg(test)]
    if std::env::var("COMPANION_TEST_CPU").as_deref() == Ok("1") { return "0"; }
    if cfg!(target_os = "macos") { "99" } else { "0" }
}

fn physical_ram() -> Option<u64> {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
        let mut memory: MEMORYSTATUSEX = std::mem::zeroed();
        memory.dwLength = std::mem::size_of_val(&memory) as u32;
        return (GlobalMemoryStatusEx(&mut memory) != 0).then_some(memory.ullTotalPhys);
    }
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("/usr/sbin/sysctl").args(["-n", "hw.memsize"]).output().ok()?;
        if !output.status.success() { return None; }
        String::from_utf8(output.stdout).ok()?.trim().parse().ok()
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(target_os = "macos")]
    #[test]
    fn macos_reads_physical_ram_and_reaps_runtime() {
        assert!(physical_ram().is_some_and(|bytes| bytes >= 1024 * 1024 * 1024));
        let child = Command::new("/bin/sleep").arg("60").spawn().unwrap();
        let pid = child.id();
        let process = RuntimeProcess::new(child, 0, "test".into()).unwrap();
        drop(process);
        assert!(!Command::new("/bin/kill").args(["-0", &pid.to_string()])
            .stderr(Stdio::null()).status().unwrap().success());
    }
    #[test]
    fn range_responses_are_validated() {
        assert_eq!(validate_resume(200, None, 12, 20), Ok(false));
        assert_eq!(
            validate_resume(206, Some("bytes 12-19/20"), 12, 20),
            Ok(true)
        );
        assert!(validate_resume(206, Some("bytes 0-19/20"), 12, 20).is_err());
        assert!(validate_resume(404, None, 0, 20).is_err());
        assert!(check_space(10, 100, 0).is_err());
    }
    #[test]
    fn verifies_content_not_just_size() {
        let root = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&root).unwrap();
        let path = root.join("model");
        fs::write(&path, b"abc").unwrap();
        let mut c = catalog();
        c.size = 3;
        c.sha256 = format!("{:x}", Sha256::digest(b"abc"));
        assert!(verify_file(&path, &c).is_ok());
        fs::write(&path, b"xyz").unwrap();
        assert!(verify_file(&path, &c).is_err());
        fs::write(&path, b"a").unwrap();
        assert!(verify_file(&path, &c).is_err());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn downloads_resumes_and_rejects_corruption() {
        use std::net::TcpListener;
        for (partial, bytes, good) in [
            (false, "abc", true),
            (true, "bc", true),
            (false, "xyz", false),
            (false, "ab", false),
        ] {
            let listener = TcpListener::bind("127.0.0.1:0").unwrap();
            let url = format!("http://{}/model", listener.local_addr().unwrap());
            let server = std::thread::spawn(move || {
                let (mut stream, _) = listener.accept().unwrap();
                let mut request = [0; 4096];
                let n = stream.read(&mut request).unwrap();
                if partial {
                    assert!(String::from_utf8_lossy(&request[..n])
                        .to_lowercase()
                        .contains("range: bytes=1-"));
                }
                let status = if partial {
                    "206 Partial Content\r\nContent-Range: bytes 1-2/3"
                } else {
                    "200 OK"
                };
                write!(
                    stream,
                    "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{bytes}",
                    bytes.len()
                )
                .unwrap();
            });
            let directory = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
            fs::create_dir_all(&directory).unwrap();
            let mut c = catalog();
            c.filename = "test.gguf".into();
            c.url = url;
            c.size = 3;
            c.sha256 = format!("{:x}", Sha256::digest(b"abc"));
            if partial {
                fs::write(directory.join("test.gguf.partial"), b"a").unwrap();
            }
            let model = LocalModel::new(directory.clone());
            assert_eq!(model.download_inner(&c).is_ok(), good);
            assert_eq!(directory.join("test.gguf").is_file(), good);
            if good {
                assert_eq!(fs::read(directory.join("test.gguf")).unwrap(), b"abc");
            }
            server.join().unwrap();
            fs::remove_dir_all(directory).unwrap();
        }
    }
    #[test]
    fn paused_download_and_removal_keep_user_data_separate() {
        let directory = std::env::temp_dir().join(uuid::Uuid::new_v4().to_string());
        fs::create_dir_all(&directory).unwrap();
        let c = catalog();
        let partial = directory.join(format!("{}.partial", c.filename));
        fs::write(&partial, b"partial").unwrap();
        let model = LocalModel::new(directory.clone());
        assert_eq!(model.snapshot().downloaded, 7);
        fs::write(directory.join("unrelated.txt"), b"keep").unwrap();
        model.remove().unwrap();
        assert!(!partial.exists());
        assert!(directory.join("unrelated.txt").exists());
        fs::remove_dir_all(directory).unwrap();
    }
}
