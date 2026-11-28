# Changelog

## 0.2.0

- Every per-platform option of the API now has its own field under **Platform Options**, so none
  needs the JSON input mode: Instagram user tags, Discord embeds and polls, and a per-platform
  thread on X, Bluesky and Threads.
- **Thread** under Additional Fields: follow-up posts (text and media) published as replies after
  the post.

## 0.1.1

- Released through npm staged publishing with trusted publishing (no change to the nodes).

## 0.1.0

First release.

- **Ampost** node: Post (Create, Validate, Get, Get Many, Publish, Retry, Delete), Account (Get, Get
  Many), Media (Upload from binary data), Platform Set (Get Many), Queue (Get Slots), Analytics (Get
  Post Metrics, Get Overview). Lists of platform sets, platforms and accounts, per-platform options,
  and use as an AI Agent tool.
- **Ampost Trigger** node: creates and deletes its Ampost webhook and checks each event's signature.
- **Ampost API** credential (API key).
- Seven workflow templates in `templates/`.
