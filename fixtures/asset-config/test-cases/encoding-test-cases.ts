import { TestCase } from "../html-handling.test";

export const encodingTestCases: {
	html_handling:
		| "auto-trailing-slash"
		| "drop-trailing-slash"
		| "force-trailing-slash"
		| "none";
	cases: TestCase[];
}[] = [
	{
		html_handling: "auto-trailing-slash",
		cases: [
			{
				title: "/[boop] -> /%5Bboop%5D 307 (with /[boop].html)",
				files: ["/[boop].html"],
				requestPath: "/[boop]",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/%5Bboop%5D -> 200 (with /[boop].html)",
				files: ["/[boop].html"],
				requestPath: "/%5Bboop%5D",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			// auto-trailing-slash html handling still works
			{
				title: "/%5Bboop%5D.html -> /%5Bboop%5D 307 (with /[boop].html)",
				files: ["/[boop].html"],
				requestPath: "/%5Bboop%5D.html",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/[boop].html -> /%5Bboop%5D 307 (with /[boop].html)",
				files: ["/[boop].html"],
				requestPath: "/[boop].html",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/%5Bboop%5D/ -> /%5Bboop%5D 307 (with /[boop].html)",
				files: ["/[boop].html"],
				requestPath: "/%5Bboop%5D/",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/[boop]/ -> /%5Bboop%5D 307 (with /[boop].html)",
				files: ["/[boop].html"],
				requestPath: "/[boop]/",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/[boop] -> /%5Bboop%5D 307 (with /[boop].html)",
				files: ["/[boop].html", "/[boop]/index.html"],
				requestPath: "/[boop]",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/%5Bboop%5D -> 200 (with /[boop].html)",
				files: ["/[boop].html", "/[boop]/index.html"],
				requestPath: "/%5Bboop%5D",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/[boop].html -> /%5Bboop%5D 307 (with /[boop].html)",
				files: ["/[boop].html", "/[boop]/index.html"],
				requestPath: "/[boop].html",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/%5Bboop%5D.html -> /%5Bboop%5D 307 (with /[boop].html)",
				files: ["/[boop].html", "/[boop]/index.html"],
				requestPath: "/%5Bboop%5D.html",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/[boop]/ -> /%5Bboop%5D/ 307 (with /[boop]/index.html)",
				files: ["/[boop].html", "/[boop]/index.html"],
				requestPath: "/[boop]/",
				matchedFile: "/[boop]/index.html",
				finalPath: "/%5Bboop%5D/",
			},
			{
				title: "/%5Bboop%5D/ -> 200 (with /[boop]/index.html)",
				files: ["/[boop].html", "/[boop]/index.html"],
				requestPath: "/%5Bboop%5D/",
				matchedFile: "/[boop]/index.html",
				finalPath: "/%5Bboop%5D/",
			},
			{
				title:
					"/[boop]/index.html -> /%5Bboop%5D/ 307 (with /[boop]/index.html)",
				files: ["/[boop].html", "/[boop]/index.html"],
				requestPath: "/[boop]/index.html",
				matchedFile: "/[boop]/index.html",
				finalPath: "/%5Bboop%5D/",
			},
			{
				title:
					"/%5Bboop%5D/index.html -> /%5Bboop%5D/ 307 (with /[boop]/index.html)",
				files: ["/[boop].html", "/[boop]/index.html"],
				requestPath: "/%5Bboop%5D/index.html",
				matchedFile: "/[boop]/index.html",
				finalPath: "/%5Bboop%5D/",
			},
			// paths with a mix of encoded and unencoded characters
			{
				title:
					"/beep/[b%C3%B2op] -> /beep/%5Bb%C3%B2op%5D 307 (with /beep/[bòop].html)",
				files: ["/beep/[bòop].html"],
				requestPath: "/beep/[b%C3%B2op]",
				matchedFile: "/beep/[bòop].html",
				finalPath: "/beep/%5Bb%C3%B2op%5D",
			},
			// user-encoded paths should only be accessible at the (double) encoded path
			{
				title: "/[boop] -> /%5Bboop%5D 307 (with /[boop].html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/[boop]",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/[boop].html -> /%5Bboop%5D 307 (with /[boop].html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/[boop].html",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/%5Bboop%5D -> 200 (with /[boop].html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/%5Bboop%5D",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/%5Bboop%5D.html -> /%5Bboop%5D 307 (with /[boop].html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/%5Bboop%5D.html",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/%5Bboop%5D -> 200 (with /[boop].html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/%5Bboop%5D",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/%255Bboop%255D -> 200 (with /%5Bboop%5D.html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/%255Bboop%255D",
				matchedFile: "/%5Bboop%5D.html",
				finalPath: "/%255Bboop%255D",
			},
			{
				title:
					"/%255Bboop%255D.html -> /%255Bboop%255D 307 (with /%5Bboop%5D.html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/%255Bboop%255D.html",
				matchedFile: "/%5Bboop%5D.html",
				finalPath: "/%255Bboop%255D",
			},
			{
				title: "/beep?boop -> 404",
				files: ["/beep?boop.html"],
				requestPath: "/beep?boop",
			},
			{
				title: "/beep%3Fboop -> 200 (with /beep?boop.html)",
				files: ["/beep?boop.html"],
				requestPath: "/beep%3Fboop",
				matchedFile: "/beep?boop.html",
				finalPath: "/beep%3Fboop",
			},
			{
				title: "/beep%3Fboop/ -> /beep%3Fboop 307 (with /beep?boop.html)",
				files: ["/beep?boop.html"],
				requestPath: "/beep%3Fboop/",
				matchedFile: "/beep?boop.html",
				finalPath: "/beep%3Fboop",
			},
		],
	},
	{
		html_handling: "drop-trailing-slash",
		cases: [
			{
				title: "/[boop] -> /%5Bboop%5D 307 (with /[boop].html)",
				files: ["/[boop].html"],
				requestPath: "/[boop]",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/%5Bboop%5D -> 200 (with /[boop].html)",
				files: ["/[boop].html"],
				requestPath: "/%5Bboop%5D",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			// drop-trailing-slash html handling still works
			{
				title: "/%5Bboop%5D.html -> /%5Bboop%5D 307 (with /[boop].html)",
				files: ["/[boop].html"],
				requestPath: "/%5Bboop%5D.html",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/[boop].html -> /%5Bboop%5D 307 (with /[boop].html)",
				files: ["/[boop].html"],
				requestPath: "/[boop].html",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/%5Bboop%5D/ -> /%5Bboop%5D 307 (with /[boop].html)",
				files: ["/[boop].html"],
				requestPath: "/%5Bboop%5D/",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/[boop]/ -> /%5Bboop%5D 307 (with /[boop].html)",
				files: ["/[boop].html"],
				requestPath: "/[boop]/",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/[boop] -> /%5Bboop%5D 307 (with /[boop].html)",
				files: ["/[boop].html", "/[boop]/index.html"],
				requestPath: "/[boop]",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/%5Bboop%5D -> 200 (with /[boop].html)",
				files: ["/[boop].html", "/[boop]/index.html"],
				requestPath: "/%5Bboop%5D",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/[boop].html -> /%5Bboop%5D 307 (with /[boop].html)",
				files: ["/[boop].html", "/[boop]/index.html"],
				requestPath: "/[boop].html",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/%5Bboop%5D.html -> /%5Bboop%5D 307 (with /[boop].html)",
				files: ["/[boop].html", "/[boop]/index.html"],
				requestPath: "/%5Bboop%5D.html",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/[boop]/ -> /%5Bboop%5D 307 (with /[boop].html)",
				files: ["/[boop].html", "/[boop]/index.html"],
				requestPath: "/[boop]/",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/%5Bboop%5D/ -> /%5Bboop%5D 307 (with /[boop].html)",
				files: ["/[boop].html", "/[boop]/index.html"],
				requestPath: "/%5Bboop%5D/",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title:
					"/[boop]/index.html -> /%5Bboop%5D/index.html 307 (with /[boop]/index.html)",
				files: ["/[boop].html", "/[boop]/index.html"],
				requestPath: "/[boop]/index.html",
				matchedFile: "/[boop]/index.html",
				finalPath: "/%5Bboop%5D/index.html",
			},
			{
				title: "/%5Bboop%5D/index.html -> 200 (with /[boop]/index.html)",
				files: ["/[boop].html", "/[boop]/index.html"],
				requestPath: "/%5Bboop%5D/index.html",
				matchedFile: "/[boop]/index.html",
				finalPath: "/%5Bboop%5D/index.html",
			},
			// paths with a mix of encoded and unencoded characters
			{
				title:
					"/beep/[b%C3%B2op] -> /beep/%5Bb%C3%B2op%5D 307 (with /beep/[bòop].html)",
				files: ["/beep/[bòop].html"],
				requestPath: "/beep/[b%C3%B2op]",
				matchedFile: "/beep/[bòop].html",
				finalPath: "/beep/%5Bb%C3%B2op%5D",
			},
			// user-encoded paths should only be accessible at the (double) encoded path
			{
				title: "/[boop] -> /%5Bboop%5D 307 (with /[boop].html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/[boop]",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/[boop].html -> /%5Bboop%5D 307 (with /[boop].html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/[boop].html",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/%5Bboop%5D -> 200 (with /[boop].html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/%5Bboop%5D",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/%5Bboop%5D.html -> /%5Bboop%5D 307 (with /[boop].html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/%5Bboop%5D.html",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/%5Bboop%5D -> 200 (with /[boop].html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/%5Bboop%5D",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/%255Bboop%255D -> 200 (with /%5Bboop%5D.html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/%255Bboop%255D",
				matchedFile: "/%5Bboop%5D.html",
				finalPath: "/%255Bboop%255D",
			},
			{
				title:
					"/%255Bboop%255D.html -> /%255Bboop%255D 307 (with /%5Bboop%5D.html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/%255Bboop%255D.html",
				matchedFile: "/%5Bboop%5D.html",
				finalPath: "/%255Bboop%255D",
			},
			{
				title: "/beep?boop -> 404",
				files: ["/beep?boop.html"],
				requestPath: "/beep?boop",
			},
			{
				title: "/beep%3Fboop -> 200 (with /beep?boop.html)",
				files: ["/beep?boop.html"],
				requestPath: "/beep%3Fboop",
				matchedFile: "/beep?boop.html",
				finalPath: "/beep%3Fboop",
			},
			{
				title: "/beep%3Fboop/ -> /beep%3Fboop 307 (with /beep?boop.html)",
				files: ["/beep?boop.html"],
				requestPath: "/beep%3Fboop/",
				matchedFile: "/beep?boop.html",
				finalPath: "/beep%3Fboop",
			},
		],
	},
	{
		html_handling: "force-trailing-slash",
		cases: [
			{
				title: "/%5Bboop%5D/ -> 200 (with /[boop].html)",
				files: ["/[boop].html"],
				requestPath: "/%5Bboop%5D/",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D/",
			},
			{
				title: "/[boop]/ -> /%5Bboop%5D/ 307 (with /[boop].html)",
				files: ["/[boop].html"],
				requestPath: "/[boop]/",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D/",
			},
			// force-trailing-slash html handling still works
			{
				title: "/[boop] -> /%5Bboop%5D/ 307 (with /[boop]/index.html)",
				files: ["/[boop].html", "/[boop]/index.html"],
				requestPath: "/[boop]",
				matchedFile: "/[boop]/index.html",
				finalPath: "/%5Bboop%5D/",
			},
			{
				title: "/%5Bboop%5D -> /%5Bboop%5D/ 307 (with /[boop]/index.html)",
				files: ["/[boop].html", "/[boop]/index.html"],
				requestPath: "/%5Bboop%5D",
				matchedFile: "/[boop]/index.html",
				finalPath: "/%5Bboop%5D/",
			},
			{
				title: "/[boop].html -> /%5Bboop%5D.html 307 (with /[boop].html)",
				files: ["/[boop].html", "/[boop]/index.html"],
				requestPath: "/[boop].html",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D.html",
			},
			{
				title: "/%5Bboop%5D.html -> 200 (with /[boop].html)",
				files: ["/[boop].html", "/[boop]/index.html"],
				requestPath: "/%5Bboop%5D.html",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D.html",
			},
			{
				title: "/[boop]/ -> /%5Bboop%5D/ 307 (with /[boop]/index.html)",
				files: ["/[boop].html", "/[boop]/index.html"],
				requestPath: "/[boop]/",
				matchedFile: "/[boop]/index.html",
				finalPath: "/%5Bboop%5D/",
			},
			{
				title: "/%5Bboop%5D/ -> 200 (with /[boop]/index.html)",
				files: ["/[boop].html", "/[boop]/index.html"],
				requestPath: "/%5Bboop%5D/",
				matchedFile: "/[boop]/index.html",
				finalPath: "/%5Bboop%5D/",
			},
			{
				title:
					"/[boop]/index.html -> /%5Bboop%5D/ 307 (with /[boop]/index.html)",
				files: ["/[boop].html", "/[boop]/index.html"],
				requestPath: "/[boop]/index.html",
				matchedFile: "/[boop]/index.html",
				finalPath: "/%5Bboop%5D/",
			},
			{
				title:
					"/%5Bboop%5D/index.html -> /%5Bboop%5D/ 307 (with /[boop]/index.html)",
				files: ["/[boop].html", "/[boop]/index.html"],
				requestPath: "/%5Bboop%5D/index.html",
				matchedFile: "/[boop]/index.html",
				finalPath: "/%5Bboop%5D/",
			},
			// paths with a mix of encoded and unencoded characters
			{
				title:
					"/beep/[b%C3%B2op]/ -> /beep/%5Bb%C3%B2op%5D/ 307 (with /beep/[bòop].html)",
				files: ["/beep/[bòop].html"],
				requestPath: "/beep/[b%C3%B2op]/",
				matchedFile: "/beep/[bòop].html",
				finalPath: "/beep/%5Bb%C3%B2op%5D/",
			},
			// user-encoded paths should only be accessible at the (double) encoded path
			{
				title: "/[boop] -> /%5Bboop%5D/ 307 (with /[boop].html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/[boop]",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D/",
			},
			{
				title: "/[boop].html -> /%5Bboop%5D/ 307 (with /[boop].html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/[boop].html",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D/",
			},
			{
				title: "/%5Bboop%5D -> /%5Bboop%5D/ 307 (with /[boop].html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/%5Bboop%5D",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D/",
			},
			{
				title: "/%5Bboop%5D.html -> /%5Bboop%5D/ 307 (with /[boop].html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/%5Bboop%5D.html",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D/",
			},
			{
				title: "/%5Bboop%5D -> /%5Bboop%5D/ 307 (with /[boop].html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/%5Bboop%5D",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D/",
			},
			{
				title:
					"/%255Bboop%255D -> /%255Bboop%255D/ 307 (with /%5Bboop%5D.html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/%255Bboop%255D",
				matchedFile: "/%5Bboop%5D.html",
				finalPath: "/%255Bboop%255D/",
			},
			{
				title:
					"/%255Bboop%255D.html -> /%255Bboop%255D/ 307 (with /%5Bboop%5D.html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/%255Bboop%255D.html",
				matchedFile: "/%5Bboop%5D.html",
				finalPath: "/%255Bboop%255D/",
			},
			{
				title: "/beep?boop/ -> 404",
				files: ["/beep?boop.html"],
				requestPath: "/beep?boop/",
			},
			{
				title: "/beep%3Fboop -> /beep%3Fboop/ 307 (with /beep?boop.html)",
				files: ["/beep?boop.html"],
				requestPath: "/beep%3Fboop",
				matchedFile: "/beep?boop.html",
				finalPath: "/beep%3Fboop/",
			},
			{
				title: "/beep%3Fboop/ -> 200 (with /beep?boop.html)",
				files: ["/beep?boop.html"],
				requestPath: "/beep%3Fboop/",
				matchedFile: "/beep?boop.html",
				finalPath: "/beep%3Fboop/",
			},
		],
	},
	{
		html_handling: "none",
		cases: [
			{
				title: "/[boop] -> 404",
				files: ["/[boop].html"],
				requestPath: "/[boop]",
			},
			{
				title: "/%5Bboop%5D -> 404",
				files: ["/[boop].html"],
				requestPath: "/%5Bboop%5D",
			},
			// encoding still operates when html_handling is set to 'none'
			{
				title: "/[boop].html -> /%5Bboop%5D.html 307 (with /[boop].html)",
				files: ["/[boop].html"],
				requestPath: "/[boop].html",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D.html",
			},
			{
				title: "/%5Bboop%5D.html -> 200 (with /[boop].html)",
				files: ["/[boop].html"],
				requestPath: "/%5Bboop%5D.html",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D.html",
			},
			// mix of encoded and unencoded paths
			{
				title:
					"/beep/[b%C3%B2op].html -> /beep/%5Bb%C3%B2op%5D.html 307 (with /beep/[bòop].html)",
				files: ["/beep/[bòop].html"],
				requestPath: "/beep/[b%C3%B2op].html",
				matchedFile: "/beep/[bòop].html",
				finalPath: "/beep/%5Bb%C3%B2op%5D.html",
			},
			// user-encoded paths should only be accessible at the (double) encoded path
			{
				title: "/[boop].html -> /%5Bboop%5D.html 307 (with /[boop].html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/[boop].html",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D.html",
			},
			{
				title: "/%5Bboop%5D.html -> 200 (with /[boop].html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/%5Bboop%5D.html",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D.html",
			},
			{
				title: "/[boop] -> 404",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/[boop]",
			},
			{
				title: "/%5Bboop%5D -> 404",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/%5Bboop%5D",
			},
			{
				title: "/%255Bboop%255D.html -> 200 (with /%5Bboop%5D.html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/%255Bboop%255D.html",
				matchedFile: "/%5Bboop%5D.html",
				finalPath: "/%255Bboop%255D.html",
			},
			{
				title: "/%255Bboop%255D -> 404",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/%255Bboop%255D",
			},
			{
				title: "/beep?boop/ -> 404",
				files: ["/beep?boop.html"],
				requestPath: "/beep?boop/",
			},
			{
				title: "/beep%3Fboop.html -> 200 (with /beep?boop.html)",
				files: ["/beep?boop.html"],
				requestPath: "/beep%3Fboop.html",
				matchedFile: "/beep?boop.html",
				finalPath: "/beep%3Fboop.html",
			},
			{
				title: "/beep%3Fboop -> 404",
				files: ["/beep?boop.html"],
				requestPath: "/beep%3Fboop",
			},
		],
	},
];
