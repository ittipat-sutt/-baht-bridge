const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const Backup = require('../backup.js');
const Settings = require('../settings-ui.js');
const Storage = require('../storage.js');

describe('Backup and Settings Extra Coverage', () => {
  test('Settings DOM Population and Form Data Extraction', () => {
    const fakeForm = {
      defaultShipping: { value: '250' },
      serviceFeeType: { value: 'percent' },
      serviceFeeValue: { value: '12' },
      rateMarkupPercent: { value: '3.5' },
      merchantName: { value: 'MyShop' },
      merchantEmail: { value: 'shop@test.com' },
      merchantPhone: { value: '0891234567' },
    };

    const extracted = {
      defaultShipping: fakeForm.defaultShipping.value,
      serviceFeeType: fakeForm.serviceFeeType.value,
      serviceFeeValue: fakeForm.serviceFeeValue.value,
      rateMarkupPercent: fakeForm.rateMarkupPercent.value,
      merchantName: fakeForm.merchantName.value,
      merchantEmail: fakeForm.merchantEmail.value,
      merchantPhone: fakeForm.merchantPhone.value,
    };

    const res = Settings.validateSettings(extracted);
    assert.equal(res.valid, true);
    assert.equal(res.sanitized.defaultShipping, 250);
    assert.equal(res.sanitized.serviceFeeValue, 12);
    assert.equal(res.sanitized.rateMarkupPercent, 3.5);
  });

  test('Settings: loadSettings and saveSettings with mock document', async () => {
    const fields = {
      'set-default-shipping': { value: '180' },
      'set-fee-type': { value: 'percent' },
      'set-fee-value': { value: '8' },
      'set-markup': { value: '2' },
      'btn-save-settings': { onclick: null },
    };

    const docMock = {
      getElementById: (id) => fields[id] || null,
    };
    global.window = { document: docMock, StorageService: Storage };
    global.document = docMock;

    await Settings.loadSettings();
    assert.ok(fields['set-default-shipping'].value);

    const saved = await Settings.saveSettings();
    assert.equal(saved, true);

    Settings.initSettingsUI();
    assert.equal(typeof fields['btn-save-settings'].onclick, 'function');
  });

  test('Backup Content Validation Edge Cases', () => {
    const invalidOrders = JSON.stringify({
      app: 'BahtBridge',
      orders: 'not-an-array',
    });
    assert.equal(Backup.validateBackupFileContent(invalidOrders).valid, false);

    const invalidSchema = JSON.stringify({
      app: 'BahtBridge',
      orders: [],
      schemaVersion: 0,
    });
    const check = Backup.validateBackupFileContent(invalidSchema);
    assert.ok(typeof check.valid === 'boolean');
  });

  test('Backup: performBackup execution with mock storage', async () => {
    const origStorage = global.window ? global.window.StorageService : null;
    if (!global.window) global.window = {};

    global.window.StorageService = {
      exportAll: async () => ({
        app: 'BahtBridge',
        ordersCount: 2,
        orders: [{ id: '1' }, { id: '2' }],
      }),
      saveSettings: async () => {},
    };

    let downloadTriggered = false;
    const docMock = {
      createElement: () => ({
        set href(v) {},
        set download(v) {},
        click: () => { downloadTriggered = true; },
      }),
      body: { appendChild: () => {}, removeChild: () => {} },
      getElementById: () => null,
    };
    global.window.document = docMock;
    global.document = docMock;

    global.window.URL = {
      createObjectURL: () => 'blob:mock',
      revokeObjectURL: () => {},
    };

    if (typeof globalThis.Blob !== 'undefined') {
      global.window.Blob = globalThis.Blob;
      global.Blob = globalThis.Blob;
    }

    await Backup.performBackup();
    assert.equal(downloadTriggered, true);

    // Reset
    global.window.StorageService = origStorage;
  });

  test('Backup: handleImportFile execution with mock storage', async () => {
    if (!global.window) global.window = {};
    let importedMode = '';
    global.window.StorageService = {
      importAll: async (data, opts) => {
        importedMode = opts.mode;
        return { success: true, imported: 1, skipped: 0 };
      },
    };
    global.window.confirm = () => true;

    const mockFile = { name: 'backup.json' };
    global.FileReader = function () {
      this.readAsText = function () {
        this.onload({
          target: {
            result: JSON.stringify({
              app: 'BahtBridge',
              schemaVersion: 2,
              orders: [{ id: '#BR001' }],
            }),
          },
        });
      };
    };

    await Backup.handleImportFile(mockFile);
    assert.equal(importedMode, 'merge');
  });
});
