//! The multiplayer server list — `servers.dat` — generated at build time.
//!
//! The file has no URL: it is made here, from the entries a config lists, so
//! it travels with the manifest as a blob. An entry may carry rules, and a
//! file cannot be half-installed, so entries are grouped by ruleset and each
//! group becomes its own `servers.dat` at the same path under those rules.

mod nbt;

use opys_core::{parse_short_ruleset, MojangRuleset, Ruleset, ShorthandError};
use opys_dev::{BuildArtifact, Contribution, PluginOutput};
use serde::Deserialize;

pub use nbt::encode_servers_dat;

/// Where the list goes unless a config says otherwise.
pub const DEFAULT_SERVERLIST_PATH: &str = "${game_directory}/servers.dat";

/// One server in the list.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(try_from = "ServerEntryWire")]
pub struct ServerEntry {
    pub name: String,
    pub ip: String,
    /// Where this entry applies. Empty is everywhere.
    pub rules: MojangRuleset,
}

/// `rules` is how a rule is written in a config: shorthand or expanded.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ServerEntryWire {
    name: String,
    ip: String,
    #[serde(default)]
    rules: Option<Ruleset>,
}

impl TryFrom<ServerEntryWire> for ServerEntry {
    type Error = ShorthandError;

    fn try_from(raw: ServerEntryWire) -> Result<Self, Self::Error> {
        Ok(ServerEntry {
            name: raw.name,
            ip: raw.ip,
            rules: raw
                .rules
                .map(parse_short_ruleset)
                .transpose()?
                .unwrap_or_default(),
        })
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ServerlistOptions {
    /// Where the generated `servers.dat` lands. `None` is
    /// [`DEFAULT_SERVERLIST_PATH`].
    #[serde(default)]
    pub path: Option<String>,
}

/// Entries sharing a ruleset, in the order each ruleset first appears. A list
/// of pairs rather than a map: the order is the config author's, and reaches
/// the manifest.
fn grouped(servers: &[ServerEntry]) -> Vec<(&MojangRuleset, Vec<&ServerEntry>)> {
    let mut groups: Vec<(&MojangRuleset, Vec<&ServerEntry>)> = Vec::new();
    for entry in servers {
        match groups.iter_mut().find(|(rules, _)| *rules == &entry.rules) {
            Some((_, entries)) => entries.push(entry),
            None => groups.push((&entry.rules, vec![entry])),
        }
    }
    groups
}

/// The artifacts of a server list: one `servers.dat` per distinct
/// ruleset among `servers`, or a single empty one when there are none.
pub fn serverlist(servers: &[ServerEntry], options: &ServerlistOptions) -> Contribution {
    let path = options.path.as_deref().unwrap_or(DEFAULT_SERVERLIST_PATH);
    let unconditional = MojangRuleset::new();
    let mut groups = grouped(servers);
    if groups.is_empty() {
        // No servers is still a file: an empty list replaces whatever the
        // player had, which is what listing none means.
        groups.push((&unconditional, Vec::new()));
    }

    let artifacts = groups
        .into_iter()
        .map(|(rules, entries)| {
            let bytes =
                encode_servers_dat(entries.iter().map(|e| (e.name.as_str(), e.ip.as_str())));
            BuildArtifact::bytes(path, bytes).with_rules(rules)
        })
        .collect();

    Contribution {
        artifacts,
        ..Default::default()
    }
}

/// Run the `serverlist` plugin.
pub fn build_serverlist(servers: &[ServerEntry], options: &ServerlistOptions) -> PluginOutput {
    PluginOutput {
        name: "serverlist".to_owned(),
        contribution: serverlist(servers, options),
    }
}
