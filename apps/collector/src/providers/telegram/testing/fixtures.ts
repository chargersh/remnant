import bigInt from "big-integer";
import { Api } from "telegram";

const TEST_DATE_SECONDS = 1_700_000_000;

export const makeTextMessageFixture = (
  overrides: Partial<ConstructorParameters<typeof Api.Message>[0]> = {}
) =>
  new Api.Message({
    date: TEST_DATE_SECONDS,
    entities: [
      new Api.MessageEntityBold({ length: 5, offset: 0 }),
      new Api.MessageEntityCustomEmoji({
        documentId: bigInt("90071992547409930"),
        length: 2,
        offset: 6,
      }),
    ],
    fromId: new Api.PeerUser({ userId: bigInt(42) }),
    id: 100,
    message: "hello 😀",
    peerId: new Api.PeerUser({ userId: bigInt(84) }),
    views: 10,
    ...overrides,
  });

export const makeDocumentMessageFixture = (
  attributes: Api.TypeDocumentAttribute[] = [
    new Api.DocumentAttributeFilename({ fileName: "clip.mp4" }),
    new Api.DocumentAttributeVideo({
      duration: 12.5,
      h: 720,
      supportsStreaming: true,
      w: 1280,
    }),
  ],
  documentOverrides: Partial<ConstructorParameters<typeof Api.Document>[0]> = {}
) =>
  new Api.Message({
    date: TEST_DATE_SECONDS,
    fromId: new Api.PeerUser({ userId: bigInt(42) }),
    id: 101,
    media: new Api.MessageMediaDocument({
      document: new Api.Document({
        accessHash: bigInt("90071992547409931"),
        attributes,
        date: TEST_DATE_SECONDS,
        dcId: 2,
        fileReference: Buffer.from([1, 2, 3]),
        id: bigInt("90071992547409932"),
        mimeType: "video/mp4",
        size: bigInt(1_024_000),
        ...documentOverrides,
      }),
      spoiler: true,
    }),
    message: "a clip",
    peerId: new Api.PeerUser({ userId: bigInt(84) }),
  });

export const makePhotoMessageFixture = (ttlSeconds?: number) =>
  new Api.Message({
    date: TEST_DATE_SECONDS,
    fromId: new Api.PeerUser({ userId: bigInt(42) }),
    id: 104,
    media: new Api.MessageMediaPhoto({
      photo: new Api.Photo({
        accessHash: bigInt("90071992547409934"),
        date: TEST_DATE_SECONDS,
        dcId: 2,
        fileReference: Buffer.from([4, 5, 6]),
        id: bigInt("90071992547409933"),
        sizes: [new Api.PhotoSize({ h: 480, size: 50_000, type: "x", w: 640 })],
      }),
      ...(ttlSeconds === undefined ? {} : { ttlSeconds }),
    }),
    message: "",
    peerId: new Api.PeerUser({ userId: bigInt(84) }),
  });

export const makePaidMediaMessageFixture = (
  extendedMedia: Api.TypeMessageExtendedMedia[] = [
    new Api.MessageExtendedMediaPreview({
      h: 2560,
      thumb: new Api.PhotoStrippedSize({
        bytes: Buffer.from([1, 2, 3]),
        type: "i",
      }),
      w: 1920,
    }),
    new Api.MessageExtendedMediaPreview({
      h: 2208,
      thumb: new Api.PhotoStrippedSize({
        bytes: Buffer.from([4, 5]),
        type: "i",
      }),
      w: 1242,
    }),
    new Api.MessageExtendedMediaPreview({
      h: 2208,
      thumb: new Api.PhotoStrippedSize({ bytes: Buffer.from([6]), type: "i" }),
      w: 1242,
    }),
  ],
  starsAmount = "88"
) =>
  new Api.Message({
    date: TEST_DATE_SECONDS,
    fromId: new Api.PeerChannel({ channelId: bigInt(7) }),
    id: 107,
    media: new Api.MessageMediaPaidMedia({
      extendedMedia,
      starsAmount: bigInt(starsAmount),
    }),
    message: "paid media",
    peerId: new Api.PeerChannel({ channelId: bigInt(7) }),
  });

export const makeServiceMessageFixture = () =>
  new Api.MessageService({
    action: new Api.MessageActionChatEditTitle({ title: "New title" }),
    date: TEST_DATE_SECONDS,
    fromId: new Api.PeerUser({ userId: bigInt(42) }),
    id: 102,
    peerId: new Api.PeerChat({ chatId: bigInt(7) }),
  });

export const makePhoneCallServiceMessageFixture = (
  actionOverrides: Partial<
    ConstructorParameters<typeof Api.MessageActionPhoneCall>[0]
  > = {},
  messageOverrides: Partial<
    ConstructorParameters<typeof Api.MessageService>[0]
  > = {}
) =>
  new Api.MessageService({
    action: new Api.MessageActionPhoneCall({
      callId: bigInt("90071992547409935"),
      ...actionOverrides,
    }),
    date: TEST_DATE_SECONDS,
    fromId: new Api.PeerUser({ userId: bigInt(42) }),
    id: 105,
    peerId: new Api.PeerUser({ userId: bigInt(84) }),
    ...messageOverrides,
  });

export const makeGroupCallServiceMessageFixture = (
  action:
    | Api.MessageActionGroupCall
    | Api.MessageActionGroupCallScheduled
    | Api.MessageActionInviteToGroupCall,
  messageOverrides: Partial<
    ConstructorParameters<typeof Api.MessageService>[0]
  > = {}
) =>
  new Api.MessageService({
    action,
    date: TEST_DATE_SECONDS,
    fromId: new Api.PeerUser({ userId: bigInt(42) }),
    id: 106,
    peerId: new Api.PeerChannel({ channelId: bigInt(7) }),
    ...messageOverrides,
  });

export const makeEmptyMessageFixture = () =>
  new Api.MessageEmpty({
    id: 103,
    peerId: new Api.PeerChannel({ channelId: bigInt(9) }),
  });
