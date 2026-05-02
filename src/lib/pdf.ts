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

  // 导出时确保截取的是 A4 白纸本身，不受外层滚动、阴影、缩放影响
  const originalTransform = previewEl.style.transform;
  const originalMargin = previewEl.style.margin;
  previewEl.style.transform = "none";
  previewEl.style.margin = "0";

  try {
    const canvas = await html2canvas(previewEl, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      scrollX: 0,
      scrollY: 0,
      windowWidth: previewEl.offsetWidth,
      windowHeight: previewEl.offsetHeight,
      width: previewEl.offsetWidth,
      height: previewEl.offsetHeight,
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
    previewEl.style.transform = originalTransform;
    previewEl.style.margin = originalMargin;
  }
}
