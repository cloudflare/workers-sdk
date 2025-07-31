import { PluginLoader } from 'miniflare'
import {
    UNSAFE_PLUGIN_NAME,
    UNSAFE_SERVICE_PLUGIN,
    type UnsafeServiceBindingOption,
    type UnsafeServiceBindingSharedOptions
} from './plugins/unsafeService'


const pluginRegistry: PluginLoader = {
    // @ts-expect-error TODO: I need to figure out how to type this better. .
    registerMiniflarePlugins<UnsafeServiceBindingOption, UnsafeServiceBindingSharedOption>() {
        return {
            [UNSAFE_PLUGIN_NAME]: UNSAFE_SERVICE_PLUGIN,
        }
    }
}

export const { registerMiniflarePlugins } = pluginRegistry