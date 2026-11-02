import type { Logger } from '../lib/logger.js';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Resend tag for analytics ("reminder", "verify-email", ...). */
  tag?: string;
}

export interface Mailer {
  send(message: EmailMessage): Promise<{ id: string }>;
}

/** Thrown for failures worth retrying (network, 429, 5xx). */
export class TransientEmailError extends Error {}

/** Resend HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage): Promise<{ id: string }> {
    let res: Response;
    try {
      res = await this.fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          tags: message.tag ? [{ name: 'category', value: message.tag }] : undefined,
        }),
      });
    } catch (err) {
      throw new TransientEmailError(`Resend unreachable: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (res.status === 429 || res.status >= 500) {
      throw new TransientEmailError(`Resend ${res.status}`);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Resend rejected the email (${res.status}): ${body.slice(0, 300)}`);
    }
    const body = (await res.json()) as { id?: string };
    return { id: body.id ?? 'unknown' };
  }
}

/** Development: write emails to the log instead of sending them. */
export class LogMailer implements Mailer {
  constructor(private readonly logger: Logger) {}
  async send(message: EmailMessage): Promise<{ id: string }> {
    this.logger.info({ to: message.to, subject: message.subject }, `📧 [dev email]\n${message.text}`);
    return { id: `log-${Date.now()}` };
  }
}

/** Tests: keep sent messages in memory. */
export class MemoryMailer implements Mailer {
  readonly sent: EmailMessage[] = [];
  failNext = 0;
  async send(message: EmailMessage): Promise<{ id: string }> {
    if (this.failNext > 0) {
      this.failNext--;
      throw new TransientEmailError('simulated failure');
    }
    this.sent.push(message);
    return { id: `mem-${this.sent.length}` };
  }
  lastTo(email: string): EmailMessage | undefined {
    return [...this.sent].reverse().find((m) => m.to === email);
  }
}
