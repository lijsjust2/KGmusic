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

    // 计算分类存储下的完整路径（与实际写入逻辑保持一致）
    // 返回 { dir, filePath, relativePath }
    const resolveDownloadPaths = (fileName, artist, album, categorize = false) => {
      const safeFileName = sanitize(fileName);
      let dir = DOWNLOAD_DIR;
      let relativePath = safeFileName;
      if (categorize) {
        const safeArtist = sanitize(artist || '未知歌手');
        const safeAlbum = sanitize(album || '未知专辑');
        dir = path.join(DOWNLOAD_DIR, safeArtist, safeAlbum);
        relativePath = path.join(safeArtist, safeAlbum, safeFileName);
      }
      const filePath = path.join(dir, safeFileName);
      return { dir, filePath, relativePath };
    };

    // 检查文件是否已存在且大小有效，返回 null 或 { relativePath, absPath, size, skipped:true }
    const checkExistingFile = async (fileName, artist, album, categorize = false) => {
      const { filePath, relativePath } = resolveDownloadPaths(fileName, artist, album, categorize);
      try {
        const st = await fs.promises.stat(filePath);
        if (st.isFile() && st.size > 0) {
          logDownload(`SKIP: 文件已存在，跳过下载 相对路径=${relativePath} 大小=${st.size}B`);
          return { relativePath, absPath: filePath, size: st.size, skipped: true };
        }
      } catch (__) {
        // 不存在就是正常情况，继续下载
      }
      return null;
    };

    // 核心下载函数：将远程 URL 流式写入共享目录（按 歌手/专辑 分类）
    // onProgress(loaded, total) 可选回调，用于实时上报下载进度
    // 返回 { relativePath, absPath, size, skipped?:true }
    const downloadUrlToFile = async (url, fileName, artist, album, categorize = false, onProgress) => {
      await ensureDownloadDirWritable();

      const { dir, filePath, relativePath } = resolveDownloadPaths(fileName, artist, album, categorize);

      // 下载前判重：已存在且大小 >0 直接跳过
      const existing = await checkExistingFile(fileName, artist, album, categorize);
      if (existing) return existing;

      await fs.promises.mkdir(dir, { recursive: true });
      const response = await axios.get(url, { responseType: 'stream', timeout: 60000, maxRedirects: 5 });

      // 从响应头读取 Content-Length 用于进度计算
      const contentLength = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedBytes = 0;
      if (onProgress && contentLength > 0) {
        response.data.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const pct = Math.min(100, Math.round((downloadedBytes / contentLength) * 100));
          onProgress(pct, downloadedBytes, contentLength);
        });
      }

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
          else {
            if (onProgress) onProgress(100, contentLength, contentLength);
            resolve();
          }
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
    const MAX_RETRY = 3;           // 每个任务最多尝试 3 次（首次 + 2 次重试）
    const RETRY_BACKOFF = [0, 10, 30]; // 第 N 次失败后等待多少秒再重试（index=0→首次失败→10秒→index=1→30秒）
    const MAX_CONCURRENT = 3;      // 最多同时下载 3 首
    let activeDownloadCount = 0;   // 当前正在 downloading 的任务数（统计用，与 batch.stats.downloading 保持同步总和）

    // 429 限流自适应：检测到酷狗返回 429 时自动拉长延迟，成功后逐步恢复
    let rateLimitBackoff = 0;      // 当前限流退避秒数（0=正常，>0=限流中）
    const RATE_LIMIT_MAX_BACKOFF = 120; // 限流时最长延迟 120 秒
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
    // task 对象的 progress 字段会被实时更新（0-100）
    const downloadTaskWithFallback = async (task, batch) => {
      let startIdx = QUALITY_FALLBACK_ORDER.indexOf(task.quality);
      if (startIdx === -1) startIdx = 1; // 默认从 320 开始
      let lastErr = null;
      for (let i = startIdx; i < QUALITY_FALLBACK_ORDER.length; i++) {
        const q = QUALITY_FALLBACK_ORDER[i];
        try {
          task.progress = 0; // 重置进度
          const urlResp = await fetchSongUrl(task.song.hash, q, batch.authHeader, batch.cookiesStr);
          if (!urlResp || urlResp.status !== 1 || !urlResp.url || !urlResp.url[0]) {
            throw new Error(`获取 ${q} 下载链接失败`);
          }
          const downloadUrl = urlResp.url[0];
          const ext = q === 'flac' ? 'flac' : 'mp3';
          const fileName = `${task.song.name} - ${task.song.author}.${ext}`;
          const onProgress = (pct) => { task.progress = pct; };
          const result = await downloadUrlToFile(downloadUrl, fileName, task.song.author, task.song.album, true, onProgress);
          task.progress = 100;
          return { ...result, quality: q };
        } catch (e) {
          task.progress = 0;
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
    // 支持：多并发（MAX_CONCURRENT）、失败自动重试（MAX_RETRY+指数退避）
    const processQueue = async () => {
      if (workerRunning) return;
      workerRunning = true;
      try {
        // 持续运行直到：没有 pending + 没有正在下载 = 所有任务结束
        while (true) {
          const now = Date.now();
          // 找到「状态是 pending 且已过退避时间」的任务，按 addedAt 顺序取
          const pickable = taskQueue
            .filter(t => t.status === 'pending' && t.retryAfter <= now)
            .sort((a, b) => a.addedAt - b.addedAt);

          const downloadingCount = taskQueue.filter(t => t.status === 'downloading').length;
          const slotsAvailable = Math.max(0, MAX_CONCURRENT - downloadingCount);

          // 取 slot 数量个任务并发执行
          const toRun = pickable.slice(0, slotsAvailable);

          // 如果没有能立刻执行的任务，说明：
          // 要么全队列为空 → 退出
          // 要么所有 pending 都在等重试冷却 → sleep 1 秒再查
          if (toRun.length === 0) {
            if (taskQueue.length === 0) break;
            // 还没到重试时间的话 sleep 1s
            await new Promise(r => setTimeout(r, 1000));
            continue;
          }

          // 并发启动所有 toRun 任务（每个任务是一个 Promise，互不阻塞）
          const workerPromises = toRun.map(task => runSingleTask(task));
          await Promise.all(workerPromises);
          // 循环继续 → 再看一遍有没有可启动的
        }
      } catch (e) {
        console.error('[FNOS Queue] worker 异常:', e.message);
      } finally {
        workerRunning = false;
      }
    };

    // 执行单个任务（含重试判断 + 状态流转 + 批量完成通知）
    const runSingleTask = async (task) => {
      const batch = batches.get(task.batchId);
      if (!batch) {
        markTaskFinished(task, 'failed', '批次信息丢失');
        globalCounter.totalFailed++;
        return;
      }

      // 状态切到 downloading
      task.status = 'downloading';
      task.startedAt = Date.now();
      task.retryCount = (task.retryCount || 0) + 1;
      batch.stats.pending--;
      batch.stats.downloading++;

      let result = null;
      let err = null;
      try {
        // 下载前判重（批量下载一律按 歌手/专辑 分类），先按各种音质看看有没有同名文件
        const categorize = true;
        const fileNameBase = `${task.song.name} - ${task.song.author}`;
        for (let i = 0; i < QUALITY_FALLBACK_ORDER.length; i++) {
          const tryQ = QUALITY_FALLBACK_ORDER[i];
          const ext = tryQ === 'flac' ? 'flac' : 'mp3';
          const hit = await checkExistingFile(`${fileNameBase}.${ext}`, task.song.author, task.song.album, categorize);
          if (hit) {
            result = { ...hit, quality: tryQ };
            break;
          }
        }
        // 没有命中已存在文件 → 正常走带音质降级的下载
        if (!result) {
          result = await downloadTaskWithFallback(task, batch);
        }
      } catch (e) {
        err = e;
      }

      if (result) {
        // 成功（或命中跳过，统一算 success）
        task.status = 'success';
        task.path = result.relativePath;
        task.quality = result.quality;
        if (result.skipped) task.error = '文件已存在，跳过下载';
        batch.stats.downloading--;
        batch.stats.success++;
        globalCounter.totalSuccess++;
        task.finishedAt = Date.now();
        pushToHistory(task);
        removeFromQueue(task);
        // 限流恢复：成功后逐步降低退避（每次成功减半，最低回到 0）
        if (rateLimitBackoff > 0) {
          rateLimitBackoff = Math.max(0, Math.floor(rateLimitBackoff / 2));
          if (rateLimitBackoff === 0) logDownload('RATE_LIMIT: 限流已恢复，延迟恢复正常');
        }
      } else if (err) {
        // 失败：判断是否还能重试
        const msg = err.message || '下载失败';
        // 检测 429 限流：错误信息含 429 或 status 为 429
        const isRateLimited = err.response?.status === 429 || /429|Too Many Requests|限流|rate.?limit/i.test(msg);
        if (isRateLimited) {
          // 拉长限流退避（翻倍，上限 120 秒）
          const newBackoff = Math.min(RATE_LIMIT_MAX_BACKOFF, Math.max(15, rateLimitBackoff * 2 || 15));
          if (newBackoff > rateLimitBackoff) {
            rateLimitBackoff = newBackoff;
            logDownload(`RATE_LIMIT: 检测到酷狗 429 限流，延迟拉长至 ${rateLimitBackoff} 秒`);
          }
        }
        task.error = msg;
        if (!task.errors) task.errors = [];
        task.errors.push({ attempt: task.retryCount, message: msg, at: Date.now() });
        if (task.retryCount < MAX_RETRY) {
          // 回到 pending，指数退避（限流时额外加上 rateLimitBackoff）
          const baseWait = RETRY_BACKOFF[task.retryCount - 1] || 60;
          const waitSec = baseWait + (isRateLimited ? rateLimitBackoff : 0);
          task.status = 'pending';
          task.retryAfter = Date.now() + waitSec * 1000;
          batch.stats.downloading--;
          batch.stats.pending++;
          logDownload(`RETRY[${task.retryCount}/${MAX_RETRY}] 任务 ${task.song.name} - ${task.song.author} 失败：${msg}，${waitSec}秒后重试`);
        } else {
          // 重试次数耗尽，永久失败
          batch.stats.downloading--;
          batch.stats.failed++;
          globalCounter.totalFailed++;
          task.finishedAt = Date.now();
          pushToHistory(task);
          removeFromQueue(task);
          logDownload(`FAIL: 任务 ${task.song.name} - ${task.song.author} 在 ${task.retryCount} 次尝试后仍失败：${msg}`);
        }
      }

      // 任务收尾后，如果批次全部结束 → 发推送
      const batchRemaining = taskQueue.some(t => t.batchId === task.batchId && (t.status === 'pending' || t.status === 'downloading'));
      if (!batchRemaining) {
        sendBatchCompletionNotification(task.batchId);
      }

      // 下一首前延时防风控（仅当确实刚下完一首非跳过的任务时生效；命中跳过则不需要延迟）
      // 限流期间额外加上 rateLimitBackoff 秒延迟
      const hasMoreWork = taskQueue.some(t => t.status === 'pending');
      if (hasMoreWork && !result?.skipped) {
        const dMin = Math.max(0, Math.min(10, Number(batch.delayMin) || 1));
        const dMax = Math.max(dMin, Math.min(10, Number(batch.delayMax) || 3));
        const delaySec = Math.floor(Math.random() * (dMax - dMin + 1)) + dMin + rateLimitBackoff;
        await new Promise(r => setTimeout(r, delaySec * 1000));
      }
    };

    // 辅助：把任务加入 history 并裁剪
    const pushToHistory = (task) => {
      taskHistory.push(task);
      while (taskHistory.length > MAX_HISTORY) taskHistory.shift();
    };

    // 辅助：把任务从 taskQueue 中移除
    const removeFromQueue = (task) => {
      const idx = taskQueue.indexOf(task);
      if (idx >= 0) taskQueue.splice(idx, 1);
    };

    // 辅助：任务遇到不可恢复错误，直接判为 finished 不入 history（兼容老代码调用点）
    const markTaskFinished = (task, status, error) => {
      task.status = status;
      task.error = error || '';
      task.finishedAt = Date.now();
      pushToHistory(task);
      removeFromQueue(task);
    };

    // ========== 全局计数器（不依赖 taskHistory）==========
    const globalCounter = {
      totalSuccess: 0,
      totalFailed: 0,
      totalCancelled: 0,
    };

    // 添加任务到队列（支持分片追加：前端传入已有 batchId 时追加到同一批次）
    app.post('/fnos/queue/add', async (req, res) => {
      try {
        const { songs, quality, delayMin, delayMax, pushplusToken, batchId: reqBatchId } = req.body || {};
        if (!Array.isArray(songs) || songs.length === 0) {
          return res.status(400).json({ code: 1, msg: '缺少 songs 参数' });
        }
        const authHeader = req.headers['authorization'] || '';
        const cookiesStr = req.headers['cookie'] || '';
        const qualityVal = (quality && typeof quality === 'object') ? (quality.quality || '320') : (quality || '320');

        // 如果前端传了已有 batchId 且 batches 中存在 → 追加模式
        let batchId;
        let isAppend = false;
        if (reqBatchId && batches.has(reqBatchId)) {
          batchId = reqBatchId;
          isAppend = true;
        } else {
          batchId = `b_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          batches.set(batchId, {
            authHeader,
            cookiesStr,
            addedAt: Date.now(),
            quality: qualityVal,
            delayMin: Number(delayMin) || 1,
            delayMax: Number(delayMax) || 3,
            pushplusToken: pushplusToken || '',
            stats: {
              total: 0,
              pending: 0,
              downloading: 0,
              success: 0,
              failed: 0,
              cancelled: 0,
            },
            albums: new Set(),
            firstAlbumName: '',
          });
        }

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
          retryCount: 0,        // 已尝试次数（首次下载=1后失败，再进来就是2、3）
          retryAfter: 0,        // 时间戳：什么时间之后才能再次被拾取（用于指数退避）
          errors: [],           // 历次失败原因，方便 UI 展示 / PushPlus 汇总
        }));

        const totalSongs = allTasks.length;
        const tasks = allTasks.filter(t => t.song.hash); // 必须有 hash
        const skipped = totalSongs - tasks.length;

        if (tasks.length === 0) {
          batches.delete(batchId);
          return res.status(400).json({ code: 1, msg: '所有歌曲均缺少 hash，无法加入队列' });
        }

        taskQueue.push(...tasks);

        // 更新批次统计（追加模式累加，首次模式初始化）
        const batch = batches.get(batchId);
        if (batch) {
          batch.stats.total += tasks.length;
          batch.stats.pending += tasks.length;
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
          currentProgress: activeTask ? (activeTask.progress || 0) : 0,
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
          active: active.map(t => ({ id: t.id, batchId: t.batchId, song: t.song, quality: t.quality, startedAt: t.startedAt, progress: t.progress || 0 })),
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
