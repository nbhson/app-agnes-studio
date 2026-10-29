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

## Round 2 (2026-10-29) — Deep review + enterprise upgrade

### Kết quả Review đợt 2

| # | Severity | Vị trí | Vấn đề | Fix |
|---|----------|--------|--------|-----|
| R2-1 | MAJOR | server/index.ts | 5 route proxy lặp lại cùng pattern fetch/error/timeout — mỗi fix bảo mật phải sửa 5 chỗ | Tách `proxyUpstream()` + `proxySse()` helpers; 1 chỗ duy nhất cho timeout/abort/error |
| R2-2 | MAJOR | server/index.ts | Không security headers, không rate limit → proxy mở (PROXY_TOKEN unset) bị lạm dụng cạn key upstream | Middleware headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy) + in-memory token-bucket rate limiter theo IP |
| R2-3 | MAJOR | server/index.ts | Không graceful shutdown (SIGTERM) — in-flight stream bị cắt lúc deploy | `server.close()` + drain |
| R2-4 | MAJOR | client VideoModule | Poll loop sống sót qua unmount (await in-flight schedule setTimeout sau cleanup) + retry vô hạn khi lỗi network | Mounted ref + abort controller + cap 20 lỗi liên tiếp |
| R2-5 | MAJOR | client ChatModule | `components` của ReactMarkdown tạo mới mỗi render → markdown tree remount mỗi token stream | Hoist ra module-level const |
| R2-6 | MAJOR | client (3 module) | Duplicate: error parsing, textarea/input classes, module header, spinner | `lib/api.ts` (postJson/parseApiError) + `components/ui.tsx` (Field, TextArea, ErrorBanner, ModuleHeader) |
| R2-7 | MINOR | server/index.ts | Warning `CLIENT_ORIGIN unset` là dead code (luôn có default); health endpoint thiếu uptime/version | Sửa warning logic; health trả uptime |
| R2-8 | MINOR | server/index.ts | express.json() default 100KB — chat history dài / b64 img-to-img có thể 413 âm thầm | Limit tường minh 2MB |
| R2-9 | MINOR | client SettingsModal | Không a11y: không Esc-close, không autofocus, label không `htmlFor`, không toggle show/hide key | Fix đủ bộ |
| R2-10 | MINOR | client App/Sidebar | Không responsive — sidebar 256px cố định, hỏng trên mobile | Sidebar thu gọn icon-rail dưới `lg` |
| R2-11 | NOTE | client toàn cục | Dark-only hardcoded hex; spacing/typography lệch nhau giữa module | CSS-variable design tokens (light+dark), theme toggle, spacing/typography chuẩn hóa |

### Features mới (Round 2)

- **F1 — Chat conversations**: multi-conversation persisted trong localStorage; tạo/đổi/xóa/đổi tên, tự đặt title từ tin nhắn đầu, giữ stats theo conversation.
- **F2 — Stop / Regenerate**: nút Stop hủy stream giữa chừng (đã stream được giữ lại); Regenerate chạy lại turn cuối.
- **F3 — Theme system**: Light/Dark toggle (default dark, persist localStorage, tôn trọng `prefers-color-scheme` lần đầu).
- **F4 — Ops**: request logging + rate limiting + graceful shutdown ở proxy (đếm ở mục R2-2/R2-3).

### Không sửa (đã cân nhắc)

- API key vẫn trong localStorage (client thuần, không session backend) — giữ quyết định Round 1.
- Không thêm deps mới (không helmet/rate-limiter npm) — logic nhỏ tự viết, tránh churn lockfile.
- Không thêm test framework: dùng `node:test` có sẵn qua tsx cho pure logic (rate limiter, token compare, SSE line buffer).

### Trạng thái Round 2

- [x] Plan
- [x] Server refactor + hardening + tests
- [x] Client dedupe + theme + conversations + stop/regenerate + video polling fix
- [x] Build `turbo build` green (server tsc + client tsc/vite)
- [x] Tests green (server pure logic: rate limiter 4 + secure compare 4 = 8/8)
- [x] Commits nhỏ, conventional, local-only

### Hoàn tất phần còn lại (2026-10-29, phiên tiếp nối)

Phiên trước bị ngắt giữa chừng và để lại WIP chưa commit (`App.tsx`, `SettingsModal.tsx`,
`Sidebar.tsx`) — trong đó `App.tsx` còn **lỗi cú pháp** (JSX expression chưa đóng `}` +
`</SettingsProvider>` thiếu, lồng sai ThemedProvider/SettingsProvider). Đã sửa, hoàn thiện và
verify:

| # | Việc | Commit |
|---|------|--------|
| W1 | Sửa lỗi cú pháp App.tsx, wire `ThemeProvider` vào app root | 411bfa1 |
| W2 | Hoàn tất SettingsModal a11y (Esc, autofocus, show/hide key, scroll lock) + Sidebar icon-rail responsive < `lg` + theme toggle | 411bfa1 |
| W3 | Mobile conversation switcher cho Chat (rail `hidden md:flex` → trước đó không đổi được conversation trên mobile) | 63bf8c4 |
| W4 | Focus trap Tab trong Settings dialog (đóng nốt R2-9) | a5c09cb |

### Self-review cuối Round 2

- Đã rà lại toàn bộ diff `a8280ca..HEAD`: không còn duplicate pattern, không log key,
  mọi route proxy đi qua `forwardJson`/`forwardSse` chung (timeout + client-abort + 502).
- **Cố ý giữ**: CodeBlock vẫn nền tối `#0d1117` + theme `github-dark` ở cả light mode —
  pattern phổ biến (docs site), giữ 1 stylesheet highlight.js; đã ghi nhận, không phải bug.
- **Không sửa (follow-up)**: rate limiter theo `req.ip` sẽ cần `app.set('trust proxy')`
  nếu deploy sau reverse proxy; image results / video tasks chưa persist qua reload.
- Build: `turbo build` green (2/2). Tests: `npm test` server 8/8 pass.

## Round 4 (2026-10-29) — Reverse-proxy support, persistence, bug fixes

### Việc đã làm

| # | Việc | Commit |
|---|------|--------|
| R4-1 | **TRUST_PROXY** (risk #1 Round 2): đọc `TRUST_PROXY` env (hop count / CIDR list / shorthand `loopback|linklocal|uniquelocal` / `true`) → `app.set('trust proxy')`. Default vẫn `false` — `req.ip` là socket address, X-Forwarded-For bị bỏ qua → không thể spoof để né rate limit khi exposure trực tiếp. Rate limiter tự theo `req.ip`, không cần sửa gì thêm. Health endpoint trả `trustProxy`. | d6f9888 |
| R4-2 | **BUG (đã verify thực nghiệm)**: client-disconnect detection trong `forwardSse` là **dead code** — từ Node ≥16, `req.on('close')` bắn ngay khi request body được consume (~1ms sau `express.json()`), TRƯỚC khi handler kịp gắn listener → không bao giờ fire → upstream leak connection khi client hangup (đúng lỗi R1-#4 tưởng đã fix). Fix: `res.on('close')` + `!writableEnded` (fire đúng 1 lần per response). Đồng thời wire client-abort signal vào các route `forwardJson` (responses/images/videos/agnesapi) — trước đó chỉ SSE có abort, JSON route chạy nhiều phút với client đã ngắt. | d6f9888 |
| R4-3 | Extract `createApp()` factory (`app.ts`); `index.ts` chỉ còn boot (dotenv/listen/shutdown). Options inject được: `trustProxy`, `apiBaseUrl`, `rateLimitMax`, `keyMgmtMax`, `apiBaseUrl`… → test được thật request không cần mutate env. | d6f9888 |
| R4-2t | **Tests mới (11)**: `trust-proxy.test.ts` 6 test parse; `app.test.ts` 5 test integration (app thật trên port 0 + mock upstream SSE): (1) tắt trust proxy → XFF bị ignore (spoof không bypass limiter), (2) bật `trustProxy:1` → limiter key theo XFF thật, (3) client ngắt giữa SSE → upstream bị abort, (4) stream hoàn thành bình thường khi client đọc hết, (5) health báo `trustProxy`. | d6f9888 |
| R4-2c | **Persistence image/video** (risk #2 Round 2) — chọn **localStorage** (server stateless by design, key in-memory; server-side persistence sẽ kéo theo câu hỏi auth/state): `lib/imageHistory.ts` (URL-based results, cap 30, **strip b64 khi lưu** — data URL ~1–2MB/ảnh sẽ nổ quota; b64-only là session-only), `lib/videoTasks.ts` (tasks + video URL; task non-terminal **resume polling** khi mount vì upstream vẫn chạy tiếp sau reload). Defensive parse + trim-nửa-mới-khi-quota + give-up-silently, cùng pattern `conversations.ts`. | a92e8a5 |
| R4-3 | **Bug (client)**: key chỉ sync lên server khi user bấm Save — server restart/reload trang xong client vẫn có key (localStorage) nhưng proxy rỗng (in-memory) → mọi request fail cho tới khi nhập lại. Boot sync fire-and-forget 1 lần. Đồng thời bổ sung `.env.example` (TRUST_PROXY, PROXY_TOKEN, CLIENT_ORIGIN, BODY_LIMIT). | cc54be0 |

### Kiểm chứng thực nghiệm (bug R4-2)

Script `node -e` tái hiện SSE POST + `express.json()` trên Node hiện tại:
- `req.close` bắn tại **t=1ms** với `writableEnded=false` (khi message hoàn tất — thay đổi semantics Node ≥16), listener gắn trong handler luôn đến muộn.
- `res.close` chỉ bắn khi response kết thúc thật sự (hoặc client ngắt, `writableEnded=false`).
→ Test integration xác nhận: fix mới abort upstream khi client disconnect, không abort khi stream chạy bình thường.

### Trạng thái Round 4

- [x] TRUST_PROXY + tests with/without X-Forwarded-For (integration, không spoof được khi tắt trust)
- [x] Persistence image results + video tasks (localStorage, quota-aware, resume polling)
- [x] Bug fixes: dead client-disconnect detection (SSE + JSON routes), API-key boot sync
- [x] `turbo build` 2/2 green; server tests 19/19; tsc clean
- [x] Commits conventional, **local only** (chưa push)

### Còn lại / follow-up

- `request.ip` trust proxy đúng nghĩa chỉ khi reverse proxy set `X-Forwarded-For` và strip/append đúng — docs khuyến nghị chỉ bật TRUST_PROXY khi chắc chắn topology.
- CORS vẫn allowlist localhost mặc định; khi deploy cần set `CLIENT_ORIGIN` + `PROXY_TOKEN` (đã ghi trong `.env.example`).
- Video/image stats (totalTasks/completedTasks/totalPixels) vẫn session-only — cố ý, tránh đếm kép khi resume polling sau reload.
- Code-split client (chunk > 500KB warning) — không thuộc scope.

## Trạng thái (Round 1)

- [x] Plan
- [x] Fix #1–#21
- [x] Server `tsc --noEmit` pass; client `tsc --noEmit` pass (sau khi fix vite-env)
- [x] Commit + self-review

## Review Log

### Vòng 2 (Round 2 hoàn tất)
- Phiên trước để WIP chưa commit kèm lỗi cú pháp trong App.tsx (thiếu `}`, thiếu
  `</SettingsProvider>`, wrap sai thứ tự Provider). Đã sửa và chia thành commits riêng:
  WIP hoàn tất (411bfa1), mobile conversation switcher (63bf8c4), focus trap (a5c09cb).
- Self-review phát hiện thêm: `TextInput` import thừa trong SettingsModal (TS6133, đã bỏ);
  conversation rail ẩn < md khiến chat conversation không thể truy cập trên mobile (đã fix).

### Vòng 1
- Self-review: lỗi tự phát hiện trong bản fix — (1) đặt tên param `Response` của fetch trùng với type Express `Response` → `globalThis.Response`; (2) edit đầu viết `${t ? '' : ''}` với biến `t` không tồn tại + `sseBuffer.pop()` trên string → sửa thành `lines.pop()`; (3) chèn `negative_prompt` vào `extra_body` (đúng shape API upstream dùng extra_body cho extension fields, nhất quán với `image` field sẵn có). Pump stream: reader.cancel() khi client ngắt — upstream đóng, không leak.
