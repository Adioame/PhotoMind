# PhotoMind Design System
## 反AI味 · 现代极简主义设计规范

> 基于阿杰&小美的"Clean Futurism"方法论
> 目标：消除"AI味"，打造苹果级质感的照片管理体验

---

## 🎨 设计哲学

### 核心原则
1. **呼吸感优先** - 留白是设计的一部分，不是空白
2. **克制配色** - 低饱和度，高级灰为主，点缀色极少使用
3. **统一参数** - 所有圆角、间距、阴影使用系统化的令牌
4. **层次通过光影** - 用柔和的阴影和玻璃拟态创造层次，而非边框

---

## 🌈 颜色系统

### 背景色（Background）
| 名称 | 值 | 用途 |
|------|-----|------|
| `--bg-primary` | `#F5F5F7` | 页面主背景 |
| `--bg-secondary` | `#FFFFFF` | 卡片、浮层背景 |
| `--bg-tertiary` | `#FAFAFA` | 次级背景、hover状态 |
| `--bg-glass` | `rgba(255, 255, 255, 0.72)` | 玻璃拟态背景 |

### 文字色（Text）
| 名称 | 值 | 用途 |
|------|-----|------|
| `--text-primary` | `#1A1A1A` | 标题、主要文字 |
| `--text-secondary` | `#6E6E73` | 次要文字、描述 |
| `--text-tertiary` | `#A1A1A6` | 占位符、禁用状态 |
| `--text-inverse` | `#FFFFFF` | 深色背景上的文字 |

### 主色调（Primary）- 取代"AI味"紫蓝
| 名称 | 值 | 用途 |
|------|-----|------|
| `--primary-default` | `#0071E3` | 苹果蓝，用于主要操作 |
| `--primary-hover` | `#0077ED` | hover状态 |
| `--primary-pressed` | `#0068D1` | pressed状态 |
| `--primary-light` | `#E8F4FD` | 浅色背景、标签 |

### 功能色（Functional）
| 名称 | 值 | 用途 |
|------|-----|------|
| `--success` | `#34C759` | 成功状态 |
| `--warning` | `#FF9500` | 警告状态 |
| `--error` | `#FF3B30` | 错误状态 |
| `--info` | `#5E5CE6` | 信息提示（保留一点紫，但更深沉） |

### 深色模式（Dark Mode）
| 名称 | 值 |
|------|-----|
| `--bg-dark-primary` | `#000000` |
| `--bg-dark-secondary` | `#1C1C1E` |
| `--bg-dark-tertiary` | `#2C2C2E` |
| `--text-dark-primary` | `#FFFFFF` |
| `--text-dark-secondary` | `#98989D` |

---

## 📐 间距系统（Spacing）

基于 4px 栅格，使用 **"呼吸感"** 原则：宁可过大，不要过小。

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--space-xs` | 4px | 图标与文字间距 |
| `--space-sm` | 8px | 紧凑元素间距 |
| `--space-md` | 16px | 标准组件内边距 |
| `--space-lg` | 24px | 卡片内边距、区块间距 |
| `--space-xl` | 32px | 大区块分隔 |
| `--space-2xl` | 48px | 页面级间距 |
| `--space-3xl` | 64px | 主要区域分隔 |

### 组件间距规范
- **卡片内边距**: 24px (`--space-lg`)
- **网格间隙**: 16px (`--space-md`)
- **页面边距**: 24px (移动端) / 48px (桌面端)
- **导航栏高度**: 64px（增加呼吸感，原56px略显拥挤）

---

## 🔲 圆角系统（Radius）

**统一原则**: 所有组件使用一致的圆角家族

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--radius-sm` | 8px | 小按钮、标签 |
| `--radius-md` | 12px | 中等组件 |
| `--radius-lg` | 16px | 卡片、对话框（主要使用） |
| `--radius-xl` | 24px | 大卡片、模态框 |
| `--radius-full` | 9999px | 胶囊按钮、头像 |

---

## 💡 阴影系统（Shadows）

**原则**: 柔和弥散，模拟自然光照。避免生硬的黑色阴影。

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--shadow-sm` | `0 1px 2px rgba(0, 0, 0, 0.04)` | 轻微浮起 |
| `--shadow-md` | `0 4px 12px rgba(0, 0, 0, 0.05)` | 卡片默认 |
| `--shadow-lg` | `0 12px 36px rgba(0, 0, 0, 0.08)` | 悬浮卡片 |
| `--shadow-hover` | `0 20px 48px rgba(0, 0, 0, 0.12)` | hover状态 |
| `--shadow-glass` | `0 8px 32px rgba(0, 0, 0, 0.08)` | 玻璃拟态组件 |

---

## 🪟 玻璃拟态（Glass Morphism）

用于导航栏、浮动操作按钮、悬浮卡片。

```css
.glass {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
}

.glass-dark {
  background: rgba(28, 28, 30, 0.72);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
```

---

## 📝 字体系统（Typography）

### 字体栈
```css
font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
```

### 字号规范
| 令牌 | 大小 | 字重 | 行高 | 用途 |
|------|------|------|------|------|
| `--text-hero` | 32px | 700 | 1.2 | 页面大标题 |
| `--text-h1` | 24px | 600 | 1.3 | 区块标题 |
| `--text-h2` | 20px | 600 | 1.4 | 卡片标题 |
| `--text-h3` | 18px | 600 | 1.4 | 小标题 |
| `--text-body` | 16px | 400 | 1.5 | 正文 |
| `--text-small` | 14px | 400 | 1.5 | 次要文字 |
| `--text-caption` | 12px | 400 | 1.4 | 辅助说明 |

---

## 🎯 动效系统（Motion）

### 时间函数
| 令牌 | 值 | 用途 |
|------|-----|------|
| `--ease-default` | `cubic-bezier(0.4, 0, 0.2, 1)` | 标准过渡 |
| `--ease-enter` | `cubic-bezier(0, 0, 0.2, 1)` | 进入动画 |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | 退出动画 |
| `--ease-bounce` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | 弹性效果 |

### 时长规范
| 令牌 | 值 | 用途 |
|------|-----|------|
| `--duration-fast` | 150ms | 微交互 |
| `--duration-normal` | 250ms | 标准过渡 |
| `--duration-slow` | 350ms | 复杂动画 |

---

## 🧩 组件规范

### 照片卡片（Photo Card）
```
- 圆角: 16px (--radius-lg)
- 阴影: --shadow-md（默认） / --shadow-hover（hover）
- 悬停效果: scale(1.02) + 阴影加深
- 图片比例: 1:1（正方形）或自适应
- 覆盖层: 底部渐变遮罩
```

### 操作卡片（Action Card）- 首页用
```
- 圆角: 16px (--radius-lg)
- 内边距: 24px
- 背景: 白色 / 玻璃拟态
- 图标: 24px，使用主色
- 悬停: translateY(-4px) + 阴影加深
```

### 按钮（Button）
```
- 主要按钮: 填充主色，圆角 12px
- 次要按钮: 透明背景 + 边框
- 图标按钮: 40px × 40px，圆角 10px
- 悬停: 轻微放大 + 透明度变化
```

### 导航栏（Navigation）
```
- 高度: 64px
- 背景: 玻璃拟态（glass）
- Logo: 移除渐变，使用主色或单色
- 导航项: 图标 + 文字，圆角 10px
- 激活状态: 浅色背景填充
```

---

## 📱 响应式断点

| 断点 | 宽度 | 说明 |
|------|------|------|
| `mobile` | < 640px | 手机 |
| `tablet` | 640px - 1024px | 平板 |
| `desktop` | > 1024px | 桌面 |
| `wide` | > 1400px | 大屏 |

### 网格系统
- **手机**: 2列
- **平板**: 3-4列
- **桌面**: 4-6列
- **大屏**: 6-8列

---

## 🎭 情感化设计（Empty States）

### 空状态设计原则
1. **插图**: 使用柔和的线性插画，主色点缀
2. **文案**: 友好、鼓励性语言，不要冷冰冰的"暂无数据"
3. **操作**: 提供明确的下一步引导

### 示例文案
```
❌ "暂无照片"
✅ "还没有照片呢"
   "点击导入按钮，开始整理你的美好回忆吧～"
   [导入照片] [从iCloud同步]
```

---

## 🚫 禁止清单（Anti-Patterns）

| ❌ 禁止 | ✅ 替代方案 |
|--------|------------|
| 紫色/蓝紫渐变（#5E6AD2 → #8B9EFF） | 苹果蓝 #0071E3 或单色 |
| 高饱和度霓虹色 | 低饱和度高级灰 |
| 生硬的黑色阴影 | 柔和弥散阴影 |
| 尖锐的直角（0px圆角） | 统一圆角系统 |
| 元素拥挤无留白 | 呼吸感间距 |
| 默认系统组件样式 | 自定义主题覆盖 |

---

## 📚 参考系（References）

### 设计参考
- **Apple Design**: Photos App, macOS Sonoma
- **MotherDuck**: 玻璃拟态运用
- **Linear**: 极简交互, 微妙动效
- **Notion**: 信息架构, 空白运用

### 组件库参考
- **shadcn/ui**: 现代极简组件
- **21st.dev**: Tailwind 组件灵感
- **uiverse.io**: 微交互参考

---

## 🛠️ 实施清单

### 第一阶段：基础 tokens
- [ ] 创建 CSS variables 文件
- [ ] 更新主题配置
- [ ] 替换"AI味"紫蓝主色

### 第二阶段：组件重构
- [ ] 重构 GlobalNav（玻璃拟态 + 新配色）
- [ ] 重构 PhotoGrid（新阴影 + 圆角）
- [ ] 重构 ActionCard（新悬停效果）

### 第三阶段：空状态与细节
- [ ] 设计情感化空状态
- [ ] 统一加载状态
- [ ] 优化错误提示

### 第四阶段：动效与 polish
- [ ] 添加页面过渡动画
- [ ] 优化微交互
- [ ] 响应式细节调整

---

*创建日期: 2026-02-06*
*设计负责人: Sally (UX Designer)*
*版本: v1.0*
