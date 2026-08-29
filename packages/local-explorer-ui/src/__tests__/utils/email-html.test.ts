import { describe, test } from "vitest";
import { createSafeEmailPreview } from "../../utils/email-html";

describe("createSafeEmailPreview", () => {
	test("blocks remote resources while preserving inline email content", ({
		expect,
	}) => {
		const html =
			'<style>p { color: red }</style><p>Hello</p><img src="https://tracker.example/pixel">';

		const preview = createSafeEmailPreview(html);

		expect(preview).toContain("default-src 'none'");
		expect(preview).toContain("img-src data: cid:");
		expect(preview).toContain("style-src 'unsafe-inline'");
		expect(preview).not.toContain("img-src https:");
		expect(preview.endsWith(html)).toBe(true);
	});
});
