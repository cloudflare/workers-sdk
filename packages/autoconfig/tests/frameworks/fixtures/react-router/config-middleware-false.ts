import type { Config } from "@react-router/dev/config";
export default {
	ssr: true,
	future: {
		v8_middleware: false,
	},
} satisfies Config;
