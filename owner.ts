import type { Role, RequestContext } from "../lib/types";
import { sendMessage } from "../lib/telegram";
import { setUserRole, listLogsForDay, listUsers, getConfig, setConfig } from "../lib/kv";
import { parseArgs } from "../middleware/validation";
import { renderPermissionMatrix } from "../middleware/rbac";

const VALID_ROLES: Role[] = ["general", "admin", "owner"];

/** /setrole <userId> <general|admin|owner> */
export async function handleSetRole(ctx: RequestContext): Promise<void> {
  const [userIdStr, roleStr] = ctx.text ? parseArgs(ctx.text) : [];
  const targetId = Number(userIdStr);
  const role = roleStr as Role;

  if (!targetId || !VALID_ROLES.includes(role)) {
    await sendMessage(ctx.env, ctx.chatId, "Usage: /setrole <telegram_user_id> <general|admin|owner>");
    return;
  }

  const updated = await setUserRole(ctx.env, targetId, role);
  await sendMessage(
    ctx.env,
    ctx.chatId,
    updated
      ? `User \`${targetId}\` is now *${role}*.`
      : `User \`${targetId}\` has not interacted with the bot yet — they must send /start first.`
  );
}

/**
 * /roles — lists current Admins and Owners (a staff directory).
 * /roles <userId> <general|admin|owner> — same as /setrole, provided as a
 * friendlier alias since this is the command name used in the product docs.
 */
export async function handleRoles(ctx: RequestContext): Promise<void> {
  const args = ctx.text ? parseArgs(ctx.text) : [];

  if (args.length >= 2) {
    await handleSetRole(ctx);
    return;
  }

  const [admins, owners] = await Promise.all([listUsers(ctx.env, "admin"), listUsers(ctx.env, "owner")]);

  if (admins.length === 0 && owners.length === 0) {
    await sendMessage(ctx.env, ctx.chatId, "No Admins or Owners on record yet (besides the configured Owner ID).");
    return;
  }

  const lines = ["*Staff Directory*", ""];
  if (owners.length) lines.push("*Owners:*", ...owners.map((u) => `• ${u.firstName} (\`${u.id}\`)`), "");
  if (admins.length) lines.push("*Admins:*", ...admins.map((u) => `• ${u.firstName} (\`${u.id}\`)`));
  lines.push("", "Use /roles <userId> <general|admin|owner> to change a role.");

  await sendMessage(ctx.env, ctx.chatId, lines.join("\n"));
}

/** /permissions — displays the current command permission matrix. */
export async function handlePermissions(ctx: RequestContext): Promise<void> {
  await sendMessage(ctx.env, ctx.chatId, renderPermissionMatrix());
}

/**
 * /config get <key>
 * /config set <key> <value...>
 * Manages arbitrary runtime configuration stored in Workers KV — e.g.
 * `org_info` used by /info, or feature flags read by handlers/jobs.
 */
export async function handleConfig(ctx: RequestContext): Promise<void> {
  const args = ctx.text ? parseArgs(ctx.text) : [];
  const [action, key, ...rest] = args;

  if (action === "get" && key) {
    const value = await getConfig<string>(ctx.env, key);
    await sendMessage(ctx.env, ctx.chatId, value !== null ? `\`${key}\` = ${value}` : `No config value set for \`${key}\`.`);
    return;
  }

  if (action === "set" && key && rest.length > 0) {
    const value = rest.join(" ");
    await setConfig(ctx.env, key, value);
    await sendMessage(ctx.env, ctx.chatId, `Config \`${key}\` updated.`);
    return;
  }

  await sendMessage(ctx.env, ctx.chatId, "Usage: /config get <key>\nor: /config set <key> <value>");
}

/** /logs [YYYY-MM-DD] (defaults to today) */
export async function handleLogs(ctx: RequestContext): Promise<void> {
  const [dayArg] = ctx.text ? parseArgs(ctx.text) : [];
  const day = dayArg ?? new Date().toISOString().slice(0, 10);

  const logs = await listLogsForDay(ctx.env, day, 30);
  if (logs.length === 0) {
    await sendMessage(ctx.env, ctx.chatId, `No log entries for ${day}.`);
    return;
  }

  const text = logs
    .map((l) => `\`${l.at}\` [${l.role}] ${l.userId}: ${l.action}${l.detail ? ` — ${l.detail}` : ""}`)
    .join("\n");
  await sendMessage(ctx.env, ctx.chatId, text);
}

/** /report — quick operational summary */
export async function handleReport(ctx: RequestContext): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const logs = await listLogsForDay(ctx.env, today, 1000);

  const byAction = new Map<string, number>();
  for (const l of logs) byAction.set(l.action, (byAction.get(l.action) ?? 0) + 1);

  const lines = [`*Report for ${today}*`, `Total events: ${logs.length}`, ""];
  for (const [action, count] of byAction) lines.push(`• ${action}: ${count}`);

  await sendMessage(ctx.env, ctx.chatId, lines.join("\n"));
}

/** /broadcast <message> — sends to the current chat; extend to iterate known chats if needed */
export async function handleBroadcast(ctx: RequestContext): Promise<void> {
  const args = ctx.text ? parseArgs(ctx.text) : [];
  const message = args.join(" ").trim();

  if (!message) {
    await sendMessage(ctx.env, ctx.chatId, "Usage: /broadcast <message>");
    return;
  }

  // NOTE: For a true multi-chat broadcast, maintain a `chat:{id}` KV index of
  // known chat IDs and loop over them here with a small delay between sends
  // to respect Telegram's rate limits.
  await sendMessage(ctx.env, ctx.chatId, `📣 *Broadcast:*\n${message}`);
}
