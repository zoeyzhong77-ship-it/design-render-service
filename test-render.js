const http = require('http');

const layoutJson = {
  "canvas": {
    "width": 1240,
    "height": 180,
    "colorMode": "RGB"
  },
  "background": {
    "type": "solid",
    "color": "#1a365d"
  },
  "layers": [
    {
      "id": "bg-shape",
      "type": "shape",
      "role": "background",
      "geometry": {"x": 0, "y": 0, "width": 1240, "height": 180},
      "style": {"backgroundColor": "#1a365d", "zIndex": 0}
    },
    {
      "id": "title-text",
      "type": "text",
      "geometry": {"x": 32, "y": 40, "width": 600, "height": 50},
      "style": {"fontSize": 32, "fontWeight": "bold", "color": "#ffffff", "fontFamily": "PingFang SC, sans-serif", "zIndex": 2},
      "content": "环球旅讯峰会 2026"
    },
    {
      "id": "subtitle-text",
      "type": "text",
      "geometry": {"x": 32, "y": 95, "width": 600, "height": 30},
      "style": {"fontSize": 16, "color": "#cbd5e1", "fontFamily": "PingFang SC, sans-serif", "zIndex": 2},
      "content": "探索AI时代的旅游创新"
    },
    {
      "id": "cta-button",
      "type": "button",
      "geometry": {"x": 1000, "y": 65, "width": 180, "height": 50},
      "style": {"backgroundColor": "#d4a574", "color": "#ffffff", "fontSize": 18, "fontWeight": "bold", "borderRadius": 25, "zIndex": 2},
      "content": "立即报名"
    }
  ]
};

const postData = JSON.stringify({
  layout_json: layoutJson,
  scale: 2
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/render/design-image',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
  });
});

req.on('error', (e) => {
  console.error('Error:', e.message);
});

req.write(postData);
req.end();
