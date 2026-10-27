import type { ReactNode } from "react";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN.js";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn.js";

dayjs.locale("zh-cn");
const locale = (zhCN as typeof zhCN & { default?: typeof zhCN }).default ?? zhCN;

export function AppLocaleProvider({ children }: { children: ReactNode }) {
  return <ConfigProvider locale={locale}>{children}</ConfigProvider>;
}
