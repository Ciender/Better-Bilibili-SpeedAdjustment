// ==UserScript==
// @name         B站播放器视频倍速调节 (Fullscreen Fix & Remaining Time)
// @namespace    http://tampermonkey.net/
// @version      1.7
// @description  滚轮调节+C/X/Z键调节+兼容原生和其他html5插件+显示剩余时间
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let lastCustomSpeed = 1.0;
    let currentNotification = null;
    let notificationTimer = null;
    let isInSpeedBox = false;
    let dialogActive = false;
    let notificationStyleAdded = false;

    // --- Helper Functions ---

    // Find the most likely player container element
    function getPlayerContainer(videoElement) {
        if (!videoElement) return document.body; // Fallback if no video
        // Try specific selectors often used by players, including Bilibili's bpx-player
        const container = videoElement.closest('.bpx-player-container, .player-container, #bilibili-player, #playerWrap');
        // If found, return it, otherwise return the video's parent, or fallback to body
        return container || videoElement.parentElement || document.body;
    }

    // Helper function to format seconds into a time string (e.g., X时X分XX秒)
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


    // Add notification CSS animation style if not already present
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

    // Create notification - modified to show remaining time
    function createNotification(speed) {
        if (currentNotification && currentNotification.parentNode) {
            currentNotification.parentNode.removeChild(currentNotification);
            clearTimeout(notificationTimer);
            currentNotification = null;
        }
        ensureNotificationStyle();

        const video = document.querySelector('video');
        const parentElement = getPlayerContainer(video);

        const div = document.createElement('div');
        div.style.cssText = `
            position: absolute; /* Use absolute for positioning within container */
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 200, 0, 0.8); /* Slightly adjusted green */
            color: #fff; /* White text for better contrast */
            padding: 10px 18px; /* Slightly larger */
            border-radius: 5px;
            font-family: Arial, sans-serif;
            font-size: 16px; /* Slightly larger */
            font-weight: bold;
            z-index: 2147483647; /* Max z-index */
            pointer-events: none;
            box-shadow: 0 3px 8px rgba(0,0,0,0.3);
            white-space: nowrap;
            text-align: center; /* Center text for multi-line content */
        `;
        // Fallback for elements not in a player container (like document.body)
        if (parentElement === document.body) {
             div.style.position = 'fixed';
        }

        // --- Start of modification ---
        let notificationText = `倍速: ${speed.toFixed(1)}x`;

        // Calculate and add remaining time if video and duration are valid
        if (video && video.duration && isFinite(video.duration) && speed > 0) {
            const remainingSeconds = video.duration - video.currentTime;
            const remainingTimeAtNewSpeed = remainingSeconds / speed;
            const formattedTime = formatRemainingTime(remainingTimeAtNewSpeed);
            if (formattedTime) {
                // Add remaining time on a new line with slightly smaller font
                notificationText += `<br><span style="font-size: 14px; font-weight: normal;">${formattedTime}</span>`;
            }
        }
        div.innerHTML = notificationText; // Use innerHTML to support <br>
        // --- End of modification ---

        div.classList.add('bili-speed-notifier-fadeout'); // Use class for animation

        parentElement.appendChild(div);
        currentNotification = div;

        notificationTimer = setTimeout(() => {
            if (div.parentNode) {
                div.parentNode.removeChild(div);
            }
            if (currentNotification === div) {
                 currentNotification = null;
            }
        }, 800); // Total duration: 0.5s wait + 0.3s fade = 800ms
    }

    // Create async dialog - modified for better fullscreen compatibility
    function createAsyncDialog() {
        if (dialogActive) return;
        dialogActive = true;

        const video = document.querySelector('video');
        const parentElement = getPlayerContainer(video);

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: absolute; /* Use absolute for positioning within container */
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5); /* Slightly darker overlay */
            z-index: 2147483646; /* Slightly below max z-index */
            display: flex;
            justify-content: center;
            align-items: center;
        `;
        // Fallback for elements not in a player container (like document.body)
         if (parentElement === document.body) {
             overlay.style.position = 'fixed';
         }

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: #fff;
            padding: 25px;
            border-radius: 8px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            min-width: 300px; /* Slightly wider */
            box-sizing: border-box;
        `;
        dialog.addEventListener('click', e => e.stopPropagation()); // Prevent overlay click closing dialog

        const title = document.createElement('div');
        title.textContent = '设置播放速度 (0.1 - 16.0)';
        title.style.cssText = `
            font-size: 18px;
            margin-bottom: 20px;
            font-weight: bold;
            color: #333;
            text-align: center;
        `;

        const input = document.createElement('input');
        input.type = 'number';
        input.step = '0.1';
        input.min = '0.1';
        input.max = '16';
        // Use the *current* video speed if available, otherwise the last custom speed
        const currentSpeed = video ? video.playbackRate : lastCustomSpeed;
        input.value = currentSpeed.toFixed(1);
        input.style.cssText = `
            width: 100%;
            padding: 10px 14px;
            margin-bottom: 20px;
            border: 1px solid #ccc;
            border-radius: 4px;
            font-size: 16px;
            box-sizing: border-box;
            text-align: center;
        `;

        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = `
            display: flex;
            justify-content: space-around; /* Space out buttons */
            gap: 10px;
        `;

        const confirmBtn = document.createElement('button');
        confirmBtn.textContent = '确定';
        confirmBtn.style.cssText = `
            padding: 8px 20px;
            background: #00a1d6; /* Bilibili blue */
            border: none;
            border-radius: 4px;
            color: white;
            cursor: pointer;
            font-size: 14px;
            flex-grow: 1; /* Allow buttons to grow */
        `;
        confirmBtn.onmouseover = () => confirmBtn.style.background = '#00b5e5';
        confirmBtn.onmouseout = () => confirmBtn.style.background = '#00a1d6';


        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.style.cssText = `
            padding: 8px 20px;
            background: #f0f0f0;
            border: 1px solid #ddd;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            color: #555;
            flex-grow: 1; /* Allow buttons to grow */
        `;
        cancelBtn.onmouseover = () => cancelBtn.style.background = '#e0e0e0';
        cancelBtn.onmouseout = () => cancelBtn.style.background = '#f0f0f0';

        const cleanup = () => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
            dialogActive = false;
             // Restore focus to the document body or player to allow keyboard shortcuts again
            document.activeElement?.blur();
            (parentElement !== document.body ? parentElement : document.body).focus();
        };

        const applySpeed = () => {
            const num = parseFloat(input.value);
            if (!isNaN(num) && num >= 0.1 && num <= 16) {
                const targetVideo = document.querySelector('video'); // Re-query in case video changed
                if (targetVideo) {
                    targetVideo.playbackRate = num;
                    // No need to call updateActiveState here, ratechange event handles it
                    createNotification(num); // Show confirmation
                }
                cleanup();
            } else {
                input.style.borderColor = '#ff4d4d'; // Error indication
                 input.style.outline = '1px solid #ff4d4d';
                setTimeout(() => {
                    input.style.borderColor = '#ccc';
                    input.style.outline = 'none';
                }, 1000);
                input.focus(); // Keep focus on invalid input
                input.select();
            }
        };

        overlay.addEventListener('click', cleanup); // Click outside dialog closes it
        cancelBtn.addEventListener('click', cleanup);
        confirmBtn.addEventListener('click', applySpeed);
        input.addEventListener('keydown', e => {
             if (e.key === 'Enter') {
                 e.preventDefault();
                 applySpeed();
             } else if (e.key === 'Escape') {
                 cleanup();
             }
        });

        btnContainer.append(cancelBtn, confirmBtn);
        dialog.append(title, input, btnContainer);
        overlay.appendChild(dialog);

        // Use requestAnimationFrame to ensure focus works after elements are rendered
        requestAnimationFrame(() => {
            input.focus();
            input.select();
        });
    }

    // Create custom menu item
    function createCustomSpeedItem() {
        const li = document.createElement('li');
        // Match Bilibili's class structure if possible
        li.className = 'bpx-player-ctrl-playbackrate-menu-item custom-speed';
        li.textContent = '自定义倍速'; // Add ellipsis
        li.style.cursor = 'pointer';
        li.style.padding = '1x 1x'; // Adjust padding to match others if needed
        li.style.textAlign = 'center';

        li.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent menu from closing immediately
            if (!dialogActive) {
                createAsyncDialog();
            }
            // Attempt to close the Bilibili speed menu after clicking
             const speedMenu = document.querySelector('.bpx-player-ctrl-playbackrate-menu');
             if (speedMenu && speedMenu.style.display !== 'none') {
                 // This might not work perfectly depending on how Bilibili handles menu state
                 // speedMenu.style.display = 'none';
                 // Or simulate a click elsewhere? Less reliable.
             }
        });

        // Add hover effect similar to Bilibili's items
        li.onmouseover = () => li.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
        li.onmouseout = () => li.style.backgroundColor = '';

        return li;
    }

    // Update active state in Bilibili menu
    function updateActiveState(speed) {
        const items = document.querySelectorAll('.bpx-player-ctrl-playbackrate-menu-item');
        let foundMatch = false;
        items.forEach(item => {
            // Handle both standard items with data-value and our custom item
            if (item.classList.contains('custom-speed')) {
                // Don't mark 'custom' as active unless speed doesn't match standard options
            } else {
                const itemSpeed = parseFloat(item.dataset.value || item.getAttribute('data-value') || '0');
                if (itemSpeed && Math.abs(itemSpeed - speed) < 0.01) {
                    item.classList.add('active');
                    foundMatch = true;
                } else {
                    item.classList.remove('active');
                }
            }
        });

         // If no standard speed matched, maybe highlight the custom item or just remove all highlights
         const customItem = document.querySelector('.custom-speed');
         if (customItem) {
              // Option: Highlight custom if non-standard speed is active (might be confusing)
              // customItem.classList.toggle('active', !foundMatch && speed !== 1.0);
               customItem.classList.remove('active'); // Safer: Don't highlight custom item itself
         }

        // Update the text on the main speed button
        const speedButtonText = document.querySelector('.bpx-player-ctrl-playbackrate .bpx-player-ctrl-playbackrate-result');
         if (speedButtonText) {
             speedButtonText.textContent = `${speed.toFixed(1)}x`;
         }
    }

    // --- Event Listeners ---

    // Initialize video listeners
    function initVideoListener(video) {
         // Use WeakMap to avoid adding listeners multiple times to the same video element
         if (!window.biliSpeedVideoListeners) {
             window.biliSpeedVideoListeners = new WeakMap();
         }
         if (window.biliSpeedVideoListeners.has(video)) {
             return; // Already initialized for this video element
         }

        video.addEventListener('ratechange', () => {
            const currentSpeed = video.playbackRate;
            // Update last *non-1.0* speed for the 'Z' toggle functionality
            if (currentSpeed !== 1.0) {
                lastCustomSpeed = currentSpeed;
            }
            updateActiveState(currentSpeed);
        });

        // Set flag on the element itself as a secondary check / simpler approach
        window.biliSpeedVideoListeners.set(video, true);
        console.log("Bili Speed Control: Listeners added to video element.");

         // Initial state sync
         updateActiveState(video.playbackRate);
         if (video.playbackRate !== 1.0) {
             lastCustomSpeed = video.playbackRate;
         }
    }

    // Shortcut key listener
    function addShortcutListener() {
        // Check if listener is already attached to avoid duplicates
         if (document.body.dataset.biliSpeedKeyListener === 'true') return;

        document.addEventListener('keydown', function(e) {
            // Ignore if typing in input/textarea or if dialog is active
            if (dialogActive || e.target.matches('input, textarea, [contenteditable]')) {
                return;
            }

            const key = e.key.toLowerCase();
            const video = document.querySelector('video'); // Find the current video

            if (video && (key === 'z' || key === 'x' || key === 'c') &&
                !e.ctrlKey && !e.altKey && !e.metaKey) {

                e.preventDefault();
                e.stopPropagation(); // Prevent default Bilibili shortcuts if necessary

                let newSpeed = video.playbackRate;

                // Z: Toggle between 1.0x and last used speed
                if (key === 'z') {
                    if (Math.abs(video.playbackRate - 1.0) < 0.01) {
                        newSpeed = lastCustomSpeed; // Restore last speed
                    } else {
                        lastCustomSpeed = video.playbackRate; // Store current speed before resetting
                        newSpeed = 1.0; // Reset to 1.0x
                    }
                }
                // X: Decrease speed by 0.1
                else if (key === 'x') {
                    newSpeed = video.playbackRate - 0.1;
                    newSpeed = Math.max(0.1, Math.round(newSpeed * 10) / 10);
                }
                // C: Increase speed by 0.1
                else if (key === 'c') {
                    newSpeed = video.playbackRate + 0.1;
                    newSpeed = Math.min(16.0, Math.round(newSpeed * 10) / 10);
                }

                if (Math.abs(video.playbackRate - newSpeed) > 0.01) {
                    video.playbackRate = newSpeed;
                    createNotification(newSpeed);
                    // ratechange event will handle updateActiveState
                }
            }
        }, true); // Use capture phase to potentially override other listeners

        document.body.dataset.biliSpeedKeyListener = 'true'; // Mark listener as attached
         console.log("Bili Speed Control: Keyboard shortcut listener added.");
    }

    // Wheel event handler
    function handleWheelEvent(e) {
        if (!isInSpeedBox) return;

        e.preventDefault(); // Prevent page scrolling
        e.stopPropagation();

        const video = document.querySelector('video');
        if (!video) return;

        const delta = Math.sign(e.deltaY) * -0.1; // Invert direction, step 0.1
        let newSpeed = video.playbackRate + delta;

        newSpeed = Math.max(0.1, Math.min(16.0, newSpeed));
        newSpeed = Math.round(newSpeed * 10) / 10; // Round to one decimal place

        if (Math.abs(video.playbackRate - newSpeed) > 0.01) {
             video.playbackRate = newSpeed;
             createNotification(newSpeed);
             // ratechange event will handle updateActiveState
        }
    }

    // Initialize wheel control on the speed box
    function initWheelControl(speedBox) {
        // Use a dataset attribute to prevent adding listeners multiple times
        if (speedBox.dataset.biliSpeedWheelAdded === 'true') return;

        speedBox.addEventListener('mouseenter', () => {
            isInSpeedBox = true;
            speedBox.style.cursor = 'ns-resize'; // Indicate vertical scroll action
        });

        speedBox.addEventListener('mouseleave', () => {
            isInSpeedBox = false;
            speedBox.style.cursor = ''; // Reset cursor
        });

        // Add wheel listener with passive: false to allow preventDefault
        speedBox.addEventListener('wheel', handleWheelEvent, { passive: false });

        speedBox.dataset.biliSpeedWheelAdded = 'true'; // Mark as initialized
        console.log("Bili Speed Control: Wheel control added to speed box.");
    }

    // --- Main Observer Logic ---

    console.log("Bili Speed Control: Script starting...");

    const observer = new MutationObserver((mutationsList, observer) => {
        // Use requestAnimationFrame to debounce checks and avoid excessive processing
        requestAnimationFrame(() => {
            const video = document.querySelector('video');
            const speedBox = document.querySelector('.bpx-player-ctrl-playbackrate'); // Bilibili specific speed control button/area
            const menu = document.querySelector('.bpx-player-ctrl-playbackrate-menu'); // Bilibili specific speed menu

            // Setup wheel control on the speed display area
            if (speedBox) {
                initWheelControl(speedBox);
            }

            // Add custom speed item to the menu if it exists and doesn't have it yet
            if (menu && !menu.querySelector('.custom-speed')) {
                menu.appendChild(createCustomSpeedItem());
                console.log("Bili Speed Control: Custom speed menu item added.");
            }

            // Add listeners to the video element if found
            if (video) {
                initVideoListener(video);
                addShortcutListener(); // Ensure keyboard listener is active
            }
        });
    });

    // Observe the body for dynamically loaded players/videos
    observer.observe(document.body, {
        childList: true, // Watch for adding/removing child elements
        subtree: true    // Watch descendants too
    });

     // Initial check in case the player is already loaded
     setTimeout(() => {
        const video = document.querySelector('video');
        const speedBox = document.querySelector('.bpx-player-ctrl-playbackrate');
        const menu = document.querySelector('.bpx-player-ctrl-playbackrate-menu');
        if (video) {
            initVideoListener(video);
            addShortcutListener();
        }
         if (speedBox) {
             initWheelControl(speedBox);
         }
         if (menu && !menu.querySelector('.custom-speed')) {
             menu.appendChild(createCustomSpeedItem());
         }
     }, 1000); // Delay initial check slightly


})();
