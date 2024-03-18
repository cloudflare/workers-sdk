import { define } from 'worktop.build';
import { nodeModulesPolyfillPlugin } from 'esbuild-plugins-node-modules-polyfill';

// @ts-ignore
export default define({
	modify(config) {
		config.plugins = config.plugins || [];
		config.plugins.push(nodeModulesPolyfillPlugin());
	},
});
