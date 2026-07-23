// flue-blueprint: tooling/vitest-evals@1
import { createFlueClient, type FlueConversationMessage } from "@flue/sdk";
import {
	createHarness,
	toJsonValue,
	type JsonValue,
	type TranscriptEvent,
} from "vitest-evals";

interface FlueAgentHarnessOptions {
	agentName: string;
	baseUrl?: string;
	headers?: Record<string, string>;
	token?: string;
}

function lastAssistantMessage(
	messages: FlueConversationMessage[]
): FlueConversationMessage | undefined {
	return messages.findLast((entry) => entry.role === "assistant");
}

function messageText(message: FlueConversationMessage | undefined): string {
	if (!message) {
		return "";
	}

	return message.parts
		.filter((part) => part.type === "text")
		.map((part) => part.text)
		.join("");
}

function normalizeToolArguments(
	value: unknown
): Record<string, JsonValue> | undefined {
	const normalized = toJsonValue(value);

	if (normalized === undefined) {
		return undefined;
	}
	if (
		typeof normalized === "object" &&
		normalized !== null &&
		!Array.isArray(normalized)
	) {
		return normalized;
	}

	return {
		value: normalized,
	};
}

function collectTranscriptEvents(
	messages: FlueConversationMessage[]
): TranscriptEvent[] {
	return messages.flatMap((message) =>
		message.parts.flatMap((part): TranscriptEvent[] => {
			if (part.type === "text") {
				return [
					{
						content: part.text,
						role: message.role,
						type: "message" as const,
					},
				];
			}
			if (part.type !== "dynamic-tool") {
				return [];
			}

			const toolCall: TranscriptEvent = {
				arguments: normalizeToolArguments(part.input),
				id: part.toolCallId,
				name: part.toolName,
				type: "tool_call",
			};

			if (part.state === "input-available") {
				return [toolCall];
			}

			const toolResult: TranscriptEvent = {
				...(part.state === "output-error"
					? { error: { message: part.errorText } }
					: { content: toJsonValue(part.output) }),
				name: part.toolName,
				toolCallId: part.toolCallId,
				type: "tool_result",
			};

			return [toolCall, toolResult];
		})
	);
}

export function createFlueAgentHarness(options: FlueAgentHarnessOptions) {
	const client = createFlueClient({
		baseUrl:
			options.baseUrl ?? process.env.FLUE_BASE_URL ?? "http://127.0.0.1:3583",
		headers: options.headers,
		token: options.token,
	});

	return createHarness<string, string>({
		name: `flue-${options.agentName}-agent`,
		run: async ({ input, signal }) => {
			const instanceId = `eval-${crypto.randomUUID()}`;
			const admission = await client.agents.send(
				options.agentName,
				instanceId,
				{
					message: input,
					signal,
				}
			);
			await client.agents.wait(admission, { signal });
			const history = await client.agents.history(
				options.agentName,
				instanceId,
				{ signal }
			);
			const reply = lastAssistantMessage(history.messages);
			const model = reply?.metadata?.model;
			const usage = reply?.metadata?.usage;

			return {
				events: collectTranscriptEvents(history.messages),
				output: messageText(reply),
				...((model ?? usage)
					? {
							usage: {
								...(model
									? {
											model: model.id,
											provider: model.provider,
										}
									: {}),
								...(usage
									? {
											inputTokens: usage.input,
											metadata: { cost: usage.cost.total },
											outputTokens: usage.output,
											totalTokens: usage.totalTokens,
										}
									: {}),
							},
						}
					: {}),
			};
		},
	});
}
