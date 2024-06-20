import type { Endpoints } from "@octokit/types";
import type {
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
					"You are the ANT status bot, a helpful assistent who assists the ANT team by posting helpful updates in Google Chat",
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
					"RamIdeas",
					"lrapoport-cf",
					"petebacondarwin",
					"CarmenPopoviciu",
					"andyjessop",
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
											text: "There's an upcoming workers-sdk release today. The `main` branch will be locked shortly before to allow the release to be checked. Review the release PR linked below for the full details, and let the ANT team know (by responding in this thread) if for any reason you'd like us to delay this release.",
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
			text: "cc <users/103802752659756021218> <users/111710439474343081424>",
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
		console.log(env.AI);
		const url = new URL(request.url);
		if (url.pathname === "/github") {
			const body = await request.json<WebhookEvent>();
			await sendReviewMessage(env.PROD_WEBHOOK, body);
		}

		if (url.pathname.startsWith("/pr-project") && request.method === "POST") {
			const [_, _prefix, repo, prNumber] = url.pathname.split("/");
			return await addPRToProject(
				env.GITHUB_PAT,
				repo.replaceAll(/[^a-z-]/g, "-"),
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
		if (controller.cron === "0 10 * * TUE,THU") {
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
