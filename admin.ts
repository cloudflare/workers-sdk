import type { RequestContext } from "../lib/types";
import { sendMessage } from "../lib/telegram";
import {
  createAnnouncement,
  createEvent,
  createSurvey,
  closeSurvey,
  listSchedules,
  createSchedule,
  toggleSchedule,
  listOpenTickets,
  resolveTicket,
  createDocument,
  deleteDocument,
  createFaq,
} from "../lib/kv";
import { parseArgs, parseCallback } from "../middleware/validation";

/** /announce Title | Body text goes here */
export async function handleAnnounce(ctx: RequestContext): Promise<void> {
  const raw = ctx.text ? ctx.text.replace(/^\/announce\s*/, "") : "";
  const [title, ...bodyParts] = raw.split("|");
  const body = bodyParts.join("|").trim();

  if (!title?.trim() || !body) {
    await sendMessage(ctx.env, ctx.chatId, "Usage: /announce Title | Body text");
    return;
  }

  const announcement = await createAnnouncement(ctx.env, ctx.userId, title.trim(), body);
  await sendMessage(ctx.env, ctx.chatId, `Announcement posted: *${announcement.title}*`);
}

/** /createevent Title | Description | ISO-start-date | capacity (optional) */
export async function handleCreateEvent(ctx: RequestContext): Promise<void> {
  const raw = ctx.text ? ctx.text.replace(/^\/createevent\s*/, "") : "";
  const [title, description, startsAt, capacityRaw] = raw.split("|").map((s) => s?.trim());

  if (!title || !description || !startsAt) {
    await sendMessage(
      ctx.env,
      ctx.chatId,
      "Usage: /createevent Title | Description | 2026-08-01T18:00:00Z | capacity (optional)"
    );
    return;
  }

  const capacity = capacityRaw ? Number(capacityRaw) : undefined;
  const event = await createEvent(ctx.env, ctx.userId, title, description, startsAt, undefined, capacity);
  await sendMessage(
    ctx.env,
    ctx.chatId,
    `Event created: *${event.title}* (id: \`${event.id}\`)${capacity ? ` — capacity ${capacity}` : ""}`
  );
}

/** /createsurvey Question | OptionA, OptionB, OptionC */
export async function handleCreateSurvey(ctx: RequestContext): Promise<void> {
  const raw = ctx.text ? ctx.text.replace(/^\/createsurvey\s*/, "") : "";
  const [question, optionsRaw] = raw.split("|").map((s) => s.trim());
  const options = optionsRaw ? optionsRaw.split(",").map((o) => o.trim()).filter(Boolean) : [];

  if (!question || options.length < 2) {
    await sendMessage(ctx.env, ctx.chatId, "Usage: /createsurvey Question | OptionA, OptionB, OptionC");
    return;
  }

  const survey = await createSurvey(ctx.env, ctx.userId, question, options);
  const buttons = options.map((opt, i) => [{ text: opt, callback_data: `gen:vote:${survey.id}:${i}` }]);
  await sendMessage(ctx.env, ctx.chatId, `📊 *${survey.question}*`, { replyMarkup: buttons });
}

/** /closesurvey <id> */
export async function handleCloseSurvey(ctx: RequestContext): Promise<void> {
  const [id] = ctx.text ? parseArgs(ctx.text) : [];
  if (!id) {
    await sendMessage(ctx.env, ctx.chatId, "Usage: /closesurvey <survey_id>");
    return;
  }
  await closeSurvey(ctx.env, id);
  await sendMessage(ctx.env, ctx.chatId, `Survey \`${id}\` closed.`);
}

export async function handleListSchedules(ctx: RequestContext): Promise<void> {
  const schedules = await listSchedules(ctx.env);
  if (schedules.length === 0) {
    await sendMessage(ctx.env, ctx.chatId, "No scheduled jobs configured.");
    return;
  }
  for (const s of schedules) {
    await sendMessage(
      ctx.env,
      ctx.chatId,
      `• *${s.title}* (\`${s.cron}\`) — ${s.active ? "active" : "inactive"}\n  ${s.description}`,
      { replyMarkup: [[{ text: s.active ? "Deactivate" : "Activate", callback_data: `admin:toggleschedule:${s.id}` }]] }
    );
  }
}

export async function handleToggleScheduleCallback(ctx: RequestContext): Promise<void> {
  if (!ctx.callbackData) return;
  const [, , id] = parseCallback(ctx.callbackData);
  const schedule = await toggleSchedule(ctx.env, id);
  await sendMessage(
    ctx.env,
    ctx.chatId,
    schedule ? `*${schedule.title}* is now ${schedule.active ? "active" : "inactive"}.` : `No schedule found with id \`${id}\`.`
  );
}

/** /createschedule Title | cron expr | description */
export async function handleCreateSchedule(ctx: RequestContext): Promise<void> {
  const raw = ctx.text ? ctx.text.replace(/^\/createschedule\s*/, "") : "";
  const [title, cron, description] = raw.split("|").map((s) => s.trim());

  if (!title || !cron || !description) {
    await sendMessage(ctx.env, ctx.chatId, "Usage: /createschedule Title | */30 * * * * | Description");
    return;
  }

  const schedule = await createSchedule(ctx.env, ctx.userId, title, cron, description);
  await sendMessage(
    ctx.env,
    ctx.chatId,
    `Schedule saved: *${schedule.title}*.\nNote: cron timing itself still lives in wrangler.toml — this entry documents intent for the team.`
  );
}

export async function handleTickets(ctx: RequestContext): Promise<void> {
  const tickets = await listOpenTickets(ctx.env);
  if (tickets.length === 0) {
    await sendMessage(ctx.env, ctx.chatId, "No open tickets. 🎉");
    return;
  }
  for (const t of tickets) {
    await sendMessage(ctx.env, ctx.chatId, `🎫 \`${t.id}\` — ${t.subject}\nOpened by: ${t.openedBy}`, {
      replyMarkup: [[{ text: "Mark resolved", callback_data: `admin:resolve:${t.id}` }]],
    });
  }
}

/** Callback version of resolution — applies a generic note; use /resolve for custom notes. */
export async function handleResolveCallback(ctx: RequestContext): Promise<void> {
  if (!ctx.callbackData) return;
  const [, , ticketId] = parseCallback(ctx.callbackData);
  const ticket = await resolveTicket(ctx.env, ticketId, ctx.userId, "Resolved via quick action.");
  await sendMessage(
    ctx.env,
    ctx.chatId,
    ticket ? `Ticket \`${ticket.id}\` marked resolved.` : `No ticket found with id \`${ticketId}\`.`
  );
}

/** /schedule — alias of /schedules for teams that prefer the singular form */
export async function handleSchedule(ctx: RequestContext): Promise<void> {
  await handleListSchedules(ctx);
}

/** /resolve <ticket_id> | resolution notes */
export async function handleResolve(ctx: RequestContext): Promise<void> {
  const raw = ctx.text ? ctx.text.replace(/^\/resolve\s*/, "") : "";
  const [idPart, ...noteParts] = raw.split("|");
  const id = idPart?.trim();
  const resolution = noteParts.join("|").trim() || "Resolved.";

  if (!id) {
    await sendMessage(ctx.env, ctx.chatId, "Usage: /resolve <ticket_id> | resolution notes");
    return;
  }

  const ticket = await resolveTicket(ctx.env, id, ctx.userId, resolution);
  await sendMessage(
    ctx.env,
    ctx.chatId,
    ticket ? `Ticket \`${ticket.id}\` marked resolved.` : `No ticket found with id \`${id}\`.`
  );
}

/** /adddoc Title | Content or URL | category (category optional) */
export async function handleAddDoc(ctx: RequestContext): Promise<void> {
  const raw = ctx.text ? ctx.text.replace(/^\/adddoc\s*/, "") : "";
  const [title, content, category] = raw.split("|").map((s) => s?.trim());

  if (!title || !content) {
    await sendMessage(ctx.env, ctx.chatId, "Usage: /adddoc Title | Content or URL | category (optional)");
    return;
  }

  const doc = await createDocument(ctx.env, ctx.userId, title, content, category || undefined);
  await sendMessage(ctx.env, ctx.chatId, `Document saved: *${doc.title}* (id: \`${doc.id}\`)`, {
    replyMarkup: [[{ text: "🗑 Delete", callback_data: `admin:deldoc:${doc.id}` }]],
  });
}

export async function handleDeleteDocCallback(ctx: RequestContext): Promise<void> {
  if (!ctx.callbackData) return;
  const [, , id] = parseCallback(ctx.callbackData);
  await deleteDocument(ctx.env, id);
  await sendMessage(ctx.env, ctx.chatId, `Document \`${id}\` deleted.`);
}

/** /addfaq Question | Answer */
export async function handleAddFaq(ctx: RequestContext): Promise<void> {
  const raw = ctx.text ? ctx.text.replace(/^\/addfaq\s*/, "") : "";
  const [question, ...answerParts] = raw.split("|");
  const answer = answerParts.join("|").trim();

  if (!question?.trim() || !answer) {
    await sendMessage(ctx.env, ctx.chatId, "Usage: /addfaq Question | Answer");
    return;
  }

  const faq = await createFaq(ctx.env, ctx.userId, question.trim(), answer);
  await sendMessage(ctx.env, ctx.chatId, `FAQ entry added: *${faq.question}*`);
}
