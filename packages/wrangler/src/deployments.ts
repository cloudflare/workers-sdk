import { fetchResult } from "./cfetch";
import { logger } from "./logger";
import type { ServiceMetadataRes } from "./init";

export type DeploymentListRes = {
	latest: {
		id: string;
		number: string;
		metadata: {
			author_id: string;
			author_email: string;
			source: "api" | "dash" | "wrangler" | "terraform" | "other";
			created_on: string;
			modified_on: string;
		};
		resources: {
			script: string;
			bindings: unknown[];
		};
	};
	items: {
		id: string;
		number: string;
		metadata: {
			author_id: string;
			author_email: string;
			source: "api" | "dash" | "wrangler" | "terraform" | "other";
			created_on: string;
			modified_on: string;
		};
	}[];
};

export async function deployments(
	accountId: string,
	scriptName: string | undefined
) {
	const scriptMetadata = await fetchResult<ServiceMetadataRes>(
		`/accounts/${accountId}/workers/services/${scriptName}`
	);

	const scriptTag = scriptMetadata.default_environment.script.tag;
	const { items: deploys } = await fetchResult<DeploymentListRes>(
		`/accounts/${accountId}/workers/versions/by-script/${scriptTag}`
	);

	const versionMessages = deploys.map(
		(versions, index) =>
			`\nVersion ID: ${versions.id}\nVersion number: ${
				versions.number
			}\nCreated on: ${versions.metadata.created_on}\nAuthor email: ${
				versions.metadata.author_email
			}\nLatest deploy: ${index === 0}\n`
	);
	logger.log(...versionMessages);
}
