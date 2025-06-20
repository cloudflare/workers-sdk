declare namespace NodeJS {
	export interface ProcessEnv {
		NODE_ENV?: string;
		NODE_EXTRA_CA_CERTS?: string;
		MINIFLARE_WORKERD_PATH?: string;
		MINIFLARE_WORKERD_CONFIG_DEBUG?: string;
		MINIFLARE_ASSERT_BODIES_CONSUMED?: "true";
	}
}
