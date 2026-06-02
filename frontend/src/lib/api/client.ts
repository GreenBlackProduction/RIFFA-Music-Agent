/**
 * Минимальный fetch-клиент с авто-парсингом JSON и обработкой ошибок.
 * Все запросы идут через /api — Vite-прокси отправит их на FastAPI.
 * Куки сессии передаются автоматически (credentials: "include").
 */

import i18next from "i18next";

export interface ApiError {
  status: number;
  detail: string;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;

  if (!response.ok) {
    const detail =
      (typeof data === "object" &&
      data !== null &&
      "detail" in data &&
      typeof (data as { detail: unknown }).detail === "string"
        ? (data as { detail: string }).detail
        : `Request failed with status ${response.status}`) || "Request failed";
    const error: ApiError = { status: response.status, detail };
    throw error;
  }

  return data as T;
}

export interface ModelEntry {
  id: string;
  name: string;
  description: string;
  cost_tokens: number;
}

export type ModelCatalog = Record<string, ModelEntry[]>;

export function fetchModels(): Promise<ModelCatalog> {
  return apiFetch<ModelCatalog>("/api/v1/models");
}

export interface HealthInfo {
  status: string;
  env: string;
  version: string;
}

export function fetchHealth(): Promise<HealthInfo> {
  return apiFetch<HealthInfo>("/api/v1/health");
}

export interface CurrentUser {
  id: number;
  display_name: string;
  telegram_user_id: number | null;
  telegram_username: string | null;
  email: string | null;
  avatar_url: string | null;
  locale: string;
  balance_tokens: number;
  is_admin: boolean;
  is_banned: boolean;
  notice_message: string | null;
  notice_kind: "ban" | "warning" | null;
  referral_code: string | null;
  created_at: string | null;
  terms_accepted_at: string | null;
  terms_version: string | null;
  legal_version: string | null;
  generation_notifications_enabled: boolean;
  morning_messages_enabled: boolean;
}

export function fetchCurrentUser(): Promise<CurrentUser> {
  return apiFetch<CurrentUser>("/api/v1/users/me");
}

/** Toggle all bot notifications (morning broadcast + generation-done). */
export function updateNotifications(enabled: boolean): Promise<{ enabled: boolean }> {
  return apiFetch("/api/v1/users/notifications", {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export interface LegalDocument {
  slug: string;
  title: string;
  version: string;
  body: string;
}

export interface LegalIndex {
  version: string;
  documents: { slug: string; title: string }[];
}

export function fetchLegalIndex(): Promise<LegalIndex> {
  return apiFetch<LegalIndex>("/api/v1/legal");
}

export function fetchLegalDocument(slug: string): Promise<LegalDocument> {
  return apiFetch<LegalDocument>(`/api/v1/legal/${encodeURIComponent(slug)}`);
}

export interface AcceptTermsResponse {
  terms_accepted_at: string;
  terms_version: string;
}

export function acceptTerms(): Promise<AcceptTermsResponse> {
  return apiFetch<AcceptTermsResponse>("/api/v1/users/accept-terms", {
    method: "POST",
  });
}

export interface RedeemPromoResponse {
  code: string;
  tokens_granted: number;
  balance_tokens: number;
}

export function redeemPromo(code: string): Promise<RedeemPromoResponse> {
  return apiFetch<RedeemPromoResponse>("/api/v1/users/redeem-promo", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export interface TelegramWidgetPayload {
  id: number;
  auth_date: number;
  hash: string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

export function loginWithTelegramWidget(
  payload: TelegramWidgetPayload,
): Promise<{ user_id: number; created: boolean }> {
  return apiFetch("/api/v1/auth/telegram/widget", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function loginWithTelegramInitData(
  initData: string,
): Promise<{ user_id: number; created: boolean }> {
  return apiFetch("/api/v1/auth/telegram/initdata", {
    method: "POST",
    body: JSON.stringify({ init_data: initData }),
  });
}

/** Start a bot-link login session — returns a nonce + bot deep-link URL. */
export function startBotLinkLogin(): Promise<{ nonce: string; bot_url: string }> {
  return apiFetch("/api/v1/auth/telegram/bot-link/start", { method: "POST" });
}

/** Poll the backend with the nonce until the bot approves the login. */
export function pollBotLinkLogin(
  nonce: string,
): Promise<{ approved: boolean; user_id?: number }> {
  return apiFetch(
    `/api/v1/auth/telegram/bot-link/poll?nonce=${encodeURIComponent(nonce)}`,
  );
}

export function registerWithEmail(
  email: string,
  password: string,
): Promise<{ user_id: number; created: boolean }> {
  return apiFetch("/api/v1/auth/email/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function loginWithEmail(
  email: string,
  password: string,
): Promise<{ user_id: number }> {
  return apiFetch("/api/v1/auth/email/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function requestEmailMagicLink(email: string): Promise<{ status: string }> {
  return apiFetch("/api/v1/auth/email/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function verifyEmailToken(token: string): Promise<{ ok: boolean; user_id: number }> {
  return apiFetch(`/api/v1/auth/email/verify?token=${encodeURIComponent(token)}`);
}

export function logout(): Promise<{ ok: boolean }> {
  return apiFetch("/api/v1/auth/logout", { method: "POST" });
}

export type PackageCode = "starter" | "basic" | "advanced" | "premium";

export interface StarsInvoiceResponse {
  bot_url: string;
  package_code: string;
  tokens: number;
  stars: number;
}

export function createStarsInvoice(package_code: PackageCode): Promise<StarsInvoiceResponse> {
  return apiFetch("/api/v1/payments/stars/invoice", {
    method: "POST",
    body: JSON.stringify({ package_code }),
  });
}

export interface RobokassaLinkResponse {
  url: string;
  package_code: string;
  tokens: number;
  rub: number;
}

export function createRobokassaLink(package_code: PackageCode): Promise<RobokassaLinkResponse> {
  return apiFetch("/api/v1/payments/robokassa/link", {
    method: "POST",
    body: JSON.stringify({ package_code }),
  });
}

export function retryGeneration(genId: string): Promise<GenerateResponse> {
  return apiFetch(`/api/v1/history/${genId}/retry`, { method: "POST" });
}

export function updateDisplayName(name: string): Promise<{ display_name: string }> {
  return apiFetch("/api/v1/users/display-name", {
    method: "PATCH",
    body: JSON.stringify({ display_name: name }),
  });
}

export function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean }> {
  return apiFetch("/api/v1/users/change-password", {
    method: "POST",
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

/** Загрузить новый аватар пользователя (multipart/form-data). Backend
 *  принимает image/png|jpeg|webp до ~4 МБ и кладёт публичный URL в
 *  `users.avatar_url`. */
export async function uploadAvatar(file: File): Promise<{ avatar_url: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const response = await fetch("/api/v1/users/avatar", {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  const text = await response.text();
  // Backend всегда отвечает JSON, но между нами и им nginx — он может
  // вернуть HTML-страницу для 413 / 502 / других ошибок прокси. Парсим
  // защищённо: если JSON битый — даём осмысленный fallback по статусу.
  let data: { detail?: string; avatar_url?: string } | undefined;
  if (text) {
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      data = undefined;
    }
  }
  if (!response.ok) {
    let detail = data?.detail;
    if (!detail) {
      const isEn = (i18next.resolvedLanguage ?? "ru").startsWith("en");
      if (response.status === 413) {
        detail = isEn ? "File too large. Use an image up to 4 MB." : "Файл слишком большой. Используйте изображение до 4 МБ.";
      } else if (response.status === 415) {
        detail = isEn ? "Unsupported format. PNG, JPEG or WebP." : "Неподдерживаемый формат. PNG, JPEG или WebP.";
      } else if (response.status === 401) {
        detail = isEn ? "Session expired, please sign in again." : "Сессия истекла, перезайдите.";
      } else {
        detail = isEn ? `Avatar upload error (HTTP ${response.status}).` : `Ошибка загрузки аватара (HTTP ${response.status}).`;
      }
    }
    const err: ApiError = { status: response.status, detail };
    throw err;
  }
  if (!data || !data.avatar_url) {
    const isEn = (i18next.resolvedLanguage ?? "ru").startsWith("en");
    throw { status: 500, detail: isEn ? "Server returned an invalid response." : "Сервер вернул некорректный ответ." } as ApiError;
  }
  return data as { avatar_url: string };
}

// ---------------------------------------------------------------------------
// Generation types
// ---------------------------------------------------------------------------

export interface GenerateResponse {
  generation_id: string;
  ws_url: string;
}

export interface Track {
  audio_url: string;
  audio_id: string;
  image_url: string | null;
  duration: number;
  title: string;
}

export interface GenerationOut {
  id: string;
  type: string;
  status: string;
  title: string;
  genre: string | null;
  mood: string | null;
  tempo: string | null;
  vocal: string | null;
  cost_tokens: number;
  rating: "like" | "dislike" | null;
  share_id: string | null;
  share_views: number;
  is_public: boolean;
  published_at: string | null;
  published_track_index: number | null;
  play_count: number;
  like_count: number;
  dislike_count: number;
  tracks: Track[];
  lyrics: string | null;
  wav_url: string | null;
  image_url: string | null;
  published_track_indices: number[] | null;
  error_message: string | null;
  deleted_at: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface HistoryPage {
  items: GenerationOut[];
  total: number;
  page: number;
  limit: number;
}

// ---------------------------------------------------------------------------
// Generate API
// ---------------------------------------------------------------------------

export interface SongParams {
  description: string;
  text_mode?: "ai" | "custom" | "none";
  lyrics?: string;
  genre?: string;
  custom_genre?: string;
  mood?: string;
  tempo?: string;
  vocal?: string;
  agent_prompt?: string;
  agent_music_params?: Record<string, unknown>;
  agent_research_notes?: string;
  /** Echo of agent prompt_version + model — saved to generation.params for A/B telemetry. */
  agent_prompt_version?: string;
  agent_model?: string;
  track_name?: string;
}

export function generateSong(params: SongParams): Promise<GenerateResponse> {
  return apiFetch("/api/v1/generate/song", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export interface InstrumentalParams {
  description?: string;
  genre?: string;
  custom_genre?: string;
  mood?: string;
  tempo?: string;
  agent_prompt?: string;
  agent_music_params?: Record<string, unknown>;
  agent_research_notes?: string;
  /** Echo of agent prompt_version + model — saved to generation.params for A/B telemetry. */
  agent_prompt_version?: string;
  agent_model?: string;
  track_name?: string;
}

export function generateInstrumental(params: InstrumentalParams): Promise<GenerateResponse> {
  return apiFetch("/api/v1/generate/instrumental", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export interface SoundEffectParams {
  prompt: string;
  agent_prompt?: string;
  agent_music_params?: Record<string, unknown>;
  agent_research_notes?: string;
  /** Echo of agent prompt_version + model — saved to generation.params for A/B telemetry. */
  agent_prompt_version?: string;
  agent_model?: string;
  track_name?: string;
}

export function generateSoundEffect(params: SoundEffectParams): Promise<GenerateResponse> {
  return apiFetch("/api/v1/generate/sound_effect", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export interface OccasionParams {
  occasion_type: string;
  track_name?: string;
  answers?: Record<string, string>;
  genre?: string;
  mood?: string;
  vocal?: string;
  agent_prompt?: string;
  agent_music_params?: Record<string, unknown>;
  agent_research_notes?: string;
  /** Echo of agent prompt_version + model — saved to generation.params for A/B telemetry. */
  agent_prompt_version?: string;
  agent_model?: string;
}

export function generateOccasion(params: OccasionParams): Promise<GenerateResponse> {
  return apiFetch("/api/v1/generate/occasion", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export interface CoverSongParams {
  upload_url: string;
  genre?: string;
  custom_genre?: string;
  mood?: string;
  tempo?: string;
  style?: string;
  lyrics?: string;
  vocal_gender?: "m" | "f" | null;
  instrumental?: boolean;
  /** Suno styleWeight (0..1) — how strictly to follow the supplied style. */
  style_weight?: number | null;
  /** Suno weirdnessConstraint (0..1) — creative deviation from the original. */
  weirdness_constraint?: number | null;
  /** ISO code: ru/en/es/fr/de/it/pt/ja/ko/zh. Empty = Suno auto. */
  lyrics_language?: string;
  track_name?: string;
  /** Original uploaded filename — backend seeds the "<name> Cover V{N}" title from it. */
  source_name?: string;
}

export function generateCoverSong(params: CoverSongParams): Promise<GenerateResponse> {
  return apiFetch("/api/v1/generate/cover_song", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function extendTrack(params: {
  generation_id: string;
  audio_id: string;
  prompt?: string;
  style?: string;
  continue_at?: number;
}): Promise<GenerateResponse> {
  return apiFetch("/api/v1/generate/extend", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function generateCoverArt(params: {
  prompt: string;
  model?: string;
  title?: string;
  reference_url?: string;
}): Promise<GenerateResponse> {
  return apiFetch("/api/v1/generate/cover_art", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function convertToWav(params: {
  generation_id: string;
  audio_id: string;
}): Promise<GenerateResponse> {
  return apiFetch("/api/v1/generate/wav_convert", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/** Generate a track that's musically similar to an existing one — used from
 *  the player's bolt menu when listening to someone else's radio track.
 *  Backend reads the source generation's params, applies a light remix,
 *  and launches a fresh song/instrumental. Costs the same as a normal
 *  generation; results land in the user's own library. */
export function generateSimilar(generationId: string): Promise<GenerateResponse> {
  return apiFetch(`/api/v1/generate/similar/${encodeURIComponent(generationId)}`, {
    method: "POST",
  });
}

// ---------------------------------------------------------------------------
// Upload API — presigned URLs for cover song source files
// ---------------------------------------------------------------------------

export interface PresignedUploadResponse {
  upload_url: string;
  public_url: string;
  expires_in: number;
}

export function getCoverUploadUrl(extension = "mp3"): Promise<PresignedUploadResponse> {
  return apiFetch("/api/v1/generate/upload-cover-url", {
    method: "POST",
    body: JSON.stringify({ extension }),
  });
}

export async function uploadCoverFile(file: File): Promise<string> {
  // S3 key encodes the file extension so Suno can sniff format from URL.
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "mp3";
  const { upload_url, public_url } = await getCoverUploadUrl(ext);

  // Upload file directly to S3/MinIO via the presigned URL. We deliberately
  // do NOT set Content-Type — the URL was signed without it, and adding it
  // here would produce a SignatureDoesNotMatch error.
  const uploadResponse = await fetch(upload_url, {
    method: "PUT",
    body: file,
  });
  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text().catch(() => "");
    throw new Error(
      `Upload failed (${uploadResponse.status}): ${errorText || uploadResponse.statusText}`,
    );
  }
  return public_url;
}

// Reference image upload for cover_art (image-to-image flow).
const _COVER_REF_EXTS: ReadonlySet<string> = new Set(["jpg", "jpeg", "png", "webp"]);

export function getCoverRefUploadUrl(extension = "jpg"): Promise<PresignedUploadResponse> {
  return apiFetch("/api/v1/generate/upload-cover-ref-url", {
    method: "POST",
    body: JSON.stringify({ extension }),
  });
}

export async function uploadCoverRefImage(file: File): Promise<string> {
  let ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  if (!_COVER_REF_EXTS.has(ext)) ext = "jpg";
  const { upload_url, public_url } = await getCoverRefUploadUrl(ext);
  const uploadResponse = await fetch(upload_url, { method: "PUT", body: file });
  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text().catch(() => "");
    throw new Error(
      `Upload failed (${uploadResponse.status}): ${errorText || uploadResponse.statusText}`,
    );
  }
  return public_url;
}

// ---------------------------------------------------------------------------
// Lyrics API — Suno generates the text, GPT-4o only enriches the prompt.
// ---------------------------------------------------------------------------

export interface LyricsDraftParams {
  topic: string;
  genre?: string;
  mood?: string;
  tempo?: string;
  vocal?: string;
  language?: string;
  agent_prompt?: string;
  agent_music_params?: Record<string, unknown>;
  agent_research_notes?: string;
  /** Echo of agent prompt_version + model — saved to generation.params for A/B telemetry. */
  agent_prompt_version?: string;
  agent_model?: string;
}

export interface LyricsDraftResponse {
  task_id: string;
  ws_url: string;
}

export type LyricsDraftStatus = "queued" | "processing" | "completed" | "failed";

export interface LyricsDraftResult {
  task_id: string;
  status: LyricsDraftStatus;
  title: string | null;
  lyrics: string | null;
  error: string | null;
}

export function createLyricsDraft(params: LyricsDraftParams): Promise<LyricsDraftResponse> {
  return apiFetch("/api/v1/lyrics", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function fetchLyricsDraft(taskId: string): Promise<LyricsDraftResult> {
  return apiFetch(`/api/v1/lyrics/${taskId}`);
}

// ---------------------------------------------------------------------------
// Agent chat (stateless GPT-4o prompt engineer with clarifying questions)
// ---------------------------------------------------------------------------

export type AgentModuleKind =
  | "song"
  | "instrumental"
  | "cover_song"
  | "sound_effect"
  | "occasion"
  | "cover_art";

export interface AgentIntentParams {
  description?: string;
  text_mode?: "ai" | "custom" | "none";
  lyrics?: string;
  genre?: string;
  custom_genre?: string;
  mood?: string;
  tempo?: string;
  vocal?: string;
  occasion_type?: string;
}

export interface AgentIntent {
  module: AgentModuleKind;
  confidence: "high" | "medium" | "low";
  params: AgentIntentParams;
  note: string;
}

export interface AgentChatMessage {
  role: "agent" | "user";
  content: string;
}

export interface AgentChatRequest {
  module: AgentModuleKind;
  messages: AgentChatMessage[];
  selected_genre?: string;
  selected_mood?: string;
  selected_tempo?: string;
  selected_vocal?: string;
  lang?: "ru" | "en";
}

export interface AgentChatResponse {
  reply: string;
  done: boolean;
  summary: string;
  prompt: string;
  short_prompt?: string;
  music_params: Record<string, unknown>;
  research_notes: string;
  intent: AgentIntent | null;
  suggestions: string[];
  /** A/B-test tag — version of the agent's system prompt that produced
   *  this turn. Echoed back on launch so the backend can stamp it onto
   *  generation.params for later quality analysis. */
  prompt_version?: string;
  /** Which OpenAI model handled this turn (gpt-4o vs gpt-4o-mini). */
  model?: string;
}

export function agentChat(req: AgentChatRequest): Promise<AgentChatResponse> {
  // Auto-attach UI lang so the agent answers in the right language.
  const lang = req.lang ?? (() => {
    try {
      const stored = localStorage.getItem("riffa_lang");
      return stored && stored.startsWith("en") ? "en" : "ru";
    } catch { return "ru"; }
  })();
  return apiFetch("/api/v1/agent/chat", {
    method: "POST",
    body: JSON.stringify({ ...req, lang }),
  });
}

/**
 * SSE-streaming variant of agentChat. Yields `reply` deltas as the model
 * types them, then a final `complete` event with the full structured
 * response. Falls back to the non-streaming endpoint on any transport
 * error so the UI never gets stuck mid-stream.
 */
export type AgentStreamEvent =
  | { type: "reply"; delta: string }
  | { type: "complete"; data: AgentChatResponse }
  | { type: "error"; detail: string };

export async function* streamAgentChat(
  req: AgentChatRequest,
): AsyncGenerator<AgentStreamEvent, void, void> {
  const lang = req.lang ?? (() => {
    try {
      const stored = localStorage.getItem("riffa_lang");
      return stored && stored.startsWith("en") ? "en" : "ru";
    } catch { return "ru"; }
  })();
  const response = await fetch("/api/v1/agent/chat/stream", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...req, lang }),
  });
  if (!response.ok || !response.body) {
    const detail = response.status === 401
      ? "unauthenticated"
      : `stream failed: ${response.status}`;
    yield { type: "error", detail };
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE events are separated by a blank line.
    let sepIdx = buffer.indexOf("\n\n");
    while (sepIdx !== -1) {
      const raw = buffer.slice(0, sepIdx);
      buffer = buffer.slice(sepIdx + 2);
      sepIdx = buffer.indexOf("\n\n");
      let eventName = "message";
      const dataLines: string[] = [];
      for (const line of raw.split("\n")) {
        if (line.startsWith("event: ")) eventName = line.slice(7).trim();
        else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
      }
      const dataStr = dataLines.join("\n");
      if (!dataStr) continue;
      try {
        const parsed = JSON.parse(dataStr) as { delta?: string; detail?: string } & Record<string, unknown>;
        if (eventName === "reply" && typeof parsed.delta === "string") {
          yield { type: "reply", delta: parsed.delta };
        } else if (eventName === "complete") {
          yield { type: "complete", data: parsed as unknown as AgentChatResponse };
        } else if (eventName === "error") {
          yield { type: "error", detail: typeof parsed.detail === "string" ? parsed.detail : "unknown" };
        }
      } catch {
        // Malformed event payload — ignore this event but keep streaming.
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Agent classify — one cheap gpt-4o-mini call that routes the module and
// pre-fills any parameters the user already stated. The scripted wizard
// collects the rest with quick-reply chips (no further GPT). Falls back
// to the streaming /chat flow when this endpoint is unavailable.
// ---------------------------------------------------------------------------

export interface AgentClassifySlots {
  genre: string;
  mood: string;
  tempo: string;
  vocal: string;
  topic: string;
}

export interface AgentReference {
  artist: string;
  title: string;
  bpm: number;
  year: number;
  genre: string;
  tempo: string;
  tags: string[];
}

export interface AgentClassifyResponse {
  module: AgentModuleKind;
  slots: AgentClassifySlots;
  needs_lyrics: boolean;
  artist_ref: boolean;
  obscure_genre: boolean;
  too_vague: boolean;
  /** Reference-track enrichment (Deezer): real BPM/genre/era when the user
   *  points at an existing track. `reference` is null when nothing matched. */
  era: string;
  suggested_bpm: string;
  reference: AgentReference | null;
  model: string;
}

export function classifyAgent(
  req: { message: string; module_hint: AgentModuleKind },
): Promise<AgentClassifyResponse> {
  return apiFetch("/api/v1/agent/classify", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

// ---------------------------------------------------------------------------
// History API
// ---------------------------------------------------------------------------

export function fetchHistory(
  params: { type?: string; mood?: string; status?: string; page?: number; limit?: number } = {},
): Promise<HistoryPage> {
  const q = new URLSearchParams();
  if (params.type) q.set("type", params.type);
  if (params.mood) q.set("mood", params.mood);
  if (params.status) q.set("status", params.status);
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return apiFetch(`/api/v1/history${qs ? `?${qs}` : ""}`);
}

export function fetchGeneration(id: string): Promise<GenerationOut> {
  return apiFetch(`/api/v1/history/${id}`);
}

export function deleteGeneration(id: string, trackIndex?: number | null): Promise<void> {
  const qs = trackIndex !== null && trackIndex !== undefined ? `?track_index=${trackIndex}` : "";
  return apiFetch(`/api/v1/history/${id}${qs}`, { method: "DELETE" });
}

export function restoreGeneration(id: string): Promise<void> {
  return apiFetch(`/api/v1/history/${id}/restore`, { method: "POST" });
}

export function fetchTrash(page?: number): Promise<HistoryPage> {
  return apiFetch(`/api/v1/history/trash${page && page > 1 ? `?page=${page}` : ""}`);
}

export function purgeTrash(): Promise<void> {
  return apiFetch("/api/v1/history/trash/purge", { method: "DELETE" });
}

export function rateGeneration(
  id: string,
  rating: "like" | "dislike" | "remove",
): Promise<void> {
  return apiFetch(`/api/v1/history/${id}/rating`, {
    method: "POST",
    body: JSON.stringify({ rating }),
  });
}

export function renameGeneration(
  id: string,
  title: string,
  trackIndex?: number | null,
): Promise<unknown> {
  return apiFetch(`/api/v1/history/${id}/title`, {
    method: "PATCH",
    body: JSON.stringify({
      title,
      track_index: trackIndex ?? null,
    }),
  });
}

export function updateGenerationTags(
  id: string,
  tags: { genre?: string; mood?: string; tempo?: string },
): Promise<unknown> {
  return apiFetch(`/api/v1/history/${id}/tags`, {
    method: "PATCH",
    body: JSON.stringify(tags),
  });
}

export function shareGeneration(id: string): Promise<{ share_id: string; share_url: string }> {
  return apiFetch(`/api/v1/history/${id}/share`, { method: "POST" });
}

export function unshareGeneration(id: string): Promise<void> {
  return apiFetch(`/api/v1/history/${id}/share`, { method: "DELETE" });
}

export interface RadioToggleResponse {
  id: string;
  is_public: boolean;
  published_at: string | null;
  published_track_index: number | null;
}

export function toggleHistoryRadio(
  id: string,
  isPublic: boolean,
  trackIndex: number | null = null,
): Promise<RadioToggleResponse> {
  // ``track_index`` is required for multi-variant generations: the radio
  // button is per-track (V1 / V2) — clicking V1 must publish V1 only and
  // not the other variant. Backend validates the index against the result
  // tracks list and rejects out-of-range values.
  const body: Record<string, unknown> = { is_public: isPublic };
  if (trackIndex !== null) {
    body.track_index = trackIndex;
  }
  return apiFetch(`/api/v1/history/${id}/radio`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Public Radio API
// ---------------------------------------------------------------------------

export type RadioKind = "song" | "instrumental" | "cover";
export type RadioPeriod = "today" | "week" | "month" | "all";
export type RadioSort = "recent" | "score" | "plays";
export type RadioVote = "like" | "dislike" | null;

export interface RadioTrackOut {
  id: string;
  track_index: number;
  kind: RadioKind;
  title: string;
  author: string;
  genre: string | null;
  mood: string | null;
  tempo: string | null;
  vocal: string | null;
  audio_url: string;
  image_url: string | null;
  duration: number;
  play_count: number;
  like_count: number;
  dislike_count: number;
  score: number;
  my_vote: RadioVote;
  published_at: string;
  is_own: boolean;
}

export interface RadioListResponse {
  items: RadioTrackOut[];
  total: number;
  page: number;
  limit: number;
}

export interface RadioStats {
  total_tracks: number;
  total_plays: number;
  total_likes: number;
  today_tracks: number;
  today_plays: number;
}

export interface RadioListParams {
  mood?: string;
  genre?: string;
  vocal?: "vocal" | "instrumental";
  period?: RadioPeriod;
  sort?: RadioSort;
  page?: number;
  limit?: number;
}

export function fetchRadio(params: RadioListParams = {}): Promise<RadioListResponse> {
  const q = new URLSearchParams();
  if (params.mood) q.set("mood", params.mood);
  if (params.genre) q.set("genre", params.genre);
  if (params.vocal) q.set("vocal", params.vocal);
  if (params.period) q.set("period", params.period);
  if (params.sort) q.set("sort", params.sort);
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return apiFetch(`/api/v1/radio${qs ? `?${qs}` : ""}`);
}

export function fetchRadioStats(): Promise<RadioStats> {
  return apiFetch("/api/v1/radio/stats");
}

export interface RadioMoodCounts {
  counts: Record<string, number>;
  total: number;
  vocal: number;
  instrumental: number;
}

export function fetchRadioMoodCounts(): Promise<RadioMoodCounts> {
  return apiFetch("/api/v1/radio/mood-counts");
}

export function fetchMyRadioCollection(
  params: { page?: number; limit?: number } = {},
): Promise<RadioListResponse> {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.limit) q.set("limit", String(params.limit));
  const qs = q.toString();
  return apiFetch(`/api/v1/radio/me/collection${qs ? `?${qs}` : ""}`);
}

export interface RadioVoteResponse {
  my_vote: RadioVote;
  like_count: number;
  dislike_count: number;
}

export function voteRadioTrack(
  id: string,
  rating: "like" | "dislike" | "remove",
  trackIndex: number = 0,
): Promise<RadioVoteResponse> {
  return apiFetch(`/api/v1/radio/${id}/vote`, {
    method: "POST",
    body: JSON.stringify({ rating, track_index: trackIndex }),
  });
}

export function recordRadioPlay(id: string, trackIndex: number = 0): Promise<void> {
  return apiFetch(`/api/v1/radio/${id}/play`, {
    method: "POST",
    body: JSON.stringify({ track_index: trackIndex }),
  });
}

/** Admin-only: remove a track from public Radio. */
export function adminUnpublishRadioTrack(id: string): Promise<void> {
  return apiFetch(`/api/v1/radio/${id}/admin`, { method: "DELETE" });
}

/** Admin-only: manually reassign mood and/or vocal flag for a Radio track. */
export function adminClassifyRadioTrack(
  id: string,
  body: { mood?: string | null; has_vocals?: boolean | null },
): Promise<{ id: string; mood: string | null; vocal: string | null }> {
  return apiFetch(`/api/v1/radio/${id}/admin/classify`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Public share
// ---------------------------------------------------------------------------

export interface PublicGenerationOut {
  share_id: string;
  title: string;
  type: string;
  genre: string | null;
  mood: string | null;
  share_views: number;
  tracks: Track[];
  lyrics: string | null;
  created_at: string;
}

export function fetchSharedGeneration(
  shareId: string,
  variant?: number | null,
): Promise<PublicGenerationOut> {
  const qs = variant !== undefined && variant !== null ? `?v=${variant}` : "";
  return apiFetch(`/api/v1/share/${shareId}${qs}`);
}

// ---------------------------------------------------------------------------
// Track utilities (auto-title + tagged download)
// ---------------------------------------------------------------------------

export interface AutoTitleResponse {
  track_name: string;
  artist: string;
  short_title: string;
}

export function requestAutoTitle(idea: string, artist?: string): Promise<AutoTitleResponse> {
  return apiFetch("/api/v1/tracks/auto-title", {
    method: "POST",
    body: JSON.stringify({ idea, artist: artist ?? "" }),
  });
}

/** Same-origin URL of the ID3-tagged Suno mp3 proxy. */
export function trackDownloadUrl(generationId: string, trackIndex: number): string {
  return `/api/v1/tracks/${encodeURIComponent(generationId)}/${trackIndex}/download`;
}

// ---------------------------------------------------------------------------
// Generation WebSocket helper
// ---------------------------------------------------------------------------

export type ProgressEvent =
  | { status: "processing"; step?: string; poll?: number; elapsed?: number }
  | { status: "completed"; result: Record<string, unknown> }
  | { status: "failed"; error: string };

export function openGenerationSocket(
  wsUrl: string,
  onMessage: (event: ProgressEvent) => void,
  onClose?: () => void,
): WebSocket {
  let retries = 0;
  const maxRetries = 5;
  let terminated = false;

  function connect(): WebSocket {
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data as string) as ProgressEvent;
        retries = 0;
        onMessage(data);
        if (data.status === "completed" || data.status === "failed") {
          terminated = true;
        }
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      if (terminated) {
        onClose?.();
        return;
      }
      if (retries < maxRetries) {
        retries++;
        setTimeout(() => {
          if (!terminated) {
            const newWs = connect();
            Object.assign(ws, { _reconnected: newWs });
          }
        }, Math.min(1000 * retries, 5000));
      } else {
        onClose?.();
      }
    };
    ws.onerror = () => {
      // onerror always fires before onclose; let onclose handle retry
    };
    return ws;
  }

  return connect();
}

/** Fetch active and recently completed generations from the server.
 *  Used on app startup to sync sidebar state across devices/sessions. */
export async function fetchActiveGenerations(): Promise<
  Array<{
    id: string;
    type: string;
    title: string;
    status: string;
    progress: number;
    step: string | null;
    error: string | null;
    result: Record<string, unknown> | null;
  }>
> {
  const list = await apiFetch<
    Array<{
      id: string;
      type: string;
      title: string;
      status: string;
      progress: number;
      step: string | null;
      error: string | null;
      result: Record<string, unknown> | null;
    }>
  >("/api/v1/generate/active");
  return list ?? [];
}


/** Poll generation status via HTTP (fallback when WS is unreliable). */
export function pollGenerationStatus(
  generationId: string,
  onUpdate: (event: ProgressEvent) => void,
  intervalMs = 3000,
): { stop: () => void } {
  let active = true;
  async function tick() {
    if (!active) return;
    try {
      const gen = await apiFetch<{
        status: string;
        result?: Record<string, unknown>;
        error_message?: string;
        tracks?: Array<Record<string, unknown>>;
      }>(`/api/v1/history/${generationId}`);
      if (!active) return;
      if (gen.status === "completed") {
        onUpdate({ status: "completed", result: gen.result ?? { tracks: gen.tracks } });
        active = false;
        return;
      }
      if (gen.status === "failed") {
        onUpdate({ status: "failed", error: gen.error_message ?? ((i18next.resolvedLanguage ?? "ru").startsWith("en") ? "Generation failed" : "Ошибка генерации") });
        active = false;
        return;
      }
      onUpdate({ status: "processing", step: "generating" });
    } catch {
      // API error — keep polling
    }
    if (active) setTimeout(tick, intervalMs);
  }
  setTimeout(tick, intervalMs);
  return { stop: () => { active = false; } };
}

// ── Reviews ─────────────────────────────────────────────────────
export interface ReviewItem {
  id: number;
  rating: number;
  text: string;
  author: string;
  created_at: string;
}

export function fetchReviews(limit = 20): Promise<{ items: ReviewItem[] }> {
  return apiFetch(`/api/v1/reviews?limit=${limit}`);
}

export function postReview(rating: number, text: string): Promise<ReviewItem> {
  return apiFetch("/api/v1/reviews", {
    method: "POST",
    body: JSON.stringify({ rating, text }),
  });
}
