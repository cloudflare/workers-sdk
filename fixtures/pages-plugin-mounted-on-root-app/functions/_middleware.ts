import examplePlugin from "../../pages-plugin-example";

export const onRequest = examplePlugin({ footerText: "Set from a Plugin!" });
