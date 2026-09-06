use serde::{Deserialize, Serialize};

/// Missing entirely on 1.6.x and its snapshots, hence the default.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JavaVersion {
    pub component: String,
    pub major_version: u32,
}

impl Default for JavaVersion {
    fn default() -> Self {
        Self {
            component: "jre-legacy".to_owned(),
            major_version: 8,
        }
    }
}
