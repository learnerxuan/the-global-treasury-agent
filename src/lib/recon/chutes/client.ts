export type ChutesChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChutesClientOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  provider?: "chutes" | "nvidia";
  /** Total attempts per chat call, including the first. Defaults to 4. */
  maxAttempts?: number;
  /** Base delay (ms) for exponential backoff between retries. Defaults to 600. */
  retryBaseDelayMs?: number;
};

export type ChutesChatOptions = {
  messages: ChutesChatMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: "json_object" };
  timeoutMs?: number;
};

// Transient HTTP statuses worth retrying. 429 = rate limited (the common one for
// shared keys when extracting many files); 5xx = provider hiccups.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function readLocalEnvValue(name: string): string | undefined {
  return process.env[name];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ChutesClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly provider: "chutes" | "nvidia";
  private readonly maxAttempts: number;
  private readonly retryBaseDelayMs: number;

  constructor(options: ChutesClientOptions = {}) {
    const provider =
      options.provider ??
      (readLocalEnvValue("LLM_PROVIDER") as "chutes" | "nvidia" | undefined) ??
      (readLocalEnvValue("CHUTES_API_KEY") && !readLocalEnvValue("NVIDIA_API_KEY") ? "chutes" : "nvidia");

    const apiKey =
      options.apiKey ??
      (provider === "nvidia" ? readLocalEnvValue("NVIDIA_API_KEY") : readLocalEnvValue("CHUTES_API_KEY"));
    if (!apiKey) {
      throw new Error(
        provider === "nvidia"
          ? "NVIDIA_API_KEY is required to run AI extraction with NVIDIA. Set LLM_PROVIDER=nvidia and NVIDIA_API_KEY in .env.local, then restart the dev server."
          : "CHUTES_API_KEY is required to run AI extraction with Chutes. Set LLM_PROVIDER=chutes and CHUTES_API_KEY in .env.local, then restart the dev server."
      );
    }

    this.provider = provider;
    this.apiKey = apiKey;
    this.baseUrl =
      options.baseUrl ??
      (provider === "nvidia"
        ? readLocalEnvValue("NVIDIA_BASE_URL") ?? "https://integrate.api.nvidia.com/v1"
        : readLocalEnvValue("CHUTES_BASE_URL") ?? "https://llm.chutes.ai/v1");
    this.model =
      options.model ??
      (provider === "nvidia"
        ? readLocalEnvValue("NVIDIA_MODEL") ?? "meta/llama-3.3-70b-instruct"
        : readLocalEnvValue("CHUTES_MODEL") ?? "default:latency");

    const envAttempts = Number(readLocalEnvValue("LLM_MAX_ATTEMPTS"));
    this.maxAttempts = Math.max(1, options.maxAttempts ?? (Number.isFinite(envAttempts) && envAttempts > 0 ? envAttempts : 4));
    this.retryBaseDelayMs = Math.max(0, options.retryBaseDelayMs ?? 2000);
  }

  private backoffMs(attempt: number, retryAfterHeader: string | null): number {
    // Honor a provider-supplied Retry-After (seconds) when present.
    if (retryAfterHeader) {
      const seconds = Number(retryAfterHeader);
      if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 15000);
    }
    const exponential = this.retryBaseDelayMs * 2 ** (attempt - 1);
    const jitter = Math.random() * this.retryBaseDelayMs;
    return Math.min(exponential + jitter, 15000);
  }

  async chat(options: ChutesChatOptions): Promise<string> {
    const authHeader =
      this.provider === "nvidia"
        ? { Authorization: `Bearer ${this.apiKey}` }
        : { "X-API-Key": this.apiKey };

    const requestBody = JSON.stringify({
      model: this.model,
      messages: options.messages,
      temperature: options.temperature ?? 0,
      max_tokens: options.maxTokens ?? 1600,
      ...(options.responseFormat ? { response_format: options.responseFormat } : {})
    });

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      let response: Response;
      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), options.timeoutMs ?? 30_000);
      try {
        response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: requestBody,
          signal: abortController.signal
        });
      } catch (networkError) {
        // Network/DNS/connection/timeout error — retry.
        lastError = new Error(
          `${this.provider} request failed (network): ${networkError instanceof Error ? networkError.message : "unknown error"}`
        );
        if (attempt < this.maxAttempts) {
          await sleep(this.backoffMs(attempt, null));
          continue;
        }
        throw lastError;
      } finally {
        clearTimeout(timeout);
      }

      const text = await response.text();

      if (!response.ok) {
        if (RETRYABLE_STATUS.has(response.status) && attempt < this.maxAttempts) {
          lastError = new Error(`${this.provider} request failed with ${response.status}: ${text.slice(0, 500)}`);
          await sleep(this.backoffMs(attempt, response.headers.get("retry-after")));
          continue;
        }
        // Non-retryable status (e.g. 400/401/403) or final attempt — fail loudly.
        throw new Error(`${this.provider} request failed with ${response.status}: ${text.slice(0, 500)}`);
      }

      const parsed = JSON.parse(text) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content = parsed.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.trim().length === 0) {
        throw new Error("Chutes response did not include message content.");
      }

      return content.trim();
    }

    // Loop exhausted retries on a transient failure.
    throw lastError ?? new Error(`${this.provider} request failed after ${this.maxAttempts} attempts.`);
  }
}
