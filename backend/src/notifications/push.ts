import { Expo, type ExpoPushMessage, type ExpoPushReceipt, type ExpoPushTicket } from 'expo-server-sdk';

export type PushMessage = ExpoPushMessage & { to: string };
export type PushTicket = ExpoPushTicket;
export type PushReceipt = ExpoPushReceipt;

/** Thrown when Expo can't be reached or asks us to slow down; the job queue retries. */
export class TransientPushError extends Error {}

export interface PushProvider {
  isValidToken(token: string): boolean;
  /** One ticket per message, in order. */
  send(messages: PushMessage[]): Promise<PushTicket[]>;
  receipts(ticketIds: string[]): Promise<Record<string, PushReceipt>>;
}

/** Expo push service via expo-server-sdk (chunking + Expo's own retry for 429s). */
export class ExpoPushProvider implements PushProvider {
  private readonly expo: Expo;
  constructor(accessToken?: string) {
    this.expo = new Expo(accessToken ? { accessToken } : {});
  }

  isValidToken(token: string): boolean {
    return Expo.isExpoPushToken(token);
  }

  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    const tickets: PushTicket[] = [];
    for (const chunk of this.expo.chunkPushNotifications(messages)) {
      try {
        tickets.push(...(await this.expo.sendPushNotificationsAsync(chunk)));
      } catch (err) {
        throw new TransientPushError(`Expo push request failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return tickets;
  }

  async receipts(ticketIds: string[]): Promise<Record<string, PushReceipt>> {
    const all: Record<string, PushReceipt> = {};
    for (const chunk of this.expo.chunkPushNotificationReceiptIds(ticketIds)) {
      try {
        Object.assign(all, await this.expo.getPushNotificationReceiptsAsync(chunk));
      } catch (err) {
        throw new TransientPushError(`Expo receipts request failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return all;
  }
}

/** Test double: records messages, lets tests script failures and receipts. */
export class FakePushProvider implements PushProvider {
  readonly sent: PushMessage[] = [];
  /** Tokens Expo would report as DeviceNotRegistered. */
  readonly unregistered = new Set<string>();
  /** Number of upcoming send() calls that throw a transient error. */
  failNext = 0;
  /** Receipt overrides by ticket id. */
  readonly receiptOverrides = new Map<string, PushReceipt>();
  private nextId = 1;
  private readonly ticketToken = new Map<string, string>();

  isValidToken(token: string): boolean {
    return /^Expo(nent)?PushToken\[.+\]$/.test(token);
  }

  async send(messages: PushMessage[]): Promise<PushTicket[]> {
    if (this.failNext > 0) {
      this.failNext--;
      throw new TransientPushError('simulated network failure');
    }
    return messages.map((m) => {
      if (this.unregistered.has(m.to)) {
        return { status: 'error', message: `${m.to} is not registered`, details: { error: 'DeviceNotRegistered', expoPushToken: m.to } };
      }
      this.sent.push(m);
      const id = `ticket-${this.nextId++}`;
      this.ticketToken.set(id, m.to);
      return { status: 'ok', id };
    });
  }

  async receipts(ticketIds: string[]): Promise<Record<string, PushReceipt>> {
    return Object.fromEntries(
      ticketIds.map((id) => [id, this.receiptOverrides.get(id) ?? ({ status: 'ok' } as PushReceipt)]),
    );
  }

  /** Messages sent to a token (or all). */
  to(token?: string): PushMessage[] {
    return token ? this.sent.filter((m) => m.to === token) : this.sent;
  }
}
