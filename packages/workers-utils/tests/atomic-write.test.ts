import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import { afterEach, describe, it, vi } from "vitest";
import {
	clearFile,
	ProcessOwnerChecker,
	writeFileAtomically,
} from "../src/file-system";
import { runInTempDir } from "../src/test-helpers";

describe("shared atomic file replacement", () => {
	runInTempDir();
	afterEach(() => {
		vi.restoreAllMocks();
		syncBuiltinESMExports();
	});

	it("supports binary contents and caller-selected permissions and flushing", ({
		expect,
	}) => {
		const destination = path.join(process.cwd(), "binary");
		const contents = new Uint8Array([0, 1, 255]);
		const write = vi.spyOn(fs, "writeFileSync");
		syncBuiltinESMExports();
		writeFileAtomically(destination, contents, { mode: 0o755, flush: false });
		expect(fs.readFileSync(destination)).toEqual(Buffer.from(contents));
		expect(write).toHaveBeenCalledWith(
			expect.any(String),
			contents,
			expect.objectContaining({ mode: 0o755, flush: false, flag: "wx" })
		);
		expect(
			fs
				.readdirSync(process.cwd())
				.filter((entry) => entry.startsWith(".atomic-"))
		).toEqual([]);
	});

	it("preserves complete old contents and removes staging directories after failures", ({
		expect,
	}) => {
		const destination = path.join(process.cwd(), "state.json");
		writeFileAtomically(destination, "original");
		vi.spyOn(fs, "renameSync").mockImplementationOnce(() => {
			throw new Error("replacement failed");
		});
		syncBuiltinESMExports();
		expect(() => writeFileAtomically(destination, "replacement")).toThrow(
			"replacement failed"
		);
		expect(fs.readFileSync(destination, "utf8")).toBe("original");
		expect(
			fs
				.readdirSync(process.cwd())
				.filter((entry) => entry.startsWith(".atomic-"))
		).toEqual([]);
	});

	it("cleans proven abandoned staging directories while preserving live writers", ({
		expect,
	}) => {
		const destination = path.join(process.cwd(), "state.json");
		const prefix = `.atomic-${createHash("sha256").update(destination).digest("hex").slice(0, 16)}-`;
		const abandoned = prefix + `owner-999999999-${randomUUID()}`;
		const owners = new ProcessOwnerChecker();
		const live = prefix + owners.createOwner();
		fs.mkdirSync(abandoned);
		fs.mkdirSync(live);
		writeFileAtomically(destination, "replacement", { owners });
		expect(fs.existsSync(abandoned)).toBe(false);
		expect(fs.existsSync(live)).toBe(true);
		expect(clearFile(destination, { owners })).toBe(true);
		expect(clearFile(destination, { owners })).toBe(false);
		expect(fs.existsSync(live)).toBe(true);
	});

	it.skipIf(process.platform === "win32")(
		"preserves dangling file symlinks across replacement and clear",
		({ expect }) => {
			const destination = path.join(process.cwd(), "target");
			const link = path.join(process.cwd(), "link");
			fs.symlinkSync("target", link);
			writeFileAtomically(link, "replacement");
			expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
			expect(fs.readFileSync(destination, "utf8")).toBe("replacement");
			expect(clearFile(link)).toBe(true);
			expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
			expect(fs.existsSync(destination)).toBe(false);
		}
	);
});
