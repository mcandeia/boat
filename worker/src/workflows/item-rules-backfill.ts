import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { Env, ItemRulesBackfillParams } from "../types";
import {
  BACKFILL_SCRAPE_BATCH_SIZE,
  backfillWorkflowStepNameForCategory,
  listPendingBackfillCategories,
  runBackfillItemRulesFromSourcesCore,
  type ItemRulesBackfillCoreResult,
} from "../routes/admin";

function emptyWorkflowResult(env: Env): ItemRulesBackfillCoreResult {
  const cookie_source =
    env.SHOP_SCRAPER_USERNAME && env.SHOP_SCRAPER_PASSWORD ? "authed" : "none";
  return {
    ok: true,
    attempted: 0,
    imported: 0,
    with_ancient: 0,
    with_excellent: 0,
    batches: 0,
    batch_size: BACKFILL_SCRAPE_BATCH_SIZE,
    category_threads: 0,
    used_cookie: false,
    cookie_source,
    errors: [],
  };
}

/**
 * Durable execution of shop scrape → item_rules import.
 * One Cloudflare Workflow `step.do` per `item_sources.category` so each step runs in a fresh Worker invocation
 * (separate subrequest budget vs. fan-out categories inside a single step).
 */
export class ItemRulesBackfillWorkflow extends WorkflowEntrypoint<Env, ItemRulesBackfillParams> {
  async run(event: WorkflowEvent<ItemRulesBackfillParams>, step: WorkflowStep): Promise<ItemRulesBackfillCoreResult> {
    const basePayload: ItemRulesBackfillParams = {
      ...event.payload,
      _workflow_instance_id: event.instanceId,
    };

    // When a category is provided, this workflow instance is scoped to exactly one
    // `item_sources.category` (spawned by the admin handler as "one workflow per category").
    const categoryScope = (event.payload?._category ?? "").trim();
    if (categoryScope) {
      return await step.do(
        "backfill-category",
        {
          timeout: "30 minutes",
          retries: { limit: 2, delay: "20 seconds", backoff: "exponential" },
        },
        async () => {
          return await runBackfillItemRulesFromSourcesCore(this.env, {
            ...basePayload,
            _category: categoryScope,
          });
        },
      );
    }

    const categories = await step.do(
      "discover-backfill-categories",
      {
        timeout: "3 minutes",
        retries: { limit: 3, delay: "10 seconds", backoff: "exponential" },
      },
      async () => listPendingBackfillCategories(this.env, event.instanceId),
    );

    if (categories.length === 0) {
      return emptyWorkflowResult(this.env);
    }

    let attempted = 0;
    let imported = 0;
    let with_ancient = 0;
    let with_excellent = 0;
    let batches = 0;
    let used_cookie = false;
    let cookie_source: ItemRulesBackfillCoreResult["cookie_source"] = "none";
    const errors: string[] = [];

    for (let i = 0; i < categories.length; i++) {
      const cat = categories[i]!;
      const part = await step.do(
        backfillWorkflowStepNameForCategory(cat, i),
        {
          timeout: "30 minutes",
          retries: { limit: 2, delay: "20 seconds", backoff: "exponential" },
        },
        async () => {
          return await runBackfillItemRulesFromSourcesCore(this.env, {
            ...basePayload,
            _category: cat,
          });
        },
      );
      attempted += part.attempted;
      imported += part.imported;
      with_ancient += part.with_ancient;
      with_excellent += part.with_excellent;
      batches += part.batches;
      if (part.used_cookie) used_cookie = true;
      cookie_source = part.cookie_source;
      errors.push(...part.errors);
    }

    return {
      ok: true,
      attempted,
      imported,
      with_ancient,
      with_excellent,
      batches,
      batch_size: BACKFILL_SCRAPE_BATCH_SIZE,
      category_threads: categories.length,
      used_cookie,
      cookie_source,
      errors: errors.slice(0, 40),
    };
  }
}
