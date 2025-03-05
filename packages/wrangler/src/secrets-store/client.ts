import { fetchResult } from "../cfetch";
import { requireAuth } from "../user";
import type { Config } from "../config";

// Stores API

export type Store = {
	id: string;
	account_id: string;
	name: string;
	created: string;
	modified: string;
};

export type CreateStore = {
	name: string;
};

export async function createStore(
	config: Config,
	body: CreateStore
): Promise<Store> {
	const accountId = await requireAuth(config);
	return await fetchResult(`/accounts/${accountId}/secrets_store/stores`, {
		method: "POST",
		body: JSON.stringify(body),
	});
}

export async function listStores(
	config: Config,
	urlParams: URLSearchParams
): Promise<Store[]> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		`/accounts/${accountId}/secrets_store/stores`,
		{
			method: "GET",
		},
		urlParams
	);
}

// Secrets API

export type Secret = {
	id: string;
	store_id: string;
	name: string;
	comment: string;
	scopes: string[];
	created: string;
	modified: string;
	status: string;
};

export async function listSecrets(
	config: Config,
	storeId: string,
	urlParams: URLSearchParams
): Promise<Secret[]> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		`/accounts/${accountId}/secrets_store/stores/${storeId}/secrets`,
		{
			method: "GET",
		},
		urlParams
	);
}

export async function getSecret(
	config: Config,
	storeId: string,
	secretId: string
): Promise<Secret> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		`/accounts/${accountId}/secrets_store/stores/${storeId}/secrets/${secretId}`,
		{
			method: "GET",
		}
	);
}

export type CreateSecret = {
	name: string;
	value: string;
	scopes: string[];
	comment: string | null | undefined;
};

export async function createSecret(
	config: Config,
	storeId: string,
	body: CreateSecret
): Promise<Secret[]> {
	const accountId = await requireAuth(config);
	if (!body.comment) {
		delete body.comment;
	}
	return await fetchResult(
		`/accounts/${accountId}/secrets_store/stores/${storeId}/secrets`,
		{
			method: "POST",
			body: JSON.stringify([body]),
		}
	);
}

export type UpdateSecret = {
	value: string | null | undefined;
	scopes: string[] | null | undefined;
	comment: string | null | undefined;
};

export async function updateSecret(
	config: Config,
	storeId: string,
	secretId: string,
	body: UpdateSecret
): Promise<Secret> {
	const accountId = await requireAuth(config);
	if (!body.value) {
		delete body.value;
	}
	if (!body.scopes) {
		delete body.scopes;
	}
	if (!body.comment) {
		delete body.comment;
	}
	return await fetchResult(
		`/accounts/${accountId}/secrets_store/stores/${storeId}/secrets/${secretId}`,
		{
			method: "PATCH",
			body: JSON.stringify(body),
		}
	);
}

export async function deleteSecret(
	config: Config,
	storeId: string,
	secretId: string
): Promise<Secret> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		`/accounts/${accountId}/secrets_store/stores/${storeId}/secrets/${secretId}`,
		{
			method: "DELETE",
		}
	);
}

export type DuplicateSecret = {
	name: string;
	scopes: string[];
	comment: string;
};

export async function duplicateSecret(
	config: Config,
	storeId: string,
	secretId: string,
	body: DuplicateSecret
): Promise<Secret> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		`/accounts/${accountId}/secrets_store/stores/${storeId}/secrets/${secretId}/duplicate`,
		{
			method: "POST",
			body: JSON.stringify(body),
		}
	);
}
