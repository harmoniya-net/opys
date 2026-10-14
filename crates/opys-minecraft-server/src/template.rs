//! A resolved server, as what a manifest takes: its files and a launch line.

use opys_core::{Val, ValDef, ValDefs};
use opys_dev::{BuildArtifact, Contribution, LaunchFragment, PluginOutput};
use serde::Serialize;
use serde_json::json;

use crate::cores::{resolve_server, ResolvedServer};
use crate::error::ServerError;
use crate::options::{ServerCore, ServerOptions};

/// The name this plugin claims in the plugin map.
pub const PLUGIN_NAME: &str = "server";

/// The feature that writes `eula.txt`. Agreeing to Mojang's EULA is for
/// whoever runs the server, so it is said at install and never in a bundle:
/// a bundle is handed on, and would then say it for somebody else.
pub const EULA_FEATURE: &str = "eula";

const EULA_PATH: &str = "${root}/eula.txt";

/// What a server contributes: its files, the EULA file behind its feature,
/// and the pieces of the launch line.
pub fn server_contribution(server: &ResolvedServer) -> Contribution {
    let words = |value: Vec<String>| {
        LaunchFragment::One(Val {
            rules: Default::default(),
            value,
        })
    };
    let mut vars = ValDefs::new();
    // The current directory unless the launch says otherwise, as for a
    // client: a server is started from the folder it lives in.
    vars.insert("root".to_owned(), ValDef::Flat(".".to_owned()));
    vars.extend(server.vars.clone());

    let eula: BuildArtifact = serde_json::from_value(json!({
        "path": EULA_PATH,
        // `eula=true`, and a newline.
        "source": { "bytes": "ZXVsYT10cnVlCg==" },
        "rules": format!("allow.features.{EULA_FEATURE}"),
    }))
    .expect("an artifact this crate spelled itself");

    Contribution {
        artifacts: server.files.iter().cloned().chain([eula]).collect(),
        vars,
        launch: [
            (
                "command".to_owned(),
                LaunchFragment::Text("${java_bin}".to_owned()),
            ),
            // Whatever starts the server is `jar`, though for Cleanroom it
            // is a classpath and a main class, so that a config writes the
            // same line whatever the core.
            ("jar".to_owned(), words(server.start.clone())),
            ("args".to_owned(), words(vec!["nogui".to_owned()])),
        ]
        .into_iter()
        .collect(),
        envs: Default::default(),
    }
}

/// A build's output, and what it resolved to.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ServerBuild {
    pub output: PluginOutput,
    pub label: String,
    pub pinned: ServerCore,
}

/// Run the plugin.
pub fn build_server(options: &ServerOptions) -> Result<ServerBuild, ServerError> {
    let server = resolve_server(options)?;
    Ok(ServerBuild {
        output: PluginOutput {
            name: PLUGIN_NAME.to_owned(),
            contribution: server_contribution(&server),
        },
        label: server.label,
        pinned: server.pinned,
    })
}
