import os from "node:os";
import test from "ava";
import { validateMacOSVersion, warnMacOSVersion } from "../src/index";

const originalRelease = os.release;
const originalPlatform = process.platform;
const originalEnv = process.env;

function mockPlatform(platform: string) {
	Object.defineProperty(process, "platform", {
		value: platform,
		configurable: true,
	});
}

function mockOsRelease(version: string) {
	os.release = () => version;
}

function mockEnv(env: Record<string, string>) {
	process.env = { ...originalEnv, ...env };
}

function restoreMocks() {
	os.release = originalRelease;
	Object.defineProperty(process, "platform", {
		value: originalPlatform,
		configurable: true,
	});
	process.env = originalEnv;
}

test("validateMacOSVersion should not throw on non-macOS platforms", (t) => {
	mockPlatform("linux");
	t.notThrows(() => validateMacOSVersion());
	restoreMocks();
});

test("validateMacOSVersion should not throw on macOS 13.5.0", (t) => {
	mockPlatform("darwin");
	mockOsRelease("22.6.0");
	t.notThrows(() => validateMacOSVersion());
	restoreMocks();
});

test("validateMacOSVersion should not throw on macOS 14.0.0", (t) => {
	mockPlatform("darwin");
	mockOsRelease("23.0.0");
	t.notThrows(() => validateMacOSVersion());
	restoreMocks();
});

test("validateMacOSVersion should not throw on macOS 13.6.0", (t) => {
	mockPlatform("darwin");
	mockOsRelease("22.7.0");
	t.notThrows(() => validateMacOSVersion());
	restoreMocks();
});

test("validateMacOSVersion should throw error on macOS 12.7.6", (t) => {
	mockPlatform("darwin");
	mockOsRelease("21.6.0");
	mockEnv({ CI: "" });

	const error = t.throws(() => validateMacOSVersion());
	t.true(error?.message.includes("Unsupported macOS version"));
	t.true(error?.message.includes("12.6.0"));
	restoreMocks();
});

test("validateMacOSVersion should throw error on macOS 13.4.0", (t) => {
	mockPlatform("darwin");
	mockOsRelease("22.4.0");
	mockEnv({ CI: "" });

	const error = t.throws(() => validateMacOSVersion());
	t.true(error?.message.includes("Unsupported macOS version"));
	t.true(error?.message.includes("13.4.0"));
	restoreMocks();
});

test("validateMacOSVersion should handle invalid Darwin version format gracefully", (t) => {
	mockPlatform("darwin");
	mockOsRelease("invalid-version");
	t.notThrows(() => validateMacOSVersion());
	restoreMocks();
});

test("validateMacOSVersion should handle very old Darwin versions gracefully", (t) => {
	mockPlatform("darwin");
	mockOsRelease("19.6.0");
	t.notThrows(() => validateMacOSVersion());
	restoreMocks();
});

test("validateMacOSVersion should not throw when CI environment variable is set", (t) => {
	mockPlatform("darwin");
	mockOsRelease("21.6.0");
	mockEnv({ CI: "true" });
	t.notThrows(() => validateMacOSVersion());
	restoreMocks();
});

test("warnMacOSVersion should not warn on non-macOS platforms", (t) => {
	mockPlatform("linux");

	// eslint-disable-next-line no-console
	const originalWarn = console.warn;
	let warnCalled = false;
	// eslint-disable-next-line no-console
	console.warn = () => {
		warnCalled = true;
	};

	warnMacOSVersion();

	t.false(warnCalled);
	// eslint-disable-next-line no-console
	console.warn = originalWarn;
	restoreMocks();
});

test("warnMacOSVersion should not warn on macOS 13.5.0", (t) => {
	mockPlatform("darwin");
	mockOsRelease("22.6.0");

	// eslint-disable-next-line no-console
	// eslint-disable-next-line no-console
	const originalWarn = console.warn;
	let warnCalled = false;
	// eslint-disable-next-line no-console
	console.warn = () => {
		warnCalled = true;
	};

	warnMacOSVersion();

	t.false(warnCalled);
	// eslint-disable-next-line no-console
	console.warn = originalWarn;
	restoreMocks();
});

test("warnMacOSVersion should warn on macOS 12.7.6", (t) => {
	mockPlatform("darwin");
	mockOsRelease("21.6.0");
	mockEnv({ CI: "" });

	// eslint-disable-next-line no-console
	// eslint-disable-next-line no-console
	const originalWarn = console.warn;
	let warnMessage = "";
	// eslint-disable-next-line no-console
	console.warn = (message: string) => {
		warnMessage = message;
	};

	warnMacOSVersion();

	t.true(
		warnMessage.includes("⚠️  Warning: Unsupported macOS version detected")
	);
	t.true(warnMessage.includes("12.6.0"));
	// eslint-disable-next-line no-console
	console.warn = originalWarn;
	restoreMocks();
});

test("warnMacOSVersion should warn on macOS 13.4.0", (t) => {
	mockPlatform("darwin");
	mockOsRelease("22.4.0");
	mockEnv({ CI: "" });

	// eslint-disable-next-line no-console
	// eslint-disable-next-line no-console
	const originalWarn = console.warn;
	let warnMessage = "";
	// eslint-disable-next-line no-console
	console.warn = (message: string) => {
		warnMessage = message;
	};

	warnMacOSVersion();

	t.true(
		warnMessage.includes("⚠️  Warning: Unsupported macOS version detected")
	);
	t.true(warnMessage.includes("13.4.0"));
	// eslint-disable-next-line no-console
	console.warn = originalWarn;
	restoreMocks();
});

test("warnMacOSVersion should not warn when CI environment variable is set", (t) => {
	mockPlatform("darwin");
	mockOsRelease("21.6.0");
	mockEnv({ CI: "true" });

	// eslint-disable-next-line no-console
	// eslint-disable-next-line no-console
	const originalWarn = console.warn;
	let warnCalled = false;
	// eslint-disable-next-line no-console
	console.warn = () => {
		warnCalled = true;
	};

	warnMacOSVersion();

	t.false(warnCalled);
	// eslint-disable-next-line no-console
	console.warn = originalWarn;
	restoreMocks();
});

test("warnMacOSVersion should not warn on invalid Darwin version format", (t) => {
	mockPlatform("darwin");
	mockOsRelease("invalid-version");

	// eslint-disable-next-line no-console
	// eslint-disable-next-line no-console
	const originalWarn = console.warn;
	let warnCalled = false;
	// eslint-disable-next-line no-console
	console.warn = () => {
		warnCalled = true;
	};

	warnMacOSVersion();

	t.false(warnCalled);
	// eslint-disable-next-line no-console
	console.warn = originalWarn;
	restoreMocks();
});
