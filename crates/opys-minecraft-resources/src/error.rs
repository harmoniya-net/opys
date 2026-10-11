use thiserror::Error;

#[derive(Debug, Error)]
pub enum ResourcesError {
    #[error(transparent)]
    Modrinth(#[from] opys_modrinth::ModrinthError),
    #[error(transparent)]
    CurseForge(#[from] opys_curseforge::CurseForgeError),
    #[error(transparent)]
    Link(#[from] opys_links::LinkError),
    #[error(transparent)]
    GitHub(#[from] opys_dev::github::GitHubError),
    #[error(transparent)]
    Scan(#[from] opys_dev::ScanError),
    #[error("{path}: {source}")]
    Read {
        path: String,
        #[source]
        source: std::io::Error,
    },
    #[error("{path}: {source}")]
    Toml {
        path: String,
        #[source]
        source: Box<toml::de::Error>,
    },

    // ── the file ──
    #[error(
        "`{name}` is no directory this file knows: it is none of {known}, and `[dirs]` does not name it"
    )]
    UnknownDir { name: String, known: String },
    #[error(
        "`[dirs]` puts `{name}` at \"{path}\", which is under no variable: begin it with `${{game_directory}}` or `${{root}}`"
    )]
    BadDirPath { name: String, path: String },
    #[error(
        "`{dir}.{key}` is no name for a file: a key is one name, with no `/` in it, and `.` only for a folder's own contents"
    )]
    BadKey { dir: String, key: String },
    #[error(
        "`{dir}.{key}` is in both `[common.{dir}]` and `[{side}.{dir}]`: they would be one file"
    )]
    ListedTwice {
        dir: String,
        key: String,
        side: &'static str,
    },

    // ── an entry ──
    #[error(
        "\"{0}\" is not a resource: write `modrinth:<project>@<version>`, `curseforge:<project>@<file id>`, `file:<path>`, or a link"
    )]
    BadSource(String),
    #[error(
        "\"{source_text}\" names no version: write `{source_text}@<version>`. A resource is always one version, so that two builds of a file are the same pack"
    )]
    NoVersion { source_text: String },
    #[error(
        "\"{source_text}\": a CurseForge file is named by its numeric id, and \"{id}\" is not one"
    )]
    BadFileId { source_text: String, id: String },
    #[error("\"{0}\": a loader after `#` tells Modrinth versions apart, and means nothing here")]
    LoaderElsewhere(String),
    #[error("an entry has one of `source`, `github` and `gitlab`, and this one has {0}")]
    OneSource(&'static str),

    // ── resolving ──
    #[error(
        "`{entry}` is a CurseForge file, which needs an API key to resolve: pass `curseforgeToken`"
    )]
    NoCurseForgeToken { entry: String },
    #[error("`{entry}`: file {file_id} belongs to the CurseForge project \"{actual}\"")]
    WrongProject {
        entry: String,
        file_id: u64,
        actual: String,
    },
    #[error(
        "`{entry}`: the release {tag} of {repo} has {count} assets, so say which with `asset`: {available}"
    )]
    WhichAsset {
        entry: String,
        repo: String,
        tag: String,
        count: usize,
        available: String,
    },
    #[error("`{entry}`: there is no file at {path}")]
    NoFile { entry: String, path: String },
    #[error("`{entry}` is a folder: end its path with `/` to take every file in it")]
    IsFolder { entry: String },
    #[error("`{entry}`: there is no folder at {path}")]
    NoFolder { entry: String, path: String },
    #[error("`{entry}`: the key `.` is for a folder's own contents, and this is one file")]
    DotForAFile { entry: String },
}
