import { SerialQueue } from './serial-queue';

describe('SerialQueue — one room mutation at a time (3.3)', () => {
  it('never interleaves async tasks', async () => {
    const queue = new SerialQueue();
    const log: string[] = [];
    const task =
      (name: string, delayMs: number): (() => Promise<void>) =>
      async () => {
        log.push(`${name}:start`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        log.push(`${name}:end`);
      };

    await Promise.all([queue.run(task('a', 20)), queue.run(task('b', 0))]);

    expect(log).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });

  it('keeps running after a task fails', async () => {
    const queue = new SerialQueue();
    const failing = queue.run(() => {
      throw new Error('boom');
    });
    await expect(failing).rejects.toThrow('boom');
    await expect(queue.run(() => 'still alive')).resolves.toBe('still alive');
  });
});
