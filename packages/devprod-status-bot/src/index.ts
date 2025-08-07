import type { IssuesOpenedEvent, WebhookEvent } from "@octokit/webhooks-types";

async function getBotMessage(ai: Ai, prompt: string) {
	const chat = {
		messages: [
			{
				role: "system",
				content:
					"You are the ANT status bot, a helpful assistant who assists the ANT team by posting helpful updates in Google Chat",
			},
			{
				role: "user",
				content: prompt,
			},
		] as RoleScopedChatInput[],
	};
	const message = await ai.run("@cf/meta/llama-2-7b-chat-int8", chat);
	if (!("response" in message)) {
		return "I'm feeling a bit poorly 🥲—try asking me for a message later!";
	}
	return message.response;
}

async function analyzeIssueSecurity(
	ai: Ai,
	issueTitle: string,
	issueBody: string
): Promise<boolean> {
	const prompt = `Analyze this GitHub issue to determine if it's likely reporting a security vulnerability or security concern.

Issue Title: ${issueTitle}

Issue Body: ${issueBody}

Look for keywords and patterns that suggest this is a security report, such as:
- Vulnerability, exploit, security flaw, CVE
- Authentication bypass, privilege escalation
- XSS, SQL injection, CSRF, RCE
- Unauthorized access, data exposure
- Security disclosure, responsible disclosure

Respond with only "YES" if this appears to be a security-related issue, or "NO" if it appears to be a regular bug report or feature request.`;

	const chat = {
		messages: [
			{
				role: "system",
				content:
					"You are a security analyst assistant that helps identify potential security vulnerability reports in GitHub issues. Respond only with YES or NO.",
			},
			{
				role: "user",
				content: prompt,
			},
		] as RoleScopedChatInput[],
	};

	const message = await ai.run("@cf/meta/llama-2-7b-chat-int8", chat);
	if (!("response" in message) || !message.response) {
		return false;
	}

	return message.response.trim().toUpperCase() === "YES";
}

type ProjectGQLResponse = {
	data: {
		organization: {
			projectV2: {
				id: string;
			};
		};
	};
};
async function getProjectId(pat: string) {
	const data = await fetch("https://api.github.com/graphql", {
		headers: {
			"User-Agent": "Cloudflare ANT Status bot",
			Authorization: `Bearer ${pat}`,
		},
		method: "POST",
		body: JSON.stringify({
			query: `query{organization(login: "cloudflare") {projectV2(number: 1){id}}}`,
		}),
	}).then((r) => r.json<ProjectGQLResponse>());

	return data.data.organization.projectV2.id;
}
type PRGQLResponse = {
	data: {
		repository: {
			pullRequest: {
				id: string;
			};
		};
	};
};
async function getPRId(pat: string, repo: string, number: string) {
	const data = await fetch("https://api.github.com/graphql", {
		headers: {
			"User-Agent": "Cloudflare ANT Status bot",
			Authorization: `Bearer ${pat}`,
		},
		method: "POST",
		body: JSON.stringify({
			query: `query {
					  repository(owner: "cloudflare", name: "${repo}") {
						  pullRequest(number: ${number}) {
							  id
						  }
					  }
				  }`,
		}),
	}).then((r) => r.json<PRGQLResponse>());

	return data.data.repository.pullRequest.id;
}

async function addPRToProject(pat: string, repo: string, number: string) {
	const projectId = await getProjectId(pat);
	const prId = await getPRId(pat, repo, number);
	return await fetch("https://api.github.com/graphql", {
		headers: {
			"User-Agent": "Cloudflare ANT Status bot",
			Authorization: `Bearer ${pat}`,
		},
		method: "POST",
		body: JSON.stringify({
			query: `mutation {
					  addProjectV2ItemById(input: {
						  projectId: "${projectId}"
						  contentId: "${prId}"
					  }) {
						  item {
							  id
						  }
					  }
				  }`,
		}),
	});
}
function getThreadID(date?: string | Date, label = "-pull-requests") {
	// Apply an offset so we rollover days at around 10am UTC
	return (
		(date ? new Date(date) : new Date())
			.toLocaleString("en-GB", { timeZone: "Pacific/Kiritimati" })
			.split(",")[0] + label
	);
}

async function sendMessage(
	webhookUrl: string,
	message: Record<string, unknown>,
	label?: string
) {
	const threadId = getThreadID(new Date(), label);

	const url = new URL(webhookUrl);

	url.searchParams.set("threadKey", threadId);
	url.searchParams.set(
		"messageReplyOption",
		"REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD"
	);

	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json; charset=utf-8" },
		body: JSON.stringify(message),
	});

	console.log(await response.json());
}

function isIssueOpenedEvent(
	message: WebhookEvent
): message is IssuesOpenedEvent {
	return "issue" in message && message.action === "opened";
}

async function sendSecurityAlert(webhookUrl: string, issue: IssuesOpenedEvent) {
	return sendMessage(
		webhookUrl,
		{
			cardsV2: [
				{
					cardId: "unique-card-id",
					card: {
						header: {
							title: "🚨 Potential Security Issue Detected",
							subtitle: `Issue #${issue.issue.number} in ${issue.repository.full_name}`,
							imageUrl: issue.sender.avatar_url,
							imageType: "CIRCLE",
							imageAltText: "Reporter Avatar",
						},
						sections: [
							{
								collapsible: false,
								widgets: [
									{
										textParagraph: {
											text: `<b>Title:</b> ${issue.issue.title}\n\n<b>Reporter:</b> ${issue.sender.login}`,
										},
									},
									{
										buttonList: {
											buttons: [
												{
													text: "View Issue",
													onClick: {
														openLink: {
															url: issue.issue.html_url,
														},
													},
												},
											],
										},
									},
								],
							},
							{
								collapsible: true,
								uncollapsibleWidgetsCount: 0,
								widgets: [
									{
										textParagraph: {
											text: issue.issue.body || "No description provided",
										},
									},
								],
							},
						],
					},
				},
			],
		},
		"security-alerts"
	);
}

async function sendUpcomingMeetingMessage(webhookUrl: string, ai: Ai) {
	const message = await getBotMessage(
		ai,
		"Write a very short informative message reminding team members to check the meeting notes and add anything they want to discuss to the agenda. Make it fun and quirky!"
	);

	await sendMessage(
		webhookUrl,
		{
			cardsV2: [
				{
					cardId: "unique-card-id",
					card: {
						header: {
							title: "📋 Upcoming meeting!",
						},
						sections: [
							{
								widgets: [
									{
										textParagraph: {
											text: message,
										},
									},
									{
										columns: {
											columnItems: [
												{
													horizontalSizeStyle: "FILL_MINIMUM_SPACE",
													horizontalAlignment: "START",
													verticalAlignment: "TOP",
													widgets: [
														{
															buttonList: {
																buttons: [
																	{
																		text: "Open Meeting Notes",
																		onClick: {
																			openLink: {
																				url: "https://cflare.co/ant-meeting-notes",
																			},
																		},
																	},
																],
															},
														},
													],
												},
											],
										},
									},
								],
							},
						],
					},
				},
			],
		},
		"meeting-notes"
	);
	await sendMessage(
		webhookUrl,
		{
			text: "cc <users/all>",
		},
		"meeting-notes"
	);
}

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname === "/release-failure") {
			if (request.headers.get("X-Auth-Header") !== env.PRESHARED_SECRET) {
				return new Response("Not allowed", { status: 401 });
			}
			const body = await request.json<{
				status: { label: string; details: string }[];
				url: string;
			}>();
			await sendMessage(
				env.PROD_TEAM_ONLY_WEBHOOK,
				{
					cardsV2: [
						{
							cardId: "unique-card-id",
							card: {
								header: {
									title: "🚨 A workers-sdk release failed!",
								},
								sections: [
									{
										widgets: [
											{
												columns: {
													columnItems: [
														{
															horizontalSizeStyle: "FILL_MINIMUM_SPACE",
															horizontalAlignment: "START",
															verticalAlignment: "TOP",
															widgets: [
																{
																	buttonList: {
																		buttons: [
																			{
																				text: "Open Workflow run",
																				onClick: {
																					openLink: {
																						url: body.url,
																					},
																				},
																			},
																		],
																	},
																},
															],
														},
													],
												},
											},
										],
									},
									{
										collapsible: true,
										uncollapsibleWidgetsCount: 3,
										widgets: body.status.map(({ label, details }) => {
											const emoji = "🔴";

											return [
												{
													columns: {
														columnItems: [
															{
																horizontalSizeStyle: "FILL_AVAILABLE_SPACE",
																horizontalAlignment: "START",
																verticalAlignment: "CENTER",
																widgets: [
																	{
																		textParagraph: {
																			text: `${emoji} <b>${label}:</b> ${details}`,
																		},
																	},
																],
															},
														],
													},
												},
											];
										}),
									},
								],
							},
						},
					],
				},
				crypto.randomUUID()
			);
		}
		if (url.pathname === "/github") {
			const body = await request.json<WebhookEvent>();

			if (isIssueOpenedEvent(body)) {
				const isSecurityIssue = await analyzeIssueSecurity(
					env.AI,
					body.issue.title,
					body.issue.body || ""
				);
				if (isSecurityIssue) {
					await sendSecurityAlert(env.ALERTS_WEBHOOK, body);
				}
			}
		}

		if (url.pathname.startsWith("/pr-project") && request.method === "POST") {
			const [_, _prefix, _repo, prNumber] = url.pathname.split("/");
			return await addPRToProject(
				env.GITHUB_PAT,
				"workers-sdk",
				prNumber.replaceAll(/[^0-9]/g, "-")
			);
		}

		if (url.pathname === "/logo.png") {
			return new Response(await (await import("./status-bot.png")).default, {
				headers: {
					"Content-Type": "image/png",
				},
			});
		}

		return new Response("");
	},

	async scheduled(controller, env): Promise<void> {
		if (controller.cron === "0 12 * * MON,WED,FRI") {
			await sendUpcomingMeetingMessage(env.PROD_TEAM_ONLY_WEBHOOK, env.AI);
		}
	},
} satisfies ExportedHandler<Env>;
