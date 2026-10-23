import path from "node:path";
import { UserError } from "@cloudflare/workers-utils";
import { getDevelopmentOidcAuthHook } from "./auth";
import { DevelopmentOidcProvider } from "./development-oidc";
import {
	createDevelopmentOidcApiTransport,
	DevelopmentOidcApiError,
} from "./development-oidc-api";
import type { RemoteBindingsLogger } from "./logger";
import type { Config } from "@cloudflare/workers-utils";
import type { DevelopmentOidcBrokerFactory } from "miniflare";

/**
 * Build a lazy host-only broker factory for a configured local Worker.
 * No login or API request runs until its native getter is called. Miniflare
 * retains equal keys across code reloads and disposes removed/changed factories.
 * @param config Linked Worker, account, and compatibility configuration.
 * @param logger Host development server logger.
 * @param profileDir Directory used to select the developer's authentication profile.
 * @returns Broker configuration, or undefined when Workers OIDC is not enabled.
 */
export function getDevelopmentOidcOptions(
	config: Pick<
		Config,
		"name" | "account_id" | "compatibility_flags" | "compliance_region"
	>,
	logger: RemoteBindingsLogger,
	profileDir = process.cwd()
): DevelopmentOidcBrokerFactory | undefined {
	if (!config.compatibility_flags.includes("workers_oidc")) {
		return undefined;
	}
	const snapshot = {
		name: config.name ?? "",
		account_id: config.account_id,
		compliance_region: config.compliance_region,
	};
	const directory = path.resolve(profileDir);
	const useCfAuth = "CLOUDFLARE_CF_AUTH" in process.env;
	const profile = useCfAuth
		? process.env.CLOUDFLARE_DEV_AUTH_PROFILE
		: undefined;
	return {
		key: JSON.stringify([
			snapshot.name,
			snapshot.account_id,
			snapshot.compliance_region,
			directory,
			useCfAuth,
			profile,
		]),
		create() {
			let readAuth: ReturnType<typeof getDevelopmentOidcAuthHook> | undefined;
			const provider = new DevelopmentOidcProvider(
				snapshot.name,
				async () => {
					try {
						readAuth ??= getDevelopmentOidcAuthHook(
							snapshot.account_id,
							directory,
							logger
						);
						return await readAuth();
					} catch (error) {
						if (
							error instanceof UserError &&
							error.telemetryMessage === "development oidc oauth required"
						) {
							throw new DevelopmentOidcApiError(error.message);
						}
						throw new DevelopmentOidcApiError(
							"Development OIDC could not resolve the signed-in developer and account. Check your login, selected profile, account access, and connectivity."
						);
					}
				},
				createDevelopmentOidcApiTransport(snapshot, logger)
			);
			return {
				async getToken(options) {
					try {
						return await provider.getToken(options);
					} catch (error) {
						// Log only errors created by trusted code; never serialize API bodies or adapters.
						logger.error(
							error instanceof DevelopmentOidcApiError
								? error.message
								: "Development OIDC issuance failed. Check the linked Worker, login, and connectivity, then retry the getter."
						);
						throw new Error("Development OIDC issuance failed.");
					}
				},
				dispose() {
					provider.dispose();
				},
			};
		},
	};
}
