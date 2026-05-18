const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const fsSync = require('fs');
const fs = require('fs/promises');
const path = require('path');

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fsSync.existsSync(envPath)) return;
  const lines = fsSync.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

const app = express();
const PORT = process.env.PORT || 3000;
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, 'backups');
const NAS_BACKUP_DIR = process.env.NAS_BACKUP_DIR || '';   // NAS 마운트 경로 (비어있으면 NAS 백업 안 함)
const NAS_KEEP_COUNT = parseInt(process.env.NAS_KEEP_COUNT || '365');  // NAS에 보관할 최대 파일 수
const BACKUP_CONFIG_KEY = 'server_backup_config';
const DEFAULT_BACKUP_CONFIG = {
  enabled: true,
  frequency: 'daily',
  time: '02:00',
  weeklyDay: 1,
  monthlyDay: 1,
  retentionDays: 30,
  retentionCount: 60
};

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'mes_user',
  password: process.env.DB_PASSWORD || 'Mes_Password123!',
  database: process.env.DB_NAME || 'mes_db',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let pool;
let backupTimer = null;
let lastBackupRunKey = '';

async function initDB() {
  try {
    pool = mysql.createPool(DB_CONFIG);
    const conn = await pool.getConnection();
    console.log('✅ MariaDB 연결 성공');

    // 범용 JSON 문서 저장 테이블 자동 생성
    await conn.query(`
      CREATE TABLE IF NOT EXISTS mes_documents (
        id VARCHAR(100) NOT NULL,
        store_name VARCHAR(100) NOT NULL,
        data JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id, store_name),
        INDEX idx_store (store_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 설정 전용 테이블 자동 생성
    await conn.query(`
      CREATE TABLE IF NOT EXISTS mes_config (
        \`key\` VARCHAR(100) NOT NULL PRIMARY KEY,
        \`value\` JSON,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // NAS 설정 DB → 환경변수 반영
    try {
      const [cfgRows] = await conn.query("SELECT `value` FROM mes_config WHERE `key` = 'nas_backup_config'");
      if (cfgRows.length) {
        const cfg = typeof cfgRows[0].value === 'string' ? JSON.parse(cfgRows[0].value) : cfgRows[0].value;
        if (cfg?.nasDir) {
          process.env.NAS_BACKUP_DIR = cfg.nasDir;
          console.log('✅ NAS 백업 경로 (DB):', cfg.nasDir);
        }
      }
    } catch (_) {}

    conn.release();
    console.log('✅ 테이블 준비 완료');
  } catch (err) {
    console.error('❌ DB 초기화 실패:', err.message);
    process.exit(1);
  }
}

// 미들웨어
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }));
app.use(express.json({ limit: '50mb' }));

// ── 헬스체크 ──
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 문서 전체 조회 ──
app.get('/api/docs/:storeName', async (req, res) => {
  const { storeName } = req.params;
  try {
    const [rows] = await pool.query(
      'SELECT data FROM mes_documents WHERE store_name = ? ORDER BY created_at',
      [storeName]
    );
    const result = rows.map(r => {
      const d = r.data;
      return typeof d === 'string' ? JSON.parse(d) : d;
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 문서 저장 (upsert) ──
app.put('/api/docs/:storeName/:id', async (req, res) => {
  const { storeName, id } = req.params;
  const data = req.body;
  try {
    const json = JSON.stringify(data);
    await pool.query(
      `INSERT INTO mes_documents (id, store_name, data)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE data = VALUES(data), updated_at = NOW()`,
      [id, storeName, json]
    );
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 문서 삭제 ──
app.delete('/api/docs/:storeName/:id', async (req, res) => {
  const { storeName, id } = req.params;
  try {
    await pool.query(
      'DELETE FROM mes_documents WHERE store_name = ? AND id = ?',
      [storeName, id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 스토어 전체 덮어쓰기 (배치 저장) ──
app.post('/api/docs/:storeName/bulk', async (req, res) => {
  const { storeName } = req.params;
  const { rows } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: '배열 필요' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // 기존 스토어 데이터 삭제 후 일괄 삽입
    await conn.query('DELETE FROM mes_documents WHERE store_name = ?', [storeName]);
    for (const row of rows) {
      if (!row.id) continue;
      await conn.query(
        'INSERT INTO mes_documents (id, store_name, data) VALUES (?, ?, ?)',
        [row.id, storeName, JSON.stringify(row)]
      );
    }
    await conn.commit();
    res.json({ success: true, count: rows.length });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
});

// ── 설정 조회 ──
app.get('/api/config/:key', async (req, res) => {
  const { key } = req.params;
  try {
    const [rows] = await pool.query(
      'SELECT `value` FROM mes_config WHERE `key` = ?',
      [key]
    );
    if (rows.length === 0) return res.json(null);
    const v = rows[0].value;
    res.json(typeof v === 'string' ? JSON.parse(v) : v);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 설정 저장 ──
app.put('/api/config/:key', async (req, res) => {
  const { key } = req.params;
  const value = req.body;
  try {
    await pool.query(
      `INSERT INTO mes_config (\`key\`, \`value\`) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`), updated_at = NOW()`,
      [key, JSON.stringify(value)]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function getBackupConfig() {
  try {
    const [rows] = await pool.query('SELECT `value` FROM mes_config WHERE `key` = ?', [BACKUP_CONFIG_KEY]);
    if (rows.length === 0) return { ...DEFAULT_BACKUP_CONFIG };
    const value = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
    return { ...DEFAULT_BACKUP_CONFIG, ...(value || {}) };
  } catch (err) {
    console.warn('[backup] config load failed:', err.message);
    return { ...DEFAULT_BACKUP_CONFIG };
  }
}

async function saveBackupConfig(config) {
  const frequency = ['daily', 'weekly', 'monthly'].includes(config.frequency) ? config.frequency : DEFAULT_BACKUP_CONFIG.frequency;
  const clean = {
    enabled: config.enabled !== false,
    frequency,
    time: /^\d{2}:\d{2}$/.test(config.time || '') ? config.time : DEFAULT_BACKUP_CONFIG.time,
    weeklyDay: Math.min(6, Math.max(0, Number(config.weeklyDay ?? DEFAULT_BACKUP_CONFIG.weeklyDay))),
    monthlyDay: Math.min(31, Math.max(1, Number(config.monthlyDay ?? DEFAULT_BACKUP_CONFIG.monthlyDay))),
    retentionDays: Math.max(1, Number(config.retentionDays || DEFAULT_BACKUP_CONFIG.retentionDays)),
    retentionCount: Math.max(1, Number(config.retentionCount || DEFAULT_BACKUP_CONFIG.retentionCount))
  };
  await pool.query(
    `INSERT INTO mes_config (\`key\`, \`value\`) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`), updated_at = NOW()`,
    [BACKUP_CONFIG_KEY, JSON.stringify(clean)]
  );
  return clean;
}

async function ensureBackupDir() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

function backupFileName(date = new Date()) {
  return `MES_backup_${date.toISOString().replace(/[:.]/g, '-')}.json`;
}

async function copyToNas(fileName, content) {
  if (!NAS_BACKUP_DIR) return;
  try {
    await fs.mkdir(NAS_BACKUP_DIR, { recursive: true });
    await fs.writeFile(path.join(NAS_BACKUP_DIR, fileName), content, 'utf8');

    // NAS 오래된 파일 정리
    const files = (await fs.readdir(NAS_BACKUP_DIR)).filter(f => f.endsWith('.json'));
    if (files.length > NAS_KEEP_COUNT) {
      const sorted = [];
      for (const f of files) {
        const stat = await fs.stat(path.join(NAS_BACKUP_DIR, f)).catch(() => null);
        if (stat) sorted.push({ name: f, mtime: stat.mtimeMs });
      }
      sorted.sort((a, b) => b.mtime - a.mtime);
      for (const old of sorted.slice(NAS_KEEP_COUNT)) {
        await fs.unlink(path.join(NAS_BACKUP_DIR, old.name)).catch(() => {});
      }
    }
    console.log(`[backup] NAS 복사 완료: ${path.join(NAS_BACKUP_DIR, fileName)}`);
  } catch (err) {
    console.warn(`[backup] NAS 복사 실패 (로컬 백업은 정상 저장됨): ${err.message}`);
  }
}

async function createBackup(reason = 'manual') {
  await ensureBackupDir();
  const [docRows] = await pool.query('SELECT id, store_name, data, created_at, updated_at FROM mes_documents ORDER BY store_name, created_at');
  const [configRows] = await pool.query('SELECT `key`, `value`, updated_at FROM mes_config ORDER BY `key`');
  const stores = {};
  for (const row of docRows) {
    const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
    if (!stores[row.store_name]) stores[row.store_name] = [];
    stores[row.store_name].push(data);
  }
  const configs = {};
  for (const row of configRows) {
    configs[row.key] = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
  }
  const payload = {
    _meta: {
      system: 'MES',
      exportDate: new Date().toISOString(),
      reason,
      dbName: DB_CONFIG.database,
      documentCount: docRows.length,
      storeCount: Object.keys(stores).length
    },
    stores,
    configs
  };
  const content = JSON.stringify(payload, null, 2);
  const fileName = backupFileName();
  const fullPath = path.join(BACKUP_DIR, fileName);
  await fs.writeFile(fullPath, content, 'utf8');
  await cleanupBackups(await getBackupConfig());

  // NAS 백업 복사 (비동기 — 실패해도 로컬 백업은 정상)
  copyToNas(fileName, content);

  return { fileName, path: fullPath, size: Buffer.byteLength(content), meta: payload._meta };
}

async function listBackups() {
  await ensureBackupDir();
  const files = await fs.readdir(BACKUP_DIR);
  const rows = [];
  for (const name of files.filter(f => f.endsWith('.json'))) {
    const fullPath = path.join(BACKUP_DIR, name);
    const stat = await fs.stat(fullPath);
    rows.push({ fileName: name, size: stat.size, createdAt: stat.birthtime, modifiedAt: stat.mtime });
  }
  return rows.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
}

async function cleanupBackups(config) {
  const backups = await listBackups();
  const now = Date.now();
  const maxAge = Number(config.retentionDays || DEFAULT_BACKUP_CONFIG.retentionDays) * 24 * 60 * 60 * 1000;
  const keepCount = Number(config.retentionCount || DEFAULT_BACKUP_CONFIG.retentionCount);
  const toDelete = backups.filter((b, idx) => idx >= keepCount || now - new Date(b.modifiedAt).getTime() > maxAge);
  for (const b of toDelete) {
    await fs.unlink(path.join(BACKUP_DIR, b.fileName)).catch(() => {});
  }
  return { deleted: toDelete.length };
}

function backupScheduleKey(config, now) {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const day = now.getDay();
  const date = now.getDate();

  if (config.frequency === 'weekly') {
    if (day !== Number(config.weeklyDay)) return null;
    return `weekly-${yyyy}-${mm}-${dd}`;
  }

  if (config.frequency === 'monthly') {
    const lastDayOfMonth = new Date(yyyy, now.getMonth() + 1, 0).getDate();
    const scheduledDay = Math.min(Number(config.monthlyDay), lastDayOfMonth);
    if (date !== scheduledDay) return null;
    return `monthly-${yyyy}-${mm}-${dd}`;
  }

  return `daily-${yyyy}-${mm}-${dd}`;
}

function startBackupScheduler() {
  if (backupTimer) clearInterval(backupTimer);
  backupTimer = setInterval(async () => {
    const config = await getBackupConfig();
    if (!config.enabled) return;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const runKey = backupScheduleKey(config, now);
    if (runKey && hhmm === config.time && lastBackupRunKey !== runKey) {
      lastBackupRunKey = runKey;
      createBackup('scheduled').catch(err => console.error('[backup] scheduled backup failed:', err.message));
    }
  }, 60 * 1000);
}

app.get('/api/backups/config', async (req, res) => {
  res.json(await getBackupConfig());
});

app.put('/api/backups/config', async (req, res) => {
  try {
    res.json(await saveBackupConfig(req.body || {}));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/backups', async (req, res) => {
  try {
    res.json({ backupDir: BACKUP_DIR, backups: await listBackups(), config: await getBackupConfig() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backups', async (req, res) => {
  try {
    res.json(await createBackup('manual'));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backups/cleanup', async (req, res) => {
  try {
    res.json(await cleanupBackups(await getBackupConfig()));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/backups/:fileName', async (req, res) => {
  const fileName = path.basename(req.params.fileName);
  res.download(path.join(BACKUP_DIR, fileName));
});

app.delete('/api/backups/:fileName', async (req, res) => {
  try {
    const fileName = path.basename(req.params.fileName);
    await fs.unlink(path.join(BACKUP_DIR, fileName));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── NAS 설정 조회 ──
app.get('/api/nas-config', async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT `value` FROM mes_config WHERE `key` = 'nas_backup_config'");
    const saved = rows.length ? (typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value) : null;
    res.json({
      nasDir: saved?.nasDir ?? NAS_BACKUP_DIR,
      keepCount: saved?.keepCount ?? NAS_KEEP_COUNT,
      fromEnv: !saved
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── NAS 설정 저장 ──
app.put('/api/nas-config', async (req, res) => {
  const { nasDir = '', keepCount = 365 } = req.body || {};
  try {
    const value = { nasDir: String(nasDir).trim(), keepCount: Math.max(1, Number(keepCount)) };
    await pool.query(
      `INSERT INTO mes_config (\`key\`, \`value\`) VALUES ('nas_backup_config', ?)
       ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`), updated_at = NOW()`,
      [JSON.stringify(value)]
    );
    // 런타임 즉시 반영
    if (value.nasDir) {
      process.env.NAS_BACKUP_DIR = value.nasDir;
    }
    res.json({ success: true, ...value });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── NAS 백업 목록 ──
app.get('/api/nas-backups', async (req, res) => {
  if (!NAS_BACKUP_DIR) return res.json({ available: false, backups: [] });
  try {
    await fs.mkdir(NAS_BACKUP_DIR, { recursive: true });
    const files = (await fs.readdir(NAS_BACKUP_DIR)).filter(f => f.endsWith('.json'));
    const rows = [];
    for (const name of files) {
      const fullPath = path.join(NAS_BACKUP_DIR, name);
      const stat = await fs.stat(fullPath).catch(() => null);
      if (stat) rows.push({ fileName: name, size: stat.size, createdAt: stat.birthtime, modifiedAt: stat.mtime });
    }
    rows.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
    res.json({ available: true, nasDir: NAS_BACKUP_DIR, backups: rows });
  } catch (err) {
    res.json({ available: false, error: err.message, backups: [] });
  }
});

// ── NAS 백업 파일 다운로드 ──
app.get('/api/nas-backups/:fileName', async (req, res) => {
  if (!NAS_BACKUP_DIR) return res.status(404).json({ error: 'NAS_BACKUP_DIR 미설정' });
  const fileName = path.basename(req.params.fileName);
  res.download(path.join(NAS_BACKUP_DIR, fileName));
});

// ── NAS → 로컬 수동 복사 ──
app.post('/api/nas-backups/:fileName/copy-to-local', async (req, res) => {
  if (!NAS_BACKUP_DIR) return res.status(400).json({ error: 'NAS_BACKUP_DIR 미설정' });
  const fileName = path.basename(req.params.fileName);
  try {
    await ensureBackupDir();
    const src = path.join(NAS_BACKUP_DIR, fileName);
    const dst = path.join(BACKUP_DIR, fileName);
    await fs.copyFile(src, dst);
    res.json({ success: true, fileName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── NAS 백업 복원 ──
app.post('/api/nas-backups/:fileName/restore', async (req, res) => {
  if (!NAS_BACKUP_DIR) return res.status(400).json({ error: 'NAS_BACKUP_DIR 미설정' });
  const fileName = path.basename(req.params.fileName);
  const fullPath = path.join(NAS_BACKUP_DIR, fileName);
  try {
    const content = await fs.readFile(fullPath, 'utf8');
    const payload = JSON.parse(content);
    const { stores = {}, configs = {} } = payload;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const [storeName, records] of Object.entries(stores)) {
        await conn.query('DELETE FROM mes_documents WHERE store_name = ?', [storeName]);
        for (const row of records) {
          if (!row.id) continue;
          await conn.query(
            'INSERT INTO mes_documents (id, store_name, data) VALUES (?, ?, ?)',
            [row.id, storeName, JSON.stringify(row)]
          );
        }
      }
      for (const [key, value] of Object.entries(configs)) {
        if (key === BACKUP_CONFIG_KEY) continue;
        await conn.query(
          `INSERT INTO mes_config (\`key\`, \`value\`) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`), updated_at = NOW()`,
          [key, JSON.stringify(value)]
        );
      }
      await conn.commit();
      const totalRecords = Object.values(stores).reduce((s, r) => s + r.length, 0);
      res.json({ success: true, fileName, restoredStores: Object.keys(stores).length, restoredRecords: totalRecords, meta: payload._meta || {} });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── 서버 백업 복원 ──
app.post('/api/backups/:fileName/restore', async (req, res) => {
  const fileName = path.basename(req.params.fileName);
  const fullPath = path.join(BACKUP_DIR, fileName);

  try {
    const content = await fs.readFile(fullPath, 'utf8');
    const payload = JSON.parse(content);
    const { stores = {}, configs = {} } = payload;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // stores 복원: 스토어별 전체 삭제 후 일괄 삽입
      for (const [storeName, records] of Object.entries(stores)) {
        await conn.query('DELETE FROM mes_documents WHERE store_name = ?', [storeName]);
        for (const row of records) {
          if (!row.id) continue;
          await conn.query(
            'INSERT INTO mes_documents (id, store_name, data) VALUES (?, ?, ?)',
            [row.id, storeName, JSON.stringify(row)]
          );
        }
      }

      // configs 복원 (백업 설정 제외)
      for (const [key, value] of Object.entries(configs)) {
        if (key === BACKUP_CONFIG_KEY) continue;
        await conn.query(
          `INSERT INTO mes_config (\`key\`, \`value\`) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`), updated_at = NOW()`,
          [key, JSON.stringify(value)]
        );
      }

      await conn.commit();

      const totalRecords = Object.values(stores).reduce((s, r) => s + r.length, 0);
      res.json({
        success: true,
        fileName,
        restoredStores: Object.keys(stores).length,
        restoredRecords: totalRecords,
        meta: payload._meta || {}
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 서버 시작
initDB().then(() => {
  startBackupScheduler();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 MES API 서버 실행 중: http://0.0.0.0:${PORT}`);
  });
});
