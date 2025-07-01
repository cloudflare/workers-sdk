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

export type ContainerApplication = {
	created_at: string;
	id: string;
	name: string;
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

export type HyperdriveConfig = {
	id: string;
	name: string;
	created_on: string;
};

export type MTlsCertificateResponse = {
	id: string;
	name?: string;
	ca: boolean;
	certificates: string;
	expires_on: string;
	issuer: string;
	serial_number: string;
	signature: string;
	uploaded_on: string;
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

async function apiFetchResponse(
	path: string,
	init = { method: "GET" },
	queryParams = {}
): Promise<Response | false> {
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

	return response;
}

async function apiFetch<T>(
	path: string,
	method: string,
	failSilently = false
): Promise<false | T> {
	try {
		const response = await apiFetchResponse(path, { method });

		if (!response || response.ok === false) {
			return false;
		}

		const json = (await response.json()) as ApiSuccessBody;
		return json.result as T;
	} catch (e) {
		if (!failSilently) {
			if (e instanceof ApiError) {
				console.error(e.url, e.init);
				console.error(`(${e.response.status}) ${e.response.statusText}`);
				const body = (await e.response.json()) as ApiErrorBody;
				console.error(body.errors);
			} else {
				console.error(e);
			}
		}
		return false;
	}
}

async function apiFetchList<T>(path: string, queryParams = {}): Promise<T[]> {
	try {
		let page = 1;
		let totalCount = 0;
		let result: unknown[] = [];
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const response = await apiFetchResponse(
				path,
				{ method: "GET" },
				{
					page,
					per_page: 100,
					...queryParams,
				}
			);

			if (!response || response.ok === false) {
				return [];
			}

			const json = (await response.json()) as ApiSuccessBody;
			if ("result_info" in json && Array.isArray(json.result)) {
				const result_info = json.result_info as {
					page: number;
					count: number;
					total_count?: number;
					total_pages?: number;
				};
				console.log(path, result_info);

				result = [...result, ...json.result];

				if (result_info.count === 0) {
					return result as T[];
				}

				totalCount += result_info.count;
				if (totalCount === result_info.total_count) {
					return result as T[];
				}

				if (page === result_info.total_pages) {
					return result as T[];
				}
				page = result_info.page + 1;
			} else {
				return json.result as T[];
			}
		}
	} catch (e) {
		if (e instanceof ApiError) {
			console.error(e.url, e.init);
			console.error(`(${e.response.status}) ${e.response.statusText}`);
			const body = (await e.response.json()) as ApiErrorBody;
			console.error(body.errors);
		} else {
			console.error(e);
		}
		return [];
	}
}

export const listTmpE2EProjects = async () => {
	return (await apiFetchList<Project>(`/pages/projects`)).filter(
		(p) =>
			p.name.startsWith("tmp-e2e-") &&
			// Projects are more than an hour old
			Date.now() - new Date(p.created_on).valueOf() > 1000 * 60 * 60
	);
};

export const deleteProject = async (project: string) => {
	return await apiFetch(`/pages/projects/${project}`, "DELETE");
};

export const listTmpE2EWorkers = async () => {
	return (await apiFetchList<Worker>(`/workers/scripts`)).filter(
		(p) =>
			p.id.startsWith("tmp-e2e-") &&
			// Workers are more than an hour old
			Date.now() - new Date(p.created_on).valueOf() > 1000 * 60 * 60
	);
};

export const deleteWorker = async (id: string) => {
	return await apiFetch(`/workers/scripts/${id}`, "DELETE");
};

export const listTmpE2EContainerApplications = async () => {
	const res = await apiFetchResponse(`/cloudchamber/applications`, {
		method: "GET",
	});
	if (!res) {
		// unreachable, but assert() is failing to pin down the type
		throw res;
	}

	if (!res.ok) {
		throw new Error(`${res.status}: ${await res.text()}`);
	}

	const apps = (await res.json()) as ContainerApplication[];
	return apps.filter(
		(app) =>
			app.name.includes("e2e") &&
			Date.now() - new Date(app.created_at).valueOf() > 1000 * 60 * 60
	);
};

export const deleteContainerApplication = async (app: ContainerApplication) => {
	return await apiFetchResponse(`/cloudchamber/applications/${app.id}`, {
		method: "DELETE",
	});
};

export const listTmpKVNamespaces = async () => {
	return (await apiFetchList<KVNamespaceInfo>(`/storage/kv/namespaces`)).filter(
		(kv) => kv.title.includes("tmp-e2e") || kv.title.includes("tmp_e2e")
	);
};

export const deleteKVNamespace = async (id: string) => {
	return await apiFetch(
		`/storage/kv/namespaces/${id}`,
		"DELETE",
		/* failSilently */ true
	);
};

export const listTmpDatabases = async () => {
	return (await apiFetchList<Database>(`/d1/database`)).filter(
		(db) =>
			db.name.includes("tmp-e2e") && // Databases are more than an hour old
			Date.now() - new Date(db.created_at).valueOf() > 1000 * 60 * 60
	);
};

export const deleteDatabase = async (id: string) => {
	return (await apiFetch(`/d1/database/${id}`, "DELETE")) !== false;
};

export const listHyperdriveConfigs = async () => {
	return (await apiFetchList<HyperdriveConfig>(`/hyperdrive/configs`)).filter(
		(config) =>
			config.name.includes("tmp-e2e") && // Databases are more than an hour old
			Date.now() - new Date(config.created_on).valueOf() > 1000 * 60 * 60
	);
};

export const deleteHyperdriveConfig = async (id: string) => {
	return await apiFetch(`/hyperdrive/configs/${id}`, "DELETE");
};

export const listCertificates = async () => {
	return (
		await apiFetchList<MTlsCertificateResponse>(`/mtls_certificates`)
	).filter(
		(cert) =>
			cert.name?.includes("tmp-e2e") && // Certs are more than an hour old
			Date.now() - new Date(cert.uploaded_on).valueOf() > 1000 * 60 * 60
	);
};

export const deleteCertificate = async (id: string) => {
	await apiFetch(`/mtls_certificates/${id}`, "DELETE");
};
