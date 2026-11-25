import { Drawer, Typography } from 'antd';
import styles from './EngineeringChange.module.css';

const steps = [
  { role: '申请人', title: '提交工程变更', text: '填写申请事项和内容，按需添加工程申请物料、附件和抄送人。选择会签部门并调整顺序，检查右侧流程图后提交 PMC 评估。' },
  { role: 'PMC', title: '评估库存和处置', text: '在「待我处理」打开单据，在申请内容下方直接填写评估，确认受影响物料后，系统会自动查询首个所选物料的金蝶库存，切换物料可查询其他库存。按批次登记数量、来源、核对时间和处置计划；没有影响时可勾选并说明，再提交会签。' },
  { role: '部门主管', title: '按顺序会签', text: '轮到本部门时处理待办。通过后流转给下一部门。发现资料或评估有误时，退回申请人或 PMC 修改。' },
  { role: '仓库', title: '登记报废并复核', text: '无需报废的单据完成会签后结案。有报废时，仓库在详情底部点击「登记报废」，逐批填写本次实际数量。实际有报废时，上传带报废标识的现场照片及金蝶报废记录截图或 PDF。数量有差异时填写原因并退回 PMC 重评。已进入旧报废流程的单据按原节点办理。' },
];

export function ChangeUsageGuide({ onClose }: { onClose: () => void }) {
  return <Drawer open title="工程变更使用指南" onClose={onClose} size="default">
    <ol className={styles.guideSteps}>
      {steps.map(step => <li key={step.role}>
        <Typography.Text type="secondary">{step.role}</Typography.Text>
        <Typography.Title level={5}>{step.title}</Typography.Title>
        <Typography.Paragraph>{step.text}</Typography.Paragraph>
      </li>)}
    </ol>
    <Typography.Paragraph>管理员和申请人可以从当前节点催办。在流程图下方展开「企微投递记录」，可查看提醒是否送达。</Typography.Paragraph>
  </Drawer>;
}
