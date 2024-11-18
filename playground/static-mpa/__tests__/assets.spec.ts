import { expect, test } from 'vitest';
import { isBuild, page, viteTestUrl } from '../../__test-utils__';

test.runIf(!isBuild)('returns the correct home page', async () => {
	const content = await page.textContent('h1');
	expect(content).toBe('Home');
});

test.runIf(!isBuild)('returns the correct contact page', async () => {
	await page.goto(`${viteTestUrl}/contact`);
	const content = await page.textContent('h1');
	expect(content).toBe('Contact');
});

test.runIf(!isBuild)('returns the correct about page', async () => {
	await page.goto(`${viteTestUrl}/about`);
	const content = await page.textContent('h1');
	expect(content).toBe('About');
});

test.runIf(!isBuild)('returns the correct canonical URL', async () => {
	await page.goto(`${viteTestUrl}/about`);
	const url = page.url();
	expect(url).toBe(`${viteTestUrl}/about/`);
});

test.runIf(!isBuild)('returns the correct root 404 page', async () => {
	await page.goto(`${viteTestUrl}/random-page`);
	const content = await page.textContent('h1');
	expect(content).toBe('Root 404');
});

test.runIf(!isBuild)('returns the correct nested 404 page', async () => {
	await page.goto(`${viteTestUrl}/about/random-page`);
	const content = await page.textContent('h1');
	expect(content).toBe('About 404');
});
