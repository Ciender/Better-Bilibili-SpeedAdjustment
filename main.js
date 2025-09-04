// ==UserScript==
// @name         更好的B站播放器视频倍速调节
// @namespace    http://tampermonkey.net/
// @version      2.4
// @description  滚轮调节+C/X/Z键调节+双击恢复1倍速+兼容原生和其他html5插件+显示剩余时间
// @match        *://*.bilibili.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // --- Script state variables ---
    let lastCustomSpeed = 1.0;
    let currentNotification = null;
    let notificationTimer = null;
    let isInSpeedBox = false;
    let dialogActive = false;
    let notificationStyleAdded = false;

    // --- References to our custom UI elements ---
    let timeDisplayLine1 = null; // Reference to our new Line 1 (Current / Total)
    let speedTimeDisplayLine2 = null; // Reference to our new Line 2 (Speed, Remaining)
    let timeUpdateThrottleTimer = null;

    // --- Helper Functions ---

    function getPlayerContainer(videoElement) {
        if (!videoElement) return document.body;
        const container = videoElement.closest('.bpx-player-container, .player-container, #bilibili-player, #playerWrap');
        return container || videoElement.parentElement || document.body;
    }

    function formatRemainingTimeCompact(totalSeconds) {
        if (isNaN(totalSeconds) || totalSeconds < 0 || !isFinite(totalSeconds)) {
            return '--:--';
        }
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);
        const paddedMinutes = String(minutes).padStart(2, '0');
        const paddedSeconds = String(seconds).padStart(2, '0');
        if (hours > 0) {
            return `${hours}:${paddedMinutes}:${paddedSeconds}`;
        } else {
            return `${paddedMinutes}:${paddedSeconds}`;
        }
    }

    function formatRemainingTime(totalSeconds) {
        if (isNaN(totalSeconds) || totalSeconds <= 0 || !isFinite(totalSeconds)) {
            return '';
        }
        const hours = Math.floor(totalSeconds / 3600);
        totalSeconds %= 3600;
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.floor(totalSeconds % 60);
        let timeString = '';
        if (hours > 0) {
            timeString += `${hours}时${minutes}分${seconds}秒`;
        } else if (minutes > 0) {
            timeString += `${minutes}分${seconds}秒`;
        } else {
            timeString += `${seconds}秒`;
        }
        return `剩余 ${timeString}`;
    }

    function ensureNotificationStyle() {
        if (notificationStyleAdded) return;
        const styleId = 'bili-speed-notifier-style';
        if (document.getElementById(styleId)) {
            notificationStyleAdded = true;
            return;
        }
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            @keyframes biliSpeedFadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
            .bili-speed-notifier-fadeout {
                animation: biliSpeedFadeOut 0.3s 0.5s forwards;
            }
        `;
        document.head.appendChild(style);
        notificationStyleAdded = true;
    }

    // --- UI Elements ---

    // --- Start of modification: New implementation with "Ghost Overlay" technique ---

    /**
     * This function now handles updating BOTH lines of our custom display.
     */
    function updateCustomDisplays() {
        const video = document.querySelector('video');
        if (!video) return;

        // Update Line 1: Current / Total Time
        // We read the data from the original (but now invisible) spans.
        if (timeDisplayLine1) {
            const currentSpan = document.querySelector('.bpx-player-ctrl-time-current');
            const durationSpan = document.querySelector('.bpx-player-ctrl-time-duration');
            if (currentSpan && durationSpan) {
                timeDisplayLine1.textContent = `${currentSpan.textContent} / ${durationSpan.textContent}`;
            }
        }

        // Update Line 2: Speed and Remaining Time
        if (speedTimeDisplayLine2) {
            const speed = video.playbackRate;
            const remainingSeconds = (video.duration - video.currentTime) / speed;
            const formattedSpeed = `${speed.toFixed(1)}x`;
            const formattedTime = formatRemainingTimeCompact(remainingSeconds);
            speedTimeDisplayLine2.textContent = `(${formattedSpeed}, -${formattedTime})`;
        }
    }

    /**
     * This function completely restyles the time display area using the "Ghost Overlay" method.
     */
    function setupSpeedTimeDisplay() {
        if (document.getElementById('custom-time-container')) return;

        const timeContainer = document.querySelector('.bpx-player-ctrl-time');
        const originalTimeLabel = timeContainer ? timeContainer.querySelector('.bpx-player-ctrl-time-label') : null;

        if (!timeContainer || !originalTimeLabel) return;

        // 1. Style the parent container to be a positioning context for the ghost overlay.
        timeContainer.style.position = 'relative';
        timeContainer.style.display = 'flex';
        timeContainer.style.justifyContent = 'center';
        timeContainer.style.alignItems = 'center';
        timeContainer.style.width = '120px';

        // 2. Create our new 2-line visual framework. This is what the user SEES.
        const newContainer = document.createElement('div');
        newContainer.id = 'custom-time-container';
        newContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            line-height: 1.2;
            pointer-events: none; /* Make our visual display non-interactive */
        `;

        const line1 = document.createElement('div');
        line1.id = 'custom-time-display';
        line1.style.fontSize = '13px';
        line1.style.color = '#e0e0e0';

        const line2 = document.createElement('div');
        line2.id = 'custom-speed-time-display';
        line2.style.fontSize = '12px';
        line2.style.color = '#999';

        newContainer.append(line1, line2);
        timeContainer.appendChild(newContainer);

        // 3. Turn the ORIGINAL time label into an invisible "Ghost Overlay".
        // This is what the user CLICKS.
        originalTimeLabel.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            opacity: 0; /* Make it invisible */
            z-index: 1; /* Ensure it's on top */
            cursor: pointer; /* Show the correct cursor on hover */
        `;

        // Store references to our new elements
        timeDisplayLine1 = line1;
        speedTimeDisplayLine2 = line2;

        console.log("Bili Speed Control: Centered display with ghost overlay created.");
        updateCustomDisplays();
    }
    // --- End of modification ---

    function createNotification(speed) {
        if (currentNotification && currentNotification.parentNode) {
            currentNotification.parentNode.removeChild(currentNotification);
            clearTimeout(notificationTimer);
        }
        ensureNotificationStyle();
        const video = document.querySelector('video');
        const parentElement = getPlayerContainer(video);
        const div = document.createElement('div');
        div.style.cssText = `
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: rgba(0, 200, 0, 0.8); color: #fff; padding: 10px 18px; border-radius: 5px;
            font-family: Arial, sans-serif; font-size: 16px; font-weight: bold; z-index: 2147483647;
            pointer-events: none; box-shadow: 0 3px 8px rgba(0,0,0,0.3); white-space: nowrap; text-align: center;
        `;
        if (parentElement === document.body) div.style.position = 'fixed';

        let notificationText = `倍速: ${speed.toFixed(1)}x`;
        if (video && video.duration && isFinite(video.duration) && speed > 0) {
            const remainingTimeAtNewSpeed = (video.duration - video.currentTime) / speed;
            const formattedTime = formatRemainingTime(remainingTimeAtNewSpeed);
            if (formattedTime) {
                notificationText += `<br><span style="font-size: 14px; font-weight: normal;">${formattedTime}</span>`;
            }
        }
        div.innerHTML = notificationText;
        div.classList.add('bili-speed-notifier-fadeout');
        parentElement.appendChild(div);
        currentNotification = div;
        notificationTimer = setTimeout(() => {
            if (div.parentNode) div.parentNode.removeChild(div);
            currentNotification = null;
        }, 800);
    }

    // --- Event Listeners ---

    function initVideoListener(video) {
        if (window.biliSpeedVideoListeners && window.biliSpeedVideoListeners.has(video)) return;

        video.addEventListener('ratechange', () => {
            const currentSpeed = video.playbackRate;
            if (currentSpeed !== 1.0) {
                lastCustomSpeed = currentSpeed;
            }
            updateActiveState(currentSpeed);
            updateCustomDisplays();
        });

        const throttledUpdate = () => {
            if (timeUpdateThrottleTimer) return;
            timeUpdateThrottleTimer = setTimeout(() => {
                updateCustomDisplays();
                timeUpdateThrottleTimer = null;
            }, 250);
        };
        video.addEventListener('timeupdate', throttledUpdate);
        video.addEventListener('loadedmetadata', updateCustomDisplays);
        video.addEventListener('seeked', updateCustomDisplays);

        if (!window.biliSpeedVideoListeners) window.biliSpeedVideoListeners = new WeakMap();
        window.biliSpeedVideoListeners.set(video, true);
        console.log("Bili Speed Control: Listeners added to video element.");

        updateActiveState(video.playbackRate);
        updateCustomDisplays();
        if (video.playbackRate !== 1.0) {
            lastCustomSpeed = video.playbackRate;
        }
    }

    // --- Main Observer Logic ---

    console.log("Bili Speed Control: Script starting...");

    const observer = new MutationObserver(() => {
        requestAnimationFrame(() => {
            const video = document.querySelector('video');
            if (video) {
                setupSpeedTimeDisplay();
                initVideoListener(video);
                addShortcutListener();
            }
            // 使用更通用的选择器来匹配倍速控制按钮
            const speedBox = document.querySelector('.bpx-player-ctrl-playbackrate');
            if (speedBox) initWheelControl(speedBox);

            const menu = document.querySelector('.bpx-player-ctrl-playbackrate-menu');
            if (menu && !menu.querySelector('.custom-speed')) {
                menu.appendChild(createCustomSpeedItem());
            }
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // --- Unchanged Functions (Formatted for readability) ---
    function createAsyncDialog(){if(dialogActive)return;dialogActive=!0;const e=document.querySelector("video"),t=getPlayerContainer(e),o=document.createElement("div");o.style.cssText="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 2147483646; display: flex; justify-content: center; align-items: center;",t===document.body&&(o.style.position="fixed");const n=document.createElement("div");n.style.cssText="background: #fff; padding: 25px; border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.3); min-width: 300px; box-sizing: border-box;",n.addEventListener("click",e=>e.stopPropagation());const i=document.createElement("div");i.textContent="设置播放速度 (0.1 - 16.0)",i.style.cssText="font-size: 18px; margin-bottom: 20px; font-weight: bold; color: #333; text-align: center;";const d=document.createElement("input");d.type="number",d.step="0.1",d.min="0.1",d.max="16";const l=e?e.playbackRate:lastCustomSpeed;d.value=l.toFixed(1),d.style.cssText="width: 100%; padding: 10px 14px; margin-bottom: 20px; border: 1px solid #ccc; border-radius: 4px; font-size: 16px; box-sizing: border-box; text-align: center;";const a=document.createElement("div");a.style.cssText="display: flex; justify-content: space-around; gap: 10px;";const c=document.createElement("button");c.textContent="确定",c.style.cssText="padding: 8px 20px; background: #00a1d6; border: none; border-radius: 4px; color: white; cursor: pointer; font-size: 14px; flex-grow: 1;",c.onmouseover=()=>c.style.background="#00b5e5",c.onmouseout=()=>c.style.background="#00a1d6";const s=document.createElement("button");s.textContent="取消",s.style.cssText="padding: 8px 20px; background: #f0f0f0; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; font-size: 14px; color: #555; flex-grow: 1;",s.onmouseover=()=>s.style.background="#e0e0e0",s.onmouseout=()=>s.style.background="#f0f0f0";const r=()=>{o.parentNode&&o.parentNode.removeChild(o),dialogActive=!1,document.activeElement?.blur(),(t!==document.body?t:document.body).focus()},p=()=>{const e=parseFloat(d.value);if(!isNaN(e)&&e>=.1&&e<=16){const t=document.querySelector("video");t&&(t.playbackRate=e,createNotification(e)),r()}else d.style.borderColor="#ff4d4d",d.style.outline="1px solid #ff4d4d",setTimeout(()=>{d.style.borderColor="#ccc",d.style.outline="none"},1e3),d.focus(),d.select()};o.addEventListener("click",r),s.addEventListener("click",r),c.addEventListener("click",p),d.addEventListener("keydown",e=>{e.key==="Enter"?(e.preventDefault(),p()):e.key==="Escape"&&r()}),a.append(s,c),n.append(i,d,a),o.appendChild(n),t.appendChild(o),requestAnimationFrame(()=>{d.focus(),d.select()})}
    function createCustomSpeedItem(){const e=document.createElement("li");return e.className="bpx-player-ctrl-playbackrate-menu-item custom-speed",e.textContent="自定义倍速",e.style.cursor="pointer",e.style.padding="1x 1x",e.style.textAlign="center",e.addEventListener("click",e=>{e.stopPropagation(),dialogActive||createAsyncDialog()}),e.onmouseover=()=>e.style.backgroundColor="rgba(255, 255, 255, 0.1)",e.onmouseout=()=>e.style.backgroundColor="",e}
    function updateActiveState(e){let t=!1;document.querySelectorAll(".bpx-player-ctrl-playbackrate-menu-item").forEach(o=>{if(!o.classList.contains("custom-speed")){const n=parseFloat(o.dataset.value||o.getAttribute("data-value")||"0");n&&Math.abs(n-e)<.01?(o.classList.add("active"),t=!0):o.classList.remove("active")}});const o=document.querySelector(".custom-speed");o&&o.classList.remove("active");const n=document.querySelector(".bpx-player-ctrl-playbackrate .bpx-player-ctrl-playbackrate-result");n&&(n.textContent=`${e.toFixed(1)}x`)}
    function addShortcutListener(){if("true"===document.body.dataset.biliSpeedKeyListener)return;document.addEventListener("keydown",function(e){if(dialogActive||e.target.matches("input, textarea, [contenteditable]"))return;const t=e.key.toLowerCase(),o=document.querySelector("video");if(o&&("z"===t||"x"===t||"c"===t)&&!e.ctrlKey&&!e.altKey&&!e.metaKey){e.preventDefault(),e.stopPropagation();let n=o.playbackRate;"z"===t?Math.abs(o.playbackRate-1)<.01?n=lastCustomSpeed:(lastCustomSpeed=o.playbackRate,n=1):"x"===t?n=Math.max(.1,Math.round(10*(o.playbackRate-.1))/10):"c"===t&&(n=Math.min(16,Math.round(10*(o.playbackRate+.1))/10)),Math.abs(o.playbackRate-n)>.01&&(o.playbackRate=n,createNotification(n))}},!0),document.body.dataset.biliSpeedKeyListener="true",console.log("Bili Speed Control: Keyboard shortcut listener added.")}
    function handleWheelEvent(e){if(!isInSpeedBox)return;e.preventDefault(),e.stopPropagation();const t=document.querySelector("video");if(!t)return;const o=-.1*Math.sign(e.deltaY);let n=t.playbackRate+o;n=Math.max(.1,Math.min(16,n)),n=Math.round(10*n)/10,Math.abs(t.playbackRate-n)>.01&&(t.playbackRate=n,createNotification(n))}

    // --- MODIFIED FUNCTION ---
    function initWheelControl(speedBoxElement){
        if("true"===speedBoxElement.dataset.biliSpeedWheelAdded)return;

        // 鼠标悬停时
        speedBoxElement.addEventListener("mouseenter",()=>{isInSpeedBox=!0,speedBoxElement.style.cursor="ns-resize"});
        speedBoxElement.addEventListener("mouseleave",()=>{isInSpeedBox=!1,speedBoxElement.style.cursor=""});

        // 滚轮事件
        speedBoxElement.addEventListener("wheel",handleWheelEvent,{passive:!1});

        // --- 新增功能：双击事件 ---
        speedBoxElement.addEventListener('dblclick', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const video = document.querySelector('video');
            // 如果视频存在且当前速度不是1倍速，则进行重置
            if (video && video.playbackRate !== 1.0) {
                lastCustomSpeed = video.playbackRate; // 保存当前速度，以便'Z'键可以恢复
                video.playbackRate = 1.0;
                createNotification(1.0);
            }
        });
        // -------------------------

        speedBoxElement.dataset.biliSpeedWheelAdded="true";
        console.log("Bili Speed Control: Wheel and Dblclick controls added to speed box.");
    }

})();
