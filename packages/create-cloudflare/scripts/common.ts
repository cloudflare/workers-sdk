import { fetch } from "undici";

type ApiSuccessBody = {
	result: any[];
};

export type Project = {
	name: string;
	created_on: string;
};

export type Worker = {
	id: string;
	created_on: string;
};

const apiFetch = async (
	path: string,
	init = { method: "GET" },
	queryParams = {}
) => {
	const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}`;
	const queryString = queryParams
		? `?${new URLSearchParams(queryParams).toString()}`
		: "";
	const url = `${baseUrl}${path}${queryString}`;

	const response = await fetch(url, {
		...init,
		headers: {
			Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
		},
	});

	if (response.status >= 400) {
		throw { url, init, response };
	}

	const json = (await response.json()) as ApiSuccessBody;

	return json.result;
};

export const deleteProject = async (project: string) => {
	try {
		await apiFetch(`/pages/projects/${project}`, {
			method: "DELETE",
		});
	} catch {
		// Ignore errors
	}
};

export const deleteWorker = async (id: string) => {
	try {
		await apiFetch(`/workers/scripts/${id}`, {
			method: "DELETE",
		});
	} catch {
		// Ignore errors
	}
};
