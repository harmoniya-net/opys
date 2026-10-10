//! Options: what a bundle lets whoever launches it choose.
//!
//! A manifest's rules test features and its strings name variables, and
//! nothing in it says which of those are a player's to set. A bundle's head
//! does: a tree of options, each with what a launcher needs to draw it. An
//! option fills a variable, except a `feature`, which switches a feature on
//! and holds the options that only matter while it is.
//!
//! This is the schema alone. What was chosen, and turning that into the
//! `vars` and `features` an install takes, belongs to whoever shows the form.

use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

/// One value a `select` offers, and what to call it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Choice {
    pub value: String,
    pub label: String,
}

/// What every option says about itself to the person choosing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Label {
    pub title: String,
    pub subtitle: Option<String>,
}

/// One option. `name` is the variable it fills or, for a `Feature`, the
/// feature it switches.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(try_from = "OptionWire", into = "OptionWire")]
pub enum OptionDef {
    Slider {
        name: String,
        label: Label,
        min: f64,
        max: f64,
        step: f64,
        default: f64,
        unit: Option<String>,
    },
    Select {
        name: String,
        label: Label,
        choices: Vec<Choice>,
        default: String,
    },
    Text {
        name: String,
        label: Label,
        placeholder: Option<String>,
        default: Option<String>,
    },
    File {
        name: String,
        label: Label,
    },
    Directory {
        name: String,
        label: Label,
    },
    Feature {
        name: String,
        label: Label,
        default: bool,
        options: Vec<OptionDef>,
    },
}

impl OptionDef {
    pub fn name(&self) -> &str {
        match self {
            OptionDef::Slider { name, .. }
            | OptionDef::Select { name, .. }
            | OptionDef::Text { name, .. }
            | OptionDef::File { name, .. }
            | OptionDef::Directory { name, .. }
            | OptionDef::Feature { name, .. } => name,
        }
    }

    pub fn label(&self) -> &Label {
        match self {
            OptionDef::Slider { label, .. }
            | OptionDef::Select { label, .. }
            | OptionDef::Text { label, .. }
            | OptionDef::File { label, .. }
            | OptionDef::Directory { label, .. }
            | OptionDef::Feature { label, .. } => label,
        }
    }
}

/// Discriminated by which field is present, like every wire shape here, and
/// that field holds the name: `{ "slider": "xmx", … }`. A struct of options
/// rather than an untagged enum, so a field on the wrong kind is named.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct OptionWire {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    slider: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    select: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    file: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    directory: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    feature: Option<String>,

    title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    subtitle: Option<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    min: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    max: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    step: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    unit: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    choices: Option<Vec<Choice>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    placeholder: Option<String>,
    /// A number on a slider, a string on a select or a text, a boolean on a
    /// feature: the one field whose type depends on the kind.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    default: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    options: Option<Vec<OptionDef>>,
}

const KINDS: &str = "`slider`, `select`, `text`, `file`, `directory`, `feature`";

impl TryFrom<OptionWire> for OptionDef {
    type Error = String;

    fn try_from(raw: OptionWire) -> Result<Self, Self::Error> {
        let kinds = [
            ("slider", &raw.slider),
            ("select", &raw.select),
            ("text", &raw.text),
            ("file", &raw.file),
            ("directory", &raw.directory),
            ("feature", &raw.feature),
        ];
        let mut named = kinds
            .iter()
            .filter_map(|(kind, name)| name.as_ref().map(|name| (*kind, name.clone())));
        let (kind, name) = named
            .next()
            .ok_or_else(|| format!("an option is one of {KINDS}, and this names none"))?;
        if let Some((other, _)) = named.next() {
            return Err(format!(
                "an option is one kind, and this is both `{kind}` and `{other}`"
            ));
        }

        // Each kind takes what is its own and refuses the rest, so a `min` on
        // a select is an error rather than a field nothing reads.
        let present = [
            ("min", raw.min.is_some()),
            ("max", raw.max.is_some()),
            ("step", raw.step.is_some()),
            ("unit", raw.unit.is_some()),
            ("choices", raw.choices.is_some()),
            ("placeholder", raw.placeholder.is_some()),
            ("default", raw.default.is_some()),
            ("options", raw.options.is_some()),
        ];
        let allowed: &[&str] = match kind {
            "slider" => &["min", "max", "step", "unit", "default"],
            "select" => &["choices", "default"],
            "text" => &["placeholder", "default"],
            "feature" => &["default", "options"],
            _ => &[],
        };
        if let Some((field, _)) = present
            .iter()
            .find(|(field, is)| *is && !allowed.contains(field))
        {
            return Err(format!("`{field}` does not belong on a {kind} (`{name}`)"));
        }

        let missing = |field: &str| format!("{kind} `{name}` has no `{field}`");
        let label = Label {
            title: raw.title,
            subtitle: raw.subtitle,
        };
        Ok(match kind {
            "slider" => OptionDef::Slider {
                min: raw.min.ok_or_else(|| missing("min"))?,
                max: raw.max.ok_or_else(|| missing("max"))?,
                step: raw.step.ok_or_else(|| missing("step"))?,
                default: raw
                    .default
                    .ok_or_else(|| missing("default"))?
                    .as_f64()
                    .ok_or_else(|| format!("the `default` of slider `{name}` is a number"))?,
                unit: raw.unit,
                name,
                label,
            },
            "select" => OptionDef::Select {
                choices: raw.choices.ok_or_else(|| missing("choices"))?,
                default: match raw.default.ok_or_else(|| missing("default"))? {
                    serde_json::Value::String(value) => value,
                    _ => return Err(format!("the `default` of select `{name}` is a string")),
                },
                name,
                label,
            },
            "text" => OptionDef::Text {
                placeholder: raw.placeholder,
                default: match raw.default {
                    None => None,
                    Some(serde_json::Value::String(value)) => Some(value),
                    Some(_) => return Err(format!("the `default` of text `{name}` is a string")),
                },
                name,
                label,
            },
            "file" => OptionDef::File { name, label },
            "directory" => OptionDef::Directory { name, label },
            _ => OptionDef::Feature {
                default: match raw.default {
                    None => false,
                    Some(serde_json::Value::Bool(value)) => value,
                    Some(_) => {
                        return Err(format!("the `default` of feature `{name}` is a boolean"))
                    }
                },
                options: raw.options.unwrap_or_default(),
                name,
                label,
            },
        })
    }
}

impl From<OptionDef> for OptionWire {
    fn from(option: OptionDef) -> Self {
        let labelled = |label: Label| OptionWire {
            title: label.title,
            subtitle: label.subtitle,
            ..OptionWire::default()
        };
        match option {
            OptionDef::Slider {
                name,
                label,
                min,
                max,
                step,
                default,
                unit,
            } => OptionWire {
                slider: Some(name),
                min: Some(min),
                max: Some(max),
                step: Some(step),
                default: Some(default.into()),
                unit,
                ..labelled(label)
            },
            OptionDef::Select {
                name,
                label,
                choices,
                default,
            } => OptionWire {
                select: Some(name),
                choices: Some(choices),
                default: Some(default.into()),
                ..labelled(label)
            },
            OptionDef::Text {
                name,
                label,
                placeholder,
                default,
            } => OptionWire {
                text: Some(name),
                placeholder,
                default: default.map(Into::into),
                ..labelled(label)
            },
            OptionDef::File { name, label } => OptionWire {
                file: Some(name),
                ..labelled(label)
            },
            OptionDef::Directory { name, label } => OptionWire {
                directory: Some(name),
                ..labelled(label)
            },
            // What a feature leaves out reads back as what it was: off, and
            // holding nothing.
            OptionDef::Feature {
                name,
                label,
                default,
                options,
            } => OptionWire {
                feature: Some(name),
                default: default.then_some(true.into()),
                options: (!options.is_empty()).then_some(options),
                ..labelled(label)
            },
        }
    }
}

/// A bundle's options, checked as a whole: a tree that has been read is one a
/// form can be drawn from without looking at it twice.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(try_from = "Vec<OptionDef>", into = "Vec<OptionDef>")]
pub struct Options(Vec<OptionDef>);

impl Options {
    /// Refuses a tree that would mean two things or nothing: a variable or a
    /// feature named twice, a slider with no range, a select whose default is
    /// not among its choices.
    pub fn new(options: Vec<OptionDef>) -> Result<Self, String> {
        let mut seen = Seen::default();
        options
            .iter()
            .try_for_each(|option| check(option, &mut seen))?;
        Ok(Options(options))
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub fn as_slice(&self) -> &[OptionDef] {
        &self.0
    }
}

impl TryFrom<Vec<OptionDef>> for Options {
    type Error = String;

    fn try_from(options: Vec<OptionDef>) -> Result<Self, Self::Error> {
        Options::new(options)
    }
}

impl From<Options> for Vec<OptionDef> {
    fn from(options: Options) -> Self {
        options.0
    }
}

/// The names taken so far. A variable and a feature are named apart, since
/// nothing reads one where it reads the other.
#[derive(Default)]
struct Seen<'a> {
    vars: BTreeSet<&'a str>,
    features: BTreeSet<&'a str>,
}

fn check<'a>(option: &'a OptionDef, seen: &mut Seen<'a>) -> Result<(), String> {
    let name = option.name();
    if name.is_empty() {
        return Err("an option has an empty name".to_owned());
    }
    let (taken, what) = match option {
        OptionDef::Feature { .. } => (&mut seen.features, "feature"),
        _ => (&mut seen.vars, "variable"),
    };
    if !taken.insert(name) {
        return Err(format!("{what} `{name}` is an option twice"));
    }

    match option {
        OptionDef::Slider {
            min,
            max,
            step,
            default,
            ..
        } => {
            if ![min, max, step, default].iter().all(|n| n.is_finite()) {
                return Err(format!("slider `{name}` has a number that is not finite"));
            }
            if min >= max {
                return Err(format!("slider `{name}` has no range: {min} to {max}"));
            }
            if *step <= 0.0 {
                return Err(format!("slider `{name}` has a step of {step}"));
            }
            if default < min || default > max {
                return Err(format!(
                    "the default of slider `{name}`, {default}, is outside {min} to {max}"
                ));
            }
        }
        OptionDef::Select {
            choices, default, ..
        } => {
            let mut values = BTreeSet::new();
            if let Some(twice) = choices.iter().find(|c| !values.insert(c.value.as_str())) {
                return Err(format!("select `{name}` offers `{}` twice", twice.value));
            }
            if !values.contains(default.as_str()) {
                return Err(format!(
                    "the default of select `{name}`, `{default}`, is not one of its choices"
                ));
            }
        }
        OptionDef::Feature { options, .. } => {
            options.iter().try_for_each(|child| check(child, seen))?;
        }
        OptionDef::Text { .. } | OptionDef::File { .. } | OptionDef::Directory { .. } => {}
    }
    Ok(())
}
