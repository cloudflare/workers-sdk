/**
 * opencode config file schema.
 *
 * This is not the full definition - add additional fields
 * as needed based on the json schema
 *
 * @see docs: https://opencode.ai/docs/
 * @see json schema: https://opencode.ai/config.json
 */
export interface OpencodeConfig {
	$schema: "https://opencode.ai/config.json";
	theme?: string;
	agent?: Record<
		string,
		{
			model?: string;
			prompt?: string;
			mode?: "primary" | "subagent" | "all";
			description?: string;
		}
	>;
	mcp?: Record<
		string,
		| {
				type: "local";
				command: string[];
				enabled?: boolean;
		  }
		| {
				type: "remote";
				url: string;
				enabled?: boolean;
		  }
	>;
}
