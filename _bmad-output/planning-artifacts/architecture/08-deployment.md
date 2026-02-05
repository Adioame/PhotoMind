# 8. 部署架构

## 8.1 macOS 应用结构

```
PhotoMind.app/
├── Contents/
│   ├── MacOS/
│   │   └── PhotoMind          # 主执行文件
│   │
│   ├── Resources/
│   │   ├── app.asar           # 打包的应用代码
│   │   ├── clip-model/        # CLIP 模型文件
│   │   ├── assets/            # UI 资源
│   │   └── locales/           # 国际化资源
│   │
│   └── Frameworks/
│       └── Electron Framework/
│
└── Info.plist
```

## 8.2 开发与构建

```bash
# 开发模式
npm run dev

# 构建生产版本
npm run build

# 仅构建主进程
npm run build:main

# 仅构建渲染进程
npm run build:renderer
```
