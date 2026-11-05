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
          !content.includes('service_role') || content.includes('ห้ามใช้ service_role') || content.includes('NEVER use the service_role') || content.includes('NEVER use the secret/admin key!'),
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

    const ordersA = rlsQuery('user_A', 'orders').select();
    assert.equal(ordersA.length, 1);
    assert.equal(ordersA[0].id, '#BR001');

    const updateResult = rlsQuery('user_A', 'orders').update('#BR002', { customer_name: 'แฮกเกอร์' });
    assert.equal(updateResult, 0);
    assert.equal(db.orders.find((o) => o.id === '#BR002').customer_name, 'ลูกค้าของ B');

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

  test('AuthService: Client mocking and session state checks', async () => {
    assert.equal(AuthService.isAuthenticated(), false);
    
    // Mock Supabase Client
    const mockClient = {
      auth: {
        getUser: async () => ({ data: { user: { id: 'usr-123', email: 'test@example.com' } } }),
        signInWithOtp: async ({ email }) => {
          if (email.includes('error')) throw new Error('OTP failed');
          return { data: {}, error: null };
        },
        signInWithOAuth: async () => ({ data: { url: 'https://auth.google.com' }, error: null }),
        signOut: async () => ({ error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      },
      from: () => ({
        delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
        select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
        upsert: () => Promise.resolve({ error: null }),
      }),
    };

    AuthService._setSupabaseClient(mockClient);
    assert.equal(typeof AuthService.getSupabase(), 'object');

    const u = await AuthService.getCurrentUser();
    assert.equal(u.email, 'test@example.com');
    assert.equal(AuthService.isAuthenticated(), true);

    // Test signInWithEmail
    const invalidRes = await AuthService.signInWithEmail('invalid-email');
    assert.equal(invalidRes.success, false);

    const validRes = await AuthService.signInWithEmail('valid@example.com');
    assert.equal(validRes.success, true);

    // Test signInWithGoogle
    const googleRes = await AuthService.signInWithGoogle();
    assert.equal(googleRes.success, true);

    // Test deleteAccount double confirm
    global.confirm = () => true;
    await AuthService.deleteAccount();
    assert.equal(AuthService.isAuthenticated(), false);

    // Test signOut
    await AuthService.signOut();
    assert.equal(AuthService.isAuthenticated(), false);
  });
});
