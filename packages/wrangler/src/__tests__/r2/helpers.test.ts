import { eventNotificationHeaders } from "../../r2/helpers";
import type { ApiCredentials } from "../../user";

describe("event notifications", () => {
	const credentials: ApiCredentials[] = [
		{
			authEmail: "test@example.com",
			authKey: "some-big-secret",
		},
		{ apiToken: "some-api-token" },
	];
	test.each(credentials)("eventNotificationHeaders", (creds) => {
		const result = eventNotificationHeaders(creds);
		if ("authEmail" in creds) {
			expect(result).toMatchObject({
				"X-Auth-Key": creds.authKey,
				"X-Auth-Email": creds.authEmail,
			});
		} else {
			expect(result).toMatchObject({
				Authorization: `Bearer ${creds.apiToken}`,
			});
		}
	});
});
