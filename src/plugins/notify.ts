// 自动通知插件：阶段变更时自动生成通知文档（上线/变更/会议/培训）
import { addTemplate, getTemplates } from '../store';
import type { Project } from '../data/types';
import { resolveFields } from '../views/template-doc';
import { toast } from '../ui';

export type NotifyType = '上线' | '变更' | '会议' | '培训';

const SUBJECT: Record<NotifyType, string> = {
  上线: '上线通知',
  变更: '变更通知',
  会议: '会议纪要',
  培训: '培训通知',
};

export function genNotifyDoc(project: Project, type: NotifyType): string {
  const tpl = notificationHTML(type, project.id);
  const filled = fillConcrete(tpl, project);
  const id = `ntf-${Date.now()}`;
  addTemplate({
    id,
    name: `${project.name}-${SUBJECT[type]}`,
    category: '通知',
    fields: [],
    contentHTML: filled,
    desc: `${SUBJECT[type]}（${new Date().toISOString().slice(0, 10)} 自动生成）`,
    updatedAt: new Date().toISOString(),
    builtin: false,
  });
  toast(`已生成「${SUBJECT[type]}」通知文档`, 'success');
  return id;
}

function fillConcrete(html: string, p: Project): string {
  // 用项目字段值把 {字段名} 占位替换为实际内容（含 {签名} 图片）
  const { resolveAll } = concreteResolver(p);
  return html.replace(/\{([^}]+)\}/g, (_, name) => resolveAll(name));
}

function concreteResolver(p: Project): { resolveAll: (n: string) => string } {
  const vals = resolveFields(p);
  return {
    resolveAll: (n: string) => vals[n] ?? `【${n}】`,
  };
}

function notificationHTML(type: NotifyType, _pid: string): string {
  const isUp = type === '上线';
  const isChg = type === '变更';
  const isMeet = type === '会议';
  const head = isUp
    ? `<h1>${'{项目名称}'} 系统上线通知</h1>
      <p>致 <b>{甲方名称}</b>：</p>
      <p>我方负责建设的“{项目名称}”（合同编号：{合同编号}）已按计划完成开发与部署准备，现定于 <b>{上线时间}</b> 正式上线运行。现将有关事项通知如下：</p>
      <ul><li>系统访问地址：{系统地址}</li><li>上线支持：技术支持 {技术支持}，销售 {销售}，项目经理 {项目经理}</li><li>期间如有问题请第一时间联系我方项目经理。</li></ul>`
    : isChg
      ? `<h1>{项目名称} 变更通知</h1>
      <p>致 <b>{甲方名称}</b>：</p>
      <p>因业务/实施需要，现对“{项目名称}”做如下变更：</p>
      <blockquote>{变更内容}</blockquote>
      <p>变更涉及合同金额调整的，以双方确认的补充协议为准（合同编号：{合同编号}）。请于收到本通知后 3 个工作日内书面确认。</p>`
      : isMeet
        ? `<h1>{项目名称} 项目会议纪要</h1>
        <p><b>会议主题：</b>{会议主题}<br><b>会议时间：</b>{会议时间}<br><b>会议地点/方式：</b>{会议方式}<br><b>参会人员：</b>甲方 {甲方联系人} 等，我方 {项目经理}、{技术支持}、{销售}</p>
        <p><b>决议事项：</b></p>
        <ul><li>{决议事项一}</li><li>{决议事项二}</li></ul>
        <p><b>待办跟进：</b></p>
        <ol><li>{待办项}</li></ol>`
        : `<h1>{项目名称} 培训通知</h1>
        <p>致 <b>{甲方名称}</b>：</p>
        <p>为保障{项目名称}顺利投入使用，我方将组织系统使用培训：</p>
        <ul><li>培训时间：{培训时间}</li><li>培训方式：{培训方式}</li><li>主讲人：{技术支持}</li></ul>
        <p>请各相关岗位人员准时参加。</p>`;
  return `
    ${head}
    <p style="text-align:right">${'{签名}'}</p>
    <p style="text-align:right">${'{当前日期}'}</p>`;
}

/** 阶段变更自动触发：阶段标记为进行中/完成时，按需生成通知 */
export function autoNotifyOnStage(project: Project): void {
  if (!project || !project.stages) return;
  // 找到最近发生变更（进入进行中/已完成）的阶段
  const active = project.stages.find(s => s.status === 'active');
  const lastDone = [...project.stages].reverse().find(s => s.status === 'done');

  // 上线：验收阶段完成
  if (lastDone?.key === 'accept') {
    warmNotify(project, '上线');
    genNotifyDoc(project, '上线');
    return;
  }
  // 培训：试运行阶段（preview/试运行）完成时
  if (lastDone && ['uat', 'prep'].includes(lastDone.key)) {
    genNotifyDoc(project, '培训');
    return;
  }
  // 会议：立项/需求调研阶段完成时
  if (active && ['initiate', 'demand'].includes(active.key)) {
    // 不自动反复生成，仅演示一次
    if (!getTemplates().some(t => t.name.startsWith(`${project.name}-会议纪要`))) {
      genNotifyDoc(project, '会议');
    }
  }
}

let warmTimeout = 0;
function warmNotify(p: Project, type: NotifyType): void {
  window.clearTimeout(warmTimeout);
  warmTimeout = window.setTimeout(
    () => toast(`项目「${p.name}」应产生${SUBJECT[type]}`, 'info'),
    600,
  );
}