import { Nitro } from 'nitropack';

const devBindingsModule = async (nitro: Nitro) => {
  if (nitro.options.dev) {
    nitro.options.plugins.push('./src/dev-bindings.ts');
  }
};
