import { stderr, stdout } from "@cloudflare/cli/streams";
import { afterEach, beforeEach } from "vitest";

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
