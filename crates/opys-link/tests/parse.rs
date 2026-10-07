//! Reading a URL for what it names. Nothing here makes a request.

use opys_link::{parse_link, GitHubRelease, Link};

fn url(s: &str) -> Link {
    Link::Url(s.to_owned())
}

#[test]
fn a_github_release_asset_by_tag() {
    assert_eq!(
        parse_link(
            "https://github.com/harmoniya-net/horno/releases/download/0.1.0/horno-0.1.0.jar"
        )
        .unwrap(),
        Link::GitHub {
            repo: "harmoniya-net/horno".into(),
            release: GitHubRelease::Tag("0.1.0".into()),
            asset: "horno-0.1.0.jar".into(),
        }
    );
}

#[test]
fn a_github_release_asset_by_latest() {
    assert_eq!(
        parse_link("https://github.com/harmoniya-net/dgpuj/releases/latest/download/dgpuj-linux-x64.tar.gz").unwrap(),
        Link::GitHub {
            repo: "harmoniya-net/dgpuj".into(),
            release: GitHubRelease::Latest,
            asset: "dgpuj-linux-x64.tar.gz".into(),
        }
    );
}

#[test]
fn escaped_names_are_read_as_what_they_spell() {
    // UniMixins's jar begins with a `+`, and a tag may hold one too.
    assert_eq!(
        parse_link("https://github.com/LegacyModdingMC/UniMixins/releases/download/0.1.5%2Bfix/%2Bunimixins-all-1.7.10-0.1.5.jar")
            .unwrap(),
        Link::GitHub {
            repo: "LegacyModdingMC/UniMixins".into(),
            release: GitHubRelease::Tag("0.1.5+fix".into()),
            asset: "+unimixins-all-1.7.10-0.1.5.jar".into(),
        }
    );
}

#[test]
fn a_gitlab_package_file_on_any_host() {
    let expected = |base: &str| Link::GitLab {
        base: base.into(),
        project: "harmoniya/authliberty".into(),
        package: "authliberty".into(),
        version: "0.3".into(),
        file: "authliberty-0.3.jar".into(),
    };
    assert_eq!(
        parse_link("https://gitlab.com/api/v4/projects/harmoniya%2Fauthliberty/packages/generic/authliberty/0.3/authliberty-0.3.jar")
            .unwrap(),
        expected("https://gitlab.com")
    );
    // Self-hosted, with a port: the path is what identifies it.
    assert_eq!(
        parse_link("http://git.example.test:8080/api/v4/projects/harmoniya%2Fauthliberty/packages/generic/authliberty/0.3/authliberty-0.3.jar")
            .unwrap(),
        expected("http://git.example.test:8080")
    );
}

#[test]
fn a_gitlab_project_may_be_a_numeric_id() {
    let Link::GitLab { project, .. } =
        parse_link("https://gitlab.com/api/v4/projects/4242/packages/generic/tool/1.0/tool.zip")
            .unwrap()
    else {
        panic!("not a GitLab link");
    };
    assert_eq!(project, "4242");
}

#[test]
fn a_modrinth_version_under_any_kind_of_project() {
    for link in [
        "https://modrinth.com/mod/sodium/version/JjCVwmVA",
        "https://modrinth.com/resourcepack/x/version/JjCVwmVA?tab=files",
        "https://www.modrinth.com/shader/y/version/JjCVwmVA#download",
    ] {
        assert_eq!(
            parse_link(link).unwrap(),
            Link::Modrinth {
                version_id: "JjCVwmVA".into()
            },
            "{link}"
        );
    }
}

#[test]
fn a_curseforge_file() {
    for link in [
        "https://www.curseforge.com/minecraft/mc-mods/botania/files/2283837",
        "https://curseforge.com/minecraft/texture-packs/x/files/2283837/download",
    ] {
        assert_eq!(
            parse_link(link).unwrap(),
            Link::CurseForge { file_id: 2283837 },
            "{link}"
        );
    }
}

#[test]
fn a_page_that_names_no_file_is_just_a_url() {
    // Not guessed at: a repository, a release page, a project page.
    for link in [
        "https://github.com/harmoniya-net/horno",
        "https://github.com/harmoniya-net/horno/releases/tag/0.1.0",
        "https://github.com/harmoniya-net/horno/archive/refs/tags/0.1.0.zip",
        "https://raw.githubusercontent.com/harmoniya-net/horno/main/README.md",
        "https://modrinth.com/mod/sodium",
        "https://www.curseforge.com/minecraft/mc-mods/botania",
        "https://www.curseforge.com/minecraft/mc-mods/botania/files/all",
        "https://cdn.modrinth.com/data/AANobbMI/versions/JjCVwmVA/sodium.jar",
        "https://example.test/files/mod.jar",
    ] {
        assert_eq!(parse_link(link).unwrap(), url(link), "{link}");
    }
}

#[test]
fn something_that_is_no_url_is_refused() {
    for bad in [
        "JjCVwmVA",
        "ftp://example.test/a.jar",
        "https://",
        "github.com/o/r/releases/download/1/a.jar",
        "",
    ] {
        let message = parse_link(bad).unwrap_err().to_string();
        assert!(message.contains("is not a link"), "{bad}: {message}");
    }
}
