const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const fsSync = require('fs');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

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
const DEFAULT_NAS_BACKUP_DIR = '/mnt/nas-backup';
let NAS_BACKUP_DIR = process.env.NAS_BACKUP_DIR || DEFAULT_NAS_BACKUP_DIR;
let NAS_KEEP_COUNT = parseInt(process.env.NAS_KEEP_COUNT || '365');  // NAS??蹂닿???理쒕? ?뚯씪 ??
let NAS_UPLOAD_DIR = process.env.NAS_UPLOAD_DIR || '';   // NAS ?ъ쭊 ???寃쎈줈 (鍮꾩뼱?덉쑝硫??쒕쾭 濡쒖뺄 ???
const BACKUP_CONFIG_KEY = 'server_backup_config';
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const DEFAULT_BACKUP_CONFIG = {
  enabled: true,
  frequency: 'daily',
  time: '02:00',
  weeklyDay: 1,
  monthlyDay: 1,
  retentionDays: 30,
  retentionCount: 60
};

function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
  ]);
}

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
    console.log('??MariaDB ?곌껐 ?깃났');

    // 踰붿슜 JSON 臾몄꽌 ????뚯씠釉??먮룞 ?앹꽦
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

    // ?ㅼ젙 ?꾩슜 ?뚯씠釉??먮룞 ?앹꽦
    await conn.query(`
      CREATE TABLE IF NOT EXISTS mes_config (
        \`key\` VARCHAR(100) NOT NULL PRIMARY KEY,
        \`value\` JSON,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // NAS ?ㅼ젙 DB ???섍꼍蹂??諛섏쁺
    try {
      const [cfgRows] = await conn.query("SELECT `value` FROM mes_config WHERE `key` = 'nas_backup_config'");
      if (cfgRows.length) {
        const cfg = typeof cfgRows[0].value === 'string' ? JSON.parse(cfgRows[0].value) : cfgRows[0].value;
        if (cfg?.nasDir) {
          NAS_BACKUP_DIR = cfg.nasDir;
          process.env.NAS_BACKUP_DIR = cfg.nasDir;
          if (cfg.keepCount) NAS_KEEP_COUNT = Math.max(1, Number(cfg.keepCount));
          console.log('??NAS 諛깆뾽 寃쎈줈 (DB):', cfg.nasDir);
        }
        if (cfg?.nasUploadDir) {
          NAS_UPLOAD_DIR = cfg.nasUploadDir;
          process.env.NAS_UPLOAD_DIR = cfg.nasUploadDir;
          console.log('??NAS ?ъ쭊 ???寃쎈줈 (DB):', cfg.nasUploadDir);
        }
      }
    } catch (_) {}

    conn.release();
    console.log('???뚯씠釉?以鍮??꾨즺');
  } catch (err) {
    console.error('??DB 珥덇린???ㅽ뙣:', err.message);
    process.exit(1);
  }
}

// 誘몃뱾?⑥뼱
app.use(cors({
  origin: (origin, cb) => cb(null, true),  // null(file://) ?ы븿 ?꾩껜 ?덉슜
  methods: ['GET', 'POST', 'PUT', 'DELETE']
}));
app.use(express.json({ limit: '50mb' }));

// ?ъ쭊 ???寃쎈줈 寃곗젙:
//   1) NAS_UPLOAD_DIR 紐낆떆 ?ㅼ젙 ???대떦 寃쎈줈
//   2) NAS_BACKUP_DIR ?ㅼ젙????NAS_BACKUP_DIR/photos
//   3) 誘몄꽕?????쒕쾭 濡쒖뺄 UPLOAD_DIR
function getPhotoDir() {
  if (NAS_UPLOAD_DIR) return NAS_UPLOAD_DIR;
  if (NAS_BACKUP_DIR) return path.join(NAS_BACKUP_DIR, 'photos');
  return UPLOAD_DIR;
}

// ?? ?낅줈???뚯씪 ?뺤쟻 ?쒕튃 ??
app.use('/uploads', (req, res, next) => {
  express.static(getPhotoDir())(req, res, next);
});

// ?? ?ъ뒪泥댄겕 ??
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

function readDiskUsage(targetPath) {
  return new Promise(resolve => {
    if (!targetPath) {
      resolve(null);
      return;
    }
    execFile('df', ['-h', targetPath], (err, stdout) => {
      if (err) {
        resolve(null);
        return;
      }
      const lines = stdout.trim().split(/\r?\n/);
      const parts = (lines[1] || '').trim().split(/\s+/);
      resolve({
        path: targetPath,
        filesystem: parts[0] || '-',
        total: parts[1] || '-',
        used: parts[2] || '-',
        avail: parts[3] || '-',
        usePct: parts[4] || '-',
        mountedOn: parts[5] || targetPath
      });
    });
  });
}

async function readNasStatus() {
  const configured = !!NAS_BACKUP_DIR;
  const mounted = configured ? await isNasBackupMounted() : false;
  const disk = configured ? await readDiskUsage(NAS_BACKUP_DIR) : null;
  let writable = false;
  let error = '';
  if (configured && mounted) {
    try {
      await fs.access(NAS_BACKUP_DIR, fsSync.constants.W_OK);
      writable = true;
    } catch (err) {
      error = err.message;
    }
  }
  return {
    configured,
    mounted,
    writable,
    path: NAS_BACKUP_DIR || '',
    keepCount: NAS_KEEP_COUNT,
    disk,
    error
  };
}

// ?? ?쒖뒪???곹깭 ?뺣낫 ??
app.get('/api/system', async (req, res) => {
  try {
    // ?? CPU ???????????????????????????????????????????????????????
    const cpus     = os.cpus();
    const loadAvg  = os.loadavg();          // [1m, 5m, 15m]
    const cpuModel = cpus[0]?.model?.trim() || 'Unknown';
    const cpuCount = cpus.length;
    // ?꾩껜 肄붿뼱 ?ъ슜瑜?怨꾩궛 (user+sys / total tick 鍮꾩쑉)
    const cpuUsage = (() => {
      let idle = 0, total = 0;
      for (const c of cpus) {
        for (const t in c.times) total += c.times[t];
        idle += c.times.idle;
      }
      return total ? +(((total - idle) / total) * 100).toFixed(1) : 0;
    })();

    // ?? 硫붾え由?????????????????????????????????????????????????????
    const totalMem = os.totalmem();
    const freeMem  = os.freemem();
    const usedMem  = totalMem - freeMem;

    // ?? ?낇???????????????????????????????????????????????????????
    const sysUptime  = os.uptime();   // 珥??⑥쐞
    const nodeUptime = process.uptime();

    // ?? ?붿뒪??(df -h /) ?????????????????????????????????????????
    const diskInfo = await readDiskUsage('/');

    // ?? MariaDB ?곹깭 ??????????????????????????????????????????????
    let dbStatus = { ok: false, latency: null, version: null };
    try {
      if (pool) {
        const t0 = Date.now();
        const conn = await pool.getConnection();
        const [[row]] = await conn.query('SELECT VERSION() AS v');
        conn.release();
        dbStatus = { ok: true, latency: Date.now() - t0, version: row?.v || '' };
      }
    } catch(_) {}

    // ?? Node.js ?꾨줈?몄뒪 硫붾え由?????????????????????????????????????
    const procMem = process.memoryUsage();

    // ?? OS ????????????????????????????????????????????????????????
    const osInfo = {
      platform: os.platform(),
      release:  os.release(),
      hostname: os.hostname(),
      arch:     os.arch()
    };

    res.json({
      timestamp: new Date().toISOString(),
      cpu:  { model: cpuModel, count: cpuCount, usagePct: cpuUsage, loadAvg },
      mem:  { total: totalMem, used: usedMem, free: freeMem },
      disk: diskInfo,
      nas: await readNasStatus(),
      uptime: { system: sysUptime, node: nodeUptime },
      db:   dbStatus,
      process: { rss: procMem.rss, heapUsed: procMem.heapUsed, heapTotal: procMem.heapTotal },
      os:   osInfo
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ?? 臾몄꽌 ?꾩껜 議고쉶 ??
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

// ?? 臾몄꽌 ???(upsert) ??
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

// ?? 臾몄꽌 ??젣 ??
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

// ?? ?ㅽ넗???꾩껜 ??뼱?곌린 (諛곗튂 ??? ??
app.post('/api/docs/:storeName/bulk', async (req, res) => {
  const { storeName } = req.params;
  const { rows } = req.body;
  if (!Array.isArray(rows)) return res.status(400).json({ error: '諛곗뿴 ?꾩슂' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // 湲곗〈 ?ㅽ넗???곗씠????젣 ???쇨큵 ?쎌엯
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

// ?? ?ㅼ젙 議고쉶 ??
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

// ?? ?ㅼ젙 ?????
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
    const [rows] = await withTimeout(
      pool.query(
        { sql: 'SELECT `value` FROM mes_config WHERE `key` = ?', timeout: 3000 },
        [BACKUP_CONFIG_KEY]
      ),
      3000,
      'backup config query timeout'
    );
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

async function isNasBackupMounted() {
  if (!NAS_BACKUP_DIR) return false;
  try {
    const mounts = await fs.readFile('/proc/mounts', 'utf8');
    return mounts.split('\n').some(line => {
      const cols = line.split(' ');
      return cols[1] === NAS_BACKUP_DIR && (cols[2] === 'cifs' || cols[2].startsWith('nfs'));
    });
  } catch (_) {
    return false;
  }
}

// ?ъ쭊 寃쎈줈媛 CIFS/NFS 留덉슫???꾨옒???덈뒗吏 ?뺤씤 (?쒕툕?붾젆?곕━ ?ы븿)
async function isNasPhotoMounted() {
  const dir = getPhotoDir();
  if (!dir || dir === UPLOAD_DIR) return false;
  try {
    const mounts = await fs.readFile('/proc/mounts', 'utf8');
    return mounts.split('\n').some(line => {
      const cols = line.split(' ');
      const mountPoint = cols[1];
      if (!mountPoint || mountPoint === '/') return false;
      return dir.startsWith(mountPoint + '/') || dir === mountPoint;
    });
  } catch (_) {
    return false;
  }
}

async function readNasPhotoStatus() {
  const photoDir = getPhotoDir();
  const isLocal = photoDir === UPLOAD_DIR;
  const configured = !isLocal;
  const mounted = configured ? await isNasPhotoMounted() : false;
  const disk = mounted ? await readDiskUsage(photoDir) : null;
  return { configured, mounted, isLocal, path: photoDir, disk };
}

function backupFileName(date = new Date()) {
  return `MES_backup_${date.toISOString().replace(/[:.]/g, '-')}.json`;
}

async function copyToNas(fileName, content) {
  if (!NAS_BACKUP_DIR) {
    return { attempted: false, saved: false, reason: 'nas path not configured', path: '' };
  }
  if (!(await isNasBackupMounted())) {
    console.warn(`[backup] NAS copy skipped: ${NAS_BACKUP_DIR} is not mounted`);
    return { attempted: true, saved: false, reason: 'nas path is not mounted', path: NAS_BACKUP_DIR };
  }
  try {
    await fs.mkdir(NAS_BACKUP_DIR, { recursive: true });
    const nasPath = path.join(NAS_BACKUP_DIR, fileName);
    await fs.writeFile(nasPath, content, 'utf8');

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
    console.log(`[backup] NAS copy complete: ${nasPath}`);
    return { attempted: true, saved: true, reason: '', path: nasPath };
  } catch (err) {
    console.warn(`[backup] NAS copy failed (local backup still saved): ${err.message}`);
    return { attempted: true, saved: false, reason: err.message, path: path.join(NAS_BACKUP_DIR, fileName) };
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

  // NAS 諛깆뾽 蹂듭궗 (鍮꾨룞湲????ㅽ뙣?대룄 濡쒖뺄 諛깆뾽? ?뺤긽)
  const nasResult = await copyToNas(fileName, content);

  return {
    fileName,
    path: fullPath,
    backupDir: BACKUP_DIR,
    nasDir: NAS_BACKUP_DIR,
    size: Buffer.byteLength(content),
    meta: payload._meta,
    local: { saved: true, path: fullPath },
    nas: nasResult
  };
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
    const backups = await withTimeout(listBackups(), 3000, 'backup list timeout').catch(err => {
      console.warn('[backup] list failed:', err.message);
      return [];
    });
    const config = await getBackupConfig();
    res.json({ backupDir: BACKUP_DIR, backups, config });
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

// ?? NAS ?ㅼ젙 議고쉶 ??
app.get('/api/nas-config', async (req, res) => {
  try {
    const [rows] = await withTimeout(
      pool.query(
        { sql: "SELECT `value` FROM mes_config WHERE `key` = 'nas_backup_config'", timeout: 3000 }
      ),
      3000,
      'nas config query timeout'
    );
    const saved = rows.length ? (typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value) : null;
    const [backupMounted, photoStatus] = await Promise.all([
      isNasBackupMounted(),
      readNasPhotoStatus()
    ]);
    res.json({
      nasDir: saved?.nasDir ?? NAS_BACKUP_DIR,
      keepCount: saved?.keepCount ?? NAS_KEEP_COUNT,
      nasUploadDir: saved?.nasUploadDir ?? NAS_UPLOAD_DIR,
      effectivePhotoDir: getPhotoDir(),
      backupMounted,
      photo: photoStatus,
      fromEnv: !saved
    });
  } catch (err) {
    res.json({
      nasDir: NAS_BACKUP_DIR,
      keepCount: NAS_KEEP_COUNT,
      fromEnv: true,
      warning: err.message
    });
  }
});

// ?? NAS ?ㅼ젙 ?????
app.put('/api/nas-config', async (req, res) => {
  const { nasDir = DEFAULT_NAS_BACKUP_DIR, keepCount = 365, nasUploadDir = '' } = req.body || {};
  try {
    const value = {
      nasDir: String(nasDir || DEFAULT_NAS_BACKUP_DIR).trim() || DEFAULT_NAS_BACKUP_DIR,
      keepCount: Math.max(1, Number(keepCount)),
      nasUploadDir: String(nasUploadDir).trim()
    };
    await pool.query(
      `INSERT INTO mes_config (\`key\`, \`value\`) VALUES ('nas_backup_config', ?)
       ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`), updated_at = NOW()`,
      [JSON.stringify(value)]
    );
    // ?고???利됱떆 諛섏쁺
    NAS_BACKUP_DIR = value.nasDir;
    NAS_KEEP_COUNT = value.keepCount;
    NAS_UPLOAD_DIR = value.nasUploadDir;
    process.env.NAS_BACKUP_DIR = value.nasDir;
    process.env.NAS_UPLOAD_DIR = value.nasUploadDir;
    res.json({ success: true, ...value });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ?? NAS 諛깆뾽 紐⑸줉 ??
app.get('/api/nas-backups', async (req, res) => {
  if (!NAS_BACKUP_DIR) return res.json({ available: false, backups: [] });
  if (!(await isNasBackupMounted())) {
    return res.json({ available: false, nasDir: NAS_BACKUP_DIR, error: 'NAS path is not mounted', backups: [] });
  }
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

// ?? NAS 諛깆뾽 ?뚯씪 ?ㅼ슫濡쒕뱶 ??
app.get('/api/nas-backups/:fileName', async (req, res) => {
  if (!NAS_BACKUP_DIR) return res.status(404).json({ error: 'NAS_BACKUP_DIR not configured' });
  const fileName = path.basename(req.params.fileName);
  res.download(path.join(NAS_BACKUP_DIR, fileName));
});

// ?? NAS ??濡쒖뺄 ?섎룞 蹂듭궗 ??
app.post('/api/nas-backups/:fileName/copy-to-local', async (req, res) => {
  if (!NAS_BACKUP_DIR) return res.status(400).json({ error: 'NAS_BACKUP_DIR not configured' });
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

// ?? NAS 諛깆뾽 蹂듭썝 ??
app.post('/api/nas-backups/:fileName/restore', async (req, res) => {
  if (!NAS_BACKUP_DIR) return res.status(400).json({ error: 'NAS_BACKUP_DIR not configured' });
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

// ?? ?쒕쾭 諛깆뾽 蹂듭썝 ??
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

      // stores 蹂듭썝: ?ㅽ넗?대퀎 ?꾩껜 ??젣 ???쇨큵 ?쎌엯
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

      // configs 蹂듭썝 (諛깆뾽 ?ㅼ젙 ?쒖쇅)
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

// ?? ?ъ쭊 ?낅줈??(base64 JSON) ??
app.post('/api/photos', async (req, res) => {
  const { subdir = 'misc', filename, data, contentType } = req.body || {};
  if (!filename || !data) return res.status(400).json({ error: 'filename怨?data ?꾨뱶 ?꾩슂' });
  const allowed = /^[a-zA-Z0-9_\-\.]+$/;
  if (!allowed.test(filename)) return res.status(400).json({ error: '?뚯씪紐낆뿉 ?덉슜?섏? ?딅뒗 臾몄옄' });
  const safeSub = String(subdir).split('/').map(s => s.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 40)).filter(Boolean).join('/') || 'misc';
  const dir = path.join(getPhotoDir(), safeSub);
  const baseDir = getPhotoDir();
  if (!dir.startsWith(baseDir)) return res.status(400).json({ error: '유효하지 않은 경로' });
  try {
    await fs.mkdir(dir, { recursive: true });
    const buf = Buffer.from(data, 'base64');
    const filePath = path.join(dir, filename);
    await fs.writeFile(filePath, buf);
    res.json({ url: `/uploads/${safeSub}/${filename}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ?? 怨듭젙蹂??ъ쭊 ?대뜑 ?쇨큵 ?앹꽦 ??
app.post('/api/photos/mkdirs', async (req, res) => {
  const { subdirs = [] } = req.body || {};
  const baseDir = getPhotoDir();
  const results = [];
  for (const subdir of subdirs) {
    const safeSub = String(subdir).split('/').map(s => s.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 40)).filter(Boolean).join('/');
    if (!safeSub) continue;
    const dir = path.join(baseDir, safeSub);
    try {
      await fs.mkdir(dir, { recursive: true });
      results.push({ subdir: safeSub, path: dir, ok: true });
    } catch (err) {
      results.push({ subdir: safeSub, error: err.message, ok: false });
    }
  }
  res.json({ baseDir, created: results.filter(r => r.ok).length, total: results.length, results });
});

// 폴더별 상태(존재/파일수/총크기/최근수정) 조회
app.post('/api/photos/stats', async (req, res) => {
  const { subdirs = [] } = req.body || {};
  const baseDir = getPhotoDir();
  const results = [];
  for (const subdir of subdirs) {
    const safeSub = String(subdir).split('/').map(s => s.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 40)).filter(Boolean).join('/');
    if (!safeSub) { results.push({ subdir, exists: false, error: 'invalid name' }); continue; }
    const dir = path.join(baseDir, safeSub);
    try {
      const stat = await fs.stat(dir);
      if (!stat.isDirectory()) {
        results.push({ subdir: safeSub, exists: false, error: 'not a directory' });
        continue;
      }
      const entries = await fs.readdir(dir, { withFileTypes: true });
      let fileCount = 0;
      let totalSize = 0;
      let latestMtime = 0;
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        try {
          const st = await fs.stat(path.join(dir, entry.name));
          fileCount += 1;
          totalSize += st.size;
          if (st.mtimeMs > latestMtime) latestMtime = st.mtimeMs;
        } catch {}
      }
      results.push({
        subdir: safeSub,
        path: dir,
        exists: true,
        fileCount,
        totalSize,
        latestMtime: latestMtime ? new Date(latestMtime).toISOString() : null
      });
    } catch (err) {
      results.push({ subdir: safeSub, exists: false, error: err.code || err.message });
    }
  }
  res.json({ baseDir, results });
});

// ?? ?ъ쭊 ??젣 ??
app.delete('/api/photos', async (req, res) => {
  const { url } = req.body || {};
  if (!url || !url.startsWith('/uploads/')) return res.status(400).json({ error: '?섎せ??寃쎈줈' });
  const rel = url.slice('/uploads/'.length);
  const filePath = path.join(getPhotoDir(), rel);
  try {
    await fs.unlink(filePath).catch(() => {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ?쒕쾭 ?쒖옉
initDB().then(() => {
  startBackupScheduler();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`?? MES API ?쒕쾭 ?ㅽ뻾 以? http://0.0.0.0:${PORT}`);
  });
});
