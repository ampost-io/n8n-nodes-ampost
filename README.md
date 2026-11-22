# n8n-nodes-ampost

[n8n](https://n8n.io) nodes for [Ampost](https://ampost.io?ref=github): publish, schedule and track
social media posts on Instagram, Facebook, Threads, X, YouTube, Pinterest, Bluesky, Telegram and
Discord from your workflows.

- **Ampost** node: create, validate, publish and manage posts, upload media, read accounts, queue
  slots and analytics. It can also be used as a tool by n8n's AI Agent.
- **Ampost Trigger** node: starts a workflow when a post is published or fails, or when an account
  needs reconnecting. It registers its own webhook and checks each event's signature.
- [Templates](#templates) for RSS, Google Sheets, AI posts with approval, YouTube and alerts.

No runtime dependencies. Built with [@n8n/node-cli](https://www.npmjs.com/package/@n8n/node-cli).

## Install

In n8n (self-hosted, 1.x or 2.x): **Settings → Community nodes → Install**, enter
`n8n-nodes-ampost`, tick the risk box and install. See n8n's
[community nodes guide](https://docs.n8n.io/integrations/community-nodes/installation/).

Manual install, for queue mode or Docker images built ahead of time:

```sh
cd ~/.n8n/nodes            # create it with `npm init -y` if missing
npm install n8n-nodes-ampost
# restart n8n
```

## Credentials

1. In Ampost, open [Settings, API keys](https://ampost.io/app/settings/api-keys?ref=github) and
   create a key. Pick the scopes the workflow needs (table below). A key can also be limited to some
   platform sets.
2. In n8n, add an **Ampost API** credential and paste the key. Leave **Base URL** as
   `https://api.ampost.io`.

n8n tests the credential by calling the API with the key; any valid key passes.

| Scope | Needed for |
| --- | --- |
| `posts:write` | Post: Create, Publish, Retry, Delete, Unpublish |
| `posts:read` | Post: Validate, Get, Get Many. Queue: Get Slots |
| `media:write` | Media: Upload |
| `accounts:read` | Account: Get, Get Many. Platform Set: Get Many. The platform and account lists in the node |
| `analytics:read` | Analytics: Get Post Metrics, Get Overview |
| `webhooks:write` | Ampost Trigger |

The node uses API keys only. Ampost's OAuth tokens are for its [MCP server](https://ampost.io/docs/mcp?ref=github)
and are not accepted by the REST API.

## Ampost node

| Resource | Operation | What it does |
| --- | --- | --- |
| Post | Create | Publish now, schedule, add to the queue or save a draft |
| Post | Validate | Check a post against every platform's rules without creating it |
| Post | Get | A post with the result on each account |
| Post | Get Many | List posts, with filters for status, platform, platform set and text |
| Post | Publish | Publish a draft or a scheduled post now |
| Post | Retry | Publish again to the accounts that failed |
| Post | Delete | Discard a post that was not published |
| Post | Unpublish | Delete a published post from the platforms (all accounts, or the ones you pick). Instagram and TikTok have no delete API: those accounts keep it, with `notice` saying so |
| Account | Get | A connected account with its health (`canPost`, `needsReconnect`, issues) |
| Account | Get Many | List connected accounts |
| Media | Upload | Upload a file from the item's binary data, for use in a post |
| Platform Set | Get Many | List platform sets (groups of accounts, one per platform) |
| Queue | Get Slots | The next free times of a platform set's posting queue, one item each |
| Analytics | Get Post Metrics | Metrics of published posts, one entry per account |
| Analytics | Get Overview | Totals per account and overall for a date range |

**Get Slots** outputs one item per slot. A queue with no slots (none set up, or none free with
**Only Free Slots**) outputs no items, and n8n then skips every node after it. To keep the workflow
going, turn on **Always Output Data** in the node's settings and check for an empty item next.

**Create and Validate** take either fields or a raw JSON body (`Input Mode`, the body of
[POST /api/posts](https://ampost.io/docs?ref=github)). With fields:

- **Platform Set**: empty means your default set. **Platforms** lists the platforms with an active
  account in that set.
- **When**: Publish Now, Schedule (a date, in the workflow's time zone unless it has an offset), Add
  to Queue (the set's next free slot) or Save as Draft.
- **Additional Fields**: first comment, link, media (URLs, or **Media Items (JSON)**, which takes
  the `files` of a Media: Upload result as is), media fit, metadata, more targets in other platform
  sets, and an **Idempotency Key**. Set it to something unique to the post, such as
  `{{ $json.guid }}`, and a re-run or a retried item never posts twice: Ampost answers a repeated
  key with the first post for 24 hours.
- **Platform Options**: per-platform text and settings, for example the YouTube title and privacy,
  Instagram placement (feed, reel, story), the Pinterest board, TikTok privacy, the Telegram parse
  mode.

**Media: Upload** sends the file to Ampost's storage and waits until Ampost has checked it, then
returns `files[]` with the public URL, type, size and dimensions. Images (JPEG, PNG, WebP) and
videos (MP4, MOV, WebM) are accepted. Connect it before **Post: Create** and set **Media Items
(JSON)** to `{{ $json.files }}`.

**Get Many** operations return every result with **Return All**, or the first **Limit** results.

Errors from the API show their message and code, for example `Missing scope (INSUFFICIENT_SCOPE)`.
With **Settings → On Error → Continue**, the failed item's output is `{ error: "<message>" }` and
the workflow goes on.

### As an AI Agent tool

The Ampost node has `usableAsTool`, so it appears in the AI Agent's tool list as **Ampost Tool**. If
an older n8n does not list it, set `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true`.

## Ampost Trigger node

Choose the events, then activate the workflow. On activation the node creates an Ampost webhook for
the workflow's production URL (named `n8n: <workflow name>`). On deactivation it deletes it, and it
replaces it when the events or the URL change.

Events: `post.scheduled`, `post.unscheduled`, `post.discarded`, `post.published`, `post.partial`,
`post.failed`, `post.platform.published`, `post.platform.failed`, `post.platform.deleted`,
`post.platform.edited`, `account.connected`, `account.disconnected`, `account.needs_reconnect`,
`analytics.synced`.

Each item is the event as Ampost sends it: `{ id, type, createdAt, data }`, with `data.post`,
`data.platformPost` (including `error.code` and `error.message` on a failure) or `data.account`. See
[webhooks](https://ampost.io/docs?ref=github#webhooks).

Requirements:

- Ampost delivers only to public `https` addresses. n8n Cloud has one. Self-hosted n8n must be
  reachable over https and have `N8N_WEBHOOK_URL` (`WEBHOOK_URL` before n8n 2) set to its public
  address.
- The key needs `webhooks:write`.

Every request is checked against its `Ampost-Signature` (HMAC-SHA256 of the timestamp and the raw
body, with the webhook's secret, which the node stores when it creates the webhook). Requests
older than 5 minutes or with a wrong signature get `401` and start nothing.

## Templates

Import a file from [`templates/`](templates) with **Workflows → Import from File**, then pick your
Ampost credential in the Ampost nodes. Each workflow has a note with its setup steps.

| File | What it does |
| --- | --- |
| [`post-to-social-media.json`](templates/post-to-social-media.json) | Post a text and a link to the platforms you list |
| [`upload-image-and-post.json`](templates/upload-image-and-post.json) | Download an image, upload it to Ampost and post it |
| [`rss-to-social-media.json`](templates/rss-to-social-media.json) | Share every new item of an RSS feed on all your accounts |
| [`google-sheets-schedule.json`](templates/google-sheets-schedule.json) | Schedule the rows of a Google Sheet, then write the post ID and status back |
| [`ai-post-with-approval.json`](templates/ai-post-with-approval.json) | OpenAI writes a weekly post, Slack asks for approval, then Ampost publishes or deletes the draft |
| [`youtube-cross-post.json`](templates/youtube-cross-post.json) | Announce each new video of a YouTube channel on your other accounts |
| [`post-failure-alerts.json`](templates/post-failure-alerts.json) | Send a Slack message when a post fails or an account needs reconnecting |

Step-by-step guides: [ampost.io/how-to](https://ampost.io/how-to?ref=github).

## Development

```sh
npm ci
npm run lint        # n8n's lint rules for community nodes
npm test            # builds, then runs the unit tests and checks the templates against the nodes
npm run dev         # n8n with this package linked, at http://localhost:5678
```

Before a release, run n8n's scanner on the packed package, as CI does:

```sh
npm pack --pack-destination /tmp && tar xzf /tmp/n8n-nodes-ampost-*.tgz -C /tmp
npx @n8n/scan-community-package /tmp/package
```

Releases: `npm run release` bumps the version, writes the changelog, then commits, tags and pushes.
It does not publish. The tag runs
`.github/workflows/publish.yml`, which publishes to npm with provenance (required for n8n's
verified community nodes) once the repo variable `NPM_PUBLISH_ENABLED` is `true`.

## Links

- [API docs](https://ampost.io/docs?ref=github)
- [n8n how-to](https://ampost.io/how-to/post-to-social-media-from-n8n?ref=github)
- [Node.js SDK](https://github.com/ampost-io/ampost-node) and [Python SDK](https://github.com/ampost-io/ampost-python)
- [Pricing](https://ampost.io/pricing?ref=github)

## License

[MIT](LICENSE)
