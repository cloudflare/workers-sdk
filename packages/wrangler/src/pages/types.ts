import type { ArgumentsCamelCase, Argv } from "yargs";

/**
 * Given some Yargs Options function factory, extract the interface
 * that corresponds to the yargs arguments
 */
export type YargsOptionsToInterface<T extends (yargs: Argv) => Argv> =
	T extends (yargs: Argv) => Argv<infer P> ? ArgumentsCamelCase<P> : never;

export type Project = {
	name: string;
	subdomain: string;
	domains: Array<string>;
	source?: {
		type: string;
	};
	latest_deployment?: {
		modified_on: string;
	};
	created_on: string;
	production_branch: string;
};
export type Deployment = {
	id: string;
	environment: string;
	deployment_trigger: {
		metadata: {
			commit_hash: string;
			branch: string;
		};
	};
	url: string;
	latest_stage: {
		status: string;
		ended_on: string;
	};
	project_name: string;
};
export type UploadPayloadFile = {
	key: string;
	value: string;
	metadata: { contentType: string };
	base64: boolean;
};

export interface PagesConfigCache {
	account_id?: string;
	project_name?: string;
}
