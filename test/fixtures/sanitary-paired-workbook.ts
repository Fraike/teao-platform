import XLSX from 'xlsx';

// Entirely synthetic legacy layout: 70 paired products, not the newer independent-SP format.
export function legacyPairedWorkbook(): ArrayBuffer {
  const rows: string[][] = [
    ['合成旧卫浴配对兼容样本'],
    ['客户名','客户型号','产品型号','盖标准','实际扭矩(kg)','使用油号','盖下落时间','下座台阶','产品长度','印字','',
      '座垫标准','实际扭矩(kg)','使用油号','座垫下落时间','下座台阶','产品长度','印字','备注'],
  ];
  for (let i = 0; i < 70; i++) rows.push([
    `合成客户${i + 1}`, i === 0 ? '801D' : `款式${i + 1}`, 'RD-V088',
    'CCW25', '25-27', '盖油', '5-8秒', '3mm', '44mm', '盖印字', '',
    'CW20', '20-22', '座油', '6-9秒', '5mm', '41mm', '座印字', '合成公共备注',
  ]);
  rows[8][0] = '欧陆'; rows[8][1] = '968';
  rows[9][0] = ''; rows[9][1] = ''; rows[9][2] = '';
  rows[9][3] = 'CCW30'; rows[9][10] = '968-Seat';
  rows[45][8] = '44.5mm';
  rows[46][1] = '003\n008\n012';
  rows[56][3] = '暂无';
  rows[58][3] = ''; rows[58][11] = 'CW21';
  rows[71][11] = '共用Q9';
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!merges'] = [0,1,2].map(c => ({s:{r:8,c},e:{r:9,c}}));
  for (let row = 3; row <= 72; row++) {
    sheet[`B${row}`].c = [{a:'合成工程师',t:`2024.1.2 合成配对行${row}说明`}];
  }
  for (let row = 3; row <= 14; row++) {
    sheet[`E${row}`].c = [{a:'合成工程师',t:'2024.2.3 盖扭矩变更'}];
  }
  sheet.I46.c = [{a:'合成工程师',t:'2024.3.4 长度42.5mm改为44.5mm'}];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['齿形阻尼器'],['SP-SYNTHETIC','合成常规客户','RD-SYNTHETIC']]), '常规标准');
  XLSX.utils.book_append_sheet(workbook, sheet, '合成客户标准（智能卫浴）');
  return XLSX.write(workbook,{type:'array',bookType:'xlsx'}) as ArrayBuffer;
}
