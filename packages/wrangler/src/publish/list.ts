import { fetchResult } from "../cfetch";
import { logger } from "../logger";

export type ServicesRes = {
	id: string;
	created_on: string;
	default_environment: {
		script: {
			last_deployed_from: string;
		};
	};
};

export async function list(
	accountId: string | undefined,
	prefix: string | undefined
) {
	let url = `/accounts/${accountId}/workers/services`;
	if (prefix) {
		url = `${url}?name=${prefix}`;
	}

	const services = await fetchResult<ServicesRes[]>(url);

	const workersMsg = services.map(
		(service) =>
			`\n${service.id}
Deployed from: ${service.default_environment.script.last_deployed_from}
Created on:    ${service.created_on}\n`
	);

	logger.log(...workersMsg);
}
