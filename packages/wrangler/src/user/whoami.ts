import {
	createFatalError,
	getCloudflareComplianceRegion,
} from "@cloudflare/workers-utils";
import chalk from "chalk";
import { fetchPagedListResult, fetchResult } from "../cfetch";
import { isAuthenticationError } from "../core/handle-errors";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import { formatMessage } from "../utils/format-message";
import { fetchMembershipRoles } from "./membership";
import { DefaultScopeKeys, getAPIToken, getAuthFromEnv, getScopes } from ".";
import type { ApiCredentials, Scope } from ".";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

/**
 * Represents the JSON output of `wrangler whoami --json`.
 */
export type WhoamiResult =
	| { loggedIn: false }
	| {
			loggedIn: true;
			authType: AuthType;
			email: string | undefined;
			accounts: AccountInfo[];
			tokenPermissions: string[] | undefined;
	  };

/**
 * Displays information about the currently authenticated user, including their
 * email, accounts, token permissions, and membership roles.
 *
 * When called with `accountFilter` and `configAccountId`, also checks for potential
 * `account_id` mismatches that could cause authentication errors.
 *
 * When `json` is true, outputs structured JSON to stdout and exits with a
 * non-zero status if the user is not authenticated.
 */
export async function whoami(
	complianceConfig: ComplianceConfig,
	accountFilter?: string,
	configAccountId?: string,
	json?: boolean
) {
	if (json) {
		const user = await getUserInfo(complianceConfig);
		if (!user) {
			throw createFatalError({ loggedIn: false } satisfies WhoamiResult, true);
		}
		const result: WhoamiResult = {
			loggedIn: true,
			authType: user.authType,
			email: user.email,
			accounts: user.accounts,
			tokenPermissions: user.tokenPermissions,
		};
		logger.json(result);
		return;
	}

	logger.log("Getting User settings...");
	const user = await getUserInfo(complianceConfig);
	if (!user) {
		logger.log("You are not authenticated. Please run `wrangler login`.");
		return;
	}
	printUserEmail(user);
	if (
		user.authType === "User API Token" ||
		user.authType === "Account API Token"
	) {
		logger.log(
			"ℹ️  The API Token is read from the CLOUDFLARE_API_TOKEN environment variable."
		);
	}
	printComplianceRegion(complianceConfig);
	printAccountList(user);
	printAccountIdMismatchWarning(user, accountFilter, configAccountId);
	printTokenPermissions(user);
	await printMembershipInfo(complianceConfig, user, accountFilter);
}

function printComplianceRegion(complianceConfig: ComplianceConfig) {
	const complianceRegion = getCloudflareComplianceRegion(complianceConfig);
	if (complianceRegion !== "public") {
		const complianceRegionSource = complianceConfig?.compliance_region
			? "Wrangler configuration"
			: "`CLOUDFLARE_COMPLIANCE_REGION` environment variable";
		logger.log(
			`🌍 The compliance region is set to "${chalk.blue(complianceRegion)}" via the ${complianceRegionSource}.`
		);
	}
}

function printUserEmail(user: UserInfo) {
	const redactFields = isNonInteractiveOrCI();

	if (user.authType === "Account API Token") {
		// Account API Tokens only have access to a single account
		const accountName = redactFields ? "(redacted)" : user.accounts[0].name;
		return void logger.log(
			`👋 You are logged in with an ${user.authType}, associated with the account ${chalk.blue(accountName)}.`
		);
	}
	if (!user.email) {
		return void logger.log(
			`👋 You are logged in with an ${user.authType}. Unable to retrieve email for this user. Are you missing the \`User->User Details->Read\` permission?`
		);
	}
	const email = redactFields ? "(redacted)" : user.email;
	logger.log(
		`👋 You are logged in with an ${user.authType}, associated with the email ${chalk.blue(email)}.`
	);
}

function printAccountList(user: UserInfo) {
	const redactFields = isNonInteractiveOrCI();

	logger.table(
		user.accounts.map((account) => ({
			"Account Name": redactFields ? "(redacted)" : account.name,
			"Account ID": account.id,
		}))
	);
}

/**
 * Prints a warning if the account_id in the Wrangler configuration does not match
 * any of the user's authenticated accounts.
 *
 * Only shows warning if:
 * 1. We have an accountFilter (the account ID from the failed request)
 * 2. We have a configAccountId (the account_id from the wrangler config)
 * 3. The accountFilter matches the configAccountId (meaning the config account_id was used)
 * 4. The accountFilter is NOT in the user's accounts list
 */
function printAccountIdMismatchWarning(
	user: UserInfo,
	accountFilter?: string,
	configAccountId?: string
) {
	if (!accountFilter || !configAccountId) {
		return;
	}

	// Check if the account ID from the failed request matches the configured account_id
	if (accountFilter !== configAccountId) {
		return;
	}

	// Check if the configured account_id is in the user's accounts
	const accountInUserAccounts = user.accounts.some(
		(account) => account.id === accountFilter
	);

	if (!accountInUserAccounts) {
		logger.log(
			formatMessage({
				text: `The \`account_id\` in your Wrangler configuration (${chalk.blue(configAccountId)}) does not match any of your authenticated accounts.`,
				kind: "warning",
				notes: [
					{
						text: "This may be causing the authentication error. Check your Wrangler configuration file and ensure the `account_id` is correct for your account.",
					},
				],
			})
		);
	}
}

function printTokenPermissions(user: UserInfo) {
	const permissions =
		user.tokenPermissions?.map((scope) => scope.split(":")) ?? [];
	if (user.authType !== "OAuth Token") {
		return void logger.log(
			`🔓 To see token permissions visit https://dash.cloudflare.com/${user.authType === "User API Token" ? "profile" : user.accounts[0].id}/api-tokens.`
		);
	}
	logger.log(`🔓 Token Permissions:`);
	logger.log(`Scope (Access)`);

	// This Set contains all the scopes we expect to see (that Wrangler requests by default)
	const expectedScopes = new Set(DefaultScopeKeys);
	for (const [scope, access] of permissions) {
		// We'll remove scopes from the set of scopes that we expect to see when we see them in the API response
		expectedScopes.delete(`${scope}:${access}` as Scope);
		logger.log(`- ${scope} ${access ? `(${access})` : ``}`);
	}

	// If we've iterated through all scopes in the API response and there are still expected scopes remaining,
	// then we know that Wrangler may not behave as expected since the current token doesn't have all the expected scopes
	// Warn, and tell the user how to fix it
	if (expectedScopes.size > 0) {
		logger.log("");
		logger.log(
			formatMessage({
				text: "Wrangler is missing some expected Oauth scopes. To fix this, run `wrangler login` to refresh your token. The missing scopes are:",
				kind: "warning",
				notes: [...expectedScopes.values()].map((s) => ({ text: `- ${s}` })),
			})
		);
	}
}

async function printMembershipInfo(
	complianceConfig: ComplianceConfig,
	user: UserInfo,
	accountFilter?: string
) {
	try {
		if (!accountFilter) {
			return;
		}
		const eq = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" }) == 0; // prettier-ignore
		const selectedAccount = user.accounts.find(
			(a) => eq(a.id, accountFilter) || eq(a.name, accountFilter)
		);
		if (!selectedAccount) {
			return;
		}
		const membershipRoles = await fetchMembershipRoles(
			complianceConfig,
			selectedAccount.id
		);
		if (!membershipRoles) {
			return;
		}
		const redactFields = isNonInteractiveOrCI();
		const accountName = redactFields ? "(redacted)" : selectedAccount.name;
		logger.log(
			`🎢 Membership roles in "${accountName}": Contact account super admin to change your permissions.`
		);
		for (const role of membershipRoles) {
			logger.log(`- ${role}`);
		}
	} catch (e) {
		if (isAuthenticationError(e)) {
			logger.log(
				`🎢 Unable to get membership roles. Make sure you have permissions to read the account. Are you missing the \`User->Memberships->Read\` permission?`
			);
			return;
		} else {
			throw e;
		}
	}
}

type AuthType =
	| "Global API Key"
	| "User API Token"
	| "Account API Token"
	| "OAuth Token";
export interface UserInfo {
	apiToken: string;
	authType: AuthType;
	email: string | undefined;
	accounts: AccountInfo[];
	tokenPermissions: string[] | undefined;
}

export async function getUserInfo(
	complianceConfig: ComplianceConfig
): Promise<UserInfo | undefined> {
	const apiToken = getAPIToken();
	if (!apiToken) {
		return;
	}
	const authType = await getAuthType(complianceConfig, apiToken);

	const tokenPermissions = await getTokenPermissions();

	return {
		apiToken: "authKey" in apiToken ? apiToken.authKey : apiToken.apiToken,
		authType,
		email:
			"authEmail" in apiToken
				? apiToken.authEmail
				: await getEmail(complianceConfig),
		accounts: await getAccounts(complianceConfig),
		tokenPermissions,
	};
}

/**
 * What method is the current Wrangler session authenticated through?
 */
async function getAuthType(
	complianceConfig: ComplianceConfig,
	credentials: ApiCredentials
): Promise<AuthType> {
	if ("authKey" in credentials) {
		return "Global API Key";
	}

	const usingEnvAuth = !!getAuthFromEnv();
	if (!usingEnvAuth) {
		return "OAuth Token";
	}

	const tokenType = await getTokenType(complianceConfig);
	if (tokenType === "account") {
		return "Account API Token";
	} else {
		return "User API Token";
	}
}

/**
 * Is the current API token account scoped or user scoped?
 */
async function getTokenType(
	complianceConfig: ComplianceConfig
): Promise<"user" | "account"> {
	try {
		// Try verifying the current token as a user scoped API token
		await fetchResult<{ id: string }>(complianceConfig, "/user/tokens/verify");

		// If the call succeeds, the token is user scoped
		return "user";
	} catch (e) {
		// This is an "Invalid API Token" error, which indicates that the current token is _not_ user scoped
		if ((e as { code?: number }).code === 1000) {
			return "account";
		}
		// Some other API error? This isn't expected in normal usage
		throw e;
	}
}

async function getEmail(
	complianceConfig: ComplianceConfig
): Promise<string | undefined> {
	try {
		const { email } = await fetchResult<{ email: string }>(
			complianceConfig,
			"/user"
		);
		return email;
	} catch (e) {
		const unauthorizedAccess = 9109;
		if ((e as { code?: number }).code === unauthorizedAccess) {
			return undefined;
		} else {
			throw e;
		}
	}
}

type AccountInfo = { name: string; id: string };

async function getAccounts(
	complianceConfig: ComplianceConfig
): Promise<AccountInfo[]> {
	return await fetchPagedListResult<AccountInfo>(complianceConfig, "/accounts");
}

async function getTokenPermissions(): Promise<string[] | undefined> {
	// Tokens can either be API tokens or Oauth tokens.
	// Here we only extract permissions from OAuth tokens.

	return getScopes() as string[];

	// In future we may be able to get the token permissions on an API token,
	// but currently we cannot as that permission is not able to be added to
	// an API token.

	// try {
	// 	// First we get the token identifier (only returned on API tokens)
	// 	const { id } = await fetchResult<{ id: string }>("/user/tokens/verify");

	// 	// Get the token permissions for the current token
	// 	const { policies } = await fetchResult<{
	// 		policies: { id: string; name: string }[];
	// 	}>(`/user/tokens/${id}`);

	// 	return policies.map((p) => p.name);
	// } catch (e) {
	// 	if ((e as { code?: number }).code === 1000) {
	// 		// Invalid token - Oauth token

	// 		// Get scopes
	// 		const scopes = getScopes() as string[];
	// 		// We may not get scopes back if they are not currently cached,
	// 		// however next time an access token is requested,
	// 		// the scopes will be added to the cache.
	// 		return scopes;
	// 	} else if ((e as { code?: number }).code === 9109) {
	// 		// Token cannot view its permissions
	// 		return undefined;
	// 	} else {
	// 		throw e;
	// 	}
	// }
}
