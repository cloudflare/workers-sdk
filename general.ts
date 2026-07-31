import type { RequestContext } from "../lib/types";
import { sendMessage } from "../lib/telegram";
import {
  listAnnouncements,
  listEvents,
  joinEvent,
  cancelEvent,
  castVote,
  createTicket,
  getSurvey,
  listDocuments,
  getDocument,
  listFaqs,
  getFaq,
  getConfig,
} from "../lib/kv";
import { parseArgs, parseCallback } from "../middleware/validation";

const START_TIME = Date.now();

export async function handleStart(ctx: RequestContext): Promise<void> {
  await sendMessage(
    ctx.env,
    ctx.chatId,
    `Welcome to *TeamMarySy Bot*!\n\nUse /help to see what you can do.`
  );
}

export async function handleHelp(ctx: RequestContext): Promise<void> {
  const lines = [
    "*Available commands:*",
    "/announcements — view latest announcements",
    "/info — view general information about this bot/organization",
    "/faq — browse frequently asked questions",
    "/events — view upcoming events",
    "/survey <id> — view a survey and vote",
    "/docs [category] — browse shared documents",
    "/submit <subject> — submit a request or issue (same as /ticket)",
    "/ticket <subject> — open a support ticket",
    "/status — check bot health and connectivity",
  ];
  if (ctx.role !== "general") {
    lines.push(
      "",
      "*Admin commands:* /announce, /createevent, /createsurvey, /schedule, /createschedule, /tickets, /resolve, /adddoc"
    );
  }
  if (ctx.role === "owner") {
    lines.push("*Owner commands:* /setrole, /roles, /permissions, /config, /logs, /report, /broadcast");
  }
  await sendMessage(ctx.env, ctx.chatId, lines.join("\n"));
}

export async function handleAnnouncements(ctx: RequestContext): Promise<void> {
  const announcements = await listAnnouncements(ctx.env, 5);
  if (announcements.length === 0) {
    await sendMessage(ctx.env, ctx.chatId, "No announcements yet.");
    return;
  }
  const text = announcements
    .map((a) => `📢 *${a.title}*\n${a.body}`)
    .join("\n\n");
  await sendMessage(ctx.env, ctx.chatId, text);
}

export async function handleEvents(ctx: RequestContext): Promise<void> {
  const args = ctx.text ? parseArgs(ctx.text) : [];

  // Admins/Owner can cancel an event via the same /event command:
  //   /event cancel <event_id>
  if (ctx.role !== "general" && args[0]?.toLowerCase() === "cancel") {
    const id = args[1];
    if (!id) {
      await sendMessage(ctx.env, ctx.chatId, "Usage: /event cancel <event_id>");
      return;
    }
    const cancelled = await cancelEvent(ctx.env, id);
    await sendMessage(
      ctx.env,
      ctx.chatId,
      cancelled ? `Event *${cancelled.title}* cancelled.` : `No event found with id \`${id}\`.`
    );
    return;
  }

  const events = await listEvents(ctx.env, 10);
  if (events.length === 0) {
    await sendMessage(ctx.env, ctx.chatId, "No upcoming events.");
    return;
  }

  for (const e of events) {
    const capacityLine =
      e.capacity !== undefined ? `\nCapacity: ${e.attendeeIds.length}/${e.capacity}` : "";
    await sendMessage(
      ctx.env,
      ctx.chatId,
      `🗓 *${e.title}*\n${e.description}\nStarts: ${e.startsAt}${capacityLine}`,
      { replyMarkup: [[{ text: "Join event", callback_data: `gen:join:${e.id}` }]] }
    );
  }
}

export async function handleJoinCallback(ctx: RequestContext): Promise<void> {
  if (!ctx.callbackData) return;
  const [, , eventId] = parseCallback(ctx.callbackData);
  const { event, full } = await joinEvent(ctx.env, eventId, ctx.userId);

  if (!event) {
    await sendMessage(ctx.env, ctx.chatId, "That event no longer exists.");
    return;
  }
  if (full) {
    await sendMessage(ctx.env, ctx.chatId, `Sorry, *${event.title}* is at full capacity.`);
    return;
  }
  await sendMessage(ctx.env, ctx.chatId, `You're in for *${event.title}*! 🎉`);
}

export async function handleVoteCallback(ctx: RequestContext): Promise<void> {
  if (!ctx.callbackData) return;
  const [, , surveyId, optionIndexStr] = parseCallback(ctx.callbackData);
  const survey = await castVote(ctx.env, surveyId, Number(optionIndexStr), ctx.userId);
  await sendMessage(ctx.env, ctx.chatId, survey ? "Vote recorded, thanks!" : "This survey is closed or not found.");
}

async function submitTicket(ctx: RequestContext, commandName: string): Promise<void> {
  const args = ctx.text ? parseArgs(ctx.text) : [];
  const subject = args.join(" ").trim();
  if (!subject) {
    await sendMessage(ctx.env, ctx.chatId, `Usage: /${commandName} <describe your issue>`);
    return;
  }
  const ticket = await createTicket(ctx.env, ctx.userId, subject);
  await sendMessage(ctx.env, ctx.chatId, `Ticket opened: \`${ticket.id}\`. An admin will follow up.`);
}

/** /ticket <subject> */
export async function handleTicket(ctx: RequestContext): Promise<void> {
  await submitTicket(ctx, "ticket");
}

/** /submit <subject> — alias of /ticket, for teams that prefer this wording */
export async function handleSubmit(ctx: RequestContext): Promise<void> {
  await submitTicket(ctx, "submit");
}

/** /survey <id> — view a specific survey and vote on it */
export async function handleSurvey(ctx: RequestContext): Promise<void> {
  const [id] = ctx.text ? parseArgs(ctx.text) : [];
  if (!id) {
    await sendMessage(ctx.env, ctx.chatId, "Usage: /survey <survey_id>");
    return;
  }

  const survey = await getSurvey(ctx.env, id);
  if (!survey) {
    await sendMessage(ctx.env, ctx.chatId, `No survey found with id \`${id}\`.`);
    return;
  }

  if (!survey.isOpen) {
    const results = survey.options
      .map((opt, i) => `${opt}: ${survey.votes[String(i)]?.length ?? 0} vote(s)`)
      .join("\n");
    await sendMessage(ctx.env, ctx.chatId, `📊 *${survey.question}* (closed)\n\n${results}`);
    return;
  }

  const buttons = survey.options.map((opt, i) => [{ text: opt, callback_data: `gen:vote:${survey.id}:${i}` }]);
  await sendMessage(ctx.env, ctx.chatId, `📊 *${survey.question}*`, { replyMarkup: buttons });
}

/** /docs [category] — list shared documents, optionally filtered by category */
export async function handleDocs(ctx: RequestContext): Promise<void> {
  const [category] = ctx.text ? parseArgs(ctx.text) : [];
  const docs = await listDocuments(ctx.env, category, 20);

  if (docs.length === 0) {
    await sendMessage(
      ctx.env,
      ctx.chatId,
      category ? `No documents found in category \`${category}\`.` : "No documents available yet."
    );
    return;
  }

  // Show a navigable list: tapping a title reveals its full content.
  const buttons = docs.map((d) => [
    { text: `📄 ${d.title}${d.category ? ` (${d.category})` : ""}`, callback_data: `gen:doc:${d.id}` },
  ]);
  await sendMessage(ctx.env, ctx.chatId, "*Documents*\nTap a title to view it:", { replyMarkup: buttons });
}

export async function handleDocCallback(ctx: RequestContext): Promise<void> {
  if (!ctx.callbackData) return;
  const [, , docId] = parseCallback(ctx.callbackData);
  const doc = await getDocument(ctx.env, docId);
  if (!doc) {
    await sendMessage(ctx.env, ctx.chatId, "That document is no longer available.");
    return;
  }
  await sendMessage(ctx.env, ctx.chatId, `📄 *${doc.title}*${doc.category ? ` (${doc.category})` : ""}\n\n${doc.content}`);
}

/** /faq — browse frequently asked questions */
export async function handleFaq(ctx: RequestContext): Promise<void> {
  const faqs = await listFaqs(ctx.env, 20);
  if (faqs.length === 0) {
    await sendMessage(ctx.env, ctx.chatId, "No FAQ entries yet.");
    return;
  }
  const buttons = faqs.map((f) => [{ text: f.question, callback_data: `gen:faq:${f.id}` }]);
  await sendMessage(ctx.env, ctx.chatId, "*Frequently Asked Questions*\nTap a question:", { replyMarkup: buttons });
}

export async function handleFaqCallback(ctx: RequestContext): Promise<void> {
  if (!ctx.callbackData) return;
  const [, , faqId] = parseCallback(ctx.callbackData);
  const faq = await getFaq(ctx.env, faqId);
  if (!faq) {
    await sendMessage(ctx.env, ctx.chatId, "That FAQ entry is no longer available.");
    return;
  }
  await sendMessage(ctx.env, ctx.chatId, `❓ *${faq.question}*\n\n${faq.answer}`);
}

/** /info — general information about the bot/organization, sourced from config */
export async function handleInfo(ctx: RequestContext): Promise<void> {
  const info = await getConfig<string>(ctx.env, "org_info");
  await sendMessage(
    ctx.env,
    ctx.chatId,
    info ?? "No general information has been configured yet. Ask the Owner to set it with /config set org_info <text>."
  );
}

/** /status — basic health/connectivity check, safe for any role */
export async function handleStatus(ctx: RequestContext): Promise<void> {
  const uptimeMs = Date.now() - START_TIME;
  const uptimeMin = Math.floor(uptimeMs / 60000);

  let kvOk = true;
  try {
    await ctx.env.TEAMMARYSY_KV.get("__status_probe__");
  } catch {
    kvOk = false;
  }

  const lines = [
    "*TeamMarySy Bot Status*",
    `Environment: ${ctx.env.ENVIRONMENT}`,
    `Worker isolate uptime: ~${uptimeMin} min (isolates recycle periodically — this is not total bot uptime)`,
    `Workers KV: ${kvOk ? "✅ connected" : "❌ unreachable"}`,
    `Your role: ${ctx.role}`,
  ];
  await sendMessage(ctx.env, ctx.chatId, lines.join("\n"));
}
