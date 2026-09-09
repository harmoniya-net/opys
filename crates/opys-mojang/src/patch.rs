//! A version JSON that inherits — the `inheritsFrom` document.
//!
//! Every mod loader publishes one: a document naming the vanilla version it
//! layers onto, the class to launch instead, the libraries to add, and an
//! argument delta. It is the *same* format as a full version JSON, minus
//! everything the base already answers — `assetIndex`, `downloads`,
//! `javaVersion`, the metadata block — which is why it cannot be a [`Client`]
//! with optional fields: a `Client` without an asset index is not a version,
//! it is a different document.
//!
//! [`Client`]: crate::Client
//!
//! Unlike `Client`, this type never crosses a napi boundary — a loader reads
//! one, folds it onto vanilla and hands on the *result*. So it deserialises
//! straight from the wire spelling rather than through a named
//! `from_version_json`, and implements no `Serialize` to round-trip.

use serde::Deserialize;

use crate::arguments::{Arguments, MojangArgValue};
use crate::error::MojangError;
use crate::libraries::{Libraries, LibraryWire};
use crate::logging::Logging;

/// A parsed `inheritsFrom` document.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(try_from = "VersionPatchWire")]
pub struct VersionPatch {
    /// The patch's own id, e.g. `1.20.1-forge-47.4.0`.
    pub id: String,
    /// The vanilla version this document layers onto.
    pub inherits_from: String,
    pub main_class: String,
    /// The patch's own libraries, flattened the same way a version JSON's are.
    pub libraries: Libraries,
    /// The structured delta from `arguments` — appended to the base's.
    pub args: Arguments,
    /// `minecraftArguments`, split. Present only when the document carries
    /// that field, and it *replaces* the base's game arguments rather than
    /// extending them — see [`VersionPatch::merge_args`].
    pub game_override: Option<Vec<MojangArgValue>>,
    pub logging: Option<Logging>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct VersionPatchWire {
    id: String,
    inherits_from: String,
    main_class: String,
    #[serde(default)]
    arguments: Option<serde_json::Value>,
    #[serde(default)]
    minecraft_arguments: Option<String>,
    #[serde(default)]
    logging: Option<Logging>,
    #[serde(default)]
    libraries: Vec<LibraryWire>,
}

impl TryFrom<VersionPatchWire> for VersionPatch {
    type Error = MojangError;

    fn try_from(wire: VersionPatchWire) -> Result<Self, MojangError> {
        let mut args = match wire.arguments {
            Some(raw) => Arguments::from_version_json(raw)?,
            None => Arguments {
                game: Vec::new(),
                jvm: Vec::new(),
                legacy: false,
            },
        };

        let mut game_override = wire.minecraft_arguments.map(|line| {
            line.split_whitespace()
                .map(|a| MojangArgValue::Plain(a.to_owned()))
                .collect()
        });

        // A document that spells its game arguments as a string under
        // `arguments` rather than under `minecraftArguments` means the same
        // thing by it, and `from_version_json` has already told us so by
        // setting `legacy`. Normalise it to the field that carries that
        // meaning, and drop the JVM arguments it synthesised — those describe
        // a *whole* launch, which a patch by definition is not.
        if args.legacy {
            game_override.get_or_insert(std::mem::take(&mut args.game));
            args = Arguments {
                game: Vec::new(),
                jvm: Vec::new(),
                legacy: false,
            };
        }

        Ok(VersionPatch {
            id: wire.id,
            inherits_from: wire.inherits_from,
            main_class: wire.main_class,
            libraries: wire.libraries.try_into()?,
            args,
            game_override,
            logging: wire.logging,
        })
    }
}

impl VersionPatch {
    /// Fold this patch's arguments onto the base version's.
    ///
    /// `arguments` appends — base first, patch second, which is what makes a
    /// loader's `-D` properties land after vanilla's. `minecraftArguments`
    /// does not append: it is the entire game-argument line, so it replaces
    /// the base's.
    ///
    /// The two are independent, and a pre-1.13 Forge document carries both at
    /// once — its wrapper properties under `arguments.jvm`, its tweak-class
    /// line under `minecraftArguments`. A reader that picks one field or the
    /// other silently drops half of such a document.
    pub fn merge_args(&self, base: &Arguments) -> Arguments {
        Arguments {
            jvm: [base.jvm.clone(), self.args.jvm.clone()].concat(),
            game: match &self.game_override {
                Some(game) => game.clone(),
                None => [base.game.clone(), self.args.game.clone()].concat(),
            },
            legacy: base.legacy || self.game_override.is_some(),
        }
    }
}
