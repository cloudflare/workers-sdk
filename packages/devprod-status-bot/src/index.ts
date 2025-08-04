import type { Endpoints } from "@octokit/types";
import type {
	IssuesOpenedEvent,
	PullRequestOpenedEvent,
	PullRequestReadyForReviewEvent,
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

type PRList = Endpoints["GET /repos/{owner}/{repo}/pulls"]["response"]["data"];
async function getPrs(pat: string) {
	const workersSdk = await fetch(
		"https://api.github.com/repos/cloudflare/workers-sdk/pulls?state=open&per_page=100",
		{
			headers: {
				"User-Agent": "Cloudflare ANT Status bot",
				Authorization: `Bearer ${pat}`,
			},
		}
	).then((r) => r.json<PRList>());
	const wranglerAction = await fetch(
		"https://api.github.com/repos/cloudflare/wrangler-action/pulls?state=open&per_page=100",
		{
			headers: {
				"User-Agent": "Cloudflare ANT Status bot",
				Authorization: `Bearer ${pat}`,
			},
		}
	).then((r) => r.json<PRList>());

	return [...workersSdk, ...wranglerAction];
}

async function getVersionPackagesPR(pat: string) {
	const versionPackages = await fetch(
		"https://api.github.com/repos/cloudflare/workers-sdk/pulls?state=open&per_page=100&head=cloudflare:changeset-release/main",
		{
			headers: {
				"User-Agent": "Cloudflare ANT Status bot",
				Authorization: `Bearer ${pat}`,
			},
		}
	).then((r) => r.json<PRList>());

	return versionPackages[0];
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

const ONE_DAY = 1000 * 60 * 60 * 24;

async function sendStartThreadMessage(pat: string, webhookUrl: string, ai: Ai) {
	const message = await getBotMessage(
		ai,
		"Write a very short unique positive uplifting message to encourage team members in their work today. Make it fun and quirky!"
	);

	const prs = (await getPrs(pat))
		.filter((pr) => !pr.draft)
		.filter((pr) => getThreadID(pr.created_at) !== getThreadID())
		.filter((pr) => pr.title !== "Version Packages")
		.filter(
			(pr) =>
				pr.user &&
				[
					"penalosa",
					"lrapoport-cf",
					"petebacondarwin",
					"CarmenPopoviciu",
					"edmundhung",
					"emily-shen",
					"dario-piotrowicz",
					"jculvey",
					"vicb",
					"jamesopstad",
				].includes(pr.user.login)
		)
		.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
	await sendMessage(webhookUrl, {
		cardsV2: [
			{
				cardId: "unique-card-id",
				card: {
					header: {
						title: "Beep boop! 👋 PR review thread! 👀 🧵👇",
					},
					sections: [
						{
							collapsible: false,
							widgets: [
								{
									textParagraph: {
										text: message,
									},
								},
							],
						},
						{
							collapsible: true,
							uncollapsibleWidgetsCount: 3,
							widgets: prs.flatMap((pr) => {
								const created = new Date(pr.created_at);
								const createdDaysAgo = Math.round(
									(Date.now() - created.getTime()) / ONE_DAY
								);
								let emoji;
								let exclaimations = "";
								if (createdDaysAgo >= 7) {
									emoji = "🔴";
									exclaimations = "!!!";
								} else if (createdDaysAgo >= 5) {
									emoji = "🟠";
									exclaimations = "!";
								} else if (createdDaysAgo >= 3) {
									emoji = "🟡";
								} else {
									emoji = "🟢";
								}
								let createdDaysAgoText = "";
								if (createdDaysAgo >= 3) {
									createdDaysAgoText = ` <i>(created ${createdDaysAgo} days ago${exclaimations})</i>`;
								}

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
																text: `${emoji} <b>#${pr.number}:</b> ${pr.title}${createdDaysAgoText}`,
															},
														},
													],
												},
												{
													horizontalSizeStyle: "FILL_MINIMUM_SPACE",
													horizontalAlignment: "START",
													verticalAlignment: "TOP",
													widgets: [
														{
															buttonList: {
																buttons: [
																	{
																		text: "Open Pull Request",
																		onClick: {
																			openLink: {
																				url: pr.html_url,
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
								];
							}),
						},
					],
				},
			},
		],
	});
}

function isPullRequestOpenedEvent(
	message: WebhookEvent
): message is PullRequestOpenedEvent {
	return (
		"pull_request" in message &&
		message.action === "opened" &&
		!message.pull_request.draft
	);
}

function isPullRequestReadyForReviewEvent(
	message: WebhookEvent
): message is PullRequestReadyForReviewEvent {
	return "action" in message && message.action === "ready_for_review";
}

function isIssueOpenedEvent(
	message: WebhookEvent
): message is IssuesOpenedEvent {
	return "issue" in message && message.action === "opened";
}

function sendReviewMessage(webhookUrl: string, message: WebhookEvent) {
	if (
		(isPullRequestOpenedEvent(message) ||
			isPullRequestReadyForReviewEvent(message)) &&
		message.pull_request.requested_teams.find((t) => t.name === "wrangler")
	) {
		return sendMessage(webhookUrl, {
			cardsV2: [
				{
					cardId: "unique-card-id",
					card: {
						header: {
							title: message.pull_request.title,
							subtitle: message.pull_request.user.login,
							imageUrl: message.pull_request.user.avatar_url,
							imageType: "CIRCLE",
							imageAltText: "Avatar",
						},
						sections: [
							{
								collapsible: true,
								uncollapsibleWidgetsCount: 1,
								widgets: [
									{
										buttonList: {
											buttons: [
												{
													text: "Open Pull Request",
													onClick: {
														openLink: {
															url: message.pull_request.html_url,
														},
													},
												},
											],
										},
									},
									{
										textParagraph: {
											text: message.pull_request.body,
										},
									},
								],
							},
						],
					},
				},
			],
		});
	}
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

async function sendUpcomingReleaseMessage(pat: string, webhookUrl: string) {
	const releasePr = await getVersionPackagesPR(pat);

	await sendMessage(
		webhookUrl,
		{
			cardsV2: [
				{
					cardId: "unique-card-id",
					card: {
						header: {
							title: "🎉 workers-sdk release!",
						},
						sections: [
							{
								widgets: [
									{
										textParagraph: {
											text:
												"A new workers-sdk release is scheduled for tomorrow." +
												" The `main` branch will be locked shortly to allow the release to be checked beforehand." +
												" Review the release PR linked below for the full details, and let the ANT team know" +
												" (by responding in this thread) if for any reason you'd like us to delay this release." +
												"\n\nThe `main` branch will be unlocked tomorrow after the release is completed.",
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
																		text: "Open Pull Request",
																		onClick: {
																			openLink: {
																				url: releasePr.html_url,
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
								uncollapsibleWidgetsCount: 0,
								widgets: [
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
																text: releasePr.body,
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
		"release-notification"
	);
	await sendMessage(
		webhookUrl,
		{
			text: "cc <users/103802752659756021218>",
		},
		"release-notification"
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
			await sendReviewMessage(env.PROD_WEBHOOK, body);

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
		if (controller.cron === "0 10 * * MON-FRI") {
			await sendStartThreadMessage(env.GITHUB_PAT, env.PROD_WEBHOOK, env.AI);
		}
		if (controller.cron === "0 17 * * MON,WED") {
			await sendUpcomingReleaseMessage(
				env.GITHUB_PAT,
				env.PROD_WRANGLER_CONTRIBUTORS_WEBHOOK
			);
		}
		if (controller.cron === "0 12 * * MON,WED,FRI") {
			await sendUpcomingMeetingMessage(env.PROD_TEAM_ONLY_WEBHOOK, env.AI);
		}
	},
} satisfies ExportedHandler<Env>;
