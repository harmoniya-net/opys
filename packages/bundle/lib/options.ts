/**
 * A bundle's options: what whoever launches it may choose.
 *
 * `OptionDef` is how one is spelled in a head. The rest of this file is how
 * a config writes one: a kind, the name it fills, and its fields in one
 * object, so that what an option cannot do without — a title, a slider's
 * range — is a compile error when it is left out.
 *
 * ```js
 * options()
 *   .slider('xmx', { title: 'RAM', unit: 'MB', min: 1024, max: 16384, step: 512, default: 4096 })
 *   .feature('custom_java', {
 *     title: 'Custom Java',
 *     options: options().directory('java_home', { title: 'Java folder' }),
 *   })
 * ```
 *
 * A list is a value: every call returns a new one and changes nothing.
 */

/**
 * Text a player reads: a string in the head's `locale`, or language to text,
 * `{ en: 'RAM', uk: "Пам'ять" }`, which must hold that locale.
 */
export type Localized = string | Readonly<Record<string, string>>;

/** One value a `select` offers, and what to call it. */
export interface Choice {
  readonly value: string;
  readonly label: Localized;
}

interface Labelled {
  /** What the option is called on the settings screen. Every option has one. */
  readonly title: Localized;
  /** A line under the title. */
  readonly subtitle?: Localized;
}

/** A slider's own fields. None of its numbers has a default worth guessing. */
export interface SliderFields extends Labelled {
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly default: number;
  /** What the number counts, shown beside it: `'MB'`. */
  readonly unit?: Localized;
}

/**
 * A select's own fields. `choices` is value to label, in the order written:
 * `{ low: 'Low', high: 'High' }`. A value that looks like a whole number is
 * the exception: JavaScript lists those first and in numeric order, whatever
 * order they were written in.
 */
export interface SelectFields<
  C extends Readonly<Record<string, Localized>>,
> extends Labelled {
  readonly choices: C;
  /** The choice it starts on. The first one unless said. */
  readonly default?: keyof C & string;
}

export interface TextFields extends Labelled {
  /** What an empty field shows. */
  readonly placeholder?: Localized;
  readonly default?: string;
}

export type PathFields = Labelled;

export interface FeatureFields extends Labelled {
  /** Whether the feature starts switched on. Off unless said. */
  readonly default?: boolean;
  /** The options that only matter while the feature is on. */
  readonly options?: OptionsInput;
}

/**
 * One option of a bundle, as its head spells it. Told apart by which field
 * is present, and that field holds the name: the variable the option fills
 * or, for a `feature`, the feature it switches. A feature holds the options
 * that only matter while it is on.
 */
export type OptionDef =
  | ({ readonly slider: string } & SliderFields)
  | ({
      readonly select: string;
      readonly choices: readonly Choice[];
      /** The `value` of one of `choices`. */
      readonly default: string;
    } & Labelled)
  | ({ readonly text: string } & TextFields)
  | ({ readonly file: string } & PathFields)
  | ({ readonly directory: string } & PathFields)
  | ({
      readonly feature: string;
      readonly default?: boolean;
      readonly options?: readonly OptionDef[];
    } & Labelled);

/** A number between `min` and `max`, into the variable `name`. */
export const slider = (name: string, fields: SliderFields): OptionDef => ({
  slider: name,
  ...fields,
});

/** One of `choices`, value to label, into the variable `name`. */
export const select = <const C extends Readonly<Record<string, Localized>>>(
  name: string,
  fields: SelectFields<C>,
): OptionDef => {
  const { choices, default: start, ...labelled } = fields;
  const list = Object.entries(choices).map(([value, label]) => ({
    value,
    label,
  }));
  return {
    select: name,
    ...labelled,
    choices: list,
    default: start ?? list[0]?.value ?? '',
  };
};

/** A line of text, into the variable `name`. */
export const text = (name: string, fields: TextFields): OptionDef => ({
  text: name,
  ...fields,
});

/** The path of a file on the launching machine, into the variable `name`. */
export const file = (name: string, fields: PathFields): OptionDef => ({
  file: name,
  ...fields,
});

/** The path of a directory on the launching machine, into the variable `name`. */
export const directory = (name: string, fields: PathFields): OptionDef => ({
  directory: name,
  ...fields,
});

/**
 * A switch for the feature `name`. Its `options` are the ones that only
 * matter while it is on; a feature that holds none says nothing of them.
 */
export const feature = (name: string, fields: FeatureFields): OptionDef => {
  const { options: held, ...rest } = fields;
  const defs = held && optionDefs(held);
  return {
    feature: name,
    ...rest,
    ...(defs && defs.length > 0 ? { options: defs } : {}),
  };
};

/**
 * A list of options written as one chain: each kind adds an option to the
 * end, and takes what the function of the same name takes.
 */
export interface OptionList {
  readonly defs: readonly OptionDef[];
  slider(name: string, fields: SliderFields): OptionList;
  select<const C extends Readonly<Record<string, Localized>>>(
    name: string,
    fields: SelectFields<C>,
  ): OptionList;
  text(name: string, fields: TextFields): OptionList;
  file(name: string, fields: PathFields): OptionList;
  directory(name: string, fields: PathFields): OptionList;
  feature(name: string, fields: FeatureFields): OptionList;
}

const listOf = (defs: readonly OptionDef[]): OptionList => ({
  defs,
  slider: (name, fields) => listOf([...defs, slider(name, fields)]),
  select: (name, fields) => listOf([...defs, select(name, fields)]),
  text: (name, fields) => listOf([...defs, text(name, fields)]),
  file: (name, fields) => listOf([...defs, file(name, fields)]),
  directory: (name, fields) => listOf([...defs, directory(name, fields)]),
  feature: (name, fields) => listOf([...defs, feature(name, fields)]),
});

/** An empty list of options, to chain onto. */
export const options = (): OptionList => listOf([]);

/** Options as a config may write them: one chain, or a list of options. */
export type OptionsInput = OptionList | readonly OptionDef[];

/** `Array.isArray` does not narrow a readonly array out of a union. */
const isList = (input: OptionsInput): input is readonly OptionDef[] =>
  Array.isArray(input);

/** The options of a config as a head spells them. */
export const optionDefs = (input: OptionsInput): OptionDef[] => [
  ...(isList(input) ? input : input.defs),
];
