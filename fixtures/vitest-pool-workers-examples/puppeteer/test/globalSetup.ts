import puppeteer, { Browser } from "puppeteer";
import type { GlobalSetupContext } from "vitest/node";

let browser: Browser;

export default async function setup({ provide }: GlobalSetupContext) {
	browser = await puppeteer.launch({
		args: [`--no-sandbox`, `--disable-setuid-sandbox`], // DISABLING THESE SANDBOXES IS PROBABLY NOT REQUIRED IN YOUR PROJECT
	});
	provide("browserWSEndpoint", browser.wsEndpoint());
}

export async function teardown() {
	await browser.close();
}

declare module "vitest" {
	export interface ProvidedContext {
		browserWSEndpoint: string;
	}
}
