// @torba-preserve
import { curseforge } from '@torba/curseforge';
import { forge } from '@torba/forge';
import { artifactScanner, defineConfig, userDataDir } from '@torba/minecraft';

export default defineConfig(async ({ mode }) => {
  const fr = await forge({
    version: '1.20.1',
    manifest:
      './versions/1.20.1-forge-47.4.6/1.20.1-forge-47.4.6.json',
  });

  const mod = (info) => '${root}/mods/' + info.filename;

  const cf = await curseforge({
    key: '$2a$10$wuAJuNZuted3NORVmpgUC.m8sI.pv1tOPKZyBgLFGjxFp/br0lZCC',
    files: [
      { fileId: 6717445, path: mod }, // aiotbotania-1.20.1-4.0.6.jar
      { fileId: 6818025, path: mod }, // extrabotany-forge-1.20.1-1.9.1.jar
      { fileId: 6702112, path: mod }, // MythicBotany-1.20.1-4.0.4.jar
      { fileId: 6615986, path: mod }, // chloride-FORGE-mc1.20.1-v1.7.2.jar
      { fileId: 6101745, path: mod }, // rubidium-extra-0.5.4.4+mc1.20.1-build.131.jar
      { fileId: 6044481, path: mod }, // sodiumdynamiclights-forge-1.0.10-1.20.1.jar
      { fileId: 6163061, path: mod }, // CoffeeDelight-Forge-1.20.1-1.5.1.jar
      { fileId: 5563942, path: mod }, // decoration-delight-1.20.1.jar
      { fileId: 6795369, path: mod }, // Delightful-1.20.1-3.7.4.jar
      { fileId: 6180421, path: mod }, // ends_delight-2.5.1+forge.1.20.1.jar
      { fileId: 4736227, path: mod }, // nethersdelight-1.20.1-4.0.jar
      { fileId: 4652060, path: mod }, // oceansdelight-1.0.2-1.20.jar
      { fileId: 5765563, path: mod }, // supplementariesdelight-1.0.1-1.20.1.jar
      { fileId: 6121578, path: mod }, // ukrainedelight-1.0.2-1.20.1.jar
      { fileId: 5847856, path: mod }, // vintagedelight-0.1.6.jar
      { fileId: 6722563, path: mod }, // Werewolves-1.20.1-2.0.2.7.jar
      { fileId: 7725727, path: mod }, // AdvancedLootInfo-forge-1.20.1-1.8.0.jar
      { fileId: 6399828, path: mod }, // artifacts-forge-9.5.16.jar
      { fileId: 7371538, path: mod }, // azurelib-neo-1.20.1-3.1.3.jar
      { fileId: 7287334, path: mod }, // bettercombat-forge-1.9.0+1.20.1.jar
      { fileId: 4596768, path: mod }, // BetterThirdPerson-Forge-1.20-1.9.0.jar
      { fileId: 7253333, path: mod }, // bloodmagic-1.20.1-3.3.5-47.jar
      { fileId: 7366478, path: mod }, // born_in_chaos_[Forge]1.20.1_1.7.4.jar
      { fileId: 7447221, path: mod }, // cataclysm_spellbooks-1.2.8-1.20.1-all.jar
      { fileId: 6918987, path: mod }, // fancymenu_forge_3.7.0_MC_1.20.1.jar
      { fileId: 5723247, path: mod }, // betterfpsdist-1.20.1-6.0.jar
      { fileId: 5681725, path: mod }, // embeddium-0.3.31+mc1.20.1.jar
      { fileId: 6780226, path: mod }, // entityculling-forge-1.8.2-mc1.20.1.jar
      { fileId: 4884976, path: mod }, // gpumemleakfix-1.20.1-1.8.jar
      { fileId: 6745706, path: mod }, // ImmediatelyFast-Forge-1.5.1+1.20.4.jar
      { fileId: 4770828, path: mod }, // appleskin-forge-mc1.20.1-2.5.1.jar
      { fileId: 5855251, path: mod }, // EnchantmentDescriptions-Forge-1.20.1-17.1.19.jar
      { fileId: 5939627, path: mod }, // invtweaks-1.20.1-1.2.0.jar
      { fileId: 5338457, path: mod }, // MouseTweaks-forge-mc1.20.1-2.25.1.jar
      { fileId: 6020952, path: mod }, // oculus-mc1.20.1-1.8.0.jar
      { fileId: 6778028, path: mod }, // Xaeros_Minimap_25.2.10_Forge_1.20.jar
      { fileId: 6778091, path: mod }, // XaerosWorldMap_1.39.12_Forge_1.20.jar
      { fileId: 5761411, path: mod }, // Connector-1.0.0-beta.46+1.20.1.jar
      { fileId: 5490637, path: mod }, // ConnectorExtras-1.11.2+1.20.1.jar
      { fileId: 6413365, path: mod }, // croaks-1.9.6-forge-1.20.1.jar
      { fileId: 6351088, path: mod }, // CustomSkinLoader_ForgeV2-14.23.jar
      { fileId: 5206484, path: mod }, // dungeons-and-taverns-3.0.3.f[Forge].jar
      { fileId: 5990306, path: mod }, // fabric-api-0.92.2+1.11.9+1.20.1.jar
      { fileId: 7016585, path: mod }, // farsight-1.20.1-4.5.jar
      { fileId: 5696829, path: mod }, // fastboot-1.20.x-1.2.jar
      { fileId: 6210180, path: mod }, // betterchunkloading-1.20.1-5.4.jar
      { fileId: 6229159, path: mod }, // connectivity-1.20.1-7.1.jar
      { fileId: 4706149, path: mod }, // Fastload-Reforged-mc1.20.1-3.4.0.jar
      { fileId: 4810975, path: mod }, // ferritecore-6.0.1-forge.jar
      { fileId: 5479898, path: mod }, // Item-Obliterator-NeoForge-MC1.20.1-2.3.1.jar
      { fileId: 5392173, path: mod }, // memoryleakfix-forge-1.17+-1.1.5.jar
      { fileId: 6837713, path: mod }, // modernfix-forge-5.24.4+mc1.20.1.jar
      { fileId: 5706069, path: mod }, // radium-mc1.20.1-0.12.4+git.26c9d8e.jar
      { fileId: 4631193, path: mod }, // starlight-1.1.2+forge.1cda73c.jar
      { fileId: 6450982, path: mod }, // polymorph-forge-0.49.10+1.20.1.jar
      { fileId: 7405902, path: mod }, // forestry-1.20.1-2.9.0.jar
      { fileId: 7413433, path: mod }, // ice_and_fire_spellbooks-2.3.2-1.20.1.jar
      { fileId: 7186208, path: mod }, // irons_recipe_additions-2.7-forge-1.20.1.jar
      { fileId: 7402504, path: mod }, // irons_spellbooks-1.20.1-3.15.0.jar
      { fileId: 5137938, path: mod }, // architectury-9.2.14-forge.jar
      { fileId: 6408581, path: mod }, // blueprint-1.20.1-7.1.3.jar
      { fileId: 5423987, path: mod }, // Bookshelf-Forge-1.20.1-20.2.13.jar
      { fileId: 5281700, path: mod }, // caelus-forge-3.2.0+1.20.1.jar
      { fileId: 6702068, path: mod }, // citadel-2.6.2-1.20.1.jar
      { fileId: 5729105, path: mod }, // cloth-config-11.1.136-forge.jar
      { fileId: 5470032, path: mod }, // cupboard-1.20.1-2.7.jar
      { fileId: 6418456, path: mod }, // curios-forge-5.14.1+1.20.1.jar
      { fileId: 6788387, path: mod }, // eventwrapper-forge-1.20.1-1.1.3.jar
      { fileId: 6807424, path: mod }, // ftb-library-forge-2001.2.10.jar
      { fileId: 6130786, path: mod }, // ftb-teams-forge-2001.3.1.jar
      { fileId: 6402486, path: mod }, // ftb-xmod-compat-forge-2.1.3.jar
      { fileId: 4799858, path: mod }, // Guide-API-VP-1.20.1-2.2.6.jar
      { fileId: 4838266, path: mod }, // item-filters-forge-2001.1.0-build.59.jar
      { fileId: 5028413, path: mod }, // konkrete_forge_1.8.0_MC_1.20-1.20.1.jar
      { fileId: 4601234, path: mod }, // libraryferret-forge-1.20.1-4.0.0.jar
      { fileId: 5207625, path: mod }, // LibX-1.20.1-5.0.14.jar
      { fileId: 5109692, path: mod }, // melody_forge_1.0.3_MC_1.20.1-1.20.4.jar
      { fileId: 6181667, path: mod }, // modonomicon-1.20.1-forge-1.77.6.jar
      { fileId: 6877879, path: mod }, // moonlight-1.20-2.15.7-forge.jar
      { fileId: 5772681, path: mod }, // Necronomicon-Forge-1.6.0+1.20.1.jar
      { fileId: 6274623, path: mod }, // OctoLib-FORGE-0.5.0.1+1.20.1.jar
      { fileId: 6164575, path: mod }, // Patchouli-1.20.1-84.1-FORGE.jar
      { fileId: 5414631, path: mod }, // Placebo-1.20.1-8.6.2.jar
      { fileId: 6387081, path: mod }, // PuzzlesLib-v8.1.32-1.20.1-Forge.jar
      { fileId: 6186971, path: mod }, // rhino-forge-2001.2.3-build.10.jar
      { fileId: 5983132, path: mod }, // stateobserver-forge-1.20.1-1.4.3.jar
      { fileId: 5769971, path: mod }, // YungsApi-1.20-Forge-4.0.6.jar
      { fileId: 5922047, path: mod }, // lionfishapi-2.4-Fix.jar
      { fileId: 7414488, path: mod }, // Mantle-1.20.1-1.11.97.jar
      { fileId: 4580511, path: mod }, // MyServerIsCompatible-1.20-1.0.jar
      { fileId: 5605501, path: mod }, // AkashicTome-1.7-27.jar
      { fileId: 6875720, path: mod }, // amendments-1.20-2.1.1.jar
      { fileId: 5965079, path: mod }, // big_swords-2.0.0.jar
      { fileId: 6870713, path: mod }, // Botania-1.20.1-450-FORGE.jar
      { fileId: 5089406, path: mod }, // decorative_blocks-forge-1.20.1-4.1.3.jar
      { fileId: 6860192, path: mod }, // dummmmmmy-1.20-2.0.9.jar
      { fileId: 6597298, path: mod }, // FarmersDelight-1.20.1-1.2.8.jar
      { fileId: 6685443, path: mod }, // FramedBlocks-9.4.2.jar
      { fileId: 6829212, path: mod }, // ftb-quests-forge-2001.4.14.jar
      { fileId: 5678610, path: mod }, // GrimoireOfGaia4-1.20.1-4.0.0-alpha.11.jar
      { fileId: 6314111, path: mod }, // hexerei-0.4.2.3.jar
      { fileId: 5633453, path: mod }, // iceandfire-2.1.13-1.20.1-beta-5.jar
      { fileId: 5853326, path: mod }, // kubejs-forge-2001.6.5-build.16.jar
      { fileId: 6458889, path: mod }, // letsdo-herbalbrews-forge-1.0.12.jar
      { fileId: 6330326, path: mod }, // lootr-forge-1.20-0.7.35.91.jar
      { fileId: 6835318, path: mod }, // occultism-1.20.1-1.147.0.jar
      { fileId: 6841170, path: mod }, // projectvibrantjourneys-1.20.1-6.2.0.jar
      { fileId: 6223817, path: mod }, // redeco-1.14.1-forge-1.20.1.jar
      { fileId: 4594775, path: mod }, // reinforced-chests-2.4.2+1.20.jar
      { fileId: 6182692, path: mod }, // Ribbits-1.20.1-Forge-3.0.4.jar
      { fileId: 6884766, path: mod }, // StorageDrawers-forge-1.20.1-12.11.6.jar
      { fileId: 6749363, path: mod }, // supplementaries-1.20-3.1.36.jar
      { fileId: 5120051, path: mod }, // the-orcs-1.0-FORGE-1.20.x.jar
      { fileId: 6289561, path: mod }, // Vampirism-1.20.1-1.10.13.jar
      { fileId: 6856603, path: mod }, // waystones-forge-1.20.1-14.1.17.jar
      { fileId: 6509918, path: mod }, // naturalist-5.0pre3+forge-1.20.1.jar
      { fileId: 6091445, path: mod }, // packedup-1.1.0-forge-mc1.20.1.jar
      { fileId: 4587214, path: mod }, // player-animation-lib-forge-1.0.2-rc1+1.20.jar
      { fileId: 4600191, path: mod }, // cosmeticarmorreworked-1.20.1-v1a.jar
      { fileId: 6855440, path: mod }, // Jade-1.20.1-Forge-11.13.2.jar
      { fileId: 6600311, path: mod }, // jei-1.20.1-forge-15.20.0.112.jar
      { fileId: 6868042, path: mod }, // kleeslabs-forge-1.20.1-15.0.9.jar
      { fileId: 7394415, path: mod }, // samurai_dynasty-0.0.51-1.20.1-forge.jar
      { fileId: 5970916, path: mod }, // skinlayers3d-forge-1.7.4-mc1.20.1.jar
      { fileId: 4715408, path: mod }, // supermartijn642configlib-1.1.8-forge-mc1.20.jar
      { fileId: 7426391, path: mod }, // supermartijn642corelib-1.1.19-forge-mc1.20.1.jar
      { fileId: 7449219, path: mod }, // TConstruct-1.20.1-3.11.2.166.jar
      { fileId: 7478798, path: mod }, // twilightdelight-2.0.19.jar
      { fileId: 7178171, path: mod }, // tf_dnv-1.2.3.jar (local: Twiling_Dungeon-1.2.3.jar)
      { fileId: 4586218, path: mod }, // worldedit-mod-7.2.15.jar
      { fileId: 5057220, path: mod }, // JustEnoughResources-1.20.1-1.4.0.247.jar
      { fileId: 4646682, path: mod }, // Controlling-forge-1.20.1-12.0.2.jar
      { fileId: 6841886, path: mod }, // balm-forge-1.20.1-7.3.34-all.jar
      { fileId: 6602273, path: mod }, // CyclopsCore-1.20.1-1.20.1.jar
      { fileId: 4889101, path: mod }, // EpheroLib-1.20.1-FORGE-1.2.0.jar
      { fileId: 6789487, path: mod }, // geckolib-forge-1.20.1-4.7.3.jar
      { fileId: 5284015, path: mod }, // Searchables-forge-1.20.1-1.0.3.jar
      { fileId: 5654964, path: mod }, // SmartBrainLib-forge-1.20.1-1.15.jar
      { fileId: 6870868, path: mod }, // EvilCraft-1.20.1-1.2.57.jar
      { fileId: 4575022, path: mod }, // WorldEditCUI-1.20+01.jar
      // ── Still unresolved (local-only or insufficient info) ──
      // Harmoniya Fixer-1.20.1-forge 1.0-client.jar    (local-only, custom)
      // Harmoniya Shield-1.20.1-1.0-client.jar         (local-only, custom)
      // Mod-twilightforest-1.20.1-4.3.jar              (filename truncated; real CF builds are 4.3.x.y)
      // amethystos-1.0.jar                             (no CF match, possibly Modrinth-only)
      // cataclysm.jar                                  (hand-renamed, no version in filename)
    ],
  });

  return {
    output: 'wizard.json',
    artifacts: [
      fr.artifacts,
      cf.artifacts,
      artifactScanner({
        directory: './',
        path: '${library_directory}/${path}',
        url: 'https://cdn.example.com/modpacks/client/public/libraries/${path}',
        hash: 'sha256',
        source: mode === 'launch' ? 'file' : 'url',
        overrides: [
          { path: 'wizard.json', exclude: true },
          { path: 'torba.config.json', exclude: true },
        ],
      }),
    ],
    command: fr.command,
    vars: fr.vars,
    runClient: {
      vars: {
        root: userDataDir('harmoniya'),
        username: 'Player',
        uuid: '',
        token: '',
      },
    },
  };
});
