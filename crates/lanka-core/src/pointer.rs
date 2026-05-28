use serde::{Deserialize, Serialize};

use crate::integrity::Integrity;
use crate::source::{decode_source, encode_source, Source, SourceWire};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PointerDescriptor {
    pub source: Source,
    pub integrity: Option<Integrity>,
    pub size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PointerDescriptorWire {
    pub source: SourceWire,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub integrity: Option<Integrity>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
}

pub fn decode_pointer_descriptor(raw: PointerDescriptorWire) -> PointerDescriptor {
    PointerDescriptor {
        source: decode_source(raw.source),
        integrity: raw.integrity,
        size: raw.size,
    }
}

pub fn encode_pointer_descriptor(d: &PointerDescriptor) -> PointerDescriptorWire {
    PointerDescriptorWire {
        source: encode_source(&d.source),
        integrity: d.integrity.clone().map(Integrity::collapsed),
        size: d.size,
    }
}

pub fn parse_pointer_descriptor(input: &str) -> Result<PointerDescriptor, String> {
    let wire: PointerDescriptorWire = serde_json::from_str(input)
        .map_err(|e| format!("Pointer descriptor is not valid JSON: {e}"))?;
    Ok(decode_pointer_descriptor(wire))
}
