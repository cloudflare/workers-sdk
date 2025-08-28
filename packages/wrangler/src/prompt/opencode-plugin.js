// TODO: move this to it's own package so that we can import types from @opencode-ai/plugin
// (we can't do this in wrangler because of our module resolution settings.)

export const CloudflarePlugin = async () => {
	return {
		config: async (input) => {
			if (!input.agent) {
				input.agent = {};
			}

			input.agent.cloudflare = {
				prompt: await generateSystemPrompt(),
				mode: "primary",
				description: "Cloudflare Workers development specialist",
			};

			if (!input.mcp) {
				input.mcp = {};
			}

			const docsMCPExists = Object.entries(input.mcp).some(
				([_, server]) =>
					server.enabled !== false &&
					server.type === "remote" &&
					server.url.includes("docs.mcp.cloudflare.com")
			);

			if (!docsMCPExists) {
				input.mcp["cloudflare-docs"] = {
					type: "remote",
					url: "https://docs.mcp.cloudflare.com/mcp",
				};
			}
		},
	};
};

async function generateSystemPrompt() {
	// eslint-disable-next-line turbo/no-undeclared-env-vars
	const userConfigPath = process.env.WRANGLER_CONFIG;

	let configFileInfo = "";
	if (userConfigPath) {
		const configFileName = userConfigPath;
		configFileInfo = `Wrangler config file: ${configFileName}`;
	}

	const res = await fetch(
		"https://developers.cloudflare.com/workers/prompt.txt"
	);
	if (!res.ok) {
		throw new Error("Failed to fetch Cloudflare Workers prompt");
	}

	const prompt = await res.text();

	// strip out <user_prompt>
	let systemPrompt = prompt
		.replace(/<user_prompt>.*<\/user_prompt>/s, "")
		.trim();
	if (configFileInfo) {
		systemPrompt = `${systemPrompt}\n\n<project_info>\n- ${configFileInfo}\n</project_info>`;
	}

	return systemPrompt;
}
