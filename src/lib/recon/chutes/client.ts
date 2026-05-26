export type ChutesChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmProvider = "chutes" | "nvidia" | "morpheus";

export type ChutesClientOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  provider?: LlmProvider;
  /** Total attempts per chat call, including the first. Defaults to 4. */
  maxAttempts?: number;
  /** Base delay (ms) for exponential backoff between retries. Defaults to 600. */
  retryBaseDelayMs?: number;
};

type ProviderConfig = {
  keyEnv: string;
  baseUrlEnv: string;
  modelEnv: string;
  defaultBaseUrl: string;
  defaultModel: string;
  auth: "bearer" | "x-api-key";
};

// Per-provider wiring. All three speak the OpenAI chat-completions shape; they
// differ only in base URL, default model, env var names, and auth header.
const PROVIDER_CONFIG: Record<LlmProvider, ProviderConfig> = {
  chutes: {
    keyEnv: "CHUTES_API_KEY",
    baseUrlEnv: "CHUTES_BASE_URL",
    modelEnv: "CHUTES_MODEL",
    defaultBaseUrl: "https://llm.chutes.ai/v1",
    defaultModel: "default:latency",
    auth: "x-api-key"
  },
  nvidia: {
    keyEnv: "NVIDIA_API_KEY",
    baseUrlEnv: "NVIDIA_BASE_URL",
    modelEnv: "NVIDIA_MODEL",
    defaultBaseUrl: "https://integrate.api.nvidia.com/v1",
    defaultModel: "meta/llama-3.3-70b-instruct",
    auth: "bearer"
  },
  morpheus: {
    keyEnv: "MORPHEUS_API_KEY",
    baseUrlEnv: "MORPHEUS_BASE_URL",
    modelEnv: "MORPHEUS_MODEL",
    defaultBaseUrl: "https://api.mor.org/api/v1",
    defaultModel: "llama-3.3-70b",
    auth: "bearer"
  }
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

// Pick a provider from whichever key is configured when LLM_PROVIDER is unset.
// Preference order: morpheus, then chutes, then nvidia — so commenting out the
// MORPHEUS_API_KEY automatically falls back to a previously-configured provider.
function detectProvider(): LlmProvider {
  if (readLocalEnvValue("MORPHEUS_API_KEY")) return "morpheus";
  if (readLocalEnvValue("CHUTES_API_KEY") && !readLocalEnvValue("NVIDIA_API_KEY")) return "chutes";
  return "nvidia";
}

export class ChutesClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly provider: LlmProvider;
  private readonly auth: "bearer" | "x-api-key";
  private readonly maxAttempts: number;
  private readonly retryBaseDelayMs: number;

  constructor(options: ChutesClientOptions = {}) {
    const provider =
      options.provider ?? (readLocalEnvValue("LLM_PROVIDER") as LlmProvider | undefined) ?? detectProvider();

    const config = PROVIDER_CONFIG[provider];

    const apiKey = options.apiKey ?? readLocalEnvValue(config.keyEnv);
    if (!apiKey) {
      throw new Error(
        `${config.keyEnv} is required to run AI extraction with ${provider}. Set LLM_PROVIDER=${provider} and ${config.keyEnv} in .env.local, then restart the dev server.`
      );
    }

    this.provider = provider;
    this.auth = config.auth;
    this.apiKey = apiKey;
    this.baseUrl = options.baseUrl ?? readLocalEnvValue(config.baseUrlEnv) ?? config.defaultBaseUrl;
    this.model = options.model ?? readLocalEnvValue(config.modelEnv) ?? config.defaultModel;

    const envAttempts = Number(readLocalEnvValue("LLM_MAX_ATTEMPTS"));
    this.maxAttempts = Math.max(1, options.maxAttempts ?? (Number.isFinite(envAttempts) && envAttempts > 0 ? envAttempts : 6));
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
      this.auth === "bearer"
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
      const timeout = setTimeout(() => abortController.abort(), options.timeoutMs ?? 60_000);
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
