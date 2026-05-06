export interface ProcessStep {
  title: string;
  description?: string;
}

export interface ProcessAttachment {
  name: string;
  url: string;
}

export interface ProcessVersion {
  version: string;
  date: string;
  description: string;
}

export interface Process {
  id: string;
  title: string;
  department: string;
  category: string;
  owner: string;
  version: string;
  updatedAt: string;
  status: "生效中" | "修订中" | "已作废";
  summary: string;
  purpose: string;
  scope: string;
  relatedDepartments: string[];
  forms: string[];
  steps: ProcessStep[];
  notes: string[];
  attachments: ProcessAttachment[];
  flowchart: string | null;
  history: ProcessVersion[];
}

const processes: Process[] = [
  {
    id: "engineering-change",
    title: "工程变更流程",
    department: "工程部",
    category: "变更管理",
    owner: "工程部",
    version: "V1.0",
    updatedAt: "2026-05-06",
    status: "生效中",
    summary: "用于规范产品图纸、BOM、材料、工艺、模具、包装、检验标准等变更，确保变更经过评审、确认、执行、验证和归档。",
    purpose: "确保工程变更经过评审、确认、执行、验证和归档，避免现场执行错误，保证产品质量稳定性和可追溯性。",
    scope: "适用于客户要求变更、内部设计优化、品质改善、降本改善、材料替代、模具修改、工艺调整等情况。",
    relatedDepartments: ["品质部", "注塑部", "装配部", "采购部", "仓库部", "业务部", "总经办"],
    forms: ["工程变更申请单 ECR", "工程变更通知单 ECN", "首件确认记录表"],
    steps: [
      {
        title: "变更需求提出",
        description: "工程部 / 品质部 / 生产部 / 客户 / 采购均可提出变更需求",
      },
      {
        title: "填写《工程变更申请单 ECR》",
        description: "说明变更原因、变更内容、影响产品、客户项目、风险评估",
      },
      {
        title: "工程部初步评估",
        description: "确认图纸、BOM、模具、工艺、材料、尺寸、性能是否受影响",
      },
      {
        title: "跨部门评审",
        description: "工程部 + 品质部 + 注塑部 + 装配部 + 采购部 + 业务部 + 仓库共同评审",
      },
      {
        title: "判断是否需要客户批准",
        description: "涉及客户图纸、材料、尺寸、性能、外观、包装的变更需客户确认",
      },
      {
        title: "客户确认（如需要）",
        description: "业务部提交客户确认 / 签样 / PPAP / 承认书",
      },
      {
        title: "总经理 / 管理代表批准",
        description: "重大变更需总经理或管理代表最终批准",
      },
      {
        title: "发布《工程变更通知书 ECN》",
        description: "明确生效日期、切换方式、旧料处理方式、新料导入计划、责任人",
      },
      {
        title: "各部门执行变更",
        description: [
          "工程：图纸 / BOM / 工艺文件更新",
          "品质：检验标准 / SIP / 控制计划更新",
          "注塑：模具 / 参数 / 材料 / 首件确认",
          "装配：作业指导书 / 工装 / 包装方式更新",
          "采购：供应商 / 材料 / 外购件确认",
          "仓库：旧料隔离 / 标识 / 先进先出 / 报废或让步处理",
        ].join("；"),
      },
      {
        title: "首件确认 / 小批量验证",
        description: "工程 + 品质 + 生产共同确认首件或小批量试产结果",
      },
      {
        title: "变更效果验证",
        description: "尺寸、功能、扭矩、寿命、装配、客户要求等全面确认",
      },
      {
        title: "正式量产导入",
        description: "确认合格后正式切换至量产状态",
      },
      {
        title: "文件归档",
        description: "ECR、ECN、图纸、BOM、检验记录、客户确认资料、首件报告归档保存",
      },
    ],
    notes: [
      "涉及客户图纸、材料、尺寸、性能、外观、包装的变更，必须先取得客户书面确认。",
      "变更通知（ECN）必须明确旧料处理方式和生效日期，避免现场混料。",
      "变更后必须完成首件确认，确认合格后方可量产。",
      "所有变更记录和审批文件需归档保存，确保可追溯性。",
      "如需发起申请或审批，请在企业微信对应审批流程中操作。",
    ],
    attachments: [
      {
        name: "工程变更申请单 ECR.xlsx",
        url: "/process-files/engineering/ecr.xlsx",
      },
      {
        name: "工程变更通知单 ECN.xlsx",
        url: "/process-files/engineering/ecn.xlsx",
      },
      {
        name: "首件确认记录表.xlsx",
        url: "/process-files/engineering/first-piece.xlsx",
      },
    ],
    flowchart: "/process-files/engineering/engineering-change-flow.png",
    history: [
      {
        version: "V1.0",
        date: "2026-05-06",
        description: "首次建立工程变更流程",
      },
    ],
  },
  {
    id: "customer-return",
    title: "客户退货处理流程",
    department: "品质部",
    category: "售后质量管理",
    owner: "品质部",
    version: "V1.0",
    updatedAt: "2026-05-06",
    status: "生效中",
    summary: "用于快速处理客户退货、客诉退回、质量异常退回产品，确保退货有接收、有隔离、有原因、有处理结果。",
    purpose: "快速确认客户退货原因和处理方式，减少内部沟通成本，避免退货产品混入正常库存。",
    scope: "适用于客户因质量异常、规格不符、包装异常、交付错误等原因退回公司的产品。",
    relatedDepartments: ["业务部", "品质部", "仓库部", "工程部", "生管部", "生产部门"],
    forms: [],
    steps: [
      {
        title: "业务部接到客户退货信息",
        description: "确认客户、产品型号、数量、退货原因和客户要求",
      },
      {
        title: "业务部通知品质部和仓库部",
        description: "必要时同步工程部、生管部和生产部门",
      },
      {
        title: "仓库部接收退货产品",
        description: "核对型号、数量、批次，并放入退货/不良品区域，做好标识",
      },
      {
        title: "品质部确认退货原因",
        description: "判断是否属于质量问题、交付错误、客户误退或其他原因",
      },
      {
        title: "判断处理方式",
        description: "品质部组织相关部门快速确认：返工、挑选、补货、换货、报废或退回客户",
      },
      {
        title: "返工/挑选（如需要）",
        description: "由生产部门执行，品质部复检确认合格后方可入库或出货",
      },
      {
        title: "补货/换货（如需要）",
        description: "由生管部确认交期，业务部回复客户",
      },
      {
        title: "费用/扣款/赔偿确认（如需要）",
        description: "由业务部反馈总经办确认",
      },
      {
        title: "品质部记录原因和处理结果",
        description: "必要时提出改善措施",
      },
      {
        title: "业务部向客户反馈最终处理结果",
      },
      {
        title: "相关记录由品质部归档",
      },
    ],
    notes: [
      "退货产品必须先隔离标识，不能直接放入合格品区。",
      "小批量、简单问题可快速处理，不需要复杂报告。",
      "重复发生、批量异常或客户重点投诉时，品质部需组织原因分析和改善。",
      "涉及赔偿、扣款、重大客诉时，必须反馈总经办。",
      "如退货原因涉及图纸、材料、工艺或模具问题，应同步评估是否需要走工程变更流程。",
      "本页面仅用于流程查阅，具体申请或审批仍按企业微信执行。",
    ],
    attachments: [],
    flowchart: null,
    history: [
      {
        version: "V1.0",
        date: "2026-05-06",
        description: "首次建立简化版客户退货处理流程",
      },
    ],
  },
  {
    id: "urgent-order",
    title: "插单/急单处理流程",
    department: "生管部",
    category: "生产计划管理",
    owner: "生管部",
    version: "V1.0",
    updatedAt: "2026-05-06",
    status: "生效中",
    summary: "用于快速评估和处理客户急单、临时插单、交期提前等情况，减少内部扯皮和计划混乱。",
    purpose: "在保证质量和主要客户交期的前提下，快速判断急单是否能做、什么时候能交、会影响什么订单。",
    scope: "适用于客户临时下单、订单数量增加、交期提前、补货急单、样品急件、客诉补货等情况。",
    relatedDepartments: ["业务部", "生管部", "仓库部", "采购部", "品质部", "工程部", "生产部门", "总经办"],
    forms: [],
    steps: [
      {
        title: "业务部接到客户急单/插单需求",
        description: "确认客户、产品型号、数量、要求交期和紧急原因",
      },
      {
        title: "业务部将需求同步给生管部",
        description: "由生管部牵头快速评估",
      },
      {
        title: "生管部确认当前生产计划",
        description: "确认产能、设备和人员安排",
      },
      {
        title: "仓库部确认物料库存",
        description: "确认原材料、半成品、包材和成品库存是否满足",
      },
      {
        title: "采购部确认欠缺物料到料时间",
      },
      {
        title: "工程部确认技术条件",
        description: "确认图纸、BOM、工艺、模具和工装是否具备生产条件",
      },
      {
        title: "品质部确认检验要求",
        description: "确认检验标准和首件/出货检验要求",
      },
      {
        title: "生产部门确认排产可行性",
        description: "确认是否可以安排生产及预计完成时间",
      },
      {
        title: "生管部汇总判断是否可以插单",
        description: "明确预计交期和对原计划订单的影响",
      },
      {
        title: "判断是否影响其他客户订单",
        description: "如影响，由业务部评估客户风险并沟通调整",
      },
      {
        title: "重大急单由总经办确认优先级（如需要）",
      },
      {
        title: "生管部调整生产计划",
        description: "通知相关部门执行",
      },
      {
        title: "生产过程异常反馈",
        description: "欠料、品质异常、设备异常时，责任部门需第一时间反馈生管部和业务部",
      },
      {
        title: "品质部按正常要求完成检验",
        description: "急单不得降低质量标准",
      },
      {
        title: "仓库部按交期安排入库、备货和出货",
      },
      {
        title: "业务部反馈客户交付结果",
        description: "生管部记录急单完成情况",
      },
    ],
    notes: [
      "急单和插单不能只靠口头安排，至少要有记录，方便后续追踪。",
      "插单前必须先确认物料、产能、模具、工艺和品质要求。",
      "急单不能因为赶货降低品质标准。",
      "如果会影响其他客户交期，业务部必须提前确认风险。",
      "频繁急单要定期复盘原因，避免长期靠临时协调解决问题。",
      "本页面仅用于流程查阅，具体申请或审批仍按企业微信执行。",
    ],
    attachments: [],
    flowchart: null,
    history: [
      {
        version: "V1.0",
        date: "2026-05-06",
        description: "首次建立简化版插单急单处理流程",
      },
    ],
  },
];

export default processes;
