import {
  ErrorCode,
  GamePhase,
  RULES_CONFIG,
  SequenceDiceRoller,
  type ActionResult,
  type JoinedRoom,
} from '@shared';
import { RoomsService } from './rooms.service';

function joined(result: ActionResult<JoinedRoom>): JoinedRoom {
  if (!result.ok) {
    throw new Error(`Expected to join, got ${result.error.code}`);
  }
  return result.data;
}

function errorCode(result: ActionResult<unknown>): ErrorCode | null {
  return result.ok ? null : result.error.code;
}

describe('RoomsService', () => {
  let service: RoomsService;

  beforeEach(() => {
    service = new RoomsService(new SequenceDiceRoller([6, 2, 3]));
  });

  it('creates a room with a shareable code and seats the creator', async () => {
    const { roomId, playerId } = joined(await service.createRoom('Jack'));
    expect(roomId).toMatch(new RegExp(`^[${RULES_CONFIG.room.codeAlphabet}]{5}$`));
    const [entry] = service.viewsFor(roomId);
    expect(entry?.playerId).toBe(playerId);
    expect(entry?.view.players.map((p) => p.nickname)).toEqual(['Jack']);
  });

  it('rejects joining a room that does not exist', async () => {
    expect(errorCode(await service.joinRoom('ZZZZZ', 'Will'))).toBe(ErrorCode.ROOM_NOT_FOUND);
  });

  it('rejects the 13th player with ROOM_FULL', async () => {
    const { roomId } = joined(await service.createRoom('p0'));
    for (let i = 1; i < RULES_CONFIG.players.max; i += 1) {
      joined(await service.joinRoom(roomId, `p${i}`));
    }
    expect(errorCode(await service.joinRoom(roomId, 'late'))).toBe(ErrorCode.ROOM_FULL);
  });

  it('answers an illegal intent with an error and leaves the state untouched', async () => {
    const { roomId, playerId } = joined(await service.createRoom('Jack'));
    const before = service.viewsFor(roomId)[0]?.view;
    const result = await service.submitIntent(roomId, { type: 'CALL_LIAR', playerId });
    expect(errorCode(result)).toBe(ErrorCode.WRONG_PHASE);
    expect(service.viewsFor(roomId)[0]?.view).toEqual(before);
  });

  it('notifies listeners on every successful change', async () => {
    const changed: string[] = [];
    service.onRoomChanged((roomId) => changed.push(roomId));
    const { roomId, playerId } = joined(await service.createRoom('Jack'));
    await service.submitIntent(roomId, { type: 'SET_READY', playerId, isReady: true });
    expect(changed).toEqual([roomId, roomId]);
  });

  it('frees a lobby seat on disconnect, but keeps it once the match has started', async () => {
    const { roomId, playerId: jack } = joined(await service.createRoom('Jack'));
    const { playerId: will } = joined(await service.joinRoom(roomId, 'Will'));
    const { playerId: anne } = joined(await service.joinRoom(roomId, 'Anne'));

    await service.disconnect(roomId, anne);
    expect(service.viewsFor(roomId)[0]?.view.players).toHaveLength(2);

    await service.submitIntent(roomId, { type: 'SET_READY', playerId: jack, isReady: true });
    await service.submitIntent(roomId, { type: 'SET_READY', playerId: will, isReady: true });
    await service.disconnect(roomId, will);

    const view = service.viewsFor(roomId)[0]?.view;
    expect(view?.phase).toBe(GamePhase.START_ROLL);
    expect(view?.players.find((p) => p.id === will)?.isConnected).toBe(false);
  });

  it('discards a room once its last connection drops', async () => {
    const { roomId, playerId } = joined(await service.createRoom('Jack'));
    await service.disconnect(roomId, playerId);
    expect(service.hasRoom(roomId)).toBe(false);
  });
});
