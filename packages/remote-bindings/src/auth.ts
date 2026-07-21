import { inputPrompt } from "@cloudflare/cli-shared-helpers/interactive";
import {
	createCfAuth,
	createCfProfileStore,
} from "@cloudflare/workers-auth/cf";
import {
	createWranglerAuth,
	createWranglerProfileStore,
} from "@cloudflare/workers-auth/wrangler";
import { isNonInteractiveOrCI, UserError } from "@cloudflare/workers-utils";
import { version as packageVersion } from "../package.json";
import type { RemoteBindingsLogger } from "./logger";
import type { AsyncHook, CfAccount, Config } from "@cloudflare/workers-utils";

class NoDefaultValueProvided extends UserError {
	constructor() {
		super("This command cannot be run in a non-interactive context", {
			telemetryMessage: "remote bindings prompt default missing",
		});
	}
}

export function createRemoteBindingsAuth(logger: RemoteBindingsLogger) {
	const context = {
		logger,
		userAgent: `remote-bindings/${packageVersion}`,
		async prompt(question: string) {
			if (isNonInteractiveOrCI()) {
				throw new NoDefaultValueProvided();
			}
			return inputPrompt<string>({
				type: "text",
				question,
				label: "Answer",
				throwOnError: true,
			});
		},
		async select(
			question: string,
			options: { choices: { title: string; value: string }[] }
		) {
			if (isNonInteractiveOrCI()) {
				throw new NoDefaultValueProvided();
			}
			return inputPrompt<string>({
				type: "select",
				question,
				label: "Account",
				options: options.choices.map((choice) => ({
					label: choice.title,
					value: choice.value,
				})),
				throwOnError: true,
			});
		},
		isNoDefaultValueProvidedError: (error: unknown) =>
			error instanceof NoDefaultValueProvided,
	};
	const useCfAuth = "CLOUDFLARE_CF_AUTH" in process.env;
	return {
		auth: useCfAuth ? createCfAuth(context) : createWranglerAuth(context),
		useCfAuth,
	};
}

export function getRemoteBindingsAuthHook(
	auth: AsyncHook<CfAccount> | undefined,
	accountId: Config["account_id"] | undefined,
	profileDir: string | undefined,
	logger: RemoteBindingsLogger
): AsyncHook<CfAccount> {
	if (auth) {
		return auth;
	}

	const { auth: remoteBindingsAuth, useCfAuth } =
		createRemoteBindingsAuth(logger);
	const profileStore = useCfAuth
		? createCfProfileStore({ logger })
		: createWranglerProfileStore({ logger });
	const profile = profileStore.resolve({
		cwd: profileDir ?? process.cwd(),
	});
	remoteBindingsAuth.setProfile(profile);

	return async () => ({
		accountId: await remoteBindingsAuth.requireAuth(
			accountId ? { account_id: accountId } : {}
		),
		apiToken: remoteBindingsAuth.requireApiToken(),
	});
}
