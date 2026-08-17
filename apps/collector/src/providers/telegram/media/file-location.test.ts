import { describe, expect, test } from "bun:test";
import { Api } from "telegram";
import type { TelegramFileCandidate } from "@/providers/telegram/messages/contracts";
import { makeTelegramInputFileLocation } from "./file-location";

const common = {
  accessHash: "90071992547409931",
  dcId: 2,
  fileReferenceBase64: "AQID",
  telegramFileId: "90071992547409932",
} as const;

describe("makeTelegramInputFileLocation", () => {
  test("reconstructs a document location from serializable candidate fields", () => {
    const candidate = {
      ...common,
      telegramObjectKind: "document",
    } satisfies TelegramFileCandidate;

    const location = makeTelegramInputFileLocation(candidate);

    expect(location).toBeInstanceOf(Api.InputDocumentFileLocation);
    expect(location).toMatchObject({
      fileReference: Buffer.from([1, 2, 3]),
      thumbSize: "",
    });
    expect(location.accessHash.toString()).toBe("90071992547409931");
    expect(location.id.toString()).toBe("90071992547409932");
  });

  test("preserves the selected Telegram photo size", () => {
    const candidate = {
      ...common,
      telegramObjectKind: "photo",
      thumbSize: "x",
    } satisfies TelegramFileCandidate;

    const location = makeTelegramInputFileLocation(candidate);

    expect(location).toBeInstanceOf(Api.InputPhotoFileLocation);
    expect(location.thumbSize).toBe("x");
    expect(location.fileReference).toEqual(Buffer.from([1, 2, 3]));
  });
});
