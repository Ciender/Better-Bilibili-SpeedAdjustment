// ==UserScript==
// @name         B站播放器视频倍速调节
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  滚轮调节+异步弹窗+C键切换+绿色提示+[修复卡顿]+兼容原生
// @author       deepseek
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let lastCustomSpeed = 1.0;
    let currentNotification = null;
    let isInSpeedBox = false;
    let dialogActive = false;

    // 创建绿色提示框
    function createNotification(speed) {
        if (currentNotification) {
            document.body.removeChild(currentNotification);
            currentNotification = null;
        }

        const div = document.createElement('div');
        div.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 255, 0, 0.7);
            color: #000;
            padding: 8px 15px;
            border-radius: 4px;
            font-family: Arial, sans-serif;
            font-size: 14px;
            font-weight: bold;
            z-index: 999999;
            pointer-events: none;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            animation: fadeOut 0.2s 0.5s forwards;
        `;
        div.textContent = `当前速度：${speed.toFixed(1)}x`;

        const style = document.createElement('style');
        style.textContent = `@keyframes fadeOut { from { opacity:1; } to { opacity:0; } }`;
        document.head.appendChild(style);

        document.body.appendChild(div);
        currentNotification = div;

        setTimeout(() => {
            if (div.parentNode) {
                document.body.removeChild(div);
                document.head.removeChild(style);
                currentNotification = null;
            }
        }, 700);
    }

    // 异步输入对话框
    function createAsyncDialog() {
        if (dialogActive) return;
        dialogActive = true;

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.3);
            z-index: 1000000;
            display: flex;
            justify-content: center;
            align-items: center;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: #fff;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            min-width: 280px;
        `;

        const title = document.createElement('div');
        title.textContent = '设置播放速度';
        title.style.cssText = `
            font-size: 16px;
            margin-bottom: 15px;
            font-weight: bold;
            color: #333;
        `;

        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.1';
        input.min = '0.1';
        input.max = '16';
        input.value = lastCustomSpeed.toFixed(1);
        input.style.cssText = `
            width: 100%;
            padding: 8px 12px;
            margin-bottom: 15px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            box-sizing: border-box;
        `;

        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = `
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        `;

        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = '确定';
        confirmBtn.style.cssText = `
            padding: 6px 16px;
            background: #00a1d6;
            border: none;
            border-radius: 4px;
            color: white;
            cursor: pointer;
        `;

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.style.cssText = `
            padding: 6px 16px;
            background: #f0f0f0;
            border: 1px solid #ddd;
            border-radius: 4px;
            cursor: pointer;
        `;

        const cleanup = () => {
            overlay.remove();
            dialogActive = false;
        };

        const applySpeed = () => {
            const num = parseFloat(input.value);
            if (!isNaN(num) && num >= 0.1 && num <= 16) {
                const video = document.querySelector('video');
                if (video) {
                    video.playbackRate = num;
                    lastCustomSpeed = num;
                    createNotification(num);
                    updateActiveState(num);
                }
                cleanup();
            } else {
                input.style.borderColor = '#ff4d4d';
                setTimeout(() => input.style.borderColor = '#ddd', 500);
            }
        };

        overlay.addEventListener('click', e => e.target === overlay && cleanup());
        cancelBtn.addEventListener('click', cleanup);
        confirmBtn.addEventListener('click', applySpeed);
        input.addEventListener('keydown', e => e.key === 'Enter' && applySpeed());

        btnContainer.append(cancelBtn, confirmBtn);
        dialog.append(title, input, btnContainer);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        input.focus();
    }

    // 创建自定义菜单项
    function createCustomSpeedItem() {
        const li = document.createElement('li');
        li.className = 'bpx-player-ctrl-playbackrate-menu-item custom-speed';
        li.textContent = '自定义倍速';
        li.style.cursor = 'pointer';

        li.addEventListener('click', () => !dialogActive && createAsyncDialog());
        return li;
    }

    // 更新激活状态
    function updateActiveState(speed) {
        const items = document.querySelectorAll('.bpx-player-ctrl-playbackrate-menu-item');
        items.forEach(item => {
            const itemSpeed = parseFloat(item.dataset.value || 0);
            item.classList.toggle('active', itemSpeed === speed);
        });
    }

    // 初始化视频监听
    function initVideoListener(video) {
        video.addEventListener('ratechange', () => {
            if (video.playbackRate !== 1.0) {
                lastCustomSpeed = video.playbackRate;
            }
            updateActiveState(video.playbackRate);
        });
    }

    // C键切换功能
    function addShortcutListener() {
        document.addEventListener('keydown', function(e) {
            if (e.key.toLowerCase() === 'c' &&
                !e.ctrlKey &&
                !e.altKey &&
                !e.metaKey &&
                !document.activeElement.matches('input, textarea')) {

                const video = document.querySelector('video');
                if (video) {
                    e.preventDefault();
                    const newSpeed = video.playbackRate === 1.0 ? lastCustomSpeed : 1.0;
                    lastCustomSpeed = video.playbackRate === 1.0 ? lastCustomSpeed : video.playbackRate;
                    video.playbackRate = newSpeed;
                    createNotification(newSpeed);
                    updateActiveState(newSpeed);
                }
            }
        });
    }

    // 滚轮事件处理
    function handleWheelEvent(e) {
        if (!isInSpeedBox) return;

        e.preventDefault();
        const video = document.querySelector('video');
        if (!video) return;

        const delta = Math.sign(e.deltaY) * -0.1;
        let newSpeed = video.playbackRate + delta;

        newSpeed = Math.max(0.1, Math.min(16, newSpeed));
        newSpeed = Math.round(newSpeed * 10) / 10;

        video.playbackRate = newSpeed;
        if (newSpeed !== 1.0) lastCustomSpeed = newSpeed;

        createNotification(newSpeed);
        updateActiveState(newSpeed);
    }

    // 初始化滚轮控制
    function initWheelControl(speedBox) {
        if (speedBox.dataset.wheelAdded) return;

        speedBox.addEventListener('mouseenter', () => {
            isInSpeedBox = true;
            speedBox.style.cursor = 'ns-resize';
        });

        speedBox.addEventListener('mouseleave', () => {
            isInSpeedBox = false;
            speedBox.style.cursor = 'pointer';
        });

        speedBox.addEventListener('wheel', handleWheelEvent);
        speedBox.dataset.wheelAdded = 'true';
    }

    // 主监控逻辑
    const observer = new MutationObserver(() => {
        const menu = document.querySelector('.bpx-player-ctrl-playbackrate-menu');
        const video = document.querySelector('video');
        const speedBox = document.querySelector('.bpx-player-ctrl-playbackrate');

        if (speedBox && !speedBox.dataset.wheelAdded) {
            initWheelControl(speedBox);
        }

        if (menu && !document.querySelector('.custom-speed')) {
            menu.appendChild(createCustomSpeedItem());
        }

        if (video && !video.dataset.listenerAdded) {
            video.dataset.listenerAdded = 'true';
            initVideoListener(video);
            addShortcutListener();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();
