import process from "node:process";
import { logger } from "../logger";
import { CodexMicroCommandRunner } from "./command-runner";
import { loadCodexMicroKeymap } from "./keymap";
import {
	CODEX_MICRO_PRODUCT_ID,
	CODEX_MICRO_USAGE_PAGE,
	CODEX_MICRO_VENDOR_ID,
	CodexMicroProtocol,
} from "./protocol";
import type { Device, HIDAsync } from "node-hid";

const DEVICE_POLL_INTERVAL_MS = 5_000;
const RECONNECT_DELAY_MS = 1_000;

interface NodeHid {
	devicesAsync(vendorId: number, productId: number): Promise<Device[]>;
	HIDAsync: {
		open(path: string, options?: { nonExclusive?: boolean }): Promise<HIDAsync>;
	};
}

export interface RunCodexMicroDaemonOptions {
	cliPath: string;
	projectPath: string;
	signal: AbortSignal;
	loadHid?: () => Promise<NodeHid>;
}

export async function runCodexMicroDaemon(
	options: RunCodexMicroDaemonOptions
): Promise<void> {
	const hid = await (options.loadHid ?? loadNodeHid)();
	const protocol = new CodexMicroProtocol();
	const keymap = await loadCodexMicroKeymap();
	const runner = new CodexMicroCommandRunner({
		cliPath: options.cliPath,
		keymap,
		projectPath: options.projectPath,
	});
	let waitingForDeviceLogged = false;

	logger.log(`Codex Micro daemon started for ${options.projectPath}.`);

	try {
		while (!options.signal.aborted) {
			let descriptor: Device | undefined;
			try {
				descriptor = await findCodexMicro(hid);
			} catch (error) {
				logger.error("Codex Micro discovery failed:", error);
				await wait(RECONNECT_DELAY_MS, options.signal);
				continue;
			}

			if (descriptor?.path === undefined) {
				if (!waitingForDeviceLogged) {
					logger.log("Codex Micro is not connected; waiting.");
					waitingForDeviceLogged = true;
				}
				await wait(DEVICE_POLL_INTERVAL_MS, options.signal);
				continue;
			}

			waitingForDeviceLogged = false;
			protocol.reset();

			try {
				const device = await hid.HIDAsync.open(
					descriptor.path,
					process.platform === "darwin" ? { nonExclusive: true } : undefined
				);
				logger.log("Codex Micro connected.");
				await listenToDevice(device, protocol, runner, options.signal);
			} catch (error) {
				logger.error(getConnectionErrorMessage(), error);
			}

			await wait(RECONNECT_DELAY_MS, options.signal);
		}
	} finally {
		runner.stopAll();
		logger.log("Codex Micro daemon stopped.");
	}
}

export async function runInstalledCodexMicroDaemon(options: {
	cliPath: string;
	projectPath: string;
}): Promise<void> {
	const controller = new AbortController();
	const abort = () => controller.abort();
	process.once("SIGINT", abort);
	process.once("SIGTERM", abort);

	try {
		await runCodexMicroDaemon({
			...options,
			signal: controller.signal,
		});
	} finally {
		process.off("SIGINT", abort);
		process.off("SIGTERM", abort);
	}
}

async function findCodexMicro(hid: NodeHid): Promise<Device | undefined> {
	const devices = await hid.devicesAsync(
		CODEX_MICRO_VENDOR_ID,
		CODEX_MICRO_PRODUCT_ID
	);
	return devices.find(
		(device) =>
			device.productId === CODEX_MICRO_PRODUCT_ID &&
			device.usagePage === CODEX_MICRO_USAGE_PAGE &&
			device.path !== undefined
	);
}

async function listenToDevice(
	device: HIDAsync,
	protocol: CodexMicroProtocol,
	runner: CodexMicroCommandRunner,
	signal: AbortSignal
): Promise<void> {
	await new Promise<void>((resolve) => {
		let closed = false;
		const finish = () => {
			if (closed) {
				return;
			}
			closed = true;
			signal.removeEventListener("abort", onAbort);
			resolve();
		};
		const onAbort = () => {
			void device
				.close()
				.catch(() => undefined)
				.finally(finish);
		};

		device.on("data", (report: Buffer) => {
			for (const event of protocol.pushReport(report)) {
				runner.handleKey(event);
			}
		});
		device.once("error", (error) => {
			logger.error("Codex Micro disconnected with an error:", error);
			void device
				.close()
				.catch(() => undefined)
				.finally(finish);
		});
		device.once("close", finish);
		signal.addEventListener("abort", onAbort, { once: true });

		if (signal.aborted) {
			onAbort();
		}
	});
}

async function loadNodeHid(): Promise<NodeHid> {
	return import("node-hid");
}

function getConnectionErrorMessage(): string {
	if (process.platform === "darwin") {
		return "Codex Micro connection failed. Allow the installed Node executable in System Settings > Privacy & Security > Input Monitoring.";
	}
	if (process.platform === "linux") {
		return "Codex Micro connection failed. Re-run the installer to repair its udev permissions.";
	}
	return "Codex Micro connection failed.";
}

async function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
	if (signal.aborted) {
		return;
	}

	await new Promise<void>((resolve) => {
		let timeout: NodeJS.Timeout | undefined;
		function finish() {
			if (timeout !== undefined) {
				clearTimeout(timeout);
			}
			signal.removeEventListener("abort", onAbort);
			resolve();
		}
		function onAbort() {
			finish();
		}
		timeout = setTimeout(finish, milliseconds);
		signal.addEventListener("abort", onAbort, { once: true });
		timeout.unref();
	});
}
