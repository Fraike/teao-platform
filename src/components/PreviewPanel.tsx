import { forwardRef, useState, useEffect } from "react";
import { useQuotationStore } from "../lib/store";
import { COMPANY_INFO, LOGO_PATH, STAMP_PATH } from "../lib/constants";

const S = {
  font: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  color: "#1e293b",
  muted: "#64748b",
  light: "#94a3b8",
  dark: "#0f172a",
  border: "#e2e8f0",
  bg: "#f8fafc",
  headerBg: "#f1f5f9",
};

function useBase64Image(path: string) {
  const [src, setSrc] = useState(path);
  useEffect(() => {
    const img = new Image();
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
      style={{
        width: "210mm",
        minHeight: "297mm",
        padding: "18mm 20mm",
        fontFamily: S.font,
        color: S.color,
        lineHeight: 1.6,
        background: "#fff",
      }}
    >
      {/* ========== 头部 ========== */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
        <tbody>
          <tr>
            <td style={{ verticalAlign: "top", width: "62%" }}>
              <table style={{ borderCollapse: "collapse" }}>
                <tbody>
                  <tr>
                    <td style={{ width: 88, verticalAlign: "middle", paddingRight: 14 }}>
                      {logoSrc ? (
                        <img
                          src={logoSrc}
                          alt="Logo"
                          style={{ width: 80, height: 80, objectFit: "contain" }}
                        />
                      ) : (
                        <div style={{ width: 80, height: 80 }} />
                      )}
                    </td>
                    <td style={{ verticalAlign: "middle" }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: S.dark, marginBottom: 6 }}>
                        {COMPANY_INFO.name}
                      </div>
                      <div style={{ fontSize: 10, color: S.muted, lineHeight: 1.8 }}>
                        <div>地址：{COMPANY_INFO.address}</div>
                        <div>电话：{COMPANY_INFO.tel}</div>
                        <div>邮箱：{COMPANY_INFO.email}</div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
            <td style={{ verticalAlign: "top", textAlign: "right", width: "38%" }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: S.dark, marginBottom: 4 }}>
                QUOTATION
              </div>
              <div style={{ fontSize: 13, color: S.muted, marginBottom: 18 }}>
                报 价 单
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: S.dark,
                  lineHeight: 2.2,
                  background: S.bg,
                  padding: "10px 14px",
                  display: "inline-block",
                  textAlign: "left",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div>单　　号：{quoteMeta.no || "-"}</div>
                <div>日　　期：{quoteMeta.date || "-"}</div>
                <div>币　　种：{quoteMeta.currency || "-"}</div>
                <div>税率说明：{quoteMeta.taxNote || "-"}</div>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ========== 分隔线 ========== */}
      <div style={{ height: 2, background: S.border, marginBottom: 20 }} />

      {/* ========== 客户信息 ========== */}
      <div style={{ background: S.bg, padding: "14px 20px", marginBottom: 24, border: "1px solid #f1f5f9" }}>
        <div style={{ fontSize: 10, color: S.light, textTransform: "uppercase", marginBottom: 10, fontWeight: 500 }}>
          客户信息 / Customer Information
        </div>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <tbody>
            <tr>
              <td style={{ width: "50%", fontSize: 12, lineHeight: 2.2 }}>
                <span style={{ color: S.muted }}>客户名称　</span>
                <span style={{ fontWeight: 600, color: S.dark }}>{customer.name || "-"}</span>
              </td>
              <td style={{ width: "50%", fontSize: 12, lineHeight: 2.2 }}>
                <span style={{ color: S.muted }}>联系人　</span>
                <span>{customer.contact || "-"}</span>
              </td>
            </tr>
            <tr>
              <td style={{ fontSize: 12, lineHeight: 2.2 }}>
                <span style={{ color: S.muted }}>电话　</span>
                <span>{customer.tel || "-"}</span>
              </td>
              <td style={{ fontSize: 12, lineHeight: 2.2 }}>
                <span style={{ color: S.muted }}>地址　</span>
                <span>{customer.address || "-"}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ========== 产品表格 ========== */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24, fontSize: 11 }}>
        <thead>
          <tr style={{ background: S.headerBg }}>
            <th style={th("#", 30, "center")}>#</th>
            <th style={th("产品名称", undefined, "left")}>产品名称</th>
            <th style={th("规格", 72, "left")}>规格</th>
            <th style={th("单位", 52, "left")}>单位</th>
            {showAmount && (
              <>
                <th style={th("单价", 76, "right")}>单价</th>
                <th style={th("数量", 64, "right")}>数量</th>
                <th style={th("金额", 88, "right")}>金额</th>
              </>
            )}
            <th style={th("参数", 90, "left")}>参数/扭矩</th>
            <th style={th("备注", 80, "left")}>备注</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p, idx) => (
            <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
              <td style={td("center", "#94a3b8", 10)}>{idx + 1}</td>
              <td style={td("left", S.dark)}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {p.image && (
                    <img src={p.image} alt="" style={{ width: 34, height: 34, objectFit: "cover", border: "1px solid #e2e8f0" }} />
                  )}
                  <span style={{ fontWeight: 600 }}>{p.name || "-"}</span>
                </div>
              </td>
              <td style={td("left", S.muted)}>{p.spec || "-"}</td>
              <td style={td("left", S.muted)}>{p.unit}</td>
              {showAmount && (
                <>
                  <td style={td("right", "#334155", 11, "monospace")}>
                    {(p.price ?? 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td style={td("right", "#334155", 11, "monospace")}>
                    {(p.qty ?? 0).toLocaleString()}
                  </td>
                  <td style={td("right", S.dark, 11, "monospace", 600)}>
                    {((p.price || 0) * (p.qty || 0)).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </>
              )}
              <td style={td("left", S.muted, 10)}>{p.torque || ""}</td>
              <td style={td("left", S.light, 10)}>{p.remark || ""}</td>
            </tr>
          ))}
          {products.length === 0 && (
            <tr>
              <td colSpan={showAmount ? 9 : 6} style={{ padding: "28px", textAlign: "center", color: "#cbd5e1", fontSize: 11 }}>
                暂无产品数据
              </td>
            </tr>
          )}
        </tbody>
        {showAmount && products.length > 0 && (
          <tfoot>
            <tr>
              <td colSpan={6} style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: S.dark, borderTop: `2px solid ${S.border}`, fontSize: 11 }}>
                合计 Total
              </td>
              <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", fontWeight: 700, fontSize: 13, color: S.dark, borderTop: `2px solid ${S.border}` }}>
                {grandTotal.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td colSpan={2} style={{ borderTop: `2px solid ${S.border}` }} />
            </tr>
          </tfoot>
        )}
      </table>

      {/* ========== 条款 ========== */}
      {terms.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 10, color: S.light, textTransform: "uppercase", marginBottom: 10, borderBottom: `1px solid ${S.border}`, paddingBottom: 8, fontWeight: 500 }}>
            条款与备注 / Terms &amp; Remarks
          </div>
          <div style={{ fontSize: 10, color: S.muted, lineHeight: 2.2, paddingLeft: 4 }}>
            {terms.map((t, idx) => (
              <div key={idx}>{t}</div>
            ))}
          </div>
        </div>
      )}

      {/* ========== 签章区域 ========== */}
      <div style={{ marginTop: 32, borderTop: `1px solid ${S.border}`, paddingTop: 20 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <tbody>
            <tr>
              <td style={{ width: "55%", verticalAlign: "bottom", position: "relative", paddingRight: 24 }}>
                <div style={{ fontWeight: 600, color: S.dark, marginBottom: 6 }}>
                  报价方：{COMPANY_INFO.name}
                </div>
                {COMPANY_INFO.contact && (
                  <div style={{ color: S.muted, fontSize: 10 }}>联系人：{COMPANY_INFO.contact}</div>
                )}
                <div style={{ color: S.muted, fontSize: 10, marginTop: 4 }}>
                  日期：{quoteMeta.date}
                </div>
                {showStamp && stampSrc && (
                  <img
                    src={stampSrc}
                    alt="公章"
                    style={{
                      position: "absolute",
                      left: 100,
                      bottom: -8,
                      width: 96,
                      opacity: 0.82,
                      pointerEvents: "none",
                    }}
                  />
                )}
              </td>
              <td style={{ width: "45%", verticalAlign: "bottom", textAlign: "right" }}>
                <div style={{ color: S.muted, fontSize: 10, marginBottom: 4 }}>客户确认 / Customer Confirmation</div>
                <div style={{ color: S.light, fontSize: 10, marginBottom: 28 }}>签字 / 盖章：</div>
                <div style={{ color: S.light, fontSize: 10 }}>日期：</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
});

function th(_label: string, width?: number, align: "left" | "right" | "center" = "left"): React.CSSProperties {
  return {
    padding: "9px 12px",
    textAlign: align,
    fontWeight: 600,
    color: "#475569",
    borderBottom: "2px solid #e2e8f0",
    fontSize: 10,
    whiteSpace: "nowrap",
    ...(width ? { width } : {}),
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
    padding: "9px 12px",
    textAlign: align,
    color,
    fontSize,
    verticalAlign: "middle",
    ...(fontFamily ? { fontFamily } : {}),
    ...(fontWeight ? { fontWeight } : {}),
  };
}

export default PreviewPanel;
