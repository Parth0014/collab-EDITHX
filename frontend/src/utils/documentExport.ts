import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  BorderStyle,
  VerticalAlign,
  AlignmentType,
  TextRun,
} from "docx";
import html2pdf from "html2pdf.js";

/**
 * Convert HTML editor content to DOCX format
 */
export async function exportToDOCX(
  content: string,
  title: string,
): Promise<void> {
  try {
    // Parse HTML to extract text and structure
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, "text/html");

    // Convert elements to docx paragraphs
    const paragraphs: Paragraph[] = [
      // Add title
      new Paragraph({
        text: title,
        bold: true,
        size: 32,
        spacing: { after: 240 },
      }),
    ];

    // Process all child nodes
    processHtmlNodes(doc.body.childNodes, paragraphs);

    // Create DOCX document
    const docxDoc = new DocxDocument({
      sections: [
        {
          children: paragraphs,
          properties: {
            page: {
              margins: {
                top: 1440, // 1 inch = 1440 twips
                bottom: 1440,
                left: 1440,
                right: 1440,
              },
            },
          },
        },
      ],
    });

    // Generate and download
    Packer.toBlob(docxDoc).then((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${title || "document"}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  } catch (error) {
    console.error("Error exporting to DOCX:", error);
    throw error;
  }
}

/**
 * Convert HTML editor content to PDF format
 */
export async function exportToPDF(
  htmlContent: string,
  title: string,
): Promise<void> {
  try {
    // Create a temporary container with the content
    const element = document.createElement("div");
    element.innerHTML = htmlContent;
    element.style.padding = "20px";
    element.style.fontFamily = "Arial, sans-serif";
    element.style.lineHeight = "1.5";
    element.style.color = "#000";

    // Add title
    const titleElement = document.createElement("h1");
    titleElement.textContent = title;
    titleElement.style.marginBottom = "24px";
    titleElement.style.pageBreakAfter = "avoid";
    element.insertBefore(titleElement, element.firstChild);

    // Configure html2pdf options
    const options = {
      margin: [20, 20, 20, 20], // mm margins
      filename: `${title || "document"}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] },
    };

    // Generate PDF
    await html2pdf().set(options).from(element).save();
  } catch (error) {
    console.error("Error exporting to PDF:", error);
    throw error;
  }
}

/**
 * Process HTML nodes and convert to docx paragraphs
 */
function processHtmlNodes(nodes: NodeList, paragraphs: Paragraph[]): void {
  nodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node as Text).textContent?.trim();
      if (text) {
        paragraphs.push(
          new Paragraph({
            text,
            spacing: { after: 120 },
          }),
        );
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      const tagName = element.tagName.toLowerCase();

      switch (tagName) {
        case "h1":
        case "h2":
        case "h3":
        case "h4":
        case "h5":
        case "h6":
          paragraphs.push(
            new Paragraph({
              text: element.textContent || "",
              bold: true,
              size: 28 - (parseInt(tagName[1]) * 2 || 0),
              spacing: { before: 120, after: 120 },
            }),
          );
          break;

        case "p":
          paragraphs.push(
            new Paragraph({
              text: element.textContent || "",
              spacing: { after: 120 },
            }),
          );
          break;

        case "strong":
        case "b":
          paragraphs.push(
            new Paragraph({
              text: element.textContent || "",
              bold: true,
              spacing: { after: 120 },
            }),
          );
          break;

        case "em":
        case "i":
          paragraphs.push(
            new Paragraph({
              text: element.textContent || "",
              italics: true,
              spacing: { after: 120 },
            }),
          );
          break;

        case "ul":
        case "ol":
          processListItems(element, paragraphs, tagName === "ol");
          break;

        case "blockquote":
          paragraphs.push(
            new Paragraph({
              text: element.textContent || "",
              indent: { left: 720 },
              spacing: { before: 120, after: 120 },
            }),
          );
          break;

        case "pre":
        case "code":
          paragraphs.push(
            new Paragraph({
              text: element.textContent || "",
              font: "Courier New",
              spacing: { after: 120 },
            }),
          );
          break;

        case "img":
          // Note: Image handling in docx requires base64 or URL
          const imgElement = element as HTMLImageElement;
          paragraphs.push(
            new Paragraph({
              text: `[Image: ${imgElement.alt || "image"}]`,
              spacing: { after: 120 },
            }),
          );
          break;

        default:
          // For unknown tags, process children
          processHtmlNodes(element.childNodes, paragraphs);
      }
    }
  });
}

/**
 * Process list items (ul/ol)
 */
function processListItems(
  listElement: HTMLElement,
  paragraphs: Paragraph[],
  isOrdered: boolean,
): void {
  let itemNumber = 1;
  listElement.querySelectorAll(":scope > li").forEach((li) => {
    const prefix = isOrdered ? `${itemNumber}. ` : "• ";
    paragraphs.push(
      new Paragraph({
        text: prefix + (li.textContent || ""),
        indent: { left: 720 },
        spacing: { after: 80 },
      }),
    );
    itemNumber++;
  });
}

/**
 * Get editor content as clean HTML
 */
export function getEditorHTML(editorElement: HTMLElement): string {
  // Clone the editor content
  const clone = editorElement.cloneNode(true) as HTMLElement;

  // Remove collaborative cursors and other UI elements
  clone.querySelectorAll("[data-placeholder]").forEach((el) => {
    el.removeAttribute("data-placeholder");
  });

  clone.querySelectorAll(".collaboration-cursor").forEach((el) => {
    el.remove();
  });

  return clone.innerHTML;
}
