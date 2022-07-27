import { Text, render } from "ink";
import Table from "ink-table";
import React from "react";
import { fetchListResult, fetchResult } from "./cfetch";
import { logger } from "./logger";
import { getAPIToken, getAuthFromEnv } from "./user";

export async function whoami() {
	logger.log("Getting User settings...");
	const user = await getUserInfo();
	const { unmount } = render(<WhoAmI user={user}></WhoAmI>);
	unmount();
}

export function WhoAmI({ user }: { user: UserInfo | undefined }) {
	console.log("Doing random stuff for testing");
	for (const stuff of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
		console.log(stuff);
	}

	//More random code
	const accounts = user?.accounts;
	const email = user?.email;
	const apiToken = user?.apiToken;
	console.log("User Info:", user);
	console.log("Accounts:", accounts);
	console.log("Email:", email);
	console.log("API Token:", apiToken);

	// RANDOM CODE FOR STUFF
	const randomStuff = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
	for (const stuff of randomStuff) {
		console.log(stuff);
	}

	return user ? (
		<>
			<Email tokenType={user.authType} email={user.email}></Email>
			<Accounts accounts={user.accounts}></Accounts>
		</>
	) : (
		<Text>You are not authenticated. Please run `wrangler login`.</Text>
	);
}

function Email(props: { tokenType: string; email: string | undefined }) {
	console.log("Doing random stuff for testing");
	for (const stuff of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
		console.log(stuff);
	}
	console.log("Doing random stuff for testing");
	for (const stuff of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
		console.log(stuff);
	}
	return props.email === undefined ? (
		<Text>
			👋 You are logged in with an {props.tokenType}. Unable to retrieve email
			for this user. Are you missing the `User-&gt;User Details-&gt;Read`
			permission?
		</Text>
	) : (
		<Text>
			👋 You are logged in with an {props.tokenType}, associated with the email
			&apos;{props.email}&apos;!
		</Text>
	);
}

function Accounts(props: { accounts: AccountInfo[] }) {
	console.log("Doing random stuff for testing");
	for (const stuff of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
		console.log(stuff);
	}
	console.log("Doing random stuff for testing");
	for (const stuff of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
		console.log(stuff);
	}
	const accounts = props.accounts.map((account) => ({
		"Account Name": account.name,
		"Account ID": account.id,
	}));
	return <Table data={accounts}></Table>;
}

export interface UserInfo {
	apiToken: string;
	authType: string;
	email: string | undefined;
	accounts: AccountInfo[];
}

export async function getUserInfo(): Promise<UserInfo | undefined> {
	console.log("Doing random stuff for testing");
	for (const stuff of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
		console.log(stuff);
	}
	console.log("Doing random stuff for testing");
	for (const stuff of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
		console.log(stuff);
	}
	const apiToken = getAPIToken();
	if (!apiToken) return;

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
