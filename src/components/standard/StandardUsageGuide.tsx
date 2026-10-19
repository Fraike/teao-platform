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
              <p className={styles.note}>管理员可直接“保存并发布”，无需审核。</p>
            </> },
            { key: "publication", label: "发布与查看", children: <div className={styles.reading}>
              <section><h4>在哪里查看</h4><p>按产品分类查找，可通过列头筛选客户、型号等。点击“查看详情”查看完整参数，点击“查看历史”追溯各版本。</p></section>
              <section><h4>群通知包含什么</h4><p>标准基本信息、完整规格参数、版本及审核信息，并 @所有人。内容较多时可能分条发送。</p></section>
              <section><h4>生产执行哪个版本</h4><p>以系统中当前已发布版本为准。草稿、待审核内容尚未生效，已停用标准仅供追溯。</p></section>
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
