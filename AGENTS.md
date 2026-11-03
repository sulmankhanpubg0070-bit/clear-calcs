# Project rules

- Family summaries run in a Cloud Edge Function using AI Gateway; validate the existing admin password server-side before spending AI credits.
- Generate summaries on demand from saved website data, never from browser-supplied family facts, and keep results confined to the admin panel.
- Persist terminal AI access blocks in server-only storage alongside the active data provider; only explicit admin recovery may start fresh work after access is restored.
- MongoDB runs only through Cloud Edge Functions, restricted to a readWrite-only family_tree user; atomic insert-only migration preserves the original Cloud backup and existing destination records.
- Frontend storage uses a single adapter with serialized revision-checked MongoDB writes and retains the original Cloud provider until MongoDB migration succeeds, so configuration failures cannot take the website offline.
- Public About, Contact and Stats dialogs live in FamilyInfo; derive statistics from current members via a pure helper so counts stay in sync without additional data storage.