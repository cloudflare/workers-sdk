import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { logger } from "../logger";
import { noProxy, proxy } from "./constants";

export function configureHttpProxy(): void {
	if (proxy) {
		setGlobalDispatcher(
			new EnvHttpProxyAgent({ noProxy: noProxy || "localhost,127.0.0.1,::1" })
		);
		logger.warn(
			`Proxy environment variables detected. We'll use your proxy for fetch requests.`
		);
	}
}
