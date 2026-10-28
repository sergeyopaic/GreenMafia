import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SFX_NAMES } from './soundPolicy';

vi.mock('./assets', () => ({ asset: (name: string) => `/${name}.wav` }));

let page: EventTarget & { hidden: boolean };
let audio: ReturnType<typeof makeAudio>;
let haptics: ReturnType<typeof vi.fn>;
const sources: ReturnType<typeof makeSource>[] = [];
function makeSource() {
  return { buffer: null, onended: null, connect: vi.fn((gain: unknown) => gain), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn() };
}
function makeAudio() {
  return {
    state: 'running', destination: {}, resume: vi.fn(async () => {}),
    decodeAudioData: vi.fn(async () => ({} as AudioBuffer)),
    createBufferSource: vi.fn(() => { const source = makeSource(); sources.push(source); return source; }),
    createGain: vi.fn(() => ({ gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() })),
  };
}
async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
async function setup() {
  const sound = await import('./sound');
  sound.initSound();
  window.dispatchEvent(new Event('pointerdown'));
  return sound;
}

beforeEach(() => {
  vi.resetModules(); sources.length = 0;
  page = Object.assign(new EventTarget(), { hidden: false });
  audio = makeAudio(); haptics = vi.fn(() => true);
  vi.stubGlobal('document', page);
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('navigator', { vibrate: haptics });
  vi.stubGlobal('AudioContext', vi.fn(function () { return audio; }));
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('воспроизведение без ночных подсказок', () => {
  it('днём воспроизводит сигнал и вибрацию таймера', async () => {
    const sound = await setup(); sound.setSoundContext('discussion', false);
    sound.play('time-up'); sound.vibrate([200, 100, 200]); await settle();
    expect(sources).toHaveLength(1); expect(sources[0]!.start).toHaveBeenCalledOnce();
    expect(haptics).toHaveBeenCalledWith([200, 100, 200]);
  });

  it('ночью проигрывает только общие сигналы, без загрузки звуков действий и без вибрации', async () => {
    const sound = await setup(); sound.setSoundContext('night', false);
    for (const name of SFX_NAMES) sound.play(name);
    sound.vibrate([200, 100, 200]); await settle();
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(['/audio/sfx/night-fall.wav', '/audio/sfx/morning.wav']);
    expect(sources).toHaveLength(2); expect(haptics).not.toHaveBeenCalled();
  });

  it('при раздаче допускает только общий конверт и запрещает вибрацию', async () => {
    const sound = await setup(); sound.setSoundContext('reveal', false);
    for (const name of SFX_NAMES) sound.play(name);
    sound.vibrate(100); await settle();
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(['/audio/sfx/envelope.wav']);
    expect(sources).toHaveLength(1); expect(haptics).not.toHaveBeenCalled();
  });

  it.each(['night', 'pause', 'mute', 'hidden'] as const)('запоздавшее декодирование не запускает звук после %s', async (change) => {
    const sound = await setup(); sound.setSoundContext('discussion', false);
    let decoded!: (value: AudioBuffer) => void;
    audio.decodeAudioData.mockImplementationOnce(() => new Promise((resolve) => { decoded = resolve; }));
    sound.play('time-up'); await settle(); expect(decoded).toBeTypeOf('function');
    if (change === 'night') sound.setSoundContext('night', false);
    if (change === 'pause') sound.setSoundContext('discussion', true);
    if (change === 'mute') sound.setSoundEnabled(false);
    if (change === 'hidden') { page.hidden = true; page.dispatchEvent(new Event('visibilitychange')); }
    // Even a quick return must not resurrect a signal requested in an older context.
    sound.setSoundContext('discussion', false); sound.setSoundEnabled(true); page.hidden = false;
    decoded({} as AudioBuffer); await settle(); expect(sources).toHaveLength(0);
  });

  it.each(['night', 'reveal', 'pause', 'hidden'] as const)('останавливает уже начатые звук и вибрацию при %s', async (change) => {
    const sound = await setup(); sound.setSoundContext('discussion', false);
    sound.play('time-up'); sound.vibrate([200, 100, 200]); await settle();
    haptics.mockClear();
    if (change === 'night' || change === 'reveal') sound.setSoundContext(change, false);
    if (change === 'pause') sound.setSoundContext('discussion', true);
    if (change === 'hidden') { page.hidden = true; page.dispatchEvent(new Event('visibilitychange')); }
    expect(sources[0]!.stop).toHaveBeenCalledOnce();
    expect(haptics).toHaveBeenCalledExactlyOnceWith(0);
    sound.vibrate(200); sound.play('chip'); await settle();
    expect(sources).toHaveLength(1); expect(haptics).toHaveBeenCalledTimes(1);
  });

  it('позволяет вибрацию без звука и звук без вибрации; выключение вибрации отменяет начатый паттерн', async () => {
    const sound = await setup(); sound.setSoundContext('discussion', false);
    sound.setSoundEnabled(false); sound.vibrate([200, 100, 200]); sound.play('time-up'); await settle();
    expect(haptics).toHaveBeenCalledWith([200, 100, 200]); expect(sources).toHaveLength(0);
    sound.setVibrationEnabled(false); expect(haptics).toHaveBeenLastCalledWith(0);
    haptics.mockClear(); sound.setSoundEnabled(true); sound.play('time-up'); sound.vibrate(200); await settle();
    expect(sources).toHaveLength(1); expect(haptics).not.toHaveBeenCalled();
  });

  it('включение обоих сигналов в настройках не разрешает ночные действия', async () => {
    const sound = await setup(); sound.setSoundContext('night', false);
    sound.setSoundEnabled(true); sound.setVibrationEnabled(true);
    sound.play('chip'); sound.vibrate(200); await settle();
    expect(sources).toHaveLength(0); expect(haptics).not.toHaveBeenCalled();
  });

  it('не превращает отказ аудио или неподдерживаемую вибрацию в сбой партии', async () => {
    const sound = await setup(); sound.setSoundContext('discussion', false);
    audio.decodeAudioData.mockRejectedValueOnce(new Error('Audio unavailable'));
    haptics.mockImplementation(() => { throw new Error('Unsupported'); });
    expect(() => { sound.play('time-up'); sound.vibrate(200); }).not.toThrow();
    await settle(); expect(sources).toHaveLength(0);
    sound.play('time-up'); await settle(); expect(sources).toHaveLength(1);
  });
});
