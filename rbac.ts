import type { Role, RequestContext } from "../lib/types";

// ---------------------------------------------------------------------------
// Permission map — single source of truth for who can run what.
// A role can use a command/callback if its tier is >= the required tier.
// ---------------------------------------------------------------------------
const ROLE_RANK: Record<Role, number> = {
  general: 0,
  admin: 1,
  owner: 2,
};

// Command name (without leading "/") -> minimum required role.
// NOTE: this maps slash commands only. Callback actions (button taps) are
// gated separately via CALLBACK_PREFIX_PERMISSIONS below — "join" and "vote"
// are callback actions (gen:join:.., gen:vote:..), not commands, so they do
// not appear here.
export const COMMAND_PERMISSIONS: Record<string, Role> = {
  // General
  start: "general",
  help: "general",
  announcements: "general",
  info: "general",
  faq: "general",
  events: "general",
  event: "general",
  survey: "general",
  ticket: "general",
  submit: "general",
  docs: "general",
  status: "general",

  // Administrators
  announce: "admin",
  createevent: "admin",
  createsurvey: "admin",
  closesurvey: "admin",
  schedules: "admin",
  schedule: "admin",
  createschedule: "admin",
  tickets: "admin",
  resolve: "admin",
  adddoc: "admin",
  addfaq: "admin",

  // Owner
  setrole: "owner",
  roles: "owner",
  permissions: "owner",
  config: "owner",
  logs: "owner",
  report: "owner",
  broadcast: "owner",
};

// Callback data is namespaced like "admin:announce:123" or "gen:vote:2:0".
// We check by prefix before the first colon.
export const CALLBACK_PREFIX_PERMISSIONS: Record<string, Role> = {
  gen: "general",
  admin: "admin",
  owner: "owner",
};

export function isCommandAllowed(role: Role, command: string): boolean {
  const required = COMMAND_PERMISSIONS[command];
  if (!required) return false; // unknown command: deny by default
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

export function isCallbackAllowed(role: Role, callbackData: string): boolean {
  const prefix = callbackData.split(":")[0];
  const required = CALLBACK_PREFIX_PERMISSIONS[prefix];
  if (!required) return false;
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

/** Renders the command permission map as readable text, grouped by minimum role. Used by /permissions. */
export function renderPermissionMatrix(): string {
  const groups: Record<Role, string[]> = { general: [], admin: [], owner: [] };
  for (const [command, role] of Object.entries(COMMAND_PERMISSIONS)) {
    groups[role].push(`/${command}`);
  }

  return [
    "*Permission Matrix*",
    "",
    `*General:* ${groups.general.sort().join(", ")}`,
    `*Admin:* ${groups.admin.sort().join(", ")}`,
    `*Owner:* ${groups.owner.sort().join(", ")}`,
  ].join("\n");
}

/**
 * Authorization gate. Returns true if the request context's role may proceed.
 * Owner always overrides restrictions (per platform spec: "Owner can override
 * permission restrictions").
 */
export function authorize(ctx: RequestContext): boolean {
  if (ctx.role === "owner") return true;

  if (ctx.isCallback && ctx.callbackData) {
    return isCallbackAllowed(ctx.role, ctx.callbackData);
  }

  if (!ctx.isCallback && ctx.text?.startsWith("/")) {
    const command = ctx.text.slice(1).split(/[\s@]/)[0].toLowerCase();
    return isCommandAllowed(ctx.role, command);
  }

  // Plain text messages (no command) are always allowed through;
  // handlers decide what, if anything, to do with them.
  return true;
}
