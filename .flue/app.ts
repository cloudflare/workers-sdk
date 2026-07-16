import { registerProvider } from "@flue/runtime";
import { flue } from "@flue/runtime/routing";

const {
	CF_AI_GATEWAY_ACCOUNT_ID: accountId,
	CF_AI_GATEWAY_NAME: gatewayId,
	CF_AI_GATEWAY_TOKEN: gatewayToken,
} = process.env;

function assertEnv(name: string, value: string | undefined): asserts value {
	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}
}

assertEnv("CF_AI_GATEWAY_ACCOUNT_ID", accountId);
assertEnv("CF_AI_GATEWAY_NAME", gatewayId);
assertEnv("CF_AI_GATEWAY_TOKEN", gatewayToken);

registerProvider("anthropic", {
	baseUrl: `https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/anthropic`,
	headers: {
		Authorization: `Bearer ${gatewayToken}`,
		"cf-aig-authorization": `Bearer ${gatewayToken}`,
	},
});

export default flue();
