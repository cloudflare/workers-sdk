import chalk from "chalk";
import { fetchPagedListResult, fetchResult } from "../cfetch";
import { isAuthenticationError } from "../deploy/deploy";
import { logger } from "../logger";
import { fetchMembershipRoles } from "./membership";
import { getAPIToken, getAuthFromEnv, getScopes } from ".";

export async function whoami(accountFilter?: string) {
	logger.log("Getting User settings...");
	const user = await getUserInfo();
	if (!user) {
		return void logger.log(
			"You are not authenticated. Please run `wrangler login`."
		);
	}
	if (user.authType === "API Token") {
		logger.log(
			"ℹ️  The API Token is read from the CLOUDFLARE_API_TOKEN in your environment."
		);
	}
	await printUserEmail(user);
	await printAccountList(user);
	await printTokenPermissions(user);
	await printMembershipInfo(user, accountFilter);
}

function printUserEmail(user: UserInfo) {
	if (!user.email) {
		return void logger.log(
			`👋 You are logged in with an ${user.authType}. Unable to retrieve email for this user. Are you missing the \`User->User Details->Read\` permission?`
		);
	}
	logger.log(
		`👋 You are logged in with an ${user.authType}, associated with the email ${chalk.blue(user.email)}.`
	);
}

function printAccountList(user: UserInfo) {
	logger.table(
		user.accounts.map((account) => ({
			"Account Name": account.name,
			"Account ID": account.id,
		}))
	);
}

function printTokenPermissions(user: UserInfo) {
	const permissions =
		user.tokenPermissions?.map((scope) => scope.split(":")) ?? [];
	if (user.authType !== "OAuth Token") {
		return void logger.log(
			`🔓 To see token permissions visit https://dash.cloudflare.com/profile/api-tokens.`
		);
	}
	logger.log(
		`🔓 Token Permissions: If scopes are missing, you may need to logout and re-login.`
	);
	logger.log(`Scope (Access)`);
	for (const [scope, access] of permissions) {
		logger.log(`- ${scope} ${access ? `(${access})` : ``}`);
	}
}

async function printMembershipInfo(user: UserInfo, accountFilter?: string) {
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
		const membershipRoles = await fetchMembershipRoles(selectedAccount.id);
		if (!membershipRoles) {
			return;
		}
		logger.log(
			`🎢 Membership roles in "${selectedAccount.name}": Contact account super admin to change your permissions.`
		);
		for (const role of membershipRoles) {
			logger.log(`- ${role}`);
		}
	} catch (e) {
		if (isAuthenticationError(e)) {
			logger.log(
				`🎢 Unable to get membership roles. Make sure you have permissions to read the account.`
			);
			return;
		} else {
			throw e;
		}
	}
}

type AuthType = "Global API Key" | "API Token" | "OAuth Token";
export interface UserInfo {
	apiToken: string;
	authType: AuthType;
	email: string | undefined;
	accounts: AccountInfo[];
	tokenPermissions: string[] | undefined;
}

export async function getUserInfo(): Promise<UserInfo | undefined> {
	const apiToken = getAPIToken();
	if (!apiToken) {
		return;
	}

	const tokenPermissions = await getTokenPermissions();

	const usingEnvAuth = !!getAuthFromEnv();
	const usingGlobalAuthKey = "authKey" in apiToken;
	return {
		apiToken: usingGlobalAuthKey ? apiToken.authKey : apiToken.apiToken,
		authType: usingGlobalAuthKey
			? "Global API Key"
			: usingEnvAuth
				? "API Token"
				: "OAuth Token",
		email: "authEmail" in apiToken ? apiToken.authEmail : await getEmail(),
		accounts: await getAccounts(),
		tokenPermissions,
	};
}

async function getEmail(): Promise<string | undefined> {
	try {
		const { email } = await fetchResult<{ email: string }>("/user");
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

async function getAccounts(): Promise<AccountInfo[]> {
	return await fetchPagedListResult<AccountInfo>("/accounts");
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
