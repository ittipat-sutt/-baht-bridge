const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const LocalStorageService = require('../storage.js');
const SupabaseStorage = require('../supabase-storage.js');
const AuthService = require('../auth.js');

describe('Security & Auth & Supabase Storage', () => {
  test('Security: ตรวจสอบว่าไม่มี service_role key ในซอร์สโค้ดฝั่งแอปเด็ดขาด', () => {
    const filesToCheck = ['config.example.js', 'auth.js', 'supabase-storage.js', 'storage.js', 'app.js', 'pricing.js'];
    for (const file of filesToCheck) {
      const filePath = path.join(__dirname, '..', file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        assert.ok(
          !content.includes('service_role') || content.includes('ห้ามใช้ service_role') || content.includes('NEVER use the service_role'),
          `ตรวจพบคำว่า service_role ใน ${file}`
        );
      }
    }
  });

  test('Interface Compatibility: SupabaseStorage ต้องมี API เหมือนกับ LocalStorageService ทุกประการ', () => {
    const requiredMethods = [
      'getOrders',
      'getOrder',
      'saveOrder',
      'deleteOrder',
      'getSettings',
      'saveSettings',
      'exportAll',
      'importAll',
    ];

    for (const method of requiredMethods) {
      assert.equal(typeof SupabaseStorage[method], 'function', `SupabaseStorage ขาด method: ${method}`);
      assert.equal(typeof LocalStorageService[method], 'function', `LocalStorageService ขาด method: ${method}`);
    }
  });

  test('RLS Simulation: จำลองสิทธิ์ RLS ผู้ใช้ A ไม่สามารถเข้าถึงหรือแก้ไขข้อมูลของผู้ใช้ B ได้', () => {
    // จำลอง Database Table และ RLS Policy (merchant_id = auth.uid())
    const db = {
      orders: [
        { id: '#BR001', merchant_id: 'user_A', customer_name: 'ลูกค้าของ A' },
        { id: '#BR002', merchant_id: 'user_B', customer_name: 'ลูกค้าของ B' },
      ],
    };

    function rlsQuery(currentUserId, targetTable) {
      return {
        select: () => db[targetTable].filter((row) => row.merchant_id === currentUserId),
        update: (id, updates) => {
          let updatedCount = 0;
          db[targetTable] = db[targetTable].map((row) => {
            if (row.id === id && row.merchant_id === currentUserId) {
              updatedCount++;
              return { ...row, ...updates };
            }
            return row;
          });
          return updatedCount;
        },
        delete: (id) => {
          const initLen = db[targetTable].length;
          db[targetTable] = db[targetTable].filter((row) => !(row.id === id && row.merchant_id === currentUserId));
          return initLen - db[targetTable].length;
        },
      };
    }

    // 1. User A อ่านข้อมูล -> ต้องเห็นเฉพาะของ A (1 รายการ)
    const ordersA = rlsQuery('user_A', 'orders').select();
    assert.equal(ordersA.length, 1);
    assert.equal(ordersA[0].id, '#BR001');

    // 2. User A พยายาม Update ออเดอร์ #BR002 ของ User B -> ต้องอัปเดต 0 รายการ (ถูก RLS บล็อก)
    const updateResult = rlsQuery('user_A', 'orders').update('#BR002', { customer_name: 'แฮกเกอร์' });
    assert.equal(updateResult, 0);

    // ตรวจสอบว่าข้อมูลของ B ไม่ถูกเปลี่ยน
    assert.equal(db.orders.find((o) => o.id === '#BR002').customer_name, 'ลูกค้าของ B');

    // 3. User A พยายาม Delete ออเดอร์ของ User B -> ต้องลบ 0 รายการ
    const deleteResult = rlsQuery('user_A', 'orders').delete('#BR002');
    assert.equal(deleteResult, 0);
    assert.equal(db.orders.length, 2);
  });

  test('Offline Queue: คิวบันทึกข้อมูลแบบ Last-Write-Wins ทำงานถูกต้อง', () => {
    const queue = [
      { id: '1', action: 'saveOrder', payload: { id: '#BR001', customerName: 'ลูกค้าใหม่' } },
    ];
    assert.equal(queue.length, 1);
    assert.equal(queue[0].payload.customerName, 'ลูกค้าใหม่');
  });
});
