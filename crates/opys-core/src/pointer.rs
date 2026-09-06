use serde::{Deserialize, Serialize};

use crate::integrity::Integrity;
use crate::source::Source;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(from = "PointerDescriptorWire", into = "PointerDescriptorWire")]
pub struct PointerDescriptor {
    pub source: Source,
    pub integrity: Option<Integrity>,
    pub size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct PointerDescriptorWire {
    source: Source,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    integrity: Option<Integrity>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    size: Option<u64>,
}

impl From<PointerDescriptorWire> for PointerDescriptor {
    fn from(raw: PointerDescriptorWire) -> Self {
        PointerDescriptor {
            source: raw.source,
            integrity: raw.integrity,
            size: raw.size,
        }
    }
}

impl From<PointerDescriptor> for PointerDescriptorWire {
    fn from(d: PointerDescriptor) -> Self {
        PointerDescriptorWire {
            source: d.source,
            integrity: d.integrity.map(Integrity::collapsed),
            size: d.size,
        }
    }
}

pub fn parse_pointer_descriptor(input: &str) -> Result<PointerDescriptor, String> {
    serde_json::from_str(input).map_err(|e| format!("Pointer descriptor is not valid JSON: {e}"))
}
