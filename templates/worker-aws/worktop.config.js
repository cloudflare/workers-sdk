import { define } from 'worktop.build';
import { polyfillNode } from 'esbuild-plugin-polyfill-node';

// @ts-ignore
export default define({
	modify(config) {
		config.plugins = config.plugins || [];
		config.plugins.push(polyfillNode());
	},
});
