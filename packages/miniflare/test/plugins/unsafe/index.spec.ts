import test from "ava";
import { Miniflare, MiniflareCoreError, MiniflareOptions } from "miniflare";
import { EXPORTED_FIXTURES, FIXTURES_PATH } from '../../test-shared'
import path from "path";


/**
 * Use the plugin located in `test/fixtures/unsafe-plugin`
 * for these tests
 */
export const unsafePluginDirectory = path.resolve(
    EXPORTED_FIXTURES,
    "unsafe-plugin",
);

const pluginEntrypoint = `${unsafePluginDirectory}/index.js`

const ENTRY_WORKER_CONFIG = {
    BINDING_NAME: `UNSAFE_BINDING`,
    pluginConfig(packageName: string, pluginName: string) {
        return {
            [this.BINDING_NAME]: {
                bindingType: "service",
                service: "my-unsafe-service",
                plugin: {
                    packageName,
                    pluginName,
                    pluginOptions: {
                        [this.BINDING_NAME]: {
                            foo: "bar"
                        }
                    },
                }
            }
        }
    },
    get script() {
        return `export default {
            async fetch(req, env, ctx) {
                const writeRes = await env.${this.BINDING_NAME}.performUnsafeWrite("some-key", "some-value");
                if (!writeRes.ok) {
                    return Response.json(writeRes, { status: 500 })
                }
                const res = await env.${this.BINDING_NAME}.performUnsafeRead("some-key");
                return Response.json(res)
            }
        }`
    }
}


test("A plugin that does not expose `registerMiniflarePlugins` will cause an error to be thrown", async (t) => {
    const badPluginDir = path.resolve(FIXTURES_PATH, 'unsafe-plugin-bad');
    const [packageName, pluginName] = [
        `${badPluginDir}/no-export.cjs`,
        'unsafe-plugin',
    ]
    const opts: MiniflareOptions = {
        name: "unsafe-plugin-worker",
        // Use a compatability date that supports RPCs
        compatibilityDate: "2025-08-04",
        unsafeExternalPlugins: [
            {
                packageName,
                pluginName,
                resolveWorkingDirectory: badPluginDir,
            }
        ],
        modules: true,
        script: ENTRY_WORKER_CONFIG.script,
        unsafeBindings: ENTRY_WORKER_CONFIG.pluginConfig(packageName, pluginName),
    }
    const mf = new Miniflare({ modules: true, script: "" });
    t.teardown(() => mf.dispose());

    const err = await t.throwsAsync(
        mf.setOptions(opts),
        {
            instanceOf: MiniflareCoreError,
            code: "ERR_RUNTIME_FAILURE",
            message:"Failed to load external plugin",
        }
    );

    t.assert("cause" in err)
    t.true(err.cause?.message.includes("did not provide named export 'registerMiniflarePlugins'"))
});

test("A plugin that exposes a non-function `registerMiniflarePlugins` export will cause an error to be thrown", async (t) => {
    const badPluginDir = path.resolve(FIXTURES_PATH, 'unsafe-plugin-bad');
    const [packageName, pluginName] = [
        `${badPluginDir}/not-function.cjs`,
        'unsafe-plugin',
    ]
    const opts: MiniflareOptions = {
        name: "unsafe-plugin-worker",
        // Use a compatability date that supports RPCs
        compatibilityDate: "2025-08-04",
        unsafeExternalPlugins: [
            {
                packageName,
                pluginName,
                resolveWorkingDirectory: badPluginDir,
            }
        ],
        modules: true,
        script: ENTRY_WORKER_CONFIG.script,
        unsafeBindings: ENTRY_WORKER_CONFIG.pluginConfig(packageName, pluginName),
    }
    const mf = new Miniflare({ modules: true, script: "" });
    t.teardown(() => mf.dispose());

    const err = await t.throwsAsync(
        mf.setOptions(opts),
        {
            instanceOf: MiniflareCoreError,
            code: "ERR_RUNTIME_FAILURE",
            message:"Failed to load external plugin",
        }
    );
    t.assert("cause" in err)
    t.true(err.cause?.message.includes("Specified external plugin unsafe-plugin exposed non-function 'registerMiniflarePlugins' export."))
})


test("Supports specifying an unsafe plugin will be loaded into Miniflare and will be usable in local dev", async (t) => {
    const [packageName, pluginName] = [pluginEntrypoint, 'unsafe-plugin']
    const opts: MiniflareOptions = {
        name: "unsafe-plugin-worker",
        // Use a compatability date that supports RPCs
        compatibilityDate: "2025-08-04",
        unsafeExternalPlugins: [
            {
                packageName,
                pluginName,
                resolveWorkingDirectory: unsafePluginDirectory,
            }
        ],
        modules: true,
        script: ENTRY_WORKER_CONFIG.script,
        unsafeBindings: ENTRY_WORKER_CONFIG.pluginConfig(packageName, pluginName),
    }
    let mf = new Miniflare(opts);
    t.teardown(() => mf.dispose());

    let res = await mf.dispatchFetch("http://localhost");
    t.is(
        await res.text(),
        '{"ok":true,"result":"some-value","meta":{"workersVersion":"0.0.1"}}'
    );
});
