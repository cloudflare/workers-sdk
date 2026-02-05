import { LOCAL_EXPLORER_API_PATH } from "../constants";
import type { CreateClientConfig } from "./generated/client.gen";

export const createClientConfig: CreateClientConfig = (config) => ({
	...config,
	baseUrl: LOCAL_EXPLORER_API_PATH,
	throwOnError: true,
});
