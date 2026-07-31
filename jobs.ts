import type { Env } from "../lib/types";
import { listEvents, writeLog, incrementCounter, listOpenTickets, listSchedules, listDocuments } from "../lib/kv";
import { sendMessage } from "../lib/telegram";

/**
 * Runs every 30 minutes: sends reminders for events starting soon.
 * (In production, maintain a `chat:{id}` index of subscribed chats and loop
 * over them; here we log the reminder candidates as a starting point.)
 */
export async function sendReminders(env: Env): Promise<void> {
  const events = await listEvents(env, 50);
  const now = Date.now();
  const soon = 60 * 60 * 1000; // 1 hour

  const upcoming = events.filter((e) => {
    const startsAt = new Date(e.startsAt).getTime();
    return startsAt > now && startsAt - now <= soon;
  });

  for (const event of upcoming) {
    for (const attendeeId of event.attendeeIds) {
      await sendMessage(env, attendeeId, `⏰ Reminder: *${event.title}* starts soon (${event.startsAt}).`);
    }
  }

  await writeLog(env, {
    at: new Date().toISOString(),
    userId: 0,
    role: "owner",
    action: "cron:reminders",
    detail: `${upcoming.length} event(s) reminded`,
  });
}

/**
 * Runs every 4 hours: refresh any externally-sourced data the bot depends on.
 * Placeholder — wire up real external API calls as needed.
 */
export async function refreshExternalData(env: Env): Promise<void> {
  const count = await incrementCounter(env, "external_refresh_runs");

  await writeLog(env, {
    at: new Date().toISOString(),
    userId: 0,
    role: "owner",
    action: "cron:refresh",
    detail: `refresh run #${count}`,
  });
}

/**
 * Runs daily at 03:00: cleans up stale/temporary data.
 * Extend this to purge expired session state, old closed tickets, etc.
 */
export async function cleanupTempData(env: Env): Promise<void> {
  // Example: prune log partitions older than 30 days.
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  let cursor: string | undefined;
  let deleted = 0;

  do {
    const page = await env.TEAMMARYSY_KV.list({ prefix: "log:", cursor });
    for (const key of page.keys) {
      const day = key.name.split(":")[1];
      if (day && day < cutoff) {
        await env.TEAMMARYSY_KV.delete(key.name);
        deleted++;
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  await writeLog(env, {
    at: new Date().toISOString(),
    userId: 0,
    role: "owner",
    action: "cron:cleanup",
    detail: `${deleted} stale log record(s) purged`,
  });
}

/**
 * Runs weekly (Monday 09:00): sends a maintenance/operational summary to the
 * Owner covering open tickets, active schedules, and document count — a
 * lightweight substitute for manually reviewing the Cloudflare Dashboard.
 */
export async function runMaintenance(env: Env): Promise<void> {
  const [tickets, schedules, docs] = await Promise.all([
    listOpenTickets(env),
    listSchedules(env),
    listDocuments(env),
  ]);

  const activeSchedules = schedules.filter((s) => s.active).length;

  const summary = [
    "*🛠 Weekly Maintenance Summary*",
    `Open tickets: ${tickets.length}`,
    `Active schedules: ${activeSchedules} / ${schedules.length}`,
    `Documents on file: ${docs.length}`,
  ].join("\n");

  const ownerId = Number(env.OWNER_TELEGRAM_ID);
  if (ownerId) {
    await sendMessage(env, ownerId, summary);
  }

  await writeLog(env, {
    at: new Date().toISOString(),
    userId: 0,
    role: "owner",
    action: "cron:maintenance",
    detail: `${tickets.length} open ticket(s), ${activeSchedules} active schedule(s), ${docs.length} doc(s)`,
  });
}

/** Dispatches based on the cron expression that triggered this invocation. */
export async function handleScheduled(env: Env, cron: string): Promise<void> {
  switch (cron) {
    case "*/30 * * * *":
      await sendReminders(env);
      break;
    case "0 */4 * * *":
      await refreshExternalData(env);
      break;
    case "0 3 * * *":
      await cleanupTempData(env);
      break;
    case "0 9 * * 1":
      await runMaintenance(env);
      break;
    default:
      console.warn(`No handler registered for cron: ${cron}`);
  }
}
