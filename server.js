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

/**
 * POST /api/render/design-image
 * 接收 layout_json + context_pack + output_format + scale
 * 返回 PNG URL 和 HTML URL
 */
app.post('/api/render/design-image', async (req, res) => {
  try {
    const { layout_json, context_pack, output_format = 'png', scale = 2 } = req.body;
    
    if (!layout_json) {
      return res.status(400).json({ error: 'layout_json is required' });
    }
    
    // 动态加载 sharp（避免安装时依赖问题）
    const sharp = require('sharp');
    const { renderLayoutToHtml } = require('./renderer');
    
    // 1. 渲染 HTML（用于返回和预览）
    const { html, width, height } = renderLayoutToHtml(layout_json);
    
    // 2. 用 sharp 从布局 JSON 直接绘制 PNG
    const svg = layoutToSvg(layout_json);
    
    const timestamp = Date.now();
    const pngFilename = `design-${timestamp}.png`;
    const pngPath = path.join(imagesDir, pngFilename);
    const htmlFilename = `design-${timestamp}.html`;
    const htmlPath = path.join(htmlDir, htmlFilename);
    
    // 3. 保存 HTML
    fs.writeFileSync(htmlPath, html);
    
    // 4. 用 sharp 渲染 SVG → PNG
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
    res.status(500).json({
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * 将布局 JSON 转为 SVG 字符串
 */
function layoutToSvg(layoutJson) {
  const layout = typeof layoutJson === 'string' ? JSON.parse(layoutJson) : layoutJson;
  const { canvas = {}, layers = [], background = {} } = layout;
  const { width = 600, height = 200 } = canvas;
  
  // 背景色或渐变
  let bgDef = '';
  let bgRectFill = '#ffffff';
  
  if (background && background.type === 'gradient' && background.stops) {
    const gradientId = 'bgGrad';
    const stopsXml = background.stops.map((s, i) =>
      `<stop offset="${s.offset || i / (background.stops.length - 1)}" stop-color="${s.color}" />`
    ).join('');
    bgDef = `<defs><linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">${stopsXml}</linearGradient></defs>`;
    bgRectFill = `url(#${gradientId})`;
  } else if (background && background.type === 'solid') {
    bgRectFill = background.color || '#ffffff';
  } else if (canvas.background) {
    bgRectFill = canvas.background;
  }
  
  // 图层转 SVG
  const layersSvg = layers.map(layer => layerToSvg(layer)).join('\n  ');
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  ${bgDef}
  <rect width="${width}" height="${height}" fill="${bgRectFill}" />
  ${layersSvg}
</svg>`;
}

function layerToSvg(layer) {
  const { type, geometry = {}, style = {}, content = '', source = '', role = '' } = layer;
  const { x = 0, y = 0, width = 0, height = 0 } = geometry;
  
  if (type === 'text') {
    const fontSize = style.fontSize || 24;
    const color = style.color || '#000000';
    const fontWeight = style.fontWeight || 'normal';
    const fontFamily = style.fontFamily || 'Arial, sans-serif';
    const anchor = style.textAlign === 'center' ? 'middle' : style.textAlign === 'right' ? 'end' : 'start';
    const textX = anchor === 'middle' ? x + width / 2 : anchor === 'end' ? x + width : x;
    const textY = y + (height || fontSize) / 2 + fontSize / 3;
    
    return `<text x="${textX}" y="${textY}" font-size="${fontSize}" fill="${color}" font-weight="${fontWeight}" font-family="${fontFamily}" text-anchor="${anchor}">${escapeXml(content)}</text>`;
  }
  
  if (type === 'button') {
    const bgColor = style.backgroundColor || '#4F46E5';
    const textColor = style.color || '#ffffff';
    const radius = style.borderRadius || 8;
    const fontSize = style.fontSize || 16;
    const fontWeight = style.fontWeight || 'bold';
    
    return `<g>
      <rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="${bgColor}" />
      <text x="${x + width / 2}" y="${y + height / 2 + fontSize / 3}" font-size="${fontSize}" fill="${textColor}" font-weight="${fontWeight}" text-anchor="middle">${escapeXml(content)}</text>
    </g>`;
  }
  
  if (type === 'shape') {
    const fillColor = style.backgroundColor || '';
    const radius = style.borderRadius || 0;
    if (role === 'background' && style.backgroundGradient) {
      return ''; // 背景已由 canvas 处理
    }
    return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="${fillColor}" />`;
  }
  
  if (type === 'image') {
    return `<image x="${x}" y="${y}" width="${width}" height="${height}" href="${source}" preserveAspectRatio="xMidYMid slice" />
${style.overlay ? `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${style.overlay.color || 'rgba(0,0,0,0.3)'}" />` : ''}`;
  }
  
  return '';
}

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * GET /health
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now(), renderer: 'sharp-svg' });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🎨 Design Render Service v2 (Pure Node.js + Sharp) running on http://localhost:${PORT}`);
  console.log(`📝 POST /api/render/design-image`);
  console.log(`🩺 GET  /health`);
});
