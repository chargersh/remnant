import { Api } from "telegram";
import type {
  TelegramDocumentAttributes,
  TelegramDocumentPresentation,
} from "@/providers/telegram/messages/contracts";

const IMAGE_MIME_TYPES = new Set([
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/webp",
]);

export const normalizeTelegramDocumentAttributes = (
  attributes: readonly Api.TypeDocumentAttribute[]
): TelegramDocumentAttributes => {
  const audioAttribute = attributes.find(
    (attribute): attribute is Api.DocumentAttributeAudio =>
      attribute instanceof Api.DocumentAttributeAudio
  );
  const customEmojiAttribute = attributes.find(
    (attribute): attribute is Api.DocumentAttributeCustomEmoji =>
      attribute instanceof Api.DocumentAttributeCustomEmoji
  );
  const fileNameAttribute = attributes.find(
    (attribute): attribute is Api.DocumentAttributeFilename =>
      attribute instanceof Api.DocumentAttributeFilename
  );
  const imageSizeAttribute = attributes.find(
    (attribute): attribute is Api.DocumentAttributeImageSize =>
      attribute instanceof Api.DocumentAttributeImageSize
  );
  const stickerAttribute = attributes.find(
    (attribute): attribute is Api.DocumentAttributeSticker =>
      attribute instanceof Api.DocumentAttributeSticker
  );
  const videoAttribute = attributes.find(
    (attribute): attribute is Api.DocumentAttributeVideo =>
      attribute instanceof Api.DocumentAttributeVideo
  );
  const audio =
    audioAttribute === undefined
      ? undefined
      : {
          durationSeconds: audioAttribute.duration,
          ...(audioAttribute.performer === null ||
          audioAttribute.performer === undefined
            ? {}
            : { performer: audioAttribute.performer }),
          ...(audioAttribute.title === null ||
          audioAttribute.title === undefined
            ? {}
            : { title: audioAttribute.title }),
          voice: audioAttribute.voice === true,
          ...(audioAttribute.waveform === null ||
          audioAttribute.waveform === undefined
            ? {}
            : { waveformBase64: audioAttribute.waveform.toString("base64") }),
        };

  return {
    animated: attributes.some(
      (attribute) => attribute instanceof Api.DocumentAttributeAnimated
    ),
    ...(audio === undefined ? {} : { audio }),
    ...(customEmojiAttribute === undefined
      ? {}
      : {
          customEmoji: {
            alt: customEmojiAttribute.alt,
            free: customEmojiAttribute.free === true,
            textColor: customEmojiAttribute.textColor === true,
          },
        }),
    ...(fileNameAttribute === undefined
      ? {}
      : { fileName: fileNameAttribute.fileName }),
    ...(imageSizeAttribute === undefined
      ? {}
      : {
          imageSize: {
            height: imageSizeAttribute.h,
            width: imageSizeAttribute.w,
          },
        }),
    ...(stickerAttribute === undefined
      ? {}
      : {
          sticker: {
            alt: stickerAttribute.alt,
            mask: stickerAttribute.mask === true,
          },
        }),
    telegramConstructors: attributes.map((attribute) => attribute.className),
    ...(videoAttribute === undefined
      ? {}
      : {
          video: {
            durationSeconds: videoAttribute.duration,
            height: videoAttribute.h,
            noSound: videoAttribute.nosound === true,
            roundMessage: videoAttribute.roundMessage === true,
            supportsStreaming: videoAttribute.supportsStreaming === true,
            width: videoAttribute.w,
          },
        }),
  };
};

export const classifyTelegramDocument = (
  mimeType: string,
  attributes: TelegramDocumentAttributes
): TelegramDocumentPresentation => {
  if (attributes.customEmoji) {
    return "customEmoji";
  }

  if (attributes.sticker) {
    return "sticker";
  }

  if (attributes.audio?.voice === true) {
    return "voice";
  }

  if (attributes.video?.roundMessage === true) {
    return "roundVideo";
  }

  if (attributes.animated) {
    return "animation";
  }

  if (attributes.audio) {
    return "audio";
  }

  if (attributes.video) {
    return "video";
  }

  if (attributes.imageSize || IMAGE_MIME_TYPES.has(mimeType.toLowerCase())) {
    return "imageFile";
  }

  return "file";
};
