# Telegram preservation Phase 0 TODO

This checklist tracks the Telegram collector foundation and the remaining full
Phase 0 work from `docs/message-preservation-architecture.md`. R2 and Convex are
intentionally not connected to the message collector yet.

## Completed collector foundation

- [x] Reuse one scoped, connected GramJS client through the `TelegramClient`
      Effect service.
- [x] Fetch and decode one bounded `messages.getHistory` page.
- [x] Preserve the raw GramJS response in a deterministic JSON-safe format.
- [x] Define JSON-safe Telegram message, peer, entity, media, reply, forward,
      service-action, warning, and discovered-file contracts.
- [x] Normalize ordinary, service, and empty messages.
- [x] Normalize text entities while preserving Telegram UTF-16 offsets.
- [x] Convert Telegram `long` values to decimal strings.
- [x] Classify common document presentations: file, image file, animation,
      audio, voice, video, round video, sticker, and custom emoji.
- [x] Discover photo, document, and video-cover file candidates without
      downloading them.
- [x] Preserve timed and view-once metadata without reading or downloading the
      media.
- [x] Produce deterministic, versioned semantic hashes that exclude volatile
      counters and refreshable file references.
- [x] Keep unsupported nested Telegram constructors recoverable through
      warnings plus raw preservation.
- [x] Cover the current foundation with unit tests.

## Remaining file-candidate contract work

- [ ] Make photo file candidates self-contained by selecting and preserving the
      Telegram photo-size `type` required as `InputPhotoFileLocation.thumbSize`.
- [ ] Preserve the parent peer kind/ID and message ID with each queued file so an
      expired or invalid file reference can be refreshed by refetching its source
      message.
- [ ] Test reconstructing GramJS document and photo download locations solely
      from the persisted file-job contract.

## Next: classify Telegram failures before adding retries

The current `TelegramHistoryFetchError` wraps every rejected `client.invoke`
call as `cause: unknown`. Replace that broad boundary with one shared classifier
used by history, dialog, update, lookup, and download operations.

### Facts verified for the installed GramJS version

- GramJS exports `RPCError`, `BadRequestError`, `UnauthorizedError`,
  `ForbiddenError`, `NotFoundError`, `AuthKeyError`, `FloodError`,
  `ServerError`, `TimedOutError`, and `InvalidDCError`.
- Specialized errors include `FloodWaitError` (`seconds`),
  `SlowModeWaitError` (`seconds`), and migration errors (`newDc`).
- Protocol/transport-adjacent errors include `ReadCancelledError`,
  `TypeNotFoundError`, `InvalidChecksumError`, `InvalidBufferError`,
  `SecurityError`, `CdnFileTamperedError`, and `BadMessageError`.
- GramJS defaults `requestRetries` to 5. It internally retries Telegram server
  failures, `RPC_CALL_FAIL`, waits at or below `floodSleepThreshold`, and some
  migration cases.
- GramJS defaults `floodSleepThreshold` to 60 seconds. A shorter wait may be
  consumed inside `client.invoke`; a longer `FloodWaitError` escapes to us.
- Telegram RPC codes are broad categories. Exact error types matter: a 400 may
  be a permanent invalid request or a recoverable expired file reference.
- In this GramJS release, some subclasses replace `errorMessage` with a broad
  value such as `UNAUTHORIZED` or `BAD_REQUEST`; the original Telegram token may
  remain only in `message`. Any token parsing must be isolated, allow-listed,
  tested, and never used as the only fallback for arbitrary JavaScript errors.

### Proposed typed error categories

- [ ] Add `telegram/error-classifier.ts` with an operation-independent
      `classifyTelegramError(cause, context)` function.
- [ ] Include safe context: operation name, peer kind/ID when allowed, request
      constructor, attempt number, and observation time. Never include message
      text, session strings, access hashes, file references, filenames,
      credentials, or complete request objects.
- [ ] Preserve the original `cause` for internal Effect diagnostics, but expose
      and log only a safe structured summary.
- [ ] Classify in specific-to-general order so recoverable exact errors are not
      swallowed by broad RPC classes.

| Category | Detection and metadata | Policy |
| --- | --- | --- |
| `floodWait` | `FloodWaitError` / `FloodTestPhoneWaitError`; retain `seconds`; separately identify premium wait when the original token is available | Schedule at Telegram's required time. Do not apply ordinary exponential retry or hold scarce worker capacity while waiting. |
| `slowModeWait` | `SlowModeWaitError`; retain `seconds` | Usually irrelevant to read-only collection; report separately rather than treating it as a network failure. |
| `authorizationLost` | `UnauthorizedError`, `AuthKeyError`, and allow-listed tokens such as `AUTH_KEY_UNREGISTERED`, `AUTH_KEY_INVALID`, `AUTH_KEY_DUPLICATED`, `SESSION_REVOKED`, or `SESSION_EXPIRED` | Do not retry blindly. Stop account work and require reauthentication. |
| `sourceUnavailable` | Method-specific privacy/deletion tokens, commonly surfaced through `ForbiddenError` or `BadRequestError`, such as an inaccessible/private dialog | Mark the peer/message/file unavailable with a safe reason. Retry only after a meaningful state refresh or user action. |
| `invalidPeer` | Allow-listed peer/input tokens plus local GramJS entity-resolution failures | Do not exponential-retry unchanged input. Refresh entity/access-hash information where possible; otherwise mark inaccessible. |
| `fileReferenceExpired` | `FILE_REFERENCE_EXPIRED` or `FILE_REFERENCE_INVALID`, even though these are 400-class errors | Refetch the source message/profile, replace the file reference, then retry the download once through the normal job policy. |
| `dcMigration` | `FileMigrateError`, `PhoneMigrateError`, `NetworkMigrateError`, `UserMigrateError`; retain `newDc` | GramJS normally handles applicable migrations. If one escapes, record it explicitly; file downloads may be rerouted, while auth migrations may require reconnect/reconfiguration. |
| `telegramTransient` | `ServerError`, `TimedOutError`, generic RPC code 500/503, `RPC_CALL_FAIL`, or `RPC_MCGET_FAIL` after GramJS exhausts its own retries | Bounded exponential backoff with jitter and an operation budget. Avoid multiplying GramJS retries by a large outer retry count. |
| `transport` | Non-RPC connection loss, socket timeout/reset, or disconnected-client failure | Reconnect through the scoped client policy and retry only idempotent operations with a bound. |
| `protocolOrIntegrity` | `TypeNotFoundError`, `InvalidBufferError`, `InvalidChecksumError`, `BadMessageError`, `SecurityError`, or `CdnFileTamperedError` | Do not classify as a peer failure. Retry/reconnect only where documented; surface repeated failures for investigation. A CDN integrity failure must never produce a stored file. |
| `serializationOrCollectorBug` | Request construction/resolution/serialization failure before a valid RPC result; may be a generic `Error` in GramJS | Do not retry unchanged data. Preserve safe constructor/operation metadata and fix or upgrade the collector. |
| `cancelled` | Effect interruption or explicit tracking-generation cancellation | Preserve cancellation as control flow; do not wrap it as a Telegram failure or retry it. |
| `unknown` | No recognized class or allow-listed Telegram token | Preserve the cause internally, emit a redacted safe summary, and use a very small or zero retry budget until classified. |

### Error-classification tests and policy decisions

- [ ] Unit-test every exported GramJS error class that can be constructed
      without a live Telegram request.
- [ ] Test exact-token precedence over broad classes, especially expired file
      references and authorization loss.
- [ ] Test redaction: safe summaries must not contain session values, access
      hashes, file references, message content, filenames, credentials, or
      signed URLs.
- [ ] Add operation-specific wrappers such as history fetch, peer resolution,
      message lookup, and file download without duplicating classification.
- [ ] Decide explicit GramJS values for `requestRetries`,
      `connectionRetries`, `reconnectRetries`, `downloadRetries`, and
      `floodSleepThreshold`; do not silently depend on defaults.
- [ ] Define one retry owner for each failure. Document when GramJS retries and
      when Effect retries so the two layers do not multiply attempts.
- [ ] Add structured logging/metrics by safe error category, Telegram RPC code,
      retry delay, and operation.

## Remaining Telegram fixture and normalization work

The current tests construct useful synthetic GramJS objects. Phase 0 still asks
for sanitized fixtures captured from dedicated test accounts so the code is
validated against real GramJS response shapes.

- [ ] Capture and sanitize real ordinary, service, and empty message fixtures.
- [ ] Add fixture coverage for plain text, formatting/entities, replies,
      forwards, albums, and edited messages.
- [ ] Add photo and generic-file fixtures beyond the current synthetic cases.
- [ ] Add dedicated voice, audio, normal video, round video, sticker, GIF, and
      custom-emoji fixtures.
- [ ] Add webpage, poll, contact, static location, live location, venue, dice,
      story, paid media, giveaway, and to-do-list fixtures as supported by the
      installed Telegram layer.
- [ ] Add fixtures for unsupported/new constructors and prove that one unknown
      nested value cannot fail the whole page.
- [ ] Add channel-history fixtures that include users, chats, forum topics,
      incomplete counts, and empty pages.
- [ ] Bound nested arrays and encoded page bytes so a pathological Telegram
      response cannot later exceed Convex's document limits.
- [ ] Reconcile the architecture document's old `telegramConstructor` message
      discriminator with the implemented `kind: "message" | "service" |
      "empty"` contract.

## Remaining history-service validation

- [ ] Test invalid page limits and `MessagesNotModified`.
- [ ] Test `ChannelMessages`, topics, inexact counts, and empty slices.
- [ ] Test the exact `GetHistory` request sent through a test `TelegramClient`
      service, including newest-to-oldest cursors.
- [ ] Test every classified history failure without making a live Telegram
      request.
- [ ] Decide whether a complete `messages.Messages` response is always a safe
      terminal signal for our pagination policy; back it with captured fixtures.
- [ ] Keep full resumable pagination, durable checkpoints, and live-update
      interleaving in Phase 1 rather than hiding those policies inside
      `fetchPage`.

## Ephemeral-media safety validation

- [ ] Using dedicated accounts, test each accessible timed/view-once subtype.
- [ ] Verify whether obtaining metadata changes viewed/read state.
- [ ] Verify whether downloading through GramJS changes viewed/read state.
- [ ] Ensure the experiment does not call `messages.readMessageContents` or
      another read/consume method unintentionally.
- [ ] Record sanitized evidence and the safe policy.
- [ ] Do not enable automatic ephemeral download until these tests pass.

## Deferred full Phase 0 R2 spike

These tasks remain part of full Phase 0, but are intentionally deferred until
the Telegram collector code is approved.

- [ ] Create a private development R2 bucket and least-privilege credentials.
- [ ] Prove single PUT from a Bun stream/file.
- [ ] Prove multipart upload and cleanup of incomplete uploads.
- [ ] Compute and verify SHA-256 independently of the R2 ETag.
- [ ] Prove a short-lived signed GET and HTTP range request.
- [ ] Prove cancellation and bounded retry behavior.
- [ ] Verify the collector deployment environment can reach the selected R2
      endpoint.
- [ ] Decide whether `@convex-dev/r2` is used for signed reads and deletion, and
      record the decision in the architecture document or an ADR.

## Phase 0 exit criteria

- [ ] Sanitized Telegram fixtures normalize deterministically.
- [ ] Unknown Telegram constructors remain recoverable and observable.
- [ ] Telegram failures are classified into safe, actionable typed errors.
- [ ] Retry ownership between GramJS and Effect is explicit and tested.
- [ ] Ephemeral-media behavior is proven safe before automatic preservation.
- [ ] The selected R2 route works from the collector deployment environment.

## Research references

- [GramJS error namespace](https://gram.js.org/beta/modules/errors.html)
- [GramJS client retry and flood-sleep options](https://gram.js.org/beta/interfaces/client.telegramBaseClient.TelegramClientParams.html)
- [Telegram RPC error handling and error codes](https://core.telegram.org/api/errors)
- [Telegram file-reference, migration, and download failures](https://core.telegram.org/api/files)
- Installed implementation used for verification:
  `node_modules/telegram/errors`, `node_modules/telegram/client/users.js`, and
  `node_modules/telegram/client/telegramBaseClient.d.ts`
