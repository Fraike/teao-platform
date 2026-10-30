import {useTabState,useTabBusy,useTabPage} from "../../lib/tabPageContext";
import { useEffect, useState } from "react";
import { BellOutlined } from "@ant-design/icons";
import { Button, message, Tooltip } from "antd";
import { api, isApiError } from "../../lib/api";
import type { StandardReminderResponse } from "../../types/standard";

interface StandardRemindButtonProps {
  standardId: string;
  versionNo: number;
  serialNo: string;
}

export function StandardRemindButton({ standardId, versionNo, serialNo }: StandardRemindButtonProps) {
  const {active}=useTabPage();
  const [loading, setLoading] = useState(false);
  const [retryAt, setRetryAt] = useTabState(`standard:remind:${standardId}:${versionNo}`,0);
  useTabBusy(loading);
  useEffect(() => {
    if (!active||!retryAt) return;
    const timer = window.setTimeout(() => setRetryAt(0), Math.max(0, retryAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [retryAt,setRetryAt,active]);

  const remind = async () => {
    setLoading(true);
    try {
      const result = await api.post<StandardReminderResponse>(`/api/standards/${standardId}/remind`, { versionNo });
      setRetryAt(Date.parse(result.retryAt || "") || 0);
      if (result.status === "sent") message.success(result.mentionedReviewer ? "已发送催审消息并 @审核人" : "已发送催审消息，审核人未绑定企微账号，未能 @");
      else if (result.status === "not_configured") message.warning("尚未配置企业微信群机器人，未发送催审消息");
      else if (result.status === "unknown") message.warning("发送结果不确定，请先核查企业微信群，避免重复催促");
      else message.error("企业微信拒绝发送催审消息，请联系管理员检查配置");
    } catch (error) {
      if (isApiError(error) && error.code === "REMINDER_COOLDOWN") setRetryAt(Date.parse(error.retryAt || "") || Date.now() + 5 * 60000);
      message.error(error instanceof Error ? error.message : "催促审核失败");
    } finally { setLoading(false); }
  };

  return <Tooltip title={retryAt ? `最近已提醒，可于 ${new Date(retryAt).toLocaleTimeString("zh-CN", { hour12: false })} 再次催促` : "立即在企业微信群提醒指定审核人"}>
    <span><Button size="small" icon={<BellOutlined />} loading={loading} disabled={retryAt > 0} aria-label={`催促审核 ${serialNo}`} onClick={() => void remind()}>催审</Button></span>
  </Tooltip>;
}
