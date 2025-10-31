// ==UserScript==
// @name         更好的B站播放器视频倍速调节 (最终修复版)
// @version      4.7
// @description  滚轮调节+C/X/Z键调节+双击恢复1倍速+兼容原生和其他html5插件+显示剩余时间
// @author       Ciender
// @match        *://*.bilibili.com/*
// @grant        none
// ==/UserScript==



(function() {
    'use strict';

    // =================================================================================
    // --- 1. 用户配置 (USER CONFIGURATION) ---
    // =================================================================================

    const USER_CONFIG = {
        /**
         * 是否在F12控制台输出详细的调试日志。
         * true:  开启日志 (默认)
         * false: 关闭日志
         */
        enableConsoleLog: false,
    };

    // =================================================================================
    // --- 2. 内部配置与状态管理 (Internal Config & State) ---
    // =================================================================================

    const CONFIG = {
        minSpeed: 0.1,
        maxSpeed: 16.0,
        speedStep: 0.1,
        timeUpdateThrottleDelay: 250,
    };

    const STATE = {
        lastCustomSpeed: 1.0,
        currentNotification: null,
        notificationTimer: null,
        isMouseOverSpeedBox: false,
        isDialogActive: false,
        timeUpdateThrottleTimer: null,
        internalSpeedChange: false, // 标记是否由本脚本内部函数触发的速度变更
        lastKnownSpeed: 1.0,        // 持续追踪上一次的速度值，用于修复原生菜单日志
        dragState: { isDragging: false, offsetX: 0, offsetY: 0 },
        flags: {
            isInitialRateChangeEvent: true, // 标记是否为视频加载后的首次ratechange事件
            notificationStyleAdded: false,
            shortcutListenerAdded: false,
            timeDisplayInitialized: false,
            initializedElements: new WeakMap(),
        }
    };

    // =================================================================================
    // --- 3. 核心逻辑 (Core Logic) ---
    // =================================================================================

    function changeSpeed(newSpeed, triggerSource) {
        const video = document.querySelector('video');
        if (!video) return;
        const oldSpeed = video.playbackRate;
        let formattedSpeed = Math.max(CONFIG.minSpeed, Math.min(CONFIG.maxSpeed, newSpeed));
        if (Math.abs(oldSpeed - formattedSpeed) > 0.001) {
            STATE.internalSpeedChange = true;
            video.playbackRate = formattedSpeed;
            createNotification(formattedSpeed);
            logSpeedChange(triggerSource, oldSpeed, formattedSpeed, video.currentTime);
        }
    }

    function logSpeedChange(trigger, oldSpeed, newSpeed, currentTime) {
        if (!USER_CONFIG.enableConsoleLog) return;
        const displayNewSpeed = newSpeed.toFixed(2).replace(/\.?0+$/, '');
        const displayOldSpeed = typeof oldSpeed === 'number' ? oldSpeed.toFixed(2).replace(/\.?0+$/, '') : oldSpeed;
        console.groupCollapsed(`%c[BiliSpeedControl] %c速度变更: %c${displayNewSpeed}x`, 'color: #00a1d6; font-weight: bold;', 'color: default;', 'color: #f5222d; font-weight: bold;');
        console.log(`触发方式: ${trigger}`);
        console.log(`变更前速度: ${displayOldSpeed}x (实际值: ${oldSpeed})`);
        console.log(`变更后速度: ${displayNewSpeed}x (实际值: ${newSpeed})`);
        console.log(`视频时间点: ${formatTimeCompact(currentTime)}`);
        console.groupEnd();
    }

    // =================================================================================
    // --- 4. 辅助函数 (Helper Functions) ---
    // =================================================================================

    function getPlayerContainer(videoElement) {
        if (!videoElement) return document.body;
        const container = videoElement.closest('.bpx-player-container, .player-container, #bilibili-player, #playerWrap');
        return container || videoElement.parentElement || document.body;
    }

    function formatTimeCompact(totalSeconds) {
        if (isNaN(totalSeconds) || totalSeconds < 0 || !isFinite(totalSeconds)) return '--:--';
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);
        const paddedMinutes = String(minutes).padStart(2, '0');
        const paddedSeconds = String(seconds).padStart(2, '0');
        return hours > 0 ? `${hours}:${paddedMinutes}:${paddedSeconds}` : `${paddedMinutes}:${paddedSeconds}`;
    }

    function formatRemainingTimeVerbose(totalSeconds) {
        if (isNaN(totalSeconds) || totalSeconds <= 0 || !isFinite(totalSeconds)) return '';
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);
        let timeString = '';
        if (hours > 0) timeString += `${hours}时${minutes}分${seconds}秒`;
        else if (minutes > 0) timeString += `${minutes}分${seconds}秒`;
        else timeString += `${seconds}秒`;
        return `剩余 ${timeString}`;
    }

    // =================================================================================
    // --- 5. UI组件 (UI Components) ---
    // =================================================================================

    function ensureNotificationStyle() {
        if (STATE.flags.notificationStyleAdded) return;
        const styleId = 'bili-speed-enhancer-style';
        if (document.getElementById(styleId)) { STATE.flags.notificationStyleAdded = true; return; }
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `@keyframes biliSpeedFadeOut{from{opacity:1}to{opacity:0}}.bili-speed-notifier{animation:biliSpeedFadeOut .3s .5s forwards}`;
        document.head.appendChild(style);
        STATE.flags.notificationStyleAdded = true;
    }

    function createNotification(speed) {
        if (STATE.currentNotification && STATE.currentNotification.parentNode) {
            STATE.currentNotification.parentNode.removeChild(STATE.currentNotification);
            clearTimeout(STATE.notificationTimer);
        }
        ensureNotificationStyle();
        const video = document.querySelector('video');
        const parentElement = getPlayerContainer(video);
        const div = document.createElement('div');
        div.className = 'bili-speed-notifier';
        div.style.cssText = `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,155,0,.8);color:#fff;padding:10px 18px;border-radius:5px;font-family:Arial,sans-serif;font-size:16px;font-weight:700;z-index:2147483647;pointer-events:none;box-shadow:0 3px 8px rgba(0,0,0,.3);white-space:nowrap;text-align:center`;
        if (parentElement === document.body) div.style.position = 'fixed';
        const displaySpeed = speed.toFixed(2).replace(/\.?0+$/, '');
        let remainingText = '';
        if (video && video.duration && isFinite(video.duration) && speed > 0) {
            const remainingTime = (video.duration - video.currentTime) / speed;
            const formattedTime = formatRemainingTimeVerbose(remainingTime);
            if (formattedTime) remainingText = `<br><span style="font-size:14px;font-weight:400">${formattedTime}</span>`;
        }
        div.innerHTML = `倍速: ${displaySpeed}x${remainingText}`;
        parentElement.appendChild(div);
        STATE.currentNotification = div;
        STATE.notificationTimer = setTimeout(() => {
            if (div.parentNode) div.parentNode.removeChild(div);
            STATE.currentNotification = null;
        }, 800);
    }

    function updateCustomTimeDisplay() {
        const video = document.querySelector('video');
        const timeDisplayLine1 = document.getElementById('custom-time-display');
        const speedTimeDisplayLine2 = document.getElementById('custom-speed-time-display');
        if (!video || !timeDisplayLine1 || !speedTimeDisplayLine2) return;
        const currentSpan = document.querySelector('.bpx-player-ctrl-time-current');
        const durationSpan = document.querySelector('.bpx-player-ctrl-time-duration');
        if (currentSpan && durationSpan) timeDisplayLine1.textContent = `${currentSpan.textContent} / ${durationSpan.textContent}`;
        const speed = video.playbackRate;
        const displaySpeed = speed.toFixed(2).replace(/\.?0+$/, '');
        const remainingSeconds = speed > 0 ? (video.duration - video.currentTime) / speed : Infinity;
        speedTimeDisplayLine2.textContent = `(${displaySpeed}x, -${formatTimeCompact(remainingSeconds)})`;
    }

    function createCustomSpeedDialog() {
        if (STATE.isDialogActive) return;
        STATE.isDialogActive = true;
        const video = document.querySelector("video");
        const container = getPlayerContainer(video);
        const dialog = document.createElement("div");
        dialog.id = 'bili-speed-custom-dialog';
        dialog.style.cssText = `position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border-radius:8px;box-shadow:0 5px 15px rgba(0,0,0,.3);min-width:300px;box-sizing:border-box;z-index:2147483647;display:flex;flex-direction:column`;
        if (container === document.body) dialog.style.position = "fixed";
        const titleBar = document.createElement("div");
        titleBar.textContent = "设置播放速度";
        titleBar.style.cssText = `padding:10px 15px;font-size:16px;font-weight:700;color:#333;text-align:center;cursor:move;border-bottom:1px solid #eee;user-select:none;-webkit-user-select:none`;
        const content = document.createElement("div");
        content.style.padding = "20px";
        const input = document.createElement("input");
        input.type = "number"; input.step = "0.01"; input.min = CONFIG.minSpeed; input.max = CONFIG.maxSpeed;
        input.value = (video ? video.playbackRate : STATE.lastCustomSpeed).toFixed(2);
        input.style.cssText = "width:100%;padding:10px 14px;margin-bottom:20px;border:1px solid #ccc;border-radius:4px;font-size:16px;box-sizing:border-box;text-align:center";
        const buttonContainer = document.createElement("div");
        buttonContainer.style.cssText = "display:flex;justify-content:space-around;gap:10px";
        const confirmBtn = document.createElement("button");
        confirmBtn.textContent = "确定";
        confirmBtn.style.cssText = "padding:8px 20px;background:#00a1d6;border:none;border-radius:4px;color:#fff;cursor:pointer;font-size:14px;flex-grow:1;transition:background-color .2s";
        confirmBtn.onmouseover = () => confirmBtn.style.background = "#00b5e5";
        confirmBtn.onmouseout = () => confirmBtn.style.background = "#00a1d6";
        const cancelBtn = document.createElement("button");
        cancelBtn.textContent = "取消";
        cancelBtn.style.cssText = "padding:8px 20px;background:#f0f0f0;border:1px solid #ddd;border-radius:4px;cursor:pointer;font-size:14px;color:#555;flex-grow:1;transition:background-color .2s";
        cancelBtn.onmouseover = () => cancelBtn.style.background = "#e0e0e0";
        cancelBtn.onmouseout = () => cancelBtn.style.background = "#f0f0f0";
        const closeDialog = () => { if (dialog.parentNode) dialog.parentNode.removeChild(dialog); STATE.isDialogActive = false; };
        const confirmAction = () => {
            const newSpeed = parseFloat(input.value);
            if (!isNaN(newSpeed) && newSpeed >= CONFIG.minSpeed && newSpeed <= CONFIG.maxSpeed) { changeSpeed(newSpeed, "自定义对话框"); closeDialog(); }
            else { input.style.borderColor = "#ff4d4d"; setTimeout(() => { input.style.borderColor = "#ccc"; }, 1000); input.focus(); input.select(); }
        };
        cancelBtn.addEventListener("click", closeDialog);
        confirmBtn.addEventListener("click", confirmAction);
        input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); confirmAction(); } else if (e.key === "Escape") closeDialog(); });
        const onDragStart = (e) => {
            STATE.dragState.isDragging = true; STATE.dragState.offsetX = e.clientX - dialog.offsetLeft; STATE.dragState.offsetY = e.clientY - dialog.offsetTop;
            document.addEventListener('mousemove', onDragging); document.addEventListener('mouseup', onDragEnd);
        };
        const onDragging = (e) => {
            if (!STATE.dragState.isDragging) return;
            const newX = e.clientX - STATE.dragState.offsetX; const newY = e.clientY - STATE.dragState.offsetY;
            dialog.style.left = `${newX}px`; dialog.style.top = `${newY}px`; dialog.style.transform = 'none';
        };
        const onDragEnd = () => { STATE.dragState.isDragging = false; document.removeEventListener('mousemove', onDragging); document.removeEventListener('mouseup', onDragEnd); };
        titleBar.addEventListener('mousedown', onDragStart);
        buttonContainer.append(cancelBtn, confirmBtn); content.append(input, buttonContainer); dialog.append(titleBar, content);
        container.appendChild(dialog); requestAnimationFrame(() => { input.focus(); input.select(); });
    }

    // =================================================================================
    // --- 6. 事件处理器 (Event Handlers) ---
    // =================================================================================

    function onWheel(event) {
        if (!STATE.isMouseOverSpeedBox) return;
        event.preventDefault(); event.stopPropagation();
        const video = document.querySelector("video");
        if (!video) return;
        const direction = -Math.sign(event.deltaY);
        let newSpeed = Math.round((video.playbackRate + (direction * CONFIG.speedStep)) * 10) / 10;
        changeSpeed(newSpeed, "滚轮");
    }

    function onKeyDown(event) {
        if (STATE.isDialogActive || event.target.matches("input, textarea, [contenteditable]")) return;
        const key = event.key.toLowerCase();
        const video = document.querySelector("video");
        if (!video || !['z', 'x', 'c'].includes(key) || event.ctrlKey || event.altKey || event.metaKey) return;
        event.preventDefault(); event.stopPropagation();
        let newSpeed = video.playbackRate;
        let trigger = `快捷键 '${key}'`;
        if (key === 'z') {
            if (Math.abs(video.playbackRate - 1.0) < 0.001) newSpeed = STATE.lastCustomSpeed;
            else { STATE.lastCustomSpeed = video.playbackRate; newSpeed = 1.0; }
        } else {
            const direction = (key === 'c' ? 1 : -1);
            newSpeed = Math.round((video.playbackRate + (direction * CONFIG.speedStep)) * 10) / 10;
        }
        changeSpeed(newSpeed, trigger);
    }

    function onDoubleClick(event) {
        event.preventDefault(); event.stopPropagation();
        const video = document.querySelector('video');
        if (video && video.playbackRate !== 1.0) {
            STATE.lastCustomSpeed = video.playbackRate;
            changeSpeed(1.0, "双击重置");
        }
    }

    /**
     * 视频速度变化事件处理器 (核心修复逻辑)
     */
    function onRateChange(event) {
        const video = event.target;
        const oldSpeed = STATE.lastKnownSpeed;
        const newSpeed = video.playbackRate;

        // **修复1: 处理首次加载**
        // 如果是首次事件，则不显示通知，只更新UI和状态，然后退出
        if (STATE.flags.isInitialRateChangeEvent) {
            STATE.flags.isInitialRateChangeEvent = false; // 关闭标志
            // 照常更新所有UI状态
            if (newSpeed !== 1.0) STATE.lastCustomSpeed = newSpeed;
            updateActiveState(newSpeed);
            updateCustomTimeDisplay();
            STATE.lastKnownSpeed = newSpeed; // 更新速度记录
            return;
        }

        // **修复2: 处理原生菜单兼容性**
        if (STATE.internalSpeedChange) {
            // 来源是本脚本，通知和日志已处理，只需重置标志位
            STATE.internalSpeedChange = false;
        } else {
            // 来源是外部（如原生菜单），在此处创建通知和日志
            createNotification(newSpeed);
            logSpeedChange("外部/原生菜单", oldSpeed, newSpeed, video.currentTime);
        }

        // --- 通用UI更新 ---
        if (newSpeed !== 1.0) STATE.lastCustomSpeed = newSpeed;
        updateActiveState(newSpeed);
        updateCustomTimeDisplay();

        // **关键**：在事件处理的最后，更新速度记录
        STATE.lastKnownSpeed = newSpeed;
    }

    /** 辅助函数: 仅用于更新B站原生菜单的UI active状态 */
    function updateActiveState(currentSpeed) {
        document.querySelectorAll(".bpx-player-ctrl-playbackrate-menu-item:not(.custom-speed)").forEach(item => {
            const speedVal = parseFloat(item.dataset.value || item.getAttribute("data-value"));
            item.classList.toggle('active', speedVal && Math.abs(speedVal - currentSpeed) < 0.001);
        });
        const resultEl = document.querySelector(".bpx-player-ctrl-playbackrate-result");
        if (resultEl) resultEl.textContent = `${currentSpeed.toFixed(1)}x`;
    }

    function onTimeUpdateThrottled() {
        if (STATE.timeUpdateThrottleTimer) return;
        STATE.timeUpdateThrottleTimer = setTimeout(() => {
            updateCustomTimeDisplay();
            STATE.timeUpdateThrottleTimer = null;
        }, CONFIG.timeUpdateThrottleDelay);
    }

    // =================================================================================
    // --- 7. 初始化器 (Initializers) ---
    // =================================================================================

    function initCustomTimeDisplay() {
        if (STATE.flags.timeDisplayInitialized) return;
        const timeContainer = document.querySelector('.bpx-player-ctrl-time');
        const originalLabel = timeContainer?.querySelector('.bpx-player-ctrl-time-label');
        if (!timeContainer || !originalLabel) return;
        timeContainer.style.cssText = 'position:relative;display:flex;justify-content:center;align-items:center;width:120px';
        const newContainer = document.createElement('div');
        newContainer.style.cssText = 'display:flex;flex-direction:column;align-items:center;line-height:1.2;pointer-events:none';
        newContainer.innerHTML = '<div id="custom-time-display" style="font-size:13px;color:#e0e0e0"></div><div id="custom-speed-time-display" style="font-size:12px;color:#999"></div>';
        timeContainer.appendChild(newContainer);
        originalLabel.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;z-index:1;cursor:pointer';
        STATE.flags.timeDisplayInitialized = true;
        updateCustomTimeDisplay();
    }

    function initVideoListeners(video) {
        if (STATE.flags.initializedElements.has(video)) return;

        // **关键**：在添加监听器前，设置首次加载标志并初始化速度记录
        STATE.flags.isInitialRateChangeEvent = true;
        STATE.lastKnownSpeed = video.playbackRate;

        video.addEventListener('ratechange', onRateChange);
        video.addEventListener('timeupdate', onTimeUpdateThrottled);
        video.addEventListener('loadedmetadata', updateCustomTimeDisplay);
        video.addEventListener('seeked', updateCustomTimeDisplay);

        STATE.flags.initializedElements.set(video, true);
        if (video.playbackRate !== 1.0) STATE.lastCustomSpeed = video.playbackRate;

        // 首次加载时手动调用一次UI更新，确保界面正确显示初始状态
        updateActiveState(video.playbackRate);
        updateCustomTimeDisplay();
    }

    function initSpeedBoxControls(speedBox) {
        if (STATE.flags.initializedElements.has(speedBox)) return;
        speedBox.addEventListener("mouseenter", () => { STATE.isMouseOverSpeedBox = true; speedBox.style.cursor = "ns-resize"; });
        speedBox.addEventListener("mouseleave", () => { STATE.isMouseOverSpeedBox = false; speedBox.style.cursor = ""; });
        speedBox.addEventListener("wheel", onWheel, { passive: false });
        speedBox.addEventListener('dblclick', onDoubleClick);
        STATE.flags.initializedElements.set(speedBox, true);
    }

    function initShortcutListener() {
        if (STATE.flags.shortcutListenerAdded) return;
        document.addEventListener("keydown", onKeyDown, true);
        STATE.flags.shortcutListenerAdded = true;
    }

    function initCustomSpeedMenuItem(menu) {
        if (menu.querySelector('.custom-speed')) return;
        const item = document.createElement("li");
        item.className = "bpx-player-ctrl-playbackrate-menu-item custom-speed";
        item.textContent = "自定义倍速";
        item.style.cssText = "cursor:pointer;padding:5px 0;text-align:center;font-size:12px";
        item.addEventListener("click", e => { e.stopPropagation(); createCustomSpeedDialog(); });
        item.onmouseover = () => item.style.backgroundColor = "rgba(255,255,255,.1)";
        item.onmouseout = () => item.style.backgroundColor = "";
        menu.appendChild(item);
    }

    // =================================================================================
    // --- 8. 调试与公共API (Debug & Public API) ---
    // =================================================================================

    const BiliSpeedControlAPI = {
        setSpeed: (speed) => { if (typeof speed !== 'number') { console.error('[BiliSpeedControl] Error: speed must be a number.'); return; } changeSpeed(speed, "API Call: setSpeed()"); },
        resetSpeed: () => BiliSpeedControlAPI.setSpeed(1.0),
        toggleLogging: (enable) => { if (typeof enable === 'boolean') USER_CONFIG.enableConsoleLog = enable; else USER_CONFIG.enableConsoleLog = !USER_CONFIG.enableConsoleLog; console.log(`%c[BiliSpeedControl] Console logging is now ${USER_CONFIG.enableConsoleLog ? 'ENABLED' : 'DISABLED'}.`, 'color: #00a1d6; font-weight: bold;'); },
        getStatus: () => { const video = document.querySelector('video'); return { isLoggingEnabled: USER_CONFIG.enableConsoleLog, currentSpeed: video ? video.playbackRate : 'N/A', lastCustomSpeed: STATE.lastCustomSpeed, isDialogActive: STATE.isDialogActive, }; }
    };
    window.BiliSpeedControlAPI = BiliSpeedControlAPI;

    // =================================================================================
    // --- 9. 主执行逻辑 (Main Execution) ---
    // =================================================================================

    function main() {
        requestAnimationFrame(() => {
            const video = document.querySelector('video');
            if (video) { initCustomTimeDisplay(); initVideoListeners(video); initShortcutListener(); }
            const speedBox = document.querySelector('.bpx-player-ctrl-playbackrate');
            if (speedBox) initSpeedBoxControls(speedBox);
            const speedMenu = document.querySelector('.bpx-player-ctrl-playbackrate-menu');
            if (speedMenu) initCustomSpeedMenuItem(speedMenu);
        });
    }

    console.log("%c[BiliSpeedControl] %c脚本已启动，开始监视播放器...", 'color: #00a1d6; font-weight: bold;', 'color: default;');
    const observer = new MutationObserver(main);
    observer.observe(document.body, { childList: true, subtree: true });

})();
