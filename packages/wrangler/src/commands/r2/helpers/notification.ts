import { fetchResult } from "../../../cfetch";
import { logger } from "../../../logger";
import { getQueue, getQueueById } from "../../queues/client";
import type { ApiCredentials } from "../../../user";
import type { Config } from "@cloudflare/workers-utils";
import type { HeadersInit } from "undici";

export type R2EventableOperation =
	| "PutObject"
	| "DeleteObject"
	| "CompleteMultipartUpload"
	| "AbortMultipartUpload"
	| "CopyObject"
	| "LifecycleDeletion";

export const actionsForEventCategories: Record<
	"object-create" | "object-delete",
	R2EventableOperation[]
> = {
	"object-create": ["PutObject", "CompleteMultipartUpload", "CopyObject"],
	"object-delete": ["DeleteObject", "LifecycleDeletion"],
};
export type R2EventType = keyof typeof actionsForEventCategories;
type NotificationRule = {
	prefix?: string;
	suffix?: string;
	actions: R2EventableOperation[];
	description?: string;
};
type GetNotificationRule = {
	ruleId: string;
	createdAt?: string;
	prefix?: string;
	suffix?: string;
	actions: R2EventableOperation[];
};
export type GetQueueDetail = {
	queueId: string;
	queueName: string;
	rules: GetNotificationRule[];
};
export type GetNotificationConfigResponse = {
	bucketName: string;
	queues: GetQueueDetail[];
};
type DetailID = string;
type QueueID = string;
type BucketName = string;
type NotificationDetail = Record<
	DetailID, // This is the detail ID that identifies this config
	{ queue: QueueID; rules: NotificationRule[] }
>;
// Event Notifications API Backwards Compatibility
export type GetNotificationConfigResponseOld = Record<
	BucketName,
	NotificationDetail
>;
// This type captures the shape of the data expected by EWC API.
export type PutNotificationRequestBody = {
	// `jurisdiction` is included here for completeness, but until Queues
	// supports jurisdictions, then this command will not send anything to do
	// with jurisdictions.
	jurisdiction?: string;
	rules: NotificationRule[];
};

// This type captures the shape of the data expected by EWC API.
export type DeleteNotificationRequestBody = {
	ruleIds?: string[];
};

export function eventNotificationHeaders(
	apiCredentials: ApiCredentials,
	jurisdiction: string
): HeadersInit {
	const headers: HeadersInit = {
		"Content-Type": "application/json",
	};

	if ("apiToken" in apiCredentials) {
		headers["Authorization"] = `Bearer ${apiCredentials.apiToken}`;
	} else {
		headers["X-Auth-Key"] = apiCredentials.authKey;
		headers["X-Auth-Email"] = apiCredentials.authEmail;
	}
	if (jurisdiction !== "") {
		headers["cf-r2-jurisdiction"] = jurisdiction;
	}
	return headers;
}

export function tableFromNotificationGetResponse(
	response: GetNotificationConfigResponse
): {
	rule_id: string;
	created_at: string;
	queue_name: string;
	prefix: string;
	suffix: string;
	event_type: string;
}[] {
	const rows = [];
	for (const entry of response.queues) {
		for (const {
			prefix = "",
			suffix = "",
			actions,
			ruleId,
			createdAt = "",
		} of entry.rules) {
			rows.push({
				rule_id: ruleId,
				created_at: createdAt,
				queue_name: entry.queueName,
				prefix: prefix || "(all prefixes)",
				suffix: suffix || "(all suffixes)",
				event_type: actions.join(","),
			});
		}
	}
	return rows;
}

export async function listEventNotificationConfig(
	config: Config,
	apiCredentials: ApiCredentials,
	accountId: string,
	bucketName: string,
	jurisdiction: string
): Promise<GetNotificationConfigResponse> {
	const headers = eventNotificationHeaders(apiCredentials, jurisdiction);
	logger.log(`Fetching notification rules for bucket ${bucketName}...`);
	const res = await fetchResult<GetNotificationConfigResponse>(
		config,
		`/accounts/${accountId}/event_notifications/r2/${bucketName}/configuration`,
		{ method: "GET", headers }
	);
	if ("bucketName" in res && "queues" in res) {
		return res;
	}
	// API response doesn't match new format. Trying the old format.
	// Convert the old style payload to the new
	// We can assume that the old payload has a single bucket entry
	const oldResult = res as GetNotificationConfigResponseOld;
	const [oldBucketName, oldDetail] = Object.entries(oldResult)[0];
	const newResult: GetNotificationConfigResponse = {
		bucketName: oldBucketName,
		queues: await Promise.all(
			Object.values(oldDetail).map(async (oldQueue) => {
				const newQueue: GetQueueDetail = {
					queueId: oldQueue.queue,
					queueName: (await getQueueById(config, accountId, oldQueue.queue))
						.queue_name,
					rules: oldQueue.rules.map((oldRule) => {
						const newRule: GetNotificationRule = {
							ruleId: "",
							prefix: oldRule.prefix,
							suffix: oldRule.suffix,
							actions: oldRule.actions,
						};
						return newRule;
					}),
				};
				return newQueue;
			})
		),
	};
	return newResult;
}

/** Construct & transmit notification configuration to EWC.
 *
 * On success, receive HTTP 200 response with no body
 *
 * Possible status codes on failure:
 * - 400 Bad Request - Either:
 * 		- Uploaded configuration is invalid
 * 		- Communication with either R2-gateway-worker or queue-broker-worker fails
 * - 409 Conflict - A configuration between the bucket and queue already exists
 * */
export async function putEventNotificationConfig(
	config: Config,
	apiCredentials: ApiCredentials,
	accountId: string,
	bucketName: string,
	jurisdiction: string,
	queueName: string,
	eventTypes: R2EventType[],
	prefix?: string,
	suffix?: string,
	description?: string
): Promise<void> {
	const queue = await getQueue(config, queueName);
	const headers = eventNotificationHeaders(apiCredentials, jurisdiction);
	let actions: R2EventableOperation[] = [];

	for (const et of eventTypes) {
		actions = actions.concat(actionsForEventCategories[et]);
	}

	const body: PutNotificationRequestBody =
		description === undefined
			? {
					rules: [{ prefix, suffix, actions }],
				}
			: {
					rules: [{ prefix, suffix, actions, description }],
				};
	const ruleFor = eventTypes.map((et) =>
		et === "object-create" ? "creation" : "deletion"
	);
	logger.log(
		`Creating event notification rule for object ${ruleFor.join(
			" and "
		)} (${actions.join(",")})`
	);
	return await fetchResult<void>(
		config,
		`/accounts/${accountId}/event_notifications/r2/${bucketName}/configuration/queues/${queue.queue_id}`,
		{ method: "PUT", body: JSON.stringify(body), headers }
	);
}

export async function deleteEventNotificationConfig(
	config: Config,
	apiCredentials: ApiCredentials,
	accountId: string,
	bucketName: string,
	jurisdiction: string,
	queueName: string,
	ruleId: string | undefined
): Promise<null> {
	const queue = await getQueue(config, queueName);
	const headers = eventNotificationHeaders(apiCredentials, jurisdiction);
	if (ruleId !== undefined) {
		logger.log(`Deleting event notifications rule "${ruleId}"...`);
		const body: DeleteNotificationRequestBody =
			ruleId !== undefined
				? {
						ruleIds: [ruleId],
					}
				: {};

		return await fetchResult<null>(
			config,
			`/accounts/${accountId}/event_notifications/r2/${bucketName}/configuration/queues/${queue.queue_id}`,
			{ method: "DELETE", body: JSON.stringify(body), headers }
		);
	} else {
		logger.log(
			`Deleting event notification rules associated with queue ${queueName}...`
		);
		return await fetchResult<null>(
			config,
			`/accounts/${accountId}/event_notifications/r2/${bucketName}/configuration/queues/${queue.queue_id}`,
			{ method: "DELETE", headers }
		);
	}
}
