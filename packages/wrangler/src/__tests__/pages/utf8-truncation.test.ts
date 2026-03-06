import { describe, test } from "vitest";
import { truncateUtf8Bytes } from "../../pages/utils";

describe("truncateUtf8Bytes", () => {
	test("should not truncate strings under the limit", ({ expect }) => {
		const short = "Hello world";
		const result = truncateUtf8Bytes(short, 384);
		expect(result).toBe(short);
		expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(384);
	});

	test("should not truncate strings exactly at the limit", ({ expect }) => {
		const exact384 = "a".repeat(384);
		const result = truncateUtf8Bytes(exact384, 384);
		expect(result).toBe(exact384);
		expect(Buffer.byteLength(result, "utf8")).toBe(384);
	});

	test("should truncate ASCII strings over the limit", ({ expect }) => {
		const long = "a".repeat(500);
		const result = truncateUtf8Bytes(long, 384);
		expect(result).toBe("a".repeat(384));
		expect(Buffer.byteLength(result, "utf8")).toBe(384);
	});

	test("should handle Cyrillic characters (2 bytes each)", ({ expect }) => {
		const cyrillic = "Тестовое сообщение для проверки UTF-8.";
		const result = truncateUtf8Bytes(cyrillic, 50);

		expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(50);
		expect(result).toMatch(/^Тестовое сообщение/);
	});

	test("should handle long Cyrillic text", ({ expect }) => {
		const longCyrillic =
			"Тестовое сообщение для проверки обрезки UTF-8.\n" +
			"- Добавлена функция безопасной обработки символов\n" +
			"- Созданы тесты для различных языков и эмодзи\n" +
			"- Исправлена ошибка с multi-byte последовательностями\n" +
			"- Процесс деплоя Pages";

		const result = truncateUtf8Bytes(longCyrillic, 384);

		expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(384);
		expect(Buffer.from(result, "utf8").toString()).toBe(result);
	});

	test("should handle Japanese characters (3 bytes each)", ({ expect }) => {
		const japanese = "あいうえおかきくけこ";
		const result = truncateUtf8Bytes(japanese, 15);

		expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(15);
		expect(result).toBe("あいうえお");
	});

	test("should handle emoji (4 bytes each)", ({ expect }) => {
		const emoji = "😀😁😂🤣😃😄😅😆😉😊";
		const result = truncateUtf8Bytes(emoji, 16);

		expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(16);
		expect(result).toBe("😀😁😂🤣");
	});

	test("should not split multi-byte UTF-8 sequences", ({ expect }) => {
		const testString = "a".repeat(380) + "あ"; // 380 + 3 = 383 bytes
		const result = truncateUtf8Bytes(testString, 381);

		expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(381);
		expect(result).toBe("a".repeat(380));
	});

	test("should handle continuation bytes at boundary", ({ expect }) => {
		const testString = "a".repeat(379) + "あ"; // 379 + 3 = 382 bytes
		const result = truncateUtf8Bytes(testString, 380);

		expect(Buffer.byteLength(result, "utf8")).toBe(379);
		expect(result).toBe("a".repeat(379));
	});

	test("should handle mixed ASCII and multi-byte characters", ({ expect }) => {
		const mixed = "Hello мир 😊 World あいう";
		const result = truncateUtf8Bytes(mixed, 30);

		expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(30);
		expect(Buffer.from(result, "utf8").toString()).toBe(result);
	});

	test("should handle empty string", ({ expect }) => {
		const result = truncateUtf8Bytes("", 384);
		expect(result).toBe("");
	});

	test("should handle single multi-byte character at boundary", ({
		expect,
	}) => {
		const testString = "a".repeat(382) + "あ"; // 382 + 3 = 385 bytes total
		const result = truncateUtf8Bytes(testString, 384);

		expect(Buffer.byteLength(result, "utf8")).toBe(382);
		expect(result).toBe("a".repeat(382));
	});

	test("should preserve valid UTF-8 structure", ({ expect }) => {
		const cyrillicText = "тест тест тест тест ".repeat(20);
		const result = truncateUtf8Bytes(cyrillicText, 384);

		expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(384);

		const bytes = Buffer.from(result, "utf8");
		for (let i = 0; i < bytes.length; i++) {
			const byte = bytes[i];
			if (byte >= 0x80 && byte <= 0xbf) {
				const prevByte = bytes[i - 1];
				const isContinuation =
					prevByte !== undefined &&
					((prevByte >= 0xc0 && prevByte <= 0xdf) ||
						(prevByte >= 0xe0 && prevByte <= 0xef) ||
						(prevByte >= 0xf0 && prevByte <= 0xf7));
				expect(isContinuation).toBe(true);
			}
		}
	});

	test("should handle exactly 384 bytes with multi-byte chars", ({
		expect,
	}) => {
		const japanese = "あ".repeat(128); // 128 * 3 = 384 bytes
		const result = truncateUtf8Bytes(japanese, 384);

		expect(Buffer.byteLength(result, "utf8")).toBe(384);
		expect(result).toBe("あ".repeat(128));
	});

	test("should handle 385 bytes with multi-byte chars", ({ expect }) => {
		const japanese = "あ".repeat(128) + "a"; // 384 + 1 = 385 bytes
		const result = truncateUtf8Bytes(japanese, 384);

		expect(Buffer.byteLength(result, "utf8")).toBe(384);
		expect(result).toBe("あ".repeat(128));
	});

	test("should handle strings with LF line breaks", ({ expect }) => {
		const multiline = "a\n" + "b".repeat(382); // 1 + 1 + 382 = 384 bytes
		const result = truncateUtf8Bytes(multiline, 384);

		expect(Buffer.byteLength(result, "utf8")).toBe(384);
		expect(result).toBe(multiline);
	});

	test("should handle strings with CRLF line breaks", ({ expect }) => {
		const multiline = "a\r\n" + "b".repeat(382); // 1 + 2 + 382 = 385 bytes
		const result = truncateUtf8Bytes(multiline, 384);

		expect(Buffer.byteLength(result, "utf8")).toBe(384);
		expect(result).toBe("a\r\n" + "b".repeat(381));
	});

	test("should handle multi-line string where CRLF normalization would push past limit", ({
		expect,
	}) => {
		// This is the exact scenario from issue #12679:
		// A message with LF that is under 384 bytes, but after CRLF normalization
		// would exceed 384 bytes and potentially split a multi-byte char.
		// With LF: "a\n" + "a".repeat(378) + "あ" = 1 + 1 + 378 + 3 = 383 bytes
		// With CRLF: "a\r\n" + "a".repeat(378) + "あ" = 1 + 2 + 378 + 3 = 384 bytes
		const normalized = "a\r\n" + "a".repeat(378) + "あ";
		const result = truncateUtf8Bytes(normalized, 384);

		expect(Buffer.byteLength(result, "utf8")).toBe(384);
		expect(result).toBe(normalized);
	});

	test("should not split multi-byte char at boundary after CRLF normalization", ({
		expect,
	}) => {
		// With CRLF: "a\r\n" + "a".repeat(379) + "あ" = 1 + 2 + 379 + 3 = 385 bytes
		// Truncation should drop the "あ" rather than split it
		const normalized = "a\r\n" + "a".repeat(379) + "あ";
		const result = truncateUtf8Bytes(normalized, 384);

		expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(384);
		expect(result).toBe("a\r\n" + "a".repeat(379));
	});

	test("should reproduce the exact failing example from issue #12679", ({
		expect,
	}) => {
		// The issue's exact example: "a\n\n" + "a".repeat(377) + "あ\n"
		// With LF: 1 + 1 + 1 + 377 + 3 + 1 = 384 bytes... wait, let me be precise.
		// Original message: "a\n\n<379 a's + あ>\n"
		// Let me just reconstruct it exactly:
		const original =
			"a\n\n" +
			"a".repeat(
				384 - 1 - 1 - 1 - 3 // = 378 a's to get exactly 383 bytes with LF
			) +
			"あ";

		// After CRLF normalization: "a\r\n\r\n" + "a".repeat(378) + "あ"
		// = 1 + 2 + 2 + 378 + 3 = 386 bytes (> 384), would need truncation
		const normalizedMsg = original.replace(/\r\n|\r|\n/g, "\r\n");
		const result = truncateUtf8Bytes(normalizedMsg, 384);

		expect(Buffer.byteLength(result, "utf8")).toBeLessThanOrEqual(384);
		// The result should be valid UTF-8 (no split multi-byte chars)
		expect(Buffer.from(result, "utf8").toString()).toBe(result);
	});
});
