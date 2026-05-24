export type ChutesChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChutesClientOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
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

  constructor(options: ChutesClientOptions = {}) {
    const apiKey = options.apiKey ?? readLocalEnvValue("CHUTES_API_KEY");
    if (!apiKey) {
      throw new Error("CHUTES_API_KEY is required to run AI extraction.");
    }

    this.apiKey = apiKey;
    this.baseUrl = options.baseUrl ?? readLocalEnvValue("CHUTES_BASE_URL") ?? "https://llm.chutes.ai/v1";
    this.model = options.model ?? readLocalEnvValue("CHUTES_MODEL") ?? "default:latency";
  }

  async chat(options: ChutesChatOptions): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey
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
      throw new Error(`Chutes request failed with ${response.status}: ${text.slice(0, 500)}`);
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
