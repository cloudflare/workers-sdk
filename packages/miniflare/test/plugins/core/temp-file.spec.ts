import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "vitest";
import { writeTempFile } from "../../../src/plugins/core/temp-file";
import { useTmp } from "../../test-shared";

test("writes to a `files` directory when no prefix is given", async ({
	expect,
}) => {
	const tmp = await useTmp();

	const filePath = await writeTempFile({
		tmpPath: tmp,
		prefix: null,
		extension: "txt",
		contents: "hello",
	});

	expect(path.dirname(filePath)).toBe(path.join(tmp, "files"));
	expect(await readFile(filePath, "utf8")).toBe("hello");
});

test("groups files under `files/<prefix>` when a prefix is given", async ({
	expect,
}) => {
	const tmp = await useTmp();

	const filePath = await writeTempFile({
		tmpPath: tmp,
		prefix: "somewhere",
		extension: "txt",
		contents: "hello",
	});

	expect(path.dirname(filePath)).toBe(path.join(tmp, "files", "somewhere"));
});

test("names files randomly with the requested extension", async ({
	expect,
}) => {
	const tmp = await useTmp();

	const first = await writeTempFile({
		tmpPath: tmp,
		prefix: null,
		extension: "eml",
		contents: "one",
	});
	const second = await writeTempFile({
		tmpPath: tmp,
		prefix: null,
		extension: "eml",
		contents: "two",
	});

	expect(first).not.toBe(second);
	expect(first.endsWith(".eml")).toBe(true);
	expect(second.endsWith(".eml")).toBe(true);
});

test("does not mirror the file anywhere else", async ({ expect }) => {
	const tmp = await useTmp();

	await writeTempFile({
		tmpPath: tmp,
		prefix: "somewhere",
		extension: "txt",
		contents: "hello",
	});

	expect(await readdir(tmp)).toStrictEqual(["files"]);
	expect(await readdir(path.join(tmp, "files", "somewhere"))).toHaveLength(1);
});
