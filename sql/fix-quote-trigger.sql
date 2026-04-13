-- ===============================================================
-- quote 테이블 트리거 오류 수정
-- 오류: column "quote_id" does not exist (PATCH /rest/v1/quote 시)
-- 원인: DB 트리거 함수가 NEW.quote_id 참조 → 실제 컬럼명은 NEW.id
--
-- Supabase Dashboard → SQL Editor에서 각 STEP을 개별 실행하세요
-- ===============================================================

-- ---------------------------------------------------------------
-- [STEP 1] 먼저 실행: quote 테이블 트리거 목록 확인
-- ---------------------------------------------------------------
SELECT
  t.trigger_name,
  t.event_manipulation,
  t.action_timing,
  t.action_statement
FROM information_schema.triggers t
WHERE t.event_object_table = 'quote'
  AND t.trigger_schema = 'public'
ORDER BY t.trigger_name;

-- ---------------------------------------------------------------
-- [STEP 2] 먼저 실행: NEW.quote_id 를 참조하는 트리거 함수 찾기
-- ---------------------------------------------------------------
SELECT
  p.proname AS function_name,
  left(pg_get_functiondef(p.oid)::text, 2000) AS definition_preview
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND pg_get_functiondef(p.oid)::text ILIKE '%NEW.quote_id%';

-- ---------------------------------------------------------------
-- [STEP 3] 긴급 조치: quote 테이블 트리거 전체 비활성화
--   이 쿼리만 실행하면 견적 제출 오류가 즉시 해결됩니다.
--   (트리거 기능 없이 동작하므로 알림은 발송되지 않습니다)
-- ---------------------------------------------------------------
ALTER TABLE quote DISABLE TRIGGER ALL;

-- ---------------------------------------------------------------
-- [STEP 4] STEP 2 결과를 보고 함수명 확인 후 아래를 수정·실행
--   NEW.quote_id → NEW.id 로 수정하는 예시 템플릿:
--
-- CREATE OR REPLACE FUNCTION public.[함수명]()
-- RETURNS trigger LANGUAGE plpgsql AS $$
-- BEGIN
--   IF NEW.status IS DISTINCT FROM OLD.status THEN
--     INSERT INTO business_notifications (notification_id, business_type, department)
--     VALUES (NEW.id, 'quote', '영업');   -- ← NEW.quote_id → NEW.id
--   END IF;
--   RETURN NEW;
-- END;
-- $$;
-- ---------------------------------------------------------------

-- ---------------------------------------------------------------
-- [STEP 5] STEP 4 완료 후 실행: 트리거 다시 활성화
-- ---------------------------------------------------------------
-- ALTER TABLE quote ENABLE TRIGGER ALL;

