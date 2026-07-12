# Setup Guide — Manga OCR + DeepL Translate Chrome Extension

> **Đọc trước khi bắt đầu (quan trọng):**
> Tài liệu này được viết dựa trên **README công khai** của
> [`rDarge/manga-ocr-for-chrome`](https://github.com/rDarge/manga-ocr-for-chrome)
> (chưa fork), không phải từ việc đọc từng dòng source code thật — repo đó
> hiện có 55 commit, cấu trúc `src/` + `res/`, TypeScript 92%, SCSS 6%,
> dùng `ocr.ts` để chạy ONNX Runtime Web, và tích hợp OpenAI (chatgpt-3.5)
> để dịch. **Bước 0 dưới đây bắt buộc agent phải tự đọc source code thật**
> trước khi sửa gì — đừng giả định cấu trúc file nếu chưa thấy tận mắt.
>
> Hai điều đã bị sửa so với bản brief gốc vì không đúng thực tế:
> - ~~PaddleOCR-VL fine-tuned cho manga~~ → tồn tại
>   (`jzhang533/PaddleOCR-VL-For-Manga`, đạt 70% full-sentence accuracy
>   trên manga109-s) nhưng là VLM đa ngôn ngữ, nặng, **chưa có ONNX export
>   browser-ready** → rủi ro cao cho MV3 extension. Không dùng ở bản này.
> - `l0wgear/manga-ocr-2025-onnx` — **có thật**, đã kiểm chứng trên
>   HuggingFace. Đây là bản ONNX export sẵn của
>   `jzhang533/manga-ocr-base-2025` (fine-tune lại kha-white/manga-ocr
>   trên manga109-s + synthetic data, cùng kiến trúc Vision Encoder
>   Decoder). Đây là lựa chọn model chính của tài liệu này.
>
> Scope bản này: **manual rectangle select** (không auto-detect bubble).
> Auto text-detection (comic-text-detector) để ở TODO cho bản sau.
> Dịch: **chỉ DeepL**, không có fallback provider khác.

---

## 1. Project Overview

### Luồng hiện tại (repo gốc rDarge)
```
User click extension icon → content-script chèn overlay chọn vùng
→ capture screenshot vùng đó → gửi sang offscreen document
→ offscreen chạy ONNX Runtime Web (encoder-model.onnx + decoder-model.onnx,
   kha-white/manga-ocr-base) → trả text tiếng Nhật
→ gửi text sang OpenAI chatgpt-3.5 để dịch → hiển thị kết quả
```

### Luồng mới (bản nâng cấp)
```
User nhấn Alt+C HOẶC click floating action button HOẶC context-menu
→ content-script bật chế độ chọn vùng (giữ nguyên UX cũ)
→ capture vùng ảnh (chrome.tabs.captureVisibleTab + crop bằng canvas)
→ gửi sang offscreen document
→ offscreen chạy ONNX Runtime Web với model MỚI
   (l0wgear/manga-ocr-2025-onnx, cùng kiến trúc nên code encoder/decoder
   loop giữ nguyên — chỉ đổi tên file .onnx và revision)
→ trả text tiếng Nhật
→ gửi text sang DeepL API (thay OpenAI) để dịch sang English
→ hiển thị: overlay đè lên vùng đã chọn (in-place) HOẶC side panel
   + nút copy — cả hai chọn được trong settings
→ lưu vào chrome.storage.local (history OCR + translation)
```

### Điểm khác biệt chính so với bản gốc
| Hạng mục | Bản gốc | Bản mới |
|---|---|---|
| OCR model | kha-white/manga-ocr-base | l0wgear/manga-ocr-2025-onnx (fallback: giữ model cũ) |
| Dịch | OpenAI chatgpt-3.5 | DeepL API |
| Kích hoạt | (chưa rõ, có thể chỉ icon click) | Alt+C hotkey + context menu + floating button |
| Kết quả hiển thị | side panel (giả định) | overlay in-place HOẶC side panel (toggle) |
| History | chrome.storage, trong session | persist qua session, chrome.storage.local |
| Auto-detect bubble | Không (TODO trong repo gốc) | Không trong bản này — để TODO |

---

## 2. Tech Stack & Dependencies

Giữ nguyên nền tảng cũ, chỉ đổi phần dịch:

```json
{
  "dependencies": {
    "onnxruntime-web": "^1.20.0",
    "webextension-polyfill": "^0.12.0"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "webpack": "^5.x",
    "webpack-cli": "^5.x",
    "ts-loader": "^9.x",
    "copy-webpack-plugin": "^12.x",
    "sass": "^1.x",
    "sass-loader": "^14.x",
    "css-loader": "^7.x",
    "mini-css-extract-plugin": "^2.x",
    "@types/chrome": "^0.0.x"
  }
}
```

**Loại bỏ**: gói `openai` (không dùng nữa — trừ khi bạn muốn giữ làm optional fallback, xem mục 9).

**Không cần** `ppu-paddle-ocr` hay bất kỳ gói PaddleOCR nào — quyết định ở
mục Overview là không dùng PaddleOCR-VL cho bản này vì thiếu ONNX export
browser-ready đáng tin cậy. Nếu muốn thử nghiệm sau, ghi vào TODO.

DeepL: **không cần SDK riêng**, gọi thẳng REST API bằng `fetch()` từ
service worker (không gọi được từ content-script vì CSP/CORS của trang
manga có thể chặn).

---

## 3. Model OCR Setup

### 3.1. Model chính: l0wgear/manga-ocr-2025-onnx

Nguồn gốc: fine-tune của `jzhang533/manga-ocr-base-2025`, vốn dùng lại
script training gốc của kha-white/manga-ocr với vài tinh chỉnh, train
trên manga109-s + synthetic data. Kiến trúc **Vision Encoder Decoder**
giống hệt bản cũ → không cần đổi logic encoder/decoder loop trong
`ocr.ts`, chỉ đổi:
- Tên/nguồn file `.onnx`
- Có thể cần đổi tokenizer/vocab file nếu HF repo có bản riêng (agent
  cần tự kiểm tra file trong repo HF khi tải về — xem 3.2)

### 3.2. Cách tải model

```bash
# Cài optimum nếu convert lại từ đầu (thường KHÔNG cần vì l0wgear đã export sẵn)
pip install optimum[onnxruntime] --break-system-packages

# Cách 1 (khuyên dùng) — tải trực tiếp file .onnx đã export sẵn từ HF:
# Vào https://huggingface.co/l0wgear/manga-ocr-2025-onnx/tree/main
# Tải: encoder_model.onnx, decoder_model_merged.onnx (hoặc decoder_model.onnx
#  + decoder_with_past_model.onnx tùy cấu trúc thật của repo — AGENT PHẢI
#  TỰ KIỂM TRA danh sách file trong repo HF trước khi viết code load model,
#  vì tên file export bằng Optimum có thể khác nhau giữa các version)
# Copy vào ./res/ giữ đúng convention thư mục cũ của repo gốc

# Cách 2 (nếu cần tự export lại, ví dụ muốn quantize nhỏ hơn):
optimum-cli export onnx \
  -m 'jzhang533/manga-ocr-base-2025' \
  ./OUTPUT_FOLDER \
  --task=vision2seq-lm
```

**QUAN TRỌNG — Agent phải làm bước xác minh này trước khi code:**
1. Mở https://huggingface.co/l0wgear/manga-ocr-2025-onnx/tree/main
2. Liệt kê chính xác tên file `.onnx` có trong repo
3. So sánh với tên file mà `ocr.ts` cũ đang tham chiếu
   (`encoder-model.onnx`, `decoder-model.onnx`)
4. Nếu tên khác → cập nhật path trong code, đừng đổi tên file tải về
   cho khớp code cũ (dễ nhầm lẫn version sau này)
5. Kiểm tra `preprocessor_config.json` / tokenizer config có đi kèm
   không — cần cho bước tiền xử lý ảnh (resize, normalize) đúng chuẩn
   model mới

### 3.3. Load model trong extension (giữ nguyên pattern cũ)

```typescript
// src/offscreen/ocr.ts (giữ tên file, sửa nội dung)
import * as ort from 'onnxruntime-web';

// Set ORT threads to 1, since CSP permissions are borked in workers currently:
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = chrome.runtime.getURL('res/');

const MODEL_ENCODER_PATH = chrome.runtime.getURL('res/encoder_model.onnx');
const MODEL_DECODER_PATH = chrome.runtime.getURL('res/decoder_model_merged.onnx');
// ^ tên file thật — xác minh theo bước 3.2 trước khi hardcode

let encoderSession: ort.InferenceSession | null = null;
let decoderSession: ort.InferenceSession | null = null;

export async function initOcrSessions() {
  encoderSession = await ort.InferenceSession.create(MODEL_ENCODER_PATH);
  decoderSession = await ort.InferenceSession.create(MODEL_DECODER_PATH);
}

// Giữ nguyên toàn bộ logic tiền xử lý ảnh + greedy decoding loop
// từ ocr.ts gốc — vì kiến trúc model (ViT encoder + GPT-2-like decoder)
// không đổi giữa bản 2021 và bản 2025.
```

### 3.4. Fallback

Giữ file `.onnx` cũ (kha-white/manga-ocr-base) trong `res/legacy/`, thêm
toggle trong settings popup: "Use legacy OCR model" — hữu ích nếu model
mới lỗi hoặc user muốn so sánh chất lượng.

---

## 4. DeepL API Integration

### 4.1. Vì sao gọi từ service worker, không phải content-script

DeepL API endpoint (`api-free.deepl.com` / `api.deepl.com`) không nằm
trong CSP mặc định của các trang manga → phải gọi qua
`background`/service-worker, nơi extension có quyền `host_permissions`
riêng, tách biệt khỏi CSP của trang web.

### 4.2. manifest.json — thêm permission

```json
{
  "host_permissions": [
    "https://api-free.deepl.com/*",
    "https://api.deepl.com/*"
  ]
}
```

### 4.3. Code gọi API

```typescript
// src/background/translate.ts
interface DeepLResponse {
  translations: { text: string; detected_source_language: string }[];
}

export async function translateWithDeepL(
  text: string,
  apiKey: string
): Promise<string> {
  // DeepL free-tier key kết thúc bằng ":fx" -> dùng endpoint free
  const isFreeKey = apiKey.endsWith(':fx');
  const endpoint = isFreeKey
    ? 'https://api-free.deepl.com/v2/translate'
    : 'https://api.deepl.com/v2/translate';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: [text],
      source_lang: 'JA',
      target_lang: 'EN-US', // hoặc 'EN-GB' tùy setting user
    }),
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('DeepL API key không hợp lệ hoặc hết hạn.');
    }
    if (response.status === 456) {
      throw new Error('Đã vượt quota DeepL tháng này.');
    }
    throw new Error(`DeepL API lỗi: ${response.status}`);
  }

  const data: DeepLResponse = await response.json();
  return data.translations[0]?.text ?? '';
}
```

### 4.4. Error handling cần có trong UI
- Chưa nhập API key → hiện prompt dẫn tới settings, không gọi API.
- Key sai (403) → thông báo rõ, link tới trang lấy key DeepL.
- Hết quota (456) → thông báo, gợi ý đợi reset hoặc nâng cấp Pro.
- Mất mạng / timeout → retry 1 lần, sau đó báo lỗi + giữ nguyên text
  gốc tiếng Nhật để user không mất kết quả OCR.

### 4.5. Lấy API key
Hướng dẫn user trong README: đăng ký https://www.deepl.com/pro-api,
free tier hiện tại giới hạn theo ký tự/tháng (số chính xác agent nên
kiểm tra lại trên trang DeepL khi viết README cuối, vì hạn mức có thể
đổi theo thời gian) — hoàn toàn không dùng model dịch cũ (OpenAI).

---

## 5. File Structure

Giữ khung MV3 gốc, các file cần **sửa** hoặc **thêm mới**:

```
manga-ocr-for-chrome/
├── manifest.json                    [SỬA] thêm host_permissions DeepL,
│                                            commands (hotkey Alt+C),
│                                            context_menus permission
├── res/
│   ├── encoder_model.onnx           [THAY MỚI] model 2025
│   ├── decoder_model_merged.onnx    [THAY MỚI] model 2025
│   └── legacy/
│       ├── encoder-model.onnx       [GIỮ] fallback model cũ
│       └── decoder-model.onnx       [GIỮ] fallback model cũ
├── src/
│   ├── background/
│   │   ├── service-worker.ts        [SỬA] thêm listener context-menu,
│   │   │                                   command hotkey, message routing
│   │   │                                   sang translate.ts thay vì openai.ts
│   │   ├── translate.ts             [THÊM MỚI] thay cho openai.ts cũ
│   │   └── history.ts               [THÊM MỚI] CRUD chrome.storage.local
│   ├── offscreen/
│   │   ├── offscreen.html           [GIỮ NGUYÊN]
│   │   └── ocr.ts                   [SỬA] đổi path model, giữ logic decode
│   ├── content-script/
│   │   ├── selector-overlay.ts      [GIỮ Ý TƯỞNG, SỬA] region select UI
│   │   ├── result-overlay.ts        [THÊM MỚI] hiển thị bản dịch in-place
│   │   └── floating-button.ts       [THÊM MỚI] nút kích hoạt nổi
│   ├── popup/
│   │   ├── popup.html               [SỬA] thêm settings DeepL key,
│   │   │                                   toggle display mode, history tab
│   │   ├── popup.ts                 [SỬA]
│   │   └── popup.scss                [SỬA]
│   └── shared/
│       ├── types.ts                 [SỬA] thêm type cho DeepL response,
│       │                                   settings, history entry
│       └── messages.ts              [SỬA] thêm message types mới
├── webpack.config.js                [SỬA] thêm entry nếu tách file mới
├── package.json                     [SỬA]
└── setup.md                         (chính file này)
```

> Agent bắt buộc phải `view`/đọc từng file thật trong `src/` hiện có
> trước khi sửa — cấu trúc trên là suy đoán hợp lý dựa theo README và
> convention MV3 phổ biến (service-worker/offscreen/content-script),
> KHÔNG phải đã xác nhận từng file. Nếu tên file thật khác, giữ tên
> gốc, đừng đổi tên chỉ để khớp tài liệu này.

---

## 6. Step-by-step Implementation Guide

### Bước 0 — Đọc source code thật (bắt buộc, làm trước tiên)
```bash
git clone https://github.com/rDarge/manga-ocr-for-chrome.git
cd manga-ocr-for-chrome
# Đọc toàn bộ: manifest.json, webpack.config.js, package.json,
# và mọi file trong src/ — đặc biệt ocr.ts, cách offscreen document
# giao tiếp với service-worker, và cách openai hiện được gọi.
```
Không viết code nào ở các bước sau cho tới khi đã đọc xong bước này.

### Bước 1 — Setup nhánh mới, giữ nguyên baseline chạy được
```bash
git checkout -b feature/deepl-manga-ocr-2025
npm install
npm run build   # verify build cũ vẫn chạy trước khi sửa gì
```

### Bước 2 — Xác minh & tải model mới (theo mục 3.2)
Tải file `.onnx` từ `l0wgear/manga-ocr-2025-onnx`, đặt vào `res/`,
giữ bản cũ ở `res/legacy/`.

### Bước 3 — Sửa `ocr.ts` để trỏ sang model mới
Đổi path, verify tiền xử lý ảnh (resize/normalize) khớp
`preprocessor_config.json` của model mới nếu có khác biệt.

### Bước 4 — Viết `translate.ts`, xóa/deprecate `openai.ts`
Theo code mẫu mục 4.3. Xóa gói `openai` khỏi `package.json` sau khi
migrate xong toàn bộ chỗ gọi.

### Bước 5 — Settings trong popup: DeepL API key
- Input field lưu vào `chrome.storage.local` (KHÔNG sync — API key
  không nên đồng bộ qua chrome.storage.sync vì giới hạn dung lượng và
  lo ngại bảo mật khi sync qua nhiều máy).
- Nút "Test connection" gọi thử DeepL với text ngắn.

### Bước 6 — Hotkey + context menu + floating button
```json
// manifest.json
"commands": {
  "activate-capture": {
    "suggested_key": { "default": "Alt+C" },
    "description": "Bắt đầu chọn vùng để OCR"
  }
}
```
```typescript
// service-worker.ts
chrome.commands.onCommand.addListener((command) => {
  if (command === 'activate-capture') {
    // gửi message sang content-script của tab hiện tại để bật overlay
  }
});

chrome.contextMenus.create({
  id: 'manga-ocr-capture',
  title: 'OCR & Translate vùng này',
  contexts: ['page', 'image'],
});
```
Floating button: content-script chèn 1 `<button>` cố định góc màn hình,
click → trigger cùng logic với hotkey. Cho phép ẩn/hiện qua settings
(một số user không muốn button che nội dung manga).

### Bước 7 — Region select (giữ UX cũ, refactor nếu cần)
Giữ logic vẽ overlay chọn hình chữ nhật hiện có trong content-script,
đảm bảo hoạt động khi kích hoạt từ cả 3 nguồn (hotkey/menu/button).

### Bước 8 — Capture & crop
```typescript
// Trong service-worker, sau khi nhận toạ độ vùng chọn từ content-script:
const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' });
// Gửi dataUrl + coords sang offscreen document để crop bằng canvas
// (offscreen document có DOM/canvas, service-worker thì không)
```

### Bước 9 — Kết quả: overlay in-place + side panel toggle
- **Overlay in-place**: content-script vẽ 1 `<div>` đè lên đúng vị trí
  vùng đã chọn, background mờ, hiển thị text tiếng Anh, style tách
  biệt (Shadow DOM để tránh xung đột CSS với trang manga).
- **Side panel**: dùng `chrome.sidePanel` API (MV3, Chrome 114+) hiện
  cả câu tiếng Nhật gốc + bản dịch + nút copy.
- Setting toggle giữa 2 mode, lưu trong `chrome.storage.local`.

### Bước 10 — History
```typescript
// history.ts
interface HistoryEntry {
  id: string;
  timestamp: number;
  sourceText: string;
  translatedText: string;
  sourceUrl: string;
}
// Giới hạn số lượng entry lưu trữ (ví dụ 200 gần nhất) để tránh
// chrome.storage.local đầy — quota mặc định ~10MB.
```
Tab "History" trong popup: danh sách, tìm kiếm, xóa từng mục/xóa hết,
nút copy.

### Bước 11 — Tương thích Yomichan/Rikaikun/Yomitan
Overlay/side panel hiển thị text dạng **native DOM text node** (không
phải canvas/image) để các extension tra từ khi hover có thể đọc được
DOM bình thường — đây là điểm quan trọng, không cần code đặc biệt,
chỉ cần đảm bảo text hiển thị là text thật trong DOM, không render
thành ảnh hay canvas.

### Bước 12 — Performance
- Cache session ONNX đã load (đừng load lại model mỗi lần OCR).
- Hiện loading spinner ngay khi bắt đầu capture, tắt khi có kết quả.
- Cân nhắc `ort.env.wasm.proxy = true` nếu muốn thử offload sang
  worker riêng — nhưng lưu ý README gốc đã ghi nhận vấn đề CSP với
  worker threads, nên test kỹ trước khi bật.

---

## 7. Potential Issues & Solutions

| Vấn đề | Giải pháp |
|---|---|
| CSP chặn `.wasm` trong worker threads | Giữ `ort.env.wasm.numThreads = 1` như code gốc đã làm — đây là workaround đã biết hiệu quả, đừng đổi trừ khi test kỹ trên nhiều site manga |
| Model 2025 dùng tên file `.onnx` khác cấu trúc cũ | Bước 3.2 — luôn kiểm tra thực tế trên HuggingFace, đừng hardcode theo tài liệu này |
| DeepL CORS bị chặn nếu gọi từ content-script | Luôn gọi DeepL từ service-worker, không gọi trực tiếp từ content-script |
| `chrome.storage.local` quota (~10MB) đầy do history tích lũy | Giới hạn số entry lưu (FIFO, xóa cũ nhất khi vượt ngưỡng) |
| Extension size tăng do có cả model mới + legacy fallback | Cân nhắc: chỉ ship model mới trong bản release đầu, giữ legacy code path nhưng để user tự tải file legacy nếu cần (giảm kích thước gói cài đặt) |
| Firefox MV3 khác Chrome (side panel API không tồn tại ở Firefox) | `chrome.sidePanel` là Chrome-only — với Firefox cần fallback dùng sidebar_action hoặc chỉ dùng overlay in-place, KHÔNG side panel |
| API key DeepL lưu ở đâu an toàn | `chrome.storage.local`, không sync, không log ra console, mask khi hiển thị trong input (type="password") |
| Model 2025 có thể lệch tokenizer/vocab so với code decode cũ | Verify bước 3.2 mục 4 — nếu vocab khác, decoding loop sẽ ra ký tự sai hoàn toàn, cần test kỹ với vài câu mẫu trước khi merge |

---

## 8. Testing Plan

1. **Unit-level**: test riêng `translate.ts` (mock fetch, test cả 3
   nhánh: thành công, 403, 456, network error).
2. **Model sanity check**: chạy OCR trên 5-10 ảnh mẫu (chụp từ manga
   thật, có vertical text, furigana, font cách điệu) — so sánh kết quả
   model mới vs model cũ, ghi lại vào README để user biết chất lượng
   thực tế thay đổi thế nào.
3. **Manual E2E trên Chrome**: test cả 3 cách kích hoạt (hotkey, context
   menu, floating button) trên ít nhất 2 trang đọc manga khác nhau.
4. **Manual E2E trên Firefox**: xác nhận side panel fallback hoạt động,
   không crash nếu API không tồn tại.
5. **Test tương thích Yomitan/Rikaikun**: hover vào text tiếng Anh đã
   dịch, xác nhận dictionary popup của extension khác vẫn hoạt động
   bình thường (chỉ áp dụng nếu tra từ tiếng Nhật gốc, không phải bản
   dịch tiếng Anh — làm rõ trong README UX nào áp dụng).
6. **Test quota/lỗi DeepL**: dùng key free tier thật, cố tình vượt limit
   để xác nhận thông báo lỗi 456 hiển thị đúng.
7. **Test history**: OCR 200+ lần, xác nhận không vượt quota storage,
   FIFO xóa đúng entry cũ nhất.

---

## 9. TODO sau khi generate (không làm trong bản này)

- [ ] Auto text-detection (comic-text-detector hoặc tương đương) để
      tự tìm bubble thay vì chỉ manual rectangle select.
- [ ] Đánh giá thực tế `jzhang533/PaddleOCR-VL-For-Manga` nếu sau này
      có ONNX export browser-ready chính thức — hiện tại KHÔNG dùng vì
      thiếu export tối ưu cho web.
- [ ] Cân nhắc thêm fallback translate provider (đã quyết định KHÔNG
      làm ở bản này, chỉ DeepL) nếu sau này user phàn nàn về quota.
- [ ] Explore quantized version của model 2025 (int8) để giảm kích
      thước + tăng tốc độ, nếu HuggingFace có bản quantized.
- [ ] WebGPU execution provider cho ONNX Runtime Web (thay vì chỉ WASM)
      nếu ort.env hỗ trợ ổn định trên Chrome hiện tại — cần test riêng,
      không mặc định bật vì độ ổn định cross-device chưa rõ.
- [ ] Đóng gói Firefox riêng nếu WebExtension polyfill không đủ để
      dùng chung 1 codebase (kiểm tra sau khi có bản Chrome chạy ổn).

---

## Ghi chú cuối cho agent

- Luôn ưu tiên đọc code thật trong repo hơn giả định trong tài liệu
  này — mọi cấu trúc file/class ở đây là suy đoán hợp lý, không phải
  đã verify từng dòng.
- Khi có bất kỳ tên file `.onnx`, tên field JSON response của DeepL,
  hoặc API signature nào không chắc chắn — dừng lại kiểm tra thực tế
  (đọc doc chính thức hoặc file thật trong repo HuggingFace/GitHub)
  trước khi viết code, đừng đoán.
