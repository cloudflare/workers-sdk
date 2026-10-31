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

export function createRemoteBindingsAuth(
	logger: RemoteBindingsLogger,
	useCfAuth = "CLOUDFLARE_CF_AUTH" in process.env
) {
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
	selectDevelopmentProfile(remoteBindingsAuth, useCfAuth, profileDir, logger);

	return async () => ({
		accountId: await remoteBindingsAuth.requireAuth(
			accountId ? { account_id: accountId } : {}
		),
		apiToken: remoteBindingsAuth.requireApiToken(),
	});
}

/**
 * Resolve human OAuth credentials for development OIDC issuance. This
 * deliberately reads the selected profile on every call, including when an
 * API token or temporary account is active for other development features.
 * Server-side authorization still determines which Worker the user can use.
 *
 * @param accountId Configured account selection, if known.
 * @param profileDir Project directory used for profile selection.
 * @param logger Development server logger.
 * @returns A lazy hook; creating it never logs in or makes a network request.
 */
export function getDevelopmentOidcAuthHook(
	accountId: Config["account_id"] | undefined,
	profileDir: string | undefined,
	logger: RemoteBindingsLogger,
	cfAuth?: boolean
): () => Promise<CfAccount> {
	const { auth, useCfAuth } = createRemoteBindingsAuth(logger, cfAuth);
	const profile = selectDevelopmentProfile(auth, useCfAuth, profileDir, logger);
	return async () => {
		const token = await auth.getOAuthTokenFromLocalState();
		if (!token) {
			const cli = useCfAuth ? "cf" : "wrangler";
			const command =
				profile === "default"
					? useCfAuth
						? "cf auth login"
						: "wrangler login"
					: `${cli} auth create ${profile}`;
			throw new UserError(
				`Development OIDC requires a signed-in developer. Run \`${command}\` for the selected profile, then retry the getter. If you are already signed in, check your connection so the OAuth token can refresh. API tokens and temporary accounts cannot issue development identities.`,
				{ telemetryMessage: "development oidc oauth required" }
			);
		}
		return {
			accountId: await auth.getOrSelectAccountId(
				accountId ? { account_id: accountId } : {},
				{ credentials: { apiToken: token } }
			),
			apiToken: { apiToken: token },
		};
	};
}

function selectDevelopmentProfile(
	auth: ReturnType<typeof createRemoteBindingsAuth>["auth"],
	useCfAuth: boolean,
	profileDir: string | undefined,
	logger: RemoteBindingsLogger
): string {
	const profileStore = useCfAuth
		? createCfProfileStore({ logger })
		: createWranglerProfileStore({ logger });
	const profile = profileStore.resolve({
		profile: useCfAuth ? process.env.CLOUDFLARE_DEV_AUTH_PROFILE : undefined,
		cwd: profileDir ?? process.cwd(),
	});
	auth.setProfile(profile);
	return profile;
}
