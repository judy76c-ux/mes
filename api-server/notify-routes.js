/**
 * 알림 라우트
 * POST /api/notify              — 텔레그램 메시지 발송 (레거시)
 * POST /api/notify/slack        — Slack 채널 Incoming Webhook 발송
 * GET  /api/notify/config       — 설정 확인
 * POST /api/notify/test         — 텔레그램 연결 테스트
 * POST /api/notify/slack/test   — Slack 웹훅 테스트 발송
 */
const https = require('https');
const { URL } = require('url');

const TELEGRAM_CONFIG_KEY = 'telegram_notify_config';
const SLACK_CONFIG_KEY = 'slack_notify_config';

async function _getConfigRow(pool, key) {
  try {
    const [rows] = await pool.query(
      'SELECT `value` FROM mes_config WHERE `key` = ?',
      [key]
    );
    if (!rows.length) return null;
    const v = rows[0].value;
    return typeof v === 'string' ? JSON.parse(v) : v;
  } catch { return null; }
}

function _httpsJsonPost(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const req = https.request({
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(bodyStr, 'utf8')
      }
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        let parsed = data;
        try { parsed = data ? JSON.parse(data) : data; } catch { /* Slack webhook returns plain "ok" */ }
        resolve({ status: res.statusCode, body: parsed, raw: data });
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function _telegramPost(token, method, body) {
  return _httpsJsonPost('api.telegram.org', `/bot${token}/${method}`, body);
}

function _parseSlackWebhook(url) {
  try {
    const u = new URL(String(url || '').trim());
    if (u.protocol !== 'https:') return null;
    if (u.hostname !== 'hooks.slack.com') return null;
    if (!u.pathname.startsWith('/services/')) return null;
    return u;
  } catch {
    return null;
  }
}

function _slackPost(webhookUrl, payload) {
  const u = _parseSlackWebhook(webhookUrl);
  if (!u) return Promise.reject(new Error('Slack Webhook URL이 올바르지 않습니다.'));
  return _httpsJsonPost(u.hostname, u.pathname + u.search, payload);
}

function _buildTelegramMessage(templateKey, count, extraInfo) {
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

function _buildTelegramNoteText(payload) {
  const title = String((payload && payload.title) || 'MES 쪽지').trim() || 'MES 쪽지';
  const body = String((payload && payload.body) || '').trim();
  const sender = String((payload && payload.senderName) || '').trim();
  const extra = String((payload && payload.extraInfo) || '').trim();
  const lines = [
    '[MES 쪽지] ' + title,
    sender ? ('보낸이: ' + sender) : '',
    body,
    extra,
    new Date().toLocaleString('ko-KR')
  ].filter(Boolean);
  return lines.join('\n');
}

function _telegramHint(description) {
  const d = String(description || '').toLowerCase();
  if (d.indexOf('chat not found') >= 0) {
    return '텔레그램에서 봇을 검색해 대화를 열고 /start 를 보낸 뒤, 사용자 관리 Chat ID가 맞는지 확인하세요.';
  }
  if (d.indexOf('blocked') >= 0 || d.indexOf('forbidden') >= 0) {
    return '사용자가 봇을 차단했습니다. 텔레그램에서 차단을 해제한 뒤 /start 를 다시 보내세요.';
  }
  if (d.indexOf('peer_id_invalid') >= 0) {
    return 'Chat ID가 올바르지 않습니다. 봇에게 메시지를 보낸 뒤 다시 테스트하면 실제 Chat ID를 확인할 수 있습니다.';
  }
  return '';
}

function _uniqChatTargets(list) {
  const out = [];
  const seen = Object.create(null);
  (list || []).forEach((item) => {
    if (item == null) return;
    let chatId = '';
    let name = '';
    if (typeof item === 'object') {
      chatId = String(item.chatId || item.chat_id || item.id || '').trim();
      name = String(item.name || item.displayName || item.username || '').trim();
    } else {
      chatId = String(item).trim();
    }
    if (!chatId || seen[chatId]) return;
    seen[chatId] = true;
    out.push({ chatId, name });
  });
  return out;
}

function _chatsFromUpdates(body) {
  const out = [];
  const seen = Object.create(null);
  const list = (body && Array.isArray(body.result)) ? body.result : [];
  list.forEach((u) => {
    const msg = u && (u.message || u.edited_message || u.channel_post || u.my_chat_member);
    const chat = msg && msg.chat;
    if (!chat || chat.id == null) return;
    const chatId = String(chat.id);
    if (seen[chatId]) return;
    seen[chatId] = true;
    const from = msg.from || {};
    const name = [chat.first_name, chat.last_name].filter(Boolean).join(' ')
      || chat.title
      || from.first_name
      || '';
    out.push({
      chatId,
      username: chat.username || from.username || '',
      name: String(name || '').trim()
    });
  });
  return out;
}

function _buildSlackNoteText(payload) {
  const title = String(payload.title || 'MES 알림').trim() || 'MES 알림';
  const body = String(payload.body || '').trim();
  const sender = String(payload.senderName || '').trim();
  const rec = String(payload.recipientsLabel || '').trim();
  const extra = String(payload.extraInfo || '').trim();
  const lines = [
    `*[MES 쪽지] ${title}*`,
    sender ? `보낸이: ${sender}` : '',
    rec ? `수신: ${rec}` : '',
    body,
    extra,
    `_${new Date().toLocaleString('ko-KR')}_`
  ].filter(Boolean);
  return lines.join('\n');
}

module.exports = function(app, getPool) {

  /* ── POST /api/notify ─── 텔레그램 발송 ────────────────── */
  app.post('/api/notify', async (req, res) => {
    const body = req.body || {};
    const templateParams = body.templateParams || {};
    const templateKey = body.templateKey || templateParams.templateKey || body.templateCode || '';
    const count = body.count != null ? body.count : (templateParams.count != null ? templateParams.count : 0);
    const extraInfo = body.extraInfo || templateParams.extraInfo || '';
    const recipients = body.recipients;

    if (!Array.isArray(recipients) || !recipients.length) {
      return res.status(400).json({ error: 'recipients 필드가 필요합니다.' });
    }

    const cfg = await _getConfigRow(getPool(), TELEGRAM_CONFIG_KEY);
    if (!cfg || !cfg.botToken) {
      return res.json({
        success: false,
        skipped: true,
        error: '텔레그램 Bot 설정이 없습니다. 설정 > 시스템 탭에서 Bot Token을 입력하세요.'
      });
    }

    const title = String(body.title || templateParams.title || '').trim();
    const noteBody = String(body.body || templateParams.body || '').trim();
    const senderName = String(body.senderName || templateParams.senderName || '').trim();
    const useNote = !!(title || noteBody);
    const text = useNote
      ? _buildTelegramNoteText({
          title: title || 'MES 쪽지',
          body: noteBody,
          senderName,
          extraInfo
        })
      : _buildTelegramMessage(templateKey, count, extraInfo);
    const results = [];
    for (const r of recipients) {
      if (!r.chatId) continue;
      try {
        const payload = { chat_id: r.chatId, text };
        if (!useNote) payload.parse_mode = 'Markdown';
        const result = await _telegramPost(cfg.botToken, 'sendMessage', payload);
        const description = (result.body && result.body.description) || '';
        results.push({
          chatId: r.chatId,
          name: r.name,
          ok: !!(result.body && result.body.ok),
          status: result.status,
          description,
          hint: result.body && result.body.ok ? '' : _telegramHint(description)
        });
      } catch (err) {
        results.push({ chatId: r.chatId, name: r.name, ok: false, error: err.message, hint: _telegramHint(err.message) });
      }
    }

    const sent = results.filter(r => r.ok).length;
    const allOk = results.length > 0 && results.every(r => r.ok);
    res.json({ success: allOk, sent, results });
  });

  /* ── POST /api/notify/slack ─── Slack 채널 발송 ────────── */
  app.post('/api/notify/slack', async (req, res) => {
    const payload = req.body || {};
    const cfg = await _getConfigRow(getPool(), SLACK_CONFIG_KEY);
    const webhookUrl = cfg && cfg.webhookUrl;
    if (!webhookUrl) {
      return res.json({
        success: false,
        skipped: true,
        error: 'Slack Webhook이 없습니다. 설정 > 시스템 탭에서 Webhook URL을 저장하세요.'
      });
    }
    if (!String(payload.title || '').trim() && !String(payload.body || '').trim()) {
      return res.status(400).json({ error: 'title 또는 body가 필요합니다.' });
    }
    try {
      const result = await _slackPost(webhookUrl, { text: _buildSlackNoteText(payload) });
      const ok = result.status === 200 && String(result.raw || result.body) === 'ok';
      res.json({
        success: ok,
        status: result.status,
        detail: ok ? 'ok' : (result.raw || result.body)
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ── GET /api/notify/config ─── 설정 확인 ──────────────── */
  app.get('/api/notify/config', async (req, res) => {
    const tg = await _getConfigRow(getPool(), TELEGRAM_CONFIG_KEY);
    const slack = await _getConfigRow(getPool(), SLACK_CONFIG_KEY);
    res.json({
      configured: !!(tg && tg.botToken),
      botTokenSet: !!(tg && tg.botToken),
      slackWebhookSet: !!(slack && slack.webhookUrl)
    });
  });

  /* ── POST /api/notify/test ─── 텔레그램 연결 + 실제 발송 테스트 ─ */
  app.post('/api/notify/test', async (req, res) => {
    const cfg = await _getConfigRow(getPool(), TELEGRAM_CONFIG_KEY);
    if (!cfg || !cfg.botToken) {
      return res.status(503).json({ error: 'Bot Token을 먼저 저장하세요.' });
    }
    try {
      const me = await _telegramPost(cfg.botToken, 'getMe', {});
      if (!me.body || !me.body.ok) {
        return res.json({
          success: false,
          botOk: false,
          message: '연결 실패 — Bot Token을 확인하세요.',
          detail: me.body
        });
      }
      const bot = me.body.result || {};
      const botUsername = bot.username || '';
      const botName = bot.first_name || '';

      let discoveredChats = [];
      try {
        const updates = await _telegramPost(cfg.botToken, 'getUpdates', { limit: 100, timeout: 0 });
        if (updates.body && updates.body.ok) {
          discoveredChats = _chatsFromUpdates(updates.body);
        }
      } catch (_) { /* 수신 목록은 보조 정보 */ }

      const body = req.body || {};
      const requested = _uniqChatTargets([
        body.chatId ? { chatId: body.chatId, name: body.name } : null
      ].concat(Array.isArray(body.chatIds) ? body.chatIds : [])
        .concat(Array.isArray(body.recipients) ? body.recipients : []));
      const targets = requested.length
        ? requested
        : discoveredChats.map((c) => ({ chatId: c.chatId, name: c.name }));

      if (!targets.length) {
        return res.json({
          success: false,
          botOk: true,
          botUsername,
          botName,
          discoveredChats,
          results: [],
          message: '봇 연결은 됐지만 테스트할 Chat ID가 없습니다. 텔레그램에서 @'
            + botUsername
            + ' 을 열고 /start 를 보낸 뒤, 사용자 관리에 Chat ID를 넣고 다시 테스트하세요.'
        });
      }

      const text = [
        '[MES] 텔레그램 연결 테스트',
        '이 메시지가 보이면 수신이 정상입니다.',
        new Date().toLocaleString('ko-KR')
      ].join('\n');

      const results = [];
      for (const t of targets) {
        try {
          const result = await _telegramPost(cfg.botToken, 'sendMessage', {
            chat_id: t.chatId,
            text
          });
          const ok = !!(result.body && result.body.ok);
          const description = (result.body && result.body.description) || '';
          results.push({
            chatId: t.chatId,
            name: t.name,
            ok,
            status: result.status,
            description,
            hint: ok ? '' : _telegramHint(description)
          });
        } catch (err) {
          results.push({
            chatId: t.chatId,
            name: t.name,
            ok: false,
            error: err.message,
            hint: _telegramHint(err.message)
          });
        }
      }

      const sent = results.filter((r) => r.ok).length;
      const allOk = results.length > 0 && results.every((r) => r.ok);
      let message;
      if (allOk) {
        message = '테스트 메시지를 보냈습니다. 텔레그램에서 @' + botUsername
          + ' 대화를 확인하세요. (' + sent + '건)';
      } else if (sent > 0) {
        message = '일부만 발송됐습니다. (' + sent + '/' + results.length
          + ') 실패한 Chat ID는 봇과 대화가 없습니다.';
      } else {
        message = '봇은 연결됐지만 메시지는 전달되지 않았습니다. Chat ID가 틀렸거나, @'
          + botUsername + ' 에 /start 를 보내지 않은 상태입니다.';
      }

      res.json({
        success: allOk,
        botOk: true,
        botUsername,
        botName,
        sent,
        message,
        results,
        discoveredChats
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ── POST /api/notify/slack/test ─── Slack 테스트 발송 ─── */
  app.post('/api/notify/slack/test', async (req, res) => {
    const cfg = await _getConfigRow(getPool(), SLACK_CONFIG_KEY);
    if (!cfg || !cfg.webhookUrl) {
      return res.status(503).json({ error: 'Slack Webhook URL을 먼저 저장하세요.' });
    }
    try {
      const result = await _slackPost(cfg.webhookUrl, {
        text: '*[MES] Slack 연결 테스트*\n채널 알림이 정상입니다.\n_' + new Date().toLocaleString('ko-KR') + '_'
      });
      const ok = result.status === 200 && String(result.raw || result.body) === 'ok';
      if (ok) {
        res.json({ success: true, message: 'Slack 채널로 테스트 메시지를 보냈습니다. 채널·휴대폰 앱에서 확인하세요.' });
      } else {
        res.json({
          success: false,
          message: 'Slack 발송 실패 — Webhook URL과 채널 권한을 확인하세요.',
          detail: result.raw || result.body
        });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
};
