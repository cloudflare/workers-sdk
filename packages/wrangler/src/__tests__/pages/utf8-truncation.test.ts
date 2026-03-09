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
});
