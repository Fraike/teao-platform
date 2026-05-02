import { forwardRef, useState, useEffect } from "react";
import { useQuotationStore } from "../lib/store";
import { COMPANY_INFO, LOGO_PATH, STAMP_PATH } from "../lib/constants";

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

function useBase64Image(path: string) {
  const [src, setSrc] = useState(path);
  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      setSrc(canvas.toDataURL("image/png"));
    };
    img.onerror = () => setSrc("");
    img.src = path;
  }, [path]);
  return src;
}

const PreviewPanel = forwardRef<HTMLDivElement>(function PreviewPanel(_props, ref) {
  const { customer, quoteMeta, products, terms } = useQuotationStore((s) => s.quotation);
  const showStamp = quoteMeta.showStamp;
  const showAmount = quoteMeta.showAmount;
  const grandTotal = products.reduce((sum, p) => sum + (p.price || 0) * (p.qty || 0), 0);

  const logoSrc = useBase64Image(LOGO_PATH);
  const stampSrc = useBase64Image(STAMP_PATH);

  return (
    <div
      ref={ref}
      className="preview-page"
      style={{
        width: A4_WIDTH,
        height: A4_HEIGHT,
        padding: "34px 44px",
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
                width: 110,
                height: 70,
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <img
                src={logoSrc}
                alt="Logo"
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                  transform: "scale(1.2)",
                }}
              />
            </div>
          ) : (
            <div style={{ width: 110, height: 70, flexShrink: 0 }} />
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: S.dark,
                whiteSpace: "nowrap",
                wordBreak: "keep-all",
                letterSpacing: -0.2,
              }}
            >
              {COMPANY_INFO.name}
            </div>
            <div style={{ fontSize: 10, color: S.muted, lineHeight: 1.75, marginTop: 5 }}>
              <div>地址：{COMPANY_INFO.address}</div>
              <div>电话：{COMPANY_INFO.tel}</div>
              <div>邮箱：{COMPANY_INFO.email}</div>
            </div>
          </div>
        </div>

        {/* 右侧：QUOTATION 标题 + 报价信息 */}
        <div style={{ textAlign: "right", paddingTop: 2 }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: S.dark, marginBottom: 2, letterSpacing: 1 }}>
            QUOTATION
          </div>
          <div style={{ fontSize: 12, color: S.muted, marginBottom: 14 }}>
            报 价 单
          </div>
          <div style={{ fontSize: 10, color: S.muted, lineHeight: 2.1, display: "inline-block", textAlign: "left" }}>
            <div>报价单号：{quoteMeta.no || "-"}</div>
            <div>日期：{quoteMeta.date || "-"}</div>
            <div>币种：{quoteMeta.currency || "-"}</div>
            <div>税率：{quoteMeta.taxNote || "-"}</div>
          </div>
        </div>
      </div>

      {/* ========== 分隔线 ========== */}
      <div style={{ height: 1, background: S.border, marginBottom: 14 }} />

      {/* ========== 内容区域（flex:1 填充剩余空间） ========== */}
      <div style={{ flex: 1 }}>
        {/* ========== 客户信息 ========== */}
        <div style={{ background: "#f8fafc", padding: "10px 16px", marginBottom: 14, border: "1px solid #f1f5f9" }}>
          <div style={{ fontSize: 9, color: S.light, textTransform: "uppercase", marginBottom: 8, fontWeight: 500 }}>
            客户信息 / Customer Information
          </div>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <tbody>
              <tr>
                <td style={{ width: "50%", fontSize: 11, lineHeight: 2 }}>
                  <span style={{ color: S.muted }}>客户名称　</span>
                  <span style={{ fontWeight: 600, color: S.dark }}>{customer.name || "-"}</span>
                </td>
                <td style={{ width: "50%", fontSize: 11, lineHeight: 2 }}>
                  <span style={{ color: S.muted }}>联系人　</span>
                  <span>{customer.contact || "-"}</span>
                </td>
              </tr>
              <tr>
                <td style={{ fontSize: 11, lineHeight: 2 }}>
                  <span style={{ color: S.muted }}>电话　</span>
                  <span>{customer.tel || "-"}</span>
                </td>
                <td style={{ fontSize: 11, lineHeight: 2 }}>
                  <span style={{ color: S.muted }}>地址　</span>
                  <span>{customer.address || "-"}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ========== 产品表格 ========== */}
        <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", marginBottom: 14, fontSize: 10 }}>
          <colgroup>
            <col style={{ width: 28 }} />
            <col style={{ width: 132 }} />
            <col style={{ width: 72 }} />
            <col style={{ width: 48 }} />
            {showAmount && <col style={{ width: 64 }} />}
            {showAmount && <col style={{ width: 66 }} />}
            {showAmount && <col style={{ width: 86 }} />}
            <col style={{ width: 86 }} />
            <col />
          </colgroup>
          <thead>
            <tr style={{ background: S.headerBg }}>
              <th style={th("center")}>#</th>
              <th style={th("left")}>产品名称</th>
              <th style={th("left")}>规格</th>
              <th style={th("left")}>单位</th>
              {showAmount && (
                <>
                  <th style={th("right")}>单价</th>
                  <th style={th("right")}>数量</th>
                  <th style={th("right")}>金额</th>
                </>
              )}
              <th style={th("left")}>参数/扭矩</th>
              <th style={th("left")}>备注</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p, idx) => (
              <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                <td style={td("center", "#94a3b8", 9)}>{idx + 1}</td>
                <td style={tdName()}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {p.image && (
                      <img src={p.image} alt="" style={{ width: 28, height: 28, objectFit: "cover", border: "1px solid #e2e8f0", flexShrink: 0 }} />
                    )}
                    <span style={{ fontWeight: 600, wordBreak: "keep-all", whiteSpace: "normal", overflowWrap: "normal" }}>{p.name || "-"}</span>
                  </div>
                </td>
                <td style={td("left", S.muted, 9)}>{p.spec || "-"}</td>
                <td style={td("left", S.muted, 9)}>{p.unit}</td>
                {showAmount && (
                  <>
                    <td style={td("right", "#334155", 10, "monospace")}>
                      {(p.price ?? 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={td("right", "#334155", 10, "monospace")}>
                      {(p.qty ?? 0).toLocaleString()}
                    </td>
                    <td style={td("right", S.dark, 10, "monospace", 600)}>
                      {((p.price || 0) * (p.qty || 0)).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </>
                )}
                <td style={td("left", S.muted, 9)}>{p.torque || ""}</td>
                <td style={td("left", S.light, 9)}>{p.remark || ""}</td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={showAmount ? 9 : 6} style={{ padding: 24, textAlign: "center", color: "#cbd5e1", fontSize: 10 }}>
                  暂无产品数据
                </td>
              </tr>
            )}
          </tbody>
          {showAmount && products.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={6} style={{ padding: "8px 10px", textAlign: "right", fontWeight: 600, color: S.dark, borderTop: `2px solid ${S.border}`, fontSize: 10 }}>
                  合计 Total
                </td>
                <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, fontSize: 12, color: S.dark, borderTop: `2px solid ${S.border}` }}>
                  {grandTotal.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td colSpan={2} style={{ borderTop: `2px solid ${S.border}` }} />
              </tr>
            </tfoot>
          )}
        </table>

        {/* ========== 条款 ========== */}
        {terms.length > 0 && (
          <div style={{ marginBottom: 0 }}>
            <div style={{ fontSize: 9, color: S.light, textTransform: "uppercase", marginBottom: 8, borderBottom: `1px solid ${S.border}`, paddingBottom: 6, fontWeight: 500 }}>
              条款与备注 / Terms &amp; Remarks
            </div>
            <div style={{ fontSize: 9, color: S.muted, lineHeight: 2, paddingLeft: 2 }}>
              {terms.map((t, idx) => (
                <div key={idx}>{t}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ========== 签章区域（固定底部） ========== */}
      <div style={{ borderTop: `1px solid ${S.border}`, paddingTop: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <tbody>
            <tr>
              <td style={{ width: "55%", verticalAlign: "bottom", position: "relative", paddingRight: 24 }}>
                <div style={{ fontWeight: 600, color: S.dark, marginBottom: 4 }}>
                  报价方：{COMPANY_INFO.name}
                </div>
                {COMPANY_INFO.contact && (
                  <div style={{ color: S.muted, fontSize: 9 }}>联系人：{COMPANY_INFO.contact}</div>
                )}
                <div style={{ color: S.muted, fontSize: 9, marginTop: 2 }}>
                  日期：{quoteMeta.date}
                </div>
                {showStamp && stampSrc && (
                  <img
                    src={stampSrc}
                    alt="公章"
                    style={{
                      position: "absolute",
                      left: 140,
                      bottom: 18,
                      width: 86,
                      opacity: 0.85,
                      pointerEvents: "none",
                    }}
                  />
                )}
              </td>
              <td style={{ width: "45%", verticalAlign: "bottom", textAlign: "right" }}>
                <div style={{ color: S.muted, fontSize: 9, marginBottom: 4 }}>客户确认 / Customer Confirmation</div>
                <div style={{ color: S.light, fontSize: 9, marginBottom: 24 }}>签字 / 盖章：</div>
                <div style={{ color: S.light, fontSize: 9 }}>日期：</div>
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
    padding: "7px 10px",
    textAlign: align,
    fontWeight: 600,
    color: "#475569",
    borderBottom: "2px solid #e2e8f0",
    fontSize: 9,
    whiteSpace: "nowrap",
  };
}

function tdName(): React.CSSProperties {
  return {
    padding: "7px 10px",
    textAlign: "left",
    color: "#0f172a",
    fontSize: 10,
    verticalAlign: "middle",
    wordBreak: "keep-all",
    whiteSpace: "normal",
    overflowWrap: "normal",
  };
}

function td(
  align: "left" | "right" | "center",
  color: string,
  fontSize = 10,
  fontFamily?: string,
  fontWeight?: number
): React.CSSProperties {
  return {
    padding: "7px 10px",
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
