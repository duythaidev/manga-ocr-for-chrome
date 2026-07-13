# Hướng dẫn chạy dự án Manga OCR Extension

Tài liệu này hướng dẫn bạn cách cài đặt, build và chạy extension Manga OCR trên Chrome từ repo hiện tại.

## 1. Yêu cầu hệ thống

- Node.js 18+ hoặc 20+
- npm
- Google Chrome hoặc Chromium
- Internet để tải dependency ban đầu và model OCR nếu cần

## 2. Cài đặt dependency

```bash
cd /workspaces/manga-ocr-for-chrome
npm install
```

Nếu bạn đang ở repo khác, thay đường dẫn bằng thư mục repo của mình.

## 3. Build project

Project hiện tại sử dụng TypeScript + Webpack để build extension.

```bash
npm run build
```

Sau khi build xong, chạy lệnh sau để copy assets vào thư mục dist:

```bash
npm run dist:linux
```

Nếu bạn dùng Windows, dùng:

```bash
npm run dist:win32
```

Nếu bạn dùng macOS, dùng:

```bash
npm run dist:darwin
```

## 4. Cấu trúc output build

Sau khi build, thư mục dist sẽ chứa các file sau:

- dist/manifest.json
- dist/content-script.js
- dist/service-worker.js
- dist/offscreen.js
- dist/popup.html
- dist/popup.js
- dist/style.css
- các file model/assets từ res/

## 5. Tải extension vào Chrome

1. Mở Chrome và vào địa chỉ:
   - chrome://extensions/
2. Bật chế độ Developer mode ở góc trên bên phải.
3. Nhấn nút Load unpacked.
4. Chọn thư mục:
   - /workspaces/manga-ocr-for-chrome/dist
5. Extension sẽ được load vào Chrome.

## 6. Cách dùng extension

Sau khi đã load extension:

1. Click vào icon extension ở thanh toolbar.
2. Trong popup, nhập DeepL API key nếu bạn muốn dùng dịch thuật.
3. Chọn display mode là Overlay hoặc Side panel.
4. Trên trang manga, nhấn nút OCR hoặc dùng hotkey Alt+C để bắt đầu chọn vùng.
5. Chọn vùng chứa chữ để OCR và dịch.

## 7. Cách chạy trên web (không cần Chrome extension)

Repo này hiện tại chủ yếu được thiết kế để chạy như một Chrome extension MV3. Nếu bạn muốn chạy dưới dạng web app demo, có 2 cách:

### Cách A: Chạy local web page demo
Bạn có thể tạo một file HTML đơn giản để load các bundle JS đã build, ví dụ:

```html
<!doctype html>
<html>
  <body>
    <h1>Manga OCR Demo</h1>
    <script src="./dist/content-script.js"></script>
  </body>
</html>
```

Tuy nhiên, vì extension dùng Chrome APIs như chrome.runtime, chrome.storage, chrome.tabs, chrome.offscreen, nên việc chạy thuần trên web browser sẽ cần thêm shim hoặc rework code.

### Cách B: Dùng extension như nền tảng rồi test trên browser
Đây là cách khuyến nghị nhất:

- Build extension như ở trên.
- Load vào Chrome bằng Load unpacked.
- Test trực tiếp trên các trang web/manga.

## 8. Nếu gặp lỗi khi build

### Lỗi module không tìm thấy
```bash
npm install
```

### Lỗi TypeScript
```bash
npm run build
```

### Lỗi popup không hiện lên
Kiểm tra rằng file popup.html đã được copy vào dist:

```bash
npm run dist:linux
```

### Extension không hoạt động
Đảm bảo:
- Bạn đã chọn đúng thư mục dist
- File manifest.json có trong dist
- Chrome đã bật Developer mode

## 9. Mở rộng tiếp theo

Bạn có thể tiếp tục cải thiện project bằng các bước sau:

- Thêm model OCR mới
- Thay DeepL bằng provider khác
- Bổ sung popup/settings tốt hơn
- Tích hợp history lưu lâu dài
- Thêm auto-detect vùng chữ thay vì chọn thủ công

## 10. Tóm tắt nhanh

```bash
cd /workspaces/manga-ocr-for-chrome
npm install
npm run build
npm run dist:linux
```

Sau đó mở Chrome → chrome://extensions → Load unpacked → chọn thư mục dist.
