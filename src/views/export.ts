// 数据导出：Excel 项目清单 + 汇总报告
import { activeStageIndex, collectReminders, getProjects, getProject, getTeam } from '../store';
import { PHASE_META, type PhaseKey, type Project, type StageStatus } from '../data/types';
import { downloadText, exportXlsx, exportXlsxReport, fmtISO } from '../lib';
import { esc, icon, toast } from '../ui';

/** 生成「项目汇总报告」Excel：单工作簿 3 工作表（总览 + 逾期红标 + 近7天到期） */
export function exportSummaryReport(): void {
  const projects = getProjects();
  const today = new Date();
  const stamp = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
  const fmtD = (d?: string): string => (d ? fmtISO(d) : '');

  const stageName = (s?: { key?: string; status?: StageStatus }): string =>
    s && s.key && PHASE_META[s.key as PhaseKey] ? PHASE_META[s.key as PhaseKey].name : '';

  // 逾期项目：计划结束已过（取最后一个未完成阶段）
  const overdue = projects
    .map(p => {
      const active = p.stages.find(s => s.status !== 'done');
      const ref = active && active.planEnd ? active : p.stages[p.stages.length - 1];
      const refPlan = ref?.planEnd || p.planEnd;
      if (!refPlan) return null;
      const days = Math.ceil((new Date(refPlan).getTime() - today.getTime()) / 86400000);
      return days < 0 ? { p, days: Math.abs(days), ref, refPlan } : null;
    })
    .filter((x): x is { p: Project; days: number; ref: Project['stages'][number]; refPlan: string } => !!x)
    .sort((a, b) => b.days - a.days);

  // 总览表中逾期项目所在行号（body 索引）
  const overdueIdx = projects
    .map((p, i) => {
      const active = p.stages.find(s => s.status !== 'done');
      const refPlan = (active && active.planEnd ? active.planEnd : null) || p.planEnd;
      if (!refPlan) return -1;
      const days = Math.ceil((new Date(refPlan).getTime() - today.getTime()) / 86400000);
      return days < 0 ? i : -1;
    })
    .filter(i => i >= 0);

  // 近7天到期任务
  const dueSoon = collectReminders()
    .map(r => ({ ...r, days: Math.ceil((new Date(r.date).getTime() - today.getTime()) / 86400000) }))
    .filter(r => r.days >= 0 && r.days <= 7)
    .sort((a, b) => a.days - b.days);

  exportXlsxReport(`项目汇总报告_${stamp}.xlsx`, [
    {
      title: '项目总览',
      header: ['项目编号', '项目名称', '客户', '当前阶段', '进度%', '计划开始', '计划结束', '优先级'],
      body: projects.map(p => {
        const ai = activeStageIndex(p);
        const cur = p.stages[ai];
        return [
          p.code,
          p.name,
          p.customer,
          cur && cur.status !== 'done' ? stageName(cur) : '已完成',
          p.progress,
          fmtD(p.planStart),
          fmtD(p.planEnd),
          p.priority === 'urgent' ? '紧急' : p.priority === 'high' ? '重要' : '普通',
        ];
      }),
      redRows: overdueIdx,
    },
    {
      title: '逾期项目',
      header: ['项目编号', '项目名称', '客户', '进行中阶段', '计划结束', '逾期天数'],
      body: overdue.map(o => [
        o.p.code,
        o.p.name,
        o.p.customer,
        o.p.stages.filter(s => s.status === 'active').map(stageName).filter(Boolean).join('、') || '—',
        fmtD(o.refPlan),
        o.days,
      ]),
      redRows: overdue.map((_, i) => i),
    },
    {
      title: '近7天到期任务',
      header: ['项目编号', '项目名称', '任务/阶段', '级别', '日期', '剩余天数'],
      body: dueSoon.map(r => [
        r.code,
        r.projectName,
        r.title,
        r.level === 'overdue' ? '已逾期' : r.level === 'urgent' ? '紧急' : '预警',
        fmtD(r.date),
        r.days,
      ]),
    },
  ]);
  toast('已导出项目汇总报告（Excel）');
}

function label(c: string): string {
  return c === 'tech' ? '技术支持' : c === 'dev' ? '开发' : c === 'sales' ? '销售' : '';
}

function priorityLabel(p: string): string {
  return p === 'urgent' ? '紧急' : p === 'high' ? '重要' : '普通';
}

/** 导出项目清单为 Excel（.xlsx） */
export async function exportExcel(): Promise<void> {
  const projects = getProjects();
  const header = [
    '项目编号',
    '项目名称',
    '客户',
    '业务类别',
    '项目负责人',
    '甲方对接人',
    '甲方电话',
    '我方对接人',
    '我方电话',
    '我方角色',
    '当前阶段',
    '总体进度%',
    '计划开始',
    '计划结束',
    '预算',
    '优先级',
  ];
  const rows: (string | number)[][] = projects.map(p => {
    const ai = activeStageIndex(p);
    const cur = p.stages[ai];
    return [
      p.code,
      p.name,
      p.customer,
      p.category,
      p.manager,
      p.contacts.a.name,
      p.contacts.a.tel,
      p.contacts.b.name,
      p.contacts.b.tel,
      p.contacts.b.role ? label(p.contacts.b.role) : '',
      cur ? PHASE_META[cur.key].name : '已完成',
      p.progress,
      fmtISO(p.planStart),
      fmtISO(p.planEnd),
      p.budget,
      priorityLabel(p.priority),
    ];
  });
  await exportXlsx(`项目清单_${fmtISO(new Date().toISOString())}.xlsx`, '项目清单', [header, ...rows]);
}

/** 汇总报告 HTML（下载 + 打印） */
export function exportReport(): void {
  const projects = getProjects();
  const inProgress = projects.filter(p => p.stages.some(s => s.status === 'active')).length;
  const done = projects.filter(p => p.stages[p.stages.length - 1].status === 'done').length;
  const body = projects
    .map(p => {
      const ai = activeStageIndex(p);
      const cur = p.stages[ai];
      const curName = cur ? PHASE_META[cur.key].name : '已完成';
      return `<tr>
        <td>${p.code}</td><td>${p.name}</td><td>${p.customer}</td>
        <td>${curName}</td><td>${p.progress}%</td>
        <td>${fmtISO(p.planStart)} — ${fmtISO(p.planEnd)}</td>
        <td>${priorityLabel(p.priority)}</td>
      </tr>`;
    })
    .join('');

  const html = `<html lang="zh-CN"><head><meta charset="utf-8">
<title>项目汇总报告</title>
<style>
body{font-family:"Microsoft YaHei",sans-serif;color:#2B3A4A;margin:32px;font-size:13px}
h1{font-size:20px;text-align:center;border-bottom:2px solid #5B9BD5;padding-bottom:12px}
.meta{text-align:center;color:#888;margin-bottom:24px;font-size:12px}
.cards{display:flex;gap:16px;margin:18px 0;flex-wrap:wrap}
.c{flex:1;min-width:140px;border:1px solid #E1E8F0;border-radius:8px;padding:14px;text-align:center}
.c .v{font-size:26px;font-weight:600;color:#5B9BD5}
.c .l{font-size:12px;color:#6B7A90;margin-top:4px}
table{width:100%;border-collapse:collapse;margin-top:12px}
th,td{border:1px solid #C9D8E8;padding:8px 10px;text-align:left}
th{background:#EAF3FB;font-size:12px}
</style></head><body>
<h1>IT 集成项目管理系统 · 项目汇总报告</h1>
<div class="meta">报告生成时间：${new Date().toLocaleString('zh-CN')} · 共 ${projects.length} 个项目</div>
<div class="cards">
  <div class="c"><div class="v">${projects.length}</div><div class="l">项目总数</div></div>
  <div class="c"><div class="v">${inProgress}</div><div class="l">进行中</div></div>
  <div class="c"><div class="v">${done}</div><div class="l">已验收</div></div>
  <div class="c"><div class="v">${projects.length - inProgress - done}</div><div class="l">其它</div></div>
</div>
<h2 style="font-size:15px;margin-top:24px">项目清单</h2>
<table><thead><tr>
  <th>编号</th><th>项目名称</th><th>客户</th><th>当前阶段</th><th>进度</th><th>计划周期</th><th>优先级</th>
</tr></thead><tbody>${body}</tbody></table>
<script>window.print ? '' : ''</script>
</body></html>`;

  // 新窗口打印预览
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
  } else {
    downloadText(`项目汇总报告_${fmtISO(new Date().toISOString())}.html`, html, 'text/html');
  }
}

/** 导出团队成员表为 Excel */
export async function exportTeamExcel(): Promise<void> {
  const team = getTeam();
  const header = ['姓名', '角色', '手机号', '邮箱', '所属部门', '备注'];
  const rows: (string | number)[][] = team.map(t => [
    t.name,
    t.roles.map(r => label(r)).filter(Boolean).join(' / '),
    t.tel,
    t.email,
    t.dept,
    t.note,
  ]);
  await exportXlsx(`团队成员_${fmtISO(new Date().toISOString())}.xlsx`, '团队成员', [header, ...rows]);
}

/** 导出单个项目明细（阶段 + 任务）为 Excel */
export async function exportProjectDetail(pid: string): Promise<void> {
  const p = getProject(pid);
  if (!p) {
    toast('未找到该项目');
    return;
  }
  const stageRows = p.stages.map(s => {
    const m = PHASE_META[s.key];
    return [
      m.code,
      m.name,
      s.status === 'done' ? '已完成' : s.status === 'active' ? '进行中' : '未开始',
      fmtISO(s.planStart),
      fmtISO(s.planEnd),
      s.actualStart ? fmtISO(s.actualStart) : '',
      s.actualEnd ? fmtISO(s.actualEnd) : '',
    ];
  });
  const taskRows = p.tasks.map(t => [
    PHASE_META[t.phase].name,
    t.name,
    t.owner,
    t.status === 'done' ? '已完成' : t.status === 'doing' ? '进行中' : '未开始',
    `${t.progress}%`,
    fmtISO(t.start),
    fmtISO(t.end),
  ]);
  await exportXlsx(`${p.name}_明细_${fmtISO(new Date().toISOString())}.xlsx`, '项目明细', [
    ['项目编号', '项目名称', '客户', '项目负责人', '合同编号', '预算', '项目等级'],
    [p.code, p.name, p.customer, p.manager, p.contract?.no ?? '', p.budget, p.level ?? ''],
    [],
    ['--- 项目阶段 ---'],
    ['序号', '阶段', '状态', '计划开始', '计划结束', '实际开始', '实际结束'],
    ...stageRows,
    [],
    ['--- 项目任务 ---'],
    ['阶段', '任务', '负责人', '状态', '进度', '开始', '结束'],
    ...taskRows,
  ]);
}

/** 数据导出页面 */
export function renderExport(root: HTMLElement): void {
  const projects = getProjects();

  const item = (p: Project): string => {
    const ai = activeStageIndex(p);
    const cur = p.stages[ai];
    return `<label class="flex items-center gap-2.5 border rounded-lg px-3 py-2.5 hover:bg-brand-soft transition-colors cursor-pointer">
      <input type="checkbox" data-pid="${p.id}" class="ex-chk accent-[#5B9BD5]" />
      <span class="flex-1 min-w-0">
        <span class="block text-[13px] font-medium text-ink truncate">${esc(p.name)}</span>
        <span class="block text-[11px] text-ink-faint truncate">${esc(p.code)} · ${esc(
          p.customer,
        )} · ${cur ? PHASE_META[cur.key].name : ''} · ${p.progress}%</span>
      </span>
    </label>`;
  };

  root.innerHTML = `
  <div class="max-w-[1100px] mx-auto space-y-4 view-enter">
    <div class="flex items-center gap-2 text-[15px] font-semibold text-ink">${icon('export', 17)} 数据导出</div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div class="lg:col-span-2 card overflow-hidden">
        <div class="px-4 py-3 border-b border-hair flex items-center justify-between">
          <span class="text-[14px] font-semibold text-ink">选择导出范围</span>
          <div class="flex items-center gap-2 text-[12px]">
            <button id="exAll" class="text-brand-deep hover:underline">全选</button>
            <span class="text-ink-faint">/</span>
            <button id="exNone" class="text-brand-deep hover:underline">取消</button>
          </div>
        </div>
        <div class="p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[52vh] overflow-auto" id="exList">
          ${projects.map(item).join('')}
        </div>
      </div>

      <div class="space-y-4">
        ${['项目清单(Excel)', '单项目明细(Excel)', '团队成员表(Excel)', '汇总报告(HTML)', '项目汇总报告(Excel)']
          .map(
            (t, i) => `
          <button class="card w-full text-left p-4 hover:shadow-md transition-shadow" data-ex-type="${i}">
            <div class="flex items-center gap-2 text-[13px] font-semibold text-ink">${icon(
              i === 3 || i === 4 ? 'doc' : 'export',
              15,
            )} ${t}</div>
            <div class="text-[11px] text-ink-faint mt-1">${
              i === 0
                ? '全部在手项目关键信息一表呈现'
                : i === 1
                  ? '勾选项目的阶段 + 任务明细'
                  : i === 2
                    ? '团队成员基本信息表'
                    : i === 3
                      ? '项目数量/阶段分布/逾期与汇总'
                      : '总览 + 逾期清单(红标) + 近7天到期任务'
            }</div>
          </button>`,
          )
          .join('')}
        <div class="card p-4">
          <div class="text-[13px] font-semibold text-ink inline-flex items-center gap-2">${icon(
            'check',
            15,
          )} 已勾选 <span id="exCount" class="text-brand-deep">0</span> 个项目</div>
          <div class="text-[11px] text-ink-faint mt-1">勾选多个项目后可批量生成同一类型文档（见「文档模板」）。</div>
        </div>
      </div>
    </div>
  </div>`;

  const selected = (): string[] =>
    Array.from(root.querySelectorAll<HTMLInputElement>('.ex-chk:checked')).map(
      c => c.getAttribute('data-pid') ?? '',
    );

  const updateCount = (): void => {
    const c = root.querySelector('#exCount');
    if (c) c.textContent = String(selected().length);
  };
  root.querySelectorAll<HTMLInputElement>('.ex-chk').forEach(ch =>
    ch.addEventListener('change', updateCount),
  );
  root.querySelector('#exAll')?.addEventListener('click', () => {
    root.querySelectorAll<HTMLInputElement>('.ex-chk').forEach(c => (c.checked = true));
    updateCount();
  });
  root.querySelector('#exNone')?.addEventListener('click', () => {
    root.querySelectorAll<HTMLInputElement>('.ex-chk').forEach(c => (c.checked = false));
    updateCount();
  });

  root.querySelectorAll<HTMLElement>('[data-ex-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = Number(btn.getAttribute('data-ex-type'));
      const ids = selected();
      if (t === 0) exportExcel();
      else if (t === 1) {
        if (ids.length === 0) {
          toast('请先勾选至少一个项目');
          return;
        }
        ids.forEach(exportProjectDetail);
      } else if (t === 2) exportTeamExcel();
      else if (t === 3) exportReport();
      else exportSummaryReport();
    });
  });
}