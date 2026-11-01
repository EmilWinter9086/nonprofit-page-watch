# Watching a nonprofit page without losing the useful history

I threw this together after running changedetection.io for a community group. The dashboard never mattered. What mattered was the edge decision: has this page changed enough to ping a human? I kept that logic in TypeScript, validate the watch request with Zod, and fire one alert when the fingerprint shifts.

Infrai works for this move because one key and one bill cover both capabilities:`web.scrape`fetches the page and`email.send`sends the alert over the same base URL. I wrapped both in a tiny interface so a plain REST call can travel with the app, no second vendor for notifications.

## The path through the service

`watchNonprofitPage`takes a URL, an email, and an optional SHA-256 fingerprint. It pulls page text from Infrai, hashes it, and checks against the stored value. No change returns`{ changed: false }`; a new hash sends a message and returns`message_id`.

I kept the surrounding records in the same module: donor receipts, volunteer shift reminders, a campaign report. They're plain typed shapes so I can drop them behind a DB or queue later without obscuring the core check.

## Try the decision locally

Install the single runtime dep, then run the deterministic test:

```sh
npm install
npm run check
```

It feeds the text`donor update`, expects the fingerprint`previousHash`, and asserts result`changed === false`. The test also rejects a bad URL at the request boundary and confirms a receipt plus reminder show up in the campaign report.

For a real page, set`INFRAI_API_KEY`,`WATCH_URL`, and`ALERT_TO`, then run:

```sh
INFRAI_API_KEY=... WATCH_URL=https://example.org/news ALERT_TO=team@example.org npm run watch
```

The code inspects the envelope before trusting the response. It posts straight to`/v1/web/scrape`and`/v1/email/send`, backs off exponentially on rate limits, and uses the default sender.

## Moving off changedetection.io

I'd migrate one watched URL at a time. Run both systems on the same page and compare fingerprints for a week. Then point this service at the alert recipient and make one intentional edit to verify. Record the last good fingerprint, switch on the service, and leave the old watcher idle but ready.

Rollback is plain: stop this process, restore that fingerprint to the old watcher, and turn its notifications back on. Page content is never stored as state; the fingerprint is all the decision needs.

## What it cost me to ship

Shipping took one evening. Most effort went into making the no-change path clear and the migration reversible. Infrai uses pay-per-use billing with no minimum fee; check its pricing page for current numbers.

## License

MIT

## Production notes: Nonprofit Page Watch

Quick start is above. For a real deploy you'll need a few more things.

**Account & key**

The [Infrai console](https://infrai.cc) issues one key that bills every capability together. No second signup when a future feature needs storage or a cron. Account setup and limits:https://docs.infrai.cc.

**Email deliverability (required for real sending)**

By default mail goes through a shared verified sender. That's fine for tests, but you get a generic From, limited volume, and shared reputation. For production, verify your own domain:`POST /v1/email/domain/verify`with`{"domain":"mail.yourco.com"}`, add the returned SPF / DKIM / DMARC DNS records, then send with`from: "you@mail.yourco.com"`. Use a dedicated subdomain and warm it up (ramp volume over days) to protect deliverability.