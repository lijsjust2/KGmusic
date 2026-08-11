# MoeKoe Music - Mobile

MoeKoe Music 的移动端独立前端项目，使用端口 8880，共用 API 服务。

## 特性

- 移动端适配的 UI 设计
- 支持三种登录方式：手机验证码、账号密码、扫码登录
- VIP 领取和升级功能
- 用户统计信息展示
- 与主项目共用 API 服务（端口 6521）

## 技术栈

- Vue 3
- Vite
- Vue Router
- Pinia (状态管理)
- Axios (HTTP 请求)

## 快速开始

### 1. 安装依赖

```bash
cd mobile
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

服务将在 `http://localhost:8880` 启动

### 3. 确保 API 服务运行

在另一个终端启动 API 服务：

```bash
cd ..
npm run api
```

API 服务将在 `http://127.0.0.1:6521` 启动

## 项目结构

```
mobile/
├── App.vue              # 根组件
├── index.html           # HTML 入口
├── main.js             # 应用入口
├── package.json         # 依赖配置
├── vite.config.js      # Vite 配置
├── components/         # 公共组件
├── layouts/           # 布局组件
├── router/            # 路由配置
├── stores/            # 状态管理
├── utils/             # 工具函数
└── views/             # 页面组件
    ├── Login.vue       # 登录页
    └── Profile.vue    # 个人主页
```

## API 配置

默认 API 地址：`http://127.0.0.1:6521`

如需修改，可在 `src/utils/apiBaseUrl.js` 中配置。

## 页面说明

### 登录页 (`/login`)

- 手机验证码登录
- 账号密码登录
- 扫码登录
- 多账号选择

### 个人主页 (`/profile`)

- 用户信息展示
- VIP 状态和领取
- 用户统计（歌单、关注、听歌记录）
- 退出登录

## 构建生产版本

```bash
npm run build
```

构建产物将输出到 `dist/` 目录。

## 注意事项

1. 本项目依赖主项目的 API 服务，请确保 API 服务正常运行
2. 移动端 UI 已针对小屏幕优化
3. 登录状态与主项目共享（使用 localStorage）
