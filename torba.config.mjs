// @torba-preserve
import { resolveAuthliberty } from '@torba/authliberty';
import { resolveBifrost } from '@torba/bifrost';
import { resolveCurseforge } from "@torba/curseforge";
import { resolveForge } from "@torba/forge";
import { resolveJava } from '@torba/java';
import { artifactScanner, defineConfig, userDataDir } from "@torba/minecraft";

export default defineConfig(async ({ mode }) => {
  const fr = await resolveForge({ version: "1.20.1-best" });

  const java = await resolveJava({ version: '17' });

  const authlib = await resolveAuthliberty({
    version: '0.4',
    hosts: () => `https://yggdrasil.harmoniya.net/`,
  });

  const cf = await resolveCurseforge(
    {
      path: (info) => "${game_directory}/mods/" + info.filename,
      token: "$2a$10$wuAJuNZuted3NORVmpgUC.m8sI.pv1tOPKZyBgLFGjxFp/br0lZCC",
    },
    [
      'https://www.curseforge.com/minecraft/mc-mods/the-twilight-forest/files/5468648',
      6717445, // aiotbotania-1.20.1-4.0.6.jar
      6818025, // extrabotany-forge-1.20.1-1.9.1.jar
      6702112, // MythicBotany-1.20.1-4.0.4.jar
      6615986, // chloride-FORGE-mc1.20.1-v1.7.2.jar
      6101745, // rubidium-extra-0.5.4.4+mc1.20.1-build.131.jar
      6044481, // sodiumdynamiclights-forge-1.0.10-1.20.1.jar
      6163061, // CoffeeDelight-Forge-1.20.1-1.5.1.jar
      5563942, // decoration-delight-1.20.1.jar
      6795369, // Delightful-1.20.1-3.7.4.jar
      6180421, // ends_delight-2.5.1+forge.1.20.1.jar
      4736227, // nethersdelight-1.20.1-4.0.jar
      4652060, // oceansdelight-1.0.2-1.20.jar
      5765563, // supplementariesdelight-1.0.1-1.20.1.jar
      6121578, // ukrainedelight-1.0.2-1.20.1.jar
      5847856, // vintagedelight-0.1.6.jar
      6722563, // Werewolves-1.20.1-2.0.2.7.jar
      7725727, // AdvancedLootInfo-forge-1.20.1-1.8.0.jar
      6399828, // artifacts-forge-9.5.16.jar
      7371538, // azurelib-neo-1.20.1-3.1.3.jar
      7287334, // bettercombat-forge-1.9.0+1.20.1.jar
      4596768, // BetterThirdPerson-Forge-1.20-1.9.0.jar
      7253333, // bloodmagic-1.20.1-3.3.5-47.jar
      7366478, // born_in_chaos_[Forge]1.20.1_1.7.4.jar
      7447221, // cataclysm_spellbooks-1.2.8-1.20.1-all.jar
      6918987, // fancymenu_forge_3.7.0_MC_1.20.1.jar
      5723247, // betterfpsdist-1.20.1-6.0.jar
      5681725, // embeddium-0.3.31+mc1.20.1.jar
      6780226, // entityculling-forge-1.8.2-mc1.20.1.jar
      4884976, // gpumemleakfix-1.20.1-1.8.jar
      6745706, // ImmediatelyFast-Forge-1.5.1+1.20.4.jar
      4770828, // appleskin-forge-mc1.20.1-2.5.1.jar
      5855251, // EnchantmentDescriptions-Forge-1.20.1-17.1.19.jar
      5939627, // invtweaks-1.20.1-1.2.0.jar
      5338457, // MouseTweaks-forge-mc1.20.1-2.25.1.jar
      6020952, // oculus-mc1.20.1-1.8.0.jar
      6778028, // Xaeros_Minimap_25.2.10_Forge_1.20.jar
      6778091, // XaerosWorldMap_1.39.12_Forge_1.20.jar
      5761411, // Connector-1.0.0-beta.46+1.20.1.jar
      5490637, // ConnectorExtras-1.11.2+1.20.1.jar
      6413365, // croaks-1.9.6-forge-1.20.1.jar
      6351088, // CustomSkinLoader_ForgeV2-14.23.jar
      5206484, // dungeons-and-taverns-3.0.3.f[Forge].jar
      5990306, // fabric-api-0.92.2+1.11.9+1.20.1.jar
      7016585, // farsight-1.20.1-4.5.jar
      5696829, // fastboot-1.20.x-1.2.jar
      6210180, // betterchunkloading-1.20.1-5.4.jar
      6229159, // connectivity-1.20.1-7.1.jar
      4706149, // Fastload-Reforged-mc1.20.1-3.4.0.jar
      4810975, // ferritecore-6.0.1-forge.jar
      5479898, // Item-Obliterator-NeoForge-MC1.20.1-2.3.1.jar
      5392173, // memoryleakfix-forge-1.17+-1.1.5.jar
      6837713, // modernfix-forge-5.24.4+mc1.20.1.jar
      5706069, // radium-mc1.20.1-0.12.4+git.26c9d8e.jar
      4631193, // starlight-1.1.2+forge.1cda73c.jar
      6450982, // polymorph-forge-0.49.10+1.20.1.jar
      7405902, // forestry-1.20.1-2.9.0.jar
      7413433, // ice_and_fire_spellbooks-2.3.2-1.20.1.jar
      7186208, // irons_recipe_additions-2.7-forge-1.20.1.jar
      7402504, // irons_spellbooks-1.20.1-3.15.0.jar
      5137938, // architectury-9.2.14-forge.jar
      6408581, // blueprint-1.20.1-7.1.3.jar
      5423987, // Bookshelf-Forge-1.20.1-20.2.13.jar
      5281700, // caelus-forge-3.2.0+1.20.1.jar
      6702068, // citadel-2.6.2-1.20.1.jar
      5729105, // cloth-config-11.1.136-forge.jar
      5470032, // cupboard-1.20.1-2.7.jar
      6418456, // curios-forge-5.14.1+1.20.1.jar
      6788387, // eventwrapper-forge-1.20.1-1.1.3.jar
      6807424, // ftb-library-forge-2001.2.10.jar
      6130786, // ftb-teams-forge-2001.3.1.jar
      6402486, // ftb-xmod-compat-forge-2.1.3.jar
      4799858, // Guide-API-VP-1.20.1-2.2.6.jar
      4838266, // item-filters-forge-2001.1.0-build.59.jar
      5028413, // konkrete_forge_1.8.0_MC_1.20-1.20.1.jar
      4601234, // libraryferret-forge-1.20.1-4.0.0.jar
      5207625, // LibX-1.20.1-5.0.14.jar
      5109692, // melody_forge_1.0.3_MC_1.20.1-1.20.4.jar
      6181667, // modonomicon-1.20.1-forge-1.77.6.jar
      6877879, // moonlight-1.20-2.15.7-forge.jar
      5772681, // Necronomicon-Forge-1.6.0+1.20.1.jar
      6274623, // OctoLib-FORGE-0.5.0.1+1.20.1.jar
      6164575, // Patchouli-1.20.1-84.1-FORGE.jar
      5414631, // Placebo-1.20.1-8.6.2.jar
      6387081, // PuzzlesLib-v8.1.32-1.20.1-Forge.jar
      6186971, // rhino-forge-2001.2.3-build.10.jar
      5983132, // stateobserver-forge-1.20.1-1.4.3.jar
      5769971, // YungsApi-1.20-Forge-4.0.6.jar
      5922047, // lionfishapi-2.4-Fix.jar
      7414488, // Mantle-1.20.1-1.11.97.jar
      4580511, // MyServerIsCompatible-1.20-1.0.jar
      5605501, // AkashicTome-1.7-27.jar
      6875720, // amendments-1.20-2.1.1.jar
      5965079, // big_swords-2.0.0.jar
      6870713, // Botania-1.20.1-450-FORGE.jar
      5089406, // decorative_blocks-forge-1.20.1-4.1.3.jar
      6860192, // dummmmmmy-1.20-2.0.9.jar
      6597298, // FarmersDelight-1.20.1-1.2.8.jar
      6685443, // FramedBlocks-9.4.2.jar
      6829212, // ftb-quests-forge-2001.4.14.jar
      5678610, // GrimoireOfGaia4-1.20.1-4.0.0-alpha.11.jar
      6314111, // hexerei-0.4.2.3.jar
      5633453, // iceandfire-2.1.13-1.20.1-beta-5.jar
      5853326, // kubejs-forge-2001.6.5-build.16.jar
      6458889, // letsdo-herbalbrews-forge-1.0.12.jar
      6330326, // lootr-forge-1.20-0.7.35.91.jar
      6835318, // occultism-1.20.1-1.147.0.jar
      6841170, // projectvibrantjourneys-1.20.1-6.2.0.jar
      6223817, // redeco-1.14.1-forge-1.20.1.jar
      4594775, // reinforced-chests-2.4.2+1.20.jar
      6182692, // Ribbits-1.20.1-Forge-3.0.4.jar
      6884766, // StorageDrawers-forge-1.20.1-12.11.6.jar
      6749363, // supplementaries-1.20-3.1.36.jar
      5120051, // the-orcs-1.0-FORGE-1.20.x.jar
      6289561, // Vampirism-1.20.1-1.10.13.jar
      6856603, // waystones-forge-1.20.1-14.1.17.jar
      6509918, // naturalist-5.0pre3+forge-1.20.1.jar
      6091445, // packedup-1.1.0-forge-mc1.20.1.jar
      4587214, // player-animation-lib-forge-1.0.2-rc1+1.20.jar
      4600191, // cosmeticarmorreworked-1.20.1-v1a.jar
      6855440, // Jade-1.20.1-Forge-11.13.2.jar
      6600311, // jei-1.20.1-forge-15.20.0.112.jar
      6868042, // kleeslabs-forge-1.20.1-15.0.9.jar
      7394415, // samurai_dynasty-0.0.51-1.20.1-forge.jar
      5970916, // skinlayers3d-forge-1.7.4-mc1.20.1.jar
      4715408, // supermartijn642configlib-1.1.8-forge-mc1.20.jar
      7426391, // supermartijn642corelib-1.1.19-forge-mc1.20.1.jar
      7449219, // TConstruct-1.20.1-3.11.2.166.jar
      7478798, // twilightdelight-2.0.19.jar
      7178171, // tf_dnv-1.2.3.jar (local: Twiling_Dungeon-1.2.3.jar)
      4586218, // worldedit-mod-7.2.15.jar
      5057220, // JustEnoughResources-1.20.1-1.4.0.247.jar
      4646682, // Controlling-forge-1.20.1-12.0.2.jar
      6841886, // balm-forge-1.20.1-7.3.34-all.jar
      6602273, // CyclopsCore-1.20.1-1.20.1.jar
      4889101, // EpheroLib-1.20.1-FORGE-1.2.0.jar
      6789487, // geckolib-forge-1.20.1-4.7.3.jar
      5284015, // Searchables-forge-1.20.1-1.0.3.jar
      5654964, // SmartBrainLib-forge-1.20.1-1.15.jar
      6870868, // EvilCraft-1.20.1-1.2.57.jar
      4575022, // WorldEditCUI-1.20+01.jar
      // ── Still unresolved (local-only or insufficient info) ──
      // Harmoniya Fixer-1.20.1-forge 1.0-client.jar    (local-only, custom)
      // Harmoniya Shield-1.20.1-1.0-client.jar         (local-only, custom)
      // amethystos-1.0.jar                             (no CF match, possibly Modrinth-only)
      // cataclysm.jar                                  (hand-renamed, no version in filename)
    ],
  );

  return {
    output: "output.json",
    manifest: {
      artifacts: [
        fr.artifacts,
        java.artifacts,
        authlib.artifacts,
        cf,
        artifactScanner({
          directory: "./wizard",
          path: "${root}/wizard/${path}",
          url: "https://cdn.example.com/modpacks/client/public/wizard/${path}",
          hash: "sha256",
          source: mode === "launch" ? "file" : "url",
        }),
      ],
      launch: {
        command: fr.launch.command,
        workdir: "${game_directory}",
        args: [
          ...fr.jvmArgs,
          ...authlib.jvmArgs,
          fr.launch.mainClass,
          ...fr.gameArgs,
        ],
      },
      vars: {
        ...fr.vars,
        ...java.vars,
      },
    },
    runClient: {
      workdir: "${game_directory}",
      vars: {
        root: userDataDir("harmoniya"),
        game_directory: "${root}/wizard",
        ...resolveBifrost({
          privateKey: process.env.BIFROST_PRIVATE_KEY,
          username: 'Player',
          uuid: '00000000-0000-0000-0000-000000000000',
        }),
      },
    },
  };
});
