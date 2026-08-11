// 音质配置 - 统一管理单曲下载和批量下载的音质选项

// 可用音质列表（按优先级排序）
export const QUALITY_OPTIONS = [
    { name: '无损音质 FLAC', quality: 'flac', desc: 'FLAC' },
    { name: '高品质', quality: '320', desc: '320K MP3' },
    { name: '标准音质', quality: '128', desc: '128K MP3' }
];

// 音质降级顺序（从高到低）
export const QUALITY_FALLBACK_ORDER = ['flac', '320', '128'];

// 获取音质显示名称
export function getQualityDisplayName(quality) {
    const option = QUALITY_OPTIONS.find(o => o.quality === quality);
    return option?.name || quality;
}

// 获取音质描述
export function getQualityDescription(quality) {
    const option = QUALITY_OPTIONS.find(o => o.quality === quality);
    if (option) return option.desc;
    if (quality === 'flac') return '无损 FLAC';
    const num = Number(quality);
    if (!isNaN(num)) return `${num}K MP3`;
    return quality || '';
}

// 获取从指定音质开始的降级列表
export function getFallbackList(startQuality) {
    const startIndex = QUALITY_FALLBACK_ORDER.indexOf(startQuality);
    if (startIndex === -1) {
        // 如果不是已知音质，从 320 开始降级
        const idx = QUALITY_FALLBACK_ORDER.indexOf('320');
        return QUALITY_FALLBACK_ORDER.slice(idx);
    }
    return QUALITY_FALLBACK_ORDER.slice(startIndex);
}

// 根据音质获取文件扩展名
export function getFileExtension(quality, downloadUrl) {
    // 优先从 URL 判断真实格式
    if (downloadUrl) {
        const urlLower = downloadUrl.toLowerCase();
        const formatMatch = downloadUrl.match(/\.(flac|ape|wav|mp3|mkv)(\?|$)/i);
        if (formatMatch) {
            return formatMatch[1].toLowerCase();
        }
    }
    
    // 根据音质判断
    const qualityLower = (quality || '').toLowerCase();
    if (qualityLower === 'flac') {
        return 'flac';
    }
    if (qualityLower === 'ape') {
        return 'ape';
    }
    if (qualityLower === 'wav') {
        return 'wav';
    }
    // 默认 mp3
    return 'mp3';
}

// 判断是否需要登录/VIP 的音质
export function isPremiumQuality(quality) {
    const q = (quality || '').toLowerCase();
    return ['flac'].includes(q);
}

// 获取音质图标颜色
export function getQualityIconColor(quality) {
    const q = (quality || '').toLowerCase();
    if (q === 'flac') return '#16a085';
    if (q === '320') return '#667eea';
    return '#95a5a6';
}
