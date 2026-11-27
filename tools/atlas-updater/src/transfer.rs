// Downloads for the helper: the offline engine, the language packs and the extension zip.
//
// A file is split into parts that download at the same time, each over its own connection, when the server supports
// byte ranges (GitHub and most content servers do). Each part is written to its place in the file. When the server does
// not support ranges, one connection downloads the whole file. The caller still checks the SHA-256 of the result.
//
// Progress is counted in Progress: the bytes done and the total. A download can be cancelled from the window. A failed
// part is tried again a few times, and its bytes are taken back out of the count.

use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

pub const DEFAULT_CONNECTIONS: usize = 4;
pub const MIN_CONNECTIONS: usize = 1;
pub const MAX_CONNECTIONS: usize = 8;
/// A part smaller than this is not worth a connection of its own.
const MIN_PART_BYTES: u64 = 1024 * 1024;
const ATTEMPTS: u32 = 3;
const TIMEOUT: Duration = Duration::from_secs(300);
const CHUNK: usize = 64 * 1024;
pub const CANCELLED: &str = "The download was cancelled. Nothing was installed.";

/// What the window shows: how many bytes are done, and how many there are in all.
#[derive(Default)]
pub struct Progress {
    pub done: AtomicU64,
    pub total: AtomicU64,
    pub cancel: AtomicBool,
    /// The step the window shows, such as "Downloading the extension...".
    stage: Mutex<String>,
}

impl Progress {
    pub fn set_stage(&self, text: &str) {
        if let Ok(mut stage) = self.stage.lock() {
            *stage = text.to_string();
        }
    }

    pub fn stage(&self) -> String {
        self.stage.lock().map(|s| s.clone()).unwrap_or_default()
    }
}

/// One download job: how many connections to use, and where to count progress.
#[derive(Clone)]
pub struct Transfer {
    pub connections: usize,
    pub progress: Arc<Progress>,
}

enum Probe {
    /// The server answered a range request: the whole size is known.
    Ranges { total: u64 },
    /// The server ignored the range and sent the whole file. The response is kept and read as the download.
    Whole { response: ureq::Response },
    /// A range answer without a total size. The file is asked for again without a range.
    Unknown,
}

impl Transfer {
    pub fn new(connections: usize, progress: Arc<Progress>) -> Transfer {
        Transfer { connections: connections.clamp(MIN_CONNECTIONS, MAX_CONNECTIONS), progress }
    }

    /// A transfer that counts its progress nowhere a window looks. Used by the command line.
    pub fn quiet() -> Transfer {
        Transfer::new(DEFAULT_CONNECTIONS, Arc::new(Progress::default()))
    }

    /// Downloads `url` into `dest`. `size` is the size the caller already added to progress.total (from the catalogue).
    /// When it is None, the size the server reports is added here.
    pub fn download(&self, url: &str, dest: &Path, size: Option<u64>) -> Result<(), String> {
        self.check_cancel()?;
        #[cfg(test)]
        {
            if let Some(path) = url.strip_prefix("file://") {
                let copied = fs::copy(path, dest).map_err(|e| format!("cannot copy {}: {}", path, e))?;
                self.progress.done.fetch_add(copied, Ordering::Relaxed);
                return Ok(());
            }
        }
        let result = match probe(url)? {
            Probe::Ranges { total } => {
                if size.is_none() {
                    self.progress.total.fetch_add(total, Ordering::Relaxed);
                }
                self.download_parts(url, dest, total)
            }
            Probe::Whole { response } => {
                if size.is_none() {
                    if let Some(total) = response.header("Content-Length").and_then(|v| v.parse::<u64>().ok()) {
                        self.progress.total.fetch_add(total, Ordering::Relaxed);
                    }
                }
                self.download_whole(url, dest, Some(response))
            }
            Probe::Unknown => self.download_whole(url, dest, None),
        };
        result
    }

    fn check_cancel(&self) -> Result<(), String> {
        if self.progress.cancel.load(Ordering::Relaxed) {
            Err(CANCELLED.to_string())
        } else {
            Ok(())
        }
    }

    /// Splits the file into parts, one per connection (fewer when the file is small), and downloads them at once.
    fn download_parts(&self, url: &str, dest: &Path, total: u64) -> Result<(), String> {
        let file = File::create(dest).map_err(|e| format!("cannot write {}: {}", dest.display(), e))?;
        file.set_len(total).map_err(|e| format!("cannot write {}: {}", dest.display(), e))?;
        drop(file);
        let parts = (total / MIN_PART_BYTES).clamp(1, self.connections as u64);
        let part_size = total.div_ceil(parts);
        thread::scope(|scope| {
            let mut handles = Vec::new();
            for i in 0..parts {
                let start = i * part_size;
                let end = (start + part_size).min(total);
                if start >= end {
                    break;
                }
                handles.push(scope.spawn(move || self.fetch_part(url, dest, start, end)));
            }
            let mut first_error: Option<String> = None;
            for handle in handles {
                match handle.join() {
                    Ok(Ok(())) => {}
                    Ok(Err(e)) => {
                        first_error.get_or_insert(e);
                    }
                    Err(_) => {
                        first_error.get_or_insert("a download connection stopped unexpectedly".to_string());
                    }
                }
            }
            match first_error {
                Some(e) => Err(e),
                None => Ok(()),
            }
        })
    }

    /// Downloads bytes start..end of the file, with a few attempts. The bytes of a failed attempt leave the count.
    fn fetch_part(&self, url: &str, dest: &Path, start: u64, end: u64) -> Result<(), String> {
        let mut last = String::new();
        for attempt in 1..=ATTEMPTS {
            let mut added = 0u64;
            match self.fetch_part_once(url, dest, start, end, &mut added) {
                Ok(()) => return Ok(()),
                Err(e) => {
                    self.progress.done.fetch_sub(added, Ordering::Relaxed);
                    if e == CANCELLED {
                        return Err(e);
                    }
                    last = e;
                }
            }
            if attempt < ATTEMPTS {
                self.pause()?;
            }
        }
        Err(format!("the download failed. {}", last))
    }

    fn fetch_part_once(&self, url: &str, dest: &Path, start: u64, end: u64, added: &mut u64) -> Result<(), String> {
        let response = ureq::get(url)
            .set("Range", &format!("bytes={}-{}", start, end - 1))
            .timeout(TIMEOUT)
            .call()
            .map_err(|e| format!("could not download ({}). Check your internet connection.", e))?;
        if response.status() != 206 {
            return Err(format!("the server answered {} to a part request", response.status()));
        }
        let mut file = OpenOptions::new()
            .write(true)
            .open(dest)
            .map_err(|e| format!("cannot write {}: {}", dest.display(), e))?;
        file.seek(SeekFrom::Start(start)).map_err(|e| format!("cannot write {}: {}", dest.display(), e))?;
        let expected = end - start;
        let mut reader = response.into_reader();
        let mut buffer = vec![0u8; CHUNK];
        let mut written = 0u64;
        loop {
            self.check_cancel()?;
            let n = reader.read(&mut buffer).map_err(|e| format!("the download stopped: {}", e))?;
            if n == 0 {
                break;
            }
            if written + n as u64 > expected {
                return Err("the server sent more than was asked for".to_string());
            }
            file.write_all(&buffer[..n]).map_err(|e| format!("cannot write {}: {}", dest.display(), e))?;
            written += n as u64;
            *added += n as u64;
            self.progress.done.fetch_add(n as u64, Ordering::Relaxed);
        }
        if written != expected {
            return Err(format!("the download stopped after {} of {} bytes", written, expected));
        }
        Ok(())
    }

    /// One connection, the whole file. The first attempt can reuse the response from the probe.
    fn download_whole(&self, url: &str, dest: &Path, mut first: Option<ureq::Response>) -> Result<(), String> {
        let mut last = String::new();
        for attempt in 1..=ATTEMPTS {
            let mut added = 0u64;
            let response = match first.take() {
                Some(r) => Ok(r),
                None => ureq::get(url).timeout(TIMEOUT).call().map_err(|e| format!("could not download ({}). Check your internet connection.", e)),
            };
            let result = response.and_then(|r| self.write_whole(r, dest, &mut added));
            match result {
                Ok(()) => return Ok(()),
                Err(e) => {
                    self.progress.done.fetch_sub(added, Ordering::Relaxed);
                    if e == CANCELLED {
                        return Err(e);
                    }
                    last = e;
                }
            }
            if attempt < ATTEMPTS {
                self.pause()?;
            }
        }
        Err(format!("the download failed. {}", last))
    }

    fn write_whole(&self, response: ureq::Response, dest: &Path, added: &mut u64) -> Result<(), String> {
        let mut file = File::create(dest).map_err(|e| format!("cannot write {}: {}", dest.display(), e))?;
        let mut reader = response.into_reader();
        let mut buffer = vec![0u8; CHUNK];
        loop {
            self.check_cancel()?;
            let n = reader.read(&mut buffer).map_err(|e| format!("the download stopped: {}", e))?;
            if n == 0 {
                break;
            }
            file.write_all(&buffer[..n]).map_err(|e| format!("cannot write {}: {}", dest.display(), e))?;
            *added += n as u64;
            self.progress.done.fetch_add(n as u64, Ordering::Relaxed);
        }
        Ok(())
    }

    /// Waits before a retry, in short steps, so that a cancel is seen quickly.
    fn pause(&self) -> Result<(), String> {
        for _ in 0..25 {
            self.check_cancel()?;
            thread::sleep(Duration::from_millis(200));
        }
        Ok(())
    }
}

fn probe(url: &str) -> Result<Probe, String> {
    let response = ureq::get(url)
        .set("Range", "bytes=0-0")
        .timeout(TIMEOUT)
        .call()
        .map_err(|e| format!("could not download ({}). Check your internet connection.", e))?;
    match response.status() {
        206 => {
            let total = response
                .header("Content-Range")
                .and_then(|v| v.rsplit('/').next())
                .and_then(|t| t.trim().parse::<u64>().ok());
            Ok(match total {
                Some(total) if total > 0 => Probe::Ranges { total },
                _ => Probe::Unknown,
            })
        }
        _ => Ok(Probe::Whole { response }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{TcpListener, TcpStream};

    /// A tiny server for the tests: it serves `body` at any path, with byte ranges when `ranges` is true.
    fn serve(body: Vec<u8>, ranges: bool) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
        let address = listener.local_addr().expect("address");
        thread::spawn(move || {
            for stream in listener.incoming().flatten().take(200) {
                let body = body.clone();
                thread::spawn(move || answer(stream, &body, ranges));
            }
        });
        format!("http://{}/file.bin", address)
    }

    fn answer(mut stream: TcpStream, body: &[u8], ranges: bool) {
        let mut head = Vec::new();
        let mut byte = [0u8; 1];
        while !head.ends_with(b"\r\n\r\n") {
            match stream.read(&mut byte) {
                Ok(1) => head.push(byte[0]),
                _ => return,
            }
        }
        let text = String::from_utf8_lossy(&head).to_string();
        let range = text
            .lines()
            .find_map(|line| line.strip_prefix("Range: bytes="))
            .and_then(|r| r.trim().split_once('-').map(|(a, b)| (a.to_string(), b.to_string())));
        let last = body.len() - 1;
        let reply = match (ranges, range) {
            (true, Some((a, b))) => {
                let start: usize = a.parse().unwrap();
                let end: usize = if b.is_empty() { last } else { b.parse::<usize>().unwrap().min(last) };
                let slice = &body[start..=end];
                let head = format!(
                    "HTTP/1.1 206 Partial Content\r\nContent-Length: {}\r\nContent-Range: bytes {}-{}/{}\r\nConnection: close\r\n\r\n",
                    slice.len(),
                    start,
                    end,
                    body.len()
                );
                (head, slice.to_vec())
            }
            _ => (
                format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len()),
                body.to_vec(),
            ),
        };
        let _ = stream.write_all(reply.0.as_bytes());
        let _ = stream.write_all(&reply.1);
    }

    fn sample(len: usize) -> Vec<u8> {
        (0..len).map(|i| ((i * 31 + i / 7) % 251) as u8).collect()
    }

    fn temp(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("atlas-transfer-{}-{}", name, std::process::id()))
    }

    #[test]
    fn a_large_file_is_split_over_connections_and_is_complete() {
        let body = sample(3 * 1024 * 1024 + 123);
        let url = serve(body.clone(), true);
        let progress = Arc::new(Progress::default());
        let transfer = Transfer::new(4, Arc::clone(&progress));
        let dest = temp("parts");
        transfer.download(&url, &dest, None).expect("download");
        assert_eq!(fs::read(&dest).unwrap(), body, "the parts are in their places");
        assert_eq!(progress.done.load(Ordering::Relaxed), body.len() as u64, "every byte is counted once");
        assert_eq!(progress.total.load(Ordering::Relaxed), body.len() as u64, "the total comes from the server");
        let _ = fs::remove_file(&dest);
    }

    #[test]
    fn a_server_without_ranges_still_gives_the_whole_file() {
        let body = sample(300 * 1024);
        let url = serve(body.clone(), false);
        let progress = Arc::new(Progress::default());
        let transfer = Transfer::new(4, Arc::clone(&progress));
        let dest = temp("whole");
        transfer.download(&url, &dest, None).expect("download");
        assert_eq!(fs::read(&dest).unwrap(), body);
        assert_eq!(progress.done.load(Ordering::Relaxed), body.len() as u64);
        let _ = fs::remove_file(&dest);
    }

    #[test]
    fn a_known_size_is_not_added_to_the_total_again() {
        let body = sample(2 * 1024 * 1024);
        let url = serve(body.clone(), true);
        let progress = Arc::new(Progress::default());
        progress.total.store(body.len() as u64, Ordering::Relaxed);
        let transfer = Transfer::new(2, Arc::clone(&progress));
        let dest = temp("known");
        transfer.download(&url, &dest, Some(body.len() as u64)).expect("download");
        assert_eq!(progress.total.load(Ordering::Relaxed), body.len() as u64);
        let _ = fs::remove_file(&dest);
    }

    #[test]
    fn a_cancelled_download_stops_and_says_so() {
        let body = sample(2 * 1024 * 1024);
        let url = serve(body, true);
        let progress = Arc::new(Progress::default());
        progress.cancel.store(true, Ordering::Relaxed);
        let transfer = Transfer::new(4, progress);
        let dest = temp("cancel");
        assert_eq!(transfer.download(&url, &dest, None).unwrap_err(), CANCELLED);
        let _ = fs::remove_file(&dest);
    }

    #[test]
    fn the_connection_count_is_kept_in_its_range() {
        assert_eq!(Transfer::new(0, Arc::new(Progress::default())).connections, MIN_CONNECTIONS);
        assert_eq!(Transfer::new(99, Arc::new(Progress::default())).connections, MAX_CONNECTIONS);
    }
}
