import { getMany } from 'idb-keyval';
import { DEVICE_KEYS } from './deviceFormat';
import { flushStorage } from './persistence';

/** Local file only; no data leaves the device through a network request. */
export function exportJson(filename: string, data: unknown): void {
  const json = JSON.stringify(data, null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Raw values remain exportable even when a format validator refuses to open them. */
export async function exportDeviceData(): Promise<void> {
  await flushStorage();
  const values = await getMany<unknown>([...DEVICE_KEYS]);
  exportJson(`greenmafia-device-${Date.now()}.json`, { format: 'greenmafia-device-backup', version: 1, exportedAt: Date.now(), data: Object.fromEntries(DEVICE_KEYS.map((key, i) => [key, values[i]])) });
}
