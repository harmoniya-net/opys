//! A throwaway HTTP server for the resolver tests.
//!
//! The resolvers talk to a real socket rather than to a mocked transport:
//! `opys-dev`'s HTTP is a plain `ureq` call by design, so this is what keeps
//! the URL the resolver actually builds — path, query, headers — under test
//! instead of only the code around it.
//!
//! Each `tests/*.rs` is its own crate, so a helper only some of them use
//! reads as dead code in the rest.
#![allow(dead_code)]

use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};

/// What the server should answer with, per request.
pub struct Reply {
    pub status: u16,
    pub body: String,
}

impl Reply {
    pub fn json(body: impl Into<String>) -> Self {
        Reply {
            status: 200,
            body: body.into(),
        }
    }

    pub fn status(status: u16) -> Self {
        Reply {
            status,
            body: String::new(),
        }
    }
}

/// One recorded request.
#[derive(Debug, Clone)]
pub struct Request {
    /// Path plus query string, exactly as the resolver spelled it.
    pub target: String,
    pub headers: Vec<(String, String)>,
}

impl Request {
    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case(name))
            .map(|(_, v)| v.as_str())
    }
}

pub struct TestServer {
    pub base: String,
    requests: Arc<Mutex<Vec<Request>>>,
}

impl TestServer {
    /// Start a server that answers every request through `route`. The thread
    /// is detached: it dies with the test process, which is soon enough for a
    /// listener bound to an ephemeral loopback port.
    pub fn start<F>(route: F) -> Self
    where
        F: Fn(&Request) -> Reply + Send + Sync + 'static,
    {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind loopback");
        let port = listener.local_addr().expect("local addr").port();
        let requests: Arc<Mutex<Vec<Request>>> = Arc::new(Mutex::new(Vec::new()));

        let recorded = Arc::clone(&requests);
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else { continue };
                let Some(request) = read_request(&mut stream) else {
                    continue;
                };
                let reply = route(&request);
                recorded.lock().expect("requests lock").push(request);
                let body = reply.body.as_bytes();
                let head = format!(
                    "HTTP/1.1 {} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    reply.status,
                    body.len()
                );
                let _ = stream.write_all(head.as_bytes());
                let _ = stream.write_all(body);
                let _ = stream.flush();
            }
        });

        TestServer {
            base: format!("http://127.0.0.1:{port}"),
            requests,
        }
    }

    /// Every request received so far, in arrival order. Platform queries run
    /// on threads, so assert on the set rather than on the order.
    pub fn requests(&self) -> Vec<Request> {
        self.requests.lock().expect("requests lock").clone()
    }

    pub fn targets(&self) -> Vec<String> {
        self.requests().into_iter().map(|r| r.target).collect()
    }
}

fn read_request(stream: &mut std::net::TcpStream) -> Option<Request> {
    let mut reader = BufReader::new(stream.try_clone().ok()?);
    let mut start = String::new();
    reader.read_line(&mut start).ok()?;
    let target = start.split_whitespace().nth(1)?.to_owned();

    let mut headers = Vec::new();
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).ok()? == 0 {
            break;
        }
        let line = line.trim_end();
        if line.is_empty() {
            break;
        }
        if let Some((name, value)) = line.split_once(':') {
            headers.push((name.trim().to_owned(), value.trim().to_owned()));
        }
    }
    Some(Request { target, headers })
}
