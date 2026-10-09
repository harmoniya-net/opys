use serde::Serialize;
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
    MojangRule(#[from] opys_mojang_rules::RuleError),

    #[error(transparent)]
    Core(#[from] opys_core::DecodeError),

    #[error(transparent)]
    Bundle(#[from] opys_bundle::BundleError),

    #[error("install cancelled")]
    Cancelled,

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

/// What an [`InstallError`] is, as data.
///
/// An error crosses a binding as text, and text is all a caller on the far
/// side used to get: it told a failed download from a failed check by matching
/// the English of the message. This is the same failure with its kind named
/// and its particulars in fields, so the message can be reworded without
/// anything that reads it breaking.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "code",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum ErrorReport {
    /// A download was refused.
    Network {
        message: String,
        url: String,
        status: u16,
        body: String,
    },
    /// Files that are on disk and are not the files the manifest pins.
    Integrity {
        message: String,
        paths: Vec<String>,
    },
    /// An archive could not be unpacked.
    Extraction {
        message: String,
        artifact_path: String,
        cause: String,
    },
    /// The manifest, or the bundle it came in, is not one this reader accepts.
    Manifest {
        message: String,
    },
    /// The file system refused something.
    Io {
        message: String,
        path: String,
    },
    Cancelled {
        message: String,
    },
    Other {
        message: String,
    },
}

impl InstallError {
    pub fn report(&self) -> ErrorReport {
        let message = self.to_string();
        match self {
            InstallError::Network { url, status, body } => ErrorReport::Network {
                message,
                url: url.clone(),
                status: *status,
                body: body.clone(),
            },
            InstallError::Integrity { paths } => ErrorReport::Integrity {
                message,
                paths: paths.clone(),
            },
            InstallError::Extraction {
                artifact_path,
                source,
            } => ErrorReport::Extraction {
                message,
                artifact_path: artifact_path.clone(),
                cause: source.to_string(),
            },
            InstallError::Manifest(_)
            | InstallError::MojangRule(_)
            | InstallError::Core(_)
            | InstallError::Bundle(_) => ErrorReport::Manifest { message },
            InstallError::Io { path, .. } => ErrorReport::Io {
                message,
                path: path.clone(),
            },
            InstallError::Cancelled => ErrorReport::Cancelled { message },
            InstallError::Other(_) => ErrorReport::Other { message },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_report_names_its_kind_and_keeps_the_particulars() {
        let error = InstallError::Network {
            url: "https://example.test/a.jar".into(),
            status: 404,
            body: String::new(),
        };
        assert_eq!(
            serde_json::to_value(error.report()).unwrap(),
            serde_json::json!({
                "code": "network",
                "message": "HTTP 404 downloading https://example.test/a.jar",
                "url": "https://example.test/a.jar",
                "status": 404,
                "body": "",
            })
        );
    }

    #[test]
    fn a_path_with_a_comma_in_it_is_still_one_path() {
        // The message joins paths with ", ", which is why nothing should be
        // made to split it again.
        let error = InstallError::Integrity {
            paths: vec!["mods/a, b.jar".into(), "mods/c.jar".into()],
        };
        let ErrorReport::Integrity { paths, .. } = error.report() else {
            panic!("an integrity failure reports as one");
        };
        assert_eq!(paths, ["mods/a, b.jar", "mods/c.jar"]);
    }

    #[test]
    fn extraction_spells_its_fields_the_way_the_far_side_reads_them() {
        let error = InstallError::Extraction {
            artifact_path: "runtimes/jdk.tar.gz".into(),
            source: "truncated".into(),
        };
        let report = serde_json::to_value(error.report()).unwrap();
        assert_eq!(report["code"], "extraction");
        assert_eq!(report["artifactPath"], "runtimes/jdk.tar.gz");
        assert_eq!(report["cause"], "truncated");
    }

    #[test]
    fn everything_wrong_with_the_document_is_one_kind() {
        let error = InstallError::Manifest("no artifacts".into());
        assert!(matches!(error.report(), ErrorReport::Manifest { .. }));
    }
}
