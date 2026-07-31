import type {
  Env,
  UserRecord,
  AnnouncementRecord,
  EventRecord,
  SurveyRecord,
  ScheduleRecord,
  TicketRecord,
  DocumentRecord,
  FaqRecord,
  LogRecord,
  Role,
} from "./types";

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------
async function getJSON<T>(env: Env, key: string): Promise<T | null> {
  const raw = await env.TEAMMARYSY_KV.get(key);
  return raw ? (JSON.parse(raw) as T) : null;
}

async function putJSON<T>(env: Env, key: string, value: T): Promise<void> {
  await env.TEAMMARYSY_KV.put(key, JSON.stringify(value));
}

async function listByPrefix(env: Env, prefix: string, limit = 1000): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.TEAMMARYSY_KV.list({ prefix, cursor, limit: 1000 });
    keys.push(...page.keys.map((k) => k.name));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor && keys.length < limit);
  return keys.slice(0, limit);
}

function newId(): string {
  // Simple sortable unique id: timestamp + random suffix
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Users & Roles
// ---------------------------------------------------------------------------
export async function getUser(env: Env, userId: number): Promise<UserRecord | null> {
  return getJSON<UserRecord>(env, `user:${userId}`);
}

export async function upsertUser(
  env: Env,
  userId: number,
  patch: Partial<UserRecord>
): Promise<UserRecord> {
  const existing = await getUser(env, userId);
  const now = new Date().toISOString();

  const record: UserRecord = {
    id: userId,
    username: patch.username ?? existing?.username,
    firstName: patch.firstName ?? existing?.firstName ?? "Unknown",
    role: existing?.role ?? patch.role ?? "general",
    joinedAt: existing?.joinedAt ?? now,
    lastSeenAt: now,
    isBlocked: existing?.isBlocked ?? false,
  };

  await putJSON(env, `user:${userId}`, record);
  return record;
}

export async function setUserRole(env: Env, userId: number, role: Role): Promise<UserRecord | null> {
  const existing = await getUser(env, userId);
  if (!existing) return null;
  const updated: UserRecord = { ...existing, role };
  await putJSON(env, `user:${userId}`, updated);
  return updated;
}

export async function resolveRole(env: Env, userId: number): Promise<Role> {
  if (String(userId) === env.OWNER_TELEGRAM_ID) return "owner";
  const user = await getUser(env, userId);
  return user?.role ?? "general";
}

/** Lists users, optionally filtered to a specific role (e.g. "admin" for a staff directory). */
export async function listUsers(env: Env, role?: Role, limit = 100): Promise<UserRecord[]> {
  const keys = await listByPrefix(env, "user:", limit);
  const records = await Promise.all(keys.map((k) => getJSON<UserRecord>(env, k)));
  const users = records.filter((r): r is UserRecord => r !== null);
  return role ? users.filter((u) => u.role === role) : users;
}

// ---------------------------------------------------------------------------
// Config (generic key/value, e.g. config:welcome_message, config:feature_flags)
// ---------------------------------------------------------------------------
export async function getConfig<T>(env: Env, key: string): Promise<T | null> {
  return getJSON<T>(env, `config:${key}`);
}

export async function setConfig<T>(env: Env, key: string, value: T): Promise<void> {
  await putJSON(env, `config:${key}`, value);
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------
export async function createAnnouncement(
  env: Env,
  createdBy: number,
  title: string,
  body: string
): Promise<AnnouncementRecord> {
  const record: AnnouncementRecord = {
    id: newId(),
    title,
    body,
    createdBy,
    createdAt: new Date().toISOString(),
    pinned: false,
  };
  await putJSON(env, `announcement:${record.id}`, record);
  return record;
}

export async function listAnnouncements(env: Env, limit = 20): Promise<AnnouncementRecord[]> {
  const keys = await listByPrefix(env, "announcement:", limit);
  const records = await Promise.all(keys.map((k) => getJSON<AnnouncementRecord>(env, k)));
  return records.filter((r): r is AnnouncementRecord => r !== null);
}

export async function deleteAnnouncement(env: Env, id: string): Promise<void> {
  await env.TEAMMARYSY_KV.delete(`announcement:${id}`);
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------
export async function createEvent(
  env: Env,
  createdBy: number,
  title: string,
  description: string,
  startsAt: string,
  endsAt?: string,
  capacity?: number
): Promise<EventRecord> {
  const record: EventRecord = {
    id: newId(),
    title,
    description,
    startsAt,
    endsAt,
    createdBy,
    attendeeIds: [],
    capacity,
  };
  await putJSON(env, `event:${record.id}`, record);
  return record;
}

export async function joinEvent(env: Env, eventId: string, userId: number): Promise<
  { event: EventRecord | null; full: boolean }
> {
  const event = await getJSON<EventRecord>(env, `event:${eventId}`);
  if (!event) return { event: null, full: false };

  if (event.attendeeIds.includes(userId)) {
    return { event, full: false }; // already joined, no-op
  }

  if (event.capacity !== undefined && event.attendeeIds.length >= event.capacity) {
    return { event, full: true };
  }

  event.attendeeIds.push(userId);
  await putJSON(env, `event:${eventId}`, event);
  return { event, full: false };
}

export async function cancelEvent(env: Env, eventId: string): Promise<EventRecord | null> {
  const event = await getJSON<EventRecord>(env, `event:${eventId}`);
  if (!event) return null;
  await env.TEAMMARYSY_KV.delete(`event:${eventId}`);
  return event;
}

export async function getEvent(env: Env, eventId: string): Promise<EventRecord | null> {
  return getJSON<EventRecord>(env, `event:${eventId}`);
}

export async function listEvents(env: Env, limit = 20): Promise<EventRecord[]> {
  const keys = await listByPrefix(env, "event:", limit);
  const records = await Promise.all(keys.map((k) => getJSON<EventRecord>(env, k)));
  return records.filter((r): r is EventRecord => r !== null);
}

// ---------------------------------------------------------------------------
// Surveys
// ---------------------------------------------------------------------------
export async function createSurvey(
  env: Env,
  createdBy: number,
  question: string,
  options: string[]
): Promise<SurveyRecord> {
  const record: SurveyRecord = {
    id: newId(),
    question,
    options,
    votes: {},
    createdBy,
    isOpen: true,
  };
  await putJSON(env, `survey:${record.id}`, record);
  return record;
}

export async function castVote(
  env: Env,
  surveyId: string,
  optionIndex: number,
  userId: number
): Promise<SurveyRecord | null> {
  const survey = await getJSON<SurveyRecord>(env, `survey:${surveyId}`);
  if (!survey || !survey.isOpen) return null;

  // Remove any prior vote from this user (single-choice survey)
  for (const key of Object.keys(survey.votes)) {
    survey.votes[key] = survey.votes[key].filter((id) => id !== userId);
  }

  const key = String(optionIndex);
  survey.votes[key] = survey.votes[key] ?? [];
  survey.votes[key].push(userId);

  await putJSON(env, `survey:${surveyId}`, survey);
  return survey;
}

export async function closeSurvey(env: Env, surveyId: string): Promise<void> {
  const survey = await getJSON<SurveyRecord>(env, `survey:${surveyId}`);
  if (!survey) return;
  survey.isOpen = false;
  await putJSON(env, `survey:${surveyId}`, survey);
}

export async function getSurvey(env: Env, surveyId: string): Promise<SurveyRecord | null> {
  return getJSON<SurveyRecord>(env, `survey:${surveyId}`);
}

export async function listSurveys(env: Env, limit = 20): Promise<SurveyRecord[]> {
  const keys = await listByPrefix(env, "survey:", limit);
  const records = await Promise.all(keys.map((k) => getJSON<SurveyRecord>(env, k)));
  return records.filter((r): r is SurveyRecord => r !== null);
}

// ---------------------------------------------------------------------------
// Schedules (recurring items managed through the bot, distinct from cron infra)
// ---------------------------------------------------------------------------
export async function createSchedule(
  env: Env,
  createdBy: number,
  title: string,
  cron: string,
  description: string
): Promise<ScheduleRecord> {
  const record: ScheduleRecord = {
    id: newId(),
    title,
    cron,
    description,
    createdBy,
    active: true,
  };
  await putJSON(env, `schedule:${record.id}`, record);
  return record;
}

export async function listSchedules(env: Env, limit = 50): Promise<ScheduleRecord[]> {
  const keys = await listByPrefix(env, "schedule:", limit);
  const records = await Promise.all(keys.map((k) => getJSON<ScheduleRecord>(env, k)));
  return records.filter((r): r is ScheduleRecord => r !== null);
}

export async function toggleSchedule(env: Env, id: string): Promise<ScheduleRecord | null> {
  const schedule = await getJSON<ScheduleRecord>(env, `schedule:${id}`);
  if (!schedule) return null;
  schedule.active = !schedule.active;
  await putJSON(env, `schedule:${id}`, schedule);
  return schedule;
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------
export async function createTicket(env: Env, openedBy: number, subject: string): Promise<TicketRecord> {
  const now = new Date().toISOString();
  const record: TicketRecord = {
    id: newId(),
    openedBy,
    subject,
    status: "open",
    createdAt: now,
    updatedAt: now,
    messages: [{ from: openedBy, text: subject, at: now }],
  };
  await putJSON(env, `ticket:${record.id}`, record);
  return record;
}

export async function listOpenTickets(env: Env, limit = 50): Promise<TicketRecord[]> {
  const keys = await listByPrefix(env, "ticket:", limit);
  const records = await Promise.all(keys.map((k) => getJSON<TicketRecord>(env, k)));
  return records.filter((r): r is TicketRecord => r !== null && r.status !== "closed");
}

export async function getTicket(env: Env, id: string): Promise<TicketRecord | null> {
  return getJSON<TicketRecord>(env, `ticket:${id}`);
}

export async function resolveTicket(
  env: Env,
  id: string,
  resolvedBy: number,
  resolution: string
): Promise<TicketRecord | null> {
  const ticket = await getTicket(env, id);
  if (!ticket) return null;

  const now = new Date().toISOString();
  ticket.status = "closed";
  ticket.resolvedBy = resolvedBy;
  ticket.resolution = resolution;
  ticket.resolvedAt = now;
  ticket.updatedAt = now;
  ticket.messages.push({ from: resolvedBy, text: `[resolved] ${resolution}`, at: now });

  await putJSON(env, `ticket:${id}`, ticket);
  return ticket;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------
export async function createDocument(
  env: Env,
  uploadedBy: number,
  title: string,
  content: string,
  category?: string
): Promise<DocumentRecord> {
  const now = new Date().toISOString();
  const record: DocumentRecord = {
    id: newId(),
    title,
    content,
    category,
    uploadedBy,
    createdAt: now,
    updatedAt: now,
  };
  await putJSON(env, `doc:${record.id}`, record);
  return record;
}

export async function getDocument(env: Env, id: string): Promise<DocumentRecord | null> {
  return getJSON<DocumentRecord>(env, `doc:${id}`);
}

export async function listDocuments(env: Env, category?: string, limit = 30): Promise<DocumentRecord[]> {
  const keys = await listByPrefix(env, "doc:", limit);
  const records = await Promise.all(keys.map((k) => getJSON<DocumentRecord>(env, k)));
  const docs = records.filter((r): r is DocumentRecord => r !== null);
  return category ? docs.filter((d) => d.category === category) : docs;
}

export async function deleteDocument(env: Env, id: string): Promise<void> {
  await env.TEAMMARYSY_KV.delete(`doc:${id}`);
}

// ---------------------------------------------------------------------------
// FAQ
// ---------------------------------------------------------------------------
export async function createFaq(env: Env, createdBy: number, question: string, answer: string): Promise<FaqRecord> {
  const record: FaqRecord = {
    id: newId(),
    question,
    answer,
    createdBy,
    createdAt: new Date().toISOString(),
  };
  await putJSON(env, `faq:${record.id}`, record);
  return record;
}

export async function getFaq(env: Env, id: string): Promise<FaqRecord | null> {
  return getJSON<FaqRecord>(env, `faq:${id}`);
}

export async function listFaqs(env: Env, limit = 30): Promise<FaqRecord[]> {
  const keys = await listByPrefix(env, "faq:", limit);
  const records = await Promise.all(keys.map((k) => getJSON<FaqRecord>(env, k)));
  return records.filter((r): r is FaqRecord => r !== null);
}

export async function deleteFaq(env: Env, id: string): Promise<void> {
  await env.TEAMMARYSY_KV.delete(`faq:${id}`);
}

// ---------------------------------------------------------------------------
// Logs (append-only audit trail, partitioned by day)
// ---------------------------------------------------------------------------
export async function writeLog(env: Env, entry: LogRecord): Promise<void> {
  const day = entry.at.slice(0, 10); // yyyy-mm-dd
  const key = `log:${day}:${newId()}`;
  await putJSON(env, key, entry);
}

export async function listLogsForDay(env: Env, day: string, limit = 200): Promise<LogRecord[]> {
  const keys = await listByPrefix(env, `log:${day}:`, limit);
  const records = await Promise.all(keys.map((k) => getJSON<LogRecord>(env, k)));
  return records.filter((r): r is LogRecord => r !== null);
}

// ---------------------------------------------------------------------------
// Counters (e.g. counter:tickets_opened)
// ---------------------------------------------------------------------------
export async function incrementCounter(env: Env, name: string, by = 1): Promise<number> {
  const key = `counter:${name}`;
  const current = Number((await env.TEAMMARYSY_KV.get(key)) ?? "0");
  const next = current + by;
  await env.TEAMMARYSY_KV.put(key, String(next));
  return next;
}
