import type { CreateClientConfig } from "./generated/client.gen";

export const createClientConfig: CreateClientConfig = (config) => ({
	...config,
	baseUrl: import.meta.env.VITE_LOCAL_EXPLORER_API_PATH,
	throwOnError: true,
});
