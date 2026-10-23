export const isElectron = Boolean(window.solidgeo?.isElectron);

export function downloadBlob(data: Blob | string, filename: string, mime = 'text/plain') {
  const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(meta)?.[1] ?? 'application/octet-stream';
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export interface SaveOptions {
  title: string;
  defaultPath: string;
  filters: Array<{ name: string; extensions: string[] }>;
  data: string;
  encoding?: 'utf8' | 'base64';
  mime?: string;
}

export async function saveFile(options: SaveOptions): Promise<boolean> {
  if (window.solidgeo?.isElectron) {
    const result = await window.solidgeo.saveFile({
      title: options.title,
      defaultPath: options.defaultPath,
      filters: options.filters,
      data: options.data,
      encoding: options.encoding,
    });
    return !result.canceled;
  }
  if (options.encoding === 'base64' || options.data.startsWith('data:')) {
    downloadBlob(dataUrlToBlob(options.data), options.defaultPath, options.mime ?? 'application/octet-stream');
  } else {
    downloadBlob(options.data, options.defaultPath, options.mime);
  }
  return true;
}

export interface OpenResult {
  canceled: boolean;
  filePath?: string;
  data?: string;
}

export async function openTextFile(options: {
  title: string;
  filters: Array<{ name: string; extensions: string[] }>;
}): Promise<OpenResult> {
  if (window.solidgeo?.isElectron) {
    return window.solidgeo.openFile(options);
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = options.filters.flatMap((f) => f.extensions.map((e) => `.${e}`)).join(',');
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve({ canceled: true });
        return;
      }
      resolve({ canceled: false, filePath: file.name, data: await file.text() });
    };
    input.oncancel = () => resolve({ canceled: true });
    input.click();
  });
}

export function basenameWithoutExt(path: string | undefined, fallback: string): string {
  if (!path) return fallback;
  const name = path.split(/[\\/]/).pop() ?? fallback;
  return name.replace(/\.[^.]+$/, '') || fallback;
}
