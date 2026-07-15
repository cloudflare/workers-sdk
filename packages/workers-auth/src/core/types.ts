import type { OAuthConsentPages, OAuthFlowContext } from "../context";
import type { FileFormat } from "./file-format";

/** Minimal shape of the interactive `select` prompt's options for account selection. */
export interface AccountSelectOptions {
	choices: { title: string; value: string }[];
}

/**
 * Dependency-injection surface for {@link createCloudflareAuth}.
 *
 * Everything here is a consumer primitive that genuinely can't live in this
 * package: the logger, the interactive prompts (`prompt` / `select`, whose
 * implementations live in the consuming CLI, e.g. wrangler's `dialogs.ts`), and
 * the User-Agent string. All the auth *logic* lives in the package and is
 * parameterised by the {@link CliDescriptor} descriptor instead.
 */
export interface AuthContext {
	/** The consumer's logger (drop-in for wrangler's logger singleton). */
	logger: OAuthFlowContext["logger"];

	/**
	 * User-Agent header sent with the account/membership REST calls
	 * (e.g. `wrangler/<version>` or `cf/<version>`).
	 */
	userAgent: string;

	/** The interactive text prompt, used for the temporary-preview-account terms. */
	prompt: (question: string) => Promise<string>;

	/** The interactive selection prompt. */
	select: (text: string, options: AccountSelectOptions) => Promise<string>;

	/**
	 * Whether the given error is the "no default value / non-interactive" signal
	 * thrown by {@link AuthContext.select} (wrangler's `NoDefaultValueProvided`).
	 */
	isNoDefaultValueProvidedError: (error: unknown) => boolean;
}

/**
 * Everything that varies between the Cloudflare CLIs that share this auth layer
 * (wrangler, cf, …). The CLI-agnostic {@link createCloudflareAuth} factory
 * reads every consumer-specific value from here, so a new CLI is a descriptor
 * rather than a fork of the factory.
 */
export interface CliDescriptor {
	/** CLI name used in user-facing messaging and keyring install-dir scoping (e.g. `"wrangler"`). */
	cliName: string;

	/** Commands surfaced in auth guidance. */
	commands: {
		login: string;
		whoami: string;
		createProfile?: string;
	};

	/**
	 * OS-keyring service identifier. Becomes the `-s` arg to macOS `security`,
	 * the `service` attribute for Linux `secret-tool`, and the `service` arg to
	 * `@napi-rs/keyring` on Windows. Distinct per CLI so credentials don't collide.
	 */
	keyringServiceName: string;

	/** The CLI's registered OAuth app client ID (or a lazy env-driven resolver). */
	clientId: string | (() => string);

	/** The CLI's branded OAuth consent pages. */
	consent: OAuthConsentPages;

	/** The `redirect_uri` registered on the CLI's OAuth app; also the local callback URL. */
	redirectUri: string;

	/**
	 * Whether Cloudflare Global API Key + email credentials are accepted.
	 * Defaults to `true`.
	 */
	allowGlobalAuthKey?: boolean;

	/** The CLI's global config directory, resolved lazily (re-read per call for tests). */
	getConfigPath: () => string;

	/** Absolute path to the temporary-preview-account cache file. */
	getTemporaryAccountConfigPath: () => string;

	/** On-disk file format for credentials / temporary-account / profile files. */
	fileFormat: FileFormat;

	/**
	 * Filename prefix for the cached account selection in the config cache
	 * (e.g. `"wrangler-account"` → `wrangler-account.json`). Always JSON.
	 */
	accountCachePrefix: string;

	/**
	 * Namespace for the config-cache directory, isolating each CLI's cache so
	 * one CLI's login/logout purge never wipes another's. Omit to use wrangler's
	 * shared cache dir (the historical default).
	 */
	cacheNamespace?: string;

	/**
	 * Label for the CLI's config file, used in "set `account_id` in your <file>"
	 * hints. A getter so it can reflect runtime config state (wrangler resolves
	 * this from `configFileName(undefined)`).
	 */
	getConfigFileLabel: () => string;

	/** The live default OAuth scope keys (a getter so any reassignment of the mutable `DefaultScopeKeys` binding is observed). */
	getDefaultScopeKeys: () => string[];
}
