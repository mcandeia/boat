import type { Env } from "./types";

// Minimal Durable Object used as a diagnostic for "is the CHAR_WATCHERS
// throttle a per-class issue or an account-wide one?". A fresh DO class
// has its own usage budget under CF's billing model — if PingTest can
// instantiate while CharWatcher can't, the per-class quota for
// CharWatcher is stuck. If PingTest also fails, the account itself is
// still being billed as Free.
export class PingTest {
  private state: DurableObjectState;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
  }

  async fetch(_req: Request): Promise<Response> {
    const at = Date.now();
    await this.state.storage.put("last_ping", at);
    return Response.json({ ok: true, at });
  }
}
