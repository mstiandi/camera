# CLAUDE.md — Particle Sphere

## 项目概述
全屏 3D 粒子交互，摄像头追踪手势，在球壳/玫瑰/蝴蝶三种形态之间平滑切换。
霓虹彩色粒子（赛博朋克风格），暗色渐变背景+星空。

## 技术栈
- **Three.js 0.160** — 3D 渲染（PointsMaterial + AdditiveBlending）
- **EffectComposer + UnrealBloomPass** — 霓虹发光后处理
- **MediaPipe HandLandmarker 0.10.18** — 手部 21 关键点检测
- 纯前端单 HTML 文件，ES module CDN 导入

## 手势 → 形状映射

| 手势 | 形状 | 触发条件 |
|------|------|---------|
| 🪐 默认 | 球壳 | 单手或无手 |
| 🙌 双手比心 | 🌹 玫瑰 | 两手指尖靠近（拇指距<0.09, 食指距<0.12） |
| 👐 双手张开 | 🦋 蝴蝶 | 双手 openness > 0.45 |
| 无手 1.5s+ | → 球壳 | 自动恢复 |

## 单手交互 (所有形状下可用)
- 🖐/✊ 张握 → 缩放（scale 0.5~1.0）
- ☜☞ 食指指向 → Y 轴旋转
- 快速握拳 → 冲击波环

## 粒子系统
- **球壳粒子** ×2000 — Fibonacci 球面分布
- **内部粒子** ×400 — 球体内随机分布
- **拖尾粒子** ×3 层 ghost — 延迟跟随残影
- **冲击波环** ×4 池 — TorusGeometry 霓虹环
- **背景星空** ×500 — 远距静态星点
- 所有粒子使用 Canvas 径向渐变 sprite + AdditiveBlending + Bloom

## 形状架构
`shapeTarget` 变量驱动，`shapeLerp` 平滑过渡(3.5/s)。预计算各形状的 2000+400 粒子位置。不活跃时粒子缓慢 drifts back to sphere。

## 手势检测细节
- **单手**: 比率法（指尖距腕 / PIP距腕），尺度不变；指向方向有死区（±0.015）
- **双手**: 双腕 Euclidean 距离 + 双手各自 openness 判断
- **比心**: 拇指尖+食指尖 两对距离 < 阈值
- numHands: 2
- 平滑插值过渡，防止帧间跳变

## 运行方式
```bash
cd D:\camera\particle-sphere
python -m http.server 8765
# 浏览器打开 http://127.0.0.1:8765
```
