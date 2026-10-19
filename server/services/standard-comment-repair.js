// Pure planning only: no database initialization or notification side effects.
import {leadingCommentDate,firstCommentDate} from "../../src/lib/standardCommentDate.ts";
const compact = value => String(value ?? '').replace(/\s/g, '');
const groupKey = row => JSON.stringify([row.standard_id,row.version_id,row.field_key,row.author]);

export function parseCommentHistory(text, author='') {
  const blocks=[];let date='',lines=[];
  const flush=()=>{
    if (lines.length || date) blocks.push({changedAt:date,description:lines.length?lines.join('\n'):'（原批注仅记录日期）'});
    lines=[];date='';
  };
  for (const raw of String(text??'').split('\0')[0].split(/\r?\n/)) {
    let line=raw.trim();
    if (!line || /^[A-Za-z][A-Za-z0-9_. @-]{0,39}[:：]$/.test(line) || line===`${author}：`) continue;
    const match=leadingCommentDate(line);
    if (match) {flush();date=match.date;line=line.slice(match.length).replace(/^[\s:：,，]+/,'');}
    if (line) lines.push(line);
  }
  flush();return blocks;
}

export function planCommentRepair(comments, changes, {legacyCreatedPrefix}={}) {
  if (!legacyCreatedPrefix) throw new Error('必须明确来源导入批次');
  const groups=new Map();
  for (const comment of comments) {
    const key=groupKey(comment);const group=groups.get(key)??[];group.push(comment);groups.set(key,group);
  }
  const removeIds=[],insert=[],issues=[],before=[],link=[],dateEdits=[];
  const legacy=changes.filter(row=>row.created_at.startsWith(legacyCreatedPrefix));
  for (const row of legacy) if (!groups.has(groupKey(row))) issues.push({id:row.id,reason:'旧导入记录无法唯一对应来源字段或作者'});
  for (const [key,group] of groups) {
    const old=legacy.filter(row=>groupKey(row)===key && !row.source_cell);
    if (old.length && group.length!==1) throw new Error('旧导入字段对应多个批注，禁止猜测归属');
    for (const comment of group) {
      const desired=parseCommentHistory(comment.text,comment.author);
      const actual=changes.filter(row=>groupKey(row)===key && row.source_cell===comment.source_cell);
      // Modern imports may retain a whole original comment in a single history row.
      const whole=actual.find(row=>compact(row.description)===compact(comment.text));
      if(whole && whole.changed_at!==firstCommentDate(comment.text))dateEdits.push({id:whole.id,changed_at:firstCommentDate(comment.text)});
      const used=new Set();
      for (const block of whole?[]:desired) {
        const same=row=>row.changed_at===block.changedAt && compact(row.description)===compact(block.description);
        if (actual.some(same)) continue;
        const existing=old.find(row=>!used.has(row.id)&&same(row));
        if (existing) {used.add(existing.id);link.push({id:existing.id,source_cell:comment.source_cell});before.push(existing);continue;}
        insert.push({standard_id:comment.standard_id,version_id:comment.version_id,source_cell:comment.source_cell,field_key:comment.field_key,field_label:comment.field_label,author:comment.author,changed_at:block.changedAt,description:block.description});
      }
      const replaced=old.filter(row=>!used.has(row.id));
      removeIds.push(...replaced.map(row=>row.id));before.push(...replaced);
    }
  }
  return {removeIds,insert,issues,before,link,dateEdits};
}
