import { fetch } from "undici";
import type { RequestInit, Response } from "undici";

type ApiErrorBody = {
	errors: string[];
};

type ApiSuccessBody = {
	result: unknown[];
};

export type Project = {
	name: string;
	created_on: string;
};

export type Worker = {
	id: string;
	created_on: string;
};

class ApiError extends Error {
	constructor(
		readonly url: string,
		readonly init: RequestInit,
		readonly response: Response
	) {
		super();
	}
}

class FatalError extends Error {
	constructor(readonly exitCode: number) {
		super();
	}
}

const apiFetch = async (
	path: string,
	init = { method: "GET" },
	queryParams = {}
) => {
	const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}`;
	let queryString = new URLSearchParams(queryParams).toString();
	if (queryString) {
		queryString = "?" + queryString;
	}
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

export const listTmpE2EProjects = async () => {
	const pageSize = 10;
	let page = 1;

	const projects: Project[] = [];
	while (projects.length % pageSize === 0) {
		try {
			const res = (await apiFetch(
				`/pages/projects`,
				{ method: "GET" },
				{
					per_page: pageSize,
					page,
				}
			)) as Project[];
			projects.push(...res);
			page++;
			if (res.length < pageSize) {
				break;
			}
		} catch (e) {
			if (e instanceof ApiError) {
				console.error("Failed to fetch project list");
				console.error(e.url, e.init);
				console.error(`(${e.response.status}) ${e.response.statusText}`);
				const body = (await e.response.json()) as ApiErrorBody;
				console.error(body.errors);
			} else {
				console.error(e);
			}
			throw new FatalError(1);
		}
	}

	return projects.filter(
		(p) =>
			p.name.startsWith("tmp-e2e-") &&
			// Projects are more than an hour old
			Date.now() - new Date(p.created_on).valueOf() > 1000 * 60 * 60
	);
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

export const listTmpE2EWorkers = async () => {
	try {
		const res = (await apiFetch(`/workers/scripts`, {
			method: "GET",
		})) as Worker[];
		return res.filter(
			(p) =>
				p.id.startsWith("tmp-e2e-") &&
				// Workers are more than an hour old
				Date.now() - new Date(p.created_on).valueOf() > 1000 * 60 * 60
		);
	} catch (e) {
		if (e instanceof ApiError) {
			console.error("Failed to fetch workers list");
			console.error(e.url, e.init);
			console.error(`(${e.response.status}) ${e.response.statusText}`);
			const body = (await e.response.json()) as ApiErrorBody;
			console.error(body.errors);
		} else {
			console.error(e);
		}
		throw new FatalError(1);
	}
};

export const deleteWorker = async (id: string) => {
	try {
		await apiFetch(`/workers/scripts/${id}`, {
			method: "DELETE",
		});
	} catch {}
};
