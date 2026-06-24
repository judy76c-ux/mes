/**
 * 텔레그램 Bot 알림 라우트 (무료, 건수 무제한)
 * POST /api/notify         — 텔레그램 메시지 발송
 * GET  /api/notify/config  — 설정 확인
 * POST /api/notify/test    — 연결 테스트
 */
const https = require('https');

const CONFIG_KEY = 'telegram_notify_config';

async function _getCfg(pool) {
  try {
    const [rows] = await pool.query(
      'SELECT `value` FROM mes_config WHERE `key` = ?',
      [CONFIG_KEY]
    );
    if (!rows.length) return null;
    const v = rows[0].value;
    return typeof v === 'string' ? JSON.parse(v) : v;
  } catch { return null; }
}

function _telegramPost(token, method, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${token}/${method}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function _buildMessage(templateKey, count, extraInfo) {
  const labels = {
    paint_pending:     '🟡 도료 입고 대기',
    inj_pending:       '🟣 사출 입고 대기',
    work_missing:      '🟠 실적 미입력',
    paint_mix_missing: '🔴 도료 사용 미등록'
  };
  const label = labels[templateKey] || templateKey;
  const lines = [
    `*[MES 알림] ${label}*`,
    `${count}건이 처리 대기 중입니다.`,
    extraInfo || '',
    `_${new Date().toLocaleString('ko-KR')}_`
  ].filter(Boolean);
  return lines.join('\n');
}

module.exports = function(app, getPool) {

  /* ── POST /api/notify ─── 텔레그램 발송 ────────────────── */
  app.post('/api/notify', async (req, res) => {
    const { templateKey, recipients, count, extraInfo } = req.body || {};

    if (!Array.isArray(recipients) || !recipients.length) {
      return res.status(400).json({ error: 'recipients 필드가 필요합니다.' });
    }

    const cfg = await _getCfg(getPool());
    if (!cfg || !cfg.botToken) {
      return res.status(503).json({
        error: '텔레그램 Bot 설정이 없습니다. 설정 > 시스템 탭에서 Bot Token을 입력하세요.'
      });
    }

    const text = _buildMessage(templateKey || '', count || 0, extraInfo || '');
    const results = [];
    for (const r of recipients) {
      if (!r.chatId) continue;
      try {
        const result = await _telegramPost(cfg.botToken, 'sendMessage', {
          chat_id: r.chatId,
          text,
          parse_mode: 'Markdown'
        });
        results.push({ chatId: r.chatId, name: r.name, ok: result.body?.ok, status: result.status });
      } catch (err) {
        results.push({ chatId: r.chatId, name: r.name, ok: false, error: err.message });
      }
    }

    const allOk = results.every(r => r.ok);
    res.json({ success: allOk, results });
  });

  /* ── GET /api/notify/config ─── 설정 확인 ──────────────── */
  app.get('/api/notify/config', async (req, res) => {
    const cfg = await _getCfg(getPool());
    res.json({
      configured: !!(cfg && cfg.botToken),
      botTokenSet: !!(cfg && cfg.botToken)
    });
  });

  /* ── POST /api/notify/test ─── 연결 테스트 ─────────────── */
  app.post('/api/notify/test', async (req, res) => {
    const cfg = await _getCfg(getPool());
    if (!cfg || !cfg.botToken) {
      return res.status(503).json({ error: 'Bot Token을 먼저 저장하세요.' });
    }
    try {
      const result = await _telegramPost(cfg.botToken, 'getMe', {});
      if (result.body?.ok) {
        const bot = result.body.result;
        res.json({ success: true, message: `연결 성공 — Bot: @${bot.username} (${bot.first_name})` });
      } else {
        res.json({ success: false, message: '연결 실패 — Bot Token을 확인하세요.', detail: result.body });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
};
