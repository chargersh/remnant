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
- [x] Propagate unsupported entity warnings from message text and reply quotes.
- [x] Cover raw encoding error paths, resource limits, non-finite values,
      negative zero, and repeated non-circular references.
- [x] Cover the current foundation with unit tests.

## Remaining file-candidate contract work

- [x] Make photo file candidates self-contained by selecting and preserving the
      Telegram photo-size `type` required as `InputPhotoFileLocation.thumbSize`.
- [x] Preserve the parent peer kind/ID and message ID with each discovered file
      so a future queued transfer can refresh an expired or invalid file reference
      by refetching its source message.
- [x] Keep reusable file metadata separate from message-specific source and media
      role information.
- [x] Test reconstructing GramJS document and photo download locations solely
      from the serializable file-candidate contract.

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

- [x] Add `telegram/error-classifier.ts` with an operation-independent
      `classifyTelegramError(cause, context)` function.
- [x] Include safe context: operation name, peer kind/ID when allowed, request
      constructor, attempt number, and observation time. Never include message
      text, session strings, access hashes, file references, filenames,
      credentials, or complete request objects.
- [x] Preserve the original `cause` in Effect `Redacted` for trusted internal
      diagnostics, but expose and log only a safe structured summary.
- [x] Classify in specific-to-general order so recoverable exact errors are not
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

- [x] Unit-test every exported GramJS error class that can be constructed
      without a live Telegram request.
- [x] Test exact-token precedence over broad classes, especially expired file
      references and authorization loss.
- [x] Test redaction: safe summaries must not contain session values, access
      hashes, file references, message content, filenames, credentials, or
      signed URLs.
- [x] Add operation-specific wrappers without duplicating classification. The
      current history, dialog, account-lookup, and client-lifecycle operations
      use the shared classifier; future peer, update, and download operations
      must use the same boundary.
- [x] Decide explicit GramJS values for `requestRetries`,
      `connectionRetries`, `reconnectRetries`, `downloadRetries`, and
      `floodSleepThreshold`; do not silently depend on defaults.
- [x] Define one retry owner for each failure. Document when GramJS retries and
      when Effect retries so the two layers do not multiply attempts.
- [ ] Add structured logging/metrics by safe error category, Telegram RPC code,
      retry delay, and operation.

Implemented retry ownership for the current collector foundation:

- GramJS owns up to 3 immediate request attempts and 3 download attempts.
- Initial connection and automatic reconnection are each bounded at 5 attempts.
- `floodSleepThreshold` is 0, so GramJS does not hold collector capacity while
  waiting. Flood waits escape with their required delay for a future durable
  Effect worker to schedule.
- Current Effect operation wrappers classify escaped failures but do not add a
  second generic retry loop. Future durable workers must retry only categories
  whose policy explicitly allows it.
- Cancellation remains Effect interruption and is not wrapped or retried as a
  Telegram operation failure.

## Telegram client shutdown lifecycle

- [x] Use GramJS `client.destroy()` for terminal Effect-scope finalization so
      the update/ping loop, exported senders, and event handlers are stopped;
      reserve `client.disconnect()` for an intentionally reusable client that
      may reconnect later.
- [x] Make terminal cleanup idempotent and ensure it runs exactly once on
      success, typed failure, defect, and interruption.
- [ ] Verify one-shot commands exit without a delayed update-loop `TIMEOUT`,
      background reconnect, unhandled rejection, or false error log after their
      work and output file have completed.
- [x] Preserve safe classified cleanup diagnostics without turning a successful
      collection into a failure solely because terminal cleanup encountered an
      error.
- [ ] Add a scoped lifecycle test plus a dedicated-account integration check
      that connects, performs one request, finalizes, and proves no GramJS work
      remains active afterward.

## Remaining Telegram fixture and normalization work

The current tests construct useful synthetic GramJS objects. Phase 0 still asks
for sanitized fixtures captured from dedicated test accounts so the code is
validated against real GramJS response shapes.

### Coverage gaps confirmed by the live history probe

- [ ] Complete `MessageMediaWebPage` preservation:
  - [ ] Keep the normalized URL, title, and description already supported.
  - [ ] Discover Telegram-cached `WebPage.photo` and `WebPage.document` assets
        as self-contained file candidates with distinct webpage-preview roles.
  - [ ] Preserve enough source identity to refresh an expired file reference by
        refetching the containing message.
  - [ ] Do not crawl or download the external destination URL; only preserve
        preview assets returned and hosted by Telegram.
  - [ ] Cover full, empty, pending, and unsupported webpage constructors with a
        sanitized real fixture and deterministic normalization tests.
- [ ] Support `MessageMediaPaidMedia` without purchasing or unlocking content:
  - [ ] Normalize the Stars price, item count, and an explicit per-item
        `lockedPreview | availableMedia` state.
  - [ ] Preserve preview dimensions, optional video duration, and inline
        stripped/cached thumbnail bytes returned in
        `MessageExtendedMediaPreview`.
  - [ ] Recursively normalize `MessageExtendedMedia.media` when Telegram has
        already made the full photo/document available, and emit its files
        through the ordinary discovery pipeline.
  - [ ] Never invoke a purchase/unlock operation automatically and never report
        preview-only paid media as fully preserved.
  - [ ] Include price and meaningful item metadata in semantic hashing while
        excluding refreshable access hashes/file references.
  - [ ] Add sanitized fixtures for preview-only, mixed, and fully available
        paid media, including nullable preview fields and multiple items.
- [ ] Preserve downloadable Telegram document thumbnails as file candidates:
  - [ ] Emit candidates for downloadable `PhotoSize` and
        `PhotoSizeProgressive` document thumbnails instead of retaining only
        their dimensions and expected byte sizes.
  - [ ] Include the parent document ID/access hash/file reference/DC plus the
        Telegram thumbnail `type` required to construct the download location.
  - [ ] Give each thumbnail an explicit `documentThumbnail` media role and an
        object identity distinct from the original document, even though both
        use the same Telegram document ID.
  - [ ] Keep `PhotoStrippedSize` and `PhotoCachedSize` bytes inline in metadata;
        do not schedule a redundant Telegram download for bytes already present.
  - [ ] Preserve the containing peer/message source locator so an expired file
        reference can be refreshed before downloading the thumbnail.
  - [ ] Add deterministic tests based on the observed video with an `m`
        thumbnail and cover documents with multiple thumbnail sizes.
- [ ] Support `MessageActionStarGiftUnique` as a structured service action:
  - [ ] Normalize stable gift identity, title/slug/number, supply, ownership and
        transfer state, Stars values, and model/pattern/backdrop attributes.
  - [ ] Discover the nested Telegram model and pattern documents (including
        animated `.tgs` assets) with explicit Star Gift media roles and a
        refreshable containing-message source locator.
  - [ ] Include meaningful Star Gift fields in semantic hashing while excluding
        refreshable file references and other operational download data.
  - [ ] Add a sanitized real fixture based on the observed constructor and test
        structured output, warnings, raw fallback, and file discovery.
- [ ] Support `MessageActionPhoneCall` as a structured, metadata-only service
      action:
  - [x] Preserve the call ID as a decimal string, audio/video mode, optional
    duration, and incoming/outgoing direction already normalized on the
    containing message.
  - [x] Normalize missed, disconnected, hangup, busy, and allow-group-call
    discard reasons as an explicit tagged union with the original Telegram
    constructor retained.
  - [x] Keep `PhoneCallDiscardReasonAllowGroupCall.encryptedKey` in the raw batch
    only; do not expose it in normalized records, logs, or warning context.
  - [x] Treat phone-call actions as metadata only. Do not claim that call audio
    or video recordings are available as discovered files.
  - [ ] Add sanitized fixtures for incoming/outgoing audio and video calls,
        completed durations, missed/busy calls, absent nullable fields, and each
        supported discard reason.
- [ ] Support the group-call service-action family as structured metadata:
  - [x] Normalize `MessageActionGroupCall` with a decimal-string call ID,
        optional duration, sender, direction, and a clear started/ended state.
  - [x] Normalize `MessageActionGroupCallScheduled` with its call ID and
        scheduled timestamp, and `MessageActionInviteToGroupCall` with invited
        user IDs.
  - [x] Keep `InputGroupCall.accessHash` in operational/raw data only; do not
        persist it in UI-facing records or logs.
  - [x] Treat these actions as call-history metadata, not evidence that a live
        stream or recording is available for media preservation.
  - [x] Include meaningful group-call state in semantic hashing and deterministic
        synthetic coverage for started, completed, scheduled, and invitation
        actions, including nullable duration.
  - [ ] Add sanitized real fixtures for started, completed, scheduled, and
        invitation actions.
- [ ] Give aggregated page warnings source provenance such as Telegram message
      ID and message index so repeated constructors remain attributable, while
      retaining the warning on its individual message envelope.
- [ ] Extend the discovered-file contract beyond `primary | videoCover` and
      top-level `messageMedia` so document thumbnails, webpage previews, and
      service-action assets have explicit, type-safe source roles.

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

## Reply, comment, and thread preservation

- [ ] Preserve ordinary same-dialog replies in users, Saved Messages, basic
      groups, and supergroups as normal messages with `replyToMessageId`,
      `replyToPeer`, quote metadata, and `replyToTopId` when Telegram supplies
      them.
- [ ] Keep a reply relationship even when its parent is outside the current
      history window, deleted, or otherwise unavailable; resolve the parent
      later without dropping the reply.
- [ ] Preserve channel-comment routing metadata from `MessageReplies`, including
      whether the thread is comments, the linked discussion peer, and the
      channel post/thread anchor—not only `replyCount`.
- [ ] For albums, identify the grouped sibling that owns `MessageReplies` as the
      comment-thread anchor and expose one aggregate reply state for the album.
- [ ] Backfill complete channel-comment and other explicit thread histories with
      bounded, resumable `messages.getReplies` pagination; storing a count alone
      is not reply preservation.
- [ ] Cover forum-topic roots and replies without conflating topic anchoring,
      direct message replies, and channel discussion comments.
- [ ] Capture new, edited, and deleted replies through live update handlers,
      including replies in linked discussion groups.
- [ ] Deduplicate replies by peer kind/ID plus message ID when the same reply is
      encountered through both normal dialog history and explicit thread fetch.
- [ ] Store reply pages in required raw batches and normalize reply text,
      entities, media, service actions, and discovered files through the same
      pipeline as other messages.
- [ ] Add sanitized real fixtures and integration coverage for a user-to-user
      reply, group reply, forum topic, channel comment thread, and album whose
      `MessageReplies` metadata exists on only one grouped sibling.

## Reaction preservation

- [ ] Normalize `MessageReactions` into mutable message `currentState`; reaction
      changes must not create immutable message revisions.
- [ ] Support `ReactionEmoji`, `ReactionCustomEmoji`, `ReactionPaid`, and
      `ReactionEmpty` with explicit tagged contracts and decimal-string custom
      emoji document IDs.
- [ ] Preserve aggregate `ReactionCount` values, the authenticated account's
      selection/`chosenOrder`, and Telegram's `min`, `canSeeList`, and
      `reactionsAsTags` completeness flags.
- [ ] Preserve recent peer reactions and top-reactor summaries only when
      Telegram supplies them, including peer identity, date, unread/my/big
      state, counts, and anonymous reactors without inventing an identity.
- [ ] Decide identity retention explicitly before schema work. Recommended
      initial scope: current aggregates plus Telegram's currently visible
      recent/top reactors, not a fabricated historical reaction timeline.
- [ ] Resolve custom-emoji reaction documents through the reusable custom-emoji
      asset pipeline without treating a document ID alone as downloadable file
      metadata.
- [ ] Apply `UpdateMessageReactions` through live handlers and reconcile missed
      updates during message refresh/backfill idempotently.
- [ ] Keep reactions in raw batches even when a new reaction constructor is not
      normalized; emit an observable warning rather than failing the page.
- [ ] Add sanitized fixtures and deterministic tests for no reactions, ordinary
      emoji, custom emoji, paid reactions, the account's selected reaction,
      anonymous/top reactors, partial (`min`) results, and live count changes.

## Ephemeral-media safety validation

- [ ] Distinguish an accessible ephemeral file from an already unavailable
      ephemeral shell during normalization:
  - [ ] When `MessageMediaPhoto.photo` or `MessageMediaDocument.document` is
        absent but a positive TTL remains, preserve the TTL/mode and set
        `preservationResult: "unavailable"` instead of leaving it `"pending"`.
  - [ ] Use an explicit `ephemeralMediaUnavailable` warning/reason rather than
        the generic `emptyPhoto`/`emptyDocument` warning, while avoiding an
        unsupported claim about whether it expired, was opened, or was consumed.
  - [ ] Emit no file candidate and schedule no futile download when Telegram
        provides no photo/document identity or location.
  - [ ] Keep ordinary non-ephemeral empty photo/document constructors distinct
        from unavailable timed/view-once media.
  - [ ] Add a derived `expiredMediaPlaceholder` presentation for unavailable
        ephemeral media so the UI can render Telegram-style service-like
        “photo/video expired” history entries without changing the underlying
        source discriminator from `kind: "message"` to `kind: "service"`.
  - [ ] Test that placeholder presentation retains the original media subtype,
        TTL/mode, sender, direction, and timestamp while exposing no nonexistent
        file or download action.
  - [ ] Include the terminal unavailable state and original TTL semantics in
        semantic content and user-visible preservation status.
- [ ] Add sanitized fixtures for accessible and already unavailable timed
      photos/documents plus accessible and unavailable view-once variants.
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
- [x] Telegram failures are classified into safe, actionable typed errors.
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
