/**
 * 布局 JSON → HTML 渲染引擎
 * 将 layers 转成绝对定位 HTML
 */

function layerToHtml(layer, canvasWidth, canvasHeight) {
  const { id, type, geometry, style = {}, content = '', source = '', role = '' } = layer;
  const { x = 0, y = 0, width = 0, height = 0 } = geometry || {};

  let html = '';
  const zIndex = style.zIndex !== undefined ? style.zIndex : 1;

  if (type === 'shape' && role === 'background') {
    // 背景图层
    let bgStyle = `position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;z-index:${zIndex};`;
    
    if (style.backgroundColor) {
      bgStyle += `background-color:${style.backgroundColor};`;
    }
    if (style.backgroundGradient) {
      bgStyle += `background:${style.backgroundGradient};`;
    }
    
    html = `<div id="${id}" class="layer-bg" style="${bgStyle}"></div>`;
  } 
  else if (type === 'image' && role === 'background') {
    // 背景图片图层
    let imgStyle = `position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;z-index:${zIndex};`;
    imgStyle += `object-fit:cover;`;
    
    html = `<img id="${id}" class="layer-bg-image" src="${source}" style="${imgStyle}" />`;
    
    // 遮罩层
    if (style.overlay) {
      const overlayColor = style.overlay.color || 'rgba(0,0,0,0.3)';
      html += `<div class="layer-overlay" style="position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;background:${overlayColor};z-index:${zIndex + 1};"></div>`;
    }
  }
  else if (type === 'text') {
    // 文本图层
    let textStyle = `position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;z-index:${zIndex};`;
    
    if (style.fontSize) textStyle += `font-size:${style.fontSize}px;`;
    if (style.fontWeight) textStyle += `font-weight:${style.fontWeight};`;
    if (style.color) textStyle += `color:${style.color};`;
    if (style.fontFamily) textStyle += `font-family:${style.fontFamily};`;
    if (style.textAlign) textStyle += `text-align:${style.textAlign};`;
    if (style.lineHeight) textStyle += `line-height:${style.lineHeight}px;`;
    
    const escapedContent = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    
    html = `<div id="${id}" class="layer-text" style="${textStyle}">${escapedContent}</div>`;
  }
  else if (type === 'button') {
    // 按钮图层
    let btnStyle = `position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;z-index:${zIndex};`;
    btnStyle += `display:flex;align-items:center;justify-content:center;`;
    btnStyle += `cursor:pointer;`;
    
    if (style.backgroundColor) btnStyle += `background-color:${style.backgroundColor};`;
    if (style.borderRadius) btnStyle += `border-radius:${style.borderRadius}px;`;
    if (style.color) btnStyle += `color:${style.color};`;
    if (style.fontSize) btnStyle += `font-size:${style.fontSize}px;`;
    if (style.fontWeight) btnStyle += `font-weight:${style.fontWeight};`;
    
    html = `<div id="${id}" class="layer-button" style="${btnStyle}">${content}</div>`;
  }
  else if (type === 'shape' && role !== 'background') {
    // 普通形状图层
    let shapeStyle = `position:absolute;left:${x}px;top:${y}px;width:${width}px;height:${height}px;z-index:${zIndex};`;
    
    if (style.backgroundColor) shapeStyle += `background-color:${style.backgroundColor};`;
    if (style.borderRadius) shapeStyle += `border-radius:${style.borderRadius}px;`;
    
    html = `<div id="${id}" class="layer-shape" style="${shapeStyle}"></div>`;
  }

  return html;
}

function renderLayoutToHtml(layoutJson) {
  const layout = typeof layoutJson === 'string' ? JSON.parse(layoutJson) : layoutJson;
  const { canvas = {}, layers = [], background = {} } = layout;
  const { width = 600, height = 200, colorMode = 'RGB' } = canvas;

  // 生成 HTML
  let layersHtml = '';
  layers.forEach(layer => {
    layersHtml += layerToHtml(layer, width, height) + '\n    ';
  });

  // 背景样式
  let canvasStyle = `position:relative;width:${width}px;height:${height}px;overflow:hidden;background:`;
  
  if (background && background.type === 'image') {
    canvasStyle += `url('${background.source}') center/cover no-repeat;`;
  } else if (background && background.type === 'solid') {
    canvasStyle += `${background.color || '#ffffff'};`;
  } else {
    canvasStyle += `#ffffff;`;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=${width}, initial-scale=1">
  <title>Design Render</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { margin: 0; padding: 0; background: #f0f0f0; }
    .render-canvas {
      ${canvasStyle}
      margin: 0 auto;
    }
    .layer-text {
      overflow: hidden;
      word-wrap: break-word;
    }
    .layer-button {
      user-select: none;
    }
  </style>
</head>
<body>
  <div class="render-canvas" style="${canvasStyle}">
    ${layersHtml}
  </div>
</body>
</html>`;

  return { html, width, height };
}

module.exports = { renderLayoutToHtml, layerToHtml };
