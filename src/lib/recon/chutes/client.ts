export type ChutesChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChutesClientOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  provider?: "chutes" | "nvidia";
};

export type ChutesChatOptions = {
  messages: ChutesChatMessage[];
  temperature?: number;
  maxTokens?: number;
};

function readLocalEnvValue(name: string): string | undefined {
  return process.env[name];
}

export class ChutesClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly provider: "chutes" | "nvidia";

  constructor(options: ChutesClientOptions = {}) {
    const provider =
      options.provider ??
      (readLocalEnvValue("LLM_PROVIDER") as "chutes" | "nvidia" | undefined) ??
      (readLocalEnvValue("NVIDIA_API_KEY") && !readLocalEnvValue("CHUTES_API_KEY") ? "nvidia" : "chutes");

    const apiKey =
      options.apiKey ??
      (provider === "nvidia" ? readLocalEnvValue("NVIDIA_API_KEY") : readLocalEnvValue("CHUTES_API_KEY"));
    if (!apiKey) {
      throw new Error(
        provider === "nvidia"
          ? "NVIDIA_API_KEY is required to run AI extraction with NVIDIA."
          : "CHUTES_API_KEY is required to run AI extraction with Chutes."
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
  }

  async chat(options: ChutesChatOptions): Promise<string> {
    const authHeader =
      this.provider === "nvidia"
        ? { Authorization: `Bearer ${this.apiKey}` }
        : { "X-API-Key": this.apiKey };

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader
      },
      body: JSON.stringify({
        model: this.model,
        messages: options.messages,
        temperature: options.temperature ?? 0,
        max_tokens: options.maxTokens ?? 1600
      })
    });

    const text = await response.text();
    if (!response.ok) {
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
}
