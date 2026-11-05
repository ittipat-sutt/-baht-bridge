-- ============================================================================
-- BahtBridge — Row Level Security (RLS) Verification Test Script
-- Run this in Supabase SQL Editor to verify multi-tenant isolation
-- ============================================================================

DO $$
DECLARE
  user_a uuid := '11111111-1111-1111-1111-111111111111';
  user_b uuid := '22222222-2222-2222-2222-222222222222';
  found_count int;
  affected_count int;
BEGIN
  RAISE NOTICE '=== เริ่มต้นทดสอบความปลอดภัย Row Level Security (RLS) ===';

  -- 1. ล้างข้อมูลทดสอบเก่า (ถ้ามี)
  DELETE FROM public.orders WHERE merchant_id IN (user_a, user_b);

  -- 2. จำลองสร้างออเดอร์ของ User A และ User B
  INSERT INTO public.orders (id, merchant_id, customer_name, grand_total, rate_source)
  VALUES
    ('#BR_TEST_A', user_a, 'ลูกค้าของร้าน A', 1000.00, 'api'),
    ('#BR_TEST_B', user_b, 'ลูกค้าของร้าน B', 2500.00, 'api');

  RAISE NOTICE '✓ บันทึกออเดอร์ตั้งต้นของ User A และ User B เรียบร้อย';

  -- 3. จำลอง Session เป็น User A
  EXECUTE format('SET LOCAL "request.jwt.claims" = %L', json_build_object('sub', user_a, 'role', 'authenticated')::text);

  -- 3.1 User A ต้องมองเห็นเฉพาะออเดอร์ของตัวเอง (#BR_TEST_A)
  SELECT COUNT(*) INTO found_count FROM public.orders WHERE id = '#BR_TEST_B';
  IF found_count > 0 THEN
    RAISE EXCEPTION '❌ ล้มเหลว: User A สามารถมองเห็นออเดอร์ของ User B ได้!';
  ELSE
    RAISE NOTICE '✓ ผ่าน: User A ไม่สามารถ SELECT ออเดอร์ของ User B ได้ (พบ % แถว)', found_count;
  END IF;

  -- 3.2 User A พยายามแก้ไขออเดอร์ของ User B
  UPDATE public.orders SET customer_name = 'แฮกเกอร์ A' WHERE id = '#BR_TEST_B';
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count > 0 THEN
    RAISE EXCEPTION '❌ ล้มเหลว: User A สามารถ UPDATE ออเดอร์ของ User B ได้!';
  ELSE
    RAISE NOTICE '✓ ผ่าน: User A ถูก RLS บล็อก ไม่สามารถ UPDATE ออเดอร์ของ User B ได้ (อัปเดต % แถว)', affected_count;
  END IF;

  -- 3.3 User A พยายามลบออเดอร์ของ User B
  DELETE FROM public.orders WHERE id = '#BR_TEST_B';
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  IF affected_count > 0 THEN
    RAISE EXCEPTION '❌ ล้มเหลว: User A สามารถ DELETE ออเดอร์ของ User B ได้!';
  ELSE
    RAISE NOTICE '✓ ผ่าน: User A ถูก RLS บล็อก ไม่สามารถ DELETE ออเดอร์ของ User B ได้ (ลบ % แถว)', affected_count;
  END IF;

  -- 4. ล้างข้อมูลทดสอบ
  RESET "request.jwt.claims";
  DELETE FROM public.orders WHERE merchant_id IN (user_a, user_b);

  RAISE NOTICE '🎉 ผลการทดสอบ: ทุกนโยบาย RLS ทำงานสมบูรณ์แบบ แยกข้อมูล 100%%';
END $$;
