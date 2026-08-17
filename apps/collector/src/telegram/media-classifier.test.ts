import { describe, expect, test } from "bun:test";
import { Api } from "telegram";
import {
  classifyTelegramDocument,
  normalizeTelegramDocumentAttributes,
} from "./media-classifier";

const classify = (
  attributes: readonly Api.TypeDocumentAttribute[],
  mimeType = "application/octet-stream"
) =>
  classifyTelegramDocument(
    mimeType,
    normalizeTelegramDocumentAttributes(attributes)
  );

describe("classifyTelegramDocument", () => {
  test("applies Telegram presentation precedence", () => {
    expect(
      classify([
        new Api.DocumentAttributeCustomEmoji({
          alt: "🙂",
          stickerset: new Api.InputStickerSetEmpty(),
        }),
        new Api.DocumentAttributeSticker({
          alt: "🙂",
          stickerset: new Api.InputStickerSetEmpty(),
        }),
        new Api.DocumentAttributeVideo({ duration: 1, h: 100, w: 100 }),
      ])
    ).toBe("customEmoji");

    expect(
      classify([
        new Api.DocumentAttributeAnimated(),
        new Api.DocumentAttributeVideo({ duration: 1, h: 100, w: 100 }),
      ])
    ).toBe("animation");

    expect(
      classify([new Api.DocumentAttributeAudio({ duration: 1, voice: true })])
    ).toBe("voice");

    expect(
      classify([
        new Api.DocumentAttributeVideo({
          duration: 1,
          h: 100,
          roundMessage: true,
          w: 100,
        }),
      ])
    ).toBe("roundVideo");
  });

  test("uses MIME type only after semantic attributes", () => {
    expect(classify([], "image/png")).toBe("imageFile");
    expect(classify([], "application/pdf")).toBe("file");
  });

  test("accepts nullable audio metadata returned by GramJS", () => {
    const audio = new Api.DocumentAttributeAudio({
      duration: 439,
      performer: "Podcast author",
      title: "Episode",
    });
    Reflect.set(audio, "performer", null);
    Reflect.set(audio, "title", null);
    Reflect.set(audio, "waveform", null);

    expect(normalizeTelegramDocumentAttributes([audio]).audio).toEqual({
      durationSeconds: 439,
      voice: false,
    });
    expect(classify([audio], "audio/mpeg")).toBe("audio");
  });
});
