use thiserror::Error;

#[derive(Debug, Error)]
pub enum InstallError {
    #[error("HTTP {status} downloading {url}{}", body_suffix(.body))]
    Network {
        url: String,
        status: u16,
        body: String,
    },

    #[error("Integrity check failed: {}", .paths.join(", "))]
    Integrity { paths: Vec<String> },

    #[error("Failed to extract {artifact_path}: {source}")]
    Extraction {
        artifact_path: String,
        #[source]
        source: Box<dyn std::error::Error + Send + Sync>,
    },

    #[error("Failed to parse manifest: {0}")]
    Manifest(String),

    #[error("io error at {path}: {source}")]
    Io {
        path: String,
        #[source]
        source: std::io::Error,
    },

    #[error(transparent)]
    Rule(#[from] lanka_mojang_rules::RuleError),

    #[error(transparent)]
    Core(#[from] lanka_core::DecodeError),

    #[error("{0}")]
    Other(String),
}

fn body_suffix(b: &str) -> String {
    if b.is_empty() {
        String::new()
    } else {
        format!(" — {b}")
    }
}

impl InstallError {
    pub fn other(msg: impl Into<String>) -> Self {
        InstallError::Other(msg.into())
    }
}
