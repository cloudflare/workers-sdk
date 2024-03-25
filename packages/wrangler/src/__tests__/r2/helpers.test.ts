import { eventNotificationHeaders } from "../../r2/helpers";
import type { ApiCredentials } from "../../user";

describe("event notifications", () => {
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
