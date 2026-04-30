import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { Env, ItemRulesBackfillParams } from "../types";
import { runBackfillItemRulesFromSourcesCore, type ItemRulesBackfillCoreResult } from "../routes/admin";

/**
 * Durable execution of shop scrape → item_rules import with retries and observability in the dashboard.
 */
export class ItemRulesBackfillWorkflow extends WorkflowEntrypoint<Env, ItemRulesBackfillParams> {
  async run(event: WorkflowEvent<ItemRulesBackfillParams>, step: WorkflowStep): Promise<ItemRulesBackfillCoreResult> {
    const payload: ItemRulesBackfillParams = {
      ...event.payload,
      _workflow_instance_id: event.instanceId,
    };
    return await step.do(
      "scrape-shop-and-import-batch",
      {
        timeout: "30 minutes",
        retries: { limit: 3, delay: "20 seconds", backoff: "exponential" },
      },
      async () => {
        return await runBackfillItemRulesFromSourcesCore(this.env, payload);
      },
    );
  }
}
