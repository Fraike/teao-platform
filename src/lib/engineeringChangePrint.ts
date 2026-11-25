import type { ChangeDetail, ChangeRound } from '../types/engineeringChange.ts';
import { allocationLabel, changeStatus, changeTime } from './engineeringChange';
import { allocationSource, applicationContent, roundAffectedMaterials } from '../../server/shared/engineering-change-content.ts';

function escape(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

function rows(title: string, values: string[]) {
  return `<section><h2>${escape(title)}</h2>${values.map(value => `<p>${escape(value)}</p>`).join('')}</section>`;
}

function roundText(round: ChangeRound, name: (id: string) => string, currentContent: string) {
  const progress = `已通过 ${round.reviewers.filter(row => row.decision === 'approved').length}/${round.reviewers.length}`;
  const materials = roundAffectedMaterials(round);
  return rows(`第 ${round.number} 轮 PMC 评估与会签 · ${progress}`, [
    ...(applicationContent(round.draft) !== currentContent ? [applicationContent(round.draft)] : []),
    ...(round.draft.attachments?.length ? [`附件：${round.draft.attachments.map(file => file.name).join('、')}`] : []),
    [changeTime(round.at), round.noImpact && '无受影响库存及在制品', round.note].filter(Boolean).join(' · '),
    ...(materials.length ? [`受影响物料：${materials.map(item => `${item.code} ${item.name}`).join('、')}`] : []),
    ...round.lines.map(line => [allocationLabel(line, materials),
      `仓库实存 ${line.stock}${line.semi === undefined ? '' : ` / 入库半成品 ${line.semi}`} / 在制 ${line.wip} / 拟报废 ${line.scrap}`,
      allocationSource(line), line.checkedAt && `核对时间 ${changeTime(line.checkedAt)}`, line.disposition].filter(Boolean).join(' · ')),
    ...round.reviewers.map(row => [row.name, name(row.userId),
      row.decision === 'approved' ? '已通过' : row.decision === 'returned' ? '已退回' : '未审批',
      row.at && changeTime(row.at), row.note].filter(Boolean).join(' · ')),
  ]);
}

export function buildChangePrintHtml(detail: ChangeDetail, styleUrl: string) {
  const { change, people } = detail;
  const { draft } = change;
  const name = (id: string) => people[id] ?? id;
  const submittedAt = change.submittedAt ?? change.history.find(row => row.action === 'submit')?.at;
  const confirm = change.history.findLast(row => row.action === 'confirm');
  const content = applicationContent(draft);
  const heading = `${change.number} · ${draft.title}`;
  const materialSnapshots = new Map(change.rounds.map(round => [round.number, roundAffectedMaterials(round)]));
  const records = change.records.flatMap(record => [
    [`第 ${record.round} 轮`, name(record.userId), changeTime(record.at), record.superseded && '已补正',
      record.warehouseResult === 'closed' && '仓库复核通过', record.warehouseResult === 'difference' && '有差异 · 已退回 PMC',
      record.evidence && `凭证 ${record.evidence}`].filter(Boolean).join(' · '),
    ...record.lines.map(row => `${allocationLabel(row.allocation, materialSnapshots.get(record.round) ?? draft.materials)} · 累计批准 ${row.allocation.scrap} · 本次实际 ${row.quantity}`),
    ...(record.differenceReason ? [`差异原因：${record.differenceReason}`] : []),
    ...(record.verificationPhoto ? [`报废现场照片：${record.verificationPhoto.name}`] : []),
    ...(record.kingdeeScrapEvidence ? [`金蝶报废记录：${record.kingdeeScrapEvidence.name}`] : []),
  ]);
  if (change.kingdeeScrapEvidence) records.push(`金蝶报废记录：${change.kingdeeScrapEvidence.name}`);
  if (change.kingdeeScrapBillNo) records.push(`金蝶单号：${change.kingdeeScrapBillNo}`);
  if (change.scrapVerificationPhoto) records.push(`仓库复核照片：${change.scrapVerificationPhoto.name}`);
  if (confirm) records.push([`仓库复核通过 · ${confirm.name}`, changeTime(confirm.at), confirm.note].filter(Boolean).join(' · '));
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escape(heading)}</title><link rel="stylesheet" href="${escape(styleUrl)}" id="print-style"></head>
    <body><header><button id="print" disabled>打印 / 保存 PDF</button></header><main><h1>${escape(heading)}</h1>
    <p>${escape([changeStatus[change.status], name(change.creator), submittedAt && changeTime(submittedAt)].filter(Boolean).join(' · '))}</p>
    ${rows('申请内容', [content])}
    ${draft.materials.length ? rows('工程申请物料', draft.materials.map(row => `${row.code} · ${row.name} · ${row.unit}`)) : ''}
    ${draft.attachments?.length ? rows('附件清单', draft.attachments.map(row => row.name)) : ''}
    ${change.rounds.map(round => roundText(round, name, content)).join('')}
    ${records.length ? rows('报废登记与复核', records) : ''}</main></body></html>`;
}

export async function openChangePrint(load: () => Promise<ChangeDetail>, styleUrl: string) {
  const preview = window.open('', '_blank', 'width=960,height=820');
  if (!preview) throw new Error('浏览器拦截了打印预览，请允许弹出窗口后重试');
  preview.opener = null;
  let detail: ChangeDetail;
  try { detail = await load(); }
  catch (error) { preview.close(); throw error; }
  if (preview.closed) return;
  preview.document.open();
  preview.document.write(buildChangePrintHtml(detail, styleUrl));
  preview.document.close();
  const button = preview.document.getElementById('print') as HTMLButtonElement;
  const style = preview.document.getElementById('print-style') as HTMLLinkElement;
  const ready = () => { button.disabled = false; };
  button.onclick = () => preview.print();
  style.addEventListener('load', ready, { once: true });
  style.addEventListener('error', () => { button.textContent = '打印样式加载失败'; }, { once: true });
  if (style.sheet) ready();
}
