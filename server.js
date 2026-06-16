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
 * 用 Playwright 截图 HTML 中的 #canvas 元素
 */
async function screenshotCanvas(html, imagePath, width, height) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  
  const canvasEl = await page.$('#canvas');
  if (!canvasEl) throw new Error('#canvas element not found in rendered HTML');
  
  await canvasEl.screenshot({ path: imagePath, type: 'png' });
  await browser.close();
}

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
    
    // 动态加载 renderer（避免启动时就加载失败）
    const { renderLayoutToHtml } = require('./renderer');
    
    // 1. 渲染 HTML（用于返回和预览）
    const { html, width, height } = renderLayoutToHtml(layout_json);
    
    const timestamp = Date.now();
    const pngFilename = `design-${timestamp}.png`;
    const pngPath = path.join(imagesDir, pngFilename);
    const htmlFilename = `design-${timestamp}.html`;
    const htmlPath = path.join(htmlDir, htmlFilename);
    
    // 2. 保存 HTML
    fs.writeFileSync(htmlPath, html);
    
    // 3. 用 Playwright 截图 #canvas 元素
    await screenshotCanvas(html, pngPath, width * scale, height * scale);
    
    // 4. 返回 URL（动态获取 baseUrl）
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
 * GET /health
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now(), renderer: 'playwright' });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🎨 Design Render Service (Playwright) running on port ${PORT}`);
  console.log(`📝 POST /api/render/design-image`);
  console.log(`🩺 GET  /health`);
});
