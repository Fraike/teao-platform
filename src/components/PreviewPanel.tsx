import { forwardRef, Fragment } from "react";
import { useQuotationStore } from "../lib/store";
import { COMPANY_INFO, LOGO_PATH, STAMP_PATH } from "../lib/constants";
import { formatQuotePrice } from "../lib/quotationDisplay";

const A4_WIDTH = 794;
const A4_HEIGHT = 1122;

const S = {
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  color: "#1e293b",
  muted: "#64748b",
  light: "#94a3b8",
  dark: "#0f172a",
  border: "#e2e8f0",
  headerBg: "#f1f5f9",
};

import { useBase64Image } from "../lib/useBase64Image";
import priceStyles from "./PriceEmphasis.module.css";
import styles from "./PreviewPanel.module.css";

const PreviewPanel = forwardRef<HTMLDivElement>(function PreviewPanel(_props, ref) {
  const { customer, quoteMeta, products, terms, molds } = useQuotationStore((s) => s.quotation);
  const showStamp = quoteMeta.showStamp;
  const showMold = quoteMeta.showMold;
  const columnWidths = quoteMeta.tableColumnWidths;

  const logoSrc = useBase64Image(LOGO_PATH);
  const stampSrc = useBase64Image(STAMP_PATH);

  return (
    <div
      ref={ref}
      className="preview-page"
      style={{
        width: A4_WIDTH,
        height: A4_HEIGHT,
        padding: "42px 44px 64px",
        boxSizing: "border-box",
        fontFamily: S.font,
        color: S.color,
        lineHeight: 1.5,
        background: "#fff",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ========== 头部 ========== */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 210px",
          gap: 32,
          alignItems: "flex-start",
          marginBottom: 14,
        }}
      >
        {/* 左侧：Logo + 公司信息 */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 0 }}>
          {logoSrc ? (
            <div
              style={{
                width: 120,
                height: 72,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "visible",
                flexShrink: 0,
              }}
            >
              <img
                src={logoSrc}
                alt="TEAO Logo"
                style={{
                  maxWidth: 120,
                  maxHeight: 72,
                  width: "auto",
                  height: "auto",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </div>
          ) : (
            <div style={{ width: 120, height: 72, flexShrink: 0 }} />
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: S.dark,
                whiteSpace: "nowrap",
                wordBreak: "keep-all",
                letterSpacing: -0.2,
              }}
            >
              {COMPANY_INFO.name}
            </div>
            <div style={{ fontSize: 11, color: S.muted, lineHeight: 1.75, marginTop: 5 }}>
              <div>地址：{COMPANY_INFO.address}</div>
              <div>电话：{COMPANY_INFO.tel}</div>
              <div>邮箱：{COMPANY_INFO.email}</div>
              <div>报价人：{quoteMeta.salesName || "-"}</div>
              <div>联系方式：{quoteMeta.salesTel || "-"}</div>
            </div>
          </div>
        </div>

        {/* 右侧：QUOTATION 标题 + 报价信息 */}
        <div style={{ textAlign: "right", paddingTop: 2 }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: S.dark, marginBottom: 2, letterSpacing: 1 }}>
            QUOTATION
          </div>
          <div style={{ fontSize: 13, color: S.muted, marginBottom: 14 }}>
            报 价 单
          </div>
          <div style={{ fontSize: 11, color: S.muted, lineHeight: 2.1, display: "inline-block", textAlign: "left" }}>
            <div>报价单号：{quoteMeta.no || "-"}</div>
            <div>日期：{quoteMeta.date || "-"}</div>
            <div>币种：{quoteMeta.currency || "-"}</div>
            <div>税率：{quoteMeta.taxNote || "-"}</div>
          </div>
        </div>
      </div>

      {/* ========== 分隔线 ========== */}
      <div style={{ height: 1, background: S.border, marginBottom: 14 }} />

      {/* ========== 内容区域 ========== */}
      <div style={{ flex: "0 0 auto" }}>
        {/* ========== 客户信息 ========== */}
        <div style={{ background: "#f8fafc", padding: "10px 16px", marginBottom: 14, border: "1px solid #f1f5f9" }}>
          <div style={sectionTitle()}>
            <span>客户信息</span>
            <span>/</span>
            <span>CUSTOMER INFORMATION</span>
          </div>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <tbody>
              <tr>
                <td style={{ width: "50%", fontSize: 12, lineHeight: 2 }}>
                  <span style={{ color: S.muted, marginRight: 6 }}>客户名称</span>
                  <span style={{ fontWeight: 600, color: S.dark }}>{customer.name || "-"}</span>
                </td>
                <td style={{ width: "50%", fontSize: 12, lineHeight: 2 }}>
                  <span style={{ color: S.muted, marginRight: 6 }}>联系人</span>
                  <span>{customer.contact || "-"}</span>
                </td>
              </tr>
              <tr>
                <td style={{ fontSize: 12, lineHeight: 2 }}>
                  <span style={{ color: S.muted, marginRight: 6 }}>电话</span>
                  <span>{customer.tel || "-"}</span>
                </td>
                <td style={{ fontSize: 12, lineHeight: 2 }}>
                  <span style={{ color: S.muted, marginRight: 6 }}>地址</span>
                  <span>{customer.address || "-"}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ========== 产品表格 ========== */}
        <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", marginBottom: 14, fontSize: 11 }}>
          <colgroup>
            <col style={{ width: columnWidths.index }} />
            <col style={{ width: columnWidths.name }} />
            <col style={{ width: columnWidths.partNo }} />
            <col style={{ width: columnWidths.spec }} />
            <col style={{ width: columnWidths.unit }} />
            <col style={{ width: columnWidths.price }} />
            <col style={{ width: columnWidths.torque }} />
            <col style={{ width: columnWidths.image }} />
            <col style={{ width: columnWidths.remark }} />
          </colgroup>
          <thead>
            <tr style={{ background: S.headerBg }}>
              <th style={th("center")}>#</th>
              <th style={th("left")}>产品名称</th>
              <th style={th("left")}>料号</th>
              <th style={th("left")}>规格</th>
              <th style={th("left")}>单位</th>
              <th style={th("right")}>单价</th>
              <th style={th("left")}>参数/扭矩</th>
              <th style={th("center")}>图片</th>
              <th style={th("left")}>备注</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p, idx) => {
              const price = formatQuotePrice(p.price ?? 0, "¥", 2, "zh-CN");

              return (
                <Fragment key={p.id}>
              <tr style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={td("center", "#94a3b8", 10)}>{idx + 1}</td>
                <td style={tdName()}>
                  <span style={{ fontWeight: 600, wordBreak: "keep-all", whiteSpace: "normal", overflowWrap: "normal" }}>{p.name || "-"}</span>
                </td>
                <td style={td("left", S.muted, 10)}>{p.partNo || "-"}</td>
                <td style={td("left", S.muted, 10)}>{p.spec || "-"}</td>
                <td style={td("left", S.muted, 10)}>{p.unit}</td>
                <td style={td("right", "#334155", 11, "monospace")}>
                  {p.tierPricingEnabled ? (
                    <span className={styles.tierModeLabel}>阶梯报价</span>
                  ) : (
                    <span className={priceStyles.previewPrice}>{price.currency}{price.amount}</span>
                  )}
                </td>
                <td style={td("left", S.muted, 10)}>{p.torque || ""}</td>
                <td style={td("center", S.muted, 10)}>
                  {p.image ? (
                    <img
                      src={p.image}
                      alt=""
                      style={{
                        width: 48,
                        height: 48,
                        objectFit: "cover",
                        border: "1px solid #e2e8f0",
                        display: "block",
                        margin: "0 auto",
                      }}
                    />
                  ) : (
                    "-"
                  )}
                </td>
                <td style={td("left", S.light, 10)}>{p.remark || ""}</td>
              </tr>
              {p.tierPricingEnabled && p.tiers && [...p.tiers].sort((a, b) => a.minQty - b.minQty).map((tier) => {
                const tierPrice = formatQuotePrice(tier.price, "¥", 2, "zh-CN");

                return (
                  <tr key={tier.id} className={styles.tierRow}>
                  <td style={td("center", S.light, 9)}></td>
                  <td colSpan={4} style={td("right", S.muted, 9)}>
                    MOQ ≥ {tier.minQty.toLocaleString("zh-CN")} {p.unit || "PCS"}
                  </td>
                  <td style={td("right", "#1677ff", 10, "monospace", 600)}>
                    <span className={priceStyles.previewPrice}>
                      {tierPrice.currency}{tierPrice.amount}
                    </span>
                  </td>
                  <td colSpan={3} style={td("left", S.light, 9)}></td>
                  </tr>
                );
              })}
                </Fragment>
              );
            })}
            {products.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: 24, textAlign: "center", color: "#cbd5e1", fontSize: 11 }}>
                  暂无产品数据
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* ========== 模具费用摊销 ========== */}
        {showMold && molds.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ ...sectionTitle(), borderBottom: `1px solid ${S.border}`, paddingBottom: 6, marginBottom: 8 }}>
              <span>模具费用摊销</span>
              <span>/</span>
              <span>MOLD TOOLING COST</span>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
              <thead>
                <tr style={{ background: S.headerBg }}>
                  <th style={th("left")}>模具名称</th>
                  <th style={th("right")}>模具总费用</th>
                  <th style={th("right")}>分摊数量</th>
                  <th style={th("right")}>模具单价</th>
                </tr>
              </thead>
              <tbody>
                {molds.map((m) => {
                  const unitCost = m.amortizeQty > 0 ? m.totalCost / m.amortizeQty : 0;
                  return (
                    <tr key={m.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={td("left", S.color, 10)}>{m.name || "-"}</td>
                      <td style={td("right", "#334155", 10, "monospace")}>
                        ¥{m.totalCost.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td style={td("right", S.muted, 10)}>
                        {m.amortizeQty.toLocaleString()} PCS
                      </td>
                      <td style={td("right", "#1677ff", 10, "monospace", 600)}>
                        ¥{unitCost.toFixed(4)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ========== 条款 ========== */}
        {terms.length > 0 && (
          <div style={{ marginBottom: 0 }}>
            <div style={{ ...sectionTitle(), borderBottom: `1px solid ${S.border}`, paddingBottom: 6 }}>
              <span>条款与备注</span>
              <span>/</span>
              <span>TERMS &amp; REMARKS</span>
            </div>
            <div style={{ fontSize: 10, color: S.muted, lineHeight: 2, paddingLeft: 2 }}>
              {terms.map((t, idx) => (
                <div key={idx}>{t}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ========== 签章区弹性间距 ========== */}
      <div style={{ flex: 1, minHeight: 36, maxHeight: 96 }} />

      {/* ========== 签章区域 ========== */}
      <div style={{ flex: "0 0 auto", borderTop: `1px solid ${S.border}`, paddingTop: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <tbody>
            <tr>
              <td style={{ width: "55%", verticalAlign: "bottom", position: "relative", paddingRight: 24, minHeight: 96 }}>
                {showStamp && stampSrc && (
                  <img
                    src={stampSrc}
                    alt="公章"
	                    style={{
	                      position: "absolute",
	                      left: 120,
	                      top: -46,
	                      width: 116,
	                      height: 116,
	                      opacity: 0.82,
	                      transform: "rotate(-7deg)",
	                      pointerEvents: "none",
	                      zIndex: 2,
	                    }}
	                  />
	                )}
                <div style={{ paddingTop: 36, position: "relative", zIndex: 1 }}>
                  <div style={{ fontWeight: 600, color: S.dark, marginBottom: 4 }}>
                    报价方：{COMPANY_INFO.name}
                  </div>
                  {COMPANY_INFO.contact && (
                    <div style={{ color: S.muted, fontSize: 10 }}>联系人：{COMPANY_INFO.contact}</div>
                  )}
                  <div style={{ color: S.muted, fontSize: 10, marginTop: 2 }}>
                    日期：{quoteMeta.date}
                  </div>
                </div>
              </td>
              <td style={{ width: "45%", verticalAlign: "bottom", textAlign: "left", paddingLeft: 88 }}>
                <div style={{ ...inlineTextGroup(6), color: S.muted, fontSize: 10, marginBottom: 4, justifyContent: "flex-start" }}>
                  <span>客户确认</span>
                  <span>/</span>
                  <span>Customer Confirmation</span>
                </div>
                <div style={{ color: S.light, fontSize: 10, marginBottom: 24 }}>签字 / 盖章：</div>
                <div style={{ color: S.light, fontSize: 10 }}>日期：</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
});

function th(align: "left" | "right" | "center" = "left"): React.CSSProperties {
  return {
    padding: "10px 10px",
    textAlign: align,
    fontWeight: 600,
    color: "#475569",
    borderBottom: "2px solid #e2e8f0",
    fontSize: 10,
    whiteSpace: "nowrap",
  };
}

function sectionTitle(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 10,
    color: S.light,
    marginBottom: 8,
    fontWeight: 500,
  };
}

function inlineTextGroup(gap: number): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap,
  };
}

function tdName(): React.CSSProperties {
  return {
    padding: "10px 10px",
    textAlign: "left",
    color: "#0f172a",
    fontSize: 11,
    verticalAlign: "middle",
    wordBreak: "keep-all",
    whiteSpace: "normal",
    overflowWrap: "normal",
  };
}

function td(
  align: "left" | "right" | "center",
  color: string,
  fontSize = 11,
  fontFamily?: string,
  fontWeight?: number
): React.CSSProperties {
  return {
    padding: "10px 10px",
    textAlign: align,
    color,
    fontSize,
    verticalAlign: "middle",
    wordBreak: "keep-all",
    overflowWrap: "normal",
    ...(fontFamily ? { fontFamily } : {}),
    ...(fontWeight ? { fontWeight } : {}),
  };
}

export default PreviewPanel;
