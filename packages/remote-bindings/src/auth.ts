import { inputPrompt } from "@cloudflare/cli-shared-helpers/interactive";
import { createCfAuth } from "@cloudflare/workers-auth/cf";
import {
	createWranglerAuth,
	createWranglerProfileStore,
} from "@cloudflare/workers-auth/wrangler";
import { isNonInteractiveOrCI, UserError } from "@cloudflare/workers-utils";
import { version as packageVersion } from "../package.json";
import type { RemoteBindingsLogger } from "./logger";
import type { CfAccount, Config } from "@cloudflare/workers-utils";

class NoDefaultValueProvided extends UserError {
	constructor() {
		super("This command cannot be run in a non-interactive context", {
			telemetryMessage: "remote bindings prompt default missing",
		});
	}
}

export function createDefaultAuthHook(
	logger: RemoteBindingsLogger,
	accountId: string | undefined,
	complianceRegion: Config["compliance_region"],
	profileDir?: string
): () => Promise<CfAccount> {
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
	const useCfAuth = "CLOUDFLARE_JSON_AUTH" in process.env;
	const auth = useCfAuth ? createCfAuth(context) : createWranglerAuth(context);
	if (!useCfAuth) {
		const profile = createWranglerProfileStore({ logger }).resolve({
			cwd: profileDir ?? process.cwd(),
		});
		auth.setProfile(profile);
	}

	return async () => {
		const config = {
			account_id: accountId,
			compliance_region: complianceRegion,
		};
		const resolvedAccountId = await auth.requireAuth(config);
		const apiToken = auth.requireApiToken();
		return { accountId: resolvedAccountId, apiToken };
	};
}
