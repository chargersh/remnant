import { Api } from "telegram";
import {
  classifyTelegramDocument,
  normalizeTelegramDocumentAttributes,
} from "./media-classifier";
import type {
  TelegramDocumentMedia,
  TelegramEphemeralMedia,
  TelegramFileCandidate,
  TelegramMedia,
  TelegramNormalizationWarning,
  TelegramPhotoMedia,
  TelegramPhotoSize,
} from "./message-contracts";

const VIEW_ONCE_TTL_SECONDS = 0x7f_ff_ff_ff;

interface TelegramMediaFileCandidate {
  readonly file: TelegramFileCandidate;
  readonly mediaRole: "primary" | "videoCover";
}

const normalizeEphemeral = (
  ttlSeconds: number | null | undefined
): TelegramEphemeralMedia | undefined => {
  if (ttlSeconds === null || ttlSeconds === undefined || ttlSeconds <= 0) {
    return;
  }

  return ttlSeconds === VIEW_ONCE_TTL_SECONDS
    ? {
        mode: "viewOnce",
        preservationResult: "pending",
      }
    : {
        mode: "timed",
        preservationResult: "pending",
        ttlSeconds,
      };
};

const normalizePhotoSize = (size: Api.TypePhotoSize): TelegramPhotoSize => {
  const base = {
    telegramConstructor: size.className,
    type: size.type,
  };

  if (size instanceof Api.PhotoSize) {
    return {
      ...base,
      height: size.h,
      size: size.size,
      width: size.w,
    };
  }

  if (size instanceof Api.PhotoCachedSize) {
    return {
      ...base,
      bytesBase64: size.bytes.toString("base64"),
      height: size.h,
      size: size.bytes.byteLength,
      width: size.w,
    };
  }

  if (
    size instanceof Api.PhotoStrippedSize ||
    size instanceof Api.PhotoPathSize
  ) {
    return {
      ...base,
      bytesBase64: size.bytes.toString("base64"),
      size: size.bytes.byteLength,
    };
  }

  if (size instanceof Api.PhotoSizeProgressive) {
    return {
      ...base,
      height: size.h,
      size: Math.max(0, ...size.sizes),
      sizes: size.sizes,
      width: size.w,
    };
  }

  return base;
};

const largestKnownPhotoSize = (sizes: readonly TelegramPhotoSize[]) => {
  const knownSizes = sizes.flatMap((size) =>
    size.size === undefined ? [] : [size.size]
  );

  return knownSizes.length === 0 ? undefined : Math.max(...knownSizes);
};

const photoFileCandidate = (
  photo: Api.Photo,
  sizes: readonly TelegramPhotoSize[]
): TelegramFileCandidate => {
  const expectedSize = largestKnownPhotoSize(sizes);

  return {
    accessHash: photo.accessHash.toString(),
    dcId: photo.dcId,
    ...(expectedSize === undefined
      ? {}
      : { expectedSize: expectedSize.toString() }),
    fileReferenceBase64: photo.fileReference.toString("base64"),
    mimeType: "image/jpeg",
    presentation: "imageFile",
    telegramFileId: photo.id.toString(),
    telegramObjectKind: "photo",
    thumbSize: photo.sizes.at(-1)?.type ?? "",
  };
};

const normalizePhoto = (
  media: Api.MessageMediaPhoto
): {
  readonly files: readonly TelegramMediaFileCandidate[];
  readonly media: TelegramPhotoMedia;
  readonly warnings: readonly TelegramNormalizationWarning[];
} => {
  const photo = media.photo;

  if (!(photo instanceof Api.Photo)) {
    const warning = {
      code: "emptyPhoto",
      telegramConstructor: photo?.className ?? media.className,
    } satisfies TelegramNormalizationWarning;

    return {
      files: [],
      media: {
        ...(normalizeEphemeral(media.ttlSeconds) === undefined
          ? {}
          : { ephemeral: normalizeEphemeral(media.ttlSeconds) }),
        sizes: [],
        spoiler: media.spoiler === true,
        telegramConstructor: media.className,
        telegramType: "photo",
      },
      warnings: [warning],
    };
  }

  const sizes = photo.sizes.map(normalizePhotoSize);
  const primaryFile = photoFileCandidate(photo, sizes);

  return {
    files: [{ file: primaryFile, mediaRole: "primary" }],
    media: {
      ...(normalizeEphemeral(media.ttlSeconds) === undefined
        ? {}
        : { ephemeral: normalizeEphemeral(media.ttlSeconds) }),
      photoId: photo.id.toString(),
      primaryFile,
      sizes,
      spoiler: media.spoiler === true,
      telegramConstructor: media.className,
      telegramType: "photo",
    },
    warnings: [],
  };
};

const normalizeDocument = (
  media: Api.MessageMediaDocument
): {
  readonly files: readonly TelegramMediaFileCandidate[];
  readonly media: TelegramDocumentMedia;
  readonly warnings: readonly TelegramNormalizationWarning[];
} => {
  const document = media.document;
  const ephemeral = normalizeEphemeral(media.ttlSeconds);

  if (!(document instanceof Api.Document)) {
    const warning = {
      code: "emptyDocument",
      telegramConstructor: document?.className ?? media.className,
    } satisfies TelegramNormalizationWarning;

    return {
      files: [],
      media: {
        alternativeDocumentIds: [],
        ...(ephemeral === undefined ? {} : { ephemeral }),
        presentation: "file",
        spoiler: media.spoiler === true,
        telegramConstructor: media.className,
        telegramType: "document",
        thumbs: [],
      },
      warnings: [warning],
    };
  }

  const attributes = normalizeTelegramDocumentAttributes(document.attributes);
  const presentation = classifyTelegramDocument(document.mimeType, attributes);
  const thumbs = (document.thumbs ?? []).map(normalizePhotoSize);
  const primaryFile = {
    accessHash: document.accessHash.toString(),
    dcId: document.dcId,
    expectedSize: document.size.toString(),
    fileReferenceBase64: document.fileReference.toString("base64"),
    mimeType: document.mimeType,
    ...(attributes.fileName === undefined
      ? {}
      : { originalFileName: attributes.fileName }),
    presentation,
    telegramFileId: document.id.toString(),
    telegramObjectKind: "document",
  } satisfies TelegramFileCandidate;
  const videoCover =
    media.videoCover instanceof Api.Photo ? media.videoCover : undefined;
  const videoCoverSizes = videoCover?.sizes.map(normalizePhotoSize) ?? [];
  const videoCoverFile =
    videoCover === undefined
      ? undefined
      : photoFileCandidate(videoCover, videoCoverSizes);

  return {
    files:
      videoCoverFile === undefined
        ? [{ file: primaryFile, mediaRole: "primary" }]
        : [
            { file: primaryFile, mediaRole: "primary" },
            { file: videoCoverFile, mediaRole: "videoCover" },
          ],
    media: {
      alternativeDocumentIds: (media.altDocuments ?? []).map((alternative) =>
        alternative.id.toString()
      ),
      attributes,
      documentId: document.id.toString(),
      ...(ephemeral === undefined ? {} : { ephemeral }),
      mimeType: document.mimeType,
      presentation,
      primaryFile,
      spoiler: media.spoiler === true,
      telegramConstructor: media.className,
      telegramType: "document",
      thumbs,
      ...(videoCoverFile === undefined ? {} : { videoCoverFile }),
      ...(videoCover === undefined
        ? {}
        : { videoCoverPhotoId: videoCover.id.toString() }),
    },
    warnings: [],
  };
};

const normalizeGeoPoint = (geo: Api.TypeGeoPoint) =>
  geo instanceof Api.GeoPoint ? { latitude: geo.lat, longitude: geo.long } : {};

interface TelegramMediaNormalizationResult {
  readonly files: readonly TelegramMediaFileCandidate[];
  readonly media?: TelegramMedia;
  readonly warnings: readonly TelegramNormalizationWarning[];
}

const normalizedMetadataMedia = (
  media: TelegramMedia
): TelegramMediaNormalizationResult => ({ files: [], media, warnings: [] });

const normalizeWebPage = (
  source: Api.MessageMediaWebPage
): TelegramMediaNormalizationResult => {
  const webPage = source.webpage;
  const canHaveUrl =
    webPage instanceof Api.WebPage ||
    webPage instanceof Api.WebPageEmpty ||
    webPage instanceof Api.WebPagePending;
  const url = canHaveUrl ? webPage.url : undefined;

  return normalizedMetadataMedia({
    ...(webPage instanceof Api.WebPage &&
    webPage.description !== null &&
    webPage.description !== undefined
      ? { description: webPage.description }
      : {}),
    telegramConstructor: source.className,
    telegramType: "webPage",
    ...(webPage instanceof Api.WebPage &&
    webPage.title !== null &&
    webPage.title !== undefined
      ? { title: webPage.title }
      : {}),
    ...(url === undefined ? {} : { url }),
  });
};

const normalizeNonFileMedia = (
  source: Exclude<
    Api.TypeMessageMedia,
    Api.MessageMediaDocument | Api.MessageMediaEmpty | Api.MessageMediaPhoto
  >
): TelegramMediaNormalizationResult => {
  if (source instanceof Api.MessageMediaContact) {
    return normalizedMetadataMedia({
      firstName: source.firstName,
      lastName: source.lastName,
      phoneNumber: source.phoneNumber,
      telegramConstructor: source.className,
      telegramType: "contact",
      ...(source.userId.isZero()
        ? {}
        : { telegramUserId: source.userId.toString() }),
      vcard: source.vcard,
    });
  }

  if (source instanceof Api.MessageMediaGeo) {
    return normalizedMetadataMedia({
      ...normalizeGeoPoint(source.geo),
      telegramConstructor: source.className,
      telegramType: "geo",
    });
  }

  if (source instanceof Api.MessageMediaGeoLive) {
    return normalizedMetadataMedia({
      ...normalizeGeoPoint(source.geo),
      telegramConstructor: source.className,
      telegramType: "geoLive",
    });
  }

  if (source instanceof Api.MessageMediaVenue) {
    return normalizedMetadataMedia({
      ...normalizeGeoPoint(source.geo),
      telegramConstructor: source.className,
      telegramType: "venue",
      title: source.title,
    });
  }

  if (source instanceof Api.MessageMediaDice) {
    return normalizedMetadataMedia({
      emoticon: source.emoticon,
      telegramConstructor: source.className,
      telegramType: "dice",
      value: source.value,
    });
  }

  if (source instanceof Api.MessageMediaWebPage) {
    return normalizeWebPage(source);
  }

  return {
    files: [],
    media: {
      telegramConstructor: source.className,
      telegramType: "unsupported",
    },
    warnings: [
      {
        code: "unsupportedMedia",
        telegramConstructor: source.className,
      },
    ],
  };
};

export const normalizeTelegramMedia = (
  source: Api.TypeMessageMedia | null | undefined
): TelegramMediaNormalizationResult => {
  if (
    source === null ||
    source === undefined ||
    source instanceof Api.MessageMediaEmpty
  ) {
    return { files: [], warnings: [] };
  }

  if (source instanceof Api.MessageMediaPhoto) {
    return normalizePhoto(source);
  }

  if (source instanceof Api.MessageMediaDocument) {
    return normalizeDocument(source);
  }

  return normalizeNonFileMedia(source);
};
