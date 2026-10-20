// 仅用于日报展示；未知名称保持原样，不按公司后缀推测简称。
const CUSTOMER_ALIASES = new Map([
  ['江门市新会区司前石桥永联餐具厂', '永联餐具'],
  ['常州比亚迪有限公司', '常州比亚迪'],
  ['西安比亚迪公司', '西安比亚迪'],
  ['西安新泉汽车饰件有限公司', '西安新泉'],
  ['晟比顿精密科技（重庆）有限公司', '重庆晟比顿'],
  ['新泉（上海）汽车零部件有限公司', '上海新泉'],
  ['广东泰港汽车部件有限公司', '广东泰港'],
  ['阿雷蒙汽车紧固件镇江有限公司', '镇江阿雷蒙'],
  ['武汉中生汽车饰件有限公司', '武汉中生'],
  ['厦门微特瑞电子科技有限公司', '厦门微特瑞'],
  ['富诚汽车零部件清远有限公司', '清远富诚'],
  ['宁波市红日塑业有限公司', '宁波红日'],
]);

export function productionCustomerName(value) {
  const name = String(value ?? '').trim();
  for (const [fullName, shortName] of CUSTOMER_ALIASES) {
    if (name === fullName || name.startsWith(fullName + '-')) {
      return shortName + name.slice(fullName.length);
    }
  }
  return name;
}
