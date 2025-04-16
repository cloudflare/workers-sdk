import { NitroApp } from 'nitropack';
import { defineNitroPlugin } from 'nitropack/dist/runtime/plugin';

export default defineNitroPlugin((nitroApp: NitroApp) => {
  nitroApp.hooks.hook('request', async (event) => {
    const _pkg = 'wrangler'; // Bypass bundling!
    const { getPlatformProxy } = (await import(
      _pkg
    )) as typeof import('wrangler');
    const platform = await getPlatformProxy();

    event.context.cf = platform['cf'];
    event.context.cloudflare = {
      env: platform['env'] as unknown as Env,
      context: platform['ctx'],
    };
  });
});
