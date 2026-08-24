import { afterEach, test } from "vitest";
import { createSafeEmailPreview, EMAIL_PREVIEW_CSP } from "../utils/email-html";
import { page, viteUrl } from "./utils";

const WORKERS_ROUTE = "**/cdn-cgi/local/explorer/api/local/workers";
const EMAIL_SENDING_ROUTE =
	"**/cdn-cgi/local/explorer/api/local/email/sending?*";

afterEach(async () => {
	await page.unroute(WORKERS_ROUTE);
	await page.unroute(EMAIL_SENDING_ROUTE);
});

test("shows sent email details in a split view", async ({ expect }) => {
	const requestedWorkers: Array<string | null> = [];
	await page.route(WORKERS_ROUTE, async (route) => {
		await route.fulfill({
			contentType: "application/json",
			body: JSON.stringify({
				errors: [],
				messages: [],
				result: [
					{
						bindings: { sendEmail: [{ bindingName: "SEND_EMAIL" }] },
						isSelf: true,
						name: "worker-1",
					},
					{
						bindings: {},
						isSelf: false,
						name: "worker-2",
					},
				],
				success: true,
			}),
		});
	});

	await page.route(EMAIL_SENDING_ROUTE, async (route) => {
		const search = new URL(route.request().url()).searchParams;
		const emailId = search.get("email_id");
		requestedWorkers.push(search.get("worker"));
		const summary = {
			attachments: [],
			from: "sender@example.com",
			headers: { "X-Custom-Header": "custom value" },
			messageId: "<sent-email-id>",
			sentAt: "2026-08-21T12:00:00.000Z",
			subject: "Sent email subject",
			to: ["recipient@example.com"],
			worker: "worker-1",
		};
		await route.fulfill({
			contentType: "application/json",
			body: JSON.stringify({
				errors: [],
				messages: emailId
					? [
							{
								code: 10604,
								message:
									"Displayed sent email content was truncated during local capture. The complete email is available in the local filesystem; see the development log for its path.",
							},
						]
					: [],
				result: emailId
					? {
							...summary,
							html: "<p>Rendered HTML body</p>",
							text: "Plain text body",
						}
					: [summary],
				result_info: emailId
					? undefined
					: { count: 1, has_more: false, per_page: 25 },
				success: true,
			}),
		});
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
	const viewportOverflow = await page.locator("main").evaluate((element) => ({
		clientHeight: element.clientHeight,
		scrollHeight: element.scrollHeight,
	}));
	expect(viewportOverflow.scrollHeight).toBe(viewportOverflow.clientHeight);
	const refreshTop = await page
		.getByRole("button", { name: "Refresh" })
		.evaluate((element) => element.getBoundingClientRect().top);
	const paginationTop = await page
		.getByRole("button", { name: "Next page" })
		.evaluate((element) => element.getBoundingClientRect().top);
	expect(Math.abs(refreshTop - paginationTop)).toBeLessThanOrEqual(1);
	await expect
		.poll(() => page.getByTestId("sent-email-details").isVisible())
		.toBe(false);
	const fullWidth = await page
		.getByTestId("sent-email-list")
		.evaluate((element) => element.getBoundingClientRect().width);

	await page.getByRole("button", { name: /Sent email subject/ }).click();
	await expect
		.poll(() => page.getByTestId("sent-email-details").isVisible())
		.toBe(true);
	await expect
		.poll(async () => {
			const listWidth = await page
				.getByTestId("sent-email-list")
				.evaluate((element) => element.getBoundingClientRect().width);
			const detailWidth = await page
				.getByTestId("sent-email-details")
				.evaluate((element) => element.getBoundingClientRect().width);
			return Math.abs(listWidth - detailWidth);
		})
		.toBeLessThanOrEqual(1);
	const listWidth = await page
		.getByTestId("sent-email-list")
		.evaluate((element) => element.getBoundingClientRect().width);
	const detailWidth = await page
		.getByTestId("sent-email-details")
		.evaluate((element) => element.getBoundingClientRect().width);
	expect(Math.abs(listWidth - detailWidth)).toBeLessThanOrEqual(1);
	expect(listWidth).toBeLessThan(fullWidth * 0.6);
	await page.getByText("X-Custom-Header").waitFor();
	await page.getByText("custom value").waitFor();
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
	await expect
		.poll(async () => {
			const restoredWidth = await page
				.getByTestId("sent-email-list")
				.evaluate((element) => element.getBoundingClientRect().width);
			return Math.abs(restoredWidth - fullWidth);
		})
		.toBeLessThanOrEqual(1);
});

test("email previews block remote resources and navigation", async ({
	expect,
}) => {
	let remoteRequests = 0;
	await page.route("https://email-preview.invalid/**", async (route) => {
		remoteRequests += 1;
		await route.abort();
	});
	try {
		const parentUrl = page.url();
		await page.setContent("<main></main>");
		await page.evaluate(
			({ csp, preview }) => {
				const iframe = document.createElement("iframe");
				iframe.setAttribute("csp", csp);
				iframe.setAttribute("sandbox", "");
				iframe.srcdoc = preview;
				document.querySelector("main")?.append(iframe);
			},
			{
				csp: EMAIL_PREVIEW_CSP,
				preview: createSafeEmailPreview(
					'<img src="https://email-preview.invalid/pixel"><meta http-equiv="refresh" content="0;url=https://email-preview.invalid/navigate"><script>document.body.dataset.scriptExecuted="true"; top.location="https://email-preview.invalid/script"</script><form action="https://email-preview.invalid/form" method="post"><button type="submit">Submit unsafe form</button></form>'
				),
			}
		);
		const previewFrame = page.locator("iframe").contentFrame();
		await previewFrame.locator("body").waitFor();
		expect(
			await previewFrame.locator("body").getAttribute("data-script-executed")
		).toBeNull();
		await previewFrame
			.getByRole("button", { name: "Submit unsafe form" })
			.click();
		await new Promise((resolve) => setTimeout(resolve, 250));

		expect(remoteRequests).toBe(0);
		expect(page.url()).toBe(parentUrl);
	} finally {
		await page.unroute("https://email-preview.invalid/**");
	}
});
