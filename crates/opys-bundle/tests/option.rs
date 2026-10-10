//! A bundle's options: how one is spelled, and what a tree may not say.

use std::io::Cursor;

use opys_bundle::{
    read_bundle_head, write_bundle, Blobs, BundleError, Choice, Head, Label, OptionDef, Options,
    BUNDLE_FORMAT,
};
use opys_core::Manifest;
use serde_json::{json, Value};

fn label(title: &str) -> Label {
    Label {
        title: title.to_owned(),
        subtitle: None,
    }
}

fn sample() -> Value {
    json!([
        { "slider": "xmx", "title": "RAM", "subtitle": "How much the game gets",
          "min": 1024.0, "max": 16384.0, "step": 512.0, "default": 4096.0, "unit": "MB" },
        { "select": "preset", "title": "Graphics",
          "choices": [{ "value": "low", "label": "Low" }, { "value": "high", "label": "High" }],
          "default": "low" },
        { "text": "server", "title": "Server", "placeholder": "play.example.net" },
        { "file": "skin", "title": "Skin" },
        { "feature": "fullscreen", "title": "Fullscreen", "default": true },
        { "feature": "custom_java", "title": "Custom Java", "options": [
            { "directory": "java_home", "title": "Java folder" },
            { "feature": "java_console", "title": "Console" }
        ] }
    ])
}

fn decode(options: Value) -> Result<Options, String> {
    serde_json::from_value(options).map_err(|e| e.to_string())
}

fn refusal(options: Value) -> String {
    decode(options).unwrap_err()
}

#[test]
fn an_option_is_told_apart_by_the_field_that_names_it() {
    let options = decode(sample()).unwrap();
    let [slider, select, text, file, fullscreen, custom_java] = options.as_slice() else {
        panic!("six options");
    };
    assert_eq!(
        slider,
        &OptionDef::Slider {
            name: "xmx".into(),
            label: Label {
                title: "RAM".into(),
                subtitle: Some("How much the game gets".into()),
            },
            min: 1024.0,
            max: 16384.0,
            step: 512.0,
            default: 4096.0,
            unit: Some("MB".into()),
        }
    );
    assert_eq!(
        select,
        &OptionDef::Select {
            name: "preset".into(),
            label: label("Graphics"),
            choices: vec![
                Choice {
                    value: "low".into(),
                    label: "Low".into()
                },
                Choice {
                    value: "high".into(),
                    label: "High".into()
                },
            ],
            default: "low".into(),
        }
    );
    assert_eq!(
        text,
        &OptionDef::Text {
            name: "server".into(),
            label: label("Server"),
            placeholder: Some("play.example.net".into()),
            default: None,
        }
    );
    assert_eq!(
        file,
        &OptionDef::File {
            name: "skin".into(),
            label: label("Skin"),
        }
    );
    assert_eq!(
        fullscreen,
        &OptionDef::Feature {
            name: "fullscreen".into(),
            label: label("Fullscreen"),
            default: true,
            options: vec![],
        }
    );
    assert_eq!(custom_java.name(), "custom_java");
    assert_eq!(custom_java.label().title, "Custom Java");
    let OptionDef::Feature {
        default, options, ..
    } = custom_java
    else {
        panic!("a feature");
    };
    assert!(!default);
    assert_eq!(
        options.iter().map(OptionDef::name).collect::<Vec<_>>(),
        ["java_home", "java_console"]
    );
}

#[test]
fn what_is_written_is_what_was_read() {
    let options = decode(sample()).unwrap();
    assert_eq!(serde_json::to_value(&options).unwrap(), sample());
}

#[test]
fn an_option_is_exactly_one_kind() {
    assert!(refusal(json!([{ "title": "Nameless" }])).contains("names none"));
    assert!(
        refusal(json!([{ "file": "a", "directory": "a", "title": "Both" }]))
            .contains("both `file` and `directory`")
    );
    assert!(refusal(json!([{ "file": "a" }])).contains("title"));
    assert!(refusal(json!([{ "file": "a", "title": "A", "colour": "red" }])).contains("colour"));
}

#[test]
fn a_field_of_another_kind_is_refused() {
    assert_eq!(
        refusal(json!([{ "file": "skin", "title": "Skin", "min": 1.0 }])),
        "`min` does not belong on a file (`skin`)"
    );
    assert_eq!(
        refusal(json!([{ "text": "server", "title": "Server", "options": [] }])),
        "`options` does not belong on a text (`server`)"
    );
}

#[test]
fn a_kind_has_what_it_cannot_do_without() {
    assert_eq!(
        refusal(
            json!([{ "slider": "xmx", "title": "RAM", "min": 1.0, "max": 2.0, "default": 1.0 }])
        ),
        "slider `xmx` has no `step`"
    );
    assert_eq!(
        refusal(json!([{ "select": "preset", "title": "Graphics", "default": "low" }])),
        "select `preset` has no `choices`"
    );
}

#[test]
fn a_default_is_of_its_kinds_type() {
    // What the admin's form used to send: every default a string.
    assert_eq!(
        refusal(json!([{ "slider": "xmx", "title": "RAM",
            "min": 1.0, "max": 2.0, "step": 1.0, "default": "1" }])),
        "the `default` of slider `xmx` is a number"
    );
    assert_eq!(
        refusal(json!([{ "feature": "fullscreen", "title": "Fullscreen", "default": "true" }])),
        "the `default` of feature `fullscreen` is a boolean"
    );
    assert_eq!(
        refusal(json!([{ "text": "server", "title": "Server", "default": 1 }])),
        "the `default` of text `server` is a string"
    );
    assert_eq!(
        refusal(json!([{ "select": "preset", "title": "Graphics",
            "choices": [{ "value": "1", "label": "One" }], "default": 1 }])),
        "the `default` of select `preset` is a string"
    );
}

fn slider(min: f64, max: f64, step: f64, default: f64) -> Value {
    json!([{ "slider": "xmx", "title": "RAM",
        "min": min, "max": max, "step": step, "default": default }])
}

#[test]
fn a_slider_has_a_range_and_a_default_inside_it() {
    assert!(decode(slider(1.0, 2.0, 0.5, 2.0)).is_ok());
    assert_eq!(
        refusal(slider(2.0, 2.0, 1.0, 2.0)),
        "slider `xmx` has no range: 2 to 2"
    );
    assert_eq!(
        refusal(slider(1.0, 2.0, 0.0, 1.0)),
        "slider `xmx` has a step of 0"
    );
    assert_eq!(
        refusal(slider(1.0, 2.0, 1.0, 3.0)),
        "the default of slider `xmx`, 3, is outside 1 to 2"
    );
    let unbounded = Options::new(vec![OptionDef::Slider {
        name: "xmx".into(),
        label: label("RAM"),
        min: 0.0,
        max: f64::INFINITY,
        step: 1.0,
        default: 1.0,
        unit: None,
    }]);
    assert_eq!(
        unbounded.unwrap_err(),
        "slider `xmx` has a number that is not finite"
    );
}

#[test]
fn a_select_defaults_to_one_of_its_choices() {
    let select = |choices: Value, default: &str| json!([{ "select": "preset", "title": "Graphics", "choices": choices, "default": default }]);
    let low = json!({ "value": "low", "label": "Low" });
    assert_eq!(
        refusal(select(json!([low]), "high")),
        "the default of select `preset`, `high`, is not one of its choices"
    );
    assert_eq!(
        refusal(select(json!([]), "low")),
        "the default of select `preset`, `low`, is not one of its choices"
    );
    assert_eq!(
        refusal(select(json!([low, low]), "low")),
        "select `preset` offers `low` twice"
    );
}

#[test]
fn a_name_is_one_option_however_deep() {
    assert_eq!(
        refusal(json!([
            { "file": "java_home", "title": "A" },
            { "feature": "custom_java", "title": "B", "options": [
                { "feature": "deeper", "title": "C", "options": [
                    { "directory": "java_home", "title": "D" }
                ] }
            ] }
        ])),
        "variable `java_home` is an option twice"
    );
    assert_eq!(
        refusal(json!([
            { "feature": "a", "title": "A", "options": [{ "feature": "a", "title": "A" }] }
        ])),
        "feature `a` is an option twice"
    );
    assert_eq!(
        refusal(json!([{ "text": "", "title": "Nameless" }])),
        "an option has an empty name"
    );
    // A variable and a feature are named apart.
    assert!(decode(json!([
        { "feature": "fullscreen", "title": "On" },
        { "text": "fullscreen", "title": "Mode" }
    ]))
    .is_ok());
}

#[test]
fn a_bundle_carries_its_options_in_its_head() {
    let head = Head::new(decode(sample()).unwrap());
    let mut out = Cursor::new(Vec::new());
    write_bundle(&mut out, &head, &Manifest::default(), &Blobs::new()).unwrap();
    let bytes = out.into_inner();
    assert_eq!(read_bundle_head(Cursor::new(bytes.clone())).unwrap(), head);

    // The head is the first entry and stored, so it is there to be read off
    // the front of the file: 30 bytes of local header, the name, the JSON.
    let json = serde_json::to_vec_pretty(&head).unwrap();
    let start = 30 + "opys.json".len();
    assert_eq!(&bytes[start..start + json.len()], &json[..]);
}

#[test]
fn a_head_with_no_options_says_only_its_format() {
    assert_eq!(
        serde_json::to_value(Head::default()).unwrap(),
        json!({ "format": BUNDLE_FORMAT })
    );
}

#[test]
fn a_bundle_whose_options_mean_nothing_is_not_read() {
    let head = json!({ "format": BUNDLE_FORMAT, "options": [
        { "file": "a", "title": "A" }, { "file": "a", "title": "B" }
    ] });
    let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let stored =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    zip.start_file("opys.json", stored).unwrap();
    std::io::Write::write_all(&mut zip, &serde_json::to_vec(&head).unwrap()).unwrap();
    let bytes = zip.finish().unwrap().into_inner();
    let BundleError::Json { entry, source } = read_bundle_head(Cursor::new(bytes)).unwrap_err()
    else {
        panic!("a head that does not parse");
    };
    assert_eq!(entry, "opys.json");
    assert!(source
        .to_string()
        .contains("variable `a` is an option twice"));
}

#[test]
fn a_head_in_another_format_is_not_written() {
    let head = Head {
        format: BUNDLE_FORMAT + 1,
        options: Options::default(),
    };
    let error = write_bundle(
        Cursor::new(Vec::new()),
        &head,
        &Manifest::default(),
        &Blobs::new(),
    )
    .unwrap_err();
    assert!(
        matches!(error, BundleError::Format { found } if found == u64::from(BUNDLE_FORMAT) + 1)
    );
}
