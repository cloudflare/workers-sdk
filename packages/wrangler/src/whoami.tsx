import chalk from "chalk";
import { fetchListResult, fetchResult } from "./cfetch";
import { line, table } from "./ui";
import { getAPIToken, getAuthFromEnv, getScopes } from "./user";

export async function whoami(): Promise<void> {
	line("Getting User settings...");
	const user = await getUserInfo();
	if (user === undefined) {
		return void line("You are not authenticated. Please run `wrangler login`.");
	}

	if (user.email !== undefined) {
		line(
			`👋 You are logged in with an ${
				user.authType
			}, associated with the email ${chalk.blue(user.email)}!`
		);
	} else {
		line(
			`👋 You are logged in with an ${user.authType}. Unable to retrieve email for this user. Are you missing the \`User->User Details->Read\` permission?`
		);
	}
	table(
		user.accounts.map((account) => ({
			"Account Name": account.name,
			"Account ID": account.id,
		}))
	);
	const permissions =
		user.tokenPermissions?.map((scope) => scope.split(":")) ?? [];

	if (user.authType !== "OAuth Token") {
		return void line(
			`🔓 To see token permissions visit https://dash.cloudflare.com/profile/api-tokens`
		);
	}
	line(
		`🔓 Token Permissions: If scopes are missing, you may need to logout and re-login.`
	);
	line(`Scope (Access)`);
	for (const [scope, access] of permissions) {
		line(`- ${scope} ${access ? `(${access})` : ``}`);
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
	if (!apiToken) return;

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
		if ((e as { code?: number }).code === 9109) {
			return undefined;
		} else {
			throw e;
		}
	}
}

type AccountInfo = { name: string; id: string };

async function getAccounts(): Promise<AccountInfo[]> {
	return await fetchListResult<AccountInfo>("/accounts");
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
