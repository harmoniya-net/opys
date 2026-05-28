use indexmap::IndexMap;
use regex::Regex;
use std::collections::HashSet;
use std::sync::OnceLock;

pub type VarMap = IndexMap<String, String>;

fn placeholder_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"\\\$\{|\$\{([^}\s]+)\}").unwrap())
}

fn replace_placeholders(template: &str, mut lookup: impl FnMut(&str) -> String) -> String {
    let mut out = String::with_capacity(template.len());
    let mut last = 0;
    for caps in placeholder_re().captures_iter(template) {
        let m = caps.get(0).unwrap();
        out.push_str(&template[last..m.start()]);
        if m.as_str() == "\\${" {
            out.push_str("${");
        } else if let Some(name) = caps.get(1) {
            out.push_str(&lookup(name.as_str()));
        } else {
            out.push_str(m.as_str());
        }
        last = m.end();
    }
    out.push_str(&template[last..]);
    out
}

/// Resolve every `${ref}` in `vars`. Circular references throw.
pub fn resolve_vars(vars: &VarMap) -> Result<VarMap, String> {
    let mut resolved: VarMap = IndexMap::new();
    let mut resolving: HashSet<String> = HashSet::new();

    fn go(
        key: &str,
        vars: &VarMap,
        resolved: &mut VarMap,
        resolving: &mut HashSet<String>,
    ) -> Result<String, String> {
        if let Some(v) = resolved.get(key) {
            return Ok(v.clone());
        }
        if resolving.contains(key) {
            return Err(format!("Circular variable reference: {key}"));
        }
        let Some(template) = vars.get(key) else {
            return Ok(format!("${{{key}}}"));
        };
        resolving.insert(key.to_owned());
        // Two-phase to satisfy borrow checker: first collect needed lookups,
        // then run replace. Simpler: just do a recursive replace with closure.
        let result = {
            let mut err: Option<String> = None;
            let s = replace_placeholders(template, |name| match go(name, vars, resolved, resolving)
            {
                Ok(v) => v,
                Err(e) => {
                    err = Some(e);
                    String::new()
                }
            });
            if let Some(e) = err {
                return Err(e);
            }
            s
        };
        resolving.remove(key);
        resolved.insert(key.to_owned(), result.clone());
        Ok(result)
    }

    let keys: Vec<String> = vars.keys().cloned().collect();
    for k in keys {
        go(&k, vars, &mut resolved, &mut resolving)?;
    }
    Ok(resolved)
}

/// Substitute resolved vars into `template`. Missing names stay as `${name}`.
pub fn interpolate(template: &str, vars: &VarMap) -> String {
    replace_placeholders(template, |name| {
        vars.get(name)
            .cloned()
            .unwrap_or_else(|| format!("${{{name}}}"))
    })
}
