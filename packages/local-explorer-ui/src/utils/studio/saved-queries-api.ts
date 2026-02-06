import type { StudioResource, StudioSavedQuery } from "../../types/studio";

const baseUrl = "https://dashboard-enhancements.outerbase.workers.dev";
// const baseUrl = 'http://localhost:8787'

const getHeaders = (_resource: StudioResource) => {
	return {
		"Content-Type": "application/json",
		"x-user-id": "123",
	};
};

export async function getSavedQueries(
	resource: StudioResource
): Promise<StudioSavedQuery[]> {
	return fetch(`${baseUrl}/api/v1/query`, {
		method: "GET",
		headers: getHeaders(resource),
	})
		.then((res) => res.json())
		.then((res) => {
			const items = res?.response?.items || [];
			return items;
		});
}

export async function dropSavedQuery(
	resource: StudioResource,
	savedQueryId: string
): Promise<StudioSavedQuery[]> {
	return fetch(`${baseUrl}/api/v1/query/${savedQueryId}`, {
		method: "DELETE",
		headers: getHeaders(resource),
	}).then((res) => res.json());
}

export async function updateSavedQuery(
	resource: StudioResource,
	savedQueryId: string,
	options: {
		name?: string;
		type?: "SQL";
		data?: {
			query: string;
		};
	}
): Promise<StudioSavedQuery[]> {
	return fetch(`${baseUrl}/api/v1/query/${savedQueryId}`, {
		method: "PUT",
		headers: getHeaders(resource),
		body: JSON.stringify(options),
	}).then((res) => res.json());
}

export async function createSavedQuery(
	resource: StudioResource,
	options: {
		name: string;
		type: "SQL";
		data: {
			query: string;
		};
	}
): Promise<{
	response: StudioSavedQuery;
}> {
	return fetch(`${baseUrl}/api/v1/query`, {
		method: "POST",
		headers: getHeaders(resource),
		body: JSON.stringify({
			...options,
			...(resource.databaseId
				? {
						resourceId: resource.databaseId,
					}
				: {}),
		}),
	}).then((res) => res.json());
}
