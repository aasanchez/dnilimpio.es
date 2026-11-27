<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0035. No Network Error Logging: NEL off for every file, no Report-To

- Status: accepted. Amends [ADR 0027](0027-security-headers-from-the-host.md).
- Date: 2026-11-27
- Decided by: Alexis

## Context

An audit on 27 November 2026 found two headers on every response of dnitapado.es that the
repository does not write:

```text
nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
report-to: {"group":"cf-nel","max_age":604800,"endpoints":[{"url":"https://a.nel.cloudflare.com/report/v4?s=…"}]}
```

Cloudflare adds them when the zone setting "Network Error Logging" is on. They ask the browser to
remember, for 7 days, to send a report to `a.nel.cloudflare.com` when a request to the site fails:
the address of the request, the status, the timing and the visitor's IP address. The browser sends
these reports by itself, outside the page and outside its CSP. No page content and nothing from a
photo can go into them. They still break the claim that the only send the site asks for is the
opt-in usage stats ([ADR 0029](0029-opt-in-usage-stats.md)).

## Decision

- `scripts/headers.ts` sends `NEL: {"max_age":0}` with every file. A browser that sees it deletes the
  NEL policy it has for the site, so a policy cached on an earlier visit goes too.
- Network Error Logging is off in the zone's settings, so Cloudflare adds neither header. This is
  a dashboard setting: the repository cannot change it. It can also be set with the API
  (`PATCH /zones/{zone_id}/settings/nel`).
- The post-deploy check (`scripts/smoke.ts`, `reportingProblems()` in `scripts/headers.ts`) fails
  if the page, the service worker, the OCR worker, the thanks page or `POST /stats` is served with
  a NEL policy other than `{"max_age":0}`, a `Report-To` header or a `Reporting-Endpoints` header.

## Consequences

- If the zone setting is turned on again, or Cloudflare adds the headers in a new way, the next
  deploy shows a failed `smoke` job with the header and its value.
- The site has no report of network errors seen by visitors. It had no use for them.
- `Report-To` cannot be removed from the repository: the `_headers` file only removes headers that
  an earlier rule of the same file set. Only the zone setting removes it.
