//! Text a player reads: a string, the same in every language, or a map from
//! language to text, in whichever languages its author wrote.

use opys_bundle::{is_language_tag, Head, Localized, OptionDef, BUNDLE_FORMAT};
use serde_json::{json, Value};

fn head(value: Value) -> Result<Head, String> {
    serde_json::from_value(value).map_err(|e| e.to_string())
}

fn translated() -> Value {
    json!([
        { "slider": "xmx", "title": { "en": "RAM", "uk": "Пам'ять" },
          "subtitle": "How much the game gets", "unit": { "en": "MB", "uk": "МБ" },
          "min": 1024.0, "max": 16384.0, "step": 512.0, "default": 4096.0 },
        { "select": "preset", "title": "Graphics",
          "choices": [{ "value": "low", "label": { "en": "Low", "uk": "Низька" } }],
          "default": "low" },
        { "feature": "custom_java", "title": "Custom Java", "options": [
            { "text": "args", "title": "Arguments",
              "placeholder": { "en": "none", "pt-BR": "nenhum" } },
        ] },
    ])
}

#[test]
fn every_text_is_a_string_or_a_map_and_reads_back_as_written() {
    let value = json!({ "format": BUNDLE_FORMAT, "options": translated() });
    let read = head(value.clone()).unwrap();
    assert_eq!(serde_json::to_value(&read).unwrap(), value);

    let OptionDef::Slider { label, unit, .. } = &read.options.as_slice()[0] else {
        panic!("a slider");
    };
    assert_eq!(label.title.languages().collect::<Vec<_>>(), ["en", "uk"]);
    assert_eq!(label.subtitle, Some("How much the game gets".into()));
    assert!(matches!(unit, Some(Localized::Translated(_))));
}

#[test]
fn every_text_in_the_tree_is_found_under_a_feature_too() {
    let read = head(json!({ "format": BUNDLE_FORMAT, "options": translated() })).unwrap();
    let languages: Vec<_> = read
        .options
        .texts()
        .into_iter()
        .flat_map(Localized::languages)
        .collect();
    assert_eq!(
        languages,
        ["en", "uk", "en", "uk", "en", "uk", "en", "pt-BR"]
    );
}

#[test]
fn maps_need_not_share_a_language() {
    // `en`/`uk` beside `en`/`pt-BR`, and one in Ukrainian alone: what stands
    // in for a language a map lacks is the launcher's to choose.
    let options = json!([
        { "file": "skin", "title": { "uk": "Скін" } },
        { "text": "args", "title": { "en": "Arguments", "uk": "Аргументи" },
          "placeholder": { "en": "none", "pt-BR": "nenhum" } },
    ]);
    assert!(head(json!({ "format": BUNDLE_FORMAT, "options": options })).is_ok());
}

#[test]
fn a_map_names_a_language_and_only_languages() {
    let with = |title: Value| {
        head(json!({ "format": BUNDLE_FORMAT, "options": [{ "file": "skin", "title": title }] }))
    };
    assert!(with(json!({})).unwrap_err().contains("names no language"));
    assert!(with(json!({ "en": "Skin", "english!": "Skin" }))
        .unwrap_err()
        .contains("`english!` is not a language tag"));
    assert!(with(json!({ "en": 1 })).is_err());
}

#[test]
fn a_language_tag_is_a_language_and_subtags() {
    for tag in ["en", "uk", "fil", "pt-BR", "zh-Hant-TW", "de-CH-1996"] {
        assert!(is_language_tag(tag), "{tag}");
    }
    for tag in [
        "",
        "e",
        "english",
        "pt_BR",
        "en-",
        "-en",
        "en-toolongsubtag",
        "e1",
    ] {
        assert!(!is_language_tag(tag), "{tag}");
    }
}
