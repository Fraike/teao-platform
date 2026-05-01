import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import type { Quotation } from "../types/quotation";

export async function exportPDF(
  previewEl: HTMLElement,
  quotation: Quotation
): Promise<void> {
  const { quoteMeta, customer } = quotation;

  const canvas = await html2canvas(previewEl, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
  });

  const imgData = canvas.toDataURL("image/png");

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pdfWidth;
  const imgHeight = (canvas.height * pdfWidth) / canvas.width;

  if (imgHeight <= pdfHeight) {
    pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
  } else {
    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pdfHeight;

    while (heightLeft > 0) {
      position = position - pdfHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;
    }
  }

  const filename = `Quotation_${quoteMeta.no}_${customer.name}_${quoteMeta.date}.pdf`;
  pdf.save(filename);
}
