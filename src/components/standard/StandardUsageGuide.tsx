import { Button, Popover, Steps, Tabs } from "antd";
import { QuestionCircleOutlined } from "@ant-design/icons";
import styles from "./StandardUsageGuide.module.css";

export function StandardUsageGuide() {
  return (
    <Popover
      trigger={["hover", "click"]}
      placement="bottomLeft"
      content={
        <div className={styles.content}>
          <h3 className={styles.title}>产品标准使用指南</h3>
          <Tabs size="small" items={[
            { key: "review", label: "审核流程", children: <>
              <Steps direction="vertical" size="small" items={[
                { title: "填写标准，保存草稿", description: "具备提交权限的人员可新增、复制或修改标准。" },
                { title: "选择一位审核人并提交", description: "可选择其他已激活用户，不能选择自己；待审核内容尚未生效。" },
                { title: "指定审核人核对", description: "点击列表中的“审核”，核对完整参数和变更后，通过或填写原因驳回。" },
                { title: "通过后发布，新版本生效", description: "保留历史版本，并向企业微信群发送完整标准通知、@所有人。" },
              ]} />
              <p className={styles.returnNote}>驳回后：查看驳回原因 → 修改草稿 → 重新提交审核。</p>
              <p className={styles.returnNote}>提交后需要修改：本人点击“撤回审核” → 修改草稿 → 重新选择审核人提交。</p>
              <p className={styles.returnNote}>提交时提醒指定审核人；仍待审核的标准在工作日08:00、13:00各提醒一次，也可手动催审。通知中可查看分类、产品信息并打开对应标准。</p>
              <p className={styles.note}>管理员可直接“保存并发布”，无需审核。</p>
              <p className={styles.note}>需停用产品时：管理员或有“直接停用”权限的人员可直接停用；有提交权限的其他人员点击停用图标申请，选择审核人，批准前标准继续生效。</p>
            </> },
            { key: "publication", label: "发布与查看", children: <div className={styles.reading}>
              <section><h4>在哪里查看</h4><p>按产品分类查找，可通过列头筛选客户、型号等。点击“查看详情”查看完整参数，点击“变更历史”查看历史版本、变更记录及原始批注。</p></section>
              <section><h4>如何避免漏审</h4><p>页面顶部“我的待审”汇总各分类的任务，管理员查看“全部待审”。点击产品直接进入详情；点击分类数量或“查看全部”打开完整清单。标准审核和停用申请分别标注，表格筛选不影响待审统计。</p></section>
              <section><h4>群通知包含什么</h4><p>标准基本信息、完整规格参数、版本及审核信息，并 @所有人。内容较多时可能分条发送。</p></section>
              <section><h4>生产执行哪个版本</h4><p>以系统中当前已发布版本为准。草稿、待审核内容尚未生效，已停用标准仅供追溯。</p></section>
              <section><h4>不需要的草稿怎么处理</h4><p>本人创建或提交的草稿可清理，管理员可清理全部草稿。有生效版本时点击“放弃修改”，恢复已发布标准并清除草稿标记；首次新增的内容点击“删除草稿”，从列表移除并保留归档。撤回与清理均不发送群通知。</p></section>
              <section><h4>如何导出和打印</h4><p>点击“导出 / 打印”，选择当前筛选结果或全部分类。可导出全部产品，也可勾选指定产品；Excel 保留全部规格属性及原始批注；打印只保留产品信息和生产规格，隐藏审核流程信息，可打印或保存为 PDF。</p></section>
              <p className={styles.note}>群通知发送异常时，先核查群记录及发布结果，避免重复发布。</p>
            </div> },
          ]} />
        </div>
      }
    >
      <Button type="text" size="small" className={styles.trigger} icon={<QuestionCircleOutlined />}>使用指南</Button>
    </Popover>
  );
}
