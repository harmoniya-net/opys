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

describe('an option', () => {
  it('is its kind, its name, and its fields in one object', () => {
    expect(
      slider('xmx', {
        title: 'RAM',
        subtitle: 'How much the game gets',
        unit: 'MB',
        ...RANGE,
      }),
    ).toEqual({
      slider: 'xmx',
      ...RANGE,
      title: 'RAM',
      subtitle: 'How much the game gets',
      unit: 'MB',
    });
    expect(
      text('server', {
        title: 'Server',
        placeholder: 'play.example.net',
        default: 'localhost',
      }),
    ).toEqual({
      text: 'server',
      title: 'Server',
      placeholder: 'play.example.net',
      default: 'localhost',
    });
    expect(file('skin', { title: 'Skin' })).toEqual({
      file: 'skin',
      title: 'Skin',
    });
    expect(directory('java_home', { title: 'Java' })).toEqual({
      directory: 'java_home',
      title: 'Java',
    });
  });

  it('a select offers what it was given, in order, and starts on the first', () => {
    const choices = { low: 'Low', high: 'High' };
    expect(select('preset', { title: 'Graphics', choices })).toEqual({
      select: 'preset',
      title: 'Graphics',
      choices: [
        { value: 'low', label: 'Low' },
        { value: 'high', label: 'High' },
      ],
      default: 'low',
    });
    expect(
      select('preset', { title: 'Graphics', choices, default: 'high' }),
    ).toMatchObject({ default: 'high' });
    // @ts-expect-error: a default is one of the choices
    select('preset', { title: 'Graphics', choices, default: 'ultra' });
  });

  it('a feature holds the options that only matter while it is on', () => {
    expect(
      feature('custom_java', {
        title: 'Custom Java',
        default: true,
        options: options()
          .directory('java_home', { title: 'Java folder' })
          .feature('java_console', { title: 'Console' }),
      }),
    ).toEqual({
      feature: 'custom_java',
      title: 'Custom Java',
      default: true,
      options: [
        { directory: 'java_home', title: 'Java folder' },
        { feature: 'java_console', title: 'Console' },
      ],
    });
    // One that holds nothing says nothing of it.
    expect(feature('fullscreen', { title: 'Fullscreen' })).toEqual({
      feature: 'fullscreen',
      title: 'Fullscreen',
    });
    expect(feature('fullscreen', { title: 'Fullscreen', options: [] })).toEqual(
      { feature: 'fullscreen', title: 'Fullscreen' },
    );
  });

  it('takes only the fields of its kind, and its title', () => {
    // @ts-expect-error: a unit is a slider's
    select('preset', { title: 'Graphics', choices: {}, unit: 'MB' });
    // @ts-expect-error: a slider's range has no default worth guessing
    slider('xmx', { title: 'RAM', min: 1, max: 2, step: 1 });
    // @ts-expect-error: every option has a title
    file('skin', {});
  });

  it('takes any text as a string or language to text', () => {
    const preset = select('preset', {
      title: { en: 'Graphics', uk: 'Графіка' },
      subtitle: 'Shaders aside',
      choices: { low: { en: 'Low', uk: 'Низька' }, high: 'High' },
      default: 'high',
    });
    expect(preset).toEqual({
      select: 'preset',
      title: { en: 'Graphics', uk: 'Графіка' },
      subtitle: 'Shaders aside',
      choices: [
        { value: 'low', label: { en: 'Low', uk: 'Низька' } },
        { value: 'high', label: 'High' },
      ],
      default: 'high',
    });
    expect(
      slider('xmx', { title: 'RAM', unit: { en: 'MB', uk: 'МБ' }, ...RANGE }),
    ).toMatchObject({ unit: { en: 'MB', uk: 'МБ' } });
    expect(
      text('server', { title: 'Server', placeholder: { en: 'none' } }),
    ).toMatchObject({ placeholder: { en: 'none' } });
  });
});

describe('a list of options written as one chain', () => {
  it('adds each option to the end, as the function of its kind makes it', () => {
    const list = options()
      .slider('xmx', { title: 'RAM', unit: 'MB', ...RANGE })
      .select('preset', {
        title: 'Graphics',
        choices: { low: 'Low', high: 'High' },
        default: 'high',
      })
      .text('server', { title: 'Server', placeholder: 'play.example.net' })
      .file('skin', { title: 'Skin' })
      .directory('saves', { title: 'Saves' })
      .feature('custom_java', {
        title: 'Custom Java',
        default: true,
        options: [directory('java_home', { title: 'Java folder' })],
      });
    expect(optionDefs(list)).toEqual([
      slider('xmx', { title: 'RAM', unit: 'MB', ...RANGE }),
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
      .file('skin', { title: 'Skin' })
      .feature('fullscreen', {
        title: 'Fullscreen',
        options: options().text('mode', { title: 'Mode' }),
      });
    const listed = [
      file('skin', { title: 'Skin' }),
      feature('fullscreen', {
        title: 'Fullscreen',
        options: [text('mode', { title: 'Mode' })],
      }),
    ];
    expect(optionDefs(chained)).toEqual(optionDefs(listed));
  });

  it('takes an option already spelled as a head spells it', () => {
    expect(
      optionDefs([
        { file: 'skin', title: 'Skin' },
        text('mode', { title: 'Mode' }),
      ]),
    ).toEqual([
      { file: 'skin', title: 'Skin' },
      { text: 'mode', title: 'Mode' },
    ]);
  });

  it('is a value: adding to a list leaves it as it was', () => {
    const one = options().file('skin', { title: 'Skin' });
    const two = one.text('mode', { title: 'Mode' });
    expect(optionDefs(one)).toHaveLength(1);
    expect(optionDefs(two)).toHaveLength(2);
    expect(optionDefs(options())).toEqual([]);
  });
});
