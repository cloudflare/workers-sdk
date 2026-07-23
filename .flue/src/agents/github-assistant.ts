import { defineAgent } from "@flue/runtime";
import { channel, commentOnIssue } from "../channels/github";

export default defineAgent(({ id }) => ({
	instructions: `Respond to verified GitHub issue and pull request comments. Use the bound GitHub comment tool only when a useful response is warranted. Never target a different repository, issue, or pull request.`,
	model: "cloudflare/@cf/moonshotai/kimi-k2.6",
	tools: [commentOnIssue(channel.parseConversationKey(id))],
}));
