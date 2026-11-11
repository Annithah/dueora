import { GoogleGenAI, type Content, type FunctionDeclaration } from '@google/genai';

/**
 * The language model behind DueOra AI, behind a small interface so the rest of the code
 * (and the tests) don't depend on one vendor. Production: Google Gemini through
 * `@google/genai`, called from the backend only — the key never reaches the app.
 */
export type Turn =
  | { role: 'user'; text: string }
  | { role: 'model'; text?: string; calls?: ToolCall[] }
  | { role: 'tool'; results: { name: string; response: unknown }[] };

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface ModelRequest {
  system: string;
  turns: Turn[];
  tools: FunctionDeclaration[];
}

export type ModelChunk = { text: string } | { call: ToolCall } | { usage: { input: number; output: number } };

export interface AiModel {
  readonly name: string;
  stream(req: ModelRequest): AsyncIterable<ModelChunk>;
  /** One-shot text (insight card, weekly line). */
  complete(system: string, prompt: string): Promise<{ text: string; usage: { input: number; output: number } }>;
}

/** Raised for any provider failure; the app shows the friendly "resting" message. */
export class AiUnavailableError extends Error {}

function toContents(turns: Turn[]): Content[] {
  return turns.map((t): Content => {
    if (t.role === 'user') return { role: 'user', parts: [{ text: t.text }] };
    if (t.role === 'tool') return { role: 'user', parts: t.results.map((r) => ({ functionResponse: { name: r.name, response: { result: r.response } } })) };
    return {
      role: 'model',
      parts: [...(t.text ? [{ text: t.text }] : []), ...(t.calls ?? []).map((c) => ({ functionCall: { name: c.name, args: c.args } }))],
    };
  });
}

export class GeminiModel implements AiModel {
  private readonly client: GoogleGenAI;
  constructor(
    apiKey: string,
    readonly name: string,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async *stream(req: ModelRequest): AsyncIterable<ModelChunk> {
    let stream;
    try {
      stream = await this.client.models.generateContentStream({
        model: this.name,
        contents: toContents(req.turns),
        config: {
          systemInstruction: req.system,
          tools: req.tools.length ? [{ functionDeclarations: req.tools }] : undefined,
          temperature: 0.3,
        },
      });
    } catch (err) {
      throw new AiUnavailableError(err instanceof Error ? err.message : String(err));
    }
    let usage = { input: 0, output: 0 };
    try {
      for await (const chunk of stream) {
        if (chunk.text) yield { text: chunk.text };
        for (const fc of chunk.functionCalls ?? []) {
          if (fc.name) yield { call: { name: fc.name, args: (fc.args ?? {}) as Record<string, unknown> } };
        }
        if (chunk.usageMetadata) {
          usage = { input: chunk.usageMetadata.promptTokenCount ?? usage.input, output: chunk.usageMetadata.candidatesTokenCount ?? usage.output };
        }
      }
    } catch (err) {
      throw new AiUnavailableError(err instanceof Error ? err.message : String(err));
    }
    yield { usage };
  }

  async complete(system: string, prompt: string) {
    try {
      const res = await this.client.models.generateContent({
        model: this.name,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { systemInstruction: system, temperature: 0.4 },
      });
      return {
        text: (res.text ?? '').trim(),
        usage: { input: res.usageMetadata?.promptTokenCount ?? 0, output: res.usageMetadata?.candidatesTokenCount ?? 0 },
      };
    } catch (err) {
      throw new AiUnavailableError(err instanceof Error ? err.message : String(err));
    }
  }
}

/**
 * Deterministic stand-in for tests and evaluations: `script(request)` decides what the
 * "model" says or which tools it calls, so the whole pipeline (tools, permissions,
 * confirmations, isolation, key safety) is exercised without a network call.
 */
export class ScriptedModel implements AiModel {
  readonly name = 'scripted';
  readonly requests: ModelRequest[] = [];
  constructor(private readonly script: (req: ModelRequest) => { text?: string; calls?: ToolCall[] } | Promise<{ text?: string; calls?: ToolCall[] }>) {}

  async *stream(req: ModelRequest): AsyncIterable<ModelChunk> {
    this.requests.push(structuredClone(req));
    const out = await this.script(req);
    if (out.text) for (const word of out.text.split(/(?<= )/)) yield { text: word };
    for (const call of out.calls ?? []) yield { call };
    yield { usage: { input: 100, output: 20 } };
  }

  async complete(system: string, prompt: string) {
    const out = await this.script({ system, turns: [{ role: 'user', text: prompt }], tools: [] });
    return { text: out.text ?? '', usage: { input: 50, output: 10 } };
  }
}

export function createModel(env: { GEMINI_API_KEY?: string; GEMINI_MODEL: string }): AiModel | null {
  return env.GEMINI_API_KEY ? new GeminiModel(env.GEMINI_API_KEY, env.GEMINI_MODEL) : null;
}
