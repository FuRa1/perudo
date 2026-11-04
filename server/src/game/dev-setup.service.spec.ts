import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { DevSetupService } from './dev-setup.service';

function serviceWith(config: unknown): DevSetupService {
  const dir = mkdtempSync(join(tmpdir(), 'perudo-dev-'));
  const file = join(dir, 'perudo.config.json');
  writeFileSync(file, JSON.stringify(config));
  const service = new DevSetupService();
  service.load(file);
  return service;
}

describe('DevSetupService (devStartingDice)', () => {
  it('is inactive without a devStartingDice section', () => {
    expect(serviceWith({ enabled: false }).startingDiceFor).toBeUndefined();
  });

  it('gives everyone the default and named players their override', () => {
    const fn = serviceWith({
      devStartingDice: { default: 2, byNickname: { NeverLose: 5 } },
    }).startingDiceFor;
    expect(fn?.('Anne')).toBe(2);
    expect(fn?.('NeverLose')).toBe(5);
  });

  it('clamps values into 1..5 and ignores non-integers', () => {
    const fn = serviceWith({
      devStartingDice: { default: 0, byNickname: { Big: 9, Bad: 'x' } },
    }).startingDiceFor;
    expect(fn?.('Anne')).toBe(1);
    expect(fn?.('Big')).toBe(5);
    expect(fn?.('Bad')).toBe(1);
  });
});
