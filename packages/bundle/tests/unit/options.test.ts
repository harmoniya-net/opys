import { describe, expect, it } from 'vitest';

import {
  directory,
  feature,
  file,
  optionDefs,
  options,
  select,
  slider,
  text,
} from '../../lib/index';

const RANGE = { min: 1024, max: 16384, step: 512, default: 4096 };

describe('an option written as a chain', () => {
  it('takes what it cannot do without in the call and the rest after it', () => {
    expect(
      optionDefs(
        slider('xmx', RANGE)
          .title('RAM')
          .subtitle('How much the game gets')
          .unit('MB'),
      ),
    ).toEqual([
      {
        slider: 'xmx',
        ...RANGE,
        title: 'RAM',
        subtitle: 'How much the game gets',
        unit: 'MB',
      },
    ]);
    expect(
      optionDefs(
        text('server')
          .title('Server')
          .placeholder('play.example.net')
          .default('localhost'),
      ),
    ).toEqual([
      {
        text: 'server',
        title: 'Server',
        placeholder: 'play.example.net',
        default: 'localhost',
      },
    ]);
    expect(optionDefs(file('skin').title('Skin'))).toEqual([
      { file: 'skin', title: 'Skin' },
    ]);
    expect(optionDefs(directory('java_home').title('Java'))).toEqual([
      { directory: 'java_home', title: 'Java' },
    ]);
  });

  it('a select offers what it was given, in order, and starts on the first', () => {
    const preset = select('preset', { low: 'Low', high: 'High' }).title(
      'Graphics',
    );
    expect(optionDefs(preset)).toEqual([
      {
        select: 'preset',
        title: 'Graphics',
        choices: [
          { value: 'low', label: 'Low' },
          { value: 'high', label: 'High' },
        ],
        default: 'low',
      },
    ]);
    expect(optionDefs(preset.default('high'))[0]).toMatchObject({
      default: 'high',
    });
    // @ts-expect-error: a default is one of the choices
    preset.default('ultra');
  });

  it('a feature holds the options that only matter while it is on', () => {
    expect(
      optionDefs(
        feature('custom_java')
          .title('Custom Java')
          .default(true)
          .options(
            directory('java_home').title('Java folder'),
            feature('java_console').title('Console'),
          ),
      ),
    ).toEqual([
      {
        feature: 'custom_java',
        title: 'Custom Java',
        default: true,
        options: [
          { directory: 'java_home', title: 'Java folder' },
          { feature: 'java_console', title: 'Console' },
        ],
      },
    ]);
    // One that holds nothing says nothing of it.
    expect(optionDefs(feature('fullscreen').title('Fullscreen'))).toEqual([
      { feature: 'fullscreen', title: 'Fullscreen' },
    ]);
  });

  it('is a value: a step returns a new option and leaves the old one', () => {
    const untitled = file('skin');
    const titled = untitled.title('Skin');
    expect(optionDefs(titled)).toEqual([{ file: 'skin', title: 'Skin' }]);
    expect(() => optionDefs(untitled)).toThrow(
      "option 'skin' has no title: add .title('…') to it",
    );
  });

  it('has only the steps of its kind', () => {
    // @ts-expect-error: a unit is a slider's
    expect(select('preset', { low: 'Low' }).unit).toBeUndefined();
    // @ts-expect-error: a slider's default is in its range
    expect(slider('xmx', RANGE).default).toBeUndefined();
    // @ts-expect-error: a file takes nothing but its name
    file('skin', { title: 'Skin' });
  });
});

describe('a list of options written as one chain', () => {
  it("a kind adds an option and the steps after it are that option's", () => {
    const list = options()
      .slider('xmx', RANGE)
      .title('RAM')
      .unit('MB')
      .select('preset', { low: 'Low', high: 'High' })
      .title('Graphics')
      .default('high')
      .text('server')
      .title('Server')
      .placeholder('play.example.net')
      .file('skin')
      .title('Skin')
      .directory('saves')
      .title('Saves')
      .feature('custom_java', (o) =>
        o.directory('java_home').title('Java folder'),
      )
      .title('Custom Java')
      .default(true);
    expect(optionDefs(list)).toEqual([
      { slider: 'xmx', ...RANGE, title: 'RAM', unit: 'MB' },
      {
        select: 'preset',
        title: 'Graphics',
        choices: [
          { value: 'low', label: 'Low' },
          { value: 'high', label: 'High' },
        ],
        default: 'high',
      },
      { text: 'server', title: 'Server', placeholder: 'play.example.net' },
      { file: 'skin', title: 'Skin' },
      { directory: 'saves', title: 'Saves' },
      {
        feature: 'custom_java',
        title: 'Custom Java',
        default: true,
        options: [{ directory: 'java_home', title: 'Java folder' }],
      },
    ]);
  });

  it('is the same list as the options written one by one', () => {
    const chained = options()
      .file('skin')
      .title('Skin')
      .feature('fullscreen')
      .title('Fullscreen')
      .options(text('mode').title('Mode'));
    const listed = [
      file('skin').title('Skin'),
      feature('fullscreen')
        .title('Fullscreen')
        .options(options().text('mode').title('Mode')),
    ];
    expect(optionDefs(chained)).toEqual(optionDefs(listed));
  });

  it('takes an option already spelled as a head spells it', () => {
    expect(
      optionDefs([{ file: 'skin', title: 'Skin' }, text('mode').title('Mode')]),
    ).toEqual([
      { file: 'skin', title: 'Skin' },
      { text: 'mode', title: 'Mode' },
    ]);
  });

  it('names the option that was left without a title', () => {
    expect(() =>
      optionDefs(options().file('skin').title('Skin').slider('xmx', RANGE)),
    ).toThrow("option 'xmx' has no title");
    expect(() =>
      optionDefs(options().feature('a', (o) => o.select('b', { x: 'X' }))),
    ).toThrow("option 'b' has no title");
    for (const untitled of [
      text('t'),
      directory('d'),
      feature('f'),
      select('s', {}),
    ]) {
      expect(() => optionDefs(untitled)).toThrow(/has no title/);
    }
  });

  it('is a value: adding to a list leaves it as it was', () => {
    const one = options().file('skin').title('Skin');
    const two = one.text('mode').title('Mode');
    expect(optionDefs(one)).toHaveLength(1);
    expect(optionDefs(two)).toHaveLength(2);
    expect(optionDefs(options())).toEqual([]);
  });

  it('has only the steps of the option just added', () => {
    const list = options().file('skin').title('Skin');
    // @ts-expect-error: a unit is a slider's
    expect(list.unit).toBeUndefined();
  });
});
