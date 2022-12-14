import { dedent, LineSplittingStream } from "../setup";

describe("dedent", () => {
	test("empty string", () => {
		expect(dedent``).toBe("");
	});
	test("tab-indented block", () => {
		expect(dedent`
\t\t\tindented block
\t\t\t\twith content
\t\t\tover multiple lines
\t\t`).toBe("indented block\n\twith content\nover multiple lines");
	});
	test("space-indented block", () => {
		expect(dedent`
      indented block
        with content
      over multiple lines
    `).toBe("indented block\n  with content\nover multiple lines");
	});
	test("mixed-indented block", () => {
		expect(dedent`
\t  indented block
\t  \twith content
\t  over multiple lines
\t  `).toBe("indented block\n\twith content\nover multiple lines");
	});
	test("no indents on first line", () => {
		expect(dedent`indented block
\t\twith content
\tover multiple lines
\t`).toBe("indented block\n\twith content\nover multiple lines");
	});
	test("no trailing newline", () => {
		expect(dedent`
\tindented block
\t\twith content
\tover multiple lines`).toBe(
			"indented block\n\twith content\nover multiple lines"
		);
	});
});

test("LineSplittingStream", async () => {
	let { readable, writable } = new LineSplittingStream();
	let reader = readable.getReader();
	let writer = writable.getWriter();

	// Check buffers chunks until LF
	void writer.write("a");
	void writer.write("b");
	void writer.write("c\n");
	let result = await reader.read();
	expect(result).toEqual({ done: false, value: "abc" });

	// Check buffers chunks until CRLF
	void writer.write("d");
	void writer.write("e");
	void writer.write("f\r\n");
	result = await reader.read();
	expect(result).toEqual({ done: false, value: "def" });

	// Checks returns lines in correct order with multiple (CF)LFs,
	// trimming and skipping empty lines
	void writer.write("ghi\n   j\r\nk   \r\n\n\nlmnop\n\r\n qr \r\n");
	result = await reader.read();
	expect(result).toEqual({ done: false, value: "ghi" });
	result = await reader.read();
	expect(result).toEqual({ done: false, value: "j" });
	result = await reader.read();
	expect(result).toEqual({ done: false, value: "k" });
	result = await reader.read();
	expect(result).toEqual({ done: false, value: "lmnop" });
	result = await reader.read();
	expect(result).toEqual({ done: false, value: "qr" });

	// Check flushes and trims buffer when closing
	void writer.write("   st   "); // (note no trailing newline)
	void writer.close();
	result = await reader.read();
	expect(result).toEqual({ done: false, value: "st" });
	result = await reader.read();
	expect(result).toEqual({ done: true, value: undefined });

	// Check skips empty lines when closing
	({ readable, writable } = new LineSplittingStream());
	reader = readable.getReader();
	writer = writable.getWriter();
	void writer.write("uvw\n   "); // (note no trailing newline)
	void writer.close();
	result = await reader.read();
	expect(result).toEqual({ done: false, value: "uvw" });
	result = await reader.read();
	expect(result).toEqual({ done: true, value: undefined });
});
