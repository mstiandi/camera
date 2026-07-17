# Water Ripple — 全屏水波交互

手掌隔空触碰水面，产生逼真涟漪。

## 运行

```bash
# 浏览器直接打开
start index.html

# 或通过 HTTP server
cd D:\camera\water-ripple
python -m http.server 8766
# 浏览器打开 http://127.0.0.1:8766
```

允许摄像头权限后，把手放到摄像头前挥动即可。

## 交互

| 手势 | 效果 |
|------|------|
| 单手/双手挥过 | 产生水波涟漪 |
| 手掌停留 | 持续波纹扩散 |
| 无手 | 水面恢复平静 |

## 技术

- MediaPipe HandLandmarker（21 个手部关键点）
- WebGL ping-pong FBO 波动方程
- Blinn-Phong 高光渲染
