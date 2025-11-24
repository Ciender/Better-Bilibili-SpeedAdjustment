# ⚡ 更好的B站播放器视频倍速调节

![License](https://img.shields.io/badge/license-MIT-blue.svg) ![Version](https://img.shields.io/badge/version-6.1-green.svg)



专为 Bilibili 打造的 HTML5 播放器增强脚本，致力于提供**最流畅、最原生**的倍速调节体验。告别繁琐的菜单点击，享受滚轮、快捷键和触控板带来的丝滑操控。

<img width="429" height="240" alt="image" src="https://github.com/user-attachments/assets/de2b4269-ef07-481c-9c73-35a170a084f0" />
<img width="442" height="389" alt="image" src="https://github.com/user-attachments/assets/6c98c9cc-fe0e-4a5f-b1a1-5f449a1fdadd" />


---

## 🇨🇳 中文说明

### ✨ 核心功能

*   **🖱️ 滚轮极速调节**
    *   将鼠标悬停在播放器底部的“倍速”按钮区域，直接滚动滚轮即可调节速度。
    *   **步进：** ±0.1x (如 1.0 -> 1.1 -> 1.2)
*   **🖐️ 触控板丝滑操控 (Mac/笔记本优化)**
    *   智能识别触控板滑动，防抖动算法，提供类似原生应用的细腻手感。
    *   **步进：** ±0.02x (如 1.00 -> 1.02 -> 1.04)
*   **⌨️ 全局快捷键**
    *   `C`：**加速** (+0.1x)
    *   `X`：**减速** (-0.1x)
    *   `Z`：**一键重置** (在 1.0x 和你上一次设定的速度之间快速切换)
*   **🔢 嵌入式自定义输入**
    *   无需打开额外的弹窗，我们在倍速菜单顶部嵌入了一个原生风格的输入框。
    *   **新特性：** 默认带有醒目的蓝色描边，点击后绿色呼吸闪烁。输入任意数字（如 `2.33`）回车即可应用。
*   **👀 剩余时间显示**
    *   在播放器时间栏下方实时显示“当前倍速”以及“预计剩余播放时间”，助你更好地规划时间。


### 🛠️ 安装方法

1.  安装浏览器扩展 **Tampermonkey** (油猴) 
2.  复制main.js 到新建脚本。
3.  打开任意 Bilibili 视频页面即可生效。

### 💡 常见问题

**Q: 为什么按快捷键没反应？**
A: 如果你正在输入评论或弹幕（输入框处于焦点状态），为了防止误触，快捷键会自动禁用。请点击一下视频画面再试。

**Q: 如何恢复默认 1.0 倍速？**
A: 有三种方法：
1. 按键盘 `Z` 键。
2. 双击倍速按钮区域。
3. 在倍速菜单中选择 "1.0x"。

**Q: 支持的倍速范围是多少？**
A: 目前支持 **0.1x** 到 **16.0x** 之间的任意数值。

---

## 🇺🇸 English Description

### ✨ Key Features

*   **🖱️ Mouse Wheel Control**
    *   Hover over the playback speed button and scroll to adjust speed instantly.
    *   **Step:** ±0.1x (e.g., 1.0 -> 1.1 -> 1.2)
*   **🖐️ Optimized Touchpad Support**
    *   Smart detection for touchpads with inertia and debounce algorithms. Smooth experience for Mac/Laptop users.
    *   **Step:** ±0.02x (e.g., 1.00 -> 1.02 -> 1.04)
*   **⌨️ Global Shortcuts**
    *   `C`: **Speed Up** (+0.1x)
    *   `X`: **Slow Down** (-0.1x)
    *   `Z`: **Toggle Reset** (Switch between 1.0x and your last custom speed)
*   **🔢 Embedded Custom Input**
    *   Directly embedded in the speed menu top. No more annoying popups.
    *   **New:** Features a distinct blue outline by default, pulsating green when focused. Type any number (e.g., `2.33`) and hit Enter.
*   **👀 Remaining Time Display**
    *   Real-time display of "Current Speed" and "Estimated Remaining Time" below the player's time bar.


### 🛠️ Installation

1.  Install a userscript manager extension like **Tampermonkey**
2.  copy main.js to create new script.
3.  Open any Bilibili video page to enjoy.

### 💡 FAQ

**Q: Why don't the shortcuts work?**
A: Shortcuts are automatically disabled when you are typing in the comment or danmaku box to prevent accidental triggers. Click on the video player area to regain focus.

**Q: How to reset to 1.0x speed quickly?**
A: Three ways:
1. Press `Z` key.
2. Double-click the speed button area.
3. Select "1.0x" from the menu.

**Q: What is the supported speed range?**
A: Supports any value between **0.1x** and **16.0x**.

---

<p align="center">Made with ❤️ for Bilibili Community</p>
