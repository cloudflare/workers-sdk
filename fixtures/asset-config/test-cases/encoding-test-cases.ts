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
			{
				title: "/%5Bboop%5D -> 200 (with /%5Bboop%5D.html)",
				files: ["/%5Bboop%5D.html"],
				requestPath: "/%5Bboop%5D",
				matchedFile: "/%5Bboop%5D.html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/[boop] -> 307 (with /%5Bboop%5D.html)",
				files: ["/%5Bboop%5D.html"],
				requestPath: "/[boop]",
				matchedFile: "/%5Bboop%5D.html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/%5Bboop%5D.html -> 307 (with /%5Bboop%5D.html)",
				files: ["/%5Bboop%5D.html"],
				requestPath: "/%5Bboop%5D.html",
				matchedFile: "/%5Bboop%5D.html",
				finalPath: "/%5Bboop%5D",
			},
			// mix of encoded and unencoded paths
			{
				title: "/beep/[b%C3%B2op] -> /beep/%5Bb%C3%B2op%5D 307",
				files: ["/beep/[bòop].html"],
				requestPath: "/beep/[b%C3%B2op]",
				matchedFile: "/beep/[bòop].html",
				finalPath: "/beep/%5Bb%C3%B2op%5D",
			},
			// exact matches should win
			{
				title: "/[boop] -> 200 (with /[boop].html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/[boop]",
				matchedFile: "/[boop].html",
				finalPath: "/[boop]",
			},
			{
				title: "/%5Bboop%5D -> 200 (with /%5Bboop%5D.html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/%5Bboop%5D",
				matchedFile: "/%5Bboop%5D.html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/beep?boop -> 404",
				files: ["/beep?boop.html"],
				requestPath: "/beep?boop", // -> /beep -> 404
			},

			{
				title: "/beep%3Fboop -> 200",
				files: ["/beep?boop.html"],
				requestPath: "/beep%3Fboop",
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
			{
				title: "/%5Bboop%5D -> 200 (with /%5Bboop%5D.html)",
				files: ["/%5Bboop%5D.html"],
				requestPath: "/%5Bboop%5D",
				matchedFile: "/%5Bboop%5D.html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/[boop] -> /%5Bboop%5D 307 (with /%5Bboop%5D.html)",
				files: ["/%5Bboop%5D.html"],
				requestPath: "/[boop]",
				matchedFile: "/%5Bboop%5D.html",
				finalPath: "/%5Bboop%5D",
			},
			// drop-trailing-slash html handling still works
			{
				title: "/%5Bboop%5D.html -> 307 (with /%5Bboop%5D.html)",
				files: ["/%5Bboop%5D.html", "/%5Bboop%5D/index.html"],
				requestPath: "/%5Bboop%5D/",
				matchedFile: "/%5Bboop%5D.html",
				finalPath: "/%5Bboop%5D",
			},
			// mix of encoded and unencoded paths
			{
				title: "/beep/[b%C3%B2op] -> /beep/%5Bb%C3%B2op%5D 307",
				files: ["/beep/[bòop].html"],
				requestPath: "/beep/[b%C3%B2op]",
				matchedFile: "/beep/[bòop].html",
				finalPath: "/beep/%5Bb%C3%B2op%5D",
			},
			// exact matches should win
			{
				title: "/[boop] -> 200 (with /[boop].html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/[boop]",
				matchedFile: "/[boop].html",
				finalPath: "/[boop]",
			},
			{
				title: "/%5Bboop%5D/ -> 307 (with /%5Bboop%5D.html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/%5Bboop%5D.html",
				matchedFile: "/%5Bboop%5D.html",
				finalPath: "/%5Bboop%5D",
			},
			{
				title: "/beep?boop -> 404",
				files: ["/beep?boop.html"],
				requestPath: "/beep?boop", // -> /beep -> 404
			},
			{
				title: "/beep%3Fboop -> 200",
				files: ["/beep?boop.html"],
				requestPath: "/beep%3Fboop",
				matchedFile: "/beep?boop.html",
				finalPath: "/beep%3Fboop",
			},
		],
	},
	{
		html_handling: "force-trailing-slash",
		cases: [
			{
				title: "/[boop] -> /%5Bboop%5D 307 (with /[boop].html)",
				files: ["/[boop].html"],
				requestPath: "/[boop]",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D/",
			},
			{
				title: "/%5Bboop%5D -> 200 (with /[boop].html)",
				files: ["/[boop].html"],
				requestPath: "/%5Bboop%5D",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D/",
			},
			{
				title: "/%5Bboop%5D -> 200 (with /%5Bboop%5D.html)",
				files: ["/%5Bboop%5D.html"],
				requestPath: "/%5Bboop%5D",
				matchedFile: "/%5Bboop%5D.html",
				finalPath: "/%5Bboop%5D/",
			},
			{
				title: "/[boop] -> /%5Bboop%5D/ 307 (with /%5Bboop%5D.html)",
				files: ["/%5Bboop%5D.html"],
				requestPath: "/[boop]",
				matchedFile: "/%5Bboop%5D.html",
				finalPath: "/%5Bboop%5D/",
			},
			// force-trailing-slash html handling still works
			{
				title: "/%5Bboop%5D.html -> 307 (with /%5Bboop%5D.html)",
				files: ["/%5Bboop%5D.html", "/%5Bboop%5D/index.html"],
				requestPath: "/%5Bboop%5D",
				matchedFile: "/%5Bboop%5D/index.html",
				finalPath: "/%5Bboop%5D/",
			},
			{
				title: "/%5Bboop%5D/ -> 307 (with /%5Bboop%5D.html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/%5Bboop%5D.html",
				matchedFile: "/%5Bboop%5D.html",
				finalPath: "/%5Bboop%5D/",
			},
			// mix of encoded and unencoded paths
			{
				title: "/beep/[b%C3%B2op] -> /beep/%5Bb%C3%B2op%5D 307",
				files: ["/beep/[bòop].html"],
				requestPath: "/beep/[b%C3%B2op]",
				matchedFile: "/beep/[bòop].html",
				finalPath: "/beep/%5Bb%C3%B2op%5D/",
			},
			// exact matches should win
			{
				title: "/[boop] -> 200 (with /[boop].html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/[boop]/",
				matchedFile: "/[boop].html",
				finalPath: "/[boop]/",
			},
			{
				title: "/%5Bboop%5D -> 200 (with /%5Bboop%5D.html)",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/%5Bboop%5D/",
				matchedFile: "/%5Bboop%5D.html",
				finalPath: "/%5Bboop%5D/",
			},
			{
				title: "/beep?boop -> 404",
				files: ["/beep?boop.html"],
				requestPath: "/beep?boop/", // -> /beep -> 404
			},
			{
				title: "/beep%3Fboop -> 200",
				files: ["/beep?boop.html"],
				requestPath: "/beep%3Fboop",
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
			{
				title: "/%5Bboop%5D -> 404",
				files: ["/%5Bboop%5D.html"],
				requestPath: "/%5Bboop%5D",
			},
			{
				title: "/[boop] -> 404",
				files: ["/%5Bboop%5D.html"],
				requestPath: "/[boop]",
			},
			// encoding still operates when html_handling is set to 'none'
			{
				title: "/[boop].html -> 200",
				files: ["/[boop].html"],
				requestPath: "/[boop].html",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D.html",
			},
			{
				title: "/%5Bboop%5D.html -> 200",
				files: ["/[boop].html"],
				requestPath: "/%5Bboop%5D.html",
				matchedFile: "/[boop].html",
				finalPath: "/%5Bboop%5D.html",
			},
			{
				title: "/%5Bboop%5D -> 200",
				files: ["/%5Bboop%5D.html"],
				requestPath: "/%5Bboop%5D.html",
				matchedFile: "/%5Bboop%5D.html",
				finalPath: "/%5Bboop%5D.html",
			},
			{
				title: "/[boop].html -> 200",
				files: ["/%5Bboop%5D.html"],
				requestPath: "/[boop].html",
				matchedFile: "/%5Bboop%5D.html",
				finalPath: "/%5Bboop%5D.html",
			},
			// mix of encoded and unencoded paths
			{
				title: "/beep/[b%C3%B2op].html -> 200",
				files: ["/beep/[bòop].html"],
				requestPath: "/beep/[b%C3%B2op].html",
				matchedFile: "/beep/[bòop].html",
				finalPath: "/beep/%5Bb%C3%B2op%5D.html",
			},
			// exact matches should win
			{
				title: "/[boop].html -> 200 ",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/[boop].html",
				matchedFile: "/[boop].html",
				finalPath: "/[boop].html",
			},
			{
				title: "/%5Bboop%5D.html -> 200 ",
				files: ["/%5Bboop%5D.html", "/[boop].html"],
				requestPath: "/%5Bboop%5D.html",
				matchedFile: "/%5Bboop%5D.html",
				finalPath: "/%5Bboop%5D.html",
			},
			{
				title: "/beep?boop.html -> 404",
				files: ["/beep?boop.html"],
				requestPath: "/beep?boop.html", // -> /beep -> 404
			},
			{
				title: "/beep%3Fboop.html -> 200",
				files: ["/beep?boop.html"],
				requestPath: "/beep%3Fboop.html",
				matchedFile: "/beep?boop.html",
				finalPath: "/beep%3Fboop.html",
			},
		],
	},
];
