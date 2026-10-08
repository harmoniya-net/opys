# Writing these pages

Read `guide/getting-started.md` and `guide/concepts.md` first. They set the
voice; a new page should read as if the same person wrote it.

## Rules

1. **Nothing is invented.** Every option, default, function name, variable
   name, flag and behaviour on a page is something you read in the source
   (`packages/*/lib`, `crates/*/src`) or in an existing README. If the source
   does not say, the page does not say. If you could not confirm something
   you think the page needs, leave an HTML comment
   `<!-- UNVERIFIED: … -->` at that spot instead of guessing.
2. **Write for the reader named on your assignment**: a pack author, a
   launcher developer, an implementer. A pack author does not care which
   crate something lives in.
3. **Lead with what the reader does**, then explain. A page opens with one or
   two sentences saying what it covers and for whom, not with history.
4. **Plain, direct sentences.** No marketing ("powerful", "seamless",
   "simply"), no filler, no emoji. Say "opys" in lower case. Second person
   ("you") for the reader. No long dashes, in either language: write
   the sentence so it does not need one.
5. **Explain a term the first time it appears**, or link to
   `/guide/concepts`. Use one name for one thing throughout.
6. **Examples are real.** A complete config goes in
   `examples/<name>/opys.config.mjs` and is included with
   `<<< @/examples/<name>/opys.config.mjs`; `npm run examples` builds every
   one of them. Fragments may be inline. Do not show an option you have not
   seen in the source.
7. **Tables for facts you look up** (options, flags, variables, codes);
   prose for anything that needs a reason.
8. **Link, do not repeat.** If another page owns a topic, one sentence and a
   link. Links are absolute from the site root without an extension
   (`/guide/java`) or relative (`./java`).
9. Standard VitePress Markdown: one `#` title, `##` sections, `::: tip`,
   `::: warning`. Wrap prose at about 80 columns.
10. Do not edit `.vitepress/config.ts`, other people's pages, or anything
    outside `docs/`.

## Translating

Every page exists in English at `<path>.md` and in Ukrainian at
`uk/<path>.md`. Change the English first, then the same place in the
translation. `npm run i18n` fails when a page has no translation or its
headings have fallen out of step; `node i18n.mjs --fix` gives each translated
heading the anchor its English heading has, so a `#anchor` link works in both
languages and nobody computes one by hand. That is why a translation keeps the
same headings in the same order.

Write natural, idiomatic Ukrainian, the way a good Ukrainian technical writer
would write the page from scratch, not a word-for-word rendering. Use «ви»
(lower case) for the reader. No Russianisms or calques: «наступний» only for
what comes next, not for "the following" (use «такий», «нижче»); «завдяки»,
not «дякуючи»; «брати участь»; «будь-який», not «любий»; «згідно з»;
active constructions rather than «-ться» passives where a doer is known; no
active participles in «-учий/-ючий». Use Ukrainian punctuation: «лапки-ялинки»
for quoted prose and the apostrophe ’ in words (комп’ютер).

**Never use a long dash.** Neither «—» nor «–» may appear anywhere in your
output outside a code block: not as a copula («opys — це…»), not for an
aside, not in a list item or a table cell, not for a range. Write the sentence
so it does not need one: «opys є…» or «opys: це…» recast as a plain sentence,
a comma, a colon, parentheses, or two sentences. A range is written with
words («від 1.17 до 1.20.4») or a hyphen inside a code span. An empty table
cell stays empty. Before you finish a page, search it for «—» and «–» and
rewrite every sentence that has one.

## Do not translate

- Anything in a code block, inline code, a file name, a path, a command, a
  flag, a variable or option name, an identifier, a URL. Translate the
  comments inside a code block (`// …`, `# …`) but not the code.
- Product and project names: opys, Minecraft, Forge, NeoForge, Fabric,
  Cleanroom, lwjgl3ify, horno, Modrinth, CurseForge, GitHub, Java, Temurin,
  Zulu, GraalVM, VitePress, npm, Node.js.
- `<<< @/examples/…` include lines: copy them exactly. They are resolved from
  the site root and work unchanged.
- Frontmatter keys, `:::` container types (`tip`, `warning`, `info`,
  `details`); translate a container's title if it has one.

## Links

- A link to a page of this site gets the `/uk` prefix when it is absolute:
  `/guide/java` → `/uk/guide/java`, `/guide/java#vendors` →
  `/uk/guide/java#vendors`. A relative link (`./java`, `../guide/java`) stays
  as written. External links stay as written.
- Leave every anchor (`#some-heading`) exactly as it is in English, in
  links and anywhere else. Do not add `{#…}` ids to headings. After
  translation a script gives each Ukrainian heading the id of the English
  heading in the same position, so English anchors keep working — which is
  also why the headings must stay in the same order and number.

## Terms — use these, consistently

| English                                       | Ukrainian                                                              |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| manifest                                      | маніфест                                                               |
| bundle                                        | бандл                                                                  |
| artifact                                      | артефакт                                                               |
| blob                                          | блоб                                                                   |
| plugin                                        | плагін                                                                 |
| loader (mod loader)                           | завантажувач модів (on first use), then завантажувач                   |
| launcher                                      | лаунчер                                                                |
| runtime (the opys runtime)                    | рантайм                                                                |
| Java runtime                                  | середовище Java                                                        |
| build (verb / noun, of a manifest)            | збирати / збірка                                                       |
| a build (of Forge, a release)                 | збірка                                                                 |
| launch                                        | запускати / запуск                                                     |
| install / installation                        | встановлювати / інсталяція (the thing on disk), встановлення (the act) |
| config (file)                                 | конфігурація, файл конфігурації                                        |
| build machine / launch machine                | машина збирання / машина запуску                                       |
| launch-time values                            | значення під час запуску                                               |
| variable                                      | змінна                                                                 |
| rule / ruleset                                | правило / набір правил                                                 |
| shorthand                                     | скорочений запис                                                       |
| integrity (hash check)                        | цілісність                                                             |
| pin (a hash, a version)                       | фіксувати                                                              |
| resolve (a version, a link)                   | визначати; "fully resolved" — повністю визначений                      |
| asset(s) (game assets)                        | ресурси гри                                                            |
| asset layout                                  | розкладка ресурсів                                                     |
| library                                       | бібліотека                                                             |
| classpath                                     | classpath (leave in Latin)                                             |
| mod / modpack                                 | мод / модпак                                                           |
| overrides (modpack)                           | overrides (in code), «перевизначення» in prose                         |
| extract                                       | розпаковувати                                                          |
| sweep (phase)                                 | прибирання                                                             |
| scan / fetch / verify (phases)                | сканування / завантаження / перевірка                                  |
| exit code                                     | код завершення                                                         |
| troubleshooting                               | усунення проблем                                                       |
| upstream                                      | у першоджерелі / з боку авторів (pick by context)                      |
| mirror                                        | дзеркало                                                               |
| token                                         | токен                                                                  |
| offline mode                                  | офлайн-режим                                                           |
| discrete GPU                                  | дискретна відеокарта                                                   |
| head (of a bundle, `opys.json`)               | заголовок                                                              |
| pack (what a config builds)                   | модпак                                                                 |
| feature (a rule's `features`, `--feature`)    | ознака                                                                 |
| release (GitHub) / prerelease / release asset | реліз / пререліз / файл релізу                                         |
| fluent methods                                | ланцюжкові методи                                                      |
| receipt (horno)                               | квитанція                                                              |
| environment variable                          | змінна середовища                                                      |
| alias (`latest`, `recommended`, `best`)       | псевдонім                                                              |
| vendor (Java)                                 | постачальник                                                           |
| installer                                     | інсталятор                                                             |
| reader / writer (of the format)               | читач / записувач                                                      |
| entry (of a zip)                              | елемент                                                                |
| callback                                      | колбек                                                                 |
| binding (napi)                                | біндинг                                                                |
| crate                                         | крейт                                                                  |
| resolver                                      | резолвер                                                               |
| mapper                                        | мапер                                                                  |
| fold (a patch onto a base)                    | накладати, накладання                                                  |
| processor (of a Forge installer)              | процесор                                                               |
| glob                                          | glob-шаблон                                                            |
| provider                                      | провайдер                                                              |
| directory / folder                            | каталог / папка                                                        |
| working directory                             | робочий каталог                                                        |
| default                                       | типово, типове значення                                                |
| optional / required                           | необов’язковий / обов’язковий                                          |
| deprecated                                    | застарілий                                                             |
| reference implementation                      | еталонна реалізація                                                    |
| wire (format/type)                            | формат передавання                                                     |

The page titles used in the navigation are fixed; use exactly these as the
`#` title of the corresponding page: Перші кроки (getting-started), Основні
поняття (concepts), Файл конфігурації (config), Значення під час запуску
(run-client), Завантажувачі модів (loaders), Java (java), Моди та файли
(mods), Акаунти, сервери, відеокарти (extras), Публікація бандла
(publishing), Команда opys (cli), Усунення проблем (troubleshooting),
Встановлення і запуск (embedding), Прогрес (progress), Помилки (errors),
Змінні (vars), Бандл (bundle-format), Маніфест (manifest), Розкладки
ресурсів (asset-layouts), Написання плагіна (writing-a-plugin), API (api),
Архітектура (architecture), horno, Документи версій (metadata), Тестування
(testing), Плагіни (plugins/index). Plugin and package pages keep their
English title (`# Fabric`, `# @opys/core`, …).
