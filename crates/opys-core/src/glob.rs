//! Tiny glob → Regex converter. Frozen semantics — see TS `core/lib/glob.ts`.
//!
//! `*` non-separator chars, `**` any chars, `?` one non-sep, `{a,b}` flat alt.
//! Separator is `/`; callers normalize Windows backslashes.

use regex::Regex;

const STAR: &str = "__OPYS_GLOBSTAR_";

fn is_rx_meta(c: char) -> bool {
    matches!(c, '.' | '+' | '^' | '$' | '(' | ')' | '|' | '[' | ']' | '\\')
}

fn is_alt_meta(c: char) -> bool {
    matches!(
        c,
        '.' | '+' | '^' | '$' | '(' | ')' | '|' | '[' | ']' | '\\' | '*' | '?' | '{' | '}'
    )
}

/// Compile a glob to an anchored `Regex`. Pattern source is `^…$`.
pub fn glob_to_regex(glob: &str) -> Regex {
    let mut s = glob.to_owned();
    let null = '\0';
    // Most-specific-first so the sentinels don't overlap.
    s = replace_pattern(&s, r"/\*\*$", &format!("{null}{STAR}END{null}"));
    s = replace_pattern(&s, r"/\*\*/", &format!("{null}{STAR}MID{null}"));
    s = replace_pattern(&s, r"^\*\*/", &format!("{null}{STAR}START{null}"));
    s = replace_pattern(&s, r"\*\*", &format!("{null}{STAR}BARE{null}"));

    let mut out = String::with_capacity(s.len() * 2);
    let chars: Vec<char> = s.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let ch = chars[i];
        if ch == '\0' {
            let close = chars[i + 1..]
                .iter()
                .position(|&c| c == '\0')
                .map(|p| p + i + 1)
                .expect("matching sentinel");
            let tag: String = chars[i + 1 + STAR.len()..close].iter().collect();
            out.push_str(match tag.as_str() {
                "END" => "(?:/.*)?",
                "MID" => "(?:/.*)?/",
                "START" => "(?:.*/)?",
                _ => ".*", // BARE
            });
            i = close + 1;
        } else if ch == '*' {
            out.push_str("[^/]*");
            i += 1;
        } else if ch == '?' {
            out.push_str("[^/]");
            i += 1;
        } else if ch == '{' {
            if let Some(end) = chars[i..].iter().position(|&c| c == '}') {
                let end = end + i;
                let parts: String = chars[i + 1..end].iter().collect();
                let alts: Vec<String> = parts
                    .split(',')
                    .map(|p| {
                        let mut esc = String::with_capacity(p.len() * 2);
                        for c in p.chars() {
                            if is_alt_meta(c) {
                                esc.push('\\');
                            }
                            esc.push(c);
                        }
                        esc
                    })
                    .collect();
                out.push_str("(?:");
                out.push_str(&alts.join("|"));
                out.push(')');
                i = end + 1;
            } else {
                out.push_str("\\{");
                i += 1;
            }
        } else if is_rx_meta(ch) {
            out.push('\\');
            out.push(ch);
            i += 1;
        } else {
            out.push(ch);
            i += 1;
        }
    }
    Regex::new(&format!("^{out}$")).expect("valid glob → regex")
}

fn replace_pattern(haystack: &str, pattern: &str, replacement: &str) -> String {
    Regex::new(pattern).unwrap().replace_all(haystack, replacement).into_owned()
}

/// Longest non-glob prefix, truncated to the last `/`.
pub fn glob_base(glob: &str) -> String {
    let mut last_slash: Option<usize> = None;
    for (i, ch) in glob.char_indices() {
        if matches!(ch, '*' | '?' | '{' | '[') {
            break;
        }
        if ch == '/' {
            last_slash = Some(i);
        }
    }
    match last_slash {
        Some(i) => glob[..i].to_owned(),
        None => String::new(),
    }
}
