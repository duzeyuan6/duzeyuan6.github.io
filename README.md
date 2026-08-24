# Zeyuan Du Academic Homepage

个人学术主页与本地可视化编辑器，发布于：

- 主页：https://duzeyuan6.github.io/
- 编辑器：https://duzeyuan6.github.io/editor.html

## 使用可视化编辑器

建议使用最新版 Chrome 或 Edge 打开 `editor.html`。

1. 点击“连接本地项目文件夹”。
2. 选择 `D:\duzeyuan6.github.io`。
3. 点击右侧预览中的文字、卡片、图片或区块。
4. 在左侧修改内容、颜色、字号、间距、圆角、排列和显示状态。
5. 点击“保存到项目”，修改会直接写入本地 `index.html` 和 `assets/css/theme-luka.css`。
6. 检查效果后提交并推送：

```powershell
cd D:\duzeyuan6.github.io
git add .
git commit -m "Update homepage"
git push
```

编辑器不会接触或保存 GitHub 密钥。若浏览器不支持文件夹直存，可以下载修改后的 HTML 和 CSS 文件。

## 本地预览

```powershell
cd D:\duzeyuan6.github.io
python -m http.server 8000
```

访问：

- 主页：http://localhost:8000/
- 编辑器：http://localhost:8000/editor.html

## 主要文件

- `index.html`：主页内容
- `editor.html`：可视化编辑界面
- `assets/css/theme-luka.css`：主页样式
- `assets/css/editor.css`：编辑器样式
- `assets/js/editor.js`：编辑器交互逻辑
- `assets/cv/Zeyuan-Du-CV.pdf`：公开下载版简历

Original template licensed under the MIT License. See `LICENSE.md`.
