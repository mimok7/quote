# Copilot Instructions for AI Agents

## 프로젝트 개요
**스테이하롱 견적 시스템** - Next.js 15 App Router + Supabase PostgreSQL 기반 견적 관리 전용 웹앱.

## 프로젝트 및 도메인 맵핑
- **sht-customer**: `customer2.stayhalong.com` (풀 기능 고객 예약 시스템)
- **sht-custom**: `customer.stayhalong.com` (간소화된 다이렉트 예약 시스템)
- 두 프로젝트는 동일한 Supabase DB를 공유하며 변경사항은 항상 동기화 유지

## 핵심 아키텍처

### 사용자 역할 시스템
- **견적자 (Guest)**: Supabase 인증만, users 테이블 미등록. 견적 생성/조회만 가능
- **예약자 (Member)**: 예약 시 users 테이블 등록 (`role: 'member'`), 예약 관리 권한
- **매니저 (Manager)**: `role: 'manager'`, 견적 승인/예약 처리
- **관리자 (Admin)**: `role: 'admin'`, 시스템 전체 관리

### 데이터베이스 구조
- **중앙 모델**: `quote` → `quote_item` → 서비스 테이블 (`room`, `car`, `airport`, `hotel`, `rentcar`, `tour`)
- **예약 구조**: `reservation` (메인) → `reservation_*` (서비스별 상세: `reservation_cruise`, `reservation_airport` 등)
- **가격 시스템**: `*_price` 테이블 (room_price, car_price 등)로 동적 가격 계산

### 표준 예약 저장 패턴
```tsx
// 1. 메인 예약 생성
const { data: reservation } = await supabase.from('reservation').insert({
  re_user_id: user.id,
  re_quote_id: quoteId,
  re_type: 'cruise', // 'airport', 'hotel', 'tour', 'rentcar'
  re_status: 'pending'
}).select().single();

// 2. 서비스별 상세 저장 (단일 행, request_note에 추가 서비스 기록)
await supabase.from('reservation_cruise').insert({
  reservation_id: reservation.re_id,
  room_price_code: selectedRoom.room_code,
  checkin: form.checkin,
  guest_count: form.adult_count,
  request_note: additionalServices.join('\n')
});
```

## 성능 최적화 패턴

### React Query 사용 (hooks/useQueries.ts)
```tsx
// 데이터 캐싱 및 자동 리페칭
import { useReservations, usePaymentMethods, useReservationAdditionalData } from '@/hooks/useQueries';

const { data: reservations, isLoading } = useReservations(userId);
const { data: methods } = usePaymentMethods(); // 1시간 캐싱
```

### 컴포넌트 최적화
```tsx
// useCallback으로 함수 메모이제이션
const loadData = useCallback(async () => {
  const { data } = await supabase.from('table').select('*');
}, [dependencies]);

// useMemo로 계산 결과 캐싱
const total = useMemo(() => items.reduce((sum, item) => sum + item.price, 0), [items]);
```

### DB 쿼리 병렬화
```tsx
// 여러 테이블 동시 조회
const [cruiseRes, carRes, airportRes] = await Promise.all([
  supabase.from('reservation_cruise').select('*').in('reservation_id', ids),
  supabase.from('reservation_cruise_car').select('*').in('reservation_id', ids),
  supabase.from('reservation_airport').select('*').in('reservation_id', ids)
]);
```

## 개발 워크플로우

### 주요 명령어
```bash
npm run dev          # 개발 서버 (http://localhost:3000)
npm run build        # 프로덕션 빌드 (타입 체크 무시)
npm run typecheck    # TypeScript 타입 체크만
npm run lint:fix     # ESLint 자동 수정
npm run apply-sql    # SQL 파일 실행 (scripts/apply-sql.js)
```

### 환경 변수 (.env.local)
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

## 코드 관례

### 인증 및 권한 체크
```tsx
// hooks/useAuth.ts 사용
import { useAuth } from '@/hooks/useAuth';

const { user, profile, loading } = useAuth(['member']); // 예약자 권한 필요
if (loading) return <Spinner />;
```

### 데이터 조회 패턴
```tsx
// 중첩 조인으로 관련 데이터 한 번에 조회
const { data } = await supabase
  .from('reservation')
  .select(`
    *,
    quote:re_quote_id(title, status),
    user:re_user_id(name, email)
  `)
  .eq('re_user_id', userId);
```

### UI 컴포넌트 구조
```tsx
import PageWrapper from '@/components/PageWrapper';
import SectionBox from '@/components/SectionBox';

<PageWrapper>
  <SectionBox title="섹션 제목">
    {loading ? <Spinner /> : <Content />}
  </SectionBox>
</PageWrapper>
```

### 로딩 상태 표준화
```tsx
if (loading) return (
  <div className="flex justify-center items-center h-72">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
  </div>
);
```

## 프로젝트 구조
```
sht-customer/
├── app/                      # Next.js App Router
│   ├── mypage/              # 사용자 페이지
│   │   ├── quotes/         # 견적 관리
│   │   ├── reservations/   # 예약 관리
│   │   └── direct-booking/ # 직접 예약 (cruise, airport, hotel, tour, rentcar)
│   ├── admin/              # 관리자 페이지 (별도 관리)
│   └── api/                # API Routes
├── components/              # 재사용 컴포넌트
│   ├── PageWrapper.tsx
│   ├── SectionBox.tsx
│   └── ...
├── hooks/                   # 커스텀 훅
│   ├── useAuth.ts          # 인증 및 권한 관리
│   └── useQueries.ts       # React Query 훅 (예약, 견적, 가격 등)
├── lib/                     # Supabase 클라이언트 및 유틸리티
│   ├── supabase.ts
│   ├── queryClient.ts      # React Query 설정
│   └── *Price*.ts          # 가격 계산 로직
├── sql/                     # DB 스키마 및 마이그레이션
│   ├── db.csv              # 테이블 구조 정의
│   └── performance_indexes.sql # 성능 인덱스 (Supabase에서 실행 필요)
└── scripts/                 # 유틸리티 스크립트
    └── apply-sql.js        # SQL 실행 스크립트
```

## 호텔 추가 절차 (필수 체크리스트!)
⚠️ **호텔을 추가한 후에는 반드시 호텔 가격 싱크 쿼리를 실행해야 견적/예약 페이지에 표시됩니다.**

### 단계 1: 호텔 SQL 파일 생성 및 실행
- 파일 위치: `sql/00X-호텔명-data.sql` (예: `009-l7-hotel-hanoi-2026-data.sql`)
- 선행 조건: `001-hotel-system-v3-tables-2026.sql` 실행 완료
- 포함 내용:
  - `hotel_info`: 호텔 기본정보 (호텔명, 위치, 체크인/아웃 시간 등)
  - `room_type`: 객실 타입 (7-8개 객실 구성)
  - `pricing_model`: 가격 정보 (2026년 전체 시즌)

### 단계 2: 호텔 가격 싱크 실행 (필수!)
**이 단계를 건너뛰면 호텔이 UI에 표시되지 않습니다:**
```
Supabase Dashboard → SQL Editor에서 아래 파일 실행:
sql/010-sync-hotel-price-2026.sql
```
- 역할: v3 테이블(hotel_info, room_type, pricing_model) → hotel_price 테이블로 자동 변환
- 시간: 보통 1-2초 소요
- 검증: 파일의 주석 처리된 검증 쿼리 실행하여 데이터 확인

### 단계 3: 페이지 확인
호텔이 정상 표시되는지 확인:
- 견적 페이지: `/mypage/quotes/hotel`
- 직접예약 페이지: `/mypage/direct-booking/hotel`

## 중요 제약 사항
- **폴더 구조 변경 금지**: 기존 구조 유지, 새 폴더 생성 자제
- **DB 스키마 참조**: sql/db.csv 확인, 불일치 시에만 DB 재확인
- **타입 체크**: 빌드 시 무시 설정됨 (`typescript.ignoreBuildErrors: true`), 개발 중엔 `npm run typecheck` 사용
- **호텔 싱크 필수**: 호텔 추가 후 반드시 010-sync-hotel-price-2026.sql 실행 (UI 표시 필수)

## DB 성능 최적화
- `sql/performance_indexes.sql` 참조 - 17개 테이블에 60+ 인덱스 정의
- Supabase Dashboard → SQL Editor에서 실행 필요
- 주요 인덱스: reservation 테이블 (user_id, quote_id, status), price 테이블 (조회 조건별)

## 테스트 및 디버깅
```bash
npm test              # Jest 테스트 실행
npm run test:watch    # 테스트 Watch 모드
```
- 테스트 설정: jest.config.js, jest.setup.js
- Testing Library 사용 (@testing-library/react)

## ⚠️ 무한 로딩 버그 해결 (2026.03.23 업데이트 - 필수)
### 증상: "세션 확인 중..." 무한 대기 또는 "권한 확인 중..." 멈춤

### 근본 원인
`ManagerLayout.tsx`, `AdminLayout.tsx`에서 다음 3가지 문제 복합:
1. **try-catch 없음** → `supabase.auth.getUser()` 실패 시 `setIsLoading(false)` 미호출 → 영구 로딩
2. **분기별 누락** → `router.push()` 후 `setIsLoading(false)` 미호출
3. **의존성 문제** → `useEffect(..., [router])` → `router` 변경 시 재실행

### 표준 해결 패턴 (필수 적용)
```tsx
// ✅ ManagerLayout.tsx / AdminLayout.tsx
useEffect(() => {
  let cancelled = false;  // 언마운트 후 상태 업데이트 방지
  const init = async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;
      
      if (error || !data.user) {
        setUserRole('guest');
        setIsLoading(false);
        return;
      }
      // ... 나머지 처리 ...
    } catch (err) {
      console.error('비동기 오류:', err);
      if (cancelled) return;
      setUserRole('guest');  // 기본값 설정
    } finally {
      if (!cancelled) setIsLoading(false);  // ✅ 반드시 실행
    }
  };
  
  init();
  return () => { cancelled = true; };  // 클린업
}, []);  // ✅ [] 의존성 - 최초 1회만
```

### 주요 수정 사항
- **try-catch-finally**: 어떤 오류도 `setIsLoading(false)` 보장
- **모든 분기**: 권한 없음, 로그인 필요, 성공 등 **모든 경로**에서 로딩 해제
- **cancelled 플래그**: 컴포넌트 언마운트 후 stale state 업데이트 방지
- **의존성 []**: 불필요한 중복 호출 제거

### 검증 체크리스트
- [ ] `try { ... } finally { setIsLoading(false) }` 구조 확인
- [ ] `router.push()` 직후에도 `setIsLoading(false)` 호출 확인
- [ ] `cancelled` 플래그로 언마운트 보호 확인
- [ ] `useEffect` 의존성 `[]` 사용 확인 (`[router]` 금지)
