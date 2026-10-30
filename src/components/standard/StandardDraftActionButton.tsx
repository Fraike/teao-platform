import {useTabBusy} from "../../lib/tabPageContext";
import { useRef, useState } from "react";
import { Button, Popconfirm, message } from "antd";
import { api } from "../../lib/api";
import type { StandardDetail, StandardDraftAction, StandardDraftActionResponse, StandardDraftActionTarget } from "../../types/standard";

interface StandardDraftActionButtonProps {
  target: StandardDraftActionTarget;
  action: StandardDraftAction;
  hasPublished: boolean;
  disabled?: boolean;
  onCompleted: (detail: StandardDetail | null) => void;
}

export function StandardDraftActionButton({ target, action, hasPublished, disabled, onCompleted }: StandardDraftActionButtonProps) {
  const [loading, setLoading] = useState(false);
  useTabBusy(loading);
  const inFlight = useRef(false);
  const snapshot = useRef({ ...target, action });
  const withdraw = action === "withdraw";
  const label = withdraw ? "撤回审核" : hasPublished ? "放弃修改" : "删除草稿";
  const confirm = async () => {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const expected = snapshot.current;
      const { data } = await api.post<StandardDraftActionResponse>(`/api/standards/${expected.id}/${expected.action}`, {
        versionId: expected.versionId, revision: expected.revision,
      });
      onCompleted(data);
      message.success(withdraw ? "已撤回审核，修改保留为草稿" : hasPublished ? "已放弃修改，恢复已发布标准" : "草稿已删除并归档");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "操作失败，请刷新后重试");
    } finally { inFlight.current = false; setLoading(false); }
  };

  return <Popconfirm title={`${label}？`} description={withdraw ? "撤回后保留为草稿，可修改后重新提交，本次审核和催审将停止。"
    : hasPublished ? "本次草稿将归档，恢复最近已发布版本，并清除草稿标记。" : "此草稿将从正常列表移除，历史归档保留。"}
    okText={withdraw ? "确认撤回" : hasPublished ? "确认放弃" : "确认删除"} cancelText="取消"
    disabled={disabled || loading} onOpenChange={open => { if (open && !inFlight.current) snapshot.current = { ...target, action }; }} onConfirm={confirm} okButtonProps={{ danger: !withdraw, loading }}>
    <Button size="small" danger={!withdraw} disabled={disabled} loading={loading} aria-label={`${label} ${target.serialNo}`}>{label}</Button>
  </Popconfirm>;
}
