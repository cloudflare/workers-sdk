"use agent";

import { useInitialData, useModel, useTool } from "@flue/runtime";
import * as v from "valibot";
import { commentOnIssue } from "../channels/github";

const InitialData = v.object({
	issueNumber: v.number(),
	openedBy: v.string(),
	owner: v.string(),
	repo: v.string(),
	title: v.string(),
});

export function GithubAssistant(): string {
	useModel("cloudflare/@cf/moonshotai/kimi-k2.6");

	const data = useInitialData<v.InferOutput<typeof InitialData>>();
	if (!data) {
		throw new Error("The GitHub channel must create this agent.");
	}

	useTool(commentOnIssue(data));

	return `Respond to verified comments on ${data.owner}/${data.repo}#${data.issueNumber}, titled "${data.title}" and opened by ${data.openedBy}.
Use the bound GitHub comment tool only when a useful response is warranted.
Never target a different repository, issue, or pull request.`;
}

GithubAssistant.agentName = "github-assistant";
GithubAssistant.initialData = InitialData;
