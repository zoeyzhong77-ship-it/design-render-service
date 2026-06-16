/**
 * 布局 JSON → HTML 渲染引擎（标准结构）
 * 支持扁平字段结构：layer.x / layer.y / layer.width / layer.height
 * 支持图层类型：rect / text / button / image
 */

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getBox(layer) {
  const g = layer.geometry || {};
  return {
    x: toNum(layer.x ?? g.x, 0),
    y: toNum(layer.y ?? g.y, 0),
    width: toNum(layer.width ?? g.width, 100),
    height: toNum(layer.height ?? g.height, 40)
  };
}

function getBackground(layer) {
  if (layer.background) return layer.background;

  const fill = layer.fill;
  if (!fill) return "transparent";

  if (typeof fill === "string") return fill;
  if (fill.color) return fill.color;

  if (fill.type === "linear_gradient" && Array.isArray(fill.stops)) {
    const angle = fill.angle || 135;
    const stops = fill.stops.map((s) => {
      const color = s.color || "#2563EB";
      const offset = typeof s.offset === "number" ? Math.round(s.offset * 100) : 0;
      return `${color} ${offset}%`;
    });
    return `linear-gradient(${angle}deg, ${stops.join(", ")})`;
  }

  return "transparent";
}

function renderLayer(layer) {
  const box = getBox(layer);
  const zIndex = toNum(layer.zIndex ?? layer.z_index, 1);
  const opacity = layer.opacity == null ? 1 : Number(layer.opacity);

  const baseStyle = [
    "position:absolute",
    `left:${box.x}px`,
    `top:${box.y}px`,
    `width:${box.width}px`,
    `height:${box.height}px`,
    `z-index:${zIndex}`,
    `opacity:${opacity}`,
    "box-sizing:border-box"
  ].join(";");

  // rect / shape
  if (layer.type === "rect" || (layer.type === "shape" && layer.shape_type === "rect")) {
    const background = getBackground(layer);
    const radius = toNum(layer.borderRadius ?? layer.border_radius, 0);
    return `<div style="${baseStyle};background:${background};border-radius:${radius}px;"></div>`;
  }

  // text
  if (layer.type === "text") {
    const text = escapeHtml(layer.text || "");
    const fontSize = toNum(layer.fontSize ?? layer.font_size, 24);
    const fontWeight = layer.fontWeight ?? layer.font_weight ?? 400;
    const color = layer.color || "#FFFFFF";
    const lineHeight = layer.lineHeight || layer.line_height || 1.25;
    const textAlign = layer.textAlign || layer.text_align || "left";

    const justifyContent = textAlign === "center" ? "center" : textAlign === "right" ? "flex-end" : "flex-start";

    return `<div style="${baseStyle};font-size:${fontSize}px;font-weight:${fontWeight};color:${color};line-height:${lineHeight};text-align:${textAlign};display:flex;align-items:center;justify-content:${justifyContent};word-break:break-word;white-space:normal;padding:0 8px;">${text}</div>`;
  }

  // button
  if (layer.type === "button") {
    const text = escapeHtml(layer.text || "");
    const fontSize = toNum(layer.fontSize ?? layer.font_size, 16);
    const fontWeight = layer.fontWeight ?? layer.font_weight ?? 600;
    const background = layer.background || layer.fill || "#FFFFFF";
    const color = layer.color || "#2563EB";
    const radius = toNum(layer.borderRadius ?? layer.border_radius, 20);

    return `<div style="${baseStyle};background:${background};color:${color};border-radius:${radius}px;font-size:${fontSize}px;font-weight:${fontWeight};display:flex;align-items:center;justify-content:center;cursor:pointer;">${text}</div>`;
  }

  // image
  if (layer.type === "image") {
    const src = layer.source || layer.src || layer.url || "";
    if (!src) return "";
    const fit = layer.fit || "cover";
    return `<img src="${escapeHtml(src)}" style="${baseStyle};object-fit:${fit};display:block;" />`;
  }

  return "";
}

function buildHtmlFromLayout(layout) {
  const canvas = layout.canvas || {};
  const width = toNum(canvas.width, 600);
  const height = toNum(canvas.height, 300);
  const layers = Array.isArray(layout.layers) ? layout.layers : [];

  const layerHtml = layers
    .slice()
    .sort((a, b) => toNum(a.zIndex ?? a.z_index, 0) - toNum(b.zIndex ?? b.z_index, 0))
    .map(renderLayer)
    .join("\n    ");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background: transparent;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
    }
    #canvas {
      position: relative;
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      background: transparent;
    }
  </style>
</head>
<body>
  <div id="canvas">
    ${layerHtml}
  </div>
</body>
</html>`;
}

/**
 * 兼容旧接口：返回 { html, width, height }
 */
function renderLayoutToHtml(layoutJson) {
  const layout = typeof layoutJson === "string" ? JSON.parse(layoutJson) : layoutJson;
  const canvas = layout.canvas || {};
  const width = toNum(canvas.width, 600);
  const height = toNum(canvas.height, 300);
  const html = buildHtmlFromLayout(layout);
  return { html, width, height };
}

module.exports = { renderLayoutToHtml, buildHtmlFromLayout, renderLayer };
