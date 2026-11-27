import { test } from "vitest";
import { selectConnectTrigger } from "../src/shared/connect";
import type { MiniflareTrigger } from "../src/config/schema";

type ConnectTrigger = Extract<MiniflareTrigger, { type: "connect" }>;

test.for([
	{ protocol: "tcp", workerName: undefined },
	{ protocol: "tcp", workerName: "named" },
	{ protocol: "udp", workerName: undefined },
	{ protocol: "udp", workerName: "named" },
] as const)("selectConnectTrigger: %j", (options, { expect }) => {
	const { protocol, workerName } = options;
	const first: ConnectTrigger = { type: "connect", protocol, port: 1234 };
	const second: ConnectTrigger = { type: "connect", protocol, port: 1235 };
	const automatic: ConnectTrigger = { type: "connect", protocol, port: 0 };
	const otherProtocol: ConnectTrigger = {
		type: "connect",
		protocol: protocol === "tcp" ? "udp" : "tcp",
		port: first.port,
	};
	const triggers = [otherProtocol, first, second];
	const workerDescription =
		workerName === undefined
			? "entrypoint worker"
			: `${JSON.stringify(workerName)} worker`;
	const protocolName = protocol.toUpperCase();

	// These ports are selection keys only: the test never binds them.
	expect(selectConnectTrigger(triggers, { ...options, port: first.port })).toBe(
		first
	);
	expect(
		selectConnectTrigger(triggers, { ...options, port: second.port })
	).toBe(second);
	expect(selectConnectTrigger([otherProtocol, automatic], options)).toBe(
		automatic
	);
	expect(
		selectConnectTrigger([otherProtocol, automatic], { ...options, port: 0 })
	).toBe(automatic);
	expect(() => selectConnectTrigger(triggers, options)).toThrow(
		new TypeError(
			`Multiple ${protocolName} connect triggers configured for ${workerDescription}; specify a port`
		)
	);
	expect(() =>
		selectConnectTrigger(triggers, { ...options, port: 123 })
	).toThrow(
		new TypeError(
			`${protocolName} connect trigger on port 123 not found for ${workerDescription}`
		)
	);
	expect(() => selectConnectTrigger([otherProtocol], options)).toThrow(
		new TypeError(
			`No ${protocolName} connect triggers configured for ${workerDescription}`
		)
	);
});

test("selectConnectTrigger: defaults to TCP", ({ expect }) => {
	const tcp: ConnectTrigger = { type: "connect", protocol: "tcp", port: 0 };
	const udp: ConnectTrigger = { type: "connect", protocol: "udp", port: 0 };
	expect(selectConnectTrigger([udp, tcp])).toBe(tcp);
});
