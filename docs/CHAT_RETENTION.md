# Raw text-chat retention

FRAM can retain the complete user-visible text conversation as immutable JSON
objects in a dedicated private Google Cloud Storage bucket. Voice transcripts,
system prompts, tool calls, tool results, and partial streaming chunks are not
included.

Retention is disabled unless all production configuration is intentional.

## Production configuration

Create a dedicated private bucket with public access prevention enabled. Do not
use the asset bucket. Configure these variables in Vercel:

```text
CHAT_RETENTION_ENABLED=true
CHAT_RETENTION_BUCKET_NAME=<private bucket name>
CHAT_RETENTION_HMAC_SECRET=<long random secret>
```

The existing GCS service-account configuration is reused. Grant that service
account object create, read, list, and delete permissions only on the private
chat bucket.

Each message is stored at:

```text
chat-retention/v1/conversations/<conversation-id>/messages/<message-id>.json
```

The persisted JSON contains the raw visible message, its role and timestamps,
the anonymous conversation ID, and an HMAC of the browser visitor ID. It does
not contain the original visitor ID or an IP address.

## Operator access

List recent conversations:

```text
npm run chats -- list --since 7d
```

Read one complete raw conversation:

```text
npm run chats -- show <conversation-id>
```

Return machine-readable conversations for analysis:

```text
npm run chats -- list --since 7d --json
```

This query path is intentionally local/operator-only. There is no public web
endpoint for browsing retained chats.
