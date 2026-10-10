//! The machine's own Java: no JDK shipped, and `java_bin` says where to look.

use opys_core::{resolve_val_defs, OsOptions};
use opys_dev::LaunchFragment;
use opys_java::{build_java, resolve_java, system_java, JavaError, JavaOptions, JavaVendor};

fn on(os: &str) -> OsOptions {
    OsOptions {
        name: os.to_owned(),
        version: String::new(),
        arch: "x86_64".to_owned(),
    }
}

fn bin(os: &str, features: &[&str]) -> String {
    let features: Vec<String> = features.iter().map(|f| (*f).to_owned()).collect();
    let vars = system_java().contribution.vars;
    resolve_val_defs(&vars, &on(os), &features).unwrap()["java_bin"].clone()
}

fn system() -> JavaOptions {
    JavaOptions {
        system: true,
        ..Default::default()
    }
}

#[test]
fn it_ships_nothing_and_owns_only_java_bin() {
    let contribution = system_java().contribution;
    assert!(contribution.artifacts.is_empty());
    assert_eq!(contribution.vars.keys().collect::<Vec<_>>(), ["java_bin"]);
    // No `home`: where the JDK is, is the launcher's to say.
    assert_eq!(
        contribution.launch.into_iter().collect::<Vec<_>>(),
        [(
            "bin".to_owned(),
            LaunchFragment::Text("${java_bin}".to_owned())
        )]
    );
}

#[test]
fn java_is_found_on_the_path_unless_the_player_named_one() {
    assert_eq!(bin("linux", &[]), "java");
    assert_eq!(bin("osx", &[]), "java");
    assert_eq!(bin("linux", &["custom_java"]), "${java_home}/bin/java");
    assert_eq!(bin("osx", &["custom_java"]), "${java_home}/bin/java");
}

#[test]
fn windows_has_no_console_unless_asked_either_way() {
    assert_eq!(bin("windows", &[]), "javaw");
    assert_eq!(bin("windows", &["java_console"]), "java");
    assert_eq!(
        bin("windows", &["custom_java"]),
        "${java_home}/bin/javaw.exe"
    );
    assert_eq!(
        bin("windows", &["custom_java", "java_console"]),
        "${java_home}/bin/java.exe"
    );
}

#[test]
fn java_home_is_exported_only_where_there_is_one() {
    let envs = system_java().contribution.envs;
    let resolve = |features: &[String]| resolve_val_defs(&envs, &on("linux"), features).unwrap();
    assert!(!resolve(&[]).contains_key("JAVA_HOME"));
    assert_eq!(
        resolve(&["custom_java".to_owned()])["JAVA_HOME"],
        "${java_home}"
    );
}

#[test]
fn the_plugin_builds_it_without_a_request_and_has_no_release() {
    let build = build_java(&system()).unwrap();
    assert_eq!(build.output, system_java());
    assert_eq!(build.output.name, "java");
    assert!(build.release.is_none());
}

#[test]
fn a_field_that_picks_a_jdk_is_refused_beside_system() {
    let refused = |options: JavaOptions| build_java(&options).unwrap_err().to_string();
    let message = refused(JavaOptions {
        version: "21".to_owned(),
        ..system()
    });
    assert_eq!(
        message,
        "java({ system: true }) ships no JDK, so `version` has nothing to apply to: \
         leave it out, or leave `system` out to ship one"
    );
    assert!(refused(JavaOptions {
        vendor: Some(JavaVendor::Zulu),
        ..system()
    })
    .contains("`vendor`"));
    assert!(refused(JavaOptions {
        platforms: Some(vec![]),
        ..system()
    })
    .contains("`platforms`"));
    assert!(refused(JavaOptions {
        api_base: Some("https://mirror.example.com".to_owned()),
        ..system()
    })
    .contains("`apiBase`"));
    assert!(refused(JavaOptions {
        token: Some("t".to_owned()),
        ..system()
    })
    .contains("`token`"));
}

#[test]
fn neither_a_version_nor_system_is_refused_by_name() {
    let error = build_java(&JavaOptions::default()).unwrap_err();
    assert!(matches!(error, JavaError::NoVersion));
    assert_eq!(
        error.to_string(),
        "java takes a `version` — java({ version: '21' }) — or `system: true` to ship no JDK"
    );
}

#[test]
fn there_is_no_release_to_resolve_for_it() {
    assert!(matches!(
        resolve_java(&system()).unwrap_err(),
        JavaError::NothingToResolve
    ));
}
