# Telegram Message Preservation Architecture

Status: proposed source of truth for the message-preservation phase  
Last reviewed: 2026-08-13  
Applies to: `apps/collector`, `packages/backend`, `apps/web`  
Primary storage: Convex for structured state; private Cloudflare R2 for bytes

## Purpose

This document defines how Remnant will track a Telegram dialog and preserve the
chat that the connected Telegram account can access. It is intended to prevent
the data model, collector, storage workflow, and product semantics from being
redesigned independently during implementation.

The design answers these questions:

- What Telegram considers a message, attachment, document, service event, edit,
  deletion, and profile change.
- Which data belongs in Convex and which bytes belong in Cloudflare R2.
- Whether the Convex Cloudflare R2 component fits an always-on collector.
- How initial history backfill and live updates work at the same time.
- How tracking can stop and resume without corrupting or deleting preserved data.
- How the system handles very large histories and large media files.
- How to preserve source fidelity without copying Telegram's entire evolving TL
  schema into the application database.

This is an architecture and implementation plan. It is not a claim that every
field shown here must be delivered in the first pull request.

## Product guarantee and unavoidable limits

The product should make this guarantee:

> From the moment tracking begins, Remnant preserves every accessible supported
> message and media object it observes, and imports as much existing history as
> Telegram still makes available to the connected account.

Remnant cannot honestly guarantee recovery of:

- Content deleted before Remnant observed it.
- Media that became unavailable before it was downloaded.
- History no longer available to the connected account after leaving, being
  banned, or losing access to a private dialog.
- Expiring or view-once media that becomes unavailable before the collector
  stores it.
- Protected content that Telegram does not permit the account/client to save.
- Every change that occurred while the collector was offline if Telegram no
  longer retains the corresponding update or source state.
- Secret-chat history through the normal cloud-message pipeline. Secret chats
  are a distinct encrypted protocol and are out of scope until explicitly
  designed.

The UI must describe partial or unavailable content accurately rather than
pretending that a backup is complete.

## Architectural decisions

These decisions are the foundation of the phase:

1. Remnant follows Telegram's conceptual data model rather than creating
   unrelated tables for text, voice, video, sticker, and file messages.
2. There is one current Convex record per Telegram message.
3. An ordinary message has text plus at most one top-level Telegram media union
   value. A media value may reference one or more reusable file records.
4. Text accompanying media is the message's `text`; it is not stored in a
   separate caption system.
5. Albums remain separate Telegram messages connected by `groupedId`.
6. Actual downloaded bytes are stored in a private Cloudflare R2 bucket, never
   in Convex file storage or Convex documents.
7. The always-on collector is the R2 upload data plane. Convex is the control
   plane and source of structured application state.
8. Large files use the R2 S3-compatible multipart API. They are not passed
   through a Convex action as a `Blob` or `Buffer`.
9. Semantic message edits create immutable revisions. Frequently changing
   counters generally update current state without creating revisions.
10. The collector starts live update handling before or concurrently with old
    history backfill.
11. All ingestion and storage operations are idempotent and resumable.
12. Stopping tracking preserves already stored data. Permanent deletion is a
    separate, explicit operation.
13. Unknown Telegram constructors are retained through an unsupported/raw
    fallback instead of failing the entire sync.
14. Raw Telegram source batches are compressed into R2 as a core
    preservation layer for reprocessing, while application queries use
    normalized Convex records.
15. When technically accessible, expiring and view-once media is copied to R2
    immediately and retained permanently. The collector must not intentionally
    mark it viewed merely to obtain the bytes.
16. Every tracked dialog uses graduated history checkpoints, age/size media
    bands, ordered priorities, a soft storage target with protected reserve,
    and a hard safety limit. Work that cannot run becomes visible review or
    deferred work rather than silently consuming unbounded resources.

## Telegram's actual model

Telegram uses a tagged-union schema called TL. At the top level, `Message` has
three constructors:

```text
Message
├── message         ordinary user/channel message
├── messageService  chat event represented by MessageAction
└── messageEmpty    missing, deleted, or unavailable placeholder
```

An ordinary `message` contains common envelope fields and optional content:

```text
message
├── id
├── peer_id
├── from_id?
├── date
├── message                 text or media caption; may be empty
├── entities[]?             formatting and semantic spans
├── media?: MessageMedia    one tagged media value
├── reply_to?
├── fwd_from?
├── grouped_id?             connects album items
├── edit_date?
├── reactions?
├── replies/views/forwards?
└── flags
```

There is no top-level Telegram `AudioMessage`, `VideoMessage`, or
`StickerMessage`. Those are ordinary messages whose media and document
attributes tell clients how to present them.

Primary references:

- [Telegram Message type](https://core.telegram.org/type/Message)
- [Telegram message constructor](https://core.telegram.org/constructor/message)
- [Telegram MessageMedia union](https://core.telegram.org/type/MessageMedia)
- [Telegram Document type](https://core.telegram.org/type/Document)
- [Telegram DocumentAttribute union](https://core.telegram.org/type/DocumentAttribute)
- [Telegram MessageAction union](https://core.telegram.org/type/MessageAction)

### How common visible messages map to Telegram

| Visible in Telegram | Telegram representation |
| --- | --- |
| Plain text | Ordinary `message`; non-empty `message` string; no media |
| Unicode emoji | Ordinary text in the `message` string |
| Custom emoji | Text plus `messageEntityCustomEmoji` referencing a reusable document |
| Text with attachment | One ordinary message with both text and media |
| Attachment without text | The same ordinary message with an empty text string |
| Photo | `messageMediaPhoto` containing a `Photo` |
| Voice note | `messageMediaDocument` containing a `Document`; audio attribute has `voice` |
| Music/audio file | Document with an audio attribute without `voice` |
| Round video | Document with a video attribute having `round_message` |
| Normal video | Document with a video attribute without `round_message` |
| Generic file | Document, usually with a filename attribute |
| Sticker | Document with a sticker attribute |
| GIF/animation | Document with an animated attribute; Telegram GIFs are usually silent MP4 |
| Album | Multiple ordinary messages sharing the same `grouped_id` |
| Link preview | `messageMediaWebPage` |
| Poll | `messageMediaPoll` |
| Contact | `messageMediaContact` |
| Location | `messageMediaGeo` or `messageMediaGeoLive` |
| Venue | `messageMediaVenue` |
| Dice/slot game | `messageMediaDice` |
| Shared story | `messageMediaStory` |
| Giveaway | `messageMediaGiveaway` or result variant |
| Paid media | `messageMediaPaidMedia`, with preview or purchased extended media |
| To-do list | `messageMediaToDo` in newer Telegram layers |
| Member/title/photo event | `messageService` containing a `MessageAction` |

Telegram documents are classified through attributes. One document can have
multiple attributes, so classification order matters:

```text
custom emoji
  before sticker
  before voice
  before round video
  before animation/GIF
  before audio
  before video
  before image-like document
  before generic file
```

Examples:

- A video sticker has both sticker and video information and must render as a
  sticker.
- A GIF can have both animated and video information and must render as an
  animation.
- A voice note is an audio document with the voice flag.
- A round video is a video document with the round-message flag.

Remnant stores both the Telegram source type and a derived presentation type:

```ts
{
  telegramMediaType: "document",
  presentation: "voice",
}
```

The presentation value is a convenience for the UI. It must never replace the
original Telegram semantics.

### Expiring and view-once media

Telegram represents expiring photos/documents with a non-zero `ttl_seconds`.
For non-secret cloud chats:

- `0 < ttl_seconds < 0x7fffffff` means the destruction timer begins when the
  recipient explicitly opens or starts playing the media.
- `ttl_seconds === 0x7fffffff` means view once; Telegram clients remove their
  local copy when the viewer/player closes.

Remnant's chosen product behavior is permanent preservation when the connected
account can technically access the bytes. This is an intentional decision, not
an assumption that Telegram considers the content ordinary media.

The collector must:

1. Detect the ephemeral classification during message normalization.
2. Give accessible ephemeral media a high-priority transfer because its source
   can disappear at any time.
3. Attempt the download without calling `messages.readMessageContents` or
   `channels.readMessageContents` merely to unlock or consume it.
4. Never intentionally mark view-once media viewed on the user's behalf.
5. Store the original TTL semantics even after the bytes are permanent in R2.
6. Record whether preservation succeeded, failed, or was already unavailable.
7. Avoid retry behavior that repeatedly triggers Telegram read/open side
   effects if GramJS or Telegram changes the download flow.

Representative metadata:

```ts
ephemeral?: {
  mode: "timed" | "viewOnce";
  ttlSeconds?: number;
  preservationAttemptedAt?: number;
  preservationResult:
    | "pending"
    | "stored"
    | "unavailable"
    | "failed";
};
```

Important constraints:

- This can preserve only media still accessible when the collector attempts the
  download.
- Telegram may change server/client enforcement, so successful downloading is
  not guaranteed.
- Automatic retrieval must be tested against a dedicated Telegram test account
  to prove whether downloading bytes changes the viewed state for every media
  subtype supported by the installed GramJS version.
- Secret-chat ephemeral media remains out of scope; it uses a separate encrypted
  protocol and lifecycle.

Reference: [Telegram view and expiring-media rules](https://core.telegram.org/api/views)

### Text entities

Telegram stores formatting and semantic spans separately from the text. These
include bold, italic, underline, strike, spoiler, code, preformatted text,
blockquote, URLs, text URLs, mentions, hashtags, commands, phone numbers, and
custom emoji.

Entity offsets and lengths are measured in UTF-16 code units. Remnant must
preserve the original offsets exactly and avoid recomputing them using Unicode
code points.

Custom emoji entities reference a reusable Telegram document. The document
should be downloaded once per account/file identity and reused by all messages.

References:

- [Telegram styled text entities](https://core.telegram.org/api/entities)
- [Telegram custom emoji](https://core.telegram.org/api/custom-emoji)

### Files, photos, previews, and qualities

Telegram `Photo` and `Document` are different source types:

- Photos provide several sizes/previews.
- Documents provide MIME type, size, thumbnails, video thumbnails, data-center
  information, and document attributes.
- A live photo can include both the still photo and a short video document.
- Paid media can contain multiple extended items.
- A document can expose alternate video qualities or a separate video cover.

Remnant's default preservation policy is:

- Download the primary/original accessible object.
- Preserve metadata describing Telegram thumbnails and alternative qualities.
- Keep Telegram's tiny stripped preview when useful for immediate UI display.
- Generate Remnant display thumbnails from the preserved original later.
- Do not download every Telegram thumbnail or every alternate video quality by
  default.
- Preserve an independent cover or live-photo video when it represents content
  that cannot be reconstructed from the primary object.

This avoids multiplying storage usage while retaining the original content.

### Service messages

`messageService` represents chat history events rather than human-authored text.
Its `action` can describe title/photo changes, users joining or leaving, pinned
messages, migrations, calls, topic changes, TTL changes, gifts, and many other
events.

Service messages must be stored in the message timeline. They are evidence of
dialog history and sometimes contain the only discoverable record of a dialog
metadata change.

Unknown service actions use a fallback containing the Telegram constructor name
and raw source reference. A new Telegram action must not make message ingestion
fail.

### Installed GramJS version versus Telegram's current layer

At the time of this document, the repository uses GramJS `2.26.22`. Its
generated API types expose the message/media constructors known to that release.
Telegram's public schema evolves and may contain newer constructors before the
installed GramJS version supports them.

Therefore:

- Pin and record the GramJS version in each raw import manifest.
- Record the Telegram layer or schema information available to the collector.
- Log unsupported constructors as structured warnings.
- Store a raw fallback when serialization is possible.
- Upgrade GramJS intentionally and test normalizers against fixtures before
  deploying.

## Cloudflare R2 storage decision

### Decision

Use a private Cloudflare R2 bucket for all preserved bytes. The collector uploads
directly through R2's S3-compatible API using bucket-scoped credentials.

```text
Telegram MTProto
       │
       │ chunks
       ▼
always-on collector
       │
       ├── message metadata batches ─────────► Convex
       │
       └── original file bytes
              │ S3 PUT or multipart upload
              ▼
          private R2 bucket
              │
              └── object key/checksum/state ─► Convex
```

Convex remains responsible for:

- Tracking authorization and lifecycle state.
- Reserving file records and stable object keys.
- Coordinating jobs, leases, retries, and cancellation generations.
- Storing message/file metadata and checksums.
- Issuing authorized, short-lived read URLs to the web app.
- Scheduling deletion and reconciliation operations.

The collector is responsible for:

- Fetching bytes from Telegram.
- Calculating content checksums.
- Uploading small objects with a single PUT.
- Uploading large objects with multipart upload.
- Reporting progress and final object metadata to Convex.
- Aborting or leaving recoverable multipart state when tracking stops.

### Why the collector is the upload data plane

The collector already holds the sensitive Telegram session and runs as a
long-lived server process. It can control Telegram download concurrency, observe
flood waits, stream chunks, spool to temporary disk when needed, and resume
large jobs.

Sending Telegram media through Convex would add an unnecessary network hop and
conflict with Convex action memory/time limits. Convex actions have bounded
runtime and memory; they should coordinate storage rather than proxy multi-GB
media.

Cloudflare recommends its S3-compatible API for high-throughput object work. A
single PUT is suitable for small/medium objects, while multipart is intended for
large video, backups, resumability, and parallelism.

References:

- [R2 upload methods and multipart behavior](https://developers.cloudflare.com/r2/objects/upload-objects/)
- [R2 limits](https://developers.cloudflare.com/r2/platform/limits/)
- [R2 S3 SDK usage](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/)
- [Convex action limits](https://docs.convex.dev/production/state/limits)

### Evaluation of `@convex-dev/r2`

The [Convex Cloudflare R2 component](https://www.convex.dev/components/cloudflare-r2)
is compatible with Remnant, but it should not be the large-file ingestion path.

Useful component capabilities:

- Generate signed single-PUT upload URLs.
- Generate signed download URLs.
- Synchronize R2 `HEAD` metadata into a component-owned Convex table.
- Delete objects with an action retrier.
- Store a server-generated/downloaded in-memory `Blob`, `Buffer`, or
  `Uint8Array` from a Convex action.

Important current limitations for this workload:

- `r2.store()` accepts an in-memory value and uses `PutObject`; it does not take
  a Node stream from the external collector.
- The implementation converts a `Blob` to an in-memory `Uint8Array` in Node.
- `generateUploadUrl()` signs a single `PutObject` operation. It is not a
  multipart session and is not resumable.
- A failed single PUT must restart the entire upload.
- Its generic metadata table is not a replacement for Remnant's domain-specific
  `telegramFiles` state, ownership, references, checksum policy, or job state.

The component is still a reasonable optional helper for:

- Authorized signed reads from a private bucket.
- R2 metadata synchronization after the collector finalizes an upload.
- Retried deletion during an explicit preserved-data purge.
- Small browser-originated uploads unrelated to Telegram ingestion.

Recommended adoption strategy:

1. Do not make initial collector uploads depend on the component.
2. Use the AWS S3 SDK from `apps/collector`, including `@aws-sdk/lib-storage` or
   explicit multipart commands.
3. Keep the bucket private.
4. Either use the component for signed reads/deletion or implement the small
   equivalent Convex actions directly. Make this choice during the first R2
   integration spike.
5. If the component is used, treat its metadata as an auxiliary R2 registry;
   `telegramFiles` remains the application source of truth.
6. After direct upload, explicitly request metadata synchronization or perform a
   `HeadObject` verification before marking a file stored.

Do not install `@convex-dev/r2` until that spike selects it. Package changes must
be performed with Bun according to repository rules.

### Why not presigned PUT for every collector upload

A Convex mutation could generate a signed PUT URL, and the collector could PUT
bytes without storing permanent R2 credentials. This is attractive for small
files and remains a valid fallback.

It is not the default for the media pipeline because:

- A signed `PutObject` URL is not resumable.
- Large videos should use multipart upload.
- Multipart requires create/upload-part/complete operations and durable upload
  state.
- The collector is already a trusted server, not an untrusted browser.
- Short-lived URLs add control-plane calls during high-volume backfills.

If credential minimization later outweighs this complexity, Convex or a
dedicated signer can issue short-lived multipart credentials/part URLs. That is
an optimization, not a phase-one requirement.

### R2 object rules

- Bucket is private. Do not enable `r2.dev` public access.
- Web playback uses short-lived signed GET URLs after application authorization.
- Presigned URLs are bearer tokens and must not be logged or persisted in
  message records.
- R2 credentials are scoped to the one preservation bucket and stored only in the
  collector/Convex secret environments that need them.
- All traffic uses TLS; R2 also encrypts objects at rest.
- Object keys contain no message text, username, original filename, phone
  number, or other personal information.
- Original filenames live only in authorized metadata.
- Object keys are immutable after successful finalization.
- R2 ETags are not treated as SHA-256. Multipart ETags have different semantics.
- Remnant computes and stores its own SHA-256 while downloading/uploading.

Suggested key layout:

```text
accounts/{opaqueAccountId}/objects/{fileRecordId}/{randomObjectVersion}
accounts/{opaqueAccountId}/raw/{yyyy}/{mm}/{rawBatchId}.jsonl.zst
```

Do not use Telegram usernames or dialog titles in keys. A stable Convex ID or
random identifier is preferable to an unsanitized Telegram ID.

### R2 cost behavior

R2 charges for stored bytes and Class A/Class B operations. Internet egress from
R2 is currently free, but requests are not. Standard storage currently includes
a free tier and has no minimum retention duration; Infrequent Access has
retrieval charges and a minimum duration.

Use Standard storage initially because Remnant media may be viewed soon after
capture and stopped datasets may be deleted. Revisit storage classes only after
real access metrics exist.

Cost controls:

- One original object per reusable Telegram file identity within an account.
- Check the file reservation before downloading/uploading.
- Do not download every thumbnail or alternate quality.
- Batch Convex message ingestion.
- Avoid `HeadObject` on every read; verify on upload and periodic audits.
- Generate signed URLs only for media visible or about to be played.
- Do not revision reaction/view counters continuously.
- Use bounded media concurrency.
- Track bytes stored, pending, downloaded, failed, and served per account.

Reference: [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)

## Smart preservation for large histories and files

Supporting enormous histories and multi-gigabyte media does not mean Remnant
should accept unlimited cost or make a binary "small/large" decision. The final
model uses concrete history scope, age-and-size media bands, ordered work
priorities, and a soft storage target with protected capacity for important new
work.

The UI asks understandable questions such as "How far back is media particularly
important?" and "How much storage should this dialog normally use?" The durable
policy stores the resulting decisions so every collector instance behaves the
same way after restarts and deployments.

Representative policy:

```ts
type TelegramPreservationPolicy = {
  historyScope:
    | { type: "full" }
    | { type: "since"; since: number }
    | { type: "latestMessages"; count: number };

  recentMediaSince: number;

  mediaBands: {
    live: {
      autoPreserveMaxBytes: number;
    };
    recentHistory: {
      autoPreserveMaxBytes: number;
      reviewMaxBytes: number;
    };
    olderHistory: {
      autoPreserveMaxBytes: number;
    };
  };

  storage: {
    softTargetBytes: number;
    liveSafetyReserveBytes: number;
    hardSafetyLimitBytes: number;
    maxPendingMediaBytes?: number;
  };

  largeBackfillApprovedAt?: number;
  policyVersion: number;
};
```

The exact byte and message thresholds are product configuration, not schema
constants. Tune them after measuring real dialogs and actual Convex/R2 costs.

### History preflight without duplicate work

The first `messages.getHistory` request is also the first real preservation
page. For example, request the newest 100 messages, store its required raw batch
and normalized messages, and read the response's server-calculated `count`.
Telegram may mark the count `inexact`, so display it as an estimate when needed.
Do not make a separate `getHistory(limit: 1)` request and then fetch the same
history again.

For a history large enough to require a user decision, make one optional
`messages.getSearchCounters` request containing several Telegram media filters.
It returns server-side counts for categories such as photos, videos, documents,
voice messages, and audio without returning all matching messages. Treat the
counts as estimates, do not assume categories can safely be summed, and cache
the result. Skip this request for clearly small dialogs.

Neither API gives the total media bytes. As the chosen history is scanned,
Remnant reads the size fields available in message media metadata and builds a
progressive estimate without downloading the objects. Every scanned page is
real preservation work; there is no throwaway full-history inventory pass.

Representative estimate state:

```ts
type TelegramHistoryEstimate = {
  estimatedMessageCount?: number;
  messageCountIsInexact?: boolean;
  estimatedMediaCounts?: Partial<
    Record<"photo" | "video" | "document" | "voice" | "audio", number>
  >;
  scannedMessageCount: number;
  discoveredMediaCount: number;
  discoveredMediaBytes: number;
  oldestScannedAt?: number;
  updatedAt: number;
};
```

### Several history-size checkpoints

Use graduated checkpoints rather than one large-history cutoff. Illustrative
starting bands are:

```text
small       up to 5,000 messages       continue full metadata automatically
medium      5,001–50,000               continue for private chats with visible progress
large       50,001–250,000             ask for all / since date / latest N
very large  more than 250,000          require an explicit bounded choice or
                                       confirmation of the full estimate
```

These values must remain configurable and should change after load/cost tests.
The decision flow is more important than the initial numbers:

1. Start live update tracking immediately.
2. Preserve the first real history page and obtain the approximate count.
3. Continue automatically when the work is clearly modest.
4. For larger histories, keep live tracking active but pause older-history work
   at its committed cursor while the user chooses `full`, `since`, or
   `latestMessages`.
5. Resume newest-to-oldest without refetching or rewriting the first page.
6. Continuously show messages scanned, known media bytes, oldest preserved date,
   and approximate work remaining.

Message count and byte pressure are independent: many tiny messages can be
expensive in Convex even without media, while a short dialog can contain a few
enormous videos.

Groups, supergroups, and channels receive stricter defaults. They begin with a
bounded recent scope and require explicit approval before a large or very large
backfill expands. A public channel must never silently create millions of
Convex documents or terabytes of R2 objects.

### Age-and-size media bands

There is no single universal "large file" threshold. More recent media is more
at risk and receives a larger automatic allowance; old media receives a smaller
allowance and is available on demand.

An illustrative starting matrix is:

| Media age | Automatically preserve | Add to review | Leave on Telegram |
| --- | ---: | ---: | ---: |
| Expiring/view-once | Attempt immediately, subject only to the hard safety limit | — | Only when inaccessible |
| New/live | Up to 700 MiB | Over 700 MiB | If declined |
| Newer than `recentMediaSince` | Up to 250 MiB | 250 MiB–1 GiB | Over 1 GiB |
| Older than `recentMediaSince` | Up to 25 MiB | Do not interrupt | Over 25 MiB |

The user chooses `recentMediaSince` through friendly presets such as 30 days,
six months, one year, or a custom date. The advanced byte thresholds can remain
application defaults initially instead of burdening the user with technical
configuration.

Do not create a modal or notification for every historical file. Aggregate
recent large files into one review queue with file count and known total bytes:

```text
14 large files from the selected recent period (18.4 GiB known)
Preserve all | Review files | Leave on Telegram
```

Old large media does not interrupt the user. Its message remains renderable with
metadata and an on-demand **Preserve now** action. Until downloaded, the UI must
say that the bytes still depend on Telegram and may disappear.

### Derive urgency instead of storing many priority types

Do not add database enums for ephemeral, live, recent, old, or scheduler lanes.
The worker can derive them from data already stored:

- Ephemeral comes from the message media's TTL/view-once metadata.
- Live means the message arrived after tracking started rather than through the
  initial-history job.
- Recent versus old comes from `sentAt` compared with `recentMediaSince`.
- An explicit request needs only one optional `requestedAt` timestamp on the
  file.

Clicking **Preserve now** sets `requestedAt` and requeues the file. It does not
erase the file's original age or make a huge old file more urgent than
ephemeral/new content. The timestamp also provides durable FIFO ordering among
explicit requests after a restart; no separate approval object or priority enum
is required.

Scheduling is a small runtime rule rather than persisted taxonomy:

1. Attempt ephemeral work first.
2. Always leave transfer capacity for live incoming media.
3. Give requested files prompt progress through the remaining capacity.
4. Use otherwise idle capacity for automatic recent/old history.

This is fair scheduling, not a strict global queue. A requested 20 GiB old file
can continue chunk by chunk while ephemeral and live work retain capacity.
Unused capacity may be borrowed, and a background multipart transfer yields at
a safe part boundary when urgent work arrives. Exact concurrency belongs in
collector configuration and load tests, not in the database schema.

Do not use AI or content inspection to guess that a sticker, document, or video
is "junk." Remnant cannot know personal importance reliably. Use observable
signals: ephemeral, explicitly requested, live, recent, size, and whether the
user encountered the message.

### Soft target, live safety reserve, and hard safety limit

`softTargetBytes` is the dialog's normal automatic-storage target, not a cutoff
that rejects everything afterward. `liveSafetyReserveBytes` is capacity
historical work—including explicitly requested old files—cannot silently
consume. It remains available only for ephemeral and new incoming media.

For a 10 GiB soft target with a 3 GiB live safety reserve, automatic history
work may use roughly 7 GiB. Near the soft target:

- Stop or defer ordinary older-history downloads.
- Continue eligible small new media using the reserve.
- Continue attempting ephemeral/view-once media with highest priority.
- Ask before a new unusually large file consumes substantial reserve.
- Requeue an old file when the user explicitly clicks **Preserve now**, but do
  not let it consume the live safety reserve.

If a requested historical file would exceed the soft target, show its known
size and ask for confirmation. The confirmed click itself is the approval and
is represented by `requestedAt`; do not add a separate per-file approval
record. It may use explicitly available headroom above the soft target only
while the live safety reserve remains protected.

`hardSafetyLimitBytes` is the final cost guardrail. Work that would cross it
requires explicit approval or a raised account/dialog limit, including
ephemeral and user-requested work. The UI must clearly explain that an
inaccessible ephemeral file may be lost while capacity approval is pending.

The scheduler must check dialog and account-level limits plus concurrently
claimed bytes atomically before claiming a transfer. A historical or requested
file must fit below `hardSafetyLimitBytes - liveSafetyReserveBytes`. Ephemeral
and live work may use the reserved portion up to the hard safety limit. If a
requested file does not fit, the user must first raise the dialog/account limit;
another approval field is unnecessary. Already preserved objects are never
automatically evicted merely to make room.

### Decision and deferred transfer states

`telegramFiles.transferState` includes:

```ts
| "deferredByPolicy"
| "deferredByBudget"
```

`deferredByPolicy` means the age-and-size rules make the file on-demand only,
the file awaits a decision in the aggregated review queue, or the user declined
it. An old multi-gigabyte video is the typical example. The UI derives the
appropriate explanation from the current band, age, size, and `requestedAt`;
there is no separate awaiting-decision state or defer-reason enum.

`deferredByBudget` means the file is otherwise eligible, but current soft-target
pressure, protected reserve, pending-work limit, or hard safety limit prevents
the scheduler from starting it.

Both deferred states preserve the message, media metadata, raw source, known
size, and refreshable Telegram source locator. No R2 object is claimed to exist.
Policy/budget changes or an explicit **Preserve now** action can requeue the
file without rewriting the message.

Deferral is not a transfer failure. `failed` means Remnant attempted an eligible
transfer and encountered an error; `unavailable` means Telegram no longer
exposes the bytes.

## Proposed data model

The following is a logical schema. Exact Convex validators should be introduced
in small modules and can refine field names, but they must preserve these
boundaries.

### Existing `telegramDialogs`

Continue using this table for current dialog state and add lifecycle fields as
needed:

```ts
trackingState:
  | "notTracked"
  | "starting"
  | "tracking"
  | "stopping"
  | "stopped"
  | "error";

trackingGeneration: number;
trackingStartedAt?: number;
trackingStoppedAt?: number;
trackingError?: string;

backfillState?:
  | "notStarted"
  | "running"
  | "paused"
  | "completed"
  | "error";

oldestPreservedMessageId?: number;
oldestPreservedMessageDate?: number;
latestPreservedMessageId?: number;

preservationPolicy: TelegramPreservationPolicy;
```

`trackingEnabled` can temporarily remain as a compatibility/UI field, but the
state machine becomes authoritative once introduced.

### `telegramDialogRevisions`

Purpose: immutable snapshots of meaningful dialog/profile metadata changes.

Representative fields:

```ts
{
  accountId,
  dialogId,
  revisionNumber,
  observedAt,
  source: "initial" | "update" | "reconcile" | "serviceMessage",

  name,
  username?,
  usernames?,
  about?,
  photoIdentity?,
  availability,
  dialogType,
  flags,

  semanticHash,
}
```

Create a revision only when normalized meaningful metadata changes. Updating
`lastSeenAt` alone does not create a revision.

### `telegramMessages`

Purpose: current query-optimized representation of one Telegram message.

Stable identity/index:

```text
accountId + dialogId + telegramMessageId
```

Representative fields:

```ts
{
  accountId,
  dialogId,
  telegramMessageId,

  telegramConstructor: "message" | "service" | "empty",
  sender?: {
    peerKind: "user" | "chat" | "channel",
    peerId: string,
  },
  peer: {
    peerKind: "user" | "chat" | "channel",
    peerId: string,
  },

  sentAt?,
  text?,
  entities?,
  media?,
  serviceAction?,

  reply?,
  forward?,
  groupedId?,

  editDate?,
  semanticHash,
  semanticVersion,

  currentState?: {
    reactions?,
    pollResults?,
    views?,
    forwards?,
    replyCount?,
    pinned?,
  },

  deletionObservedAt?,
  deletionObservedVia?:
    | "telegramUpdate"
    | "messageReconciliation"
    | "telegramEmptyMessage",

  firstObservedAt,
  lastObservedAt,
  rawSourceBatchId?,
}
```

Convex messages are limited to 1 MiB. Normalizers must bound nested arrays and
route unexpectedly large or unknown payloads to raw R2 storage rather than
allowing a batch to fail.

Recommended indexes:

```text
by_accountId_dialogId_telegramMessageId
by_dialogId_sentAt
by_dialogId_telegramMessageId
by_dialogId_groupedId
by_dialogId_deletionObservedAt
```

Use paginated queries for chat history. Never collect an entire dialog in one
Convex query.

### Embedded media union

Small Telegram media metadata belongs in the message record as a discriminated
union. Downloadable objects reference `telegramFiles`.

Illustrative subset:

```ts
type TelegramMessageMedia =
  | {
      telegramType: "photo";
      primaryFileId?: Id<"telegramFiles">;
      livePhotoVideoFileId?: Id<"telegramFiles">;
      spoiler: boolean;
      ttlSeconds?: number;
    }
  | {
      telegramType: "document";
      presentation:
        | "customEmoji"
        | "sticker"
        | "voice"
        | "roundVideo"
        | "animation"
        | "audio"
        | "video"
        | "imageFile"
        | "file";
      primaryFileId?: Id<"telegramFiles">;
      videoCoverFileId?: Id<"telegramFiles">;
      spoiler: boolean;
      ttlSeconds?: number;
    }
  | {
      telegramType: "webPage";
      url: string;
      title?: string;
      description?: string;
      previewFileId?: Id<"telegramFiles">;
    }
  | {
      telegramType: "contact";
      firstName: string;
      lastName: string;
      phoneNumber: string;
      vcard: string;
      telegramUserId?: string;
    }
  | {
      telegramType: "geo" | "geoLive" | "venue";
      // normalized location fields
    }
  | {
      telegramType: "poll";
      // question/options/current results
    }
  | {
      telegramType: "dice";
      emoticon: string;
      value: number;
    }
  | {
      telegramType: "paidMedia";
      items: PaidMediaItem[];
    }
  | {
      telegramType: "unsupported";
      telegramConstructor: string;
      rawSourceBatchId: Id<"telegramRawBatches">;
    };
```

Most Telegram messages have zero or one downloadable primary object. Exceptional
media such as paid media and live photos can reference more than one file.
Avoid a generic attachment join table until real access/query patterns require
one; embedding the small list of file IDs saves reads in the chat UI.

### `telegramMessageRevisions`

Purpose: immutable prior semantic versions of an edited message.

```ts
{
  accountId,
  dialogId,
  messageId,
  telegramMessageId,
  version,
  observedAt,
  replacedAt,
  source: "editUpdate" | "reconcile",

  text?,
  entities?,
  media?,
  reply?,
  forward?,
  replyMarkup?,
  semanticHash,
  rawSourceBatchId?,
}
```

Store a complete semantic snapshot rather than a diff. Complete snapshots are
simpler to validate and restore, and edits are uncommon compared with reads.

Do not create revisions for every reaction, view, forward, or reply-count
change. Those belong to current state unless product requirements later demand
an audit trail.

### `telegramFiles`

Purpose: reusable logical file identity plus preservation state.

Recommended uniqueness during the first phase:

```text
accountId + telegramObjectKind + telegramFileId
```

Do not deduplicate across accounts initially. Cross-account deduplication adds
authorization, reference counting, deletion, and privacy risks. Within one
account, repeated stickers, custom emoji, forwarded documents, and repeated file
identities can reuse one stored object.

Representative fields:

```ts
{
  accountId,
  telegramObjectKind: "document" | "photo" | "webDocument",
  telegramFileId: string,

  presentation?,
  mimeType?,
  originalFileName?,
  expectedSize?,
  width?,
  height?,
  durationSeconds?,
  waveform?,
  telegramDocumentAttributes?,

  sourceLocator:
    | {
        type: "messageMedia";
        dialogId: Id<"telegramDialogs">;
        telegramMessageId: number;
        mediaRole:
          | "primary"
          | "thumbnail"
          | "videoCover"
          | "livePhotoVideo";
      }
    | {
        type: "profileMedia";
        peerKind: "user" | "chat" | "channel";
        peerId: string;
        profilePhotoId: string;
        mediaRole: "photo" | "video";
      }
    | {
        type: "customEmoji" | "sticker";
        telegramDocumentId: string;
      }
    | {
        type: "storyMedia";
        peerKind: "user" | "channel";
        peerId: string;
        storyId: number;
      },

  transferState:
    | "reserved"
    | "deferredByPolicy"
    | "deferredByBudget"
    | "downloading"
    | "uploading"
    | "verifying"
    | "stored"
    | "unavailable"
    | "failed"
    | "cancelled",

  objectKey,
  storedSize?,
  sha256?,
  r2Etag?,
  contentType?,
  storedAt?,
  verifiedAt?,

  attemptCount,
  retryAfter?,
  lastErrorCode?,
  lastErrorMessage?,

  requestedAt?,

  trackingGeneration,
  leaseOwner?,
  leaseExpiresAt?,
}
```

Telegram access hashes and file references may be stored as operational source
metadata, but they are not the preserved bytes. File references expire and must be
refreshable from the source message/profile location.

Profile photos and profile videos deliberately use the same `telegramFiles`
table as message media. Their physical concerns—Telegram identity, transfer
state, R2 key, size, MIME type, checksum, retry, and signed reads—are identical.
The discriminated `sourceLocator` keeps profile-only fields out of message-media
records and avoids a collection of unrelated optional fields.

`telegramDialogRevisions` points to the relevant profile file ID for each
observed profile version, while `telegramDialogs` points to the current profile
file. This supports a Telegram-like profile drawer for current name/username and
photo plus a historical photo carousel without duplicating file transfer logic.

### `telegramMediaTransfers`

Purpose: durable progress for large transfers and multipart uploads. Small
objects can omit this table if their state fits entirely in `telegramFiles`.

```ts
{
  fileId,
  trackingGeneration,
  workerId,
  leaseExpiresAt,

  telegramOffset,
  bytesDownloaded,
  bytesUploaded,
  hashStateCheckpoint?,

  r2UploadId?,
  partSize?,
  completedParts?: Array<{
    partNumber: number;
    etag: string;
    size: number;
  }>,

  status,
  updatedAt,
}
```

Keep part lists bounded. If Telegram's maximum object sizes and selected part
size could make the list too large for a Convex document, store parts in a
separate table keyed by transfer and part number.

### `telegramBackupJobs`

Purpose: current work and progress for initial backfill, reconciliation,
metadata refresh, or deletion.

```ts
{
  accountId,
  dialogId,
  type:
    | "initialBackfill"
    | "gapRecovery"
    | "recentReconcile"
    | "profileRefresh"
    | "preservedDataDelete",
  trackingGeneration,

  status:
    | "queued"
    | "running"
    | "paused"
    | "completed"
    | "cancelled"
    | "failed",

  cursor?,
  oldestProcessedMessageId?,
  newestProcessedMessageId?,
  messagesObserved,
  messagesInserted,
  messagesUpdated,
  filesQueued,
  bytesQueued,

  leaseOwner?,
  leaseExpiresAt?,
  retryAfter?,
  lastError?,
  startedAt?,
  completedAt?,
}
```

### `telegramRawBatches`

Purpose: manifest for compressed, lossless source batches stored in R2 as a
required part of message preservation.

```ts
{
  accountId,
  dialogId?,
  objectKey,
  compression: "zstd" | "gzip",
  formatVersion,
  telegramLayer?,
  gramJsVersion,
  collectorVersion,
  recordCount,
  firstMessageId?,
  lastMessageId?,
  sha256,
  createdAt,
}
```

The raw encoder must be deterministic and lossless for supported JS values:

- Telegram `long` values become decimal strings.
- Byte arrays become Base64.
- Constructor names are explicit.
- Telegram integer timestamps are retained alongside normalized milliseconds
  when relevant.
- Undefined/absent optional fields are distinguished where source fidelity
  requires it.

Raw batches are insurance against a normalizer bug or newly supported Telegram
constructor. They also preserve source fields that the current normalized schema
does not query. They are not an alternative to `telegramFiles`: raw batches hold
compressed Telegram metadata/constructors, while `telegramFiles` points to the
actual photo, video, audio, document, sticker, custom-emoji, and profile-media
bytes stored in R2.

Raw batches are written before or as part of committing their normalized message
batch. A message batch must not be reported fully preserved if its required raw
batch failed to store. The workflow needs an idempotent relationship between the
raw object, manifest, and normalized ingest so a retry cannot create conflicting
raw objects.

Raw batches are not read for normal chat rendering.

## Semantic hashes and revisions

Normalize message content into two conceptual sections:

```text
semantic content
├── text and entities
├── media identity and meaningful metadata
├── reply/forward relationship
├── service action
└── reply markup when needed for faithful display

volatile/current state
├── reactions
├── poll totals
├── views
├── forward count
├── reply count
└── pinned/read-like state
```

Compute a deterministic SHA-256 over normalized semantic content. On ingestion:

```text
message not found
    → insert current message with semanticVersion = 1

message found and semanticHash unchanged
    → update lastObservedAt and current volatile state

message found and semanticHash changed
    → insert previous current content as revision
    → update current content
    → increment semanticVersion
```

Canonicalization rules must be versioned. Never rely on raw JavaScript object
key order without a canonical encoder.

## Tracking lifecycle

### State machine

```text
notTracked
    │ user starts
    ▼
starting
    │ initial snapshot/job created
    ▼
tracking ◄──────────── resume/recover ───────────┐
    │                                            │
    │ user stops                                │
    ▼                                            │
stopping                                         │
    │ workers acknowledge cancellation           │
    ▼                                            │
stopped ─────────────── user resumes ─────────────┘

Any operational state may expose an error while retaining resumable cursors.
```

Every start/resume increments `trackingGeneration`. Every job and media transfer
captures that generation.

A generation is a monotonically increasing fencing token for one tracking
lifecycle. For example:

```text
generation 1  tracking starts
generation 2  tracking is stopped/cancelled
generation 3  tracking starts again
```

An old generation-1 worker may still finish a network request after the dialog
has reached generation 3. Comparing its captured generation with the dialog's
current generation prevents that delayed worker from committing into the new
lifecycle. The number is not a Telegram concept and has no user-facing meaning;
it exists to make cancellation and restart races safe.

A worker must check both state and generation before claiming new work and
before finalizing work:

```ts
if (
  dialog.trackingState !== "tracking" ||
  job.trackingGeneration !== dialog.trackingGeneration
) {
  return cancelled;
}
```

This prevents an old delayed worker from reviving work after a stop/restart.

### Starting tracking

The start mutation atomically:

1. Validates that the dialog belongs to the account.
2. Increments `trackingGeneration`.
3. Changes state to `starting`.
4. Creates the initial metadata revision if needed.
5. Creates an initial backfill job.
6. Makes the dialog eligible for live event ingestion.
7. Changes state to `tracking` once setup is committed.

The collector should begin accepting live updates immediately. History backfill
can take hours or days and must not delay protection of new messages.

### Stopping tracking

Stopping is graceful and reversible:

1. Mutation changes state from `tracking` to `stopping`.
2. Mutation increments the generation or records a cancellation generation.
3. No new history/media work is claimed.
4. In-flight message batches may finish idempotently if they were already
   observed before cancellation.
5. A small single PUT may finish; a large multipart transfer may finish its
   current part and then abort or persist resumable state.
6. Workers release leases and acknowledge cancellation.
7. Dialog becomes `stopped`.
8. Previously preserved messages and R2 objects remain available.
9. Future live updates for this dialog are ignored while stopped.

Stopping and deleting are separate operations:

- **Stop tracking:** retain preserved data and checkpoints.
- **Resume tracking:** attempt gap recovery, then continue.
- **Delete preserved data:** explicit confirmation, durable deletion job, reference
  checks, R2 deletion, and metadata deletion.

Do not automatically delete preserved data when tracking is turned off.

### Resuming tracking

On resume:

1. Increment generation.
2. Re-enable live event ingestion.
3. Reconcile the period since `trackingStoppedAt` as far as Telegram allows.
4. Resume incomplete historical backfill from its committed cursor.
5. Retry files that remain accessible.
6. Clearly record if the stopped interval cannot be proven complete.

## Initial history backfill

### Direction

Backfill newest to oldest by default.

Reasons:

- Recent history becomes useful quickly.
- Recent Telegram file references are more likely to be valid.
- The gap between live updates and backfill closes quickly.
- Users can see progress moving backward through time.

Live updates run concurrently:

```text
new messages ─────────────────────────► continuously ingested

today ◄── newest-to-oldest backfill ─── beginning of available history
```

Idempotent message keys allow live ingestion and backfill to encounter the same
message safely.

### Batch loop

```text
claim job lease
    ↓
verify tracking generation
    ↓
fetch a bounded Telegram history page
    ↓
serialize and store required raw batch
    ↓
normalize messages and reserve file identities
    ↓
ingest bounded Convex batch
    ↓
commit next cursor/progress
    ↓
enqueue/claim media separately
    ↓
renew lease and repeat
```

Never fetch the entire history into memory. Never make one Convex mutation
responsible for an unbounded dialog.

Start with a conservative message batch such as 50-100 and tune using measured
serialized size and transaction usage. Batch size must be bounded by bytes as
well as record count.

### Huge histories

A dialog can contain millions of messages and terabytes of media. The system
must treat completion as eventual, not request-scoped.

Progress exposed to the UI should include:

- Backfill status.
- Messages observed/stored.
- Media objects pending/stored/failed.
- Bytes pending/stored where known.
- Oldest preserved date/message.
- Last successful live event.
- Last successful reconciliation.
- Current retry/flood-wait state.

Users can stop tracking at any point without losing committed work.

## Live updates and reconciliation

### This is not a webhook

Remnant uses a Telegram user session through GramJS/MTProto. The collector keeps
an authorized connection open and registers GramJS event handlers. Bot HTTP
webhooks are not the mechanism for this application.

High-level events include:

- New message.
- Edited message.
- Deleted message.

Raw Telegram updates are also needed for full coverage, including:

- New/edit/delete channel messages.
- User identity/photo invalidation.
- Group/channel metadata invalidation.
- Reactions and poll updates.
- Pinned messages and forum topics.
- History TTL and other service state.

References:

- [Telegram update system and gap recovery](https://core.telegram.org/api/updates)
- [GramJS NewMessage](https://gram.js.org/beta/classes/custom.NewMessage.html)
- [GramJS EditedMessage](https://gram.js.org/beta/classes/custom.EditedMessage.html)
- [GramJS DeletedMessage](https://gram.js.org/beta/classes/custom.DeletedMessage.html)

### Update processing

The event callback should do minimal work:

1. Resolve account/dialog identity.
2. Check current tracking state/generation from a local cache refreshed from
   Convex.
3. Normalize or enqueue a small durable event batch.
4. Acknowledge quickly.
5. Perform media downloads outside the event callback.

Do not block Telegram update processing on R2 uploads.

### Deletions

On a deletion:

- Keep preserved content.
- Set `deletionObservedAt` to the time Remnant learned of the deletion.
- Record `deletionObservedVia` as `telegramUpdate`,
  `messageReconciliation`, or `telegramEmptyMessage`.
- Preserve prior R2 objects.
- Do not create a content revision solely for the deletion flag.

There is intentionally no separate `deletedOnTelegram` boolean. Deletion state
is derived from `deletionObservedAt !== undefined`, which avoids contradictory
states such as a false boolean with a populated timestamp. A missing timestamp
means only that Remnant has not observed deletion; it does not prove the message
still exists on Telegram.

GramJS documents that deleted-message events are not completely reliable and
that private/basic-group deletion events may not identify the dialog. Remnant
can resolve many such events because it has stored the prior message-to-dialog
identity, but periodic reconciliation is still required.

### Offline gaps

Use Telegram's update state/difference mechanism as supported by GramJS and
persist enough collector state to recover after restart. Do not assume a socket
connection delivers every event forever.

Periodic reconciliation should:

- Refetch a moving window of recent messages.
- Compare semantic hashes to detect missed edits.
- Query known message IDs/ranges where appropriate to detect deletions.
- Refresh dialog/profile metadata.
- Retry incomplete file downloads.
- Verify old jobs have no expired leases.

Telegram explains that ordinary/private/basic-group and channel/supergroup
message boxes use different update sequences. Message identity must always
include the dialog/peer context rather than relying on message ID alone.

## Dialog names, usernames, and profile photos

### Current state plus immutable revisions

`telegramDialogs` contains current UI state. `telegramDialogRevisions` contains
meaningful historical snapshots.

On a profile-related update:

```text
Telegram update arrives
    ↓
mark peer metadata stale
    ↓
refetch user/chat/channel and full metadata when permitted
    ↓
normalize meaningful fields
    ↓
compare semantic hash
    ├── unchanged → update last observed time
    └── changed   → insert revision and update current state
```

Track at least:

- Display name/title.
- Primary username and additional active usernames where exposed.
- Bio/about text where accessible.
- Profile photo/video identity.
- User/bot/deleted flags.
- Group/channel type, forum/broadcast flags, and availability.
- Public/private/forbidden status.
- Relevant full-chat settings such as linked discussion and default TTL.

### Profile media

Profile photos/videos use the same `telegramFiles` + R2 pipeline with a
`profilePhoto` source kind.

- On initial tracking, enumerate accessible historical user photos where the API
  supports it.
- For basic groups/channels, use available chat-photo history mechanisms and
  service messages where supported.
- On a new photo identity, reserve and download it immediately.
- Reusing a previously seen photo points to the existing file record.
- Photo removal creates a metadata revision but does not delete the preserved
  object.

References:

- [Telegram user photo history](https://core.telegram.org/method/photos.getUserPhotos)
- [Telegram profile/user metadata](https://core.telegram.org/api/profile)
- [Telegram file download locations](https://core.telegram.org/api/files)

## Media transfer pipeline

### Reservation before download

Before downloading bytes, a Convex mutation atomically finds or creates a file
record by its account-scoped Telegram identity.

```text
already stored
    → link message to existing file; no transfer

active unexpired lease
    → another worker owns transfer; no duplicate

reserved/failed with retry due
    → acquire lease and transfer
```

The message can be committed while media is pending. The UI renders an explicit
pending/unavailable state.

### Small objects

For small objects below a measured/configurable threshold:

1. Stream or download from Telegram with bounded memory.
2. Compute SHA-256.
3. Upload with a single R2 `PutObject`.
4. `HeadObject` or inspect upload response.
5. Finalize the Convex file record only if key, expected size, and checksum
   policy match.

Do not hardcode the final threshold in architecture. Start conservatively and
measure memory/network behavior. Cloudflare describes single PUT as suitable
under approximately 100 MB, not as a mandatory cutoff.

### Large objects

For large media, use multipart upload. Two implementation stages are acceptable:

#### Initial reliable implementation

- Download into a uniquely named temporary file while hashing.
- Enforce a disk quota and preflight expected size.
- Upload using a file stream and AWS `Upload` from `@aws-sdk/lib-storage`.
- Delete the temporary file after verified success or intentional cancellation.
- On process crash, clean stale temp files and retry the object.

This is simpler and gives the upload a rewindable source for part retries. The
host must have enough temporary disk for configured maximum concurrency.

#### Advanced streaming/resume implementation

- Create a multipart upload explicitly.
- Read Telegram chunks into uniform R2 parts.
- Compute SHA-256 as bytes pass through.
- Upload each part and commit its ETag/offset.
- On restart, list/validate completed R2 parts and resume Telegram at the next
  aligned offset.
- Complete the multipart upload only after all parts are durable.

This avoids large temporary files but is more complex. Implement it after the
basic pipeline is correct unless deployment disk constraints require it sooner.

R2 multipart requirements include uniform non-final part sizes, at least 5 MiB
per non-final part, at most 10,000 parts, and automatic cleanup of incomplete
uploads after the configured lifecycle period.

### Telegram download failures

Handle distinctly:

- `FILE_REFERENCE_EXPIRED` / invalid: refetch the source message/profile and
  refresh the file reference.
- `FILE_MIGRATE_X`: let GramJS route to the correct data center.
- `FLOOD_WAIT_X` / premium wait: store `retryAfter`, release worker capacity,
  and retry after the required delay.
- Source unavailable/private/deleted: mark `unavailable` with reason; do not
  retry aggressively.
- Network/R2 429/5xx: exponential backoff with jitter.
- Tracking stopped/generation changed: cancel safely.

Reference: [Telegram file downloads](https://core.telegram.org/api/files)

### Verification

A file is `stored` only after:

- R2 confirms object existence.
- Stored size matches known expected size when Telegram supplied one.
- Remnant has a complete SHA-256 computed over original bytes.
- Object key and content type are recorded.
- The finalize mutation still matches the file's lease and tracking generation.

R2 ETag alone is insufficient because multipart ETags are not a content SHA-256.

## Concurrency, leases, and retries

The collector can be always on but must behave as a restartable worker, not as a
single immortal process.

Use independent bounded pools:

```text
Telegram update ingestion   high priority, low latency
History metadata backfill   moderate concurrency
Small media downloads       bounded by Telegram/DC guidance
Large media transfers       very low concurrency
Profile media               high priority, small volume
Reconciliation              background priority
```

Every durable job uses a lease:

- `leaseOwner`
- `leaseExpiresAt`
- periodic renewal
- compare-and-finalize ownership

A lease is a temporary exclusive claim, not a permanent lock. For example,
collector A may claim a file transfer for two minutes and renew the expiry while
it progresses. Collector B will not duplicate the transfer while that lease is
valid. If A crashes, stops renewing, or loses connectivity, B can claim the work
after expiry.

Finalization checks both `leaseOwner` and the unexpired lease so an old slow
worker cannot commit after another worker has taken over. Leases remain useful
even with one intended collector because deployments, process restarts, retry
overlap, and accidental duplicate instances can otherwise execute the same job.

If a process dies, another collector can claim work after expiry. Effect should
manage worker scopes, retries, interruption, and resource cleanup in
`apps/collector`. Convex functions remain plain Convex code without Effect.

Retry classification must distinguish:

- Permanent validation/authorization failures.
- Source unavailable.
- Telegram-mandated waits.
- Transient network errors.
- R2 throttling/service errors.
- Lost/stale leases.
- Cancellation through tracking generation.

## Serving preserved media

The R2 bucket remains private.

Recommended read flow:

```text
web requests message page
    ↓
Convex query verifies account/user access
    ↓
message returns file identity/status, not permanent URL
    ↓
client requests authorized playback/download URL
    ↓
Convex action/component returns short-lived signed R2 GET URL
    ↓
browser reads directly from R2
```

For video/audio seeking, ensure signed R2 reads support HTTP range requests.
Avoid proxying large responses through Convex HTTP actions.

Do not use a public custom domain for private preserved chat media without a separate
authorization layer. The component's signed S3 URLs bypass CDN cache; a future
private media Worker may provide authenticated cached delivery if real usage
justifies it.

Presigned URLs are bearer tokens. Keep expirations short and do not put them in
logs, durable records, analytics events, or error messages.

## Preserved data deletion

Deletion is intentionally separate from stopping.

A preserved-data purge is a resumable job:

1. Freeze/rescind tracking generation.
2. Mark dialog `deleting` and deny normal reads if product semantics require it.
3. Paginate message/revision/raw manifests and collect referenced file IDs.
4. Decrement account-scoped references or prove no remaining reference exists.
5. Delete R2 objects idempotently.
6. Delete structured records in bounded Convex mutations.
7. Record completion and surface failures for retry.

Never delete R2 objects by broad prefix without enumerating and validating exact
targets. Deletion must tolerate an object already being absent.

If `@convex-dev/r2` is adopted, its retried delete helper can be useful, but the
application must still own reference checks and purge progress.

## Security and privacy

- Treat preserved chats as highly sensitive personal data.
- Keep R2 private and use least-privilege, bucket-scoped credentials.
- Store Telegram session and R2 secrets only in server environments.
- Never send R2 credentials to the browser.
- Authorize every metadata query and signed-read request.
- Avoid PII in R2 object keys and logs.
- Redact Telegram access hashes, file references, signed URLs, and session data
  from logs.
- Apply retention/deletion consistently to structured data, raw batches, and
  R2 objects.
- Consider application-level encryption later if the threat model requires
  protection from storage-provider or operator access. R2 already encrypts at
  rest and in transit, but provider-managed encryption is not end-to-end.
- Respect Telegram protected-content restrictions and document behavior instead
  of silently bypassing them.

Reference: [R2 data security](https://developers.cloudflare.com/r2/reference/data-security/)

## Observability

Record structured metrics/logs without message text or filenames:

- Connected Telegram accounts.
- Last update received per account.
- Update queue lag.
- Backfill messages/sec and oldest preserved date.
- Pending files and bytes by state.
- Telegram download throughput and waits.
- R2 upload throughput, multipart retries, and errors.
- Convex ingestion batch latency/failures.
- Stale leases.
- Unsupported constructors by name and GramJS version.
- Reconciliation discrepancies: missed edits/deletions/profile changes.
- Stored bytes and object counts per account/dialog.

Use stable error codes and safe summaries. Raw exception causes must be reviewed
before logging because GramJS/R2 errors can include sensitive request material.

## Suggested module boundaries

Keep the collector small and explicit:

```text
apps/collector/src/
├── telegram/
│   ├── messages.ts             history iteration and message lookup
│   ├── message-normalizer.ts   Telegram → contracts
│   ├── media-classifier.ts     document attribute precedence
│   ├── updates.ts              live/raw update subscription
│   ├── profiles.ts             peer/full metadata and photo history
│   └── downloads.ts            Telegram byte/chunk access
├── convex/
│   ├── message-ingest.ts
│   ├── jobs.ts
│   └── files.ts
├── storage/
│   ├── r2-client.ts
│   ├── object-keys.ts
│   ├── multipart.ts
│   └── checksums.ts
└── workers/
    ├── live-updates.ts
    ├── history-backfill.ts
    ├── media-transfer.ts
    └── reconciliation.ts
```

Shared collector-to-Convex contracts belong in `packages/contracts` when both
sides consume them. Convex validators remain in `packages/backend/convex` and
must not import unsupported runtime code.

Suggested backend boundaries:

```text
packages/backend/convex/
├── collector/
│   ├── messageIngest.ts
│   ├── messageJobs.ts
│   ├── mediaTransfers.ts
│   └── profileSync.ts
├── validators/
│   ├── telegramMessages.ts
│   ├── telegramMedia.ts
│   └── telegramBackupJobs.ts
├── telegramMessages.ts         app-facing paginated queries
├── telegramFiles.ts            signed-read/status API
└── preservedDataDeletion.ts
```

## Implementation phases

### Phase 0: fixtures and design validation

- Capture sanitized GramJS fixtures for ordinary, service, and empty messages.
- Include text/entities, photo, generic file, voice, audio, normal video, round
  video, sticker types, GIF, custom emoji, album, webpage, poll, contact,
  location, dice, story, paid media, timed-expiring media, view-once media, and
  unsupported constructors.
- Prove with dedicated test accounts whether downloading each accessible
  ephemeral subtype changes its viewed/read state. Do not ship automatic
  ephemeral preservation until the collector avoids unintended consumption.
- Add normalization/classification tests before database schema work.
- Build a small R2 spike from the Bun collector:
  - single PUT from a stream/file,
  - multipart upload,
  - SHA-256 verification,
  - signed GET with range request,
  - cancellation and retry.
- Decide whether `@convex-dev/r2` will be used for signed reads/deletion. Record
  that result in this document or a short ADR.

Exit criterion: Telegram fixtures normalize deterministically, and the selected
R2 route works from the collector deployment environment.

### Phase 1: message metadata backfill

- Add message, revision, job, and raw-batch schemas/indexes.
- Store the compressed raw batch as required preservation data for every
  normalized message batch.
- Implement ordinary/service/empty normalization.
- Start with text/entities/replies/forwards/albums and service actions.
- Implement resumable newest-to-oldest history batches.
- Use the first preserved `getHistory` page to capture Telegram's approximate
  total; do not perform a duplicate preflight history request.
- Add graduated history-size checkpoints and pause large/very-large historical
  work at its committed cursor while the user chooses full, since-date, or
  latest-message scope.
- For histories that cross a decision checkpoint, optionally cache one batched
  `getSearchCounters` result for approximate media-category counts.
- Build progressive message/media-byte estimates from actual preserved pages.
- Start live new/edit/delete handling before media downloads.
- Add paginated backend chat queries.

Exit criterion: a tracked dialog preserves and renders text/service history,
edits, deletions, replies, and albums without media bytes.

### Phase 2: R2 media preservation

- Add `telegramFiles` and transfer states.
- Enforce persisted age/size bands, derived urgency, the soft target, protected
  live safety reserve, and hard safety limit before claiming transfers.
- Reserve/reuse Telegram file identities.
- Implement photo/document classification.
- Upload profile photos, photos, documents, voice, audio, video, round video,
  stickers, GIFs, and custom emoji to private R2.
- Add small-object and multipart paths.
- Add signed read URLs and range playback.
- Add an aggregated decision queue for recent large files; do not interrupt the
  user separately for every historical object.
- Surface deferred-by-policy, deferred-by-budget, unavailable, and failed media
  states with actionable explanations.
- Make old large files on-demand in chat with a **Preserve now** action.
- Attempt accessible expiring/view-once media immediately as a high-priority
  class, preserving its original TTL semantics in metadata.

Exit criterion: primary downloadable content survives Telegram deletion and is
served from R2.

### Phase 3: continuous reconciliation and metadata history

- Persist update recovery state.
- Reconcile recent history for missed edits/deletions.
- Add dialog/user/channel full metadata snapshots.
- Preserve profile photo history and new profile changes.
- Add poll/reaction current-state updates.
- Add unsupported constructor observability and raw reprocessing tooling.

Exit criterion: collector restarts and offline periods recover as completely as
Telegram allows, and metadata changes are versioned.

### Phase 4: lifecycle, quotas, and operations

- Complete graceful stop/resume state machine.
- Add preserved-data deletion jobs.
- Complete per-account storage visibility and hard safety limits; dialog
  age/size bands, live safety reserves, and soft targets already exist before
  automatic media backfill ships.
- Add operational dashboard, stale-lease recovery, and integrity audits.
- Load-test million-message metadata backfill and large media.

Exit criterion: users can understand, stop, resume, and delete long-running
preserved datasets safely, with costs and failures visible.

## Testing strategy

### Unit tests

- Every known message/media/action constructor fixture.
- Document classification precedence.
- Entity UTF-16 offsets.
- Canonical semantic hashing.
- Raw encoding of longs and bytes.
- Object-key privacy and determinism rules.
- Retry/error classification.

### Property and replay tests

- Ingesting the same message/batch repeatedly is idempotent.
- Live update and backfill arriving in either order produce the same current
  state.
- Semantic edits create exactly one revision per distinct version.
- Volatile counter updates do not create semantic revisions.
- Old tracking generations cannot finalize jobs.
- Replaying raw batches with the same normalizer is deterministic.

### Integration tests

- Backfill restart from every checkpoint boundary.
- Stop while fetching, ingesting, downloading, and uploading.
- Resume after stop and reconcile a simulated gap.
- Expired Telegram file reference refresh.
- Timed-expiring/view-once transfer without an unintended viewed/read update.
- Expiring media that becomes unavailable before transfer completes.
- R2 single PUT and multipart retry.
- R2 object exists but Convex finalize failed, and vice versa.
- Signed GET authorization and expiration.
- HTTP range playback.
- Purge retry after partial R2 deletion.

### Scale tests

- Millions of small text messages through paginated ingestion/query.
- High volumes of repeated stickers/custom emoji proving file reuse.
- Large albums and paid-media item lists.
- Very large media under bounded memory/disk.
- History checkpoint decisions reuse the first real page and resume from its
  cursor without duplicate ingestion.
- History counts and search counters marked inexact remain estimates in the UI.
- Derived scheduling prevents large old/requested media from blocking ephemeral
  and live work without storing a priority enum.
- Soft-target pressure protects the configured live safety reserve; hard limits
  do not over-claim concurrent transfers.
- Age/size boundary values produce deterministic automatic, review, and
  on-demand decisions.
- Channels/groups remain bounded until explicit large-backfill approval.
- R2/Telegram throttling and long flood waits.
- Convex transaction byte/document limits with adversarial payloads.

## Migration and compatibility with current code

The current application already has:

- `telegramAccounts` and `telegramDialogs`.
- Dialog synchronization runs and batches.
- `trackingEnabled` mutations and tracked-dialog sidebar state.
- A Bun/Effect collector with GramJS.
- Collector-authenticated Convex mutations.

Build on those boundaries:

- Reuse the dialog's existing account-scoped peer identity.
- Do not overload dialog sync runs with message history work; add separate job
  types and tables.
- Evolve `trackingEnabled` into the lifecycle state without breaking the All
  Dialogs UI in one large change.
- Reuse the current collector API-key boundary, then consider short-lived worker
  credentials as a later hardening step.
- Keep Effect in collector workers and plain async Convex functions in the
  backend, consistent with repository guidance.

## Open product decisions

These should be decided before their relevant implementation phase, but they do
not block the core schema:

1. Should resuming after a stopped period automatically attempt full gap
   recovery? Recommended: yes, with an honesty indicator when completeness
   cannot be proven.
2. Should raw source batches be retained forever, for a limited period, or only
   until their normalized form passes integrity checks?
3. Should reaction identities/history be preserved, or only current aggregate
   counts? Recommended initial scope: current aggregates/recent visible data.
4. Should live-location trajectories be sampled historically or only preserve
   the latest/final state? Recommended initial scope: latest/final.
5. Should every alternate video quality be preserved? Recommended: no; primary
   accessible original only.
6. What initial values should ship for history checkpoints, age/size bands,
   dialog soft targets/reserves, and per-account hard safety limits?
7. Should stopped preserved datasets continue periodic integrity verification?
8. What retention/grace period applies after the user requests preserved-data deletion?
9. Is application-level encryption required before public launch?
10. Which protected-content cases must be skipped versus retained as metadata
    only?

## Explicit non-goals for the first implementation

- Reconstructing or importing secret chats.
- Perfectly emulating every Telegram UI behavior.
- Storing typing indicators, upload progress, online status history, or read
  receipts as permanent preservation history.
- Cross-account content deduplication.
- Downloading every Telegram thumbnail/quality.
- Proxying multi-GB media through Convex.
- Promising recovery of content deleted before tracking.
- Combining an album into one database message.
- Permanent public R2 URLs for private preserved media.

## Implementation checklist

Before merging the first production message collector, verify:

- [ ] Normalizer fixtures cover ordinary, service, empty, and unsupported data.
- [ ] Identity includes account, dialog, and Telegram message ID.
- [ ] Long integers are never coerced unsafely into JavaScript numbers.
- [ ] Entity offsets remain UTF-16 offsets.
- [ ] Semantic hash format is versioned and deterministic.
- [ ] Batch limits are bounded by both count and encoded bytes.
- [ ] New live messages are accepted while history backfill runs.
- [ ] Media work never blocks Telegram event callbacks.
- [ ] Files are reserved before download to avoid duplicate work.
- [ ] Required raw source batches are durable, checksummed, and linked before a
      normalized batch is reported fully preserved.
- [ ] The first real history page supplies the initial count estimate; no
      duplicate preflight history fetch is performed.
- [ ] Large histories pause at a durable cursor for scope selection, while live
      tracking continues.
- [ ] Search counters are fetched only when useful, cached, and shown as
      estimates when Telegram marks them inexact.
- [ ] Per-dialog age/size bands and preservation priorities are enforced by
      workers, not only the UI.
- [ ] Historical and requested-old work cannot consume the protected live
      safety reserve.
- [ ] Soft-target and hard-limit checks include concurrently claimed bytes.
- [ ] Deferred states explain why bytes are not yet in R2 and can be requeued.
- [ ] Recent large-file decisions are aggregated instead of producing a prompt
      per historical file.
- [ ] Old on-demand media exposes **Preserve now** without claiming R2 storage.
- [ ] Channels/groups cannot start an unlimited backfill without approval.
- [ ] Expiring/view-once tests confirm preservation does not unintentionally
      consume the user's view.
- [ ] R2 bucket is private and keys contain no PII.
- [ ] Large files use multipart or a proven bounded fallback.
- [ ] SHA-256 is computed independently of R2 ETag.
- [ ] File references can be refreshed from stored source locators.
- [ ] Every worker checks tracking generation before finalization.
- [ ] Stop retains data and prevents new work.
- [ ] Delete is a separate resumable workflow.
- [ ] Chat queries are paginated.
- [ ] Unknown Telegram types do not fail the whole batch.
- [ ] Logs exclude message text, filenames, sessions, access hashes, file
      references, credentials, and signed URLs.
- [ ] `bun run check` passes.

## Source references

Telegram:

- [Message type](https://core.telegram.org/type/Message)
- [Ordinary message constructor](https://core.telegram.org/constructor/message)
- [Service message constructor](https://core.telegram.org/constructor/messageService)
- [MessageMedia union](https://core.telegram.org/type/MessageMedia)
- [Document and attributes](https://core.telegram.org/type/DocumentAttribute)
- [GIF behavior](https://core.telegram.org/api/gifs)
- [Custom emoji](https://core.telegram.org/api/custom-emoji)
- [Stickers](https://core.telegram.org/api/stickers)
- [Updates and gap recovery](https://core.telegram.org/api/updates)
- [File downloads and references](https://core.telegram.org/api/files)
- [File-reference refresh](https://core.telegram.org/api/file-references)
- [Content protection](https://core.telegram.org/api/content-protection)
- [`messages.getHistory`](https://core.telegram.org/method/messages.getHistory)
- [`messages.getSearchCounters`](https://core.telegram.org/method/messages.getSearchCounters)
- [`messages.searchCounter`](https://core.telegram.org/constructor/messages.searchCounter)

GramJS:

- [TelegramClient, history, and downloads](https://gram.js.org/beta/classes/TelegramClient.html)
- [NewMessage event](https://gram.js.org/beta/classes/custom.NewMessage.html)
- [EditedMessage event](https://gram.js.org/beta/classes/custom.EditedMessage.html)
- [DeletedMessage limitations](https://gram.js.org/beta/classes/custom.DeletedMessage.html)

Cloudflare R2:

- [R2 APIs](https://developers.cloudflare.com/r2/api/)
- [Upload and multipart behavior](https://developers.cloudflare.com/r2/objects/upload-objects/)
- [S3 SDK usage](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/)
- [Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [Limits](https://developers.cloudflare.com/r2/platform/limits/)
- [Pricing](https://developers.cloudflare.com/r2/pricing/)
- [Data security](https://developers.cloudflare.com/r2/reference/data-security/)

Convex:

- [Cloudflare R2 component](https://www.convex.dev/components/cloudflare-r2)
- [`@convex-dev/r2` source and README](https://github.com/get-convex/r2)
- [Convex action behavior](https://docs.convex.dev/functions/actions)
- [Convex limits](https://docs.convex.dev/production/state/limits)
- [Convex document types and size limits](https://docs.convex.dev/database/types)
