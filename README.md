<br />
<p align="center">
    <img src="./mobile/public/logo.png" alt="Logo" width="156" height="156">
  <h2 align="center" style="font-weight: 600">KGmusic</h2>

  <p align="center">
    适配移动端的开源简洁酷狗第三方播放器，支持飞牛 fnOS 一键部署
	    <br />
	本项目基于 [MoeKoeMusic/MoeKoeMusic](https://github.com/MoeKoeMusic/MoeKoeMusic) 项目修改而来，专注于移动端体验优化、后台下载队列和飞牛 NAS 生态适配。

  </p>
</p>

## 📸 界面展示

<p align="center">
  <img src="./images/10.jpg" alt="界面展示1" width="200">
  <img src="./images/12.jpg" alt="界面展示2" width="200">
  <img src="./images/13.jpg" alt="界面展示3" width="200">
  <img src="./images/15.jpg" alt="界面展示4" width="200">
</p>

<p align="center">
  <img src="./images/16.jpg" alt="界面展示5" width="200">
  <img src="./images/17.jpg" alt="界面展示6" width="200">
  <img src="./images/18.jpg" alt="界面展示7" width="200">
  <img src="./images/19.jpg" alt="界面展示8" width="200">
</p>

## 📝 项目说明

**作者：** lijsfun  
**当前版本：** v0.0.1  
**代码仓库：** https://github.com/lijsjust2/KGmusic  
**Docker 镜像：** [lijsfun/kgmusic](https://hub.docker.com/r/lijsfun/kgmusic)

### 📱 核心特性
- ✅ 使用 Vue 3 + Vite + Pinia 全家桶开发，专注移动端体验
- 🔴 酷狗账号登录支持（扫码/手机号/账号密码）
- 📃 逐字歌词 + 状态栏歌词显示
- 📻 每日推荐歌曲 / 私人 FM / 风格推荐
- 🚫🤝 纯净无社交，专注听歌
- 🔗 官方服务器直连，稳定高速
- ✔️ VIP 无损音质下载支持
- 🎨 响应式设计，完美适配各种手机屏幕
- 🔍 强大的音乐/歌手/专辑/歌单搜索
- ✔️ 实时更新的音乐排行榜
- ✔️ 丰富的歌单推荐与广场

### 💡 进阶功能（本项目新增）
- ⬇️ **后台批量下载队列**：关闭页面/浏览器/飞牛后，下载任务在服务器后台继续执行，不会中断
- 📋 **悬浮任务提醒窗**：下载中实时显示进度，支持点击查看任务详情；完成后自动变为可关闭状态
- 📁 **飞牛共享目录下载**：fnOS 环境下自动保存到共享目录，按「歌手名/专辑名」层级分类
- 📂 **下载目录自由选择**：可在「我的」页面中选择飞牛授权过的任意共享目录作为下载位置
- 🔔 **PushPlus 推送通知**：每完成一个下载任务自动发送微信/短信推送（需自行配置 Token）
- 📦 **飞牛 fpk 一键安装**：专为 fnOS 打造的应用包，开箱即用

---

## 📦️ 安装部署

### 1. 飞牛 fnOS 安装（推荐 NAS 用户）

#### 方式一：在线安装（需联网）
1. 进入飞牛应用中心，搜索 **KGmusic** 直接安装（如已上架）
2. 或下载 Release 中的 `KGmusic-<版本号>.fpk`，在应用中心选择「本地安装」
3. 安装完成后从桌面打开 KGmusic 即可使用

> 在线安装会自动从 Docker Hub 拉取 `lijsfun/kgmusic:latest` 镜像。

#### 方式二：离线安装（无网络环境）
1. 从 [GitHub Releases](https://github.com/lijsjust2/KGmusic/releases) 下载三份文件：
   - `KGmusic-<版本号>.fpk` — 飞牛安装包
   - `kgmusic-amd64-<版本号>.tar` — X86 架构镜像（如是 AMD64 设备）
   - `kgmusic-arm64-<版本号>.tar` — ARM 架构镜像（如是 ARM 设备）

2. **加载 Docker 镜像**（SSH 登录飞牛后执行）：
   ```bash
   # X86_64 设备执行
   docker load -i kgmusic-amd64-0.0.1.tar
   docker tag kgmusic:amd64-0.0.1 lijsfun/kgmusic:latest

   # ARM64 设备执行
   docker load -i kgmusic-arm64-0.0.1.tar
   docker tag kgmusic:arm64-0.0.1 lijsfun/kgmusic:latest
   ```

3. **安装 fpk**：
   - 将 `KGmusic-0.0.1.fpk` 上传到飞牛任意共享目录
   - 在飞牛应用中心 → 本地安装，选择该 fpk 文件
   - 等待安装完成后从桌面启动应用

#### 飞牛下载目录说明
| 项目 | 说明 |
|------|------|
| **默认共享目录** | `KGmusic/downloads` |
| **物理路径** | `/var/apps/KGmusic/shares/KGmusic/downloads` |
| **容器挂载路径** | `/app/downloads` |
| **文件分类** | 按「歌手名 / 专辑名 / 歌曲名」自动创建子目录 |
| **批量下载** | 通过专辑页添加的任务自动按上述结构分类 |
| **单首下载** | 保存到所选目录根路径 |

> 💡 **提示**：可在「我的 → 下载目录设置」中，选择飞牛「访问权限」里授权过的任意目录作为下载位置。点击刷新按钮可重新读取授权列表，无需重启容器。

---

### 2. Docker 部署（通用 Linux/Windows/Mac）

⚠️ 注意：部署后需开放服务器对应端口（8880/6521）才可访问，也可通过反向代理配置域名访问。

#### 方式一：从 Docker Hub 拉取镜像（推荐）
```bash
# 自动适配架构（推荐，支持 AMD64 和 ARM64）
docker pull lijsfun/kgmusic:latest

# 运行容器
docker run -d \
  --name kgmusic \
  --restart unless-stopped \
  -p 8880:8880 \
  -p 6521:6521 \
  -v /path/to/your/downloads:/app/downloads \
  lijsfun/kgmusic:latest
```

如需指定特定版本或架构：
```bash
# AMD64 架构 (x86_64) 指定版本
docker pull lijsfun/kgmusic:amd64-0.0.1

# ARM64 架构 (aarch64) 指定版本
docker pull lijsfun/kgmusic:arm64-0.0.1
```

#### 方式二：Docker Compose 快速启动
```bash
git clone https://github.com/lijsjust2/KGmusic.git
cd KGmusic
docker compose up -d --build
```

#### 方式三：手动加载离线镜像
1. 从 Release 下载对应架构的 tar 包
2. 加载并运行：
   ```bash
   # 加载镜像
   docker load -i kgmusic-amd64-0.0.1.tar   # AMD64
   docker load -i kgmusic-arm64-0.0.1.tar   # ARM64

   # 运行容器（以 AMD64 为例）
   docker run -d \
     --name kgmusic \
     --restart unless-stopped \
     -p 8880:8880 \
     -p 6521:6521 \
     -v /path/to/your/downloads:/app/downloads \
     kgmusic:amd64-0.0.1
   ```

#### Docker 部署访问地址
| 服务类型       | 访问地址                |
|----------------|-------------------------|
| 移动端前端     | `http://localhost:8880` |
| API 服务       | `http://localhost:6521` |

---

### 3. 本地开发环境

#### 3.1 克隆代码仓库
```bash
git clone https://github.com/lijsjust2/KGmusic.git
cd KGmusic
```

#### 3.2 安装项目依赖
```bash
npm run install-all
```

#### 3.3 启动服务
- 启动 API 服务
  ```bash
  npm run api
  ```

- 启动移动端开发服务器（另开一个终端）
  ```bash
  npm run mobile
  ```

#### 3.4 访问应用
| 服务类型       | 访问地址                |
|----------------|-------------------------|
| 移动端前端     | `http://localhost:8880` |
| API 服务       | `http://localhost:6521` |

---

## 📁 项目结构

```
KGmusic/
├── KuGouMusicApi/          # 后端 API 服务（酷狗接口封装 + 下载队列）
│   ├── module/             # 各酷狗 API 模块
│   ├── util/               # 工具函数库
│   ├── server.js           # 主入口（含任务队列 + FNOS API）
│   └── package.json
├── mobile/                 # 移动端前端（Vue 3 + Vite）
│   ├── components/         # Vue 组件
│   │   ├── FloatingTaskWidget.vue  # 悬浮任务提醒窗
│   │   ├── BatchDownloadManager.vue # 批量专辑下载管理
│   │   └── DownloadManager.vue      # 单首下载管理
│   ├── views/              # 页面视图
│   ├── router/             # 路由配置
│   ├── stores/             # Pinia 状态管理
│   ├── utils/
│   │   ├── fnos.js         # FNOS 飞牛 API 封装
│   │   └── pushplus.js     # PushPlus 推送封装
│   └── public/
├── fnap/                   # 飞牛 fnOS 应用包配置
│   ├── manifest            # 应用清单（版本 0.0.1，作者 lijsfun）
│   ├── cmd/                # 安装/卸载/升级回调脚本
│   ├── app/
│   │   └── docker/
│   │       └── docker-compose.yaml  # 飞牛容器编排
│   └── config/
│       ├── privilege       # 权限声明
│       └── resource        # 共享资源声明
├── .github/workflows/
│   └── docker-build.yml    # CI/CD：构建镜像 + fpk + Release
├── images/                 # 文档截图资源
├── Dockerfile              # Docker 多阶段构建文件
├── docker-compose.yml      # 通用 Docker Compose
├── docker-entrypoint.sh    # 容器入口脚本（Token 注入）
├── nginx.conf              # Nginx 前端托管配置
├── package.json            # 项目根配置
├── DOWNLOAD_GUIDE.md       # 详细下载指南
└── README.md               # 本说明文件
```

---

## ⚙️ 技术栈

| 层级 | 技术选型 |
|------|----------|
| **前端框架** | Vue 3 + Vite |
| **状态管理** | Pinia |
| **路由管理** | Vue Router |
| **样式方案** | CSS3 + Flexbox + CSS 变量主题 |
| **国际化** | 多语言 JSON（简中/繁中/英/日/韩/俄） |
| **API 服务** | Node.js + Koa |
| **任务队列** | 后端内存队列 + 独立 Worker 线程 |
| **推送通知** | PushPlus 服务（微信/短信） |
| **容器化** | Docker 多架构（AMD64 / ARM64） |
| **CI/CD** | GitHub Actions（自动构建 + Release） |
| **NAS 适配** | 飞牛 fnOS（fpk 应用 + 共享目录） |

---

## 🔔 PushPlus 推送配置

1. 前往 [PushPlus 官网](https://www.pushplus.plus/) 注册并获取个人 Token
2. 打开 KGmusic 应用，进入「我的」页面
3. 找到 **PushPlus 推送 Token** 输入框，粘贴并保存
4. 配置完成后，每完成一个专辑下载任务将自动收到推送通知

---

## ✅ 反馈与贡献

如有任何问题或建议，欢迎在 [GitHub Issues](https://github.com/lijsjust2/KGmusic/issues) 提交。  
也欢迎提交 Pull Request 参与贡献。

---

## ⚠️ 免责声明

0. 本程序是第三方音乐客户端，并非官方应用，需要更完善的功能请下载官方客户端体验。
1. 本项目仅供学习使用，请尊重版权，请勿利用此项目从事商业行为及非法用途！
2. 使用本项目的过程中可能会产生版权数据。对于这些版权数据，本项目不拥有它们的所有权。为了避免侵权，使用者务必在 24 小时内清除使用本项目的过程中所产生的版权数据。
3. 由于使用本项目产生的包括由于本协议或由于使用或无法使用本项目而引起的任何性质的任何直接、间接、特殊、偶然或结果性损害（包括但不限于因商誉损失、停工、计算机故障或故障引起的损害赔偿，或任何及所有其他商业损害或损失）由使用者负责。
4. 禁止在违反当地法律法规的情况下使用本项目。对于使用者在明知或不知当地法律法规不允许的情况下使用本项目所造成的任何违法违规行为由使用者承担，本项目不承担由此造成的任何直接、间接、特殊、偶然或结果性责任。
5. 音乐平台不易，请尊重版权，支持正版。
6. 本项目仅用于对技术可行性的探索及研究，不接受任何商业（包括但不限于广告等）合作及捐赠。
7. 如果官方音乐平台觉得本项目不妥，可联系本项目更改或移除。

---

## 📜 开源许可

本项目仅供个人学习研究使用，禁止用于商业及非法用途。

基于 [GNU General Public License v2.0 (GPL-2.0)](https://github.com/lijsjust2/KGmusic/blob/main/LICENSE) 许可进行开源。
