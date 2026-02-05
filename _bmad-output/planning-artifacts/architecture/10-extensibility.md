# 10. 扩展性考虑

## 10.1 未来扩展点

| 扩展点 | 当前实现 | 未来扩展 |
|--------|----------|----------|
| **多模态搜索** | 文本 → 向量 | 图片 → 向量 (以图搜图) |
| **更多搜索代理** | 关键词 + 语义 | 时间、地点、人物代理 |
| **云端同步** | 本地存储 | iCloud / 其他云存储 |
| **协作功能** | 单用户 | 家庭共享相册 |

## 10.2 架构演进路径

```
Phase 1 (MVP)
├── 本地照片导入
├── 混合搜索 (LLM + CLIP)
└── 人物手动标记

Phase 2
├── 自动人脸识别
├── 智能相册生成
└── 搜索结果优化

Phase 3
├── 多模态搜索
├── 家庭共享
└── 云端备份
```

## 附录

### 相关文档

- PRD: `../prd/index.md`
- Epics & Stories: `../epics/index.md`
- 现有架构: `../../docs/architecture.md`

### 参考资料

- [Electron Documentation](https://www.electronjs.org/docs)
- [Vue 3 Documentation](https://vuejs.org)
- [CLIP Paper](https://openai.com/blog/clip)
- [@xenova/transformers](https://github.com/xenova/transformers.js)
- [sql.js Documentation](https://sql.js.org)
