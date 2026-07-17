# CLAUDE.md — Water Ripple

## 项目概述
全屏 WebGL 水波涟漪交互。摄像头追踪手掌，手在水面上产生逼真的波纹效果。

## 技术栈
- `@mediapipe/tasks-vision@0.10.18` HandLandmarker（同步检测，已验证稳定）
- WebGL 1.0 ping-pong FBO 水波模拟（512×512 浮点纹理）
- 经典高度场波动方程 + Blinn-Phong 光照
- 纯前端单 HTML 文件，ES module CDN 导入

## 项目结构
```
D:\camera\water-ripple\
├── CLAUDE.md
├── README.md
└── index.html
```

## 运行方式
浏览器直接打开 index.html（或通过 HTTP server），允许摄像头权限即可。

## 架构约定
- 渲染管线: SPLAT → WAVE → RENDER → SWAP（每帧 3 pass）
- 模拟纹理 512×512，RGBA float
- 双手支持（numHands: 2）
- 摄像头作为隐藏输入源，PIP 视频用于用户镜像 + MediaPipe 输入
- Canvas 自适应窗口大小

## 不会做的事
- 不加 npm、不引入构建工具
- 不用 Three.js（裸 WebGL 更小更快）
- 不搞配置页面——极简 MVP
