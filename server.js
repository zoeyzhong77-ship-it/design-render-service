const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const { renderLayoutToHtml } = require('./renderer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

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
  let browser = null;
  
  try {
    const { layout_json, context_pack, output_format = 'png', scale = 2 } = req.body;
    
    if (!layout_json) {
      return res.status(400).json({ error: 'layout_json is required' });
    }
    
    // 1. 渲染 HTML
    const { html, width, height } = renderLayoutToHtml(layout_json);
    
    // 2. 保存 HTML 到静态文件
    const timestamp = Date.now();
    const htmlFilename = `design-${timestamp}.html`;
    const htmlPath = path.join(__dirname, 'static', 'html', htmlFilename);
    fs.writeFileSync(htmlPath, html);
    
    // 3. 使用 Playwright 截图
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    const renderWidth = width * scale;
    const renderHeight = height * scale;
    
    await page.setViewportSize({ width: renderWidth, height: renderHeight });
    await page.setContent(html, { waitUntil: 'networkidle', timeout: 10000 });
    
    // 4. 截图保存 PNG
    const pngFilename = `design-${timestamp}.png`;
    const pngPath = path.join(__dirname, 'static', 'images', pngFilename);
    await page.screenshot({ path: pngPath, fullPage: false });
    
    await browser.close();
    browser = null;
    
    // 5. 返回 URL（动态获取 baseUrl）
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const imageUrl = `${baseUrl}/static/images/${pngFilename}`;
    const htmlUrl = `${baseUrl}/static/html/${htmlFilename}`;
    
    res.json({
      success: true,
      image_url: imageUrl,
      html_url: htmlUrl,
      image_path: pngPath,
      html_path: htmlPath,
      canvas_width: width,
      canvas_height: height,
      scale: scale,
      output_format: output_format
    });
    
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    
    console.error('Render error:', error);
    res.status(500).json({
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /health
 * 健康检查
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`🎨 Design Render Service running on http://localhost:${PORT}`);
  console.log(`📝 POST /api/render/design-image`);
  console.log(`🩺 GET  /health`);
});
