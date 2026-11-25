import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { buildChangePrintHtml } from '../src/lib/engineeringChangePrint.ts';
import type { ChangeDetail, ChangeDraft } from '../src/types/engineeringChange.ts';

test('print preview renders legacy text, attachments, department decisions and warehouse verification safely', () => {
  const at = '2026-11-23T03:00:00.000Z';
  const draft: ChangeDraft = {
    title: '<script>文档标题</script>', materials: [], reason: '旧单原因', before: '1.2', after: '1.0',
    effective: '旧库存用完后', attachments: [{ id: 'test', name: '库存 & 标准.png', mime: 'image/png', size: 1 }],
  };
  const detail: ChangeDetail = {
    actions: [], deliveries: [], tasks: [], reassignments: [], reminderTargets: [], people: { eng: '工程同事', qa: '品质主管', pmc: 'PMC 同事' },
    change: { id: 'test', number: 'EC-000001', title: draft.title, updatedAt: at, creator: 'eng', version: 7, status: 'closed', draft,
      history: [{ action: 'submit', actor: 'eng', name: '工程同事', note: '', at },
        { action: 'confirm', actor: 'wh', name: '仓库同事', note: '凭证已核对', at }],
      rounds: [{ number: 1, note: 'PMC 已核对', at, lines: [], draft,
        reviewers: [{ name: '品质', userId: 'qa', decision: 'approved', at, note: '同意切换' }] }],
      records: [{ round: 1, userId: 'pmc', at, evidence: '凭证 001', lines: [] }],
    },
  };
  const dom = new JSDOM(buildChangePrintHtml(detail, '/styles.css'));
  const text = dom.window.document.body.textContent ?? '';
  assert.match(text, /原因：旧单原因[\s\S]*变更前：1\.2[\s\S]*变更后：1\.0/);
  assert.match(text, /附件清单[\s\S]*库存 & 标准\.png/);
  assert.match(text, /已通过 1\/1[\s\S]*品质主管[\s\S]*同意切换/);
  assert.match(text, /凭证 001[\s\S]*仓库复核通过 · 仓库同事[\s\S]*凭证已核对/);
  assert.match(text, /<script>文档标题<\/script>/);
  assert.equal(dom.window.document.querySelector('script'), null);
  dom.window.close();

  detail.change.records.push({
    round: 2, userId: 'wh', at, warehouseResult: 'difference', differenceReason: '少 1 件',
    lines: [{ allocation: { materialId: 'm', warehouse: '一仓', batch: 'B', stock: '3', semi: '0', wip: '0',
      scrap: '3', source: '人工', disposition: '隔离待处理' }, quantity: '2' }],
    verificationPhoto: { id: 'photo', name: '现场.png', mime: 'image/png', size: 1 },
    kingdeeScrapEvidence: { id: 'kingdee', name: '金蝶单.pdf', mime: 'application/pdf', size: 1 },
  });
  const combinedPrint = buildChangePrintHtml(detail, '/styles.css');
  assert.match(combinedPrint, /第 2 轮.*有差异.*累计批准 3.*本次实际 2.*差异原因：少 1 件.*现场\.png.*金蝶单\.pdf/s);
});
