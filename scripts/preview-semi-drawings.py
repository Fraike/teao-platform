#!/usr/bin/env python3
"""Read-only local SQLite/PDF matching preview. Writes private preview artifacts only."""
import collections
import hashlib
import json
from pathlib import Path
import sqlite3
import fitz

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path('/Users/mikewang/Downloads/图纸(已优化)')
CATEGORIES = {'2314559979366968320': '塑胶配件', '2314560542703938560': '绳子', '2314560711633708032': '弹簧.五金'}
OUT = ROOT / 'data/import-operations/semi-parts-preview-20261030.json'

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

# Explicitly reviewed drawing evidence; dates are not used for choosing versions.
REVIEWS = {
 'RD-03-锁舌-2023.11.23.pdf': ('锁舌', ['B0004'], 'POM；8穴；注：与RD-08共用；A0 2022.6.27 新模，A1空行', ['POM牌号9044未在图内明确'], 'A0'),
 'RD-03-锁芯-2023.11.23.pdf': ('锁芯', ['B0005'], 'POM；8穴；注：与RD-08共用；12.97±0.04/6.25±0.04；A0 2022.6.27 新模，A1空行', ['POM牌号9044未在图内明确'], 'A0'),
 'RD-03-弹簧-2023.11.23.pdf': ('弹簧', ['W0004'], '不锈钢；线径0.25，长15.2±0.2，外径1.80±0.05，总圈20，支撑圈2；注：与RD-08共用；A0 2022.6.27 新模，A1空行', ['不锈钢具体牌号未明确'], 'A0'),
 'RD-03-钢针-2023.11.23.pdf': ('钢针', ['W0005'], '不锈钢；直径0.55；6.00±0.05/6.10+0.15；开口折弯结构；注：与RD-08共用；A0 2022.6.27 新模，A1空行', ['不锈钢具体牌号未明确'], 'A0'),
 'RD-T001-无字轴芯-2024.5.31.pdf': ('无字轴芯', ['B0036'], 'POM；4穴；RD-T001/T002/T003共用；A0新模，A1 2024.5.31改版；直径8.05±0.06', ['B0036为T003新模16穴，本图4穴，不可直接匹配', '无字特征与现有名称未对应'], 'A1'),
 'RD-T002-有字轴芯-2024.5.31.pdf': ('有字轴芯', ['B0036'], 'POM；6穴；RD-T001/T002/T003共用；A0新模，A1 2024.5.31改版；直径7.95±0.06', ['B0036为T003新模16穴，本图6穴，不可直接匹配', '有字和无字轴芯不合并'], 'A1'),
 'RD-T001-上盖(共用）-2024.7.24.pdf': ('上盖', ['B0034'], 'PC；8穴；RD-T001/T002/T003共用；A0新模，A1改版，A2 2024.7.24将9.15改为9.05', ['B0034为T003新模16穴，本图8穴，不可直接匹配', 'PC牌号L1250Y未明确'], 'A2'),
 'RD-T001-下座-A1版.pdf': ('下座', ['B0030'], '渲染确认：PC；8穴；A0 2015.12.27新模，A1 2020.08.26改版；长16.60±0.1/直径10.0±0.08', ['文本层仅尺寸，标题栏依据人工渲染读取', 'PC牌号L1250Y未明确'], 'A1'),
 'RD-T001-齿轮-A1版.pdf': ('齿轮', ['B0029'], '渲染确认：POM；8穴；11齿；模数0.6，压力角20°；A0 2015.12.27新模，A1 2020.08.26改版', ['B0029型号1*6与图内8穴冲突，需核对模具版本', '无可提取文本，依据人工渲染读取', 'POM牌号9044未明确'], 'A1'),
 'RD-T002-齿轮-2021.7.06.pdf': ('齿轮', ['B0031'], 'POM；8穴；直径8.70±0.08，厚3.70±0.06，孔2.60±0.06；A0 2021.07.06新模，A1空行', ['POM牌号9044未明确', '与T001齿轮厚度2.30不同，不合并'], 'A0'),
 'RD-T002-下座-2021.6.01.pdf': ('下座', ['B0032'], 'PC；8穴；长14.50±0.1，直径10.1±0.1；A0 2021.06.01新模，A1空行', ['PC牌号L1250Y未明确', '与T001下座长16.60不同，不合并'], 'A0'),
 'RD-T001-(2.65x0.65胶圈)-2023.6.24.pdf': ('胶圈', [], '', ['本批仅塑胶件，胶圈不在三个指定分类中', '图像PDF，无可提取文本，未识别，仅待核对'], None),
}

def main():
    db = ROOT / 'data/products.db'
    with sqlite3.connect(f'file:{db}?mode=ro', uri=True) as connection:
        state = dict(connection.execute("SELECT key,value FROM product_state WHERE key IN ('materials','sync')"))
    materials = [ {k: m.get(k, '') for k in ('id','number','name','model','parent_id','parent_name')} for m in json.loads(state['materials']) if m.get('parent_id') in CATEGORIES]
    by_number = {m['number']: m for m in materials}
    inventory, groups = [], collections.defaultdict(list)
    for path in sorted(SOURCE.rglob('*')):
        if path.suffix.lower() != '.pdf' or not any('子件' in p for p in path.parts):
            continue
        sha = digest(path)
        item = {'sourcePath': str(path), 'sha256': sha, 'size': path.stat().st_size}
        inventory.append(item)
        groups[sha].append(str(path))
    entries = []
    for item in inventory:
        path = Path(item['sourcePath'])
        if path.name not in REVIEWS:
            continue
        part, numbers, evidence, unknown, version = REVIEWS[path.name]
        with fitz.open(path) as document:
            texts = [page.get_text() for page in document]
        has_text = bool(''.join(texts).strip())
        entries.append({**item, 'sourcePaths': groups[item['sha256']], 'part': part, 'candidateMaterials': [by_number[n] for n in numbers], 'drawingEvidence': evidence, 'pageText': texts, 'textExtraction': 'available' if has_text else 'image-or-vector-only', 'reviewedVersion': version, 'structure': 'unspecified', 'structureNote': '子件结构由图内几何及零件名称记录；不从成品目录推断有齿/无齿属性', 'unconfirmed': unknown + ['预览未授权导入，候选需人工确认'], 'decision': 'pending-review', 'confidence': 'conflict' if any('冲突' in x or '不可直接匹配' in x for x in unknown) else ('unidentified' if not numbers else 'candidate')})
    result = {'mode': 'read-only-preview', 'date': '2026-10-30', 'snapshot': {'database': str(db), 'scope': '本地快照，非线上实时数据', 'sync': json.loads(state.get('sync','{}')), 'materialsValueSha256': hashlib.sha256(state['materials'].encode()).hexdigest(), 'categoryCounts': {name: sum(m['parent_id']==key for m in materials) for key,name in CATEGORIES.items()}}, 'versionPolicy': '不按文件名日期或mtime选择版本；依据图内已填版次。A1空行不视为有效A1', 'inventory': {'pathCount': len(inventory), 'uniqueHashCount': len(groups), 'duplicatePathCount': len(inventory)-len(groups), 'files': inventory, 'duplicateGroups': [{'sha256': sha,'sourcePaths': paths} for sha,paths in groups.items() if len(paths)>1]}, 'firstBatch': entries, 'limitations': ['未读取线上数据；不改数据库、不导入、不发布', '共享说明不代表跨模具可互换；不同模穴、材料牌号或有字无字差异需核对', '全目录仅统计子件PDF路径和hash；其他产品未进行逐图匹配', '未识别图像PDF仅待核对；渲染人工可确认者明确记录依据']}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    if OUT.exists():
        raise SystemExit(f'Refusing to overwrite {OUT}')
    OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'output': str(OUT),'paths':len(inventory),'uniqueHashes':len(groups),'firstBatch':len(entries),'categoryCounts':result['snapshot']['categoryCounts']},ensure_ascii=False))

if __name__ == '__main__':
    main()
