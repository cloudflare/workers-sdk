import crypto from "crypto";
import { describe, test, vi } from "vitest";
import { logger } from "../../logger";
import {
	eventNotificationHeaders,
	tableFromNotificationGetResponse,
} from "../../r2/helpers";
import { mockConsoleMethods } from "../helpers/mock-console";
import type { Config } from "../../config";
import type { GetNotificationConfigResponse } from "../../r2/helpers";
import type { ApiCredentials } from "../../user";

describe("event notifications", () => {
	const std = mockConsoleMethods();

	test("tableFromNotificationsGetResponse", async ({ expect }) => {
		const bucketName = "my-bucket";
		const config = { account_id: "my-account" };
		const queueMap: Record<string, string> = {
			"471537e8-6e5a-4163-a4d4-9478087c32c3": "my-queue-1",
			"be6b6a37-ae49-4eea-9032-5e8d3ad1d29b": "my-queue-2",
		};
		const response: GetNotificationConfigResponse = {
			[bucketName]: {
				"9d738cb7-be18-433a-957f-a9b88793de2c": {
					queue: "471537e8-6e5a-4163-a4d4-9478087c32c3",
					rules: [
						{
							prefix: "/p1",
							suffix: "s1/",
							actions: [
								"PutObject",
								"CompleteMultipartUpload",
								"CopyObject",
								"DeleteObject",
							],
						},
						{
							actions: ["DeleteObject"],
						},
					],
				},
				[crypto.randomUUID()]: {
					queue: "be6b6a37-ae49-4eea-9032-5e8d3ad1d29b",
					rules: [
						{
							prefix: "//1",
							suffix: "2//",
							actions: ["DeleteObject"],
						},
					],
				},
			},
		};
		const tableOutput = await tableFromNotificationGetResponse(
			config,
			response[bucketName],
			vi
				.fn()
				.mockImplementation((_: Pick<Config, "account_id">, queue: string) => ({
					queue_name: queueMap[queue],
				}))
		);
		logger.table(tableOutput);

		await expect(std.out).toMatchInlineSnapshot(`
		"┌────────────┬────────┬────────┬─────────────────────────────┐
		│ queue_name │ prefix │ suffix │ event_type                  │
		├────────────┼────────┼────────┼─────────────────────────────┤
		│ my-queue-1 │ /p1    │ s1/    │ object-create,object-delete │
		├────────────┼────────┼────────┼─────────────────────────────┤
		│ my-queue-1 │        │        │ object-delete               │
		├────────────┼────────┼────────┼─────────────────────────────┤
		│ my-queue-2 │ //1    │ 2//    │ object-delete               │
		└────────────┴────────┴────────┴─────────────────────────────┘"
	`);
	});
	test("auth email eventNotificationHeaders", ({ expect }) => {
		const creds: ApiCredentials = {
			authEmail: "test@example.com",
			authKey: "some-big-secret",
		};
		const result = eventNotificationHeaders(creds);
		expect(result).toMatchObject({
			"X-Auth-Key": creds.authKey,
			"X-Auth-Email": creds.authEmail,
		});
	});

	test("API token eventNotificationHeaders", ({ expect }) => {
		const creds: ApiCredentials = { apiToken: "some-api-token" };
		const result = eventNotificationHeaders(creds);
		expect(result).toMatchObject({
			Authorization: `Bearer ${creds.apiToken}`,
		});
	});
});
