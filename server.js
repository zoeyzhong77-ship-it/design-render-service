const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 确保静态文件目录存在
const staticDir = path.join(__dirname, 'static');
const htmlDir = path.join(staticDir, 'html');
const imagesDir = path.join(staticDir, 'images');
[staticDir, htmlDir, imagesDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/static', express.static(path.join(__dirname, 'static')));

// ============================================================
// 布局 JSON → HTML 渲染引擎（支持标准结构）
// ============================================================

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

function renderLayerHtml(layer) {
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

  // rect / shape 背景
  if (layer.type === "rect" || (layer.type === "shape" && layer.shape_type === "rect")) {
    const background = getBackground(layer);
    const radius = toNum(layer.borderRadius ?? layer.border_radius, 0);
    return `<div style="${baseStyle};background:${background};border-radius:${radius}px;"></div>`;
  }

  // text 文字
  if (layer.type === "text") {
    const text = escapeHtml(layer.text || layer.content || "");
    const fontSize = toNum(layer.fontSize ?? layer.font_size, 24);
    const fontWeight = layer.fontWeight ?? layer.font_weight ?? 400;
    const color = layer.color || "#FFFFFF";
    const lineHeight = layer.lineHeight || layer.line_height || 1.25;
    const textAlign = layer.textAlign || layer.text_align || "left";
    const justifyContent = textAlign === "center" ? "center" : textAlign === "right" ? "flex-end" : "flex-start";

    return `<div style="${baseStyle};font-size:${fontSize}px;font-weight:${fontWeight};color:${color};line-height:${lineHeight};text-align:${textAlign};display:flex;align-items:center;justify-content:${justifyContent};word-break:break-word;white-space:normal;padding:0 8px;">${text}</div>`;
  }

  // button 按钮
  if (layer.type === "button") {
    const text = escapeHtml(layer.text || layer.content || "");
    const fontSize = toNum(layer.fontSize ?? layer.font_size, 16);
    const fontWeight = layer.fontWeight ?? layer.font_weight ?? 600;
    const bg = layer.background || layer.fill || "#FFFFFF";
    const color = layer.color || "#2563EB";
    const radius = toNum(layer.borderRadius ?? layer.border_radius, 20);

    return `<div style="${baseStyle};background:${bg};color:${color};border-radius:${radius}px;font-size:${fontSize}px;font-weight:${fontWeight};display:flex;align-items:center;justify-content:center;cursor:pointer;">${text}</div>`;
  }

  // image 图片
  if (layer.type === "image") {
    const src = layer.source || layer.src || layer.url || "";
    if (!src) return "";
    const fit = layer.fit || "cover";
    return `<img src="${escapeHtml(src)}" style="${baseStyle};object-fit:${fit};display:block;" />`;
  }

  return "";
}

/**
 * 布局 JSON → HTML（用于预览和返回）
 */
function buildHtmlFromLayout(layout) {
  const canvas = layout.canvas || {};
  const width = toNum(canvas.width, 600);
  const height = toNum(canvas.height, 300);
  const layers = Array.isArray(layout.layers) ? layout.layers : [];

  const layerHtml = layers
    .slice()
    .sort((a, b) => toNum(a.zIndex ?? a.z_index, 0) - toNum(b.zIndex ?? b.z_index, 0))
    .map(renderLayerHtml)
    .join("\n    ");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    html, body { margin:0; padding:0; width:${width}px; height:${height}px; overflow:hidden; background:transparent; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei","WenQuanYi Micro Hei","Noto Sans SC",Arial,sans-serif; }
    #canvas { position:relative; width:${width}px; height:${height}px; overflow:hidden; background:transparent; }
  </style>
</head>
<body>
  <div id="canvas">
    ${layerHtml}
  </div>
</body>
</html>`;
}

// ============================================================
// 布局 JSON → SVG 字符串（用于 Sharp 渲染 PNG）
// ============================================================

function escapeXml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 解析 CSS 渐变字符串为 SVG gradient */
function parseGradientForSvg(cssGradient, svgId) {
  // 匹配 linear-gradient(角度, color1 pos%, color2 pos%, ...)
  const match = cssGradient.match(/linear-gradient\((\d+)deg,\s*(.+)\)/);
  if (!match) return { def: '', ref: cssGradient };

  const angle = parseInt(match[1]) || 135;
  const rawStops = match[2];
  
  // 计算方向向量
  const rad = (angle - 90) * Math.PI / 180;
  const x1 = 50 - Math.round(Math.cos(rad) * 50);
  const y1 = 50 - Math.round(Math.sin(rad) * 50);
  const x2 = 100 - x1;
  const y2 = 100 - y1;

  // 解析每个 stop
  const stopMatches = [...rawStops.matchAll(/\s*([#\w]+(?:\([^)]*\))?)\s+(\d+)%\s*/g)];
  const stopsXml = stopMatches.length > 0
    ? stopMatches.map(m => `<stop offset="${m[2]}%" stop-color="${m[1]}" />`).join('')
    : '';

  return {
    def: `<defs><linearGradient id="${svgId}" x1="${x1}%" y1="${y1}%" x2="${x2}%" y2="${y2}%">${stopsXml}</linearGradient></defs>`,
    ref: `url(#${svgId})`
  };
}

function layerToSvg(layer, defs) {
  const box = getBox(layer);
  const type = layer.type;

  if (type === "rect" || (type === "shape" && layer.shape_type === "rect")) {
    const bg = getBackground(layer);
    const radius = toNum(layer.borderRadius ?? layer.border_radius, 0);
    
    let fillRef = bg;
    if (bg.includes("linear-gradient")) {
      const gradId = `grad_${defs.count++}`;
      const parsed = parseGradientForSvg(bg, gradId);
      defs.str += parsed.def;
      fillRef = parsed.ref;
    }
    
    return `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="${radius}" ry="${radius}" fill="${fillRef}" />`;
  }

  if (type === "text") {
    const text = escapeXml(layer.text || layer.content || "");
    const fontSize = toNum(layer.fontSize ?? layer.font_size, 24);
    const fontWeight = layer.fontWeight ?? layer.font_weight ?? 400;
    const color = layer.color || "#FFFFFF";
    const textAlign = layer.textAlign || layer.text_align || "left";

    let textX = box.x;
    if (textAlign === "center") textX += box.width / 2;
    else if (textAlign === "right") textX += box.width;
    
    const anchor = textAlign === "center" ? "middle" : textAlign === "right" ? "end" : "start";
    const textY = box.y + box.height / 2 + fontSize / 3;

    return `<text x="${textX}" y="${textY}" font-size="${fontSize}" fill="${color}" font-weight="${fontWeight}" font-family="-apple-system,'PingFang SC','Microsoft YaHei','WenQuanYi Micro Hei','Noto Sans SC',Arial,sans-serif" text-anchor="${anchor}">${text}</text>`;
  }

  if (type === "button") {
    const text = escapeXml(layer.text || layer.content || "");
    const fontSize = toNum(layer.fontSize ?? layer.font_size, 16);
    const fontWeight = layer.fontWeight ?? layer.font_weight ?? 600;
    const bgColor = layer.background || layer.fill || "#FFFFFF";
    const textColor = layer.color || "#2563EB";
    const radius = toNum(layer.borderRadius ?? layer.border_radius, 20);

    return `<g>
      <rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" rx="${radius}" ry="${radius}" fill="${bgColor}" />
      <text x="${box.x + box.width / 2}" y="${box.y + box.height / 2 + fontSize / 3}" font-size="${fontSize}" fill="${textColor}" font-weight="${fontWeight}" font-family="-apple-system,'PingFang SC','Microsoft YaHei','WenQuanYi Micro Hei','Noto Sans SC',Arial,sans-serif" text-anchor="middle">${text}</text>
    </g>`;
  }

  if (type === "image") {
    const src = layer.source || layer.src || layer.url || "";
    if (!src) return "";
    return `<image x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" href="${escapeXml(src)}" preserveAspectRatio="xMidYMid slice" />`;
  }

  return "";
}

function layoutToSvg(layoutJson) {
  const layout = typeof layoutJson === "string" ? JSON.parse(layoutJson) : layoutJson;
  const canvas = layout.canvas || {};
  const width = toNum(canvas.width, 600);
  const height = toNum(canvas.height, 300);
  const layers = Array.isArray(layout.layers) ? layout.layers : [];

  const defs = { count: 0, str: '' };
  const layersSvg = layers
    .slice()
    .sort((a, b) => toNum(a.zIndex ?? a.z_index, 0) - toNum(b.zIndex ?? b.z_index, 0))
    .map(l => layerToSvg(l, defs))
    .join('\n  ');

  // Canvas 背景色
  let bgDef = '';
  let bgRectFill = '#ffffff';
  if (canvas.background) {
    if (canvas.background.includes("linear-gradient")) {
      const parsed = parseGradientForSvg(canvas.background, 'bgGrad');
      bgDef = parsed.def;
      bgRectFill = parsed.ref;
    } else {
      bgRectFill = canvas.background;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  ${bgDef}${defs.str}
  <rect width="${width}" height="${height}" fill="${bgRectFill}" />
  ${layersSvg}
</svg>`;
}

// ============================================================
// API 端点
// ============================================================

app.post('/api/render/design-image', async (req, res) => {
  try {
    const { layout_json, context_pack, output_format = 'png', scale = 2 } = req.body;

    if (!layout_json) {
      return res.status(400).json({ error: 'layout_json is required' });
    }

    // 1. 生成 HTML（用于返回和预览）
    const html = buildHtmlFromLayout(layout_json);

    // 2. 生成 SVG（用于 Sharp 转 PNG）
    const svg = layoutToSvg(layout_json);

    const timestamp = Date.now();
    const pngFilename = `design-${timestamp}.png`;
    const pngPath = path.join(imagesDir, pngFilename);
    const htmlFilename = `design-${timestamp}.html`;
    const htmlPath = path.join(htmlDir, htmlFilename);

    // 3. 保存 HTML
    fs.writeFileSync(htmlPath, html);

    // 4. 用 Sharp 将 SVG 转 PNG
    const sharp = require('sharp');
    const layout = typeof layout_json === 'string' ? JSON.parse(layout_json) : layout_json;
    const canvas = layout.canvas || {};
    const width = toNum(canvas.width, 600);
    const height = toNum(canvas.height, 300);

    await sharp(Buffer.from(svg))
      .resize(width * scale, height * scale)
      .png()
      .toFile(pngPath);

    // 5. 返回 URL
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    res.json({
      success: true,
      image_url: `${baseUrl}/static/images/${pngFilename}`,
      html_url: `${baseUrl}/static/html/${htmlFilename}`,
      canvas_width: width,
      canvas_height: height,
      scale: scale,
      output_format: output_format
    });

  } catch (error) {
    console.error('Render error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now(), renderer: 'sharp-svg-v2' });
});

app.listen(PORT, () => {
  console.log(`🎨 Design Render Service v3 running on port ${PORT}`);
});
