// Functions here are serialised by puppeteer and run inside the page, so they
// can only use their arguments and browser globals. Miniflare doesn't compile
// against the DOM library, so declare the little of it they touch.

interface PageNode {
	readonly localName?: string;
	readonly nextSibling: PageNode | null;
	readonly nodeName: string;
	readonly textContent: string;
}

interface PageElement extends PageNode {
	readonly attributes: ArrayLike<{ name: string; value: string }>;
	readonly classList: { add(token: string): void };
	readonly firstChild: PageNode | null;
	readonly innerHTML: string;
	readonly innerText: string;
	readonly offsetHeight: number;
	readonly offsetWidth: number;
	readonly outerHTML: string;
	getAttribute(name: string): string | null;
	getBoundingClientRect(): { left: number; top: number };
}

interface PageDocument {
	readonly childNodes: Iterable<PageNode>;
	readonly documentElement: PageElement;
	querySelectorAll(
		selector: string
	): ArrayLike<PageElement> & Iterable<PageElement>;
}

declare const document: PageDocument & {
	cloneNode(deep: true): PageDocument;
};

declare const XMLSerializer: new () => {
	serializeToString(node: PageNode): string;
};

export function scrapeElements(elements: { selector: string }[]) {
	return elements.map(({ selector }) => ({
		results: Array.from(document.querySelectorAll(selector), (element) => {
			const rect = element.getBoundingClientRect();
			return {
				attributes: Array.from(element.attributes, ({ name, value }) => ({
					name,
					value,
				})),
				height: element.offsetHeight,
				html: element.innerHTML,
				left: rect.left,
				text: element.innerText,
				top: rect.top,
				width: element.offsetWidth,
			};
		}),
		selector,
	}));
}

export function contentForMarkdown(): string {
	const isCode = (node: PageNode | null): node is PageElement =>
		node?.localName === "code";
	const classLanguage = (element: PageElement) =>
		/(?:^|[\t\n\f\r ])language-([^\t\n\f\r ]+)/.exec(
			element.getAttribute("class") ?? ""
		)?.[1];
	const safe = (language: string | null | undefined) =>
		/^[\t\n\f\r ]*([^\0-\x20"&'<>`~\x7f]+)[\t\n\f\r ]*$/.exec(
			language ?? ""
		)?.[1];

	const copy = document.cloneNode(true);
	for (const pre of copy.querySelectorAll("pre")) {
		let first = pre.firstChild;
		while (
			first?.nodeName === "#text" &&
			/^[\t\n\f\r ]*$/.test(first.textContent)
		) {
			first = first.nextSibling;
		}
		const code = isCode(first) ? first : undefined;
		const target = code ?? pre;
		if (classLanguage(target) !== undefined) {
			continue;
		}
		const language = [
			code?.getAttribute("data-language"),
			code?.getAttribute("data-lang"),
			classLanguage(pre),
			pre.getAttribute("data-language"),
			pre.getAttribute("data-lang"),
		]
			.map(safe)
			.find(Boolean);
		if (language) {
			target.classList.add(`language-${language}`);
		}
	}
	let html = "";
	for (const node of copy.childNodes) {
		html +=
			node === copy.documentElement
				? copy.documentElement.outerHTML
				: new XMLSerializer().serializeToString(node);
	}
	return html;
}
