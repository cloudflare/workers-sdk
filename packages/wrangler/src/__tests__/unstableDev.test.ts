import { fetch } from "undici";
import { RegistryHandle } from "../dev-registry";

jest.unmock("undici");

/**
 * Sometimes the devRegistry killed by some reason, the register worker will to restart it.
 */
describe("unstable devRegistry testing", () => {
	it("should start the devRegistry if the devRegistry not start", async () => {
		const handle = new RegistryHandle("test", () => {});
		await handle.update({
			port: 6789,
			protocol: "http",
			host: "localhost",
			mode: "local",
			durableObjects: [{ name: "testing", className: "testing" }],
		});
		const resp = await fetch("http://localhost:6284/workers");
		if (resp) {
			const parsedResp = (await resp.json()) as {
				test: unknown;
			};
			expect(parsedResp.test).toBeTruthy();
		}
	});

	it("should not restart the devRegistry if the devRegistry already start", async () => {
		const handle = new RegistryHandle("test", () => {});
		await handle.query(); // Ensure registry started

		await fetch("http://localhost:6284/workers/init", {
			method: "POST",
			body: JSON.stringify({}),
		});

		await handle.update({
			port: 6789,
			protocol: "http",
			host: "localhost",
			mode: "local",
			durableObjects: [{ name: "testing", className: "testing" }],
		});

		const resp = await fetch("http://localhost:6284/workers");
		if (resp) {
			const parsedResp = (await resp.json()) as {
				test: unknown;
				init: unknown;
			};
			expect(parsedResp.init).toBeTruthy();
			expect(parsedResp.test).toBeTruthy();
		}
	});
});
