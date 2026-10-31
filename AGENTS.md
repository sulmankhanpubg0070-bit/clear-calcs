# Project rules

- Family summaries run in a Cloud Edge Function using AI Gateway; validate the existing admin password server-side before spending AI credits.
- Generate summaries on demand from saved website data, never from browser-supplied family facts, and keep results confined to the admin panel.
- Persist terminal AI access blocks in a service-only table; only explicit admin recovery may start fresh work after access is restored.