<template>
    <div class="cdp-wrapper" ref="wrapperRef">
        <!-- 触发器：点击弹出日历 -->
        <div class="cdp-trigger" @click="togglePanel" :class="{ active: showPanel }">
            <i class="fas fa-calendar-day cdp-trigger-icon"></i>
            <span class="cdp-trigger-text" v-if="modelValue">
                {{ formatDisplay(modelValue) }}
            </span>
            <span class="cdp-trigger-text placeholder" v-else>
                {{ placeholder }}
            </span>
            <button
                v-if="modelValue && showClear"
                class="cdp-clear-btn"
                @click.stop="emit('update:modelValue', '')"
                type="button"
            >
                <i class="fas fa-times"></i>
            </button>
            <i class="fas fa-chevron-down cdp-arrow" :class="{ rotated: showPanel }"></i>
        </div>

        <!-- 日历面板（使用 Teleport 避免被父容器遮挡） -->
        <teleport to="body">
            <transition name="cdp-fade">
                <div ref="panelRef" class="cdp-panel" v-if="showPanel" @click.stop :style="panelStyle">
                    <!-- 中间可滚动区域 -->
                    <div class="cdp-body">
                        <!-- 头部：年月导航 -->
                        <div class="cdp-header">
                            <button class="cdp-nav-btn" @click="changeMonth(-1)" type="button">
                                <i class="fas fa-chevron-left"></i>
                            </button>
                            <div class="cdp-title" @click="toggleYearPicker">
                                <span class="cdp-month">{{ monthNames[viewMonth] }}</span>
                                <span class="cdp-year">{{ viewYear }}</span>
                                <i class="fas fa-caret-down cdp-year-caret" v-if="!showYearPicker"></i>
                            </div>
                            <button class="cdp-nav-btn" @click="changeMonth(1)" type="button">
                                <i class="fas fa-chevron-right"></i>
                            </button>
                        </div>

                        <!-- 年份快速选择 -->
                        <transition name="cdp-fade">
                            <div class="cdp-year-picker" v-if="showYearPicker">
                                <button
                                    class="cdp-year-more-btn"
                                    @click="loadMoreYears(-8)"
                                    type="button"
                                    v-if="yearList[0] > 1900"
                                >
                                    <i class="fas fa-chevron-up"></i> 更早年份
                                </button>
                                <div class="cdp-year-grid">
                                    <button
                                        v-for="y in yearList"
                                        :key="y"
                                        class="cdp-year-item"
                                        :class="{ selected: y === viewYear }"
                                        @click="selectYear(y)"
                                        type="button"
                                    >
                                        {{ y }}
                                    </button>
                                </div>
                                <button
                                    class="cdp-year-more-btn"
                                    @click="loadMoreYears(8)"
                                    type="button"
                                    v-if="yearList[yearList.length - 1] < 2100"
                                >
                                    更多年份 <i class="fas fa-chevron-down"></i>
                                </button>
                            </div>
                        </transition>

                        <!-- 星期表头 -->
                        <div class="cdp-weekdays">
                            <span v-for="w in weekShortNames" :key="w">{{ w }}</span>
                        </div>

                        <!-- 日期网格 -->
                        <div class="cdp-days">
                            <button
                                v-for="(day, idx) in calendarDays"
                                :key="idx"
                                class="cdp-day"
                                :class="{
                                    'other-month': !day.currentMonth,
                                    'today': day.isToday,
                                    'selected': day.isSelected,
                                    'in-range': day.inRange,
                                    'disabled': day.disabled
                                }"
                                @click="selectDay(day)"
                                type="button"
                                :disabled="day.disabled"
                            >
                                {{ day.num }}
                            </button>
                        </div>
                    </div>

                    <!-- 底部操作栏（固定在底部） -->
                    <div class="cdp-footer">
                        <button class="cdp-footer-btn cdp-today" @click="goToday" type="button">
                            <i class="fas fa-crosshairs"></i> 今天
                        </button>
                        <button class="cdp-footer-btn cdp-clear" @click="emit('update:modelValue', '')" type="button">
                            <i class="fas fa-eraser"></i> 清除
                        </button>
                        <button class="cdp-footer-btn cdp-close" @click="showPanel = false" type="button">
                            <i class="fas fa-check"></i> 确定
                        </button>
                    </div>
                </div>
            </transition>
        </teleport>
    </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';

const props = defineProps({
    modelValue: { type: String, default: '' },
    placeholder: { type: String, default: '请选择日期' },
    minDate: { type: String, default: '' },
    maxDate: { type: String, default: '' },
    showClear: { type: Boolean, default: true }
});

const emit = defineEmits(['update:modelValue']);

const wrapperRef = ref(null);
const panelRef = ref(null);
const showPanel = ref(false);
const showYearPicker = ref(false);
const today = new Date();

// 当前视图的年月
const viewYear = ref(today.getFullYear());
const viewMonth = ref(today.getMonth());

// 面板位置（用于 Teleport 后的定位）
const panelStyle = ref({});

const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
const weekShortNames = ['日', '一', '二', '三', '四', '五', '六'];

// 年份列表（前后各 8 年，支持扩展）
const yearList = computed(() => {
    const base = viewYear.value;
    const arr = [];
    for (let y = base - 8; y <= base + 8; y++) arr.push(y);
    return arr;
});

// 加载更多年份
const loadMoreYears = (offset) => {
    viewYear.value += offset;
};

// 更新面板位置
const updatePanelPosition = () => {
    if (!wrapperRef.value || !showPanel.value) return;
    
    const rect = wrapperRef.value.getBoundingClientRect();
    const panelWidth = panelRef.value?.offsetWidth || 320;
    const panelHeight = panelRef.value?.offsetHeight || 450;
    
    // 计算位置，避免超出视窗
    let top = rect.bottom + 8;
    let left = rect.left;
    
    // 底部空间不足时，显示在上方
    if (top + panelHeight > window.innerHeight - 8) {
        top = rect.top - panelHeight - 8;
    }
    
    // 确保 top 不超出顶部
    if (top < 8) top = 8;
    
    // 右侧溢出时，调整位置
    if (left + panelWidth > window.innerWidth - 8) {
        left = window.innerWidth - panelWidth - 8;
    }
    
    // 确保不超出左侧
    if (left < 8) left = 8;
    
    panelStyle.value = {
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        zIndex: 99999
    };
};

// 打开面板时，如果已有值则跳到该值所在月份
watch(showPanel, async (open) => {
    if (open && props.modelValue) {
        const d = parseDate(props.modelValue);
        if (d) {
            viewYear.value = d.getFullYear();
            viewMonth.value = d.getMonth();
        }
    }
    if (!open) showYearPicker.value = false;
    
    // 打开后更新位置
    if (open) {
        await nextTick();
        updatePanelPosition();
    }
});

// 切换年份选择器时重新计算位置（因为面板高度变化）
watch(showYearPicker, async () => {
    if (showPanel.value) {
        await nextTick();
        updatePanelPosition();
    }
});

// 监听滚动和窗口大小变化
const handleScrollOrResize = () => {
    if (showPanel.value) {
        updatePanelPosition();
    }
};

onMounted(() => {
    document.addEventListener('click', handleClickOutside);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
});

onBeforeUnmount(() => {
    document.removeEventListener('click', handleClickOutside);
    window.removeEventListener('scroll', handleScrollOrResize, true);
    window.removeEventListener('resize', handleScrollOrResize);
});

// 工具：解析 YYYY-MM-DD
const parseDate = (str) => {
    if (!str) return null;
    const m = str.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    return null;
};

// 工具：格式化为 YYYY-MM-DD
const toISO = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

// 显示格式
const formatDisplay = (str) => {
    const d = parseDate(str);
    if (!d) return str;
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
};

// 日历网格
const calendarDays = computed(() => {
    const year = viewYear.value;
    const month = viewMonth.value;
    const firstDay = new Date(year, month, 1);
    const startWeekday = firstDay.getDay(); // 0=周日
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    const minD = parseDate(props.minDate);
    const maxD = parseDate(props.maxDate);
    const selectedDate = parseDate(props.modelValue);
    const todayISO = toISO(today);

    const days = [];

    // 上月尾部
    for (let i = startWeekday - 1; i >= 0; i--) {
        const d = new Date(year, month - 1, prevMonthDays - i);
        days.push(buildDay(d, false, minD, maxD, selectedDate, todayISO));
    }
    // 本月
    for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(year, month, i);
        days.push(buildDay(d, true, minD, maxD, selectedDate, todayISO));
    }
    // 下月头部（补满到 42 格 = 6 行）
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
        const d = new Date(year, month + 1, i);
        days.push(buildDay(d, false, minD, maxD, selectedDate, todayISO));
    }
    return days;
});

const buildDay = (d, currentMonth, minD, maxD, selectedDate, todayISO) => {
    const iso = toISO(d);
    let disabled = false;
    if (minD && d < minD) disabled = true;
    if (maxD && d > maxD) disabled = true;
    return {
        num: d.getDate(),
        date: d,
        iso,
        currentMonth,
        isToday: iso === todayISO,
        isSelected: selectedDate && iso === toISO(selectedDate),
        disabled
    };
};

// 交互
const togglePanel = () => {
    showPanel.value = !showPanel.value;
};

const changeMonth = (delta) => {
    let m = viewMonth.value + delta;
    let y = viewYear.value;
    if (m < 0) { m = 11; y--; }
    else if (m > 11) { m = 0; y++; }
    viewMonth.value = m;
    viewYear.value = y;
};

const toggleYearPicker = () => {
    showYearPicker.value = !showYearPicker.value;
};

const selectYear = (y) => {
    viewYear.value = y;
    showYearPicker.value = false;
};

const selectDay = (day) => {
    if (day.disabled) return;
    emit('update:modelValue', day.iso);
    showPanel.value = false;
};

const goToday = () => {
    viewYear.value = today.getFullYear();
    viewMonth.value = today.getMonth();
};

// 点击外部关闭
const handleClickOutside = (e) => {
    if (wrapperRef.value && !wrapperRef.value.contains(e.target)) {
        showPanel.value = false;
    }
};

onMounted(() => document.addEventListener('click', handleClickOutside));
onBeforeUnmount(() => document.removeEventListener('click', handleClickOutside));
</script>

<style scoped>
.cdp-wrapper {
    position: relative;
    width: 100%;
}

/* 触发器 */
.cdp-trigger {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 11px 14px;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.22s ease;
    user-select: none;
}

.cdp-trigger:hover {
    border-color: rgba(167, 139, 250, 0.6);
    background: rgba(0, 0, 0, 0.45);
}

.cdp-trigger.active {
    border-color: rgba(167, 139, 250, 0.85);
    background: rgba(0, 0, 0, 0.55);
    box-shadow: 0 0 0 3px rgba(167, 139, 250, 0.22);
}

.cdp-trigger-icon {
    color: #a78bfa;
    font-size: 14px;
    flex-shrink: 0;
}

.cdp-trigger-text {
    flex: 1;
    font-size: 14px;
    color: #fff;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.cdp-trigger-text.placeholder {
    color: rgba(255, 255, 255, 0.35);
    font-style: italic;
    font-weight: 400;
}

.cdp-clear-btn {
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(239, 68, 68, 0.2);
    color: #fca5a5;
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 50%;
    cursor: pointer;
    font-size: 10px;
    transition: all 0.2s;
    flex-shrink: 0;
}

.cdp-clear-btn:hover {
    background: rgba(239, 68, 68, 0.45);
    color: #fff;
}

.cdp-arrow {
    color: rgba(255, 255, 255, 0.4);
    font-size: 11px;
    transition: transform 0.3s ease;
    flex-shrink: 0;
}

.cdp-arrow.rotated {
    transform: rotate(180deg);
}

/* 日历面板 */
.cdp-panel {
    width: 320px;
    max-height: calc(100vh - 16px);
    padding: 16px;
    background: linear-gradient(145deg, #1e1b2e 0%, #161320 100%);
    border: 1px solid rgba(167, 139, 250, 0.25);
    border-radius: 16px;
    box-shadow:
        0 20px 60px rgba(0, 0, 0, 0.5),
        0 0 0 1px rgba(255, 255, 255, 0.05),
        inset 0 1px 0 rgba(255, 255, 255, 0.06);
    backdrop-filter: blur(20px);
    display: flex;
    flex-direction: column;
    gap: 0;
}

/* 中间可滚动区域 */
.cdp-body {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
}

/* 头部 */
.cdp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
}

.cdp-nav-btn {
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.8);
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
}

.cdp-nav-btn:hover {
    background: rgba(167, 139, 250, 0.25);
    border-color: rgba(167, 139, 250, 0.5);
    color: #fff;
}

.cdp-title {
    display: flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    padding: 6px 14px;
    border-radius: 8px;
    transition: background 0.2s;
}

.cdp-title:hover {
    background: rgba(255, 255, 255, 0.06);
}

.cdp-month {
    font-size: 16px;
    font-weight: 700;
    color: #fff;
}

.cdp-year {
    font-size: 16px;
    font-weight: 700;
    color: #c4b5fd;
    margin-left: 4px;
}

.cdp-year-caret {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.4);
    margin-left: 2px;
}

/* 年份选择器 */
.cdp-year-picker {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
    padding: 8px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 10px;
    max-height: 320px;
    overflow-y: auto;
}

.cdp-year-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.cdp-year-more-btn {
    flex: 1 1 100%;
    padding: 6px;
    background: rgba(167, 139, 250, 0.15);
    border: 1px solid rgba(167, 139, 250, 0.3);
    border-radius: 6px;
    color: #c4b5fd;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.18s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
}

.cdp-year-more-btn:hover {
    background: rgba(167, 139, 250, 0.3);
    color: #fff;
}

.cdp-year-item {
    flex: 1 1 calc(25% - 4px);
    min-width: 60px;
    padding: 6px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 6px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.18s;
}

.cdp-year-item:hover {
    background: rgba(167, 139, 250, 0.2);
    color: #fff;
}

.cdp-year-item.selected {
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: #fff;
    border-color: rgba(167, 139, 250, 0.6);
}

/* 星期表头 */
.cdp-weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
    margin-bottom: 6px;
}

.cdp-weekdays span {
    text-align: center;
    font-size: 11px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.4);
    padding: 4px 0;
    text-transform: uppercase;
}

/* 日期网格 */
.cdp-days {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
}

.cdp-day {
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.85);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.18s ease;
}

.cdp-day:hover:not(.disabled):not(.selected) {
    background: rgba(167, 139, 250, 0.2);
    border-color: rgba(167, 139, 250, 0.35);
    transform: scale(1.05);
}

.cdp-day.other-month {
    color: rgba(255, 255, 255, 0.2);
}

.cdp-day.today {
    border-color: rgba(34, 197, 94, 0.5);
    color: #6ee7b7;
    font-weight: 700;
}

.cdp-day.selected {
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: #fff;
    font-weight: 700;
    border-color: rgba(167, 139, 250, 0.8);
    box-shadow: 0 3px 12px rgba(102, 126, 234, 0.4);
}

.cdp-day.disabled {
    color: rgba(255, 255, 255, 0.15);
    cursor: not-allowed;
    text-decoration: line-through;
}

/* 底部 */
.cdp-footer {
    display: flex;
    gap: 6px;
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    flex-shrink: 0;
}

.cdp-footer-btn {
    flex: 1;
    padding: 8px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.8);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
}

.cdp-today:hover {
    background: rgba(34, 197, 94, 0.25);
    border-color: rgba(34, 197, 94, 0.5);
    color: #6ee7b7;
}

.cdp-clear:hover {
    background: rgba(239, 68, 68, 0.25);
    border-color: rgba(239, 68, 68, 0.5);
    color: #fca5a5;
}

.cdp-close:hover {
    background: rgba(167, 139, 250, 0.3);
    border-color: rgba(167, 139, 250, 0.55);
    color: #fff;
}

/* 过渡动画 */
.cdp-fade-enter-active,
.cdp-fade-leave-active {
    transition: all 0.25s ease;
}

.cdp-fade-enter-from,
.cdp-fade-leave-to {
    opacity: 0;
    transform: translateY(-8px) scale(0.96);
}

/* 移动端 */
@media (max-width: 680px) {
    .cdp-panel {
        width: 280px;
        padding: 14px;
    }
    .cdp-day {
        font-size: 12px;
    }
}
</style>
