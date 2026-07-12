import React, { useEffect, useState, useCallback } from "react";
import "./PagedDocumentView.css";

interface PagedDocumentViewProps {
  htmlContent: string | (() => string);
  title: string;
  isActive: boolean;
}

/**
 * Efficiently converts continuous HTML content into A4 pages
 * Measures actual rendered height with correct page styling
 */
function convertToA4Pages(htmlContent: string): string[] {
  if (!htmlContent || htmlContent.trim() === "") {
    return [];
  }

  // A4 dimensions in pixels
  const A4_WIDTH_PX = 793; // 210mm at 96 DPI
  const A4_HEIGHT_PX = 1122; // 297mm at 96 DPI
  const MARGIN_PX = 56; // ~20mm margins
  const USABLE_HEIGHT_PX = A4_HEIGHT_PX - MARGIN_PX * 2; // ~1010px

  // Create a temporary wrapper to measure content
  const tempWrapper = document.createElement("div");
  tempWrapper.style.position = "fixed";
  tempWrapper.style.top = "-10000px";
  tempWrapper.style.left = "-10000px";
  tempWrapper.style.width = A4_WIDTH_PX + "px";
  tempWrapper.style.padding = MARGIN_PX + "px";
  tempWrapper.style.boxSizing = "border-box";
  tempWrapper.style.visibility = "hidden";
  tempWrapper.style.backgroundColor = "white";
  tempWrapper.style.fontFamily =
    '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
  tempWrapper.style.fontSize = "12px";
  tempWrapper.style.lineHeight = "1.6";
  tempWrapper.style.color = "#1f2937";
  tempWrapper.innerHTML = htmlContent;
  document.body.appendChild(tempWrapper);

  try {
    const pages: string[] = [];
    let currentPageContent = "";
    let currentPageHeight = 0;

    // Get all top-level elements
    const elements = Array.from(tempWrapper.children) as HTMLElement[];

    if (elements.length === 0) {
      // No structured elements, use content as-is
      return [htmlContent];
    }

    elements.forEach((element) => {
      const elementClone = element.cloneNode(true) as HTMLElement;

      // Measure this element
      const testDiv = document.createElement("div");
      testDiv.style.position = "fixed";
      testDiv.style.top = "-10000px";
      testDiv.style.left = "-10000px";
      testDiv.style.width = A4_WIDTH_PX + "px";
      testDiv.style.padding = MARGIN_PX + "px";
      testDiv.style.boxSizing = "border-box";
      testDiv.style.fontFamily =
        '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
      testDiv.style.fontSize = "12px";
      testDiv.style.lineHeight = "1.6";
      testDiv.style.color = "#1f2937";
      testDiv.appendChild(elementClone);
      document.body.appendChild(testDiv);

      const elementHeight = testDiv.offsetHeight || 100;
      document.body.removeChild(testDiv);

      // Check if element fits on current page
      if (
        currentPageHeight > 0 &&
        currentPageHeight + elementHeight > USABLE_HEIGHT_PX
      ) {
        // Start new page
        pages.push(currentPageContent);
        currentPageContent = element.outerHTML;
        currentPageHeight = elementHeight;
      } else {
        // Add to current page
        currentPageContent += element.outerHTML;
        currentPageHeight += elementHeight;
      }
    });

    // Add the last page
    if (currentPageContent.trim()) {
      pages.push(currentPageContent);
    }

    return pages.length > 0 ? pages : [htmlContent];
  } catch (error) {
    console.error("Error converting to A4 pages:", error);
    return [htmlContent]; // Fallback
  } finally {
    document.body.removeChild(tempWrapper);
  }
}

export default function PagedDocumentView({
  htmlContent,
  title,
  isActive,
}: PagedDocumentViewProps) {
  const [pages, setPages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [lastContent, setLastContent] = useState<string>("");

  // Get the actual content (either string or function)
  const getContent = useCallback(() => {
    const content =
      typeof htmlContent === "function" ? htmlContent() : htmlContent;
    return content || "";
  }, [htmlContent]);

  // Validate and cache content for debugging
  useEffect(() => {
    if (isActive) {
      const freshContent = getContent();
      setLastContent(freshContent);
    }
  }, [getContent, isActive]);

  // Convert continuous content to paged format
  useEffect(() => {
    if (!isActive) {
      setPages([]);
      return;
    }

    setIsLoading(true);

    let mounted = true;
    let retryCount = 0;
    const maxRetries = 5;

    const attemptConversion = () => {
      if (!mounted) return;

      let content = getContent();

      // If content is empty, try using lastContent as fallback
      if ((!content || content.trim() === "") && lastContent) {
        content = lastContent;
      }

      // If content is still empty and we haven't retried enough, retry after a delay
      if ((!content || content.trim() === "") && retryCount < maxRetries) {
        retryCount++;
        const delayMs = 150 * retryCount; // Exponential backoff
        setTimeout(attemptConversion, delayMs);
        return;
      }

      try {
        const convertedPages = convertToA4Pages(content);
        if (mounted) {
          setPages(convertedPages);
          setCurrentPage(1);
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Error converting to A4 pages:", error);
        if (mounted) {
          // Use lastContent or fresh content as fallback
          const fallbackContent = content || lastContent || getContent();
          setPages(fallbackContent ? [fallbackContent] : []);
          setCurrentPage(1);
          setIsLoading(false);
        }
      }
    };

    // Start the conversion after a small delay to allow content to be available
    const timer = setTimeout(attemptConversion, 150);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [htmlContent, isActive, getContent, lastContent]);

  if (!isActive) {
    return null;
  }

  if (isLoading && pages.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          color: "#94a3b8",
          fontSize: "14px",
          fontWeight: "600",
        }}
      >
        Converting to A4 pages...
      </div>
    );
  }

  return (
    <div className="paged-document-view">
      <div className="page-navigation">
        <button
          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="nav-button"
          title="Previous page"
        >
          ← Prev
        </button>

        <span className="page-counter">
          Page {currentPage} of {pages.length}
        </span>

        <button
          onClick={() =>
            setCurrentPage(Math.min(pages.length, currentPage + 1))
          }
          disabled={currentPage === pages.length}
          className="nav-button"
          title="Next page"
        >
          Next →
        </button>

        <span className="page-info">
          {pages.length > 1 ? `(${pages.length} pages total)` : "(1 page)"}
        </span>
      </div>

      <div className="pages-container">
        {pages.length > 0 ? (
          <div
            key={currentPage}
            className="a4-page"
            dangerouslySetInnerHTML={{ __html: pages[currentPage - 1] }}
          />
        ) : (
          <div className="a4-page empty">
            <span style={{ color: "#94a3b8", fontSize: "14px" }}>
              No content to display. Start editing in the document above.
            </span>
          </div>
        )}
      </div>

      <div className="pages-thumbnails">
        {pages.map((_, idx) => (
          <div
            key={idx}
            className={`page-thumbnail ${
              idx + 1 === currentPage ? "active" : ""
            }`}
            onClick={() => setCurrentPage(idx + 1)}
            title={`Go to page ${idx + 1}`}
          >
            <span className="thumbnail-number">{idx + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
