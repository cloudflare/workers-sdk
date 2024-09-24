import { logger } from "../../logger";
import {
	eventNotificationHeaders,
	tableFromNotificationGetResponse,
} from "../../r2/helpers";
import formatLabelledValues from "../../utils/render-labelled-values";
import { mockConsoleMethods } from "../helpers/mock-console";
import type { GetNotificationConfigResponse } from "../../r2/helpers";
import type { ApiCredentials } from "../../user";

describe("event notifications", () => {
	const std = mockConsoleMethods();

	test("tableFromNotificationsGetResponse", async () => {
		const bucketName = "my-bucket";
		const config = { account_id: "my-account" };
		const response: GetNotificationConfigResponse = {
			bucketName,
			queues: [
				{
					queueId: "471537e8-6e5a-4163-a4d4-9478087c32c3",
					queueName: "my-queue-1",
					rules: [
						{
							ruleId: "68746106-12f8-4bba-a57b-adaf37fe11ca",
							prefix: "/p1",
							suffix: "s1/",
							actions: ["PutObject", "CopyObject", "DeleteObject"],
						},
						{
							ruleId: "5aa280bb-39d7-48ed-8c21-405fcd078192",
							actions: ["DeleteObject"],
						},
					],
				},
				{
					queueId: "be6b6a37-ae49-4eea-9032-5e8d3ad1d29b",
					queueName: "my-queue-2",
					rules: [
						{
							ruleId: "c4725929-3799-477a-a8d9-2d300f957e51",
							createdAt: "2024-09-05T01:02:03.000Z",
							prefix: "//1",
							suffix: "2//",
							actions: ["LifecycleDeletion"],
						},
					],
				},
			],
		};
		const tableOutput = await tableFromNotificationGetResponse(
			config,
			response
		);
		logger.log(tableOutput.map((x) => formatLabelledValues(x)).join("\n\n"));

		await expect(std.out).toMatchInlineSnapshot(`
		"rule_id:     68746106-12f8-4bba-a57b-adaf37fe11ca
		created_at:
		queue_name:  my-queue-1
		prefix:      /p1
		suffix:      s1/
		event_type:  PutObject,CopyObject,DeleteObject

		rule_id:     5aa280bb-39d7-48ed-8c21-405fcd078192
		created_at:
		queue_name:  my-queue-1
		prefix:      (all prefixes)
		suffix:      (all suffixes)
		event_type:  DeleteObject

		rule_id:     c4725929-3799-477a-a8d9-2d300f957e51
		created_at:  2024-09-05T01:02:03.000Z
		queue_name:  my-queue-2
		prefix:      //1
		suffix:      2//
		event_type:  LifecycleDeletion"
	`);
	});
	test("auth email eventNotificationHeaders", () => {
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

	test("API token eventNotificationHeaders", () => {
		const creds: ApiCredentials = { apiToken: "some-api-token" };
		const result = eventNotificationHeaders(creds);
		expect(result).toMatchObject({
			Authorization: `Bearer ${creds.apiToken}`,
		});
	});
});
