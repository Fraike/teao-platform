import assert from 'node:assert/strict';import{mkdtempSync}from'node:fs';import os from'node:os';import path from'node:path';
process.env.DATA_DIR=mkdtempSync(path.join(os.tmpdir(),'designated-review-'));const s=await import('../server/services/standard-store.js');s.initDB();
const admin={id:'admin',name:'管理员',role:'admin'},editor={id:'editor',name:'工程'},selected={id:'selected',name:'同事'},other={id:'other',name:'其他同事'};
const input={serialNo:'SP-FLOW',customer:'客户',model:'RD-TEST',categoryKey:'gear_damper',fields:{gear_spec:'T001-11齿\nT001-12齿'}};const exp=d=>({versionId:d.versions[0].id,revision:d.versions[0].revision});
try{
 let d=s.createStandard(input,admin);assert.equal(d.versions[0].status,'published');const prior=d.versions[0].id;
 let listItem=s.listStandardPage().data.find(item=>item.id===d.id);assert.equal(listItem.hasPreviousPublication,false);assert.equal(listItem.publishedAt,d.versions[0].publishedAt);assert(listItem.reviewedAt);
 d=s.updateStandard(d.id,{...input,...exp(d),fields:{gear_spec:'T002-11齿'}},admin);assert.equal(d.versions[0].status,'published');assert.equal(d.versions.find(v=>v.id===prior).status,'archived');
 listItem=s.listStandardPage().data.find(item=>item.id===d.id);assert.equal(listItem.hasPreviousPublication,true);
 let candidate=s.createStandard({...input,serialNo:'SP-NONADMIN'},editor);assert.equal(candidate.versions[0].status,'draft');
 candidate=s.submitStandard(candidate.id,editor,{...exp(candidate),reviewerId:selected.id,reviewerName:selected.name});
 assert.equal(s.listStandardPage({onlyPublished:true,reviewerId:selected.id}).data.some(r=>r.id===candidate.id),true);
 assert.equal(s.listStandardPage({onlyPublished:true,reviewerId:other.id}).data.some(r=>r.id===candidate.id),false);
 assert.equal(s.getStandard(candidate.id,{onlyPublished:true,reviewerId:other.id}),null);
 assert.equal(s.getStandardHistory(candidate.id,{onlyPublished:true,reviewerId:selected.id,section:'versions'}).total,1);
 assert.equal(s.getStandardHistory(candidate.id,{onlyPublished:true,reviewerId:other.id,section:'versions'}),null);
 assert.equal(s.listPendingStandardNotifications(selected).total,1);assert.equal(s.listPendingStandardNotifications(other).total,0);
 assert.throws(()=>s.reviewStandard(candidate.id,{...exp(candidate),approve:true},other),e=>e.status===403);
 candidate=s.reviewStandard(candidate.id,{...exp(candidate),approve:true},selected);assert.equal(candidate.versions[0].status,'published');
 let override=s.createStandard({...input,serialNo:'SP-ADMIN-OVERRIDE'},editor);
 override=s.submitStandard(override.id,editor,{...exp(override),reviewerId:selected.id,reviewerName:selected.name});
 override=s.updateStandard(override.id,{...input,...exp(override),serialNo:'SP-ADMIN-OVERRIDE',fields:{gear_spec:'T003-12齿'}},admin);
 assert.equal(override.versions[0].status,'published');
 assert.equal(override.versions[0].assignedReviewerId,selected.id);
 assert.equal(s.listPendingStandardNotifications(selected).total,0);
 console.log('admin direct publication, single designated review and isolated visibility passed');
}finally{s.closeDB();}
