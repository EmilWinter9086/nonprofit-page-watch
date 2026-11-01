import assert from "node:assert/strict";
import { changed, campaignReport, pageFingerprint, watchRequest } from "./page_monitor.ts";

const fingerprint = pageFingerprint("donor update");
assert.equal(changed(fingerprint, fingerprint), false);
assert.equal(changed(undefined, fingerprint), true);
assert.equal(watchRequest.safeParse({ url: "https://nonprofit.example/news", recipient: "team@example.org" }).success, true);
assert.equal(watchRequest.safeParse({ url: "not-a-url", recipient: "team@example.org" }).success, false);

const report = campaignReport(
  [{ donor: "Ava", amount: 50, campaign: "Food drive", receivedAt: "2026-10-25" }],
  [{ volunteer: "Mina", shift: "Packing", startsAt: "2026-10-26T09:00:00Z" }],
);
assert.equal(report.campaign, "Food drive");
assert.equal(report.reminders[0].volunteer, "Mina");
console.log("business decision checks passed");
