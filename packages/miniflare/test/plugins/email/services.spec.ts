import { readFile } from "node:fs/promises";
import path from "node:path";
import {
	EMAIL_PLUGIN,
	getEmailPathsToClean,
	writeEmailTempFile,
} from "miniflare";
import { describe, test } from "vitest";
import { useTmp } from "../../test-shared";

describe("writeEmailTempFile", () => {
	test("mirrors into the project directory and returns the project path", async ({
		expect,
	}) => {
		const tmp = await useTmp();
		const projectTmpPath = path.join(tmp, ".wrangler", "tmp");

		const filePath = await writeEmailTempFile({
			resourceTmpPath: projectTmpPath,
			tmpPath: tmp,
			prefix: "reply",
			fileName: "abc123.eml",
			contents: Buffer.from("raw message"),
		});

		// The returned path is the project copy, since that is the one a user can
		// navigate to.
		expect(filePath).toBe(
			path.join(
				projectTmpPath,
				"email",
				path.basename(tmp),
				"reply",
				"abc123.eml"
			)
		);
		expect(await readFile(filePath, "utf8")).toBe("raw message");

		// The instance copy is written too.
		const systemPath = path.join(tmp, "email", "reply", "abc123.eml");
		expect(await readFile(systemPath, "utf8")).toBe("raw message");
	});

	test("returns the instance path when no project directory is configured", async ({
		expect,
	}) => {
		const tmp = await useTmp();

		const filePath = await writeEmailTempFile({
			resourceTmpPath: undefined,
			tmpPath: tmp,
			prefix: "sent",
			fileName: "def456.eml",
			contents: Buffer.from("raw message"),
		});

		expect(filePath).toBe(path.join(tmp, "email", "sent", "def456.eml"));
		expect(await readFile(filePath, "utf8")).toBe("raw message");
	});

	test("preserves binary content exactly", async ({ expect }) => {
		const tmp = await useTmp();
		// A byte sequence that is not valid UTF-8, so it would be corrupted if the
		// content were round-tripped through a string.
		const contents = Buffer.from([0x00, 0xff, 0xfe, 0x80, 0x01]);

		const filePath = await writeEmailTempFile({
			resourceTmpPath: undefined,
			tmpPath: tmp,
			prefix: "sent",
			fileName: "binary.bin",
			contents,
		});

		expect(await readFile(filePath)).toStrictEqual(contents);
	});

	test("rejects path traversal in email file names", async ({ expect }) => {
		const tmp = await useTmp();

		await expect(
			writeEmailTempFile({
				resourceTmpPath: undefined,
				tmpPath: tmp,
				prefix: "email-attachment",
				fileName: "message./../../outside.txt",
				contents: Buffer.from("nope"),
			})
		).rejects.toThrow("Invalid email temporary-file path");
	});
});

describe("EMAIL_PLUGIN.getServices", () => {
	test("creates a single send_email worker service bound to the loopback service", async ({
		expect,
	}) => {
		const tmp = await useTmp();
		const projectTmpPath = path.join(tmp, ".wrangler", "tmp");

		const result = await EMAIL_PLUGIN.getServices({
			options: {
				email: { send_email: [{ name: "SEND_EMAIL" }] },
			},
			sharedOptions: {},
			tmpPath: tmp,
			resourceTmpPath: projectTmpPath,
			workerNames: ["default"],
			workerIndex: 0,
		} as unknown as Parameters<typeof EMAIL_PLUGIN.getServices>[0]);

		if (!Array.isArray(result)) {
			throw new Error("Expected getServices to return an array of services");
		}
		const services = result;

		// Files are written via the loopback `/core/store-temp-file` endpoint, so
		// no dedicated disk services are created - only the send_email worker.
		expect(services).toHaveLength(1);
		expect(services.some((s) => "disk" in s)).toBe(false);

		const workerService = services.find(
			(s) => s.name === "SEND-EMAIL-WORKER:default:SEND_EMAIL"
		) as
			| {
					name: string;
					worker: {
						bindings: {
							name: string;
							json?: string;
							service?: { name: string };
						}[];
					};
			  }
			| undefined;
		if (!workerService) {
			throw new Error("Expected send_email worker service to be present");
		}

		const bindings = workerService.worker.bindings;

		const loopbackBinding = bindings.find(
			(b) => b.name === "MINIFLARE_LOOPBACK"
		);
		expect(loopbackBinding?.service?.name).toBeDefined();

		// The old disk-service bindings are gone.
		expect(
			bindings.some((b) => b.name.startsWith("MINIFLARE_EMAIL_DISK"))
		).toBe(false);
		expect(bindings.some((b) => b.name === "email_disk_services")).toBe(false);
	});

	test("names same send_email bindings per worker", async ({ expect }) => {
		const options = {
			email: { send_email: [{ name: "SEND_EMAIL" }] },
		};
		const firstBindings = await EMAIL_PLUGIN.getBindings(options, 0, "first");
		const secondBindings = await EMAIL_PLUGIN.getBindings(options, 1, "second");
		expect(firstBindings?.[0]).toMatchObject({
			service: { name: "SEND-EMAIL-WORKER:first:SEND_EMAIL" },
		});
		expect(secondBindings?.[0]).toMatchObject({
			service: { name: "SEND-EMAIL-WORKER:second:SEND_EMAIL" },
		});
		const getServices = EMAIL_PLUGIN.getServices;
		const first = await getServices({
			options,
			sharedOptions: {},
			tmpPath: "/tmp/first",
			resourceTmpPath: undefined,
			workerNames: ["first", "second"],
			workerIndex: 0,
		} as unknown as Parameters<typeof getServices>[0]);
		const second = await getServices({
			options,
			sharedOptions: {},
			tmpPath: "/tmp/second",
			resourceTmpPath: undefined,
			workerNames: ["first", "second"],
			workerIndex: 1,
		} as unknown as Parameters<typeof getServices>[0]);

		expect(Array.isArray(first) && Array.isArray(second)).toBe(true);
		if (!Array.isArray(first) || !Array.isArray(second)) {
			throw new Error("Expected getServices to return arrays");
		}
		expect(first[0]?.name).toBe("SEND-EMAIL-WORKER:first:SEND_EMAIL");
		expect(second[0]?.name).toBe("SEND-EMAIL-WORKER:second:SEND_EMAIL");
	});
});

describe("getEmailPathsToClean", () => {
	test("returns the project session directory when a project temp path is supplied", ({
		expect,
	}) => {
		const tmpPath = path.join("/tmp", "miniflare-abc123");
		const projectTmpPath = path.join("/project", ".wrangler", "tmp");

		expect(getEmailPathsToClean(projectTmpPath, tmpPath)).toEqual({
			sessionDir: path.join(projectTmpPath, "email", "miniflare-abc123"),
			parentDir: path.join(projectTmpPath, "email"),
		});
	});

	test("returns undefined when no project temp path is supplied", ({
		expect,
	}) => {
		const tmpPath = path.join("/tmp", "miniflare-abc123");
		expect(getEmailPathsToClean(undefined, tmpPath)).toBeUndefined();
	});
});
