import type { Config } from "@react-router/dev/config";
export default {
	ssr: true,
	future: {
		v8_splitRouteModules: true,
	},
} satisfies Config;
