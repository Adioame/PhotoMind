# 6. 安全架构

## 6.1 安全原则

| 原则 | 实现方式 |
|------|----------|
| **本地存储** | 所有数据存储在用户本地目录 |
| **API Key 安全** | 存储在系统 Keychain (macOS) |
| **隐私保护** | 人脸数据仅本地处理，不上传 |
| **最小权限** | Electron 仅请求必要的系统权限 |

## 6.2 API Key 管理

```typescript
// configService.ts
import { keytar } from 'keytar';

const SERVICE_NAME = 'photomind';
const ACCOUNT = 'llm-api-key';

class ConfigService {
  async setApiKey(key: string): Promise<boolean> {
    return await keytar.setPassword(SERVICE_NAME, ACCOUNT, key);
  }

  async getApiKey(): Promise<string | null> {
    return await keytar.getPassword(SERVICE_NAME, ACCOUNT);
  }
}
```

## 6.3 文件访问安全

```typescript
// 使用 sandbox-safe 的文件访问方式
async function importPhotoFolder(): Promise<void> {
  const { filePaths, canceled } = await dialog.showOpenDialog({
    properties: ['openDirectory', 'multiSelections']
  });

  if (canceled || filePaths.length === 0) return;

  // 验证路径访问权限
  for (const path of filePaths) {
    try {
      await fs.access(path, fs.constants.R_OK);
    } catch {
      throw new Error(`无权访问目录: ${path}`);
    }
  }
}
```
