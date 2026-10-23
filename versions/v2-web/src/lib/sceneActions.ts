import type { ProjectFile } from '../core/types';
import { useApp } from '../store/useApp';
import { getViewportController, exportFileName } from '../render/viewportController';
import { basenameWithoutExt, openTextFile, saveFile } from './files';

function safeName(): string {
  return (useApp.getState().docName || 'SolidGeo').replace(/[\\/:*?"<>|]+/g, '-');
}

export function confirmDiscard(): boolean {
  const state = useApp.getState();
  if (!state.dirty) return true;
  return window.confirm('当前场景有未保存的修改，确定要放弃这些修改吗？');
}

export function serializeProject(): string {
  const controller = getViewportController();
  if (controller) {
    useApp.setState({ camera: controller.getCameraState() });
  }
  return JSON.stringify({
    format: 'solidgeo',
    schemaVersion: 2,
    appVersion: '2.0.0',
    name: useApp.getState().docName,
    savedAt: new Date().toISOString(),
    entities: useApp.getState().entities,
    camera: useApp.getState().camera,
    settings: useApp.getState().settings,
  } satisfies ProjectFile, null, 2);
}

export async function saveProject(): Promise<boolean> {
  try {
    const state = useApp.getState();
    const data = serializeProject();
    const defaultPath = `${safeName()}.geojson`;
    const ok = await saveFile({
      title: '保存 SolidGeo 工程',
      defaultPath,
      filters: [{ name: 'SolidGeo 工程', extensions: ['geojson', 'json'] }],
      data,
      mime: 'application/json',
    });
    if (ok) {
      state.setSaved(basenameWithoutExt(defaultPath, 'SolidGeo'));
      state.toast('工程已保存为 .geojson', 'success');
    }
    return ok;
  } catch (error) {
    useApp.getState().toast(`保存失败：${error instanceof Error ? error.message : String(error)}`, 'error');
    return false;
  }
}

export async function openProject(): Promise<void> {
  if (!confirmDiscard()) return;
  try {
    const result = await openTextFile({
      title: '打开 SolidGeo 工程',
      filters: [{ name: 'SolidGeo 工程', extensions: ['geojson', 'json'] }],
    });
    if (result.canceled || !result.data) return;
    const parsed = JSON.parse(result.data) as ProjectFile;
    if (parsed?.format !== 'solidgeo' || !Array.isArray(parsed.entities)) {
      useApp.getState().toast('不是有效的 SolidGeo 工程文件（需包含 format=solidgeo）', 'error');
      return;
    }
    const name = basenameWithoutExt(result.filePath, parsed.name || '未命名场景');
    useApp.getState().loadProject({ ...parsed, name });
  } catch (error) {
    useApp.getState().toast(`打开失败：${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

export function newProject(): void {
  if (!confirmDiscard()) return;
  useApp.getState().newProject();
}

export async function exportPNG(): Promise<void> {
  const controller = getViewportController();
  if (!controller) return;
  try {
    useApp.getState().toast('正在渲染 2× 高清 PNG…', 'info');
    const { dataUrl, width, height } = await controller.exportActivePNG();
    const name = exportFileName('png', `SolidGeo-${safeName()}`);
    const ok = await saveFile({
      title: '导出 PNG 图片',
      defaultPath: name,
      filters: [{ name: 'PNG 图片', extensions: ['png'] }],
      data: dataUrl,
      encoding: 'base64',
      mime: 'image/png',
    });
    if (ok) useApp.getState().toast(`PNG 已导出（${width}×${height}）`, 'success');
  } catch (error) {
    useApp.getState().toast(`PNG 导出失败：${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

export async function exportThreeViewSVG(): Promise<void> {
  const controller = getViewportController();
  if (!controller) return;
  try {
    const svg = controller.exportThreeViewSVG();
    const name = exportFileName('svg', `SolidGeo-三视图-${safeName()}`);
    const ok = await saveFile({
      title: '导出三视图 SVG',
      defaultPath: name,
      filters: [{ name: 'SVG 矢量图', extensions: ['svg'] }],
      data: svg,
      mime: 'image/svg+xml',
    });
    if (ok) useApp.getState().toast('三视图 SVG 已导出', 'success');
  } catch (error) {
    useApp.getState().toast(`三视图导出失败：${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

export async function exportSVG(): Promise<void> {
  const controller = getViewportController();
  if (!controller) return;
  try {
    const svg = controller.exportActiveSVG();
    const name = exportFileName('svg', `SolidGeo-${safeName()}`);
    const ok = await saveFile({
      title: '导出 SVG 矢量图',
      defaultPath: name,
      filters: [{ name: 'SVG 矢量图', extensions: ['svg'] }],
      data: svg,
      mime: 'image/svg+xml',
    });
    if (ok) useApp.getState().toast('SVG 已导出（当前视口）', 'success');
  } catch (error) {
    useApp.getState().toast(`SVG 导出失败：${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

export async function exportOBJ(): Promise<void> {
  const controller = getViewportController();
  if (!controller) return;
  try {
    const obj = controller.exportOBJ();
    const name = exportFileName('obj', `SolidGeo-${safeName()}`);
    const ok = await saveFile({
      title: '导出 OBJ 三维模型',
      defaultPath: name,
      filters: [{ name: 'Wavefront OBJ', extensions: ['obj'] }],
      data: obj,
      mime: 'text/plain',
    });
    if (ok) useApp.getState().toast('OBJ 模型已导出', 'success');
  } catch (error) {
    useApp.getState().toast(`OBJ 导出失败：${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}

export async function exportSectionFile(sectionId: string, format: 'svg' | 'obj'): Promise<void> {
  const controller = getViewportController();
  if (!controller) return;
  try {
    const data = controller.exportSection(sectionId, format);
    if (!data) {
      useApp.getState().toast('该截面暂无可导出的多边形', 'warn');
      return;
    }
    const name = exportFileName(format, `SolidGeo-截面-${safeName()}`);
    const ok = await saveFile({
      title: `导出截面 ${format.toUpperCase()}`,
      defaultPath: name,
      filters: [
        format === 'svg'
          ? { name: 'SVG 矢量图', extensions: ['svg'] }
          : { name: 'Wavefront OBJ', extensions: ['obj'] },
      ],
      data,
      mime: format === 'svg' ? 'image/svg+xml' : 'text/plain',
    });
    if (ok) useApp.getState().toast(`截面已导出为 ${format.toUpperCase()}`, 'success');
  } catch (error) {
    useApp.getState().toast(`截面导出失败：${error instanceof Error ? error.message : String(error)}`, 'error');
  }
}
