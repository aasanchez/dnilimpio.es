<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Usage stats in Grafana Cloud

This page shows how to read the opt-in usage stats ([ADR 0029](adr/0029-opt-in-usage-stats.md)) in
a Grafana Cloud dashboard. The site sends nothing new. Grafana only reads the rows that the Worker
already writes to the Workers Analytics Engine dataset `dnitapado_usage`, through Cloudflare's SQL
API and a read-only token. This follows Cloudflare's guide
[Querying Workers Analytics Engine from Grafana](https://developers.cloudflare.com/analytics/analytics-engine/grafana/).

The dashboard is [`grafana/dnitapado-usage.json`](grafana/dnitapado-usage.json).
[`tests/unit/grafana.test.ts`](../tests/unit/grafana.test.ts) checks that its queries read the
columns in the order the Worker writes them (`dataPoint()` in
[`src/stats/endpoint.ts`](../src/stats/endpoint.ts)).

## What you need

- A Cloudflare account with the dataset `dnitapado_usage` (README, Deployment, step 5).
- A Grafana Cloud stack. The free tier is enough.
- About 10 minutes.

## What it costs in privacy

Grafana Labs gets a token that can read the account's analytics, and it sees the query results
it draws. Those results are the same fixed figures as the dataset: no photo, text, IP address or
identifier (README, [Usage stats (opt-in)](../README.md#usage-stats-opt-in)). The token cannot
change anything. To stop it, delete the token in Cloudflare.

## 1. Create a read-only Cloudflare token

1. In the Cloudflare dashboard, open **My Profile > API Tokens** and select **Create Token**.
2. Choose **Create Custom Token**.
3. Name it `grafana-analytics-read`.
4. Under **Permissions**, add one row: **Account | Account Analytics | Read**. Add nothing else.
5. Under **Account Resources**, include only your account.
6. Optional: set an end date under **TTL**, so the token stops on its own.
7. Select **Continue to summary**, then **Create Token**.
8. Copy the token. Cloudflare shows it once. Do not save it in this repository, a chat or a
   ticket. You paste it in Grafana only, in step 3.

Note your **account ID** too: it is in the address of the dashboard
(`dash.cloudflare.com/<account ID>/...`), or under **Account home > Account details**.

Check the token from a terminal (optional). It should return a few rows as JSON:

```bash
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/analytics_engine/sql" \
  -H "Authorization: Bearer $CF_ANALYTICS_TOKEN" \
  --data "SELECT blob2 AS doc, SUM(_sample_interval) AS uses FROM dnitapado_usage GROUP BY doc"
```

## 2. Install the ClickHouse plugin in Grafana

The SQL API speaks a ClickHouse dialect, so Grafana reads it with the **Altinity plugin for
ClickHouse** (plugin id `vertamedia-clickhouse-datasource`), the plugin Cloudflare's guide uses.
Grafana's own "ClickHouse" plugin is a different one; the dashboard does not work with it.

1. In Grafana, open **Administration > Plugins and data > Plugins**.
2. Search for **Altinity plugin for ClickHouse** and select **Install**. Use version 3.1.0 or
   later; older versions no longer work with the SQL API.

## 3. Add the data source

1. Open **Connections > Data sources** and select **Add new data source**.
2. Choose **Altinity plugin for ClickHouse**.
3. Set **Name** to `Workers Analytics Engine`.
4. Set **URL** to
   `https://api.cloudflare.com/client/v4/accounts/<account ID>/analytics_engine/sql`, with your
   32-character account ID.
5. Leave every **Auth** switch off.
6. Under **Custom HTTP Headers**, select **Add header**: header `Authorization`, value
   `Bearer <token>`, with the token from step 1. Grafana stores the value encrypted and does not
   show it again.
7. Change nothing else. Select **Save & test**.

## 4. Import the dashboard

1. Open **Dashboards > New > Import**.
2. Upload [`grafana/dnitapado-usage.json`](grafana/dnitapado-usage.json), or paste its content.
3. Under **Workers Analytics Engine**, choose the data source from step 3.
4. Select **Import**.

The dashboard opens on the last 30 days. Analytics Engine keeps rows for 3 months, so a longer range
shows nothing more.

## What the dashboard shows

| Row | Panels | Columns |
|---|---|---|
| Overview | Uses; detection right; uses with a moved box; back photo used; uses over time per document | all rows, `blob2`, `blob3`, `double1`, `double20` |
| Documents and detection | Card types; detection result; detection right over time | `blob2`, `blob3` |
| Covered fields | Share of uses per document for each field; extra boxes; watermark; greyscale; OCR ran | `double9` to `double19`, `double2` to `double5` |
| Moved boxes | Moved boxes over time; latest moved boxes | `double20`, `blob12` |
| Devices and versions | Device type; system; browser; photo source; app version; language | `blob4` to `blob9` |

Definitions:

- **Uses** count taps on Send on the thanks page, not visits. Each query sums
  `_sample_interval`, so the counts stay right if Analytics Engine samples rows.
- **Detection right** is right ÷ (right + wrong + none). It leaves out `off` (detection could not
  run: offline, old browser).
- **Covered fields** are shares of that document's uses. A field that a document does not have
  stays at 0.
- **Moved boxes** exist from list version 2 on (ADR 0047). The
  queries skip rows of version 1. Until version 2 is deployed, these panels are empty.
- **App version** is the 7-digit commit in `blob5`, the same digits as in the app's footer.

The column list is in the README under
[Usage stats (opt-in)](../README.md#usage-stats-opt-in).

## Write your own query

Each panel's query is plain SQL. Two macros from the plugin follow the dashboard's time range:

- `$timeFilter` limits rows to the range.
- `$timeSeries` rounds `timestamp` to a bucket that suits the zoom level. Name it `t` and put it
  first, then `GROUP BY t ORDER BY t`.

Both need **Column:DateTime** set to `timestamp`. The imported panels have it set; for a new
query, set it in the query editor. Example, uses per language over time:

```sql
SELECT $timeSeries AS t, blob4 AS lang, SUM(_sample_interval) AS uses
FROM dnitapado_usage
WHERE $timeFilter
GROUP BY lang, t
ORDER BY t
```

The SQL API supports a subset of ClickHouse SQL. See Cloudflare's
[SQL reference](https://developers.cloudflare.com/analytics/analytics-engine/sql-reference/).

## When it does not work

- **Save & test fails with 401 or 403.** The header value must be `Bearer ` followed by the
  token. Check that the token has **Account Analytics | Read** on the right account.
- **Save & test fails with 404.** The account ID in the URL is wrong.
- **A panel says the table does not exist.** The dataset appears only after the first valid send.
  Send stats once from the thanks page.
- **A panel says a column does not exist, or `$timeFilter` stays as text.** Set
  **Column:DateTime** to `timestamp` in that query.
- **Panels are empty.** Widen the time range, or check with the `curl` command in step 1.

## Change the dashboard

Change it in Grafana, then export it as JSON with the option to use it in another instance
(**Export > Export as JSON**, "Export the dashboard to use in another instance"). That replaces the
data source with the input `DS_ANALYTICS_ENGINE`. Replace the file in
`docs/grafana/`, and run `pnpm test tests/unit/grafana.test.ts`. If you add a column to the
Worker's row, add it to the README column list and to the test.
