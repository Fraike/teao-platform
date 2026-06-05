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

async function doExportPDF(
  previewEl: HTMLElement,
  quotation: Quotation,
  labels: { defaultCustomer: string; defaultNo: string; filenamePrefix: string }
): Promise<void> {
  const { quoteMeta, customer } = quotation;

  await waitForImages(previewEl);

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
    const EPS = 0.8;

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

    const safeCustomer = (customer.name || labels.defaultCustomer).replace(/[\\/:*?"<>|]/g, "_");
    const safeNo = (quoteMeta.no || labels.defaultNo).replace(/[\\/:*?"<>|]/g, "_");
    const filename = `${labels.filenamePrefix}_${safeNo}_${safeCustomer}_${quoteMeta.date}.pdf`;
    pdf.save(filename);
  } finally {
    exportEl.remove();
  }
}

export async function exportPDF(previewEl: HTMLElement, quotation: Quotation): Promise<void> {
  return doExportPDF(previewEl, quotation, {
    defaultCustomer: "客户",
    defaultNo: "报价单",
    filenamePrefix: "报价单",
  });
}

export async function exportPDFIntl(previewEl: HTMLElement, quotation: Quotation): Promise<void> {
  return doExportPDF(previewEl, quotation, {
    defaultCustomer: "Customer",
    defaultNo: "Quotation",
    filenamePrefix: "Quotation",
  });
}
