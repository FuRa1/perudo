import { RULES_CONFIG, type Bid, type NormalFace } from '@shared';

/**
 * Shape validation for untrusted socket payloads (4.2). Every guard takes `unknown` and returns
 * the narrowed value or `null` — malformed input becomes an INVALID_PAYLOAD error, never a crash.
 */

const NORMAL_FACES: readonly number[] = [2, 3, 4, 5, 6];
const ROOM_CODE_PATTERN = new RegExp(
  `^[${RULES_CONFIG.room.codeAlphabet}]{${RULES_CONFIG.room.codeLength}}$`,
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isNormalFace(value: unknown): value is NormalFace {
  return typeof value === 'number' && NORMAL_FACES.includes(value);
}

export function parseNickname(body: unknown): string | null {
  if (!isRecord(body) || typeof body['nickname'] !== 'string') {
    return null;
  }
  const nickname = body['nickname'].trim();
  const isValidLength =
    nickname.length >= 1 && nickname.length <= RULES_CONFIG.room.nicknameMaxLength;
  return isValidLength ? nickname : null;
}

export function parseRoomCode(body: unknown): string | null {
  if (!isRecord(body) || typeof body['roomId'] !== 'string') {
    return null;
  }
  const code = body['roomId'].trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(code) ? code : null;
}

export function parseIsReady(body: unknown): boolean | null {
  if (!isRecord(body) || typeof body['isReady'] !== 'boolean') {
    return null;
  }
  return body['isReady'];
}

export function parseBid(body: unknown): Bid | null {
  if (!isRecord(body) || !isRecord(body['bid'])) {
    return null;
  }
  const { kind, quantity, face } = body['bid'];
  if (!isPositiveInteger(quantity)) {
    return null;
  }
  if (kind === 'ACE') {
    return { kind: 'ACE', quantity };
  }
  if (kind === 'NORMAL' && isNormalFace(face)) {
    return { kind: 'NORMAL', quantity, face };
  }
  return null;
}
