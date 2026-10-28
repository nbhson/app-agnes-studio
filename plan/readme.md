# Plan — app-agnes-studio

> Agnes AI Studio: React client + Express proxy server (LLM chat/image/video upstream).

## Kết quả Review (audit đợt 1)

| # | Severity | Vị trí | Vấn đề | Fix |
|---|----------|--------|--------|-----|
| 1 | CRITICAL | server/index.ts:20,46-58 | `origin: true` (reflect mọi origin) + PUT/GET `/api/key` chỉ guard khi PROXY_TOKEN set (mặc định unset) → mọi trang web victim mở thao tác key/proxy qua reflected CORS | CORS luôn allowlist (`CLIENT_ORIGIN`, default localhost:5173); GET /api/key thêm `requireProxyAuth`; warning to khi PROXY_TOKEN unset |
| 2 | MAJOR | server/index.ts:167-171 | `/agnesapi` nối `video_id`/`model_name` thẳng vào URL — query injection | `encodeURIComponent` + validate `^[\w-]{1,128}$` |
| 3 | MAJOR | server/index.ts:39-44 | Middleware `X-Api-Key` ghi req.headers nhưng route build fetch headers riêng = dead code + cho phép caller hoán đổi upstream key | Xóa |
| 4 | MAJOR | server/index.ts:60-137 | Stream routes không abort khi client ngắt + fetch không timeout → leak connections | AbortController linked `req.on('close')` + `AbortSignal.any` với timeout 5 phút; pumpStream hủy reader |
| 5 | MAJOR | server/index.ts:85-88 | catch trả raw `err.message` (upstream body) + `res.status(500).json()` sau khi SSE headers đã gửi | `upstreamError()`: generic 502 trước stream, `res.end()` sau khi stream đã mở |
| 6 | MAJOR | client/ChatModule.tsx:78 | SSE split per-chunk (không line buffer) → `data:` line cắt giữa 2 chunk bị drop | Buffer accumulate + split trên `\n`, giữ tail |
| 7 | MAJOR | client/ChatModule.tsx:78 | `decoder.decode(value)` thiếu `{stream:true}` → hỏng UTF-8 multi-byte straddle | `{stream: true}` |
| 8 | MAJOR | client/ChatModule.tsx:69 | `!resp.ok` throw "Request failed" — không đọc body lỗi | Parse + surface body (status + 300 ký tự đầu) |
| 9 | MAJOR | client/ImageModule.tsx:51-53 | negative prompt nối vào `prompt` (`${negative}\n${prompt}`) — semantic NGƯỢC: nội dung cần tránh thành prompt chính | Gửi field `negative_prompt` riêng trong extra_body |
| 10 | MAJOR | client/VideoModule.tsx:51 | Poll URL không encodeURIComponent + thiếu `apiHeaders()` → 401 khi PROXY_TOKEN bật | Fix cả hai |
| 11 | MINOR | server/index.ts:52 | Log 8 ký tự đầu của API key | Chỉ log độ dài |
| 12 | MINOR | server/index.ts:32 | So sánh token không constant-time | HMAC + timingSafeEqual |
| 13 | MINOR | server/index.ts:60,91,105,139 | `app.all` nhận GET/PUT/DELETE trên POST-only endpoints | `app.post` |
| 14 | MINOR | server/index.ts:188-191 | body-parser lỗi JSON trả 500; thiếu 404 catch-all | 400 cho parse.failed, 404 catch-all cuối |
| 15 | MINOR | client/ChatModule.tsx:45,50 | id từ `Date.now()` collide | `crypto.randomUUID()` |
| 16 | MINOR | client/ChatModule.tsx:75-104 | Không abort khi unmount; CodeBlock định nghĩa trong body (remount mỗi render) | Cleanup useEffect + hoist CodeBlock |
| 17 | MINOR | client/App.tsx:44 | SettingsModal luôn mount — giữ plaintext key trong state kể cả khi đóng | Mount điều kiện `{settingsOpen && ...}` |
| 18 | MINOR | client/VideoModule.tsx:227 | Placeholder chuỗi `\\n` literal trong textarea | `\n` |
| 19 | MINOR | client/src/types.ts | Dead code toàn file (mọi component tự định nghĩa interface) | Xóa |
| 20 | MINOR | ./.DS_Store | Junk file committed | Xóa |
| 21 | MINOR | client (build) | `tsc` fail trước cả khi sửa: thiếu `vite/client` types cho `import.meta.env` | Thêm `src/vite-env.d.ts` |

## Không sửa (đã cân nhắc, ghi nhận)

- **API key trong localStorage** (SettingsContext): đúng là đọc được bởi XSS/extension, nhưng đây là client thuần (SPA) không có session backend — thay thế bằng sessionStorage chỉ giảm nhẹ. Đã giảm bề mặt bằng cách khóa CORS + proxy token; lời khuyên dài hạn: gateway proxy giữ key, client không chạm key. Ghi lại follow-up.
- **VideoModule polling stats** (completed count / totalDuration lệch): cosmetic stat logic, đổi nhiều mà ít giá trị — ghi nhận, không sửa đợt này.

## Trạng thái

- [x] Plan
- [x] Fix #1–#21
- [x] Server `tsc --noEmit` pass; client `tsc --noEmit` pass (sau khi fix vite-env)
- [x] Commit + self-review

## Review Log

### Vòng 1
- Self-review: lỗi tự phát hiện trong bản fix — (1) đặt tên param `Response` của fetch trùng với type Express `Response` → `globalThis.Response`; (2) edit đầu viết `${t ? '' : ''}` với biến `t` không tồn tại + `sseBuffer.pop()` trên string → sửa thành `lines.pop()`; (3) chèn `negative_prompt` vào `extra_body` (đúng shape API upstream dùng extra_body cho extension fields, nhất quán với `image` field sẵn có). Pump stream: reader.cancel() khi client ngắt — upstream đóng, không leak.
