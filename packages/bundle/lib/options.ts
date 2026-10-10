/**
 * A bundle's options: what whoever launches it may choose.
 *
 * `OptionDef` is how one is spelled in a head. The rest of this file is how
 * a config writes one: what an option cannot do without goes in the call,
 * and everything else is chained after it.
 *
 * ```js
 * options()
 *   .slider('xmx', { min: 1024, max: 16384, step: 512, default: 4096 })
 *     .title('RAM')
 *     .unit('MB')
 *   .feature('custom_java', (o) => o.directory('java_home').title('Java folder'))
 *     .title('Custom Java')
 * ```
 *
 * A chain is a value: every call returns a new one and changes nothing.
 */

/** One value a `select` offers, and what to call it. */
export interface Choice {
  readonly value: string;
  readonly label: string;
}

interface Labelled {
  readonly title: string;
  readonly subtitle?: string;
}

interface SliderFields {
  readonly slider: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly default: number;
  readonly unit?: string;
}

interface SelectFields {
  readonly select: string;
  readonly choices: readonly Choice[];
  /** The `value` of one of `choices`. */
  readonly default: string;
}

interface TextFields {
  readonly text: string;
  readonly placeholder?: string;
  readonly default?: string;
}

interface FileFields {
  readonly file: string;
}

interface DirectoryFields {
  readonly directory: string;
}

interface FeatureFields {
  readonly feature: string;
  /** Whether the feature starts switched on. Off unless said. */
  readonly default?: boolean;
  readonly options?: readonly OptionDef[];
}

/**
 * One option of a bundle, as its head spells it. Told apart by which field
 * is present, and that field holds the name: the variable the option fills
 * or, for a `feature`, the feature it switches. A feature holds the options
 * that only matter while it is on.
 */
export type OptionDef =
  | (SliderFields & Labelled)
  | (SelectFields & Labelled)
  | (TextFields & Labelled)
  | (FileFields & Labelled)
  | (DirectoryFields & Labelled)
  | (FeatureFields & Labelled);

/** An option still being written: it may not have been given a title yet. */
type Draft<F> = F & Partial<Labelled>;

type AnyDraft =
  | Draft<SliderFields>
  | Draft<SelectFields>
  | Draft<TextFields>
  | Draft<FileFields>
  | Draft<DirectoryFields>
  | Draft<FeatureFields>;

/** One option written as a chain. */
export interface OptionChain {
  readonly draft: AnyDraft;
}

/** What `title` and `subtitle` are chained onto, whatever the kind. */
interface LabelSteps<S> {
  /** What the option is called on the settings screen. Every option has one. */
  title(title: string): S;
  /** A line under the title. */
  subtitle(subtitle: string): S;
}

interface SliderSteps<S> extends LabelSteps<S> {
  /** What the number counts, shown beside it: `'MB'`. */
  unit(unit: string): S;
}

interface SelectSteps<S, V extends string> extends LabelSteps<S> {
  /** The choice it starts on. The first one unless said. */
  default(value: V): S;
}

interface TextSteps<S> extends LabelSteps<S> {
  /** What an empty field shows. */
  placeholder(placeholder: string): S;
  default(value: string): S;
}

interface FeatureSteps<S> extends LabelSteps<S> {
  /** Whether it starts switched on. Off unless said. */
  default(on: boolean): S;
  /** The options that only matter while the feature is on. */
  options(...options: readonly (OptionsInput | OptionChain | OptionDef)[]): S;
}

/**
 * The steps of each kind, over whatever a step should return: the option
 * itself when it stands alone, the list when it was added to one.
 */
const labelSteps = <D extends Partial<Labelled>, S>(
  draft: D,
  wrap: (draft: D) => S,
): LabelSteps<S> => ({
  title: (title) => wrap({ ...draft, title }),
  subtitle: (subtitle) => wrap({ ...draft, subtitle }),
});

const sliderSteps = <S>(
  draft: Draft<SliderFields>,
  wrap: (draft: Draft<SliderFields>) => S,
): SliderSteps<S> => ({
  ...labelSteps(draft, wrap),
  unit: (unit) => wrap({ ...draft, unit }),
});

const selectSteps = <S, V extends string>(
  draft: Draft<SelectFields>,
  wrap: (draft: Draft<SelectFields>) => S,
): SelectSteps<S, V> => ({
  ...labelSteps(draft, wrap),
  default: (value) => wrap({ ...draft, default: value }),
});

const textSteps = <S>(
  draft: Draft<TextFields>,
  wrap: (draft: Draft<TextFields>) => S,
): TextSteps<S> => ({
  ...labelSteps(draft, wrap),
  placeholder: (placeholder) => wrap({ ...draft, placeholder }),
  default: (value) => wrap({ ...draft, default: value }),
});

const featureSteps = <S>(
  draft: Draft<FeatureFields>,
  wrap: (draft: Draft<FeatureFields>) => S,
): FeatureSteps<S> => ({
  ...labelSteps(draft, wrap),
  default: (on) => wrap({ ...draft, default: on }),
  options: (...options) =>
    wrap({ ...draft, options: options.flatMap(optionDefs) }),
});

export interface SliderOption extends OptionChain, SliderSteps<SliderOption> {}
export interface SelectOption<V extends string = string>
  extends OptionChain, SelectSteps<SelectOption<V>, V> {}
export interface TextOption extends OptionChain, TextSteps<TextOption> {}
export interface PathOption extends OptionChain, LabelSteps<PathOption> {}
export interface FeatureOption
  extends OptionChain, FeatureSteps<FeatureOption> {}

/** A slider's numbers: none of them has a default worth guessing. */
export interface SliderRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly default: number;
}

const sliderDraft = (
  name: string,
  range: SliderRange,
): Draft<SliderFields> => ({
  slider: name,
  min: range.min,
  max: range.max,
  step: range.step,
  default: range.default,
});

/**
 * `{ low: 'Low', high: 'High' }`, value to label, in the order written. A
 * value that looks like a whole number is the exception: JavaScript lists
 * those first and in numeric order, whatever order they were written in.
 */
const selectDraft = (
  name: string,
  choices: Readonly<Record<string, string>>,
): Draft<SelectFields> => {
  const list = Object.entries(choices).map(([value, label]) => ({
    value,
    label,
  }));
  return { select: name, choices: list, default: list[0]?.value ?? '' };
};

const sliderOption = (draft: Draft<SliderFields>): SliderOption => ({
  draft,
  ...sliderSteps(draft, sliderOption),
});

const selectOption = <V extends string>(
  draft: Draft<SelectFields>,
): SelectOption<V> => ({
  draft,
  ...selectSteps<SelectOption<V>, V>(draft, selectOption),
});

const textOption = (draft: Draft<TextFields>): TextOption => ({
  draft,
  ...textSteps(draft, textOption),
});

const fileOption = (draft: Draft<FileFields>): PathOption => ({
  draft,
  ...labelSteps(draft, fileOption),
});

const directoryOption = (draft: Draft<DirectoryFields>): PathOption => ({
  draft,
  ...labelSteps(draft, directoryOption),
});

const featureOption = (draft: Draft<FeatureFields>): FeatureOption => ({
  draft,
  ...featureSteps(draft, featureOption),
});

/** A number between `min` and `max`, into the variable `name`. */
export const slider = (name: string, range: SliderRange): SliderOption =>
  sliderOption(sliderDraft(name, range));

/** One of `choices`, value to label, into the variable `name`. */
export const select = <const C extends Readonly<Record<string, string>>>(
  name: string,
  choices: C,
): SelectOption<keyof C & string> => selectOption(selectDraft(name, choices));

/** A line of text, into the variable `name`. */
export const text = (name: string): TextOption => textOption({ text: name });

/** The path of a file on the launching machine, into the variable `name`. */
export const file = (name: string): PathOption => fileOption({ file: name });

/** The path of a directory on the launching machine, into the variable `name`. */
export const directory = (name: string): PathOption =>
  directoryOption({ directory: name });

/**
 * A switch for the feature `name`. Its `options` are the ones that only
 * matter while it is on.
 */
export const feature = (name: string): FeatureOption =>
  featureOption({ feature: name });

/**
 * A list of options written as one chain. A kind adds an option, and the
 * steps after it are that option's, until the next kind.
 */
export interface OptionList {
  readonly drafts: readonly AnyDraft[];
  /** A number between `min` and `max`, into the variable `name`. */
  slider(name: string, range: SliderRange): SliderInList;
  /** One of `choices`, value to label, into the variable `name`. */
  select<const C extends Readonly<Record<string, string>>>(
    name: string,
    choices: C,
  ): SelectInList<keyof C & string>;
  /** A line of text, into the variable `name`. */
  text(name: string): TextInList;
  /** The path of a file on the launching machine, into the variable `name`. */
  file(name: string): PathInList;
  /** The path of a directory on the launching machine, into the variable `name`. */
  directory(name: string): PathInList;
  /**
   * A switch for the feature `name`. `options` adds to an empty list the
   * options that only matter while it is on.
   */
  feature(
    name: string,
    options?: (list: OptionList) => OptionsInput,
  ): FeatureInList;
}

export interface SliderInList extends OptionList, SliderSteps<SliderInList> {}
export interface SelectInList<V extends string = string>
  extends OptionList, SelectSteps<SelectInList<V>, V> {}
export interface TextInList extends OptionList, TextSteps<TextInList> {}
export interface PathInList extends OptionList, LabelSteps<PathInList> {}
export interface FeatureInList
  extends OptionList, FeatureSteps<FeatureInList> {}

/**
 * The list with `draft` as its last option, and that option's steps: each
 * replaces the last option and leaves the ones before it alone.
 */
const sliderIn = (
  before: readonly AnyDraft[],
  draft: Draft<SliderFields>,
): SliderInList => ({
  ...listOf([...before, draft]),
  ...sliderSteps(draft, (next) => sliderIn(before, next)),
});

const selectIn = <V extends string>(
  before: readonly AnyDraft[],
  draft: Draft<SelectFields>,
): SelectInList<V> => ({
  ...listOf([...before, draft]),
  ...selectSteps<SelectInList<V>, V>(draft, (next) => selectIn(before, next)),
});

const textIn = (
  before: readonly AnyDraft[],
  draft: Draft<TextFields>,
): TextInList => ({
  ...listOf([...before, draft]),
  ...textSteps(draft, (next) => textIn(before, next)),
});

const pathIn = <D extends Draft<FileFields> | Draft<DirectoryFields>>(
  before: readonly AnyDraft[],
  draft: D,
): PathInList => ({
  ...listOf([...before, draft]),
  ...labelSteps(draft, (next) => pathIn(before, next)),
});

const featureIn = (
  before: readonly AnyDraft[],
  draft: Draft<FeatureFields>,
): FeatureInList => ({
  ...listOf([...before, draft]),
  ...featureSteps(draft, (next) => featureIn(before, next)),
});

const listOf = (drafts: readonly AnyDraft[]): OptionList => ({
  drafts,
  slider: (name, range) => sliderIn(drafts, sliderDraft(name, range)),
  select: (name, choices) => selectIn(drafts, selectDraft(name, choices)),
  text: (name) => textIn(drafts, { text: name }),
  file: (name) => pathIn(drafts, { file: name }),
  directory: (name) => pathIn(drafts, { directory: name }),
  feature: (name, options) =>
    featureIn(drafts, {
      feature: name,
      ...(options ? { options: optionDefs(options(listOf([]))) } : {}),
    }),
});

/** An empty list of options, to chain onto. */
export const options = (): OptionList => listOf([]);

/**
 * Options as a config may write them: one chain, or a list whose entries are
 * each a chain or already an `OptionDef`.
 */
export type OptionsInput = OptionList | readonly (OptionChain | OptionDef)[];

const nameOf = (draft: AnyDraft): string =>
  'slider' in draft
    ? draft.slider
    : 'select' in draft
      ? draft.select
      : 'text' in draft
        ? draft.text
        : 'file' in draft
          ? draft.file
          : 'directory' in draft
            ? draft.directory
            : draft.feature;

/**
 * A title is chained, so it is the one thing an option needs that the
 * compiler cannot ask for. It is asked for here, by name.
 */
const titled = (draft: AnyDraft): OptionDef => {
  const { title } = draft;
  if (title === undefined) {
    throw new Error(
      `option '${nameOf(draft)}' has no title: add .title('…') to it`,
    );
  }
  return { ...draft, title };
};

/** `Array.isArray` does not narrow a readonly array out of a union. */
const isList = (
  input: OptionsInput | OptionChain | OptionDef,
): input is readonly (OptionChain | OptionDef)[] => Array.isArray(input);

/** The options of a config as a head spells them. */
export function optionDefs(
  input: OptionsInput | OptionChain | OptionDef,
): OptionDef[] {
  if (isList(input)) return input.flatMap(optionDefs);
  if ('drafts' in input) return input.drafts.map(titled);
  if ('draft' in input) return [titled(input.draft)];
  return [input];
}
