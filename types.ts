// ---------------------------------------------------------------------------
// Cloudflare Worker environment bindings (from wrangler.toml + secrets)
// ---------------------------------------------------------------------------
export interface Env {
  TEAMMARYSY_KV: KVNamespace;
  TELEGRAM_BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  OWNER_TELEGRAM_ID: string;
  ENVIRONMENT: string;
}

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------
export type Role = "general" | "admin" | "owner";

// ---------------------------------------------------------------------------
// Minimal Telegram types (only the fields this bot actually uses)
// ---------------------------------------------------------------------------
export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

// ---------------------------------------------------------------------------
// Request context passed through middleware -> handlers
// ---------------------------------------------------------------------------
export interface RequestContext {
  env: Env;
  update: TelegramUpdate;
  userId: number;
  chatId: number;
  role: Role;
  isCallback: boolean;
  text?: string;      // command text, if message
  callbackData?: string; // callback_data, if callback query
}

// ---------------------------------------------------------------------------
// KV data schemas
//
// Key design (hierarchical, documented so structures stay consistent):
//   user:{userId}                -> UserRecord
//   config:{key}                 -> arbitrary JSON config value
//   announcement:{id}            -> AnnouncementRecord
//   event:{id}                   -> EventRecord
//   survey:{id}                  -> SurveyRecord
//   schedule:{id}                -> ScheduleRecord
//   ticket:{id}                  -> TicketRecord
//   doc:{id}                     -> DocumentRecord
//   faq:{id}                     -> FaqRecord
//   log:{yyyy-mm-dd}:{ulid}      -> LogRecord
//   counter:{name}                -> number stored as string
// ---------------------------------------------------------------------------

export interface UserRecord {
  id: number;
  username?: string;
  firstName: string;
  role: Role;
  joinedAt: string; // ISO timestamp
  lastSeenAt: string; // ISO timestamp
  isBlocked: boolean;
}

export interface AnnouncementRecord {
  id: string;
  title: string;
  body: string;
  createdBy: number;
  createdAt: string;
  pinned: boolean;
}

export interface EventRecord {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt?: string;
  createdBy: number;
  attendeeIds: number[];
  capacity?: number; // max attendees; undefined = unlimited
}

export interface SurveyRecord {
  id: string;
  question: string;
  options: string[];
  votes: Record<string, number[]>; // option index (as string) -> voter userIds
  createdBy: number;
  isOpen: boolean;
}

export interface ScheduleRecord {
  id: string;
  title: string;
  cron: string;
  description: string;
  createdBy: number;
  active: boolean;
}

export interface TicketRecord {
  id: string;
  openedBy: number;
  subject: string;
  status: "open" | "in_progress" | "closed";
  createdAt: string;
  updatedAt: string;
  messages: { from: number; text: string; at: string }[];
  resolvedBy?: number;
  resolution?: string;
  resolvedAt?: string;
}

export interface DocumentRecord {
  id: string;
  title: string;
  content: string; // plain text or a URL to an external file
  category?: string;
  uploadedBy: number;
  createdAt: string;
  updatedAt: string;
}

export interface FaqRecord {
  id: string;
  question: string;
  answer: string;
  createdBy: number;
  createdAt: string;
}

export interface LogRecord {
  at: string;
  userId: number;
  role: Role;
  action: string;
  detail?: string;
}
