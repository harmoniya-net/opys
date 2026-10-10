import { defineConfig, type DefaultTheme } from 'vitepress';

// The site is written in English and translated into Ukrainian. Both
// languages have the same pages, so both are built from one navigation,
// `site`, with a table of labels each. The Ukrainian pages live under
// `/uk`, a page for a page.

const en = {
  basics: 'Basics',
  introduction: 'Introduction',
  config: 'The config',
  bundle: 'The bundle',
  cli: 'The CLI',
  launcher: 'Launcher integration',

  format: 'The format',
  overview: 'Overview',
  variables: 'Variables',
  rules: 'Rules',
  artifacts: 'Artifacts',
  launch: 'Launch',
  cleanup: 'Cleanup',
  bundleFile: 'The bundle file',

  plugins: 'Plugins',
  files: 'Local files',
  links: 'Files by link',
  minecraft: 'Minecraft',
  vanilla: 'Vanilla Minecraft',
  serverlist: 'Server list',
  authliberty: 'Custom auth server',
  loaders: 'Minecraft mod loaders',
  resources: 'Minecraft mod resources',
  java: 'Java',
  javaRuntime: 'Java runtime',
  dgpuj: 'Discrete GPU',
  writingPlugin: 'Writing a plugin',

  reference: 'Reference',
  troubleshooting: 'Troubleshooting',
  architecture: 'How opys is built',

  packages: 'Packages',
  packagesTrial: 'Packages (trial)',
  buildingPack: 'Building a pack',
  aLauncher: 'A launcher',
  anyPack: 'Any pack',
  mojangFormats: "Mojang's formats",
};

const uk: typeof en = {
  basics: 'Основи',
  introduction: 'Вступ',
  config: 'Конфігурація',
  bundle: 'Бандл',
  cli: 'Командний рядок',
  launcher: 'Інтеграція з лаунчером',

  format: 'Формат',
  overview: 'Огляд',
  variables: 'Змінні',
  rules: 'Правила',
  artifacts: 'Артефакти',
  launch: 'Запуск',
  cleanup: 'Очищення',
  bundleFile: 'Файл бандла',

  plugins: 'Плагіни',
  files: 'Локальні файли',
  links: 'Файли за посиланням',
  minecraft: 'Minecraft',
  vanilla: 'Ванільний Minecraft',
  serverlist: 'Список серверів',
  authliberty: 'Власний сервер автентифікації',
  loaders: 'Завантажувачі модів Minecraft',
  resources: 'Джерела модів Minecraft',
  java: 'Java',
  javaRuntime: 'Середовище Java',
  dgpuj: 'Дискретна відеокарта',
  writingPlugin: 'Написання плагіна',

  reference: 'Довідник',
  troubleshooting: 'Усунення проблем',
  architecture: 'Як побудовано opys',

  packages: 'Пакети',
  packagesTrial: 'Пакети (проба)',
  buildingPack: 'Збирання збірки',
  aLauncher: 'Лаунчер',
  anyPack: 'Будь-яка збірка',
  mojangFormats: 'Формати Mojang',
};

/** The navigation, every link under `base`: one sidebar, since the whole
 * site fits in it. */
function site(base: string, t: typeof en): DefaultTheme.Config {
  const at = (path: string) => `${base}${path}`;
  const page = (text: string, path: string) => ({ text, link: at(path) });
  const pkg = (name: string) => page(`@opys/${name}`, `/packages/${name}`);

  const sidebar: DefaultTheme.SidebarItem[] = [
    {
      text: t.basics,
      items: [
        page(t.introduction, '/basics/intro'),
        page(t.config, '/basics/config'),
        page(t.bundle, '/basics/bundle'),
        page(t.cli, '/basics/cli'),
        page(t.launcher, '/basics/launcher'),
      ],
    },
    {
      text: t.format,
      items: [
        page(t.overview, '/format/'),
        page(t.variables, '/format/variables'),
        page(t.rules, '/format/rules'),
        page(t.artifacts, '/format/artifacts'),
        page(t.launch, '/format/launch'),
        page(t.cleanup, '/format/cleanup'),
        page(t.bundleFile, '/format/bundle'),
      ],
    },
    {
      text: t.plugins,
      items: [
        page(t.overview, '/plugins/'),
        page(t.files, '/plugins/files'),
        page(t.links, '/plugins/links'),
        {
          text: t.minecraft,
          collapsed: false,
          items: [
            page(t.vanilla, '/plugins/minecraft'),
            page(t.serverlist, '/plugins/serverlist'),
            page(t.authliberty, '/plugins/authliberty'),
            page('Bifrost', '/plugins/bifrost'),
          ],
        },
        {
          text: t.loaders,
          collapsed: false,
          items: [
            page('Forge', '/plugins/forge'),
            page('NeoForge', '/plugins/neoforge'),
            page('Fabric', '/plugins/fabric'),
            page('Cleanroom', '/plugins/cleanroom'),
            page('lwjgl3ify', '/plugins/lwjgl3ify'),
          ],
        },
        {
          text: t.resources,
          collapsed: false,
          items: [
            page('Modrinth', '/plugins/modrinth'),
            page('CurseForge', '/plugins/curseforge'),
          ],
        },
        {
          text: t.java,
          collapsed: false,
          items: [
            page(t.javaRuntime, '/plugins/java'),
            page(t.dgpuj, '/plugins/dgpuj'),
          ],
        },
        page(t.writingPlugin, '/plugins/writing-a-plugin'),
      ],
    },
    {
      text: t.reference,
      items: [
        page(t.troubleshooting, '/reference/troubleshooting'),
        page(t.architecture, '/reference/architecture'),
      ],
    },
  ];
  // A trial of another layout: each package's README as its page. Kept apart
  // from the sidebar above until one of the two replaces the other.
  const packages: DefaultTheme.SidebarItem[] = [
    { text: t.packages, items: [page(t.overview, '/packages/')] },
    { text: t.buildingPack, items: [pkg('cli'), pkg('dev'), pkg('minecraft')] },
    { text: t.aLauncher, items: [pkg('runtime')] },
    { text: t.format, items: [pkg('core'), pkg('bundle')] },
    { text: t.anyPack, items: [pkg('links')] },
    {
      text: t.minecraft,
      items: [
        pkg('minecraft-vanilla'),
        pkg('minecraft-serverlist'),
        pkg('authliberty'),
        pkg('bifrost'),
      ],
    },
    {
      text: t.loaders,
      items: [
        pkg('forge'),
        pkg('neoforge'),
        pkg('fabric'),
        pkg('cleanroom'),
        pkg('lwjgl3ify'),
      ],
    },
    { text: t.resources, items: [pkg('modrinth'), pkg('curseforge')] },
    { text: t.java, items: [pkg('java'), pkg('dgpuj')] },
    { text: t.mojangFormats, items: [pkg('mojang'), pkg('mojang-rules')] },
  ];
  return {
    nav: [
      page(t.basics, '/basics/intro'),
      page(t.format, '/format/'),
      page(t.plugins, '/plugins/'),
      page(t.reference, '/reference/troubleshooting'),
      page(t.packagesTrial, '/packages/'),
    ],
    sidebar: {
      [at('/packages/')]: packages,
      [at('/basics/')]: sidebar,
      [at('/plugins/')]: sidebar,
      [at('/format/')]: sidebar,
      [at('/reference/')]: sidebar,
    },
  };
}

const repo = 'https://github.com/harmoniya-net/opys';

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'opys',
  base: '/opys/',
  cleanUrls: true,
  lastUpdated: true,
  // Notes for whoever writes the pages, and the configs the pages include.
  srcExclude: ['CONTRIBUTING.md', 'examples/**'],
  // The examples are `.mjs`, which the highlighter does not know by that name.
  markdown: { languageAlias: { mjs: 'js' } },
  locales: {
    root: {
      label: 'English',
      lang: 'en',
      description:
        'Build and launch Minecraft installations from a declarative manifest.',
      themeConfig: {
        ...site('', en),
        editLink: { pattern: `${repo}/edit/main/docs/:path` },
      },
    },
    uk: {
      label: 'Українська',
      lang: 'uk',
      description:
        'Збирайте й запускайте інсталяції Minecraft із декларативного маніфесту.',
      themeConfig: {
        ...site('/uk', uk),
        editLink: {
          pattern: `${repo}/edit/main/docs/:path`,
          text: 'Редагувати цю сторінку на GitHub',
        },
        outline: { level: [2, 3], label: 'На цій сторінці' },
        lastUpdated: { text: 'Оновлено' },
        docFooter: { prev: 'Попередня сторінка', next: 'Наступна сторінка' },
        darkModeSwitchLabel: 'Тема',
        lightModeSwitchTitle: 'Увімкнути світлу тему',
        darkModeSwitchTitle: 'Увімкнути темну тему',
        sidebarMenuLabel: 'Меню',
        returnToTopLabel: 'Нагору',
        langMenuLabel: 'Змінити мову',
      },
    },
  },
  themeConfig: {
    socialLinks: [{ icon: 'github', link: repo }],
    outline: [2, 3],
    search: {
      provider: 'local',
      options: {
        locales: {
          uk: {
            translations: {
              button: { buttonText: 'Пошук', buttonAriaLabel: 'Пошук' },
              modal: {
                noResultsText: 'Нічого не знайдено за запитом',
                resetButtonTitle: 'Скинути пошук',
                displayDetails: 'Показати подробиці',
                backButtonTitle: 'Закрити пошук',
                footer: {
                  selectText: 'вибрати',
                  navigateText: 'перейти',
                  closeText: 'закрити',
                },
              },
            },
          },
        },
      },
    },
  },
});
