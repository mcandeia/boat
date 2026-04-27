#!/usr/bin/env bun
import { chromium, type Browser, type Page } from "playwright";

const URL = "https://mupatos.com.br/site/profile/character/daddy";
const TARGET_LEVEL = Number(process.env.TARGET_LEVEL ?? 360);
const INTERVAL_MS = Number(process.env.INTERVAL ?? 600) * 1000;
const PUSHOVER_USER = must("PUSHOVER_USER");
const PUSHOVER_TOKEN = must("PUSHOVER_TOKEN");

function must(key: string): string {
  const v = process.env[key];
  if (!v) {
    console.error(`Missing env var: ${key} (set it in .env)`);
    process.exit(1);
  }
  return v;
}

function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

async function fetchLevel(page: Page): Promise<number | null> {
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const html = await page.content();
  const m = html.match(/<td>\s*Level\s*<\/td>\s*<td>\s*(\d+)\s*<\/td>/i);
  return m ? Number(m[1]) : null;
}

async function sendAlarm(level: number): Promise<void> {
  const body = new URLSearchParams({
    token: PUSHOVER_TOKEN,
    user: PUSHOVER_USER,
    title: "MU Level Alert",
    message: `daddy reached level ${level}`,
    priority: "2",
    retry: "30",
    expire: "3600",
    sound: "vibrate",
  });
  const res = await fetch("https://api.pushover.net/1/messages.json", {
    method: "POST",
    body,
  });
  if (!res.ok) {
    throw new Error(`Pushover ${res.status}: ${await res.text()}`);
  }
}

async function main(): Promise<void> {
  console.log(`Watching ${URL}`);
  console.log(`Target: ${TARGET_LEVEL}  |  Interval: ${INTERVAL_MS / 1000}s`);

  const browser: Browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
  });
  const page = await context.newPage();

  let stopping = false;
  const shutdown = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    await browser.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  while (true) {
    try {
      const level = await fetchLevel(page);
      if (level == null) {
        console.log(`[${ts()}] could not parse level, will retry`);
      } else {
        console.log(`[${ts()}] level=${level}`);
        if (level >= TARGET_LEVEL) {
          console.log(`[${ts()}] TARGET REACHED — firing Pushover alarm`);
          await sendAlarm(level);
          await browser.close();
          return;
        }
      }
    } catch (err) {
      console.log(`[${ts()}] fetch error: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
