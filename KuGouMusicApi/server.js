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

  // ========== 酷狗风控 dfid 注册（全局，飞牛与非飞牛环境共用）==========
  // 根因：/song/url 接口必须携带通过 /register/dev 注册的真实 dfid
  // 否则会返回 errcode=20028 status=0 error="本次请求需要验证"
  // 做法：服务端主动调用本地 /register/dev 获取合法 dfid，并全局缓存
  const DFID_CACHE_MAX_AGE = 1000 * 60 * 60 * 12; // 12 小时缓存，避免每次重新注册
  // 熔断：连续 N 次 20028 后熔断，避免加剧风控（可能是 IP/账号被风控，换 dfid 无用）
  const DFID_CIRCUIT_FAIL_THRESHOLD = 3;
  const DFID_CIRCUIT_COOLDOWN = 1000 * 60 * 5; // 熔断后冷却 5 分钟
  const dfidCache = {
    value: '',
    updatedAt: 0,
    lock: Promise.resolve(),
    currentGuid: '',     // 上次注册用的 GUID，便于重试时换新
    failCount: 0,        // 连续 20028 失败次数
    lastFailAt: 0,       // 最近一次失败时间
  };

  // dfid 日志：有 DOWNLOAD_DIR 时落盘到 .download.log，否则只走 console
  const logDfid = (msg) => {
    const ts = new Date().toISOString();
    console.log(`[DFID] ${msg}`);
    if (DOWNLOAD_DIR) {
      fs.promises.appendFile(path.join(DOWNLOAD_DIR, '.download.log'), `[${ts}] ${msg}\n`).catch(() => {});
    }
  };

  /**
   * 解析 Set-Cookie 数组，找到 dfid=xxx 的值
   * @param {string[]|undefined} setCookies
   * @returns {string}
   */
  const pickDfidFromSetCookies = (setCookies) => {
    if (!Array.isArray(setCookies) || setCookies.length === 0) return '';
    for (const raw of setCookies) {
      const m = /(?:^|;\s*)dfid=([^;]+)/i.exec(raw);
      if (m) return m[1];
    }
    return '';
  };

  /**
   * 判断响应是否为 dfid 风控（20028 或 "需要验证"）
   */
  const isNeedVerifyError = (body) => {
    if (!body) return false;
    const errcode = body.errcode ?? body.error_code;
    if (errcode === 20028) return true;
    if (body.status === 0 && typeof body.error === 'string' && body.error.includes('需要验证')) return true;
    return false;
  };

  /**
   * 判断响应是否为登录失效（status==2），此情况换 dfid 无用，需要前端重新登录
   */
  const isLoginExpired = (body) => {
    if (!body) return false;
    return body.status === 2;
  };

  /**
   * 记录 dfid 风控失败（用于熔断计数）
   */
  const recordDfidFailure = () => {
    dfidCache.failCount += 1;
    dfidCache.lastFailAt = Date.now();
    logDfid(`风控失败累计 ${dfidCache.failCount} 次`);
  };

  /**
   * 记录 dfid 成功（清零计数）
   */
  const recordDfidSuccess = () => {
    if (dfidCache.failCount > 0) {
      dfidCache.failCount = 0;
    }
  };

  /**
   * 是否处于熔断期（连续失败超阈值且在冷却期内）
   */
  const isCircuitOpen = () => {
    if (dfidCache.failCount < DFID_CIRCUIT_FAIL_THRESHOLD) return false;
    if (Date.now() - dfidCache.lastFailAt > DFID_CIRCUIT_COOLDOWN) {
      // 冷却期过，自动半开（允许再次尝试）
      dfidCache.failCount = 0;
      return false;
    }
    return true;
  };

  /**
   * 确保持有已注册的合法 dfid（带 12 小时缓存 + 并发串行化）
   * @param {boolean} forceRefresh 强制重新注册（换新 GUID，避免拿到相同失效 dfid）
   * @returns {Promise<string>}
   */
  const ensureRegisteredDfid = async (forceRefresh = false) => {
    // 熔断期：直接返回空，避免加剧风控
    if (!forceRefresh && isCircuitOpen()) {
      logDfid(`熔断中，跳过注册（连续失败 ${dfidCache.failCount} 次，冷却至 ${new Date(dfidCache.lastFailAt + DFID_CIRCUIT_COOLDOWN).toISOString()}）`);
      return dfidCache.value;
    }
    const now = Date.now();
    if (!forceRefresh && dfidCache.value && now - dfidCache.updatedAt < DFID_CACHE_MAX_AGE) {
      return dfidCache.value;
    }
    // 串行化：并发只执行一次注册
    dfidCache.lock = dfidCache.lock.then(async () => {
      // 进入锁后再次检查（可能已有并发请求完成了注册）
      if (!forceRefresh && dfidCache.value && Date.now() - dfidCache.updatedAt < DFID_CACHE_MAX_AGE) {
        return dfidCache.value;
      }
      // 强制刷新时换新 GUID，避免相同 GUID 拿到相同失效 dfid
      const apiGuid = forceRefresh
        ? cryptoMd5(getGuid())
        : (dfidCache.currentGuid || process.env.KUGOU_API_GUID || guid);
      const port = Number(process.env.PORT || '3000');
      try {
        const resp = await axios.get(`http://127.0.0.1:${port}/register/dev`, {
          headers: { Cookie: `KUGOU_API_GUID=${apiGuid}` },
          timeout: 15000,
        });
        const dfid = pickDfidFromSetCookies(resp.headers['set-cookie'])
          || (resp.data && resp.data.data && resp.data.data.dfid)
          || (resp.data && resp.data.body && resp.data.body.data && resp.data.body.data.dfid)
          || '';
        if (dfid) {
          dfidCache.value = String(dfid);
          dfidCache.updatedAt = Date.now();
          dfidCache.currentGuid = apiGuid;
          logDfid(`注册成功 dfid=${dfidCache.value} guid=${apiGuid.slice(0, 8)}...${forceRefresh ? '(强制刷新)' : ''}`);
          return dfidCache.value;
        }
        logDfid(`/register/dev 未返回 dfid body=${JSON.stringify(resp.data).slice(0, 300)}`);
      } catch (e) {
        logDfid(`/register/dev 调用异常: ${e.message}`);
      }
      return dfidCache.value;
    }).catch((e) => {
      logDfid(`注册锁异常: ${e.message}`);
      return dfidCache.value;
    });
    return await dfidCache.lock;
  };

  /**
   * 将 cookies 字符串中 dfid 强制替换为给定值（或在末尾追加）
   */
  const injectDfidIntoCookieStr = (cookiesStr, dfid) => {
    if (!dfid) return cookiesStr || '';
    const base = (cookiesStr || '').replace(/(?:^|;\s*)dfid=[^;]*/gi, '').replace(/^;\s*/, '');
    return base ? `${base}; dfid=${dfid}` : `dfid=${dfid}`;
  };

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

    // ==================== 元数据获取（后端调用自身 API）====================

    // 通过 hash 获取歌曲详细信息（privilege/lite → krm/audio）
    const fetchSongInfoServer = async (hash, authHeader, cookiesStr) => {
      const port = Number(process.env.PORT || '3000');
      const base = `http://127.0.0.1:${port}`;
      const headers = {
        ...(authHeader ? { Authorization: authHeader } : {}),
        ...(cookiesStr ? { Cookie: cookiesStr } : {}),
      };

      // 带重试的 GET：网络抖动时重试 1 次，尽量避免因临时失败导致无标签
      const getWithRetry = async (url, opts, label) => {
        try {
          return await axios.get(url, opts);
        } catch (e) {
          logDownload(`WARN: ${label} 首次失败，重试1次: ${e.message}`);
          try {
            return await axios.get(url, opts);
          } catch (e2) {
            logDownload(`WARN: ${label} 重试也失败: ${e2.message}`);
            throw e2;
          }
        }
      };

      try {
        // 1. 调用 /privilege/lite 获取基本信息
        const privResp = await getWithRetry(`${base}/privilege/lite`, {
          params: { hash }, headers, timeout: 10000,
        }, 'privilege/lite');
        if (privResp.data.status !== 1 || !privResp.data.data?.length) return null;

        const songData = privResp.data.data[0];
        const albumAudioId = songData.album_audio_id;

        // 2. 如果有 album_audio_id，调用 /krm/audio 获取详细信息
        if (albumAudioId) {
          const krmResp = await getWithRetry(`${base}/krm/audio`, {
            params: { album_audio_id: albumAudioId }, headers, timeout: 10000,
          }, 'krm/audio');
          if (krmResp.data.status === 1 && krmResp.data.data?.length) {
            const ad = krmResp.data.data[0];
            const b = ad.base || {};
            const ai = ad.album_info || {};
            const au = ad.author_info || {};

            let coverUrl = '';
            if (ai.cover) {
              coverUrl = ai.cover.replace('{size}', '720').replace(/[`"]/g, '').trim();
            } else if (b.sizable_cover) {
              coverUrl = b.sizable_cover.replace('{size}', '720').replace(/[`"]/g, '').trim();
            }

            return {
              name: b.songname || b.audio_name || ad.name || '',
              author: b.author_name || au.author_name || '',
              album: ai.album_name || b.album_name || '',
              album_id: String(ai.album_id || b.album_id || ''),
              publish_date: b.publish_date || ai.publish_date || '',
              cover: coverUrl,
              hash: b.hash || ad.hash || hash,
              track: String(b.track || ad.track || ''),
              disc: String(b.disc || ad.disc || ''),
              album_artist: au.author_name || b.author_name || '',
            };
          }
        }

        // 3. 回退到 privilege 基本信息
        const info = songData.info || {};
        const imgUrl = info.image || songData.trans_param?.union_cover || '';
        return {
          name: songData.name || songData.songname || '',
          author: songData.singername || '',
          album: songData.albumname || '',
          album_id: String(songData.album_id || ''),
          publish_date: songData.publish_date || '',
          cover: imgUrl ? imgUrl.replace('{size}', '720').replace(/[`"]/g, '').trim() : '',
          hash: songData.hash || hash,
          track: String(songData.track || info.track || ''),
          disc: String(songData.disc || info.disc || ''),
          album_artist: songData.singername || '',
        };
      } catch (e) {
        logDownload(`WARN: 获取歌曲信息失败 hash=${hash}: ${e.message}`);
        return null;
      }
    };

    // 通过 hash 获取歌词（search/lyric → lyric）
    const fetchLyricsServer = async (hash, authHeader, cookiesStr) => {
      const port = Number(process.env.PORT || '3000');
      const base = `http://127.0.0.1:${port}`;
      const headers = {
        ...(authHeader ? { Authorization: authHeader } : {}),
        ...(cookiesStr ? { Cookie: cookiesStr } : {}),
      };

      try {
        const searchResp = await axios.get(`${base}/search/lyric`, {
          params: { hash }, headers, timeout: 10000,
        });
        if (searchResp.data.status !== 200 || !searchResp.data.candidates?.length) return null;

        const cand = searchResp.data.candidates[0];
        if (!cand.id || !cand.accesskey) return null;

        const lyricResp = await axios.get(`${base}/lyric`, {
          params: { id: cand.id, accesskey: cand.accesskey, fmt: 'lrc', decode: true },
          headers, timeout: 10000,
        });
        if (lyricResp.data.status === 200) {
          return lyricResp.data.decodeContent || lyricResp.data.content || null;
        }
        return null;
      } catch (e) {
        logDownload(`WARN: 获取歌词失败 hash=${hash}: ${e.message}`);
        return null;
      }
    };

    // 下载封面图到 Buffer
    const fetchCoverBuffer = async (coverUrl) => {
      if (!coverUrl) return null;
      try {
        const resp = await axios.get(coverUrl, { responseType: 'arraybuffer', timeout: 15000 });
        return Buffer.from(resp.data);
      } catch (e) {
        logDownload(`WARN: 获取封面失败 ${coverUrl}: ${e.message}`);
        return null;
      }
    };

    // 统一获取元数据（歌曲信息 + 歌词 + 封面），返回 logs 数组供前端透传
    // 尽量获取所有字段：songInfo/lyrics/coverBuffer 任一失败不影响其它字段
    // songInfo 为 null 时表示无法写入标签，但文件仍会下载（避免因标签失败而丢失音频）
    const fetchMetadataForSong = async (hash, quality, authHeader, cookiesStr) => {
      if (!hash) return null;
      const logs = [];
      try {
        logs.push(`开始获取元数据, hash: ${hash}`);
        const [songInfo, lyrics] = await Promise.all([
          fetchSongInfoServer(hash, authHeader, cookiesStr),
          fetchLyricsServer(hash, authHeader, cookiesStr),
        ]);

        let coverBuffer = null;
        if (songInfo?.cover) {
          coverBuffer = await fetchCoverBuffer(songInfo.cover);
        }

        const summary = `元数据获取完成: ${songInfo?.name || '未知'} - ${songInfo?.author || '未知'}, 歌词: ${lyrics ? '有' : '无'}, 封面: ${coverBuffer ? '有' : '无'}`;
        logs.push(summary);
        console.log(`[FNOS] ${summary}`);
        // 即使 songInfo 为 null 也返回对象，保留已获取的 lyrics 等字段
        return { songInfo, coverBuffer, lyrics, quality, logs };
      } catch (e) {
        logs.push(`获取元数据失败: ${e.message}，将下载无标签文件`);
        logDownload(`WARN: 获取元数据失败 hash=${hash}: ${e.message}，将下载无标签文件`);
        return { songInfo: null, coverBuffer: null, lyrics: null, quality, logs };
      }
    };

    // ==================== 标签写入（纯 Node.js 实现，无外部依赖）====================

    // 检测图片 MIME 类型
    const detectImageMime = (buf) => {
      if (!buf || buf.length < 4) return 'image/jpeg';
      if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg';
      if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
      if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
      if (buf[0] === 0x42 && buf[1] === 0x4D) return 'image/bmp';
      if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
          buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
      return 'image/jpeg';
    };

    // 从发行日期提取年份
    const extractYear = (publishDate) => {
      if (publishDate) {
        const m = publishDate.match(/(\d{4})/);
        if (m) return m[1];
      }
      return String(new Date().getFullYear());
    };

    // ---- ID3v2.3 标签写入（MP3）----

    // 构造 ID3v2.3 文本帧（UTF-16 编码）
    const makeId3TextFrame = (id, text) => {
      const textBuf = Buffer.from(text || '', 'utf16le');
      const data = Buffer.concat([
        Buffer.from([0x01]),        // 编码: UTF-16 with BOM
        Buffer.from([0xFF, 0xFE]),  // BOM (little-endian)
        textBuf,
        Buffer.from([0x00, 0x00]),  // UTF-16 null terminator
      ]);
      const header = Buffer.alloc(10);
      header.write(id, 0, 'ascii');
      header.writeUInt32BE(data.length, 4);  // v2.3 帧大小为常规 32 位整数
      return Buffer.concat([header, data]);
    };

    // 写入 ID3v2.3 标签到 MP3 文件
    const writeId3Tags = (filePath, songInfo, coverBuffer, lyrics) => {
      const frames = [];

      frames.push(makeId3TextFrame('TIT2', songInfo.name || '未知歌曲'));
      frames.push(makeId3TextFrame('TPE1', songInfo.author || '未知歌手'));
      frames.push(makeId3TextFrame('TALB', songInfo.album || '未知专辑'));
      frames.push(makeId3TextFrame('TYER', extractYear(songInfo.publish_date)));
      frames.push(makeId3TextFrame('TCON', 'Music'));

      const albumArtist = songInfo.album_artist || songInfo.author || '';
      if (albumArtist) frames.push(makeId3TextFrame('TPE2', albumArtist));

      // TRCK 帧（音轨号）
      if (songInfo.track) {
        frames.push(makeId3TextFrame('TRCK', String(songInfo.track)));
      }

      // APIC 帧（封面图）
      if (coverBuffer) {
        const mime = detectImageMime(coverBuffer);
        const mimeBuf = Buffer.from(mime + '\0', 'ascii');  // null-terminated ISO-8859-1
        const data = Buffer.concat([
          Buffer.from([0x00]),       // 编码: ISO-8859-1（仅用于 description）
          mimeBuf,                    // MIME type + null
          Buffer.from([0x03]),       // picture type: front cover
          Buffer.from([0x00]),       // empty description (null terminator)
          coverBuffer,                // 图片数据
        ]);
        const header = Buffer.alloc(10);
        header.write('APIC', 0, 'ascii');
        header.writeUInt32BE(data.length, 4);
        frames.push(Buffer.concat([header, data]));
      }

      // USLT 帧（歌词）
      if (lyrics) {
        const textBuf = Buffer.from(lyrics, 'utf16le');
        const data = Buffer.concat([
          Buffer.from([0x01]),                // 编码: UTF-16
          Buffer.from('chi', 'ascii'),        // 语言: chi
          Buffer.from([0xFF, 0xFE, 0x00, 0x00]), // empty description (BOM + null)
          Buffer.from([0xFF, 0xFE]),          // BOM
          textBuf,                            // 歌词文本
        ]);
        const header = Buffer.alloc(10);
        header.write('USLT', 0, 'ascii');
        header.writeUInt32BE(data.length, 4);
        frames.push(Buffer.concat([header, data]));
      }

      // COMM 帧（注释）
      {
        const commentText = Buffer.from('Downloaded by KGmusic', 'utf16le');
        const data = Buffer.concat([
          Buffer.from([0x01]),                        // 编码: UTF-16
          Buffer.from('eng', 'ascii'),                // 语言: eng
          Buffer.from([0xFF, 0xFE, 0x00, 0x00]),     // empty description
          Buffer.from([0xFF, 0xFE]),                  // BOM
          commentText,
        ]);
        const header = Buffer.alloc(10);
        header.write('COMM', 0, 'ascii');
        header.writeUInt32BE(data.length, 4);
        frames.push(Buffer.concat([header, data]));
      }

      // 合并所有帧
      const allFrames = Buffer.concat(frames);

      // ID3v2.3 头部（大小为 synchsafe integer）
      const totalSize = allFrames.length;
      const sizeBuf = Buffer.alloc(4);
      sizeBuf[0] = (totalSize >> 21) & 0x7F;
      sizeBuf[1] = (totalSize >> 14) & 0x7F;
      sizeBuf[2] = (totalSize >> 7) & 0x7F;
      sizeBuf[3] = totalSize & 0x7F;

      const id3Header = Buffer.concat([
        Buffer.from('ID3', 'ascii'),
        Buffer.from([0x03, 0x00]),  // version 2.3.0
        Buffer.from([0x00]),        // flags
        sizeBuf,
      ]);

      // 读取原文件，跳过已有的 ID3v2 标签
      const original = fs.readFileSync(filePath);
      let audioData = original;
      if (original.length > 10 && original.subarray(0, 3).toString('ascii') === 'ID3') {
        const oldSize = ((original[6] & 0x7F) << 21) | ((original[7] & 0x7F) << 14) |
                        ((original[8] & 0x7F) << 7) | (original[9] & 0x7F);
        audioData = original.subarray(10 + oldSize);
      }

      // 原子写入：先写临时文件，再 rename 覆盖原文件，避免写入过程中崩溃导致原文件损坏
      const newContent = Buffer.concat([id3Header, allFrames, audioData]);
      const tmpPath = filePath + '.tmp-' + process.pid + '-' + Date.now();
      fs.writeFileSync(tmpPath, newContent);
      try {
        fs.renameSync(tmpPath, filePath);
      } catch (renameErr) {
        // rename 失败时清理临时文件并抛错，原文件保持不变
        try { fs.unlinkSync(tmpPath); } catch (__) {}
        throw renameErr;
      }
      return true;
    };

    // ---- Vorbis Comments 写入（FLAC）----

    // 构造 VORBIS_COMMENT block 数据
    const buildVorbisComment = (songInfo, lyrics) => {
      const comments = [
        `TITLE=${songInfo.name || '未知歌曲'}`,
        `ARTIST=${songInfo.author || '未知歌手'}`,
        `ALBUM=${songInfo.album || '未知专辑'}`,
        `DATE=${extractYear(songInfo.publish_date)}`,
        'GENRE=Music',
        'COMMENT=Downloaded by KGmusic',
      ];

      const albumArtist = songInfo.album_artist || songInfo.author || '';
      if (albumArtist) comments.push(`ALBUMARTIST=${albumArtist}`);
      if (songInfo.publish_date) comments.push(`RELEASEDATE=${songInfo.publish_date}`);
      if (songInfo.track) comments.push(`TRACKNUMBER=${songInfo.track}`);
      if (songInfo.disc) comments.push(`DISCNUMBER=${songInfo.disc}`);
      if (lyrics) comments.push(`LYRICS=${lyrics}`);

      const parts = [];
      // vendor string
      const vendor = Buffer.from('KGmusic', 'utf8');
      const vendorLen = Buffer.alloc(4);
      vendorLen.writeUInt32LE(vendor.length, 0);
      parts.push(vendorLen, vendor);
      // comment count
      const countBuf = Buffer.alloc(4);
      countBuf.writeUInt32LE(comments.length, 0);
      parts.push(countBuf);
      // each comment
      for (const c of comments) {
        const cBuf = Buffer.from(c, 'utf8');
        const cLen = Buffer.alloc(4);
        cLen.writeUInt32LE(cBuf.length, 0);
        parts.push(cLen, cBuf);
      }
      return Buffer.concat(parts);
    };

    // 构造 PICTURE block 数据
    const buildFlacPicture = (coverBuffer) => {
      const mime = detectImageMime(coverBuffer);
      const mimeBuf = Buffer.from(mime, 'ascii');
      const descBuf = Buffer.from('Cover', 'utf8');

      const parts = [];
      // picture type (3 = front cover)
      const picType = Buffer.alloc(4);
      picType.writeUInt32BE(3, 0);
      parts.push(picType);
      // MIME type
      const mimeLen = Buffer.alloc(4);
      mimeLen.writeUInt32BE(mimeBuf.length, 0);
      parts.push(mimeLen, mimeBuf);
      // description
      const descLen = Buffer.alloc(4);
      descLen.writeUInt32BE(descBuf.length, 0);
      parts.push(descLen, descBuf);
      // width, height, color depth, indexed colors (all 0)
      parts.push(Buffer.alloc(16));
      // picture data
      const picLen = Buffer.alloc(4);
      picLen.writeUInt32BE(coverBuffer.length, 0);
      parts.push(picLen, coverBuffer);

      return Buffer.concat(parts);
    };

    // 写入 Vorbis Comments 到 FLAC 文件
    const writeFlacTags = (filePath, songInfo, coverBuffer, lyrics) => {
      const buffer = fs.readFileSync(filePath);

      // 验证 FLAC 头
      if (buffer.length < 4 || buffer.subarray(0, 4).toString('ascii') !== 'fLaC') {
        logDownload(`WARN: 不是FLAC文件，跳过标签写入: ${filePath}`);
        return false;
      }

      // 解析现有 metadata blocks
      let offset = 4;
      const blocks = [];
      let audioStart = 4;

      while (offset + 4 <= buffer.length) {
        const isLast = (buffer[offset] & 0x80) !== 0;
        const blockType = buffer[offset] & 0x7F;
        const blockLen = (buffer[offset + 1] << 16) | (buffer[offset + 2] << 8) | buffer[offset + 3];

        blocks.push({
          type: blockType,
          isLast,
          data: buffer.subarray(offset + 4, offset + 4 + blockLen),
        });

        offset += 4 + blockLen;
        audioStart = offset;

        if (isLast) break;
      }

      // 保留 STREAMINFO(0) 和其他非 VORBIS_COMMENT(4)/PICTURE(6) 的块
      const keptBlocks = blocks.filter(b => b.type !== 4 && b.type !== 6);

      // 构造新的 VORBIS_COMMENT 和 PICTURE 块
      const newBlocks = [...keptBlocks];
      newBlocks.push({ type: 4, data: buildVorbisComment(songInfo, lyrics) });
      if (coverBuffer) {
        newBlocks.push({ type: 6, data: buildFlacPicture(coverBuffer) });
      }

      // 重建文件
      const fileParts = [Buffer.from('fLaC', 'ascii')];

      for (let i = 0; i < newBlocks.length; i++) {
        const isLast = i === newBlocks.length - 1;
        const header = Buffer.alloc(4);
        header[0] = (isLast ? 0x80 : 0x00) | (newBlocks[i].type & 0x7F);
        header[1] = (newBlocks[i].data.length >> 16) & 0xFF;
        header[2] = (newBlocks[i].data.length >> 8) & 0xFF;
        header[3] = newBlocks[i].data.length & 0xFF;
        fileParts.push(header, newBlocks[i].data);
      }

      // 追加音频数据
      fileParts.push(buffer.subarray(audioStart));

      // 原子写入：先写临时文件，再 rename 覆盖原文件，避免写入过程中崩溃导致原文件损坏
      const newContent = Buffer.concat(fileParts);
      const tmpPath = filePath + '.tmp-' + process.pid + '-' + Date.now();
      fs.writeFileSync(tmpPath, newContent);
      try {
        fs.renameSync(tmpPath, filePath);
      } catch (renameErr) {
        // rename 失败时清理临时文件并抛错，原文件保持不变
        try { fs.unlinkSync(tmpPath); } catch (__) {}
        throw renameErr;
      }
      return true;
    };

    // 检测文件格式并嵌入元数据，返回 { success, logs }
    const embedMetadataToFile = async (filePath, songInfo, coverBuffer, lyrics, quality) => {
      const logs = [];
      if (!songInfo) return { success: false, logs };

      try {
        // 读取文件头判断格式
        const fd = fs.openSync(filePath, 'r');
        const header = Buffer.alloc(4);
        fs.readSync(fd, header, 0, 4, 0);
        fs.closeSync(fd);

        const isFlac = header.toString('ascii') === 'fLaC';
        let success = false;
        const formatMsg = isFlac ? '检测到 FLAC 文件，写入 Vorbis Comments' : '检测到 MP3 文件，写入 ID3v2 标签';
        logs.push(formatMsg);
        console.log(`[FNOS] ${formatMsg}`);

        if (isFlac) {
          success = writeFlacTags(filePath, songInfo, coverBuffer, lyrics);
        } else {
          success = writeId3Tags(filePath, songInfo, coverBuffer, lyrics);
        }

        if (success) {
          const stat = fs.statSync(filePath);
          const okMsg = `元数据嵌入成功: ${songInfo.name} - ${songInfo.author}, 文件大小: ${stat.size}B`;
          logs.push(okMsg);
          console.log(`[FNOS] ${okMsg}`);
          logDownload(`TAG_OK: ${songInfo.name} - ${songInfo.author} 标签写入成功`);
        } else {
          logs.push('标签写入返回失败');
        }
        return { success, logs };
      } catch (e) {
        const errMsg = `元数据嵌入失败: ${e.message}`;
        logs.push(errMsg);
        console.error('[FNOS]', errMsg);
        logDownload(`ERROR: 元数据嵌入失败 ${filePath}: ${e.message}`);
        return { success: false, logs };
      }
    };

    // 核心下载函数：将远程 URL 流式写入共享目录（按 歌手/专辑 分类），并嵌入元数据
    // metadata 参数: { songInfo, coverBuffer, lyrics, quality, logs } — 传入则下载后嵌入标签
    // 返回 { relativePath, absPath, size, logs }
    const downloadUrlToFile = async (url, fileName, artist, album, categorize = false, metadata = null) => {
      const logs = [...(metadata?.logs || [])];
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
      logs.push(`开始下载音频文件: ${url.substring(0, 80)}...`);
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

      logs.push('音频文件下载完成');

      // 尽量写入标签：有 songInfo 就写，缺失字段（封面/歌词/track等）会跳过对应帧但写其它字段
      // 即使完全无 songInfo 或标签写入失败，文件仍然保留（避免因标签问题丢失音频）
      if (metadata && metadata.songInfo) {
        logs.push('开始嵌入元数据（标签/封面/歌词）...');
        const embedResult = await embedMetadataToFile(filePath, metadata.songInfo, metadata.coverBuffer, metadata.lyrics, metadata.quality);
        logs.push(...embedResult.logs);
        if (!embedResult.success) {
          // 标签写入失败：保留文件，记录警告（用户更关心音频文件本身）
          logs.push('警告: 标签写入失败，文件已保留但可能缺少标签');
          logDownload(`WARN: 标签写入失败，文件已保留 ${filePath}`);
        }
      } else if (metadata && !metadata.songInfo) {
        logs.push('未获取到歌曲信息，跳过标签写入（文件仍会保留）');
        logDownload(`WARN: 无 songInfo，跳过标签写入 ${filePath}`);
      }

      const absPath = filePath;
      let fileSize = -1;
      try { fileSize = (await fs.promises.stat(absPath)).size; } catch (__) {}
      const saveMsg = `文件已保存: ${relativePath}, 大小: ${fileSize}B`;
      logs.push(saveMsg);
      logDownload(`SUCCESS: 保存到本地绝对路径=${absPath} 相对路径=${relativePath} 大小=${fileSize}B`);
      console.log('[FNOS]', saveMsg);
      return { relativePath, absPath, size: fileSize, logs };
    };

    // 单次下载接口（单曲下载使用，支持后端嵌入元数据，返回 logs 供前端控制台输出）
    app.post('/fnos/download', async (req, res) => {
      try {
        const { url, fileName, artist, album, categorize, hash, quality } = req.body || {};
        if (!url || !fileName) {
          return res.status(400).json({ code: 1, msg: '缺少 url 或 fileName 参数' });
        }

        // 如果传了 hash，后端自动获取元数据并嵌入标签
        const authHeader = req.headers['authorization'] || '';
        const cookiesStr = req.headers['cookie'] || '';
        let metadata = null;
        if (hash) {
          metadata = await fetchMetadataForSong(hash, quality || '320', authHeader, cookiesStr);
          // metadata 可能返回 null 或 songInfo 为 null，但仍然下载文件（标签失败不阻塞下载）
        }

        const result = await downloadUrlToFile(url, fileName, artist, album, categorize, metadata);
        res.json({ code: 0, msg: '下载成功', data: { path: result.relativePath, absPath: result.absPath, size: result.size, logs: result.logs || [] } });
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

    // dfid 注册逻辑已提升到 consturctServer 顶层（飞牛与非飞牛环境共用），此处直接复用

    // 内部调用 song/url 模块获取下载链接（带用户鉴权 + 合法 dfid）
    // 20028 重试和熔断由通用路由中间件统一处理，这里只发一次请求，避免叠加重试加剧风控
    const fetchSongUrl = async (hash, quality, authHeader, cookiesStr) => {
      const port = Number(process.env.PORT || '3000');
      const reqUrl = `http://127.0.0.1:${port}/song/url`;
      const params = { hash: String(hash || '').toLowerCase() };
      if (quality && quality !== '128') params.quality = quality;

      // 先拿合法 dfid，写进 Cookie，覆盖 song_url.js 中 randomString(24) 的假 dfid
      const dfid = await ensureRegisteredDfid();
      const finalCookie = injectDfidIntoCookieStr(cookiesStr, dfid);

      try {
        const resp = await axios.get(reqUrl, {
          params,
          headers: {
            ...(authHeader ? { Authorization: authHeader } : {}),
            ...(finalCookie ? { Cookie: finalCookie } : {}),
          },
          timeout: 30000,
        });
        return resp.data || {};
      } catch (e) {
        // axios 抛错时可能仍带响应体（如模块内部把 status=0 当成 502 reject）
        const errBody = (e && e.response && e.response.data) || null;
        if (errBody) return errBody;
        logDownload(`ERROR: 获取下载链接失败 hash=${hash} quality=${quality}: ${e.message}`);
        return null;
      }
    };

    // 带音质降级的下载（flac → 320 → 128），并嵌入元数据，返回 logs
    const downloadTaskWithFallback = async (task, batch) => {
      let startIdx = QUALITY_FALLBACK_ORDER.indexOf(task.quality);
      if (startIdx === -1) startIdx = 1; // 默认从 320 开始
      let lastErr = null;
      const allLogs = [];

      // 并行预取元数据（与下载链接获取同时进行，节省时间）
      const metadataPromise = fetchMetadataForSong(
        task.song.hash, task.quality, batch.authHeader, batch.cookiesStr
      );

      for (let i = startIdx; i < QUALITY_FALLBACK_ORDER.length; i++) {
        const q = QUALITY_FALLBACK_ORDER[i];
        try {
          const urlResp = await fetchSongUrl(task.song.hash, q, batch.authHeader, batch.cookiesStr);
          if (!urlResp || urlResp.status !== 1 || !urlResp.url || !urlResp.url[0]) {
            throw new Error(`获取 ${q} 下载链接失败`);
          }
          const downloadUrl = urlResp.url[0];
          const ext = q === 'flac' ? 'flac' : 'mp3';
          // 严格用 batchArtist（通过歌手ID查询的名字）创建文件名，不 fallback 到单曲元数据
          const folderArtist = batch.batchArtist || '未知歌手';
          const fileName = `${task.song.name} - ${folderArtist}.${ext}`;

          // 等待元数据预取完成（通常此时已完成）
          const metadata = await metadataPromise;

          // 标签失败也下载文件：metadata 可能为 null 或 songInfo 为 null，但音频文件仍需保留
          // downloadUrlToFile 内部会处理 metadata 为 null 的情况（跳过标签写入但保留文件）
          const result = await downloadUrlToFile(
            downloadUrl, fileName, folderArtist, task.song.album, true,
            metadata ? { ...metadata, quality: q } : null
          );
          allLogs.push(...(result.logs || []));
          return { ...result, quality: q, logs: allLogs };
        } catch (e) {
          lastErr = e;
          allLogs.push(`音质 ${q} 失败: ${e.message}`);
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

      // 歌曲明细仍从 taskHistory 取
      const batchTasks = taskHistory.filter(t => t.batchId === batchId);
      const successList = batchTasks.filter(t => t.status === 'success');
      const failedList = batchTasks.filter(t => t.status === 'failed');

      // 严格用 batchArtist（通过歌手ID查询的名字），不 fallback 到单曲元数据
      const displayArtist = batch.batchArtist || '未知艺术家';

      const SONGS_PER_ROW = 5;
      const SEP = '    |    '; // 歌曲之间的分隔符

      // 格式化 Markdown 内容：与前端 pushplus.js formatDownloadResultForPush 一致
      let content = `## 🎵 ${displayArtist} · ${batch.albums.size}个专辑下载任务\n\n`;
      content += `✅ 成功：**${successCount}**首　❌ 失败：**${failedCount}**首\n\n`;

      if (successList.length > 0) {
        const groups = {};
        for (const item of successList) {
          const album = item.song.album || '未知专辑';
          const safeAlbum = album.trim() || '未知专辑';
          if (!groups[safeAlbum]) groups[safeAlbum] = [];
          groups[safeAlbum].push(item.song.name);
        }
        let albumIndex = 1;
        for (const [albumName, songNames] of Object.entries(groups)) {
          content += `📀 **${albumIndex}. ${albumName}**（共${songNames.length}首）\n\n`;
          for (let i = 0; i < songNames.length; i += SONGS_PER_ROW) {
            const row = songNames.slice(i, i + SONGS_PER_ROW);
            content += row.join(SEP) + '\n';
          }
          content += '\n';
          albumIndex++;
        }
      }

      if (failedList.length > 0) {
        content += `❌ **下载失败（${failedList.length}首）：**\n\n`;
        for (let i = 0; i < failedList.length; i += SONGS_PER_ROW) {
          const rowItems = failedList.slice(i, i + SONGS_PER_ROW).map(item => item.song.name);
          content += rowItems.join(SEP) + '\n';
        }
        content += '\n';
      }

      try {
        await axios.post('http://www.pushplus.plus/send', {
          token: batch.pushplusToken,
          title: `${successCount}首歌曲下载完成`,
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
            task.logs = result.logs || [];
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
        // Step 1: 必须有 hash
        const hasHashTasks = allTasks.filter(t => t.song.hash);
        let skippedNoHash = totalSongs - hasHashTasks.length;

        // Step 2: 后端双保险去重（按歌曲名，保留首次出现的版本。前端传过来时已按"专辑从新到旧"排序，因此首次出现即为最新版本）
        const normalizeName = (n) => String(n || '').trim().toLowerCase();
        const seenSongNames = new Set();
        let skippedDuplicate = 0;
        const tasks = [];
        for (const t of hasHashTasks) {
          const nameKey = normalizeName(t.song.name);
          if (nameKey && seenSongNames.has(nameKey)) {
            skippedDuplicate++;
            continue;
          }
          if (nameKey) seenSongNames.add(nameKey);
          tasks.push(t);
        }
        const skipped = skippedNoHash + skippedDuplicate;

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

        const skipDetails = [];
        if (skippedNoHash > 0) skipDetails.push(`${skippedNoHash}首无下载信息`);
        if (skippedDuplicate > 0) skipDetails.push(`${skippedDuplicate}首重复歌曲`);
        const skipDetailStr = skipDetails.length > 0 ? `（跳过：${skipDetails.join('、')}）` : '';

        console.log(`[FNOS Queue] 批次 ${batchId} 加入 ${tasks.length} 首${skipDetailStr}，音质 ${qualityVal}`);
        const successMsg = skipped > 0
          ? `已加入 ${tasks.length} 首，跳过 ${skipped} 首${skipDetailStr}`
          : '已加入下载队列';
        res.json({ code: 0, msg: successMsg, data: { batchId, added: tasks.length, skipped, skippedNoHash, skippedDuplicate, total: tasks.length } });
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
          recent: recent.map(t => ({ id: t.id, batchId: t.batchId, song: t.song, quality: t.quality, status: t.status, error: t.error, path: t.path, finishedAt: t.finishedAt, logs: t.logs || [] })),
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

      // 确保所有模块请求都携带合法 dfid（绕过 song_url.js 的 randomString 假 dfid）
      // 跳过 /register/dev 本身，否则 ensureRegisteredDfid 调它 → 中间件又调 ensureRegisteredDfid → 递归死锁
      // 始终用后端的 dfid 覆盖前端传的：后端 20028 重试刷新 dfidCache 后，前端 MoeAuth.Device 还是旧的，
      // 如果不覆盖，下次请求仍带旧 dfid → 继续 20028 → 死循环
      if (moduleDef.identifier !== 'register_dev') {
        try {
          const dfid = await ensureRegisteredDfid();
          if (dfid) {
            query.cookie.dfid = dfid;
          } else if (!query.cookie.dfid || typeof query.cookie.dfid !== 'string' || query.cookie.dfid.length < 10) {
            // 后端也没拿到 dfid（熔断或注册失败），且前端没传有效 dfid → 用默认值兜底
            query.cookie.dfid = randomString(24);
          }
        } catch (_) { /* 注册失败不阻塞请求 */ }
      }

      try {
        // 模块调用包装：检测 20028 风控后强制刷新 dfid 重试一次（最多 1 次）
        // 区分 status==2（登录失效）：换 dfid 无用，直接返回让前端处理
        const MAX_DFID_RETRY = 1;
        let attempt = 0;
        let moduleResponse;
        while (true) {
          try {
            moduleResponse = await moduleDef.module(query, (config) => {
              let ip = req.ip;
              if (ip.substring(0, 7) === '::ffff:') {
                ip = ip.substring(7);
              }
              config.ip = ip;
              return createRequest(config);
            });
          } catch (e) {
            // createRequest reject 时抛出的是 { status, body, cookie, headers } 对象
            moduleResponse = e;
          }

          const body = moduleResponse?.body;
          // 登录失效（status==2）：换 dfid 无用，直接返回让前端重新登录
          if (isLoginExpired(body)) {
            console.log('[LOGIN_EXPIRED]', decode(req.originalUrl));
            break;
          }
          // dfid 风控（20028）：清缓存 + 强制换新 GUID 重新注册 + 重试
          // 跳过 /register/dev 本身（它不可能因为 dfid 失效，重试会形成循环）
          if (moduleDef.identifier !== 'register_dev' && isNeedVerifyError(body) && attempt < MAX_DFID_RETRY) {
            recordDfidFailure();
            if (isCircuitOpen()) {
              // 已熔断，不再重试（避免加剧风控导致账号被封）
              logDfid(`通用路由熔断中，跳过重试 ${decode(req.originalUrl)}`);
              break;
            }
            logDfid(`通用路由检测到 20028，强制刷新 dfid（换新 GUID）后重试 ${decode(req.originalUrl)}`);
            const newDfid = await ensureRegisteredDfid(true);
            if (newDfid) query.cookie.dfid = newDfid;
            attempt++;
            continue;
          }
          // 正常响应（成功或其它错误）：清零失败计数
          if (!isNeedVerifyError(body)) recordDfidSuccess();
          break;
        }

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
