# Project rules

- Family summaries run in a Cloud Edge Function using AI Gateway; validate the existing admin password server-side before spending AI credits.
- Generate summaries on demand from saved website data, never from browser-supplied family facts, and keep results confined to the admin panel.
- Persist terminal AI access blocks in server-only storage alongside the active data provider; only explicit admin recovery may start fresh work after access is restored.
- MongoDB runs only through Cloud Edge Functions with a fixed server-side database name, never one supplied by the browser; atomic insert-only migration preserves the original Cloud backup and existing destination records. The credential may have broader privileges but application operations remain confined to the selected database.
- Keep website metadata/AI blocks, members, and password hashes in separate MongoDB collections; migrate legacy fields and save metadata/members with transactions so partial changes cannot be reported as saved. Login and summaries must use the same credential/member collections.
- Frontend storage uses a single MongoDB adapter with serialized revision-checked writes; after migration never silently fall back to the original Cloud password or stale website data. Cloud data remains an untouched backup.
- Public About, Contact and Stats dialogs live in FamilyInfo; derive statistics from current members via a pure helper so counts stay in sync without additional data storage.