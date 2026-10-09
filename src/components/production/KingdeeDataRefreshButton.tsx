import { useState } from "react";
import { Button, message } from "antd";
import { ReloadOutlined } from "@ant-design/icons";
import { formatKingdeeRefreshMessage, refreshKingdeeData } from "../../lib/productionReferenceData";

export function KingdeeDataRefreshButton() {
  const [loading, setLoading] = useState(false);

  const handleRefresh = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const result = await refreshKingdeeData();
      const display = formatKingdeeRefreshMessage(result);
      message.open({ type: display.level, content: display.content, duration: 6 });
    } catch (error) {
      message.error(error instanceof Error ? error.message : "金蝶数据更新失败，已保留原有缓存");
    } finally {
      setLoading(false);
    }
  };

  return <Button size="small" icon={<ReloadOutlined />} onClick={handleRefresh} loading={loading}>更新金蝶数据</Button>;
}
