import bigInt from "big-integer";
import { Api } from "telegram";
import type { TelegramFileCandidate } from "./message-contracts";

export const makeTelegramInputFileLocation = (
  candidate: TelegramFileCandidate
): Api.InputDocumentFileLocation | Api.InputPhotoFileLocation => {
  const common = {
    accessHash: bigInt(candidate.accessHash),
    fileReference: Buffer.from(candidate.fileReferenceBase64, "base64"),
    id: bigInt(candidate.telegramFileId),
  };

  return candidate.telegramObjectKind === "document"
    ? new Api.InputDocumentFileLocation({ ...common, thumbSize: "" })
    : new Api.InputPhotoFileLocation({
        ...common,
        thumbSize: candidate.thumbSize,
      });
};
