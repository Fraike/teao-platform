import { forwardRef, useState, useEffect, Fragment } from "react";
import { useIntlQuotationStore } from "../../lib/store-intl";
import { COMPANY_INFO_EN, LOGO_PATH, STAMP_PATH } from "../../lib/constants";

const A4_WIDTH = 794;
const A4_HEIGHT = 1122;

const C = {
  white: "#ffffff",
  bg: "#faf8f4",
  primary: "#404040",
  heading: "#2a2a2a",
  text: "#4a4a4a",
  muted: "#787878",
  subtle: "#a0a0a0",
  border: "#e8e3da",
  accent: "#d07800",
  accentDark: "#b86800",
  accentLight: "#fef7ed",
  moldBg: "#f7f4ee",
  tagBg: "#f5f1e8",
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

const PreviewPanelIntl = forwardRef<HTMLDivElement>(function PreviewPanelIntl(_props, ref) {
  const { customer, quoteMeta, products, terms, molds } = useIntlQuotationStore((s) => s.quotation);
  const showStamp = quoteMeta.showStamp;
  const showMold = quoteMeta.showMold;
  const columnWidths = quoteMeta.tableColumnWidths;
  const logoSrc = useBase64Image(LOGO_PATH);
  const stampSrc = useBase64Image(STAMP_PATH);
  const totalAmount = products.reduce(
  (sum, p) => sum + (p.tiers && p.tiers.length > 0 ? 0 : (p.qty ?? 0) * (p.price ?? 0)),
  0
);

  return (
    <div
      ref={ref}
      className="preview-page"
      style={{
        width: A4_WIDTH,
        height: A4_HEIGHT,
        padding: 0,
        boxSizing: "border-box",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
        color: C.text,
        lineHeight: 1.5,
        background: C.white,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ===== Top accent bar ===== */}
      <div style={{ height: 4, background: C.accent, flexShrink: 0 }} />

      {/* ===== Header ===== */}
      <div style={{ padding: "28px 44px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", paddingBottom: 18, borderBottom: `1px solid ${C.border}` }}>
          {/* Left: Logo + Company Info */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
            {logoSrc ? (
              <div
                style={{
                  width: 66,
                  height: 34,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  flexShrink: 0,
                  marginTop: 2,
                }}
              >
                <img
                  src={logoSrc}
                  alt="TEAO"
                  width={66}
                  style={{
                    maxWidth: 66,
                    maxHeight: 34,
                    width: "auto",
                    height: "auto",
                    display: "block",
                  }}
                />
              </div>
            ) : (
              <div style={{ width: 66, height: 34, background: C.bg, borderRadius: 3, flexShrink: 0 }} />
            )}
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.heading, letterSpacing: -0.2, marginBottom: 6 }}>
                {COMPANY_INFO_EN.name}
              </div>
              <div style={{ fontSize: 8.5, color: C.muted, lineHeight: 1.8 }}>
                {COMPANY_INFO_EN.address}
              </div>
              <div style={{ fontSize: 8.5, color: C.muted, lineHeight: 1.8 }}>
                Tel: {COMPANY_INFO_EN.tel} &nbsp;|&nbsp; Email: {COMPANY_INFO_EN.email} &nbsp;|&nbsp; Web: {COMPANY_INFO_EN.website}
              </div>
            </div>
          </div>

          {/* Right: Quote Meta Box */}
          <div style={{ textAlign: "right", fontSize: 9, color: C.muted, lineHeight: 1.9, flexShrink: 0, paddingTop: 2 }}>
            <div><span style={{ fontWeight: 600, color: C.heading, marginRight: 8 }}>Quotation No.</span>{quoteMeta.no || "-"}</div>
            <div><span style={{ fontWeight: 600, color: C.heading, marginRight: 8 }}>Date</span>{quoteMeta.date || "-"}</div>
            <div><span style={{ fontWeight: 600, color: C.heading, marginRight: 8 }}>Currency</span>{quoteMeta.currency}</div>
          </div>
        </div>
      </div>

      {/* ===== QUOTATION Title ===== */}
      <div style={{ textAlign: "center", padding: "16px 0 18px", flexShrink: 0 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: C.heading, letterSpacing: 2, marginBottom: 1 }}>
          QUOTATION
        </div>
        <div style={{ width: 48, height: 2, background: C.accent, margin: "0 auto" }} />
      </div>

      {/* ===== To / From Section ===== */}
      <div style={{ padding: "0 44px", flexShrink: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, marginBottom: 18 }}>
          <tbody>
            <tr>
              <td style={{ width: "50%", verticalAlign: "top", paddingRight: 16 }}>
                <div style={{ ...labelBadge() }}>
                  Bill To
                </div>
                <div style={{ fontWeight: 700, fontSize: 12, color: C.heading, marginBottom: 4 }}>
                  {customer.name || "—"}
                </div>
                {customer.contact && <div style={{ color: C.muted }}>Attn: {customer.contact}</div>}
                {customer.email && <div style={{ color: C.muted }}>{customer.email}</div>}
                {customer.tel && <div style={{ color: C.muted }}>{customer.tel}</div>}
                {customer.address && <div style={{ color: C.subtle, marginTop: 4 }}>
                  {customer.address}
                  {customer.postalCode && `, ${customer.postalCode}`}
                </div>}
                {customer.country && <div style={{ color: C.subtle }}>{customer.country}</div>}
              </td>
              <td style={{ width: "50%", verticalAlign: "top", paddingLeft: 16, borderLeft: `1px solid ${C.border}` }}>
                <div style={{ ...labelBadge() }}>
                  From
                </div>
                <div style={{ fontWeight: 700, fontSize: 12, color: C.heading, marginBottom: 4 }}>
                  {quoteMeta.salesName || "—"}
                </div>
                <div style={{ color: C.muted }}>{COMPANY_INFO_EN.name}</div>
                <div style={{ color: C.muted }}>{COMPANY_INFO_EN.email}</div>
                <div style={{ color: C.muted }}>{COMPANY_INFO_EN.tel}</div>
                <div style={{ color: C.subtle, marginTop: 4 }}>{COMPANY_INFO_EN.address}</div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Trade & Payment terms badge */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <div style={{ ...infoTag() }}>
            Trade Term: {quoteMeta.tradeTerm || "EXW"}
          </div>
          <div style={{ ...infoTag() }}>
            Payment: {quoteMeta.paymentTerm || "—"}
          </div>
        </div>
      </div>

      {/* ===== Product Table ===== */}
      <div style={{ flex: "0 0 auto", padding: "0 44px" }}>
        <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse" }}>
          <colgroup>
            <col style={{ width: columnWidths.index }} />
            <col style={{ width: columnWidths.name + 10 }} />
            <col style={{ width: columnWidths.spec + 10 }} />
            <col style={{ width: columnWidths.unit }} />
            <col style={{ width: columnWidths.price + 10 }} />
            <col style={{ width: 44 }} />
            <col style={{ width: 60 }} />
            <col style={{ width: columnWidths.packaging }} />
            <col style={{ width: columnWidths.remark }} />
          </colgroup>
          <thead>
            <tr>
              <th style={th("#")}>#</th>
              <th style={th("left")}>Item</th>
              <th style={th("left")}>Description</th>
              <th style={th("left")}>Unit</th>
              <th style={th("right")}>Unit Price</th>
              <th style={th("right")}>QTY</th>
              <th style={th("right")}>Amount</th>
              <th style={th("left")}>Packaging</th>
              <th style={th("left")}>Note</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p, idx) => {
              const hasTiers = p.tiers && p.tiers.length > 0;
              return (
                <Fragment key={p.id}>
                  {/* Main product row */}
                  <tr style={idx % 2 === 1 ? { background: C.bg } : {}}>
                    <td style={td("#", C.subtle)}>{idx + 1}</td>
                    <td style={tdItem()}>
                      <span style={{ fontWeight: 600, color: C.heading }}>{p.name || "—"}</span>
                      {p.torque && <span style={{ display: "block", fontSize: 8, color: C.muted, marginTop: 1 }}>Torque: {p.torque}</span>}
                    </td>
                    <td style={td("left", C.muted)}>{p.spec || "—"}</td>
                    <td style={td("left", C.muted)}>{p.unit}</td>
                    <td style={td("right", C.muted)}>
                      {hasTiers ? (
                        <span style={{ fontSize: 8, fontStyle: "italic", color: C.subtle }}>Tiered →</span>
                      ) : (
                        <>
                          <span style={{ fontSize: 7, color: C.subtle }}>{quoteMeta.currency} </span>
                          {(p.price ?? 0).toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                        </>
                      )}
                    </td>
                    <td style={td("right", C.text)}>
                      {hasTiers ? (
                        <span style={{ color: C.subtle }}>—</span>
                      ) : (
                        (p.qty ?? 0).toLocaleString("en-US")
                      )}
                    </td>
                    <td style={td("right", C.heading, "monospace", 600)}>
                      {hasTiers ? (
                        <span style={{ color: C.subtle }}>—</span>
                      ) : (
                        <>
                          <span style={{ fontSize: 7, color: C.subtle }}>{quoteMeta.currency} </span>
                          {((p.qty ?? 0) * (p.price ?? 0)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </>
                      )}
                    </td>
                    <td style={{ ...td("left", C.muted), wordBreak: "break-word" }}>
                      {p.packaging ? (
                        <div style={{ color: C.muted, fontSize: 8.5, lineHeight: 1.4, whiteSpace: "pre-line" }}>{p.packaging}</div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td style={{ ...td("left", C.subtle), wordBreak: "break-word" }}>
                      {p.remark ? (
                        <div style={{ fontSize: 8.5, lineHeight: 1.4, whiteSpace: "pre-line" }}>{p.remark}</div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>

                  {/* Tier sub-rows */}
                  {hasTiers && p.tiers!.map((tier, ti) => (
                    <tr key={`${p.id}-t${ti}`} style={{ background: C.bg }}>
                      <td style={{ ...td("#", C.subtle), background: C.bg }}></td>
                      <td style={{ ...td("left", C.muted), background: C.bg, paddingLeft: 24 }} colSpan={4}>
                        <span style={{ fontSize: 7.5, color: C.muted }}>
                          ≥ {tier.minQty.toLocaleString("en-US")} PCS
                        </span>
                      </td>
                      <td style={{ ...td("right", C.heading, "monospace"), background: C.bg }}>
                        <span style={{ fontSize: 7, color: C.subtle }}>{quoteMeta.currency} </span>
                        <span style={{ fontSize: 8 }}>
                          {tier.price.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                        </span>
                      </td>
                      <td style={{ ...td("right", C.text), background: C.bg }}></td>
                      <td style={{ ...td("right", C.heading, "monospace"), background: C.bg }}></td>
                      <td style={{ ...td("left", C.muted), background: C.bg }}></td>
                      <td style={{ ...td("left", C.subtle), background: C.bg }}></td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>

        {/* ===== Total ===== */}
        <div style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          padding: "12px 0",
          borderTop: `2px solid ${C.accent}`,
          marginTop: 2,
          gap: 16,
        }}>
          {products.some((p) => p.tiers && p.tiers.length > 0) && (
            <span style={{ fontSize: 7.5, color: C.subtle, fontStyle: "italic" }}>
              * Some products use tiered pricing, total excludes tiered items
            </span>
          )}
          <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginRight: 24 }}>Total Amount</span>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.heading, fontFamily: "monospace" }}>
            {quoteMeta.currency} {totalAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* ===== Mold Tooling (if shown) ===== */}
      {showMold && molds.length > 0 && (
        <div style={{ flex: "0 0 auto", padding: "0 44px", marginBottom: 14 }}>
          <div style={{ ...sectionTitle() }}>Mold Tooling Cost</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: C.moldBg }}>
                <th style={th2("left")}>Mold Name</th>
                <th style={th2("right")}>Total Cost</th>
                <th style={th2("right")}>Amortized QTY</th>
                <th style={th2("right")}>Unit Cost</th>
              </tr>
            </thead>
            <tbody>
              {molds.map((m) => {
                const unitCost = m.amortizeQty > 0 ? m.totalCost / m.amortizeQty : 0;
                return (
                  <tr key={m.id}>
                    <td style={td("left", C.text)}>{m.name || "—"}</td>
                    <td style={td("right", C.text, "monospace")}>
                      $ {m.totalCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td style={td("right", C.muted)}>{m.amortizeQty.toLocaleString()} PCS</td>
                    <td style={td("right", C.accent, "monospace", 600)}>$ {unitCost.toFixed(4)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== Terms / Remarks ===== */}
      {terms.length > 0 && (
        <div style={{ flex: "0 0 auto", padding: "0 44px", marginBottom: 0 }}>
          <div style={{ ...sectionTitle() }}>Terms &amp; Remarks</div>
          <div style={{ fontSize: 9, color: C.muted, lineHeight: 1.85, whiteSpace: "pre-wrap" }}>
            {terms.map((t, idx) => (
              <div key={idx} style={{ marginBottom: t ? 0 : 4 }}>{t}</div>
            ))}
          </div>
        </div>
      )}

      {/* ===== Spacer ===== */}
      <div style={{ flex: 1, minHeight: 16, maxHeight: 48 }} />

      {/* ===== Footer / Signature ===== */}
      <div style={{ flex: "0 0 auto", padding: "0 44px 32px" }}>
        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 18 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              <tr>
                <td style={{ width: "55%", verticalAlign: "bottom", position: "relative" }}>
                  {showStamp && stampSrc && (
                    <img
                      src={stampSrc}
                      alt="Stamp"
                      style={{
                        position: "absolute",
                        left: 90,
                        top: -60,
                        width: 120,
                        height: 120,
                        opacity: 0.80,
                        transform: "rotate(-8deg)",
                        pointerEvents: "none",
                        zIndex: 2,
                      }}
                    />
                  )}
                  <div style={{ position: "relative", zIndex: 1 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: C.heading }}>{COMPANY_INFO_EN.name}</div>
                    <div style={{ fontSize: 8.5, color: C.subtle, marginTop: 2 }}>
                      Authorized Signature &amp; Stamp
                    </div>
                    <div style={{ fontSize: 8, color: C.subtle, marginTop: 4 }}>
                      Date: {quoteMeta.date}
                    </div>
                  </div>
                </td>
                <td style={{ width: "45%", verticalAlign: "bottom" }}>
                  <div style={{
                    border: `1px solid ${C.border}`,
                    borderRadius: 4,
                    padding: "14px 18px",
                  }}>
                    <div style={{ fontSize: 9, fontWeight: 600, color: C.muted, marginBottom: 8, letterSpacing: 0.5, textTransform: "uppercase" }}>
                      Customer Acceptance
                    </div>
                    <div style={{ fontSize: 8.5, color: C.subtle, marginBottom: 16 }}>Signature:</div>
                    <div style={{ fontSize: 8.5, color: C.subtle, marginBottom: 16 }}>Company Stamp:</div>
                    <div style={{ fontSize: 8.5, color: C.subtle }}>Date:</div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});

/* ===== Shared styles ===== */

function labelBadge(): React.CSSProperties {
  return {
    display: "inline-block",
    fontSize: 8,
    fontWeight: 700,
    color: C.white,
    background: C.accent,
    padding: "2px 10px",
    borderRadius: 3,
    letterSpacing: 0.8,
    marginBottom: 8,
  };
}

function infoTag(): React.CSSProperties {
  return {
    fontSize: 8.5,
    fontWeight: 500,
    color: C.muted,
    background: C.bg,
    padding: "4px 12px",
    borderRadius: 4,
    border: `1px solid ${C.border}`,
  };
}

function sectionTitle(): React.CSSProperties {
  return {
    fontSize: 10,
    fontWeight: 700,
    color: C.heading,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
    paddingBottom: 6,
    borderBottom: `1px solid ${C.border}`,
  };
}

function th(align: "left" | "right" | "#"): React.CSSProperties {
  return {
    padding: "10px 10px 10px 10px",
    textAlign: align === "#" ? "center" : align,
    fontWeight: 600,
    fontSize: 8,
    color: C.subtle,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    borderBottom: `1.5px solid ${C.border}`,
    background: C.white,
    whiteSpace: "nowrap",
  };
}

function th2(align: "left" | "right"): React.CSSProperties {
  return {
    padding: "6px 10px",
    textAlign: align,
    fontWeight: 600,
    fontSize: 8.5,
    color: C.muted,
    borderBottom: `1px solid ${C.border}`,
  };
}

function tdItem(): React.CSSProperties {
  return {
    padding: "10px 10px",
    textAlign: "left",
    color: C.heading,
    fontSize: 9.5,
    verticalAlign: "middle",
    borderBottom: `1px solid ${C.bg}`,
  };
}

function td(
  align: "left" | "right" | "#",
  color: string,
  fontFamily?: string,
  fontWeight?: number
): React.CSSProperties {
  return {
    padding: "10px 10px",
    textAlign: align === "#" ? "center" : align,
    color,
    fontSize: 9,
    verticalAlign: "middle",
    fontFamily: fontFamily || undefined,
    fontWeight: fontWeight || undefined,
    borderBottom: `1px solid ${C.bg}`,
  };
}

export default PreviewPanelIntl;
