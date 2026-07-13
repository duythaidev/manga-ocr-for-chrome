# Project Overview

## Mục đích của repo

Đây là một Chrome extension MV3 được xây dựng như một dự án npm, không chỉ là một `manifest.json` + vài file `.js` + `.html`.

Mục tiêu chính:
- Chạy OCR trong trình duyệt bằng `onnxruntime-web`
- Dịch văn bản qua DeepL
- Kết hợp UI overlay, hotkey, context menu, popup settings
- Quản lý mã nguồn bằng TypeScript và bundling bằng Webpack

## Tại sao đây vẫn là một dự án npm?

Một extension đơn giản có thể chỉ cần `manifest.json`, HTML, JS và CSS. Nhưng repo này không phải mã JavaScript thuần:

- Toàn bộ code được viết bằng **TypeScript**.
- Dùng **module imports** như `import { DeepLConnect } from './translate';`.
- Dùng thư viện bên thứ ba như `onnxruntime-web`, `@ant-design/icons-svg`, `fastq`.
- Cần biên dịch, chuyển đổi và đóng gói lại thành file JS cuối cùng.
- Cần copy thêm asset khác như wasm file và model ONNX.

Vì vậy ta dùng npm để:
- Quản lý dependency
- Chạy TypeScript compiler
- Bundle file bằng Webpack
- Tạo tập tin đích `dist/` để Chrome load

## Công nghệ và công cụ chính

- **Node.js + npm**: quản lý package và scripts.
- **TypeScript**: viết code có kiểu tĩnh, dễ đọc và bảo trì.
- **Webpack**: đóng gói các file `.js` đã compile vào thư mục `dist`.
- **copy-webpack-plugin**: copy file wasm từ `node_modules/onnxruntime-web/dist` sang output.
- **onnxruntime-web**: chạy mô hình ONNX trong trình duyệt.
- **Chrome Manifest V3**: định nghĩa extension, service worker, quyền truy cập, host permissions.
- **Chrome extension APIs**: `chrome.runtime`, `chrome.storage`, `chrome.tabs`, `chrome.scripting`, `chrome.offscreen`, `chrome.contextMenus`, `chrome.commands`.

## Cấu trúc chính của repo

- `package.json` - dependency, scripts, cấu hình npm
- `tsconfig.json` - cấu hình TypeScript
- `webpack.config.js` - cấu hình Webpack entry/output và copy wasm
- `res/manifest.json` - manifest của extension
- `res/` - chứa tài nguyên extension, ví dụ `vocab.txt`, `sample.csv`, icon, `offscreen.html`
- `src/` - nguồn TypeScript chính
  - `src/content-script.ts` - UI overlay, capture vùng, gửi message
  - `src/service-worker.ts` - background/service worker, quản lý context menu, hotkey, routing message
  - `src/offscreen.ts` - xử lý image/canvas, gọi OCR, trả kết quả
  - `src/translate.ts` - gọi API DeepL
  - `src/types.d.ts` - định nghĩa interface message và data
  - `src/elements/` - các component UI nhúng vào trang

## Luồng chạy của extension

### 1. Khởi tạo

- Chrome đọc `manifest.json` và tạo extension.
- `service-worker.js` là background script.
- `popup.html` xuất hiện khi click biểu tượng extension.

### 2. Kích hoạt OCR

- Người dùng nhấn `Alt+C`, hoặc chọn context menu, hoặc click floating button.
- `service-worker` gửi message tới `content-script` để bật overlay chọn vùng.

### 3. Chọn vùng và capture

- `content-script` hiển thị vùng chọn và sau khi người dùng chọn xong, nó gửi tọa độ sang `service-worker`.
- `service-worker` gọi `chrome.tabs.captureVisibleTab` để chụp ảnh màn hình.
- Ảnh và tọa độ được gửi tới `offscreen` document.

### 4. OCR trong offscreen

- `offscreen.ts` nhận ảnh, crop bằng canvas, pre-process, rồi chạy mô hình ONNX với `onnxruntime-web`.
- Kết quả OCR (text) được gửi trở lại `service-worker`.

### 5. Dịch DeepL

- `service-worker.ts` nhận text OCR và gọi `src/translate.ts` để gọi API DeepL.
- API key được lưu trong `chrome.storage.local` và lấy ra khi cần.
- Kết quả dịch được gửi về `content-script`.

### 6. Hiển thị kết quả

- `content-script` hiển thị kết quả trong overlay hoặc sidepanel tùy `displayMode`.
- Người dùng có thể copy text, xem lịch sử, hoặc chỉnh sửa.

## Build và cài extension

### Bước 1: Cài dependency

```bash
npm install
```

### Bước 2: Build code

```bash
npm run build
```

Lệnh này thực hiện:
- `tsc` compile TS sang JS trong `out/`
- `webpack --config webpack.config.js` bundle file trong `out/` sang `dist/`

### Bước 3: Chuẩn bị thư mục dist

```bash
npm run dist:linux
```

Lệnh này copy nội dung `res/` và `popup.html` vào `dist/`.

### Bước 4: Load extension vào Chrome

1. Mở `chrome://extensions`
2. Bật `Developer mode`
3. Click `Load unpacked`
4. Chọn thư mục `dist/`

## Tại sao không chỉ cần JS + HTML đơn giản?

Extension đơn giản thì có thể vậy, nhưng repo này cần thêm:
- TypeScript
- module import/export
- thư viện ngoài
- WASM runtime (onnxruntime)
- xử lý ảnh và mô hình ONNX

Nếu bạn viết trực tiếp JS thuần với `script` đơn giản, bạn sẽ không có:
- kiểm tra kiểu tĩnh
- tổ chức module rõ ràng
- cơ chế bundle cho browser
- cách copy assets tự động

Do đó họ dùng npm để tạo pipeline build giống một project web hiện đại.

## Học hỏi từ repo này

Nếu bạn đã biết `npm`, `React`, `Express` rồi thì bước tiếp theo là hiểu thêm:

- **Project structure**: extension cũng có frontend, background, asset, config giống app web.
- **Build pipeline**: `TypeScript -> compile -> bundle -> dist`.
- **Chrome APIs**: extension dùng chrome-specific API, không chạy trực tiếp trên trang web.
- **ONNX & WASM**: chạy model AI ngay trong browser.
- **MV3 architecture**: `manifest.json`, `service_worker`, `content_scripts`, `offscreen`.

## Kết luận

Đây là một dự án extension nhưng được build như một ứng dụng npm hiện đại vì nó dùng nhiều công nghệ hơn một extension tĩnh:
- TypeScript
- module import
- thư viện npm
- bundler Webpack
- runtime WASM
- assets model

Nếu bạn muốn học thêm, hãy tìm hiểu từng phần:
1. `package.json` và scripts
2. `tsconfig.json`
3. `webpack.config.js`
4. `manifest.json`
5. cách `content-script` và `service-worker` giao tiếp
6. cách `offscreen` xử lý ảnh và gọi OCR
