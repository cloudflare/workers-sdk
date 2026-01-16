import dedent from "ts-dedent";
import type {
	IssueCommentEvent,
	IssuesEvent,
	Schema,
	WebhookEvent,
} from "@octokit/webhooks-types";

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

async function isWranglerTeamMember(
	pat: string,
	username: string
): Promise<boolean> {
	try {
		const response = await fetch(
			`https://api.github.com/orgs/cloudflare/teams/wrangler/memberships/${username}`,
			{
				headers: {
					"User-Agent": "Cloudflare ANT Status bot",
					Authorization: `Bearer ${pat}`,
					Accept: "application/vnd.github+json",
				},
			}
		);

		return response.status === 200;
	} catch (error) {
		// If there's an error checking membership, default to false
		console.error("Error checking team membership:", error);
		return false;
	}
}

async function checkForSecurityIssue(
	ai: Ai,
	pat: string,
	message: Schema
): Promise<null | {
	type: "issue" | "pr";
	issueEvent: IssuesEvent | IssueCommentEvent;
	reasoning: string;
}> {
	const result = isIssueOrPREvent(message);
	if (!result) {
		return null;
	}

	if (await isWranglerTeamMember(pat, result.event.issue.user.login)) {
		return null;
	}

	// Ignore dependabot updates
	if (result.event.issue.user.login === "dependabot[bot]") {
		return null;
	}

	// Ignore our own bot's PRs (e.g. Version Packages)
	if (result.event.issue.user.login === "workers-devprod") {
		return null;
	}

	const systemRole = dedent`
		## System Role:
		You are an expert Security Triage Analyst and a software developer with deep knowledge of Common Weakness Enumeration (CWE) and security best practices. Your task is to analyze a GitHub Issue and determine the likelihood that it is reporting a genuine security vulnerability or exploit (not just a functional bug).
	`;
	const prompt = dedent`
		## Task
		Analyze the provided GitHub Issue details (Title, Body, Comments, Labels) and classify it into one of two categories: "SECURITY VULNERABILITY" or "GENERAL BUG/FEATURE".

		## Analysis Guidelines
		Focus your analysis on identifying language, context, and details indicative of a security report. Key indicators include, but are not limited to:
		- Impact: Does the issue describe a potential compromise of Confidentiality, Integrity, or Availability (CIA)? (e.g., unauthorized access, data loss, denial of service).
		- Vulnerability Types: Mentions of common exploit classes (e.g., XSS, SQL Injection, Buffer Overflow, RCE, CSRF, insecure deserialization, broken access control, hardcoded secrets).
		- Proof of Concept (PoC): Contains exploit steps, malicious input, stack traces, specific functions used to bypass security controls, or references to attack vectors.
		- Terminology: Use of words like "exploit," "attack," "unauthorized," "bypass," "inject," "tainted," "secret," "leak," "data breach," or "DoS/DDoS."
		- User/Privilege Context: Descriptions of an action an unprivileged user can take to affect privileged resources or other users.

		## GitHub Issue Details:
		Issue Title: ${result.event.issue.title}
		Issue Body: ${result.event.issue.body || ""}
		Changed Comment: ${"comment" in result.event ? result.event.comment.body : "N/A"}

		Look for keywords and patterns that suggest this is a security report, such as:
		- Vulnerability, exploit, security flaw, CVE
		- Authentication bypass, privilege escalation
		- XSS, SQL injection, CSRF, RCE
		- Unauthorized access, data exposure
		- Security disclosure, responsible disclosure

		## Output Format
		Provide your response in the following structured Markdown format:

		\`\`\`
		## Triage Summary
		Classification: [SECURITY VULNERABILITY or GENERAL BUG/FEATURE]
		Confidence Level: [Low, Medium, or High]

		## Rationale
		[Explain in 2-3 concise sentences *why* you chose the classification. Highlight the specific keywords, behavior, or described impact that led to your decision.]

		## Key Security Indicators Found
		* [List specific keywords, code snippets, or user actions from the issue that suggest a vulnerability.]
		* [Example: Describes using a special character in a username to execute a script (XSS).]
		* [Example: Mentions an unauthenticated API endpoint that returns sensitive user data.]
		\`\`\`
	`;

	const { response } = await ai.run(
		"@cf/mistralai/mistral-small-3.1-24b-instruct",
		{
			messages: [
				{ role: "system", content: systemRole },
				{ role: "user", content: prompt },
			],
		}
	);

	if (!response?.includes("SECURITY VULNERABILITY")) {
		return null;
	} else {
		return {
			type: result.type,
			issueEvent: result.event,
			reasoning: response,
		};
	}
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

function isIssueOrPREvent(
	message: WebhookEvent
): { type: "issue" | "pr"; event: IssuesEvent | IssueCommentEvent } | null {
	if (
		"issue" in message &&
		(message.action === "opened" ||
			message.action === "reopened" ||
			message.action === "edited")
	) {
		const isPR = "pull_request" in message.issue;
		return {
			type: isPR ? "pr" : "issue",
			event: message as IssuesEvent | IssueCommentEvent,
		};
	}
	return null;
}

// Repository advisory event type (not yet in @octokit/webhooks-types)
interface RepositoryAdvisoryEvent {
	action: "reported" | "published";
	repository_advisory: {
		ghsa_id: string;
		html_url: string;
		summary: string;
		description: string;
	};
}

function isRepositoryAdvisoryEvent(
	message: WebhookEvent
): RepositoryAdvisoryEvent | null {
	if (
		"repository_advisory" in message &&
		"action" in message &&
		message.action === "reported"
	) {
		return message as RepositoryAdvisoryEvent;
	}
	return null;
}

async function sendSecurityAlert(
	webhookUrl: string,
	{
		type,
		issueEvent,
		reasoning,
	}: {
		type: "issue" | "pr";
		issueEvent: IssuesEvent | IssueCommentEvent;
		reasoning: string;
	}
) {
	const itemType = type === "pr" ? "PR" : "Issue";

	return sendMessage(
		webhookUrl,
		{
			cardsV2: [
				{
					cardId: "unique-card-id",
					card: {
						header: {
							title: `🚨 Potential Security ${itemType} Detected`,
							subtitle: `${itemType} #${issueEvent.issue.number} in ${issueEvent.repository.full_name}`,
							imageUrl: issueEvent.issue.user.avatar_url,
							imageType: "CIRCLE",
							imageAltText: "Reporter Avatar",
						},
						sections: [
							{
								collapsible: false,
								widgets: [
									{
										textParagraph: {
											text: `<b>Title:</b> ${issueEvent.issue.title}\n\n<b>Reporter:</b> ${issueEvent.issue.user.login}`,
										},
									},
									{
										buttonList: {
											buttons: [
												{
													text: `View ${itemType}`,
													onClick: {
														openLink: {
															url: issueEvent.issue.html_url,
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
											text: reasoning,
										},
									},
								],
							},
						],
					},
				},
			],
		},
		"-security-alert-" + issueEvent.issue.number
	);
}

async function sendRepositoryAdvisoryAlert(
	webhookUrl: string,
	advisoryEvent: RepositoryAdvisoryEvent
) {
	const advisory = advisoryEvent.repository_advisory;

	return sendMessage(
		webhookUrl,
		{
			cardsV2: [
				{
					cardId: "unique-card-id",
					card: {
						header: {
							title: `🔐 Repository Security Advisory Reported`,
							subtitle: advisory.summary,
						},
						sections: [
							{
								collapsible: true,
								widgets: [
									{
										textParagraph: {
											text: advisory.description,
										},
									},
								],
							},
							{
								collapsible: false,
								widgets: [
									{
										buttonList: {
											buttons: [
												{
													text: "View Advisory",
													onClick: {
														openLink: {
															url: advisory.html_url,
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
		"-repository-advisory-" + advisory.ghsa_id
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

			const maybeSecurityIssue = await checkForSecurityIssue(
				env.AI,
				env.GITHUB_PAT,
				body
			);
			// Flags suspicious issues/PRs for review
			if (maybeSecurityIssue) {
				await sendSecurityAlert(env.ALERTS_WEBHOOK, maybeSecurityIssue);
			}
			// Notifies when a repository advisory is reported to workers-sdk
			const maybeRepositoryAdvisory = isRepositoryAdvisoryEvent(body);
			if (maybeRepositoryAdvisory) {
				await sendRepositoryAdvisoryAlert(
					env.ALERTS_WEBHOOK,
					maybeRepositoryAdvisory
				);
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
