const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

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

// 서버 시작
initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 MES API 서버 실행 중: http://0.0.0.0:${PORT}`);
  });
});
