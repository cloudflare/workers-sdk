import { fetchResult } from "../cfetch";

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
	accountId: string,
	body: CreateStore
): Promise<Store> {
	return await fetchResult(`/accounts/${accountId}/secrets_store/stores`, {
		method: "POST",
		body: JSON.stringify(body),
	});
}

export async function deleteStore(
	accountId: string,
	storeId: string
): Promise<Store> {
	return await fetchResult(
		`/accounts/${accountId}/secrets_store/stores/${storeId}`,
		{
			method: "DELETE",
		}
	);
}

export async function listStores(
	accountId: string,
	urlParams: URLSearchParams
): Promise<Store[]> {
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
	accountId: string,
	storeId: string,
	urlParams: URLSearchParams
): Promise<Secret[]> {
	return await fetchResult(
		`/accounts/${accountId}/secrets_store/stores/${storeId}/secrets`,
		{
			method: "GET",
		},
		urlParams
	);
}

export async function getSecret(
	accountId: string,
	storeId: string,
	secretId: string
): Promise<Secret> {
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
	comment?: string;
};

export async function createSecret(
	accountId: string,
	storeId: string,
	body: CreateSecret
): Promise<Secret[]> {
	return await fetchResult(
		`/accounts/${accountId}/secrets_store/stores/${storeId}/secrets`,
		{
			method: "POST",
			body: JSON.stringify([body]),
		}
	);
}

export type UpdateSecret = {
	value?: string;
	scopes?: string[];
	comment?: string;
};

export async function updateSecret(
	accountId: string,
	storeId: string,
	secretId: string,
	body: UpdateSecret
): Promise<Secret> {
	return await fetchResult(
		`/accounts/${accountId}/secrets_store/stores/${storeId}/secrets/${secretId}`,
		{
			method: "PATCH",
			body: JSON.stringify(body),
		}
	);
}

export async function deleteSecret(
	accountId: string,
	storeId: string,
	secretId: string
): Promise<Secret> {
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
	accountId: string,
	storeId: string,
	secretId: string,
	body: DuplicateSecret
): Promise<Secret> {
	return await fetchResult(
		`/accounts/${accountId}/secrets_store/stores/${storeId}/secrets/${secretId}/duplicate`,
		{
			method: "POST",
			body: JSON.stringify(body),
		}
	);
}
