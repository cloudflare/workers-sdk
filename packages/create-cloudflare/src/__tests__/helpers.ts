import { stripAnsi } from "@cloudflare/cli-shared-helpers";
import { stderr, stdout } from "@cloudflare/cli-shared-helpers/streams";
import { C3_DEFAULTS } from "helpers/cli";
import { afterEach, beforeEach } from "vitest";
import type { TemplateConfig } from "../templates";
import type { C3Args, C3Context } from "types";

export const createTestArgs = (args?: Partial<C3Args>) => {
	return {
		...C3_DEFAULTS,
		...args,
	};
};

export const createTestContext = (name = "test", args?: C3Args): C3Context => {
	const path = `./${name}`;
	return {
		project: { name, path },
		args: args ?? createTestArgs(),
		originalCWD: path,
		gitRepoAlreadyExisted: false,
		template: createTestTemplate(),
		deployment: {},
	};
};

export const createTestTemplate = (
	config?: Partial<TemplateConfig>
): TemplateConfig => {
	return {
		...config,
		id: "test",
		platform: "workers",
		displayName: "Test Template",
		configVersion: 1,
		generate: Promise.resolve,
	};
};

export function collectCLIOutput() {
	const std = { out: "", err: "" };
	const onStdOutData = (chunk: Buffer) => (std.out += chunk.toString());
	const onStdErrData = (chunk: Buffer) => (std.err += chunk.toString());

	beforeEach(() => {
		stdout.on("data", onStdOutData);
		stderr.on("data", onStdErrData);
	});

	afterEach(() => {
		stdout.off("data", onStdOutData);
		stderr.off("data", onStdErrData);
		std.out = "";
		std.err = "";
	});

	return std;
}

export function normalizeOutput(output: string) {
	return stripAnsi(output)
		.replace(/\\/g, "/")
		.replaceAll(/\u200a|\u200b/g, " ");
}
