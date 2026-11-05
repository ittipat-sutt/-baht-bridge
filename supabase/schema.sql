-- ============================================================================
-- BahtBridge — Supabase Database Schema (supabase/schema.sql)
-- Multi-tenant Pre-Order / Cross-Border Shopping Architecture
-- ============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. HELPER FUNCTION: auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. TABLES DEFINITION
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table: merchants (ข้อมูลโปรไฟล์และร้านค้าของแม่ค้า)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.merchants (
  id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_name text NOT NULL DEFAULT 'Merchant Shop',
  email text,
  phone text,
  line_id text,
  instagram text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.merchants IS 'ข้อมูลร้านค้าและช่องทางการติดต่อของแม่ค้าแต่ละราย';

-- ----------------------------------------------------------------------------
-- Table: settings (การตั้งค่าร้านค้า ค่าส่ง ค่าบริการ มาร์กอัปเรท)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settings (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  schema_version int NOT NULL DEFAULT 2,
  next_order_no int NOT NULL DEFAULT 1,
  default_shipping numeric(12,2) NOT NULL DEFAULT 150.00,
  service_fee_type text NOT NULL DEFAULT 'fixed' CHECK (service_fee_type IN ('fixed', 'percent')),
  service_fee_value numeric(12,2) NOT NULL DEFAULT 100.00,
  rate_markup_percent numeric(5,2) NOT NULL DEFAULT 0.00,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_settings_merchant UNIQUE (merchant_id)
);

COMMENT ON TABLE public.settings IS 'การตั้งค่าระบบ ค่าน้ำหนักค่าส่งเริ่มต้น และค่าบริการของแต่ละร้าน';

-- ----------------------------------------------------------------------------
-- Table: customers (สมุดรายชื่อลูกค้าที่เคยสั่งซื้อ)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  contact_address text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.customers IS 'ประวัติและข้อมูลติดต่อของลูกค้าที่ติดต่อสั่งซื้อสินค้าทาง LINE/IG';

-- ----------------------------------------------------------------------------
-- Table: orders (คำสั่งซื้อหลัก)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
  id text NOT NULL, -- เช่น "#BR001"
  merchant_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  customer_phone text,
  customer_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  date_formatted text,
  order_status text NOT NULL DEFAULT 'pending' CHECK (order_status IN ('pending', 'ordered', 'arrived_th', 'shipped', 'completed', 'cancelled')),
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'refunded')),
  tracking_number text DEFAULT '',
  shipping_provider text DEFAULT 'Flash Express',
  rates_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, -- เรทที่ล็อกไว้ ณ วันที่สั่งซื้อ
  rates_at timestamptz DEFAULT now(),
  rate_source text NOT NULL DEFAULT 'fallback' CHECK (rate_source IN ('api', 'fallback', 'manual')),
  goods_total numeric(12,2) NOT NULL DEFAULT 0.00,
  shipping_fee numeric(12,2) NOT NULL DEFAULT 150.00,
  service_fee numeric(12,2) NOT NULL DEFAULT 100.00,
  grand_total numeric(12,2) NOT NULL DEFAULT 250.00,
  notes text DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (merchant_id, id)
);

COMMENT ON TABLE public.orders IS 'คำสั่งซื้อพรีออเดอร์/รับหิ้วสินค้า เก็บเรทล็อกและยอดชำระสุทธิ';

-- Index บน orders เพื่อประสิทธิภาพการค้นหาตามแม่ค้าและวันที่
CREATE INDEX IF NOT EXISTS idx_orders_merchant_created ON public.orders (merchant_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- Table: order_items (รายการสินค้าในออเดอร์)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.order_items (
  id text NOT NULL, -- เช่น "item_123"
  merchant_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id text NOT NULL,
  name text NOT NULL,
  currency text NOT NULL CHECK (currency IN ('USD', 'JPY', 'KRW', 'CNY', 'EUR', 'THB')),
  original_price numeric(14,4) NOT NULL DEFAULT 0.00,
  quantity int NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  exchange_rate numeric(12,6) NOT NULL DEFAULT 1.000000,
  converted_price_thb numeric(12,2) NOT NULL DEFAULT 0.00,
  subtotal_thb numeric(12,2) NOT NULL DEFAULT 0.00,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (merchant_id, order_id, id),
  FOREIGN KEY (merchant_id, order_id) REFERENCES public.orders(merchant_id, id) ON DELETE CASCADE
);

COMMENT ON TABLE public.order_items IS 'รายการสินค้าแต่ละชิ้นในออเดอร์พร้อมราคาต้นทางและเรทแปลงเงินบาท';

-- ----------------------------------------------------------------------------
-- Table: payments (ประวัติการชำระเงินและสลิป)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id text NOT NULL,
  amount numeric(12,2) NOT NULL,
  payment_method text NOT NULL DEFAULT 'bank_transfer',
  slip_url text,
  paid_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (merchant_id, order_id) REFERENCES public.orders(merchant_id, id) ON DELETE CASCADE
);

COMMENT ON TABLE public.payments IS 'ประวัติการรับชำระเงินของออเดอร์เพื่อการตรวจสอบยอดเงินเข้า';

-- ----------------------------------------------------------------------------
-- Table: shipments (ข้อมูลพัสดุและการจัดส่ง)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shipments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id text NOT NULL,
  provider text NOT NULL DEFAULT 'Flash Express',
  tracking_number text NOT NULL,
  shipped_at timestamptz DEFAULT now(),
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (merchant_id, order_id) REFERENCES public.orders(merchant_id, id) ON DELETE CASCADE
);

COMMENT ON TABLE public.shipments IS 'ข้อมูลการจัดส่งในไทย เลขพัสดุ และสถานะการนำจ่าย';

-- ----------------------------------------------------------------------------
-- Table: status_history (ประวัติการเปลี่ยนสถานะของออเดอร์)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.status_history (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  order_id text NOT NULL,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (merchant_id, order_id) REFERENCES public.orders(merchant_id, id) ON DELETE CASCADE
);

COMMENT ON TABLE public.status_history IS 'บันทึกประวัติการเปลี่ยนสถานะออเดอร์ (Audit Trail)';

-- ============================================================================
-- 4. AUTO UPDATE UPDATED_AT TRIGGERS
-- ============================================================================
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['merchants', 'settings', 'customers', 'orders', 'order_items', 'payments', 'shipments', 'status_history'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_update_updated_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_update_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t);
  END LOOP;
END $$;

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- เปิดใช้งาน RLS บนทุกตาราง
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_history ENABLE ROW LEVEL SECURITY;

-- Policy สำหรับตาราง merchants
CREATE POLICY "merchants_owner_all" ON public.merchants
  FOR ALL TO authenticated
  USING (merchant_id = auth.uid())
  WITH CHECK (merchant_id = auth.uid());

-- Policy สำหรับตาราง settings
CREATE POLICY "settings_owner_all" ON public.settings
  FOR ALL TO authenticated
  USING (merchant_id = auth.uid())
  WITH CHECK (merchant_id = auth.uid());

-- Policy สำหรับตาราง customers
CREATE POLICY "customers_owner_all" ON public.customers
  FOR ALL TO authenticated
  USING (merchant_id = auth.uid())
  WITH CHECK (merchant_id = auth.uid());

-- Policy สำหรับตาราง orders
CREATE POLICY "orders_owner_all" ON public.orders
  FOR ALL TO authenticated
  USING (merchant_id = auth.uid())
  WITH CHECK (merchant_id = auth.uid());

-- Policy สำหรับตาราง order_items
CREATE POLICY "order_items_owner_all" ON public.order_items
  FOR ALL TO authenticated
  USING (merchant_id = auth.uid())
  WITH CHECK (merchant_id = auth.uid());

-- Policy สำหรับตาราง payments
CREATE POLICY "payments_owner_all" ON public.payments
  FOR ALL TO authenticated
  USING (merchant_id = auth.uid())
  WITH CHECK (merchant_id = auth.uid());

-- Policy สำหรับตาราง shipments
CREATE POLICY "shipments_owner_all" ON public.shipments
  FOR ALL TO authenticated
  USING (merchant_id = auth.uid())
  WITH CHECK (merchant_id = auth.uid());

-- Policy สำหรับตาราง status_history
CREATE POLICY "status_history_owner_all" ON public.status_history
  FOR ALL TO authenticated
  USING (merchant_id = auth.uid())
  WITH CHECK (merchant_id = auth.uid());
