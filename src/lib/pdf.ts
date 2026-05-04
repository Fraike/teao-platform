import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import type { Quotation } from "../types/quotation";

async function waitForImages(el: HTMLElement): Promise<void> {
  const images = Array.from(el.querySelectorAll("img"));

  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          img.onload = () => resolve();
          img.onerror = () => resolve();
        })
    )
  );
}

export async function exportPDF(
  previewEl: HTMLElement,
  quotation: Quotation
): Promise<void> {
  const { quoteMeta, customer } = quotation;

  await waitForImages(previewEl);

  // 在屏幕外复制一份原始 A4 节点导出，避免右侧预览缩放、阴影、滚动容器影响 html2canvas 排版。
  const exportEl = previewEl.cloneNode(true) as HTMLElement;
  Object.assign(exportEl.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    margin: "0",
    transform: "none",
    transformOrigin: "top left",
    boxShadow: "none",
    zIndex: "-1",
  });
  document.body.appendChild(exportEl);

  try {
    await waitForImages(exportEl);

    const canvas = await html2canvas(exportEl, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      scrollX: 0,
      scrollY: 0,
      windowWidth: exportEl.offsetWidth,
      windowHeight: exportEl.offsetHeight,
      width: exportEl.offsetWidth,
      height: exportEl.offsetHeight,
    });

    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const EPS = 0.8; // 避免 297.01mm 这类浮点误差生成第二页

    if (imgHeight <= pageHeight + EPS) {
      pdf.addImage(imgData, "PNG", 0, 0, imgWidth, pageHeight);
    } else {
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > EPS) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
    }

    const safeCustomer = (customer.name || "客户").replace(/[\\/:*?"<>|]/g, "_");
    const safeNo = (quoteMeta.no || "报价单").replace(/[\\/:*?"<>|]/g, "_");
    const filename = `报价单_${safeNo}_${safeCustomer}_${quoteMeta.date}.pdf`;
    pdf.save(filename);
  } finally {
    exportEl.remove();
  }
}
