import { get } from './request'

const log = (...args) => {
  console.log('[metadata]', ...args)
}

const logError = (...args) => {
  console.error('[metadata]', ...args)
}

const logWarn = (...args) => {
  console.warn('[metadata]', ...args)
}

export async function fetchSongInfo(hash) {
  try {
    log('开始获取歌曲信息，hash:', hash)
    
    const response = await get(`/privilege/lite?hash=${hash}`)
    
    if (response.status === 1 && response.data && response.data.length > 0) {
      const songData = response.data[0]
      const albumAudioId = songData.album_audio_id
      
      if (albumAudioId) {
        log('获取到 album_audio_id:', albumAudioId)
        const audioInfo = await fetchAudioInfo(albumAudioId)
        if (audioInfo) {
          return audioInfo
        }
      }
      
      // 如果没有 album_audio_id 或获取 krm 失败，返回基本信息
      log('KRM 获取失败，使用 privilege 基本信息')
      const info = songData.info || {}
      const imgUrl = info.image || songData.trans_param?.union_cover || ''
      return {
        name: songData.name || songData.songname || '',
        author: songData.singername || '',
        album: songData.albumname || '',
        album_id: songData.album_id || '',
        album_audio_id: albumAudioId || '',
        hash: songData.hash || hash,
        cover: imgUrl.replace('{size}', '720').replace(/[`"]/g, '').trim(),
        publish_date: songData.publish_date || ''
      }
    }
    
    log('未找到歌曲信息')
    return null
  } catch (error) {
    logError('获取歌曲信息失败:', error)
    return null
  }
}

export async function fetchAudioInfo(albumAudioId) {
  try {
    log('通过 KRM 获取歌曲详细信息，album_audio_id:', albumAudioId)
    
    const response = await get(`/krm/audio?album_audio_id=${albumAudioId}`)
    
    if (response.status === 1 && response.data && response.data.length > 0) {
      const audioData = response.data[0]
      const base = audioData.base || {}
      const albumInfo = audioData.album_info || {}
      const authorInfo = audioData.author_info || {}
      
      const audioName = base.songname || base.audio_name || audioData.name || ''
      const authorName = base.author_name || authorInfo.author_name || ''
      const albumName = albumInfo.album_name || base.album_name || ''
      const publishDate = base.publish_date || albumInfo.publish_date || ''
      
      let coverUrl = ''
      if (albumInfo.cover) {
        coverUrl = albumInfo.cover.replace('{size}', '720').replace(/[`"]/g, '').trim()
      } else if (base.sizable_cover) {
        coverUrl = base.sizable_cover.replace('{size}', '720').replace(/[`"]/g, '').trim()
      }
      
      const result = {
        name: audioName,
        author: authorName,
        album: albumName,
        album_id: String(albumInfo.album_id || base.album_id || ''),
        album_audio_id: String(base.album_audio_id || audioData.album_audio_id || albumAudioId),
        hash: base.hash || audioData.hash || '',
        cover: coverUrl,
        publish_date: publishDate,
        duration: base.duration || audioData.duration || 0
      }
      
      log('KRM 歌曲信息获取成功:', result.name, '-', result.author, '专辑:', result.album, '发行日期:', result.publish_date)
      return result
    }
    
    log('KRM 未找到歌曲信息')
    return null
  } catch (error) {
    logError('KRM 获取歌曲信息失败:', error)
    return null
  }
}

export async function fetchAlbumInfo(albumId) {
  try {
    log('开始获取专辑信息，album_id:', albumId)
    
    const response = await get(`/album/detail?id=${albumId}`)
    
    if (response.status === 1 && response.data && response.data.length > 0) {
      const albumData = response.data[0]
      log('专辑信息获取成功:', albumData.album_name, '发行日期:', albumData.publish_date)
      return {
        name: albumData.album_name || '',
        publish_date: albumData.publish_date || '',
        cover: albumData.sizable_cover || albumData.cover || ''
      }
    }
    
    log('未找到专辑信息')
    return null
  } catch (error) {
    logError('获取专辑信息失败:', error)
    return null
  }
}

export async function fetchLyrics(hash) {
  try {
    log('开始获取歌词，hash:', hash)
    
    // 首先调用 /search/lyric 接口获取歌词的 id 和 accesskey
    const searchResponse = await get(`/search/lyric?hash=${hash}`)
    
    if (searchResponse.status !== 200 || !searchResponse.candidates || searchResponse.candidates.length === 0) {
      log('未找到歌词候选')
      return null
    }
    
    // 从候选列表中取第一个，获取 id 和 accesskey
    const candidate = searchResponse.candidates[0]
    const lyricId = candidate.id
    const accesskey = candidate.accesskey
    
    if (lyricId && accesskey) {
      // 然后使用获取到的 id 和 accesskey 调用 /lyric 接口
      const lyricResponse = await get(`/lyric?id=${lyricId}&accesskey=${accesskey}&fmt=lrc&decode=true`)
      
      if (lyricResponse.status === 200) {
        // 尝试从不同字段获取歌词
        const lyrics = lyricResponse.decodeContent || lyricResponse.content
        
        if (lyrics) {
          log('歌词获取成功，长度:', lyrics.length)
          return lyrics
        }
      }
    }
    
    log('未找到歌词数据')
    return null
  } catch (error) {
    logError('获取歌词失败:', error)
    return null
  }
}

export async function fetchCover(coverUrl) {
  if (!coverUrl) return null
  
  try {
    log('开始获取封面图:', coverUrl)
    
    const response = await fetch(coverUrl)
    if (!response.ok) {
      throw new Error(`封面图请求失败: ${response.status}`)
    }
    
    const blob = await response.blob()
    log('封面图获取成功，大小:', blob.size)
    return blob
  } catch (error) {
    logError('获取封面图失败:', error)
    return null
  }
}

export async function embedMusicMetadata(audioBlob, songInfo, coverUrl, lyrics, quality = '320') {
  try {
    log('开始内嵌元数据...')
    
    const qualityStr = typeof quality === 'object' ? quality.quality : quality
    
    const arrayBuffer = await audioBlob.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    
    const fileType = audioBlob.type
    log('文件类型:', fileType)
    
    const isFlacByHeader = uint8Array.subarray(0, 4).join(',') === '102,76,65,67'
    const isFlacByName = audioBlob.name?.toLowerCase().endsWith('.flac')
    const isFlacByType = fileType === 'audio/flac' || fileType.includes('flac')
    const isFlacByExtension = audioBlob.name?.toLowerCase().includes('.flac')
    const isFlacByQuality = qualityStr === 'flac' || qualityStr === 'lossless'
    
    log('FLAC 文件检测:', {
      isFlacByHeader,
      isFlacByName,
      isFlacByType,
      isFlacByExtension,
      isFlacByQuality,
      fileName: audioBlob.name,
      quality: qualityStr
    })
    
    if (isFlacByHeader || isFlacByType || isFlacByQuality) {
      log('检测到 FLAC 文件，使用 Vorbis Comments')
      return await embedFlacMetadata(arrayBuffer, songInfo, coverUrl, lyrics)
    }
    
    log('处理非 FLAC 文件，使用 ID3 标签')
    return await embedId3Metadata(uint8Array, songInfo, coverUrl, lyrics)
  } catch (error) {
    logError('元数据内嵌失败:', error)
    return {
      success: false,
      outputBlob: audioBlob,
      originalBlob: audioBlob,
      message: `元数据内嵌失败: ${error.message}`
    }
  }
}

async function embedFlacMetadata(arrayBuffer, songInfo, coverUrl, lyrics) {
  try {
    const metaflacModule = await import('metaflac-browser-js')
    const Metaflac = metaflacModule.default || metaflacModule
    
    log('metaflac-browser-js 导入成功')
    
    const flac = Metaflac.fromArrayBuffer(arrayBuffer)
    log('Metaflac 实例创建成功')
    
    const sampleRate = flac.getSampleRate()
    const channels = flac.getChannels()
    const bps = flac.getBps()
    const totalSamples = flac.getTotalSamples()
    const duration = totalSamples && sampleRate ? (totalSamples / sampleRate).toFixed(2) : 0
    const bitRate = sampleRate && channels && bps ? (sampleRate * channels * bps / 1000).toFixed(0) : 0
    
    log('FLAC 流信息:', {
      sampleRate: sampleRate + ' Hz',
      channels: channels,
      bitsPerSample: bps,
      totalSamples: totalSamples,
      duration: duration + ' 秒',
      bitRate: bitRate + ' kbps'
    })
    
    flac.removeAllTags()
    log('已清除所有现有标签')
    
    const cleanName = getSongName(songInfo)
    const cleanAuthor = getSongArtist(songInfo)
    const albumName = getAlbumName(songInfo)
    const albumYear = getAlbumYear(songInfo)
    
    flac.setTag(`TITLE=${cleanName}`)
    flac.setTag(`ARTIST=${cleanAuthor}`)
    flac.setTag(`ALBUM=${albumName}`)
    flac.setTag(`DATE=${albumYear}`)
    flac.setTag('GENRE=Music')
    flac.setTag('COMMENT=Downloaded by KGmusic')
    
    // 专辑艺术家
    const albumArtist = songInfo.album_artist || songInfo.author || cleanAuthor
    if (albumArtist) {
      flac.setTag(`ALBUMARTIST=${albumArtist}`)
    }
    
    // 完整发行日期
    if (songInfo.publish_date) {
      flac.setTag(`RELEASEDATE=${songInfo.publish_date}`)
    }
    
    if (songInfo.track || songInfo.originalData?.track) {
      flac.setTag(`TRACKNUMBER=${songInfo.track || songInfo.originalData?.track}`)
    }
    if (songInfo.disc || songInfo.originalData?.disc) {
      flac.setTag(`DISCNUMBER=${songInfo.disc || songInfo.originalData?.disc}`)
    }
    
    log('FLAC 基本标签设置完成:', {
      title: cleanName,
      artist: cleanAuthor,
      album: albumName,
      year: albumYear
    })
    
    if (coverUrl) {
      log('开始处理封面图:', coverUrl)
      try {
        const coverBlob = await fetchCover(coverUrl)
        if (coverBlob) {
          await flac.importPictureFromFile(coverBlob)
          log('封面图已添加到元数据')
        }
      } catch (coverError) {
        logWarn('获取封面图失败:', coverError)
      }
    } else {
      log('没有封面图URL')
    }
    
    if (lyrics) {
      log('歌词长度:', lyrics.length)
      try {
        flac.setTag(`LYRICS=${lyrics}`)
        log('歌词已添加到元数据')
      } catch (lyricsError) {
        logWarn('歌词处理失败:', lyricsError)
      }
    }
    
    const outputBlob = flac.saveAsBlob()
    log('FLAC 元数据内嵌完成，输出大小:', outputBlob.size)
    
    return {
      success: true,
      outputBlob: outputBlob,
      originalBlob: new Blob([arrayBuffer]),
      message: '元数据内嵌成功'
    }
  } catch (flacError) {
    logError('FLAC 标签处理失败:', flacError)
    throw flacError
  }
}

async function embedId3Metadata(uint8Array, songInfo, coverUrl, lyrics) {
  try {
    const id3Module = await import('browser-id3-writer')
    let BrowserID3Writer
    
    if (typeof id3Module.BrowserID3Writer === 'function') {
      BrowserID3Writer = id3Module.BrowserID3Writer
    } else if (typeof id3Module.default === 'function') {
      BrowserID3Writer = id3Module.default
    } else {
      const exports = Object.keys(id3Module)
      for (const key of exports) {
        if (typeof id3Module[key] === 'function' && key.toLowerCase().includes('writer')) {
          BrowserID3Writer = id3Module[key]
          break
        }
      }
    }
    
    if (!BrowserID3Writer) {
      throw new Error('无法找到 BrowserID3Writer 构造函数')
    }
    
    log('BrowserID3Writer 导入成功')
    
    const writer = new BrowserID3Writer(uint8Array)
    
    const cleanName = getSongName(songInfo)
    const cleanAuthor = getSongArtist(songInfo)
    const albumName = getAlbumName(songInfo)
    const albumYear = getAlbumYear(songInfo)
    
    writer.setFrame('TIT2', cleanName)
    writer.setFrame('TPE1', [cleanAuthor])
    writer.setFrame('TALB', albumName)
    writer.setFrame('TYER', albumYear)
    writer.setFrame('TCON', ['Music'])
    
    // 专辑艺术家
    const albumArtist = songInfo.album_artist || songInfo.author || cleanAuthor
    if (albumArtist) {
      writer.setFrame('TPE2', albumArtist)
    }
    
    if (songInfo.track || songInfo.originalData?.track) {
      writer.setFrame('TRCK', String(songInfo.track || songInfo.originalData?.track))
    }
    
    log('基本标签设置完成:', {
      title: cleanName,
      artist: cleanAuthor,
      album: albumName,
      year: albumYear
    })
    
    if (coverUrl) {
      log('开始处理封面图:', coverUrl)
      try {
        const coverBlob = await fetchCover(coverUrl)
        if (coverBlob) {
          const coverArrayBuffer = await coverBlob.arrayBuffer()
          const coverUint8Array = new Uint8Array(coverArrayBuffer)
          
          log('封面图获取成功，大小:', coverArrayBuffer.byteLength)
          
          writer.setFrame('APIC', {
            type: 3,
            description: 'Cover',
            data: coverUint8Array,
            mime: coverBlob.type || 'image/jpeg'
          })
          
          log('封面图已添加到元数据')
        }
      } catch (coverError) {
        logWarn('获取封面图失败:', coverError)
      }
    } else {
      log('没有封面图URL')
    }
    
    if (lyrics) {
      log('歌词长度:', lyrics.length)
      writer.setFrame('USLT', {
        description: 'Lyrics',
        lyrics: lyrics,
        language: 'chi'
      })
      log('歌词已添加到元数据')
    } else {
      log('没有歌词')
    }
    
    if (typeof writer.addTag === 'function') {
      writer.addTag()
    } else if (typeof writer.write === 'function') {
      writer.write()
    }
    
    let taggedSongBlob
    if (typeof writer.getBlob === 'function') {
      taggedSongBlob = writer.getBlob()
    } else if (typeof writer.getResult === 'function') {
      taggedSongBlob = writer.getResult()
    } else {
      logWarn('无法获取带元数据的音频，返回原始文件')
      return {
        success: false,
        outputBlob: new Blob([uint8Array]),
        originalBlob: new Blob([uint8Array]),
        message: '元数据内嵌失败，返回原始音频文件'
      }
    }
    
    log('元数据内嵌完成，输出大小:', taggedSongBlob.size)
    
    return {
      success: true,
      outputBlob: taggedSongBlob,
      originalBlob: new Blob([uint8Array]),
      message: '元数据内嵌成功'
    }
  } catch (error) {
    logError('ID3 标签处理失败:', error)
    throw error
  }
}

function getSongName(songInfo) {
  return songInfo.name || songInfo.ori_audio_name || songInfo.songname || songInfo.audio_name || songInfo.OriSongName || '未知歌曲'
}

function getSongArtist(songInfo) {
  return songInfo.author || songInfo.author_name || songInfo.singer_name || songInfo.SingerName || '未知歌手'
}

function getAlbumName(songInfo) {
  return songInfo.album_info?.album_name || songInfo.album_name || songInfo.album || songInfo.AlbumName || '未知专辑'
}

function getAlbumYear(songInfo) {
  let albumYear = new Date().getFullYear().toString()
  
  log('获取发行年份，songInfo.publish_date:', songInfo.publish_date)
  
  if (songInfo.publish_date) {
    const dateMatch = songInfo.publish_date.match(/(\d{4})/)
    if (dateMatch) {
      albumYear = dateMatch[1]
      log('从 publish_date 提取年份:', albumYear)
      return albumYear
    }
  }
  
  if (songInfo.rank_id_publish_date) {
    const dateMatch = songInfo.rank_id_publish_date.match(/(\d{4})/)
    if (dateMatch) {
      albumYear = dateMatch[1]
      log('从 rank_id_publish_date 提取年份:', albumYear)
      return albumYear
    }
  }
  
  if (songInfo.PublishDate) {
    const dateMatch = songInfo.PublishDate.match(/(\d{4})/)
    if (dateMatch) {
      albumYear = dateMatch[1]
      log('从 PublishDate 提取年份:', albumYear)
      return albumYear
    }
  }
  
  log('未找到发行日期，使用当前年份:', albumYear)
  return albumYear
}

function normalizeSongInfo(song) {
  if (!song) return song
  
  const normalized = { ...song }
  
  // 歌名：搜索 API 用 OriSongName，排行榜 API 用 songname
  if (!normalized.name && (normalized.OriSongName || normalized.songname || normalized.audio_name)) {
    normalized.name = normalized.OriSongName || normalized.songname || normalized.audio_name
  }
  
  // 歌手：搜索 API 用 SingerName，排行榜 API 用 singername/author_name
  if (!normalized.author && (normalized.SingerName || normalized.singername || normalized.author_name)) {
    normalized.author = normalized.SingerName || normalized.singername || normalized.author_name
  }
  
  // 专辑名：搜索 API 用 AlbumName
  if (!normalized.album_name && !normalized.album && normalized.AlbumName) {
    normalized.album_name = normalized.AlbumName
    normalized.album = normalized.AlbumName
  }
  
  // 专辑ID：搜索 API 用 AlbumID
  if (!normalized.album_id && normalized.AlbumID) {
    normalized.album_id = String(normalized.AlbumID)
  }
  
  // 发行日期：搜索 API 用 PublishDate
  if (!normalized.publish_date && normalized.PublishDate) {
    normalized.publish_date = normalized.PublishDate
  }
  
  // Hash：搜索 API 用 FileHash
  if (!normalized.hash && normalized.FileHash) {
    normalized.hash = normalized.FileHash
  }
  
  // 封面：搜索 API 用 Image
  if (!normalized.img && !normalized.union_cover && normalized.Image) {
    normalized.img = normalized.Image.replace(/[`"]/g, '').trim()
  }
  
  return normalized
}

export async function downloadWithMetadata(song, downloadUrl, options = {}) {
  try {
    let songInfo = normalizeSongInfo(song)
    const hash = songInfo?.hash || songInfo?.FileHash || options.hash
    const qualityObj = options.quality || { quality: '320' }
    const quality = typeof qualityObj === 'object' ? qualityObj.quality : qualityObj
    
    log('传入的歌曲信息(归一化后):', {
      name: songInfo?.name,
      author: songInfo?.author,
      album: songInfo?.album || songInfo?.album_name,
      album_id: songInfo?.album_id,
      publish_date: songInfo?.publish_date,
      hash: hash,
      quality: quality
    })
    
    if (!songInfo || !songInfo.name) {
      if (hash) {
        log('歌曲信息不完整，尝试通过 API 获取，hash:', hash)
        const fetchedInfo = await fetchSongInfo(hash)
        if (fetchedInfo) {
          songInfo = { ...songInfo, ...fetchedInfo }
          log('成功获取歌曲信息:', songInfo.name, '-', songInfo.author, '发行日期:', songInfo.publish_date)
        }
      }
    } else if (!songInfo.publish_date || !songInfo.album_name) {
      // 有歌名但缺少专辑或发行日期，尝试补全
      const albumId = songInfo.album_id || songInfo.AlbumID || songInfo.album?.id || songInfo.originalData?.album_id
      if (albumId) {
        log('歌曲缺少元数据，尝试获取专辑信息，album_id:', albumId)
        const albumInfo = await fetchAlbumInfo(albumId)
        if (albumInfo) {
          if (albumInfo.publish_date && !songInfo.publish_date) {
            songInfo = { ...songInfo, publish_date: albumInfo.publish_date }
            log('从专辑信息获取发行日期:', songInfo.publish_date)
          }
          if (albumInfo.name && !songInfo.album_name && !songInfo.album) {
            songInfo = { ...songInfo, album_name: albumInfo.name, album: albumInfo.name }
            log('从专辑信息获取专辑名:', albumInfo.name)
          }
        }
      } else if (hash) {
        // 没有 album_id，通过 privilege/lite API 补全全部信息
        log('歌曲缺少 album_id，尝试通过 API 补全信息，hash:', hash)
        const fetchedInfo = await fetchSongInfo(hash)
        if (fetchedInfo) {
          // 只覆盖缺失的字段，不覆盖已有信息
          const merged = { ...fetchedInfo, ...songInfo }
          if (!merged.publish_date && fetchedInfo.publish_date) merged.publish_date = fetchedInfo.publish_date
          if (!merged.album_name && fetchedInfo.album) merged.album_name = fetchedInfo.album
          if (!merged.album && fetchedInfo.album) merged.album = fetchedInfo.album
          if (!merged.album_id && fetchedInfo.album_id) merged.album_id = fetchedInfo.album_id
          songInfo = merged
          log('API 补全成功:', songInfo.name, '-', songInfo.author, '专辑:', songInfo.album_name || songInfo.album, '发行日期:', songInfo.publish_date)
        }
      }
    }
    
    if (!songInfo) {
      songInfo = { name: '未知歌曲', author: '未知歌手', hash: hash }
    }
    
    log('最终歌曲信息:', {
      name: songInfo.name,
      author: songInfo.author,
      album: songInfo.album,
      publish_date: songInfo.publish_date
    })
    
    log('开始下载带标签的歌曲:', getSongName(songInfo))
    
    const coverUrl = options.coverUrl || getCoverUrl(songInfo)
    const lyrics = options.lyrics || await fetchLyrics(songInfo.hash || songInfo.FileHash || hash)
    
    log('开始下载音频文件:', downloadUrl)
    const response = await fetch(downloadUrl, {
      method: 'GET',
      headers: {
        'Referer': 'https://www.kugou.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    })
    
    if (!response.ok) {
      throw new Error(`音频下载失败: ${response.status}`)
    }
    
    const audioBlob = await response.blob()
    log('音频文件下载完成，大小:', audioBlob.size)
    
    const metadataResult = await embedMusicMetadata(audioBlob, songInfo, coverUrl, lyrics, quality)
    
    // 根据真实音频二进制内容的魔数判断格式，优先于 URL 和 quality 猜测
    // 这样即便 CDN 跳转或代理转换了格式，也能得到正确的扩展名
    const detectExtByMagic = async (blob) => {
      if (!blob || blob.size < 12) return null
      const header = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
      // FLAC: "fLaC" at offset 0
      if (header[0] === 0x66 && header[1] === 0x4C && header[2] === 0x61 && header[3] === 0x43) {
        return 'flac'
      }
      // WAV: "RIFF" + "WAVE"
      if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46
        && header[8] === 0x57 && header[9] === 0x41 && header[10] === 0x56 && header[11] === 0x45) {
        return 'wav'
      }
      // APE: "MAC "
      if (header[0] === 0x4D && header[1] === 0x41 && header[2] === 0x43 && header[3] === 0x20) {
        return 'ape'
      }
      // MP3: ID3 (开头)，或 0xFFF 帧同步 (前 11 bit = 1)
      if (header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) {
        return 'mp3'
      }
      if ((header[0] === 0xFF) && (header[1] & 0xE0) === 0xE0) {
        return 'mp3'
      }
      return null
    }
    
    let fileExt = 'mp3'
    const magicExt = await detectExtByMagic(audioBlob)
    if (magicExt) {
      fileExt = magicExt
      log('从二进制魔数检测到真实文件格式:', fileExt)
    } else if (options.forceExt) {
      // 1. 如果有强制指定的扩展名（兜底用）
      fileExt = options.forceExt
      log('使用强制指定的文件扩展名:', fileExt)
    } else if (downloadUrl) {
      // 2. 再从下载 URL 猜测
      const match = downloadUrl.match(/\.(flac|ape|wav|mp3|mkv)(\?|$)/i)
      if (match) {
        fileExt = match[1].toLowerCase()
        log('从下载 URL 检测到文件格式:', fileExt)
      }
    }
    
    // 3. URL 也没有，再根据 quality 兜底
    if (fileExt === 'mp3') {
      const qualityLower = (quality || '').toLowerCase()
      if (['flac', 'high', 'viper_clear'].includes(qualityLower)) {
        fileExt = 'flac'
      } else if (qualityLower === 'ape') {
        fileExt = 'ape'
      } else if (qualityLower === 'wav') {
        fileExt = 'wav'
      }
    }
    log('最终文件扩展名:', fileExt, '音质:', quality)
    
    const songName = getSongName(songInfo)
    const artistName = getSongArtist(songInfo)
    const fileName = `${songName}-${artistName}.${fileExt}`
    
    log('最终文件名:', fileName)
    
    return {
      success: metadataResult.success,
      outputBlob: metadataResult.outputBlob,
      fileName: fileName,
      message: metadataResult.message,
      songInfo: {
        name: songInfo.name,
        author: songInfo.author,
        album: songInfo.album || songInfo.album_name,
        album_id: songInfo.album_id,
        publish_date: songInfo.publish_date
      }
    }
  } catch (error) {
    logError('下载失败:', error)
    return {
      success: false,
      blob: null,
      fileName: null,
      message: `下载失败: ${error.message}`
    }
  }
}

function getCoverUrl(song) {
  if (!song) return null
  
  if (song.union_cover && song.union_cover.includes('http')) {
    return song.union_cover.replace('{size}', '480').replace(/[`"]/g, '').trim()
  }
  
  if (song.img && song.img.includes('http')) {
    return song.img.replace(/[`"]/g, '').trim()
  }
  
  // 搜索 API 返回的 Image 字段
  if (song.Image && song.Image.includes('http')) {
    return song.Image.replace('{size}', '480').replace(/[`"]/g, '').trim()
  }
  
  if (song.sizable_cover && song.sizable_cover.includes('http')) {
    return song.sizable_cover.replace('{size}', '480').replace(/[`"]/g, '').trim()
  }
  
  if (song.album_info?.sizable_cover && song.album_info.sizable_cover.includes('http')) {
    return song.album_info.sizable_cover.replace('{size}', '480').replace(/[`"]/g, '').trim()
  }
  
  if (song.trans_param?.union_cover && song.trans_param.union_cover.includes('http')) {
    return song.trans_param.union_cover.replace('{size}', '480').replace(/[`"]/g, '').trim()
  }
  
  return null
}
