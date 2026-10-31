export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMCompletionOptions {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
}

/**
 * Universal interface for LLM backends (Gemini, OpenAI, Anthropic, Ollama)
 */
export interface ILLMProvider {
  name: string;
  generateText(prompt: string, systemPrompt?: string): Promise<string>;
  chat(options: LLMCompletionOptions): Promise<string>;
}

/**
 * Native Google Gemini Provider (compatible with GitHub Actions GEMINI_API_KEY)
 */
export class GeminiLLMProvider implements ILLMProvider {
  public name = 'google-gemini';
  private apiKey: string;
  private model: string;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';

  constructor(options: { apiKey?: string; model?: string } = {}) {
    this.apiKey = options.apiKey || process.env.GEMINI_API_KEY || '';
    this.model = options.model || 'gemini-1.5-flash';
  }

  public async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('[GeminiLLMProvider] GEMINI_API_KEY environment variable is not configured.');
    }

    const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;

    const contents: any[] = [];
    if (systemPrompt) {
      contents.push({ role: 'user', parts: [{ text: `SYSTEM INSTRUCTIONS:\n${systemPrompt}` }] });
      contents.push({ role: 'model', parts: [{ text: 'Understood. I will follow these instructions.' }] });
    }
    contents.push({ role: 'user', parts: [{ text: prompt }] });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${err}`);
    }

    const data: any = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  public async chat(options: LLMCompletionOptions): Promise<string> {
    const systemMsg = options.messages.find((m) => m.role === 'system')?.content;
    const userPrompts = options.messages
      .filter((m) => m.role !== 'system')
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');

    return this.generateText(userPrompts, systemMsg);
  }
}

/**
 * Universal OpenAI / OpenRouter / Ollama Compatible Provider
 */
export class OpenAiCompatibleLLMProvider implements ILLMProvider {
  public name: string;
  private apiKey: string;
  private endpoint: string;
  private model: string;

  constructor(options: {
    name?: string;
    apiKey?: string;
    endpoint?: string;
    model?: string;
  } = {}) {
    this.name = options.name || 'openai-compatible';
    this.apiKey = options.apiKey || process.env.OPENAI_API_KEY || '';
    this.endpoint = options.endpoint || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions';
    this.model = options.model || 'gpt-4o-mini';
  }

  public async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: LLMMessage[] = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    return this.chat({ messages });
  }

  public async chat(options: LLMCompletionOptions): Promise<string> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: options.messages,
        temperature: options.temperature ?? 0.3,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`LLM provider request failed (${response.status}): ${err}`);
    }

    const json: any = await response.json();
    return json.choices?.[0]?.message?.content || '';
  }
}
