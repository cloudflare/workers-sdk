import pages from "./pages/c3";
import workers from "./workers/c3";
import type { MultiPlatformTemplateConfig } from "../../src/templates";

const config: MultiPlatformTemplateConfig = {
	displayName: "Vue",
	platformVariants: { pages, workers },
};
export default config;
