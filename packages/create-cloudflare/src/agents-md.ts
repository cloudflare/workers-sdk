/**
 * Generates AGENTS.md content for Cloudflare Workers projects.
 *
 * This file is injected into new Workers projects created via create-cloudflare
 * to provide AI coding agents with retrieval-led guidance for Cloudflare APIs.
 *
 * @returns The AGENTS.md content as a string
 */
const cloudflareDocsIndex = [
	"https:",
	"",
	"developers.cloudflare.com",
	"llms.txt",
].join("/");

export const getAgentsMd = (): string => `# Cloudflare Workers

Always retrieve current Cloudflare documentation before writing or changing Cloudflare code. Do not rely on training data for APIs, configuration, limits, or best practices.

Start at ${cloudflareDocsIndex}. Choose the relevant product's \`llms.txt\`, then retrieve only the specific Markdown pages needed for the task.
`;
