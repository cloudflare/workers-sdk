import examplePlugin from "@fixture/pages-plugin";

export const onRequest = examplePlugin({
	footerText: "Set from a Plugin!",
});
