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

export interface KVNamespaceInfo {
	id: string;
	title: string;
}

export type Database = {
	created_at: string;
	uuid: string;
	name: string;
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
	failSilently = false,
	queryParams = {}
) => {
	try {
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
	} catch (e) {
		if (failSilently) {
			return;
		}
		if (e instanceof ApiError) {
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

export const listTmpE2EProjects = async () => {
	const pageSize = 10;
	let page = 1;

	const projects: Project[] = [];
	while (projects.length % pageSize === 0) {
		const res = (await apiFetch(`/pages/projects`, { method: "GET" }, false, {
			per_page: pageSize,
			page,
		})) as Project[];
		projects.push(...res);
		page++;
		if (res.length < pageSize) {
			break;
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
	await apiFetch(
		`/pages/projects/${project}`,
		{
			method: "DELETE",
		},
		true
	);
};

export const listTmpE2EWorkers = async () => {
	const res = (await apiFetch(`/workers/scripts`, {
		method: "GET",
	})) as Worker[];
	return res.filter(
		(p) =>
			p.id.startsWith("tmp-e2e-") &&
			// Workers are more than an hour old
			Date.now() - new Date(p.created_on).valueOf() > 1000 * 60 * 60
	);
};

export const deleteWorker = async (id: string) => {
	await apiFetch(
		`/workers/scripts/${id}`,
		{
			method: "DELETE",
		},
		true
	);
};

export const listTmpKVNamespaces = async () => {
	const pageSize = 100;
	let page = 1;
	const results: KVNamespaceInfo[] = [];
	while (results.length % pageSize === 0) {
		const res = (await apiFetch(
			`/storage/kv/namespaces`,
			{ method: "GET" },
			false,
			new URLSearchParams({
				per_page: pageSize.toString(),
				order: "title",
				direction: "asc",
				page: page.toString(),
			})
		)) as KVNamespaceInfo[];
		page++;
		results.push(...res);
		if (res.length < pageSize || page > 5) {
			break;
		}
	}
	return results.filter(
		(kv) => kv.title.includes("tmp-e2e") || kv.title.includes("tmp_e2e")
	);
};

export const deleteKVNamespace = async (id: string) => {
	await apiFetch(
		`/storage/kv/namespaces/${id}`,
		{
			method: "DELETE",
		},
		true
	);
};

export const listTmpDatabases = async () => {
	const pageSize = 100;
	let page = 1;
	const results: Database[] = [];
	while (results.length % pageSize === 0) {
		const res = (await apiFetch(
			`/d1/database`,
			{ method: "GET" },
			false,
			new URLSearchParams({
				per_page: pageSize.toString(),
				page: page.toString(),
			})
		)) as Database[];
		page++;
		results.push(...res);

		if (res.length < pageSize || page > 5) {
			break;
		}
	}
	return results.filter(
		(db) =>
			db.name.includes("tmp-e2e") && // Databases are more than an hour old
			Date.now() - new Date(db.created_at).valueOf() > 1000 * 60 * 60
	);
};

export const deleteDatabase = async (id: string) => {
	await apiFetch(
		`/d1/database/${id}`,
		{
			method: "DELETE",
		},
		true
	);
};
