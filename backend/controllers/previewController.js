const BlogSubmission = require("../models/BlogSubmission");
const { htmlToPortableText } = require("../utils/sanityPublisher");

/**
 * Generate a preview of how the blog will look on Sanity
 * Renders the content as HTML with the Sanity-compatible markup
 *
 * GET /api/admin/preview/:id
 */
exports.generatePreview = async (req, res) => {
  try {
    const { id } = req.params;
    const submission = await BlogSubmission.findById(id).lean();

    if (!submission) {
      return res.status(404).json({ success: false, message: "Submission not found" });
    }

    // Parse content — could be TipTap JSON or HTML
    let contentHtml = submission.content || "";
    if (typeof contentHtml === "object") {
      // Try to extract HTML from TipTap JSON
      contentHtml = extractTextFromTipTap(contentHtml);
    }

    // Generate Sanity Portable Text (for info)
    const portableText = htmlToPortableText(contentHtml);

    // Generate rendered preview HTML
    const previewHtml = buildPreviewHtml(submission, contentHtml);

    res.json({
      success: true,
      preview: previewHtml,
      title: submission.title,
      slug: submission.slug,
      portableTextBlocks: portableText.length,
      htmlLength: contentHtml.length,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Build a complete HTML preview document
 */
function buildPreviewHtml(submission, contentHtml) {
  const coverImage = submission.coverImage
    ? `<div class="preview-cover"><img src="${escapeHtml(submission.coverImage)}" alt="${escapeHtml(submission.coverImageAlt || submission.title)}" /></div>`
    : "";

  const tags = (submission.tags || []).length
    ? `<div class="preview-tags">${submission.tags.map((t) => `<span class="preview-tag">${escapeHtml(t)}</span>`).join("")}</div>`
    : "";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Preview: ${escapeHtml(submission.title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #f8f9fa;
      color: #1a1a2e;
      line-height: 1.7;
      padding: 40px 20px;
    }
    .preview-container {
      max-width: 740px;
      margin: 0 auto;
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
      overflow: hidden;
    }
    .preview-header {
      padding: 40px 40px 0;
    }
    .preview-category {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #6366f1;
      background: #f0f0ff;
      padding: 4px 12px;
      border-radius: 20px;
      margin-bottom: 16px;
    }
    .preview-title {
      font-size: 32px;
      font-weight: 800;
      line-height: 1.2;
      letter-spacing: -0.02em;
      color: #111;
      margin-bottom: 12px;
    }
    .preview-meta {
      font-size: 13px;
      color: #666;
      margin-bottom: 8px;
    }
    .preview-author {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 20px 0 24px;
      border-bottom: 1px solid #eee;
    }
    .preview-author-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #e0e0e0;
      overflow: hidden;
    }
    .preview-author-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .preview-author-info {
      font-size: 13px;
    }
    .preview-author-name {
      font-weight: 600;
      color: #333;
    }
    .preview-author-date {
      color: #888;
      font-size: 12px;
    }
    .preview-cover {
      margin: 0;
      overflow: hidden;
      max-height: 400px;
    }
    .preview-cover img {
      width: 100%;
      height: auto;
      object-fit: cover;
    }
    .preview-body {
      padding: 32px 40px 40px;
      font-size: 16px;
      color: #374151;
    }
    .preview-body p {
      margin-bottom: 20px;
    }
    .preview-body h2 {
      font-size: 22px;
      font-weight: 700;
      margin: 32px 0 12px;
      color: #111;
    }
    .preview-body h3 {
      font-size: 18px;
      font-weight: 600;
      margin: 24px 0 8px;
      color: #222;
    }
    .preview-body blockquote {
      border-left: 3px solid #6366f1;
      padding: 12px 20px;
      margin: 20px 0;
      background: #f9f9ff;
      font-style: italic;
      color: #555;
    }
    .preview-body pre {
      background: #1a1a2e;
      color: #e0e0e0;
      padding: 20px;
      border-radius: 12px;
      overflow-x: auto;
      font-size: 13px;
      line-height: 1.5;
      margin: 20px 0;
    }
    .preview-body code {
      font-family: 'SF Mono', 'Fira Code', monospace;
    }
    .preview-tags {
      padding: 0 40px 32px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .preview-tag {
      font-size: 12px;
      padding: 4px 12px;
      background: #f0f0f0;
      border-radius: 20px;
      color: #555;
    }
    .preview-excerpt {
      padding: 0 40px;
      font-size: 18px;
      color: #666;
      font-style: italic;
      line-height: 1.5;
      margin-bottom: 24px;
    }
    .preview-seo {
      padding: 20px 40px;
      background: #f8fafc;
      border-top: 1px solid #eee;
    }
    .preview-seo h4 {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #999;
      margin-bottom: 8px;
    }
    .preview-seo-meta-title {
      font-size: 18px;
      color: #1a0dab;
      margin-bottom: 2px;
    }
    .preview-seo-url {
      font-size: 14px;
      color: #006621;
      margin-bottom: 4px;
    }
    .preview-seo-desc {
      font-size: 13px;
      color: #545454;
    }
  </style>
</head>
<body>
  <div class="preview-container">
    <div class="preview-header">
      <span class="preview-category">${escapeHtml(submission.category || "General")}</span>
      <h1 class="preview-title">${escapeHtml(submission.title)}</h1>
      ${submission.excerpt ? `<div class="preview-excerpt">${escapeHtml(submission.excerpt)}</div>` : ""}
      <div class="preview-author">
        <div class="preview-author-avatar">
          ${submission.author?.avatar ? `<img src="${escapeHtml(submission.author.avatar)}" alt="" />` : ""}
        </div>
        <div class="preview-author-info">
          <div class="preview-author-name">${escapeHtml(submission.author?.name || "Anonymous")}</div>
          <div class="preview-author-date">
            ${submission.publishedAt ? new Date(submission.publishedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : ""}
            · ${submission.readTime || "5 min read"}
          </div>
        </div>
      </div>
    </div>
    
    ${coverImage}
    
    <div class="preview-body">
      ${contentHtml}
    </div>

    ${tags}

    ${submission.slug || submission.metaTitle ? `
    <div class="preview-seo">
      <h4>SEO Preview</h4>
      <div class="preview-seo-meta-title">${escapeHtml(submission.metaTitle || submission.title)}</div>
      <div class="preview-seo-url">contesthopper.live/blog/${escapeHtml(submission.slug || "slug")}</div>
      <div class="preview-seo-desc">${escapeHtml(submission.metaDescription || submission.excerpt || "")}</div>
    </div>
    ` : ""}
  </div>
</body>
</html>`;
}

/**
 * Simple text extraction from TipTap JSON
 */
function extractTextFromTipTap(doc) {
  if (!doc) return "";
  let html = "";
  const walk = (node) => {
    if (!node) return;
    if (node.type === "text" && node.text) {
      html += escapeHtml(node.text);
      return;
    }
    if (node.type === "paragraph") {
      html += "<p>";
      if (node.content) node.content.forEach(walk);
      html += "</p>";
      return;
    }
    if (node.type === "heading") {
      const level = node.attrs?.level || 2;
      html += `<h${level}>`;
      if (node.content) node.content.forEach(walk);
      html += `</h${level}>`;
      return;
    }
    if (node.content) {
      node.content.forEach(walk);
    }
  };
  walk(doc);
  return html || "<p>No content available</p>";
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
