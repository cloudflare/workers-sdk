import { fetch } from "undici";

type ApiErrorBody = {
	errors: string[];
};

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

export const listTmpE2EProjects = async () => {
	const pageSize = 10;
	let page = 1;

	const projects: Project[] = [];
	while (projects.length % pageSize === 0) {
		try {
			const res = await apiFetch(
				`/pages/projects`,
				{ method: "GET" },
				{
					per_page: pageSize,
					page,
				}
			);
			projects.push(...res);
			page++;
			if (res.length < pageSize) {
				break;
			}
		} catch (e) {
			const { url, init, response } = e as any;
			console.error("Failed to fetch project list");
			console.error(url, init);
			console.error(`(${response.status}) ${response.statusText}`);
			const body = (await response.json()) as ApiErrorBody;
			console.error(body.errors);
			process.exit(1);
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
		const res: Worker[] = await apiFetch(`/workers/scripts`, { method: "GET" });
		return res.filter(
			(p) =>
				p.id.startsWith("tmp-e2e-") &&
				// Workers are more than an hour old
				Date.now() - new Date(p.created_on).valueOf() > 1000 * 60 * 60
		);
	} catch (e) {
		const { url, init, response } = e as any;
		console.error("Failed to fetch workers list");
		console.error(url, init);
		console.error(`(${response.status}) ${response.statusText}`);
		const body = (await response.json()) as ApiErrorBody;
		console.error(body.errors);
		process.exit(1);
	}
};

export const deleteWorker = async (id: string) => {
	try {
		await apiFetch(`/workers/scripts/${id}`, {
			method: "DELETE",
		});
	} catch {}
};
