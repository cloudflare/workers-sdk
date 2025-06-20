import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("[Container App] container functionality", () => {
	let ip: string, port: number, stop: (() => Promise<unknown>) | undefined;

	beforeAll(async () => {
		({ ip, port, stop } = await runWranglerDev(resolve(__dirname, ".."), [
			"--port=0",
			"--inspector-port=0",
		]));
	});

	afterAll(async () => {
		await stop?.();
	});

	it("should check initial container status (not running)", async () => {
		const response = await fetch(`http://${ip}:${port}/status`);
		const status = await response.json();
		expect(response.status).toBe(200);
		expect(status).toBe(false);
	});

	it("should start a container", async () => {
		let response = await fetch(`http://${ip}:${port}/start`);
		const text = await response.text();
		expect(response.status).toBe(200);
		expect(text).toBe("Container create request sent...");

		// Wait a bit for container to start
		await new Promise((resolve) => setTimeout(resolve, 2000));

		response = await fetch(`http://${ip}:${port}/status`);
		const status = await response.json();
		expect(response.status).toBe(200);
		expect(status).toBe(true);
	});

	it("should make a request to the container via TCP port", async () => {
		const response = await fetch(`http://${ip}:${port}/fetch`);
		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).toBe("Hello World!");
	});

	it("should work with second durable object instance", async () => {
		// Test the second container endpoint
		let response = await fetch(`http://${ip}:${port}/second?req=status`);
		expect(response.json()).toBe(false);
		response = await fetch(`http://${ip}:${port}/second?req=start`);
		await new Promise((resolve) => setTimeout(resolve, 2000));
		response = await fetch(`http://${ip}:${port}/second?req=status`);
		expect(response.json()).toBe(true);
		response = await fetch(`http://${ip}:${port}/second?req=fetch`);
		expect(response.text()).toBe("Hello World!");
		response = await fetch(`http://${ip}:${port}/second?req=destroy`);
		await new Promise((resolve) => setTimeout(resolve, 5000));
		response = await fetch(`http://${ip}:${port}/second?req=status`);
		expect(response.json()).toBe(false);
		// first container should still be running
		response = await fetch(`http://${ip}:${port}/status`);
		expect(response.json()).toBe(true);
	});
	it("should destroy a running container", async () => {
		const response = await fetch(`http://${ip}:${port}/destroy`);
		const status = await response.json();
		expect(response.status).toBe(200);
		expect(status).toBe(false);
	});
	// todo: run docker ps to check containers are gone at the end
});
