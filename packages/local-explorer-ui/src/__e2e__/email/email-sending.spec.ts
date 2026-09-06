import { afterEach, test } from "vitest";
import { page, viteUrl } from "../utils";
import {
	cleanupEmailMocks,
	EMAIL_PREVIEW_REMOTE_ROUTE,
	mockSentEmail,
} from "./utils";

// Keep this independent of the production constant so weakening the preview
// policy causes the security test to fail.
const EXPECTED_EMAIL_PREVIEW_CSP =
	"default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'; font-src data:";

afterEach(async () => {
	await cleanupEmailMocks();
});

test("shows sent email details in a split view", async ({ expect }) => {
	const hostileHtml =
		'<img src="https://email-preview.invalid/pixel"><meta http-equiv="refresh" content="0;url=https://email-preview.invalid/navigate"><script>document.body.dataset.scriptExecuted="true"; top.location="https://email-preview.invalid/script"</script><form action="https://email-preview.invalid/form" method="post"><button type="submit">Submit unsafe form</button></form>';
	let remoteRequests = 0;
	await page.route(EMAIL_PREVIEW_REMOTE_ROUTE, async (route) => {
		remoteRequests += 1;
		await route.abort();
	});
	const { requestedWorkers, showFullDetail } = await mockSentEmail({
		html: hostileHtml,
	});

	await page.goto(
		new URL(
			"/cdn-cgi/local/explorer/email/sending?worker=missing-worker",
			viteUrl
		).toString()
	);
	await expect
		.poll(() => new URL(page.url()).searchParams.get("worker"))
		.toBe("worker-1");
	await expect.poll(() => requestedWorkers.includes("worker-1")).toBe(true);
	await page.getByTestId("sent-email-list").waitFor();
	await expect
		.poll(() => page.getByTestId("sent-email-details").isVisible())
		.toBe(false);

	await page.getByRole("button", { name: /Sent email subject/ }).click();
	await expect
		.poll(() => page.getByTestId("sent-email-details").isVisible())
		.toBe(true);
	await page.getByRole("button", { name: /^Content/ }).click();
	await page.getByText("sent-email-id", { exact: true }).waitFor();
	expect(await page.getByText("<sent-email-id>", { exact: true }).count()).toBe(
		0
	);
	await page
		.getByText("recipient@example.com", { exact: true })
		.last()
		.waitFor();
	expect(
		await page.getByText("<recipient@example.com>", { exact: true }).count()
	).toBe(0);
	await page.getByRole("heading", { name: "Standard headers" }).waitFor();
	await page.getByText("sender@example.com", { exact: true }).waitFor();
	expect(
		await page.getByText("<sender@example.com>", { exact: true }).count()
	).toBe(0);
	await page.getByText("Content-Type", { exact: true }).waitFor();
	await page.getByText("text/plain; charset=utf-8", { exact: true }).waitFor();
	await page.getByRole("heading", { name: "Custom headers" }).waitFor();
	await page.getByText("X-Custom-Header").waitFor();
	await page.getByText("custom value").waitFor();
	expect(await page.getByText("Worker", { exact: true }).count()).toBe(0);
	await page
		.getByText(/complete email is available in temporary local storage/)
		.first()
		.waitFor();
	expect(await page.getByText("Plain text body", { exact: true }).count()).toBe(
		0
	);
	expect(
		await page.locator('iframe[title="Rendered HTML email body"]').count()
	).toBe(0);

	await page.getByRole("button", { name: /Sent email subject/ }).click();
	await expect
		.poll(() => page.getByTestId("sent-email-details").isVisible())
		.toBe(false);

	showFullDetail();
	await page.getByRole("button", { name: /Sent email subject/ }).click();
	await page.getByRole("button", { name: /^Content/ }).click();
	const contentPanel = page.getByTestId("sent-email-content-panel");
	const textBody = contentPanel.locator("pre").filter({
		hasText: "Plain text body",
	});
	await textBody.waitFor();
	expect(
		await textBody.evaluate((element) => {
			const style = window.getComputedStyle(element);
			return {
				hasHorizontalOverflow: element.scrollWidth > element.clientWidth,
				overflowWrap: style.overflowWrap,
				overflowX: style.overflowX,
			};
		})
	).toEqual({
		hasHorizontalOverflow: false,
		overflowWrap: "break-word",
		overflowX: "hidden",
	});
	const parentUrl = page.url();
	const preview = page.locator('iframe[title="Rendered HTML email body"]');
	await preview.waitFor();
	expect(await preview.getAttribute("csp")).toBe(EXPECTED_EMAIL_PREVIEW_CSP);
	expect(await preview.getAttribute("sandbox")).toBe("");
	expect(await preview.getAttribute("referrerpolicy")).toBe("no-referrer");
	const previewFrame = preview.contentFrame();
	await previewFrame.locator("body").waitFor();
	expect(
		await previewFrame
			.locator('meta[http-equiv="Content-Security-Policy"]')
			.getAttribute("content")
	).toBe(EXPECTED_EMAIL_PREVIEW_CSP);
	expect(
		await previewFrame.locator("body").getAttribute("data-script-executed")
	).toBeNull();
	await previewFrame
		.getByRole("button", { name: "Submit unsafe form" })
		.click();
	await page.waitForTimeout(250);
	expect(remoteRequests).toBe(0);
	expect(page.url()).toBe(parentUrl);
	const previewView = page.getByRole("button", {
		name: "Preview",
		exact: true,
	});
	const sourceView = page.getByRole("button", {
		name: "HTML source",
		exact: true,
	});
	await expect
		.poll(() => previewView.getAttribute("aria-pressed"))
		.toBe("true");
	await expect
		.poll(() => sourceView.getAttribute("aria-pressed"))
		.toBe("false");
	await sourceView.click();
	await page.getByText(hostileHtml, { exact: true }).waitFor();
	await expect.poll(() => sourceView.getAttribute("aria-pressed")).toBe("true");
	expect(
		await page.locator('iframe[title="Rendered HTML email body"]').count()
	).toBe(0);
	await contentPanel.getByRole("heading", { name: "Raw MIME" }).waitFor();
	await contentPanel
		.getByText("Content-Type: text/html; charset=utf-8", { exact: false })
		.waitFor();
});
