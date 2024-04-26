import { FIFO } from "../../../deps.ts";
import { IS_ALFIE, IS_BETTY, SyncRole, Transport } from "../types.ts";

const TRANSPORT_CLOSED = Symbol("transport_closed");

export class TransportInMemory implements Transport {
  private incoming: FIFO<Uint8Array | typeof TRANSPORT_CLOSED>;
  private outgoing: FIFO<Uint8Array | typeof TRANSPORT_CLOSED>;
  private closed = false;

  role: SyncRole;

  constructor(
    syncRole: SyncRole,
    incoming: FIFO<Uint8Array | typeof TRANSPORT_CLOSED>,
    outgoing: FIFO<Uint8Array | typeof TRANSPORT_CLOSED>,
  ) {
    this.role = syncRole;
    this.incoming = incoming;
    this.outgoing = outgoing;
  }

  send(bytes: Uint8Array): Promise<void> {
    if (!this.closed) {
      this.outgoing.push(bytes);
    }

    return Promise.resolve();
  }

  async *[Symbol.asyncIterator]() {
    for await (const msg of this.incoming) {
      if (msg === TRANSPORT_CLOSED) {
        break;
      }

      yield msg;
    }
  }

  close(): void {
    this.closed = true;
    this.incoming.push(TRANSPORT_CLOSED);
  }

  get isClosed() {
    return this.closed;
  }
}

export function transportPairInMemory(): [
  TransportInMemory,
  TransportInMemory,
] {
  const alfie = new FIFO<Uint8Array | typeof TRANSPORT_CLOSED>();
  const betty = new FIFO<Uint8Array | typeof TRANSPORT_CLOSED>();

  const alfieTransport = new TransportInMemory(IS_ALFIE, alfie, betty);
  const bettyTransport = new TransportInMemory(IS_BETTY, betty, alfie);

  return [alfieTransport, bettyTransport];
}
