import { beforeEach, describe, expect, test, vi } from "vitest";
import * as files from "../files";
import {
	addJSONComment,
	appendJSONProperty,
	insertJSONProperty,
	readJSONWithComments,
	writeJSONWithComments,
} from "../json";
import type { CommentObject } from "comment-json";

vi.mock("../files", () => ({
	readFile: vi.fn(),
	writeFile: vi.fn(),
}));
const mockReadFile = vi.mocked(files.readFile);
const mockWriteFile = vi.mocked(files.writeFile);

describe("json helpers", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("readJSONWithComments", () => {
		test("reads and parses JSON file with comments", () => {
			mockReadFile.mockReturnValue(
				'{\n/* a comment */\n "name": "test"\n}\n// post-comment',
			);
			const result = readJSONWithComments("/path/to/file.json");
			expect(mockReadFile).toHaveBeenCalledWith("/path/to/file.json");
			expect(result).toEqual({ name: "test" });
		});
	});

	describe("writeJSONWithComments", () => {
		test("stringifies and writes JSON object with comments", () => {
			mockReadFile.mockReturnValue(
				'{\n\t/* a comment */\n\t"name": "test"\n}\n// post-comment',
			);
			const result = readJSONWithComments("/path/to/file.json");
			writeJSONWithComments("/path/to/file.json", result);
			expect(mockWriteFile.mock.calls[0][0]).toMatchInlineSnapshot(
				`"/path/to/file.json"`,
			);
			expect(mockWriteFile.mock.calls[0][1]).toMatchInlineSnapshot(`
				"{
					/* a comment */
					"name": "test"
				}
				// post-comment"
			`);
		});
	});

	describe("addJSONComment", () => {
		test("adds a string comment to JSON object", () => {
			const jsonObject = { name: "foo" } as unknown as CommentObject;

			addJSONComment(jsonObject, "before:name", " This is a comment ");

			writeJSONWithComments("/path/to/file.json", jsonObject);
			expect(mockWriteFile.mock.calls[0][0]).toMatchInlineSnapshot(
				`"/path/to/file.json"`,
			);
			expect(mockWriteFile.mock.calls[0][1]).toMatchInlineSnapshot(`
				"{
					/* This is a comment */
					"name": "foo"
				}"
			`);
		});

		test("adds multiple comments to JSON object", () => {
			const jsonObject = { name: "foo" } as unknown as CommentObject;

			addJSONComment(jsonObject, "before:name", [
				" Comment 1",
				{ type: "LineComment", value: " Comment 2" },
			]);

			writeJSONWithComments("/path/to/file.json", jsonObject);
			expect(mockWriteFile.mock.calls[0][0]).toMatchInlineSnapshot(
				`"/path/to/file.json"`,
			);
			expect(mockWriteFile.mock.calls[0][1]).toMatchInlineSnapshot(`
				"{
					/* Comment 1*/
					// Comment 2
					"name": "foo"
				}"
			`);
		});

		test("appends to existing comments", () => {
			const jsonObject = { name: "foo" } as unknown as CommentObject;
			addJSONComment(jsonObject, "before:name", " This is a comment ");

			addJSONComment(jsonObject, "before:name", " New comment ");

			writeJSONWithComments("/path/to/file.json", jsonObject);
			expect(mockWriteFile.mock.calls[0][0]).toMatchInlineSnapshot(
				`"/path/to/file.json"`,
			);
			expect(mockWriteFile.mock.calls[0][1]).toMatchInlineSnapshot(`
				"{
					/* This is a comment */
					/* New comment */
					"name": "foo"
				}"
			`);
		});
	});

	describe("appendJSONProperty", () => {
		test("appends property to JSON object, maintaining comments", () => {
			mockReadFile.mockReturnValue(
				'{\n/* a comment */\n "existing": "value"\n}\n// post-comment',
			);
			let jsonObject = readJSONWithComments("/path/to/file.json");
			jsonObject = appendJSONProperty(jsonObject, "newProp", "newValue");
			expect(jsonObject).toEqual({ existing: "value", newProp: "newValue" });
			writeJSONWithComments("/path/to/file.json", jsonObject);
			expect(mockWriteFile.mock.calls[0][0]).toMatchInlineSnapshot(
				`"/path/to/file.json"`,
			);
			expect(mockWriteFile.mock.calls[0][1]).toMatchInlineSnapshot(`
				"{
					/* a comment */
					"existing": "value",
					"newProp": "newValue"
				}
				// post-comment"
			`);
		});
	});

	describe("insertJSONProperty", () => {
		test("inserts property at the beginning of JSON object, maintaining comments", () => {
			mockReadFile.mockReturnValue(
				'{\n/* a comment */\n "existing": "value"\n}\n// post-comment',
			);
			let jsonObject = readJSONWithComments("/path/to/file.json");
			jsonObject = insertJSONProperty(jsonObject, "newProp", "newValue");
			expect(jsonObject).toEqual({ existing: "value", newProp: "newValue" });
			writeJSONWithComments("/path/to/file.json", jsonObject);
			expect(mockWriteFile.mock.calls[0][0]).toMatchInlineSnapshot(
				`"/path/to/file.json"`,
			);
			expect(mockWriteFile.mock.calls[0][1]).toMatchInlineSnapshot(`
				"{
					"newProp": "newValue",
					/* a comment */
					"existing": "value"
				}
				// post-comment"
			`);
		});
	});
});
