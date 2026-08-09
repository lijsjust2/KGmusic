const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const decode = require('safe-decode-uri-component');
const { cookieToJson, randomString, getGuid, calculateMid } = require('./util/util');
const { cryptoMd5 } = require('./util/crypto');
const { createRequest } = require('./util/request');
const axios = require('axios');
const dotenv = require('dotenv');
const cache = require('./util/apicache').middleware;

/**
 * @typedef {{
 * identifier?: string,
 * route: string,
 * module: any,
 * }}ModuleDefinition
 */

/**
 * @typedef {{
 *  server?: import('http').Server,
 * }} ExpressExtension
 */

const guid = cryptoMd5(getGuid());
const serverDev = randomString(10).toUpperCase();

const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, quiet: true });
}

/**
 *  描述：动态获取模块定义
 * @param {string}  modulesPath  模块路径(TS)
 * @param {Record<string, string>} specificRoute  特定模块定义
 * @param {boolean} doRequire  如果为 true，则使用 require 加载模块, 否则打印模块路径， 默认为true
 * @return { Promise<ModuleDefinition[]> }
 * @example getModuleDefinitions("./module", {"album_new.js": "/album/create"})
 */
async function getModulesDefinitions(modulesPath, specificRoute, doRequire = true) {
  const files = await fs.promises.readdir(modulesPath);
  const parseRoute = (fileName) =>
    specificRoute && fileName in specificRoute ? specificRoute[fileName] : `/${fileName.replace(/\.(js)$/i, '').replace(/_/g, '/')}`;

  return files
    .reverse()
    .filter((fileName) => fileName.endsWith('.js') && !fileName.startsWith('_'))
    .map((fileName) => {
      const identifier = fileName.split('.').shift();
      const route = parseRoute(fileName);
      const modulePath = path.resolve(modulesPath, fileName);
      const module = doRequire ? require(modulePath) : modulePath;
      return { identifier, route, module };
    });
}

/**
 * 创建服务
 * @param {ModuleDefinition[]} moduleDefs
 * @return {Promise<import('express').Express>}
 */
async function consturctServer(moduleDefs) {
  const app = express();
  const { CORS_ALLOW_ORIGIN } = process.env;
  app.set('trust proxy', true);

  /**
   * CORS & Preflight request
   */
  app.use((req, res, next) => {
    if (req.path !== '/' && !req.path.includes('.')) {
      res.set({
        'Access-Control-Allow-Credentials': true,
        'Access-Control-Allow-Origin': CORS_ALLOW_ORIGIN || req.headers.origin || '*',
        'Access-Control-Allow-Headers': 'Authorization,X-Requested-With,Content-Type,Cache-Control',
        'Access-Control-Allow-Methods': 'PUT,POST,GET,DELETE,OPTIONS',
        'Content-Type': 'application/json; charset=utf-8',
      });
    }
    req.method === 'OPTIONS' ? res.status(204).end() : next();
  });

  // Cookie Parser
  app.use((req, _, next) => {
    req.cookies = {};
    (req.headers.cookie || '').split(/;\s+|(?<!\s)\s+$/g).forEach((pair) => {
      const crack = pair.indexOf('=');
      if (crack < 1 || crack === pair.length - 1) {
        return;
      }
      req.cookies[decode(pair.slice(0, crack)).trim()] = decode(pair.slice(crack + 1)).trim();
    });
    next();
  });

  // 将当前平台写入Cookie 以方便查看
  app.use((req, res, next) => {
    const cookies = req.cookies || {};
    const isHttps = req.protocol === 'https';
    const cookieSuffix = isHttps ? '; PATH=/; SameSite=None; Secure' : '; PATH=/';

    const ensureCookie = (key, value) => {
      if (Object.prototype.hasOwnProperty.call(cookies, key)) return;
      cookies[key] = String(value);
      res.append('Set-Cookie', `${key}=${cookies[key]}${cookieSuffix}`);
    };

    const mid = calculateMid(process.env.KUGOU_API_GUID ?? guid);
    ensureCookie('KUGOU_API_PLATFORM', process.env.platform);
    ensureCookie('KUGOU_API_MID', mid);
    ensureCookie('KUGOU_API_GUID', process.env.KUGOU_API_GUID ?? guid);
    ensureCookie('KUGOU_API_DEV', (process.env.KUGOU_API_DEV ?? serverDev).toUpperCase());
    ensureCookie('KUGOU_API_MAC', (process.env.KUGOU_API_MAC ?? '02:00:00:00:00:00').toUpperCase());

    req.cookies = cookies;

    next();
  });

  // 批量下载队列专用：body 可能携带一整张专辑的歌曲元数据，单独放大到 50MB
  // （必须写在全局 express.json 前面，让该路径优先使用大限制，解析完 req.body 后全局中间件会自动跳过）
  app.post('/fnos/queue/add', express.json({ limit: '50mb' }));

  // Body Parser（全局默认 1MB，兼顾安全与常规业务场景）
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  /**
   * Serving static files
   */
  app.use(express.static(path.join(__dirname, 'public')));

  /**
   * docs
   */

  app.use('/docs', express.static(path.join(__dirname, 'docs')));

  // ==================== 飞牛 fnOS 环境接口 ====================
  const FNOS_ENV = process.env.FNOS_ENV === 'true';
  const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || '';

  // 飞牛环境状态查询
  app.get('/fnos/status', (req, res) => {
    res.json({
      isFnos: FNOS_ENV,
      downloadDir: DOWNLOAD_DIR,
      enabled: FNOS_ENV && !!DOWNLOAD_DIR,
    });
  });

  // 仅在飞牛环境下启用服务端下载到共享目录
  if (FNOS_ENV && DOWNLOAD_DIR) {
    const sanitize = (name) => String(name || '未知')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200);

    // 下载日志辅助函数
    const logDownload = (msg) => {
      const ts = new Date().toISOString();
      const line = `[${ts}] ${msg}\n`;
      fs.promises.appendFile(path.join(DOWNLOAD_DIR, '.download.log'), line).catch(() => {});
    };

    // 确保 DOWNLOAD_DIR 可写（首次写入前调用）
    const ensureDownloadDirWritable = async () => {
      try {
        await fs.promises.access(DOWNLOAD_DIR, fs.constants.W_OK);
      } catch (e) {
        try {
          await fs.promises.chmod(DOWNLOAD_DIR, 0o777);
          await fs.promises.access(DOWNLOAD_DIR, fs.constants.W_OK);
        } catch (_) {
          logDownload(`ERROR: DOWNLOAD_DIR ${DOWNLOAD_DIR} 不可写，挂载可能未生效。文件将写入容器内部层（重启即丢失）。`);
        }
      }
    };

    // 核心下载函数：将远程 URL 流式写入共享目录（按 歌手/专辑 分类）
    // 返回 { relativePath, absPath, size }
    const downloadUrlToFile = async (url, fileName, artist, album, categorize = false) => {
      await ensureDownloadDirWritable();

      const safeFileName = sanitize(fileName);
      let dir = DOWNLOAD_DIR;
      let relativePath = safeFileName;
      if (categorize) {
        const safeArtist = sanitize(artist || '未知歌手');
        const safeAlbum = sanitize(album || '未知专辑');
        dir = path.join(DOWNLOAD_DIR, safeArtist, safeAlbum);
        relativePath = path.join(safeArtist, safeAlbum, safeFileName);
      }
      await fs.promises.mkdir(dir, { recursive: true });

      const filePath = path.join(dir, safeFileName);
      const response = await axios.get(url, { responseType: 'stream', timeout: 60000, maxRedirects: 5 });

      const writer = fs.createWriteStream(filePath);
      let writeError = null;
      writer.on('error', (err) => {
        writeError = err;
        logDownload(`ERROR: createWriteStream失败 ${filePath}: ${err.message}`);
      });
      response.data.pipe(writer);

      await new Promise((resolve, reject) => {
        writer.on('finish', () => {
          if (writeError) reject(writeError);
          else resolve();
        });
        writer.on('error', reject);
        response.data.on('error', reject);
      });

      const absPath = filePath;
      let fileSize = -1;
      try { fileSize = (await fs.promises.stat(absPath)).size; } catch (__) {}
      logDownload(`SUCCESS: 保存到本地绝对路径=${absPath} 相对路径=${relativePath} 大小=${fileSize}B`);
      console.log('[FNOS] 文件已保存:', absPath, relativePath, `${fileSize}B`);
      return { relativePath, absPath, size: fileSize };
    };

    // 单次下载接口（保留兼容，单曲及其他列表下载使用）
    app.post('/fnos/download', async (req, res) => {
      try {
        const { url, fileName, artist, album, categorize } = req.body || {};
        if (!url || !fileName) {
          return res.status(400).json({ code: 1, msg: '缺少 url 或 fileName 参数' });
        }
        const result = await downloadUrlToFile(url, fileName, artist, album, categorize);
        res.json({ code: 0, msg: '下载成功', data: { path: result.relativePath, absPath: result.absPath, size: result.size } });
      } catch (e) {
        console.error('[FNOS] 下载失败:', e.message);
        logDownload(`ERROR: 下载异常: ${e.message}`);
        res.status(500).json({ code: 1, msg: '下载失败: ' + e.message });
      }
    });

    // ==================== 下载任务队列（后台持续执行） ====================
    // 队列中的任务：pending / downloading
    // 历史任务：success / failed / cancelled
    const taskQueue = [];
    const taskHistory = [];
    const batches = new Map(); // batchId -> { authHeader, cookiesStr, addedAt, quality, delayMin, delayMax }
    let workerRunning = false;
    const MAX_HISTORY = 200;
    const QUALITY_FALLBACK_ORDER = ['flac', '320', '128'];

    // 内部调用 song/url 模块获取下载链接（带用户鉴权）
    const fetchSongUrl = async (hash, quality, authHeader, cookiesStr) => {
      const port = Number(process.env.PORT || '3000');
      const reqUrl = `http://127.0.0.1:${port}/song/url`;
      const params = { hash: String(hash || '').toLowerCase() };
      if (quality && quality !== '128') params.quality = quality;
      try {
        const resp = await axios.get(reqUrl, {
          params,
          headers: {
            ...(authHeader ? { Authorization: authHeader } : {}),
            ...(cookiesStr ? { Cookie: cookiesStr } : {}),
          },
          timeout: 30000,
        });
        return resp.data;
      } catch (e) {
        logDownload(`ERROR: 获取下载链接失败 hash=${hash} quality=${quality}: ${e.message}`);
        return null;
      }
    };

    // 带音质降级的下载（flac → 320 → 128）
    const downloadTaskWithFallback = async (task, batch) => {
      let startIdx = QUALITY_FALLBACK_ORDER.indexOf(task.quality);
      if (startIdx === -1) startIdx = 1; // 默认从 320 开始
      let lastErr = null;
      for (let i = startIdx; i < QUALITY_FALLBACK_ORDER.length; i++) {
        const q = QUALITY_FALLBACK_ORDER[i];
        try {
          const urlResp = await fetchSongUrl(task.song.hash, q, batch.authHeader, batch.cookiesStr);
          if (!urlResp || urlResp.status !== 1 || !urlResp.url || !urlResp.url[0]) {
            throw new Error(`获取 ${q} 下载链接失败`);
          }
          const downloadUrl = urlResp.url[0];
          const ext = q === 'flac' ? 'flac' : 'mp3';
          const fileName = `${task.song.name} - ${task.song.author}.${ext}`;
          const folderArtist = batch.batchArtist || task.song.author;
          const result = await downloadUrlToFile(downloadUrl, fileName, folderArtist, task.song.album, true);
          return { ...result, quality: q };
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr || new Error('所有音质尝试失败');
    };

    // 发送批次下载完成通知（PushPlus）
    const sendBatchCompletionNotification = async (batchId) => {
      const batch = batches.get(batchId);
      if (!batch || !batch.pushplusToken) return;

      // 统计数据用 batch.stats（不依赖会被裁剪的 taskHistory）
      const stats = batch.stats;
      const successCount = stats.success;
      const failedCount = stats.failed;
      const totalCount = stats.total;
      const quality = batch.quality;

      // 歌曲明细仍从 taskHistory 取（taskHistory 至少保存 MAX_HISTORY=200，
      // 对于推送来说显示最近的就够了；如果超过200首，只展示最后 200 首的明细，
      // 顶部总数是准确的）
      const batchTasks = taskHistory.filter(t => t.batchId === batchId);
      const successList = batchTasks.filter(t => t.status === 'success');
      const failedList = batchTasks.filter(t => t.status === 'failed');

      // 格式化 Markdown 内容
      let content = `## 总下载歌曲：${totalCount}首，音质${quality}\n\n`;
      content += `**成功下载${successCount}首，失败${failedCount}首**\n\n`;

      if (successList.length > 0) {
        const groups = {};
        for (const item of successList) {
          const album = item.song.album || '未知专辑';
          const safeAlbum = album.trim() || '未知专辑';
          if (!groups[safeAlbum]) groups[safeAlbum] = [];
          groups[safeAlbum].push(item.song.name);
        }
        content += `---\n\n**成功下载的明细：**\n\n`;
        let albumIndex = 1;
        for (const [albumName, songNames] of Object.entries(groups)) {
          content += `### ${albumIndex}、${albumName}\n\n`;
          songNames.forEach((name, idx) => { content += `${idx + 1}. ${name}\n`; });
          content += '\n';
          albumIndex++;
        }
      }

      if (failedList.length > 0) {
        content += `---\n\n**失败的明细：**\n\n`;
        failedList.forEach((item, index) => {
          content += `${index + 1}. ${item.song.name}`;
          if (item.error) content += ` (${item.error})`;
          content += '\n';
        });
      }

      try {
        await axios.post('http://www.pushplus.plus/send', {
          token: batch.pushplusToken,
          title: `🎵 批量下载完成`,
          content: content,
          template: 'markdown',
        }, { timeout: 15000 });
        console.log(`[PushPlus] 批次 ${batchId} 推送成功`);
      } catch (e) {
        console.error(`[PushPlus] 批次 ${batchId} 推送失败:`, e.message);
      }
      // 避免重复推送
      batch.pushplusToken = '';
    };

    // 队列 worker：循环处理 pending 任务，关闭页面/飞牛不影响（容器进程持续运行）
    const processQueue = async () => {
      if (workerRunning) return;
      workerRunning = true;
      try {
        while (true) {
          const task = taskQueue.find(t => t.status === 'pending');
          if (!task) break;

          const batch = batches.get(task.batchId);
          if (!batch) {
            task.status = 'failed';
            task.error = '批次信息丢失';
            task.finishedAt = Date.now();
            taskHistory.push(task);
            const idx = taskQueue.indexOf(task);
            if (idx >= 0) taskQueue.splice(idx, 1);
            globalCounter.totalFailed++;
            continue;
          }

          task.status = 'downloading';
          task.startedAt = Date.now();
          batch.stats.pending--;
          batch.stats.downloading++;

          try {
            const result = await downloadTaskWithFallback(task, batch);
            task.status = 'success';
            task.path = result.relativePath;
            task.quality = result.quality;
            batch.stats.downloading--;
            batch.stats.success++;
            globalCounter.totalSuccess++;
          } catch (err) {
            task.status = 'failed';
            task.error = err.message || '下载失败';
            batch.stats.downloading--;
            batch.stats.failed++;
            globalCounter.totalFailed++;
          }

          task.finishedAt = Date.now();
          taskHistory.push(task);
          const idx = taskQueue.indexOf(task);
          if (idx >= 0) taskQueue.splice(idx, 1);

          // 裁剪历史（仅用于 recent 列表展示，不影响统计）
          while (taskHistory.length > MAX_HISTORY) taskHistory.shift();

          // 检查该批次是否已全部完成（无 pending 且无 downloading）
          const batchRemaining = taskQueue.some(t => t.batchId === task.batchId && (t.status === 'pending' || t.status === 'downloading'));
          if (!batchRemaining) {
            // 该批次已完成，发送推送
            sendBatchCompletionNotification(task.batchId);
          }

          // 下一首前延时防风控
          const hasNext = taskQueue.some(t => t.status === 'pending');
          if (hasNext) {
            const dMin = Math.max(0, Math.min(10, Number(batch.delayMin) || 1));
            const dMax = Math.max(dMin, Math.min(10, Number(batch.delayMax) || 3));
            const delaySec = Math.floor(Math.random() * (dMax - dMin + 1)) + dMin;
            await new Promise(r => setTimeout(r, delaySec * 1000));
          }
        }
      } catch (e) {
        console.error('[FNOS Queue] worker 异常:', e.message);
      } finally {
        workerRunning = false;
      }
    };

    // ========== 全局计数器（不依赖 taskHistory）==========
    const globalCounter = {
      totalSuccess: 0,
      totalFailed: 0,
      totalCancelled: 0,
    };

    // 添加任务到队列
    app.post('/fnos/queue/add', async (req, res) => {
      try {
        const { songs, quality, delayMin, delayMax, pushplusToken, batchArtist } = req.body || {};
        if (!Array.isArray(songs) || songs.length === 0) {
          return res.status(400).json({ code: 1, msg: '缺少 songs 参数' });
        }
        const batchId = `b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const authHeader = req.headers['authorization'] || '';
        const cookiesStr = req.headers['cookie'] || '';
        const qualityVal = (quality && typeof quality === 'object') ? (quality.quality || '320') : (quality || '320');

        batches.set(batchId, {
          authHeader,
          cookiesStr,
          addedAt: Date.now(),
          quality: qualityVal,
          delayMin: Number(delayMin) || 1,
          delayMax: Number(delayMax) || 3,
          pushplusToken: pushplusToken || '',
          batchArtist: batchArtist || '',
          // 批次统计，不依赖 taskHistory
          stats: {
            total: 0,
            pending: 0,
            downloading: 0,
            success: 0,
            failed: 0,
            cancelled: 0,
          },
          // 为了批次名显示收集专辑信息（不依赖 taskHistory）
          albums: new Set(),
          firstAlbumName: '',
        });

        const now = Date.now();
        const allTasks = songs.map((song, i) => ({
          id: `${batchId}_${i}`,
          batchId,
          status: 'pending',
          song: {
            hash: song.hash || song.originalData?.hash || '',
            name: song.name || song.originalData?.name || '未知歌曲',
            author: song.songInfo?.author || song.author || song.singer_name || '未知歌手',
            album: song.songInfo?.album || song.album || song.album_name || '未知专辑',
          },
          quality: qualityVal,
          error: '',
          path: '',
          addedAt: now + i,
          startedAt: 0,
          finishedAt: 0,
        }));

        const totalSongs = allTasks.length;
        const tasks = allTasks.filter(t => t.song.hash); // 必须有 hash
        const skipped = totalSongs - tasks.length;

        if (tasks.length === 0) {
          batches.delete(batchId);
          return res.status(400).json({ code: 1, msg: '所有歌曲均缺少 hash，无法加入队列' });
        }

        taskQueue.push(...tasks);

        // 初始化批次统计（不依赖 taskHistory）
        const batch = batches.get(batchId);
        if (batch) {
          batch.stats.total = tasks.length;
          batch.stats.pending = tasks.length;
          tasks.forEach(t => {
            const albumName = t.song.album || '未知专辑';
            batch.albums.add(albumName);
            if (!batch.firstAlbumName) batch.firstAlbumName = albumName;
          });
        }

        // 启动 worker（如未运行）
        if (!workerRunning) {
          processQueue().catch(e => console.error('[FNOS Queue] 启动 worker 失败:', e.message));
        }

        console.log(`[FNOS Queue] 批次 ${batchId} 加入 ${tasks.length} 首（跳过 ${skipped} 首无 hash），音质 ${qualityVal}`);
        const successMsg = skipped > 0
          ? `已加入 ${tasks.length} 首，跳过 ${skipped} 首（缺少下载信息）`
          : '已加入下载队列';
        res.json({ code: 0, msg: successMsg, data: { batchId, added: tasks.length, skipped, total: tasks.length } });
      } catch (e) {
        console.error('[FNOS Queue] 加入队列失败:', e.message);
        res.status(500).json({ code: 1, msg: '加入队列失败: ' + e.message });
      }
    });

    // 查询队列状态（前端轮询，关闭页面后任务仍在后台进行）
    app.get('/fnos/queue/status', (req, res) => {
      const active = taskQueue.filter(t => t.status === 'downloading');
      const pending = taskQueue.filter(t => t.status === 'pending');
      const recent = taskHistory.slice(-100).reverse();

      // 按批次汇总：以 batches Map 里独立保存的 stats 为准（不依赖会被裁剪的 taskHistory）
      const batchesArr = [];
      // 先加入在队列中正在进行 / 等待中的批次
      const activeBatchIds = new Set();
      taskQueue.forEach(t => activeBatchIds.add(t.batchId));
      // 再加上已完成但还在 batches Map 里的批次
      batches.forEach((batch, batchId) => {
        const activeTasks = taskQueue.filter(t => t.batchId === batchId);
        const activeTask = activeTasks.find(t => t.status === 'downloading');
        batchesArr.push({
          batchId,
          total: batch.stats.total,
          pending: batch.stats.pending,
          downloading: batch.stats.downloading,
          success: batch.stats.success,
          failed: batch.stats.failed,
          cancelled: batch.stats.cancelled,
          addedAt: batch.addedAt,
          quality: batch.quality,
          firstAlbumName: batch.firstAlbumName,
          currentSongName: activeTask ? activeTask.song.name : '',
          albumCount: batch.albums.size,
          albums: Array.from(batch.albums),
        });
      });
      batchesArr.sort((a, b) => b.addedAt - a.addedAt);

      // 全局统计用 globalCounter（不依赖 taskHistory）
      const totalSuccess = globalCounter.totalSuccess;
      const totalFailed = globalCounter.totalFailed;

      res.json({
        code: 0,
        data: {
          hasTasks: taskQueue.length > 0,
          activeCount: active.length,
          pendingCount: pending.length,
          totalInQueue: taskQueue.length,
          historyCount: taskHistory.length,
          totalSuccess,
          totalFailed,
          active: active.map(t => ({ id: t.id, batchId: t.batchId, song: t.song, quality: t.quality, startedAt: t.startedAt })),
          pending: pending.map(t => ({ id: t.id, batchId: t.batchId, song: t.song, quality: t.quality })),
          recent: recent.map(t => ({ id: t.id, batchId: t.batchId, song: t.song, quality: t.quality, status: t.status, error: t.error, path: t.path, finishedAt: t.finishedAt })),
          batches: batchesArr,
        },
      });
    });

    // 取消队列任务（仅 pending 可取消，downloading 不可中断）
    app.post('/fnos/queue/cancel', (req, res) => {
      try {
        const { batchId, taskId, all } = req.body || {};
        let cancelledCount = 0;

        const cancelTask = (t) => {
          if (t.status === 'pending') {
            t.status = 'cancelled';
            t.finishedAt = Date.now();
            taskHistory.push(t);
            cancelledCount++;
            globalCounter.totalCancelled++;
            const batch = batches.get(t.batchId);
            if (batch) {
              batch.stats.pending--;
              batch.stats.cancelled++;
            }
            return true;
          }
          return false;
        };

        if (all) {
          for (let i = taskQueue.length - 1; i >= 0; i--) {
            if (cancelTask(taskQueue[i])) taskQueue.splice(i, 1);
          }
        } else if (batchId) {
          for (let i = taskQueue.length - 1; i >= 0; i--) {
            if (taskQueue[i].batchId === batchId && cancelTask(taskQueue[i])) taskQueue.splice(i, 1);
          }
        } else if (taskId) {
          const idx = taskQueue.findIndex(t => t.id === taskId);
          if (idx >= 0 && cancelTask(taskQueue[idx])) taskQueue.splice(idx, 1);
        }

        while (taskHistory.length > MAX_HISTORY) taskHistory.shift();
        res.json({ code: 0, msg: `已取消 ${cancelledCount} 个任务`, data: { cancelled: cancelledCount } });
      } catch (e) {
        res.status(500).json({ code: 1, msg: '取消失败: ' + e.message });
      }
    });

    // 清空历史记录（已完成的任务）
    app.post('/fnos/queue/clear', (req, res) => {
      const before = taskHistory.length;
      taskHistory.length = 0;
      // 同步清理 batches Map 中已全部完成且没有正在进行任务的批次
      for (const [batchId, batch] of batches.entries()) {
        const batchActive = taskQueue.some(t => t.batchId === batchId);
        if (!batchActive && batch.stats.downloading === 0 && batch.stats.pending === 0) {
          batches.delete(batchId);
        }
      }
      // 同步清零全局计数器（可选：清空历史通常意味着用户想从头计数）
      globalCounter.totalSuccess = 0;
      globalCounter.totalFailed = 0;
      globalCounter.totalCancelled = 0;
      res.json({ code: 0, msg: `已清空 ${before} 条历史`, data: { cleared: before } });
    });

    // 列出已下载的音频文件
    app.get('/fnos/downloads', async (req, res) => {
      try {
        const results = [];
        const scanDir = async (dir, depth = 0) => {
          if (depth > 3) return;
          const entries = await fs.promises.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              await scanDir(fullPath, depth + 1);
            } else if (/\.(mp3|flac)$/i.test(entry.name)) {
              const rel = path.relative(DOWNLOAD_DIR, fullPath);
              const stat = await fs.promises.stat(fullPath);
              results.push({ path: rel, name: entry.name, size: stat.size });
            }
          }
        };
        await scanDir(DOWNLOAD_DIR);
        res.json({ code: 0, data: { files: results } });
      } catch (e) {
        res.status(500).json({ code: 1, msg: '读取列表失败: ' + e.message });
      }
    });
  }

  // Cache
  app.use(cache('2 minutes', (_, res) => res.statusCode === 200));

  const moduleDefinitions = moduleDefs || (await getModulesDefinitions(path.join(__dirname, 'module'), {}));

  for (const moduleDef of moduleDefinitions) {
    app.use(moduleDef.route, async (req, res) => {
      [req.query, req.body].forEach((item) => {
        if (typeof item.cookie === 'string') {
          item.cookie = cookieToJson(decode(item.cookie));
        }
      });

      const { cookie, ...params } = req.query;

      const query = Object.assign({}, { cookie: Object.assign({}, req.cookies, cookie) }, params, { body: req.body });

      const authHeader = req.headers['authorization'];
      if (authHeader) {
        query.cookie = {
          ...query.cookie,
          ...cookieToJson(authHeader),
        };
      }
      try {
        const moduleResponse = await moduleDef.module(query, (config) => {
          let ip = req.ip;
          if (ip.substring(0, 7) === '::ffff:') {
            ip = ip.substring(7);
          }
          config.ip = ip;
          return createRequest(config);
        });

        console.log('[OK]', decode(req.originalUrl));

        const cookies = moduleResponse.cookie;
        if (!query.noCookie) {
          if (Array.isArray(cookies) && cookies.length > 0) {
            if (req.protocol === 'https') {
              // Try to fix CORS SameSite Problem
              res.append(
                'Set-Cookie',
                cookies.map((cookie) => {
                  return `${cookie}; PATH=/; SameSite=None; Secure`;
                })
              );
            } else {
              res.append(
                'Set-Cookie',
                cookies.map((cookie) => {
                  return `${cookie}; PATH=/`;
                })
              );
            }
          }
        }

        res.header(moduleResponse.headers).status(moduleResponse.status).send(moduleResponse.body);
      } catch (e) {
        const moduleResponse = e;
        console.log('[ERR]', decode(req.originalUrl), {
          status: moduleResponse.status,
          body: moduleResponse.body,
        });

        if (!moduleResponse.body) {
          res.status(404).send({
            code: 404,
            data: null,
            msg: 'Not Found',
          });
          return;
        }

        res.header(moduleResponse.headers).status(moduleResponse.status).send(moduleResponse.body);
      }
    });
  }

  return app;
}

/**
 * Serve the KG API
 * @returns {Promise<import('express').Express & ExpressExtension>}
 */
async function startService() {
  const port = Number(process.env.PORT || '3000');
  const host = process.env.HOST || '';

  const app = await consturctServer();

  /** @type {import('express').Express & ExpressExtension} */
  const appExt = app;

  appExt.service = app.listen(port, host, () => {
    console.log(`server running @ http://${host || 'localhost'}:${port}`);
  });

  return appExt;
}

module.exports = { startService, getModulesDefinitions };
