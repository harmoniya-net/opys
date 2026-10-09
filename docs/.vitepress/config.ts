import { defineConfig, type DefaultTheme } from 'vitepress';

// The site is written in English and translated into Ukrainian.
//
// The English pages were rewritten into a much smaller set, and the
// translation has not followed yet. Until it does, the two languages have
// different pages and so different navigation: `english` below is the new
// one, and `legacy` is the layout the Ukrainian pages still have. When the
// translation catches up, `legacy` and its label tables go, and both
// languages are built from `english` again.

/** The English navigation: one sidebar, since the whole site fits in it. */
function english(): DefaultTheme.Config {
  const sidebar: DefaultTheme.SidebarItem[] = [
    {
      text: 'Basics',
      items: [
        { text: 'Introduction', link: '/basics/intro' },
        { text: 'The config', link: '/basics/config' },
        { text: 'The bundle', link: '/basics/bundle' },
        { text: 'The CLI', link: '/basics/cli' },
        { text: 'Launcher integration', link: '/basics/launcher' },
      ],
    },
    {
      text: 'The format',
      items: [
        { text: 'Overview', link: '/format/' },
        { text: 'Variables', link: '/format/variables' },
        { text: 'Rules', link: '/format/rules' },
        { text: 'Artifacts', link: '/format/artifacts' },
        { text: 'Launch', link: '/format/launch' },
        { text: 'Cleanup', link: '/format/cleanup' },
        { text: 'The bundle file', link: '/format/bundle' },
      ],
    },
    {
      text: 'Plugins',
      items: [
        { text: 'Overview', link: '/plugins/' },
        { text: 'Local files', link: '/plugins/files' },
        { text: 'Files by link', link: '/plugins/links' },
        {
          text: 'Minecraft',
          collapsed: false,
          items: [
            { text: 'Vanilla Minecraft', link: '/plugins/minecraft' },
            { text: 'Server list', link: '/plugins/serverlist' },
            { text: 'Custom auth server', link: '/plugins/authliberty' },
            { text: 'Bifrost', link: '/plugins/bifrost' },
          ],
        },
        {
          text: 'Minecraft mod loaders',
          collapsed: false,
          items: [
            { text: 'Forge', link: '/plugins/forge' },
            { text: 'NeoForge', link: '/plugins/neoforge' },
            { text: 'Fabric', link: '/plugins/fabric' },
            { text: 'Cleanroom', link: '/plugins/cleanroom' },
            { text: 'lwjgl3ify', link: '/plugins/lwjgl3ify' },
          ],
        },
        {
          text: 'Minecraft mod resources',
          collapsed: false,
          items: [
            { text: 'Modrinth', link: '/plugins/modrinth' },
            { text: 'CurseForge', link: '/plugins/curseforge' },
          ],
        },
        {
          text: 'Java',
          collapsed: false,
          items: [
            { text: 'Java runtime', link: '/plugins/java' },
            { text: 'Discrete GPU', link: '/plugins/dgpuj' },
          ],
        },
        { text: 'Writing a plugin', link: '/plugins/writing-a-plugin' },
      ],
    },
    {
      text: 'Reference',
      items: [
        { text: 'Troubleshooting', link: '/reference/troubleshooting' },
        { text: 'How opys is built', link: '/reference/architecture' },
      ],
    },
  ];
  // A trial of another layout: each package's README as its page. Kept apart
  // from the sidebar above until one of the two replaces the other.
  const packages = [
    { text: 'Packages', items: [{ text: 'Overview', link: '/packages/' }] },
    {
      text: 'The format',
      items: [
        { text: '@opys/core', link: '/packages/core' },
        { text: '@opys/bundle', link: '/packages/bundle' },
      ],
    },
    {
      text: 'Any pack',
      items: [{ text: '@opys/links', link: '/packages/links' }],
    },
    {
      text: 'Minecraft',
      items: [
        {
          text: '@opys/minecraft-vanilla',
          link: '/packages/minecraft-vanilla',
        },
        {
          text: '@opys/minecraft-serverlist',
          link: '/packages/minecraft-serverlist',
        },
        { text: '@opys/authliberty', link: '/packages/authliberty' },
        { text: '@opys/bifrost', link: '/packages/bifrost' },
      ],
    },
    {
      text: 'Minecraft mod loaders',
      items: [
        { text: '@opys/forge', link: '/packages/forge' },
        { text: '@opys/neoforge', link: '/packages/neoforge' },
        { text: '@opys/fabric', link: '/packages/fabric' },
        { text: '@opys/cleanroom', link: '/packages/cleanroom' },
        { text: '@opys/lwjgl3ify', link: '/packages/lwjgl3ify' },
      ],
    },
    {
      text: 'Minecraft mod resources',
      items: [
        { text: '@opys/modrinth', link: '/packages/modrinth' },
        { text: '@opys/curseforge', link: '/packages/curseforge' },
      ],
    },
    {
      text: 'Java',
      items: [
        { text: '@opys/java', link: '/packages/java' },
        { text: '@opys/dgpuj', link: '/packages/dgpuj' },
      ],
    },
  ];
  return {
    nav: [
      { text: 'Basics', link: '/basics/intro' },
      { text: 'The format', link: '/format/' },
      { text: 'Plugins', link: '/plugins/' },
      { text: 'Reference', link: '/reference/troubleshooting' },
      { text: 'Packages (trial)', link: '/packages/' },
    ],
    sidebar: {
      '/packages/': packages,
      '/basics/': sidebar,
      '/plugins/': sidebar,
      '/format/': sidebar,
      '/reference/': sidebar,
    },
  };
}

const en = {
  guide: 'Guide',
  launchers: 'Launchers',
  plugins: 'Plugins',
  reference: 'Reference',
  internals: 'Internals',

  start: 'Start',
  gettingStarted: 'Getting started',
  concepts: 'Concepts',
  writingConfig: 'Writing a config',
  config: 'The config file',
  runClient: 'Launch-time values',
  loaders: 'Loaders',
  java: 'Java',
  mods: 'Mods and files',
  extras: 'Accounts, servers, GPUs',
  shipping: 'Shipping',
  publishing: 'Publishing a bundle',
  cli: 'The opys command',
  troubleshooting: 'Troubleshooting',

  embeddingGroup: 'Embedding the runtime',
  embedding: 'Install and launch',
  progress: 'Progress',
  errors: 'Errors',
  vars: 'Variables',

  allPlugins: 'All plugins',
  theGame: 'The game',
  content: 'Content',
  extrasGroup: 'Extras',
  underneath: 'Underneath',

  theFormat: 'The format',
  bundle: 'Bundle',
  manifest: 'Manifest',
  assetLayouts: 'Asset layouts',
  extending: 'Extending',
  writingPlugin: 'Writing a plugin',
  api: 'API',

  architecture: 'Architecture',
  metadata: 'Version documents',
  testing: 'Testing',
};

const uk: typeof en = {
  guide: 'Посібник',
  launchers: 'Лаунчери',
  plugins: 'Плагіни',
  reference: 'Довідник',
  internals: 'Внутрішня будова',

  start: 'Початок',
  gettingStarted: 'Перші кроки',
  concepts: 'Основні поняття',
  writingConfig: 'Написання конфігурації',
  config: 'Файл конфігурації',
  runClient: 'Значення під час запуску',
  loaders: 'Завантажувачі модів',
  java: 'Java',
  mods: 'Моди та файли',
  extras: 'Акаунти, сервери, відеокарти',
  shipping: 'Розповсюдження',
  publishing: 'Публікація бандла',
  cli: 'Команда opys',
  troubleshooting: 'Усунення проблем',

  embeddingGroup: 'Вбудовування рантайму',
  embedding: 'Встановлення і запуск',
  progress: 'Прогрес',
  errors: 'Помилки',
  vars: 'Змінні',

  allPlugins: 'Усі плагіни',
  theGame: 'Гра',
  content: 'Вміст',
  extrasGroup: 'Додатково',
  underneath: 'Під капотом',

  theFormat: 'Формат',
  bundle: 'Бандл',
  manifest: 'Маніфест',
  assetLayouts: 'Розкладки ресурсів',
  extending: 'Розширення',
  writingPlugin: 'Написання плагіна',
  api: 'API',

  architecture: 'Архітектура',
  metadata: 'Документи версій',
  testing: 'Тестування',
};

/** The navigation the Ukrainian pages still have, every link under `base`. */
function legacy(base: string, t: typeof en): DefaultTheme.Config {
  const at = (path: string) => `${base}${path}`;
  const page = (text: string, path: string) => ({ text, link: at(path) });
  const plugin = (name: string, text = name) => page(text, `/plugins/${name}`);

  return {
    nav: [
      page(t.guide, '/guide/getting-started'),
      page(t.launchers, '/launcher/embedding'),
      page(t.plugins, '/plugins/'),
      page(t.reference, '/reference/bundle-format'),
      page(t.internals, '/internals/architecture'),
    ],
    sidebar: {
      [at('/guide/')]: [
        {
          text: t.start,
          items: [
            page(t.gettingStarted, '/guide/getting-started'),
            page(t.concepts, '/guide/concepts'),
          ],
        },
        {
          text: t.writingConfig,
          items: [
            page(t.config, '/guide/config'),
            page(t.runClient, '/guide/run-client'),
            page(t.loaders, '/guide/loaders'),
            page(t.java, '/guide/java'),
            page(t.mods, '/guide/mods'),
            page(t.extras, '/guide/extras'),
          ],
        },
        {
          text: t.shipping,
          items: [
            page(t.publishing, '/guide/publishing'),
            page(t.cli, '/guide/cli'),
            page(t.troubleshooting, '/guide/troubleshooting'),
          ],
        },
      ],
      [at('/launcher/')]: [
        {
          text: t.embeddingGroup,
          items: [
            page(t.embedding, '/launcher/embedding'),
            page(t.progress, '/launcher/progress'),
            page(t.errors, '/launcher/errors'),
            page(t.vars, '/launcher/vars'),
          ],
        },
      ],
      [at('/plugins/')]: [
        page(t.allPlugins, '/plugins/'),
        {
          text: t.theGame,
          items: [
            plugin('minecraft'),
            plugin('forge'),
            plugin('neoforge'),
            plugin('fabric'),
            plugin('cleanroom'),
            plugin('lwjgl3ify'),
            plugin('java'),
          ],
        },
        {
          text: t.content,
          items: [
            plugin('modrinth'),
            plugin('curseforge'),
            plugin('link', 'links'),
            plugin('files'),
          ],
        },
        {
          text: t.extrasGroup,
          items: [
            plugin('authliberty'),
            plugin('bifrost'),
            plugin('serverlist'),
            plugin('dgpuj'),
          ],
        },
        {
          text: t.underneath,
          items: [
            plugin('dev', '@opys/dev'),
            plugin('core', '@opys/core'),
            plugin('runtime', '@opys/runtime'),
            plugin('mojang', '@opys/mojang'),
            plugin('mojang-rules', '@opys/mojang-rules'),
            plugin('minecraft-vanilla', '@opys/minecraft-vanilla'),
          ],
        },
      ],
      [at('/reference/')]: [
        {
          text: t.theFormat,
          items: [
            page(t.bundle, '/reference/bundle-format'),
            page(t.manifest, '/reference/manifest'),
            page(t.assetLayouts, '/reference/asset-layouts'),
          ],
        },
        {
          text: t.extending,
          items: [
            page(t.writingPlugin, '/reference/writing-a-plugin'),
            page(t.api, '/reference/api'),
          ],
        },
      ],
      [at('/internals/')]: [
        {
          text: t.internals,
          items: [
            page(t.architecture, '/internals/architecture'),
            page('horno', '/internals/horno'),
            page(t.metadata, '/internals/metadata'),
            page(t.testing, '/internals/testing'),
          ],
        },
      ],
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
        ...english(),
        editLink: { pattern: `${repo}/edit/main/docs/:path` },
      },
    },
    uk: {
      label: 'Українська',
      lang: 'uk',
      description:
        'Збирайте й запускайте інсталяції Minecraft із декларативного маніфесту.',
      themeConfig: {
        ...legacy('/uk', uk),
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
