// @unifest-preserve
import { forge } from '@unifest/forge';
import { artifactScanner, unifestConfig } from '@unifest/mc';
import { homedir } from 'os';
import { join } from 'path';

export default unifestConfig(async ({ mode }) => {
  const fr = await forge({
    version: '1.20.1',
    manifest:
      '/home/deitylamb/harmoniya/modpacks/client/public/versions/1.20.1-forge-47.4.6/1.20.1-forge-47.4.6.json',
  });

  return {
    output: 'wizard.json',
    artifacts: [
      fr.artifacts,
      artifactScanner({
        directory: './',
        base_path: '${library_directory}/${path}',
        url: 'https://cdn.example.com/modpacks/client/public/libraries/${path}',
        hash: 'sha256',
        mode,
        overrides: [
          { path: 'wizard.json', exclude: true },
          { path: 'unifest.config.json', exclude: true },
        ],
      }),
    ],
    command: fr.command,
    vars: fr.vars,
    runClient: {
      vars: {
        root:
          process.platform === 'win32'
            ? join(process.env.APPDATA, 'harmoniya')
            : process.platform === 'darwin'
              ? join(homedir(), 'Library', 'Application Support', 'harmoniya')
              : join(homedir(), '.local', 'share', 'harmoniya'),
        username: 'Player',
        uuid: '',
        token: '',
      },
    },
  };
});
