// ==UserScript==
// @name         更好的B站播放器视频倍速调节
// @version      6.1
// @description  滚轮调节+触控板优化+快捷键+嵌入式自定义输入(蓝边绿闪)+居中提示修复+新手引导
// @author       Ciender
// @match        *://*.bilibili.com/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // =================================================================================
    // --- 1. 配置与常量 (Config & Constants) ---
    // =================================================================================

    const CONFIG = {
        min: 0.1,            // [Fix] 最低倍速修正为 0.1
        max: 16.0,
        mouseStep: 0.1,      // 鼠标滚轮步进
        touchStep: 0.02,     // 触控板步进
        touchThreshold: 30,  // 触控板防抖阈值
        log: false,
        tourVersion: '6.1_v1',
        storageKey: 'bili_speed_v6_pref'
    };

    const SELECTORS = {
        video: 'video',
        // [Fix] 优先选择视频画面区域，确保提示框在全屏时也能绝对居中
        videoArea: '.bpx-player-video-area, .bpx-player-video-wrap',
        playerContainer: '#bilibili-player, .bpx-player-container, #playerWrap',
        speedBox: '.bpx-player-ctrl-playbackrate',
        speedMenu: '.bpx-player-ctrl-playbackrate-menu',
        speedMenuItem: '.bpx-player-ctrl-playbackrate-menu-item',
        speedResult: '.bpx-player-ctrl-playbackrate-result',
        timeContainer: '.bpx-player-ctrl-time',
        timeLabel: '.bpx-player-ctrl-time-label',
        customInput: '#bili-speed-embedded-input'
    };

    const STATE = {
        lastCustomSpeed: 1.0,
        touchAccumulator: 0,
        internalChange: false,
        initMap: new WeakMap(),
        isTourActive: false
    };

    // =================================================================================
    // --- 2. 样式注入 (CSS Injection) ---
    // =================================================================================

    const STYLES = `
        /* 1. 中央提示框 (毛玻璃风格) - 居中修复 */
        @keyframes biliSpeedFadeOut { from { opacity: 1; transform: translate(-50%, -50%) scale(1); } to { opacity: 0; transform: translate(-50%, -50%) scale(0.95); } }
        .bili-speed-notifier {
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.75); color: #fff; padding: 12px 24px;
            border-radius: 8px; font-size: 18px; font-weight: bold; z-index: 100000;
            pointer-events: none; text-align: center; backdrop-filter: blur(6px);
            box-shadow: 0 4px 16px rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1);
            animation: biliSpeedFadeOut 0.3s 0.8s forwards;
            white-space: nowrap;
        }
        .bili-speed-notifier span { font-size: 13px; font-weight: normal; color: #ccc; display: block; margin-top: 4px; }

        /* 2. 自定义时间显示 */
        .bili-speed-time-wrap { display: flex; flex-direction: column; align-items: center; line-height: 1.3; pointer-events: none; }
        .bili-speed-time-main { font-size: 13px; color: #eee; }
        .bili-speed-time-sub { font-size: 12px; color: #999; transform: scale(0.9); }

        /* 3. 嵌入式输入框 [Fix: 样式增强] */
        .bili-speed-embedded-item {
            padding: 5px 10px; cursor: default; display: flex; justify-content: center;
            border-bottom: 1px solid rgba(255,255,255,0.1); margin-bottom: 5px;
        }
        @keyframes inputBlinkGreen {
            0% { border-color: #4caf50; box-shadow: 0 0 4px rgba(76, 175, 80, 0.5); }
            50% { border-color: #81c784; box-shadow: 0 0 10px rgba(76, 175, 80, 0.8); }
            100% { border-color: #4caf50; box-shadow: 0 0 4px rgba(76, 175, 80, 0.5); }
        }
        .bili-speed-embedded-input {
            width: 60px;
            background: rgba(0, 0, 0, 0.3);
            /* [Req] 默认蓝色描边 */
            border: 2px solid #00a1d6;
            color: #fff; text-align: center; border-radius: 4px; padding: 4px 0; font-size: 13px;
            outline: none; transition: all 0.2s;
            font-weight: bold;
        }
        .bili-speed-embedded-input:focus {
            /* [Req] 点击/聚焦后 绿色闪烁 */
            animation: inputBlinkGreen 1.2s infinite;
            background: rgba(0, 0, 0, 0.6);
        }
        .bili-speed-embedded-input::-webkit-outer-spin-button,
        .bili-speed-embedded-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

        /* 4. 新手引导系统 */
        .tour-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 99999; pointer-events: none; }
        .tour-highlight-box {
            position: absolute; border: 2px solid #00a1d6; border-radius: 4px;
            box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.6); z-index: 100000; pointer-events: none;
            transition: all 0.3s ease;
        }
        .tour-tooltip {
            position: absolute; background: #fff; color: #333; padding: 16px; border-radius: 8px;
            width: 280px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3); z-index: 100001;
            font-size: 14px; line-height: 1.6; transition: all 0.3s ease;
        }
        .tour-tooltip h3 { margin: 0 0 8px 0; color: #00a1d6; font-size: 16px; }
        .tour-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px; }
        .tour-btn { padding: 5px 12px; border-radius: 4px; cursor: pointer; border: none; font-size: 12px; transition: 0.2s; }
        .tour-btn-skip { background: #f0f0f0; color: #666; }
        .tour-btn-next { background: #00a1d6; color: #fff; }
        .tour-force-show { display: block !important; visibility: visible !important; opacity: 1 !important; }
    `;

    function injectStyles() {
        if (document.getElementById('bili-speed-v6-css')) return;
        const style = document.createElement('style');
        style.id = 'bili-speed-v6-css';
        style.textContent = STYLES;
        document.head.appendChild(style);
    }

    // =================================================================================
    // --- 3. 工具与状态管理 (Utils & State) ---
    // =================================================================================

    const Utils = {
        fmtTime: (s) => {
            if (!Number.isFinite(s) || s < 0) return '--:--';
            const h = Math.floor(s / 3600);
            const m = Math.floor((s % 3600) / 60);
            const sec = Math.floor(s % 60);
            return h > 0
                ? `${h}:${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`
                : `${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`;
        },
        fmtRemain: (s) => {
            if (s <= 0 || !Number.isFinite(s)) return '';
            const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
            let txt = '';
            if (h) txt += `${h}时`;
            if (m) txt += `${m}分`;
            txt += `${sec}秒`;
            return `剩余 ${txt}`;
        },
        clamp: (v) => Math.max(CONFIG.min, Math.min(CONFIG.max, v)),
        // [Fix] 增强容器获取逻辑，优先获取视频画面容器
        getContainer: () => {
            return document.querySelector(SELECTORS.videoArea) ||
                   document.querySelector(SELECTORS.playerContainer) ||
                   document.body;
        },
        isTouchpad: (e) => e.deltaMode === 0 && Math.abs(e.deltaY) < 50
    };

    // =================================================================================
    // --- 4. 核心逻辑 (Core Control) ---
    // =================================================================================

    function setSpeed(rawSpeed, source = 'Script') {
        const video = document.querySelector(SELECTORS.video);
        if (!video) return;

        let speed = parseFloat(rawSpeed);
        if (isNaN(speed)) return;

        const finalSpeed = Utils.clamp(Number(speed.toFixed(2)));

        if (Math.abs(video.playbackRate - finalSpeed) > 0.001) {
            STATE.internalChange = true;
            video.playbackRate = finalSpeed;

            if (finalSpeed !== 1.0) STATE.lastCustomSpeed = finalSpeed;

            showNotification(finalSpeed, video);
            updateUI(finalSpeed);

            if (CONFIG.log) console.log(`[Speed] ${finalSpeed}x via ${source}`);
        }
    }

    function updateUI(speed) {
        updateMenuHighlight(speed);
        updateInputBox(speed);
        updateTimeDisplay();
    }

    function showNotification(speed, video) {
        if (STATE.isTourActive) return;

        const old = document.querySelector('.bili-speed-notifier');
        if (old) old.remove();

        // 这里的 Container 获取非常关键，决定了是否居中于视频
        const container = Utils.getContainer();
        // 确保容器有定位属性，否则 absolute 会跑偏
        if (getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }

        const div = document.createElement('div');
        div.className = 'bili-speed-notifier';

        let extraHtml = '';
        if (video && video.duration && speed > 0) {
            const remain = (video.duration - video.currentTime) / speed;
            extraHtml = `<span>${Utils.fmtRemain(remain)}</span>`;
        }
        div.innerHTML = `${speed}x${extraHtml}`;
        container.appendChild(div);

        setTimeout(() => { if(div.parentNode) div.remove(); }, 1500);
    }

    // =================================================================================
    // --- 5. UI 组件逻辑 (UI Components) ---
    // =================================================================================

    function updateMenuHighlight(currentSpeed) {
        document.querySelectorAll(SELECTORS.speedMenuItem).forEach(item => {
            if (item.classList.contains('bili-speed-embedded-item')) return;
            const val = parseFloat(item.dataset.value || item.getAttribute('data-value'));
            if (Math.abs(val - currentSpeed) < 0.01) {
                item.classList.add('bpx-state-active', 'active');
            } else {
                item.classList.remove('bpx-state-active', 'active');
            }
        });

        const resultDiv = document.querySelector(SELECTORS.speedResult);
        if (resultDiv) resultDiv.textContent = (currentSpeed === 1 ? '倍速' : `${currentSpeed.toFixed(1)}x`);
    }

    function updateInputBox(speed) {
        const input = document.querySelector(SELECTORS.customInput);
        if (input && document.activeElement !== input) {
            input.value = speed.toFixed(2);
        }
    }

    function updateTimeDisplay() {
        const video = document.querySelector(SELECTORS.video);
        const line1 = document.getElementById('bst-l1');
        const line2 = document.getElementById('bst-l2');
        const originalCurr = document.querySelector(SELECTORS.timeCurrent);
        const originalDur = document.querySelector(SELECTORS.timeDuration);

        if (!video || !line1 || !line2) return;

        if (originalCurr && originalDur) {
            line1.textContent = `${originalCurr.textContent} / ${originalDur.textContent}`;
        } else {
            line1.textContent = `${Utils.fmtTime(video.currentTime)} / ${Utils.fmtTime(video.duration)}`;
        }

        const speed = video.playbackRate;
        const remain = speed > 0 ? (video.duration - video.currentTime) / speed : 0;
        line2.textContent = `(${speed}x, -${Utils.fmtTime(remain)})`;
    }

    // 注入嵌入式输入框
    function injectEmbeddedInput() {
        const menu = document.querySelector(SELECTORS.speedMenu);
        if (!menu || document.getElementById('bili-speed-embedded-input')) return;

        const li = document.createElement('li');
        li.className = 'bpx-player-ctrl-playbackrate-menu-item bili-speed-embedded-item';

        const input = document.createElement('input');
        input.id = 'bili-speed-embedded-input';
        input.className = 'bili-speed-embedded-input';
        input.type = 'number';
        input.step = '0.1';
        input.min = CONFIG.min;
        input.max = CONFIG.max;
        input.placeholder = '自定义';

        const video = document.querySelector(SELECTORS.video);
        if (video) input.value = video.playbackRate.toFixed(2);

        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                setSpeed(input.value, 'InputBox');
                input.blur();
                menu.style.display = '';
            }
        });

        if (menu.firstChild) {
            menu.insertBefore(li, menu.firstChild);
        } else {
            menu.appendChild(li);
        }
        li.appendChild(input);
    }

    // =================================================================================
    // --- 6. 输入处理 (Input Handling) ---
    // =================================================================================

    function handleWheel(e) {
        e.preventDefault();
        e.stopPropagation();

        const video = document.querySelector(SELECTORS.video);
        if (!video) return;

        let currentRate = video.playbackRate;
        let deltaRate = 0;

        if (Utils.isTouchpad(e)) {
            STATE.touchAccumulator += e.deltaY;
            if (Math.abs(STATE.touchAccumulator) > CONFIG.touchThreshold) {
                const direction = STATE.touchAccumulator > 0 ? 1 : -1;
                deltaRate = direction * -1 * CONFIG.touchStep;
                STATE.touchAccumulator = 0;
            }
        } else {
            const direction = Math.sign(e.deltaY);
            deltaRate = direction * -1 * CONFIG.mouseStep;
        }

        if (deltaRate !== 0) {
            setSpeed(currentRate + deltaRate, 'Wheel/Touch');
        }
    }

    function handleKeys(e) {
        if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.isContentEditable) return;
        if (e.ctrlKey || e.altKey || e.metaKey) return;

        const key = e.key.toLowerCase();
        if (!['z', 'x', 'c'].includes(key)) return;

        const video = document.querySelector(SELECTORS.video);
        if (!video) return;

        e.preventDefault();
        e.stopPropagation();

        if (key === 'c') {
            setSpeed(video.playbackRate + CONFIG.mouseStep, 'Key_C');
        } else if (key === 'x') {
            setSpeed(video.playbackRate - CONFIG.mouseStep, 'Key_X');
        } else if (key === 'z') {
            if (Math.abs(video.playbackRate - 1.0) < 0.01) {
                setSpeed(STATE.lastCustomSpeed, 'Key_Z');
            } else {
                STATE.lastCustomSpeed = video.playbackRate;
                setSpeed(1.0, 'Key_Z');
            }
        }
    }

    // =================================================================================
    // --- 7. 新手引导系统 (Tour Guide) ---
    // =================================================================================

    class TourGuide {
        constructor() {
            this.steps = [];
            this.index = 0;
            this.overlay = null;
            this.tooltip = null;
            this.box = null;
        }

        shouldRun() {
            return localStorage.getItem('bili_speed_tour_done') !== CONFIG.tourVersion;
        }

        start() {
            if (!this.shouldRun()) return;
            setTimeout(() => this.init(), 1000);
        }

        init() {
            STATE.isTourActive = true;
            this.createElements();
            this.defineSteps();
            this.showStep(0);
        }

        createElements() {
            this.box = document.createElement('div');
            this.box.className = 'tour-highlight-box';

            this.tooltip = document.createElement('div');
            this.tooltip.className = 'tour-tooltip';

            document.body.append(this.box, this.tooltip);
        }

        defineSteps() {
            this.steps = [
                {
                    sel: SELECTORS.speedBox,
                    title: '倍速控制增强',
                    text: '👋 欢迎使用！<br>把鼠标悬停在这里，可以直接使用<b>滚轮</b>调节速度。<br>我们专门优化了<b>触控板</b>，体验丝滑。'
                },
                {
                    sel: SELECTORS.customInput,
                    title: '自定义输入框 (已更新)',
                    text: '🔢 <b>输入框更显眼了！</b><br>现在有清晰的蓝色描边。点击它，会变成绿色闪烁，直接输入数字并回车即可。',
                    prepare: () => {
                        const menu = document.querySelector(SELECTORS.speedMenu);
                        if(menu) menu.classList.add('tour-force-show');
                    },
                    cleanup: () => {
                        const menu = document.querySelector(SELECTORS.speedMenu);
                        if(menu) menu.classList.remove('tour-force-show');
                    }
                },
                {
                    sel: null,
                    title: '快捷键',
                    text: '⌨️ <b>快捷键：</b><br>C 加速 / X 减速 / Z 重置<br><br>'
                }
            ];
        }

        showStep(i) {
            if (i >= this.steps.length) return this.end();
            this.index = i;
            const step = this.steps[i];

            if (this.currentCleanup) this.currentCleanup();
            if (step.prepare) step.prepare();
            this.currentCleanup = step.cleanup;

            let rect;
            if (step.sel) {
                const el = document.querySelector(step.sel);
                if (el) rect = el.getBoundingClientRect();
            }

            if (rect) {
                this.box.style.display = 'block';
                this.box.style.width = rect.width + 'px';
                this.box.style.height = rect.height + 'px';
                this.box.style.top = (rect.top + window.scrollY) + 'px';
                this.box.style.left = (rect.left + window.scrollX) + 'px';

                this.tooltip.style.top = (rect.top + window.scrollY) + 'px';
                this.tooltip.style.left = (rect.left + window.scrollX - 300) + 'px';
                this.tooltip.style.transform = '';
            } else {
                this.box.style.display = 'none';
                this.tooltip.style.top = '50%';
                this.tooltip.style.left = '50%';
                this.tooltip.style.transform = 'translate(-50%, -50%)';
            }

            this.tooltip.innerHTML = `
                <h3>${step.title}</h3>
                <div>${step.text}</div>
                <div class="tour-footer">
                    <button class="tour-btn tour-btn-skip">跳过</button>
                    <button class="tour-btn tour-btn-next">${i === this.steps.length - 1 ? '完成' : '下一步'}</button>
                </div>
            `;

            this.tooltip.querySelector('.tour-btn-next').onclick = () => this.showStep(i + 1);
            this.tooltip.querySelector('.tour-btn-skip').onclick = () => this.end();
        }

        end() {
            if (this.currentCleanup) this.currentCleanup();
            this.box.remove();
            this.tooltip.remove();
            STATE.isTourActive = false;
            localStorage.setItem('bili_speed_tour_done', CONFIG.tourVersion);
        }
    }

    // =================================================================================
    // --- 8. 初始化与事件绑定 (Init & Events) ---
    // =================================================================================

    function initVideoEvents(video) {
        if (STATE.initMap.has(video)) return;

        video.addEventListener('ratechange', () => {
            if (STATE.internalChange) {
                STATE.internalChange = false;
            } else {
                showNotification(video.playbackRate, video);
                if (video.playbackRate !== 1) STATE.lastCustomSpeed = video.playbackRate;
            }
            updateUI(video.playbackRate);
        });

        let tick = false;
        video.addEventListener('timeupdate', () => {
            if (tick) return;
            tick = true;
            setTimeout(() => { updateTimeDisplay(); tick = false; }, 500);
        });

        STATE.initMap.set(video, true);
        updateUI(video.playbackRate);
    }

    function initUI() {
        const speedBox = document.querySelector(SELECTORS.speedBox);
        if (speedBox && !STATE.initMap.has(speedBox)) {
            speedBox.addEventListener('wheel', handleWheel, { passive: false });
            speedBox.addEventListener('dblclick', (e) => { e.stopPropagation(); setSpeed(1.0, 'DblClick'); });
            STATE.initMap.set(speedBox, true);
        }

        injectEmbeddedInput();

        const timeContainer = document.querySelector(SELECTORS.timeContainer);
        const label = document.querySelector(SELECTORS.timeLabel);
        if (timeContainer && label && !document.getElementById('bst-l1')) {
            label.style.opacity = '0';
            label.style.position = 'absolute';
            label.style.pointerEvents = 'none';
            const wrap = document.createElement('div');
            wrap.className = 'bili-speed-time-wrap';
            wrap.innerHTML = `<div id="bst-l1" class="bili-speed-time-main">--:-- / --:--</div><div id="bst-l2" class="bili-speed-time-sub"></div>`;
            timeContainer.style.justifyContent = 'center';
            timeContainer.appendChild(wrap);
        }
    }

    function mainLoop() {
        const video = document.querySelector(SELECTORS.video);
        if (video) {
            initVideoEvents(video);
            initUI();

            if (!window._biliSpeedTourInited) {
                window._biliSpeedTourInited = true;
                new TourGuide().start();
            }
        }
    }

    injectStyles();
    document.addEventListener('keydown', handleKeys, true);
    setInterval(mainLoop, 1000);

    console.log('[BiliSpeedControl] v6.1 Loaded');

})();

