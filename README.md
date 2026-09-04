# 🏓 Pickleball Tournament Manager

Hệ thống quản lý và điều hành giải Pickleball **chạy thật trong ngày thi đấu**:
Ban tổ chức mở trang quản trị trên laptop, mỗi trọng tài mở bàn điểm riêng trên
điện thoại/tablet, khán giả xem bảng điểm trên TV — **mọi điểm số đồng bộ
realtime qua Firebase Firestore**, không cần tải lại trang.

> Cấu hình mặc định khớp giải đang tổ chức: **9 đội · 2 bảng (5 + 4) · 2 sân ·
> vòng bảng chạm 11 · knockout chạm 15 · 16 trận vòng bảng**.
> Mọi con số đều lấy từ cấu hình giải, không hard-code — mở rộng 8/16 đội
> knockout được ngay.

---

## Mục lục

1. [Tính năng](#1-tính-năng)
2. [Cài đặt](#2-cài-đặt)
3. [Thiết lập Firebase](#3-thiết-lập-firebase)
4. [Biến môi trường](#4-biến-môi-trường)
5. [Firestore: dữ liệu & bảo mật](#5-firestore-dữ-liệu--bảo-mật)
6. [Authentication & phân quyền](#6-authentication--phân-quyền)
7. [Firestore indexes](#7-firestore-indexes)
8. [Tạo giải mẫu (seed)](#8-tạo-giải-mẫu-seed)
9. [Chạy dev](#9-chạy-dev)
10. [Deploy production](#10-deploy-production)
11. [Cấu trúc dự án](#11-cấu-trúc-dự-án)
12. [Luật thi đấu & nguyên tắc dữ liệu](#12-luật-thi-đấu--nguyên-tắc-dữ-liệu)
13. [Kiểm thử](#13-kiểm-thử)
14. [Checklist ngày thi đấu](#14-checklist-ngày-thi-đấu)

---

## 1. Tính năng

| Nhóm người dùng | Đường dẫn | Cần đăng nhập | Làm được gì |
| --- | --- | --- | --- |
| **Khán giả** | `/`, `/scoreboard`, `/standings`, `/knockout`, `/champion` | Không | Xem tỷ số realtime, lịch, BXH, nhánh knockout, nhà vô địch |
| **Trọng tài** | `/referee`, `/referee/court/[courtId]` | Có (REFEREE) | Gọi trận ra sân, bắt đầu, cộng/trừ điểm, kết thúc trận |
| **Ban tổ chức** | `/admin`, `/admin/teams`, `/admin/groups`, `/admin/matches`, `/admin/settings`, `/admin/setup` | Có (ADMIN) | Toàn bộ vòng đời giải |

Điểm nhấn kỹ thuật:

- **Realtime** bằng `onSnapshot` — một listener duy nhất cho mỗi collection,
  chia sẻ cho toàn app (tiết kiệm read).
- **Chống mất/ghi đè điểm**: mỗi lần đổi điểm chạy trong `runTransaction`
  (đọc lại từ server → kiểm tra luật → ghi). Khi mất mạng tự chuyển sang
  `increment()` — phép cộng nguyên tử phía server, Firestore gửi lại khi có mạng.
- **Khoá sân**: `court.currentMatchId` bảo đảm không bao giờ có 2 trận LIVE
  trên cùng một sân.
- **BXH không lưu DB** — luôn tính lại từ `matches`, nên không bao giờ lệch.
- **Nhánh knockout tự điền đội** từ "Nhất bảng A"/"Thắng bán kết 1"; sửa kết quả
  vòng trước sẽ tự đặt lại các trận phía sau.
- **Audit log**: ai sửa điểm, mở lại trận, tạo knockout — đều được ghi lại.
- **PWA**: trọng tài "Add to Home Screen", có chỉ báo Online/Offline trung thực.

---

## 2. Cài đặt

Yêu cầu: **Node.js ≥ 20** (khuyến nghị 22), npm ≥ 10.

```bash
npm install
```

---

## 3. Thiết lập Firebase

1. Vào [Firebase Console](https://console.firebase.google.com/) → **Add project**.
2. **Build → Firestore Database → Create database**
   - Chọn location gần Việt Nam (`asia-southeast1` — Singapore).
   - Chọn **Production mode** (rules thật sẽ deploy ở [bước 5](#5-firestore-dữ-liệu--bảo-mật)).
3. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable**.
4. **Project settings → General → Your apps → Web app (`</>`)** → đặt tên → copy
   đoạn `firebaseConfig`.

---

## 4. Biến môi trường

```bash
cp .env.example .env.local
```

Điền giá trị từ `firebaseConfig`:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=<project>
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=<project>.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

> Các biến `NEXT_PUBLIC_*` lộ ra client là **bình thường** với Firebase Web SDK —
> bảo mật thật nằm ở `firestore.rules`. **Tuyệt đối không** đặt service-account
> hay Firebase Admin key ở đây.

Nếu thiếu biến, ứng dụng không crash mà hiện màn hình hướng dẫn cấu hình.

---

## 5. Firestore: dữ liệu & bảo mật

### Sơ đồ dữ liệu

```text
tournaments/{tournamentId}
  ├── teams/{teamId}         # tên đội + VĐV + groupId
  ├── groups/{groupId}       # teamIds[] + số suất đi tiếp
  ├── matches/{matchId}      # điểm, trạng thái, sân, nguồn suất knockout
  ├── courts/{courtId}       # currentMatchId đóng vai trò "khoá sân"
  └── auditLogs/{logId}      # nhật ký thao tác
users/{userId}               # role: ADMIN | REFEREE
```

Bảng xếp hạng **không có collection riêng** — luôn được derive từ `matches`.

### Deploy security rules (BẮT BUỘC)

Ứng dụng cần **public read** cho scoreboard và **write có kiểm soát** cho
trọng tài/BTC. Rules mặc định của Firebase chặn tất cả, nên phải deploy
`firestore.rules` trước khi dùng:

```bash
npm install -g firebase-tools     # nếu chưa có
firebase login
firebase use --add                # chọn project vừa tạo
firebase deploy --only firestore:rules,firestore:indexes
```

Hoặc thủ công: mở **Firestore → Rules**, dán toàn bộ nội dung `firestore.rules`
rồi bấm **Publish**.

Tóm tắt quyền:

| | PUBLIC | REFEREE | ADMIN |
| --- | --- | --- | --- |
| Đọc giải/đội/bảng/trận/sân | ✅ | ✅ | ✅ |
| Cập nhật điểm & trạng thái trận | ❌ | ✅ | ✅ |
| Khoá/mở sân | ❌ | ✅ | ✅ |
| Mở lại trận đã kết thúc | ❌ | ❌ | ✅ |
| Tạo/xoá trận, sửa đội/bảng/cấu hình | ❌ | ❌ | ✅ |
| Đọc audit log | ❌ | ❌ | ✅ |

---

## 6. Authentication & phân quyền

Vai trò lưu ở `users/{uid}.role`. Người dùng đăng nhập lần đầu **tự tạo hồ sơ
với role `REFEREE`** (rules không cho tự phong ADMIN).

### Tạo ADMIN đầu tiên (bootstrap)

1. **Authentication → Users → Add user**: nhập email + mật khẩu cho BTC.
   Copy **User UID**.
2. **Firestore → Start collection** `users` → **Document ID = UID vừa copy**:

   | Field | Type | Value |
   | --- | --- | --- |
   | `name` | string | `Ban tổ chức` |
   | `email` | string | email vừa tạo |
   | `role` | string | `ADMIN` |

3. Đăng nhập tại `/login` → vào `/admin`.

### Thêm trọng tài

- Cách 1: **Authentication → Add user**, đưa email/mật khẩu cho trọng tài.
  Họ đăng nhập → hồ sơ `REFEREE` tự tạo → BTC gán sân ở **Quản trị → Cài đặt →
  Phân quyền**.
- Cách 2: BTC tạo sẵn document trong `users/` với `role: "REFEREE"`.

---

## 7. Firestore indexes

Toàn bộ query trong app đều dùng index đơn trường (Firestore tự tạo), nên
**không bắt buộc** deploy index. File `firestore.indexes.json` đi kèm các
composite index cho những truy vấn lọc thường dùng (theo bảng/sân/trạng thái):

```bash
firebase deploy --only firestore:indexes
```

Nếu về sau console báo thiếu index cho một query mới, bấm link trong thông báo
lỗi rồi thêm định nghĩa tương ứng vào file này.

---

## 8. Tạo giải mẫu (seed)

Cách nhanh nhất để thử realtime:

1. Mở `/` hoặc `/admin/setup`.
2. Bấm **TẠO GIẢI MẪU**.

Hệ thống tạo ngay: 9 đội (kèm VĐV), 2 bảng (5 + 4), 2 sân, **16 trận vòng bảng**
đã phân sân, giải ở trạng thái `GROUP_STAGE`.

Mở thêm một cửa sổ `/scoreboard` để thấy điểm nhảy realtime khi nhập ở
`/referee/court/court-1`.

Muốn tạo giải thật theo từng bước: `/admin/setup` (wizard 6 bước, có review
trước khi ghi dữ liệu).

---

## 9. Chạy dev

```bash
npm run dev          # http://localhost:3000
npm run build        # build production
npm run start        # chạy bản build
npm test             # chạy unit test (Vitest)
npm run test:watch   # test chế độ watch
```

Test trên điện thoại cùng mạng LAN:

```bash
npm run dev -- -H 0.0.0.0
# rồi mở http://<IP-máy-tính>:3000/referee trên điện thoại
```

---

## 10. Deploy production

### Vercel (khuyến nghị)

1. Push code lên GitHub → **Import project** trên Vercel.
2. **Settings → Environment Variables**: thêm đủ 6 biến `NEXT_PUBLIC_FIREBASE_*`.
3. Deploy. (Không cần cấu hình gì thêm — app chỉ nói chuyện với Firestore.)
4. **Firebase Console → Authentication → Settings → Authorized domains**: thêm
   domain Vercel để đăng nhập hoạt động.

### Firebase Hosting

```bash
npm run build
firebase experiments:enable webframeworks
firebase init hosting        # chọn thư mục dự án, framework Next.js
firebase deploy
```

Trước ngày thi đấu, nhớ chạy lại:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

---

## 11. Cấu trúc dự án

```text
app/
├── page.tsx                     # Trang chủ + tạo giải mẫu
├── admin/                       # Khu vực BTC (AuthGate ADMIN)
│   ├── page.tsx                 #   Dashboard + nhập điểm nhanh
│   ├── teams/ groups/ matches/  #   Đội · chia bảng · lịch & knockout
│   ├── settings/                #   Cấu hình, sân, phân quyền, audit log
│   └── setup/                   #   Wizard tạo giải 6 bước
├── referee/                     # Chọn sân
│   └── court/[courtId]/         #   Bàn điểm (nút to, một tay)
├── scoreboard/ standings/ knockout/ champion/   # Công khai
└── login/

lib/
├── firebase.ts                  # Khởi tạo lazy + persistent cache
├── auth.ts
├── firestore/                   # TẦNG DỮ LIỆU (chỉ nơi này gọi Firestore)
│   ├── paths.ts converters.ts errors.ts
│   ├── tournaments.ts teams.ts groups.ts courts.ts
│   ├── matches.ts               #   transaction cộng điểm/kết thúc/mở lại
│   ├── knockout.ts              #   tạo & đồng bộ nhánh
│   ├── auditLogs.ts users.ts bootstrap.ts seed.ts
└── tournament/                  # BUSINESS LOGIC (pure, không biết Firebase)
    ├── scoring.ts               #   luật điểm, thắng/thua, chặn tỷ số vô lý
    ├── schedule.ts              #   vòng tròn + xếp đợt theo số sân
    ├── standings.ts             #   BXH + tie-break (đối đầu, hiệu số...)
    ├── knockout.ts              #   bracket, nguồn suất, tự điền đội
    ├── validation.ts            #   các "cửa khoá" nghiệp vụ
    └── tournament.ts            #   cấu hình mặc định & helper

hooks/        useTournament · useMatches · useCourts · useStandings · useKnockout · useOnlineStatus
components/   providers · layout · ui · match · scoring · standings · knockout · court · tournament
types/tournament.ts              # Toàn bộ kiểu dữ liệu
tests/                           # 101 unit test cho business logic
firestore.rules · firestore.indexes.json · firebase.json · .env.example
```

Quy tắc kiến trúc: **UI → hooks → lib/firestore → Firestore**, và
**UI không bao giờ tự tính luật** mà gọi `lib/tournament/*`.

---

## 12. Luật thi đấu & nguyên tắc dữ liệu

### Điểm số

- Vòng bảng chạm `groupTargetScore` (mặc định **11**), knockout
  `knockoutTargetScore` (mặc định **15**).
- `winByTwo = true`: phải hơn **2 điểm** mới kết thúc → `11-10` chưa xong,
  `12-10` mới xong.
- Hệ thống **chặn mọi tỷ số không thể tồn tại**: điểm âm, `11-11` khi không có
  luật deuce, `13-8` khi target 11 (trận đã phải kết thúc ở `11-8`), cộng điểm
  sau khi trận đã FINISHED.

### Xếp hạng (đổi thứ tự trong Cài đặt)

1. Số trận thắng
2. Đối đầu trực tiếp (mini-league giữa các đội đang bằng nhau)
3. Hiệu số điểm
4. Tổng điểm ghi được

### Vòng đời

```text
Giải:  DRAFT → GROUP_STAGE → KNOCKOUT → FINISHED
Trận:  SCHEDULED → LIVE → FINISHED     (FINISHED → LIVE chỉ qua "MỞ LẠI TRẬN")
```

### Sửa kết quả

Sửa tỷ số một trận đã kết thúc → tính lại đội thắng → **BXH tự cập nhật**.
Nếu là trận knockout và đội thắng đổi → các trận phía sau **tự động được đặt lại**
và ghép đội mới. Không bao giờ để nhánh knockout sai đội.

### Offline

Chỉ báo góc phải luôn nói thật: `Online` / `Đang đồng bộ` / `Offline`.
Khi mất mạng, trọng tài **vẫn bấm điểm được** (Firestore xếp hàng và gửi lại),
nhưng ứng dụng **không nói "đã lưu"** cho tới khi server xác nhận.

---

## 13. Kiểm thử

```bash
npm test
```

101 test cho toàn bộ business logic:

| File | Nội dung |
| --- | --- |
| `tests/scoring.test.ts` | Luật chạm 11/15, deuce, chặn tỷ số vô lý, chặn ghi điểm sai lúc |
| `tests/schedule.test.ts` | Vòng tròn 2–16 đội, 5 đội = 10 trận, 4 đội = 6 trận, không trùng cặp, không đội nào đá 2 sân cùng lúc |
| `tests/standings.test.ts` | Thắng/thua/hiệu số, đối đầu trực tiếp, vòng tròn 3 đội, đổi luật xếp hạng |
| `tests/knockout.test.ts` | Bracket 4/8/16 đội, cặp Nhất A–Nhì B, tự điền đội, phát hiện xung đột khi sửa kết quả |
| `tests/validation.test.ts` | Khoá sân, một đội không đá 2 trận, xoá đội, mở lại trận |
| `tests/tournament-flow.test.ts` | **Kịch bản 21 bước**: 9 đội → 16 trận → BXH → knockout → nhà vô địch |

---

## 14. Checklist ngày thi đấu

**Trước giải**

- [ ] Đã deploy `firestore.rules` (nếu chưa, app báo lỗi quyền truy cập).
- [ ] Tạo tài khoản ADMIN + tài khoản cho từng trọng tài, gán sân.
- [ ] Nhập đủ đội (`/admin/teams`), chia bảng (`/admin/groups`).
- [ ] Sinh lịch (`/admin/matches`) — kiểm tra đúng số trận mong đợi.
- [ ] Bấm **BẮT ĐẦU GIẢI** ở `/admin`.

**Trong giải**

- [ ] TV mở `/scoreboard` (bấm **Toàn màn hình**).
- [ ] Mỗi trọng tài mở `/referee` → chọn sân → **Add to Home Screen**.
- [ ] BTC theo dõi `/admin`, nhập điểm hộ khi cần.
- [ ] Vòng bảng xong 16/16 → bấm **TẠO KNOCKOUT**.

**Sau giải**

- [ ] Chung kết kết thúc → `/champion` hiện nhà vô địch.
- [ ] Xem lại nhật ký thao tác ở **Cài đặt → Nhật ký**.

---

## Xử lý sự cố

| Hiện tượng | Nguyên nhân & cách xử lý |
| --- | --- |
| "Không có quyền truy cập dữ liệu" | Chưa deploy `firestore.rules`, hoặc tài khoản chưa có document `users/{uid}` |
| Đăng nhập báo lỗi domain | Thêm domain vào **Authentication → Settings → Authorized domains** |
| Trang trắng / "Chưa cấu hình Firebase" | Thiếu biến trong `.env.local`; sửa xong phải **khởi động lại** dev server |
| Sân kẹt ở trạng thái "Đang dùng" | **Cài đặt → Sân → Giải phóng** (xảy ra khi mất mạng giữa chừng) |
| Nhánh knockout thiếu đội | **Quản trị → Đồng bộ nhánh** |
| Mạng nhà thi đấu chặn WebSocket | Bỏ comment `NEXT_PUBLIC_FIREBASE_FORCE_LONG_POLLING=true` trong `.env.local` |
