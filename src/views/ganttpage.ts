// 甘特路由分发：阶段甘特（二级） / 详细甘特（三级）
import { getProject } from '../store';
import { PHASE_META } from '../data/types';
import { renderPhaseGantt, renderDetailGantt } from './gantt';
import { setViewTitle } from './layout';
import { esc } from '../ui';
import type { Route } from '../store';

export function renderGanttPage(root: HTMLElement, route: Route): void {
  const id = route.projectId ?? '';
  const p = getProject(id);
  if (!p) {
    root.innerHTML = '<div class="card p-10 text-center text-ink-faint">未找到该项目</div>';
    return;
  }
  if (route.phase) {
    const phase = PHASE_META[esc(route.phase) as keyof typeof PHASE_META] ? route.phase : undefined;
    setViewTitle(`详细甘特 · ${esc(p.name)}`);
    if (phase) {
      renderDetailGantt(root, p, phase);
    } else {
      renderDetailGantt(root, p);
    }
  } else {
    setViewTitle(`阶段甘特 · ${esc(p.name)}`);
    renderPhaseGantt(root, p);
  }
}