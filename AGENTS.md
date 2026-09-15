# 项目上下文

## 技术栈

- **核心**: Vite 7, TypeScript, Express
- **UI**: Tailwind CSS

## 目录结构

```
├── scripts/            # 构建与启动脚本
│   ├── build.sh        # 构建脚本
│   ├── dev.sh          # 开发环境启动脚本
│   ├── prepare.sh      # 预处理脚本
│   └── start.sh        # 生产环境启动脚本
├── server/             # 服务端逻辑
│   ├── routes/         # API 路由
│   ├── server.ts       # Express 服务入口
│   └── vite.ts         # Vite 中间件集成
├── src/                # 前端源码
│   ├── index.css       # 全局样式
│   ├── index.ts        # 客户端入口
│   ├── main.ts         # 路由 / 视图分发 / 路由守卫（登录鉴权）/ 后端持久化
│   ├── auth.ts         # 本地鉴权（localStorage，admin/123456）
│   ├── ui.ts           # 图标库 / esc / toast / 徽章
│   ├── lib.ts          # 日期 / 下载 / Excel / 预置草书签名等工具
│   ├── data/           # 类型与种子数据（types.ts / mock.ts / resourceConfig.ts 产品系统参数配置）
│   └── views/
│       ├── layout.ts          # 外壳骨架 + 顶栏/侧栏 + 登录层
│       ├── login.ts / profile.ts（含电子签名管理）
│       ├── signature.ts       # 手写签名画布 + 签名管理 + 签名转 <img>
│       ├── team.ts            # 资源明细：团队成员库 + 产品/系统参数维护
│       ├── templates.ts       # 模板中心列表 / 上传 / 预览
│       ├── template-editor.ts # 富文本编辑器（工具栏 + 字段占位符）
│       ├── template-gen.ts    # 生成文档：选项目/模板 → 填充 → 预览 → 导出 Word
│       └── template-doc.ts    # 字段定义 / 字段填充 / Word 导出 / docx 解析
├── index.html          # 入口 HTML
├── package.json        # 项目依赖管理
├── tsconfig.json       # TypeScript 配置
└── vite.config.ts      # Vite 配置
```

## 包管理规范

**仅允许使用 pnpm** 作为包管理器，**严禁使用 npm 或 yarn**。
**常用命令**：
- 安装依赖：`pnpm add <package>`
- 安装开发依赖：`pnpm add -D <package>`
- 安装所有依赖：`pnpm install`
- 移除依赖：`pnpm remove <package>`

## 开发规范

- 使用 Tailwind CSS 进行样式开发

### 编码规范

- 默认按 TypeScript `strict` 心智写代码；优先复用当前作用域已声明的变量、函数、类型和导入，禁止引用未声明标识符或拼错变量名。
- 禁止隐式 `any` 和 `as any`；函数参数、返回值、解构项、事件对象、Express `req`/`res`、`catch` 错误在使用前应有明确类型或先完成类型收窄，并清理未使用的变量和导入。
