/**
 * 자격인증 관리 (공정 품질)
 * 레이져 공정 허브 레이아웃을 참고한 메인 + 서브 문서 페이지
 *
 * 서브 문서
 *  - 자격인증 및 다기능 평가 기준서   (cert-standard)
 *  - 자격인증 평가서                  (cert-eval)
 *  - 자격인증 평가 관리대장           (cert-ledger)
 *  - 작업자 다기능 평가서             (cert-multiskill-eval)
 *  - 작업자 다기능 분석표             (cert-multiskill-analysis)
 *  - 계량형 게이지 R&R 관리대장        (gauge-rr-variable)
 *  - 계수형 GAUGE R&R 평가서          (gauge-rr-attribute)
 *  - 자격인증 현황 / 검사자 / 작업자   (cert-status / inspectors-mgmt / operators-mgmt)
 */

/* ════════════════════════════════════════════════════════════════════
   공통 네비게이션 / 유틸
════════════════════════════════════════════════════════════════════ */
var CertProcessUI = (function () {
    const MENUS = [
        { id: 'certifications-mgmt', label: '메인', icon: 'dashboard' },
        { id: 'cert-standard', label: '평가 기준서', icon: 'menu_book' },
        { id: 'cert-eval', label: '자격인증 평가서', icon: 'assignment_turned_in' },
        { id: 'cert-ledger', label: '자격인증 관리대장', icon: 'view_list' },
        { id: 'cert-multiskill-eval', label: '다기능 평가서', icon: 'grading' },
        { id: 'cert-multiskill-analysis', label: '다기능 분석표', icon: 'donut_large' },
        { id: 'gauge-rr-variable', label: '계량형 R&R 관리대장', icon: 'straighten' },
        { id: 'gauge-rr-attribute', label: '계수형 R&R 평가서', icon: 'rule' },
        { id: 'cert-status', label: '자격인증 현황', icon: 'workspace_premium' },
        { id: 'inspectors-mgmt', label: '검사자 관리', icon: 'verified_user' },
        { id: 'operators-mgmt', label: '작업자 관리', icon: 'engineering' }
    ];

    function renderSection(activePage, actionsHtml) {
        var tabs = MENUS.map(function (menu) {
            var active = menu.id === activePage;
            return '<button type="button" onclick="Router.navigate(\'' + menu.id + '\')"' +
                ' style="display:flex;align-items:center;gap:12px;padding:12px 18px;border-radius:14px;' +
                'border:' + (active ? '2px solid var(--accent-blue)' : '1.5px solid var(--border-color)') + ';' +
                'background:var(--bg-primary);color:var(--text-primary);cursor:pointer;min-width:130px;text-align:left;box-shadow:0 1px 4px rgba(0,0,0,.06);">' +
                '<span style="display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:10px;flex-shrink:0;' +
                'background:' + (active ? 'var(--accent-blue)' : 'var(--bg-secondary)') + ';">' +
                '<span class="material-symbols-outlined" style="font-size:24px;color:' + (active ? '#fff' : 'var(--text-muted)') + ';">' + menu.icon + '</span>' +
                '</span>' +
                '<span style="display:flex;flex-direction:column;gap:2px;">' +
                '<span style="font-size:0.88rem;font-weight:700;white-space:nowrap;">' + menu.label + '</span>' +
                '</span></button>';
        }).join('');
        return '<div class="mes-apple-menu-hero" style="padding:16px 20px;margin-bottom:20px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;">' +
            tabs +
            (actionsHtml ? '<div style="margin-left:auto;">' + actionsHtml + '</div>' : '') +
            '</div>';
    }

    return { renderSection: renderSection };
})();

var CertCommon = (function () {
    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function js(value) {
        return String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ');
    }
    function fmt(value) {
        return (typeof UIUtils !== 'undefined' && UIUtils.formatNumber)
            ? UIUtils.formatNumber(value || 0)
            : Number(value || 0).toLocaleString('ko-KR');
    }
    function today() {
        return (typeof UIUtils !== 'undefined' && UIUtils.today)
            ? UIUtils.today() : new Date().toISOString().slice(0, 10);
    }
    async function load(key) {
        try {
            const rows = await Storage.getConfigValue(key);
            return Array.isArray(rows) ? rows : [];
        } catch (e) {
            console.warn('[Cert] config load failed:', key, e);
            return [];
        }
    }
    async function save(key, rows) {
        await Storage.setConfigValue(key, Array.isArray(rows) ? rows : []);
    }
    // 등급 배지 (A/B/C/D)
    function gradeBadge(grade) {
        const map = {
            'A': { bg: '#dcfce7', color: '#15803d', border: '#86efac' },
            'B': { bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd' },
            'C': { bg: '#fef3c7', color: '#b45309', border: '#fcd34d' },
            'D': { bg: '#fee2e2', color: '#b91c1c', border: '#fca5a5' },
            'S': { bg: '#ede9fe', color: '#6d28d9', border: '#c4b5fd' }
        };
        const s = map[grade] || { bg: 'var(--bg-secondary)', color: 'var(--text-muted)', border: 'var(--border-color)' };
        return grade
            ? `<span style="display:inline-block;min-width:24px;text-align:center;padding:2px 9px;border-radius:999px;font-size:0.78rem;font-weight:800;background:${s.bg};color:${s.color};border:1px solid ${s.border};">${esc(grade)}</span>`
            : '<span style="color:var(--text-muted);">-</span>';
    }
    function verdictBadge(pass) {
        return pass
            ? '<span class="badge badge-success" style="font-weight:700;">합격</span>'
            : '<span class="badge badge-danger" style="font-weight:700;">불합격</span>';
    }
    // 등급 → 파이(4분원 채움) 렌더 — 다기능 분석표용
    function gradePie(grade) {
        const map = { A: 100, B: 75, C: 50, D: 25 };
        const pct = map[grade] || 0;
        const color = grade === 'A' ? '#1d4ed8'
            : grade === 'B' ? '#2563eb'
            : grade === 'C' ? '#ef4444'
            : grade === 'D' ? '#f87171' : '#e2e8f0';
        return `<span title="${esc(grade || '-')}등급"
            style="display:inline-block;width:34px;height:34px;border-radius:50%;
                   border:1px solid #94a3b8;vertical-align:middle;
                   background:conic-gradient(${color} 0 ${pct}%, #fff ${pct}% 100%);"></span>`;
    }
    function isAdmin() {
        const user = (typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser)
            ? AuthModule.getCurrentUser() : null;
        return !!(user && user.role === 'admin');
    }
    // 직위/성명 등 인력 옵션 (작업자/검사자 마스터에서)
    function personOptions(selected) {
        const ops = (Storage.getAll(DB.STORES.OPERATORS) || []).map(function (o) { return o.name; });
        const ins = (Storage.getAll(DB.STORES.INSPECTORS) || []).map(function (i) { return i.name; });
        const names = Array.from(new Set(ops.concat(ins).filter(Boolean))).sort();
        return '<option value="">— 선택 —</option>' + names.map(function (n) {
            return `<option value="${esc(n)}" ${n === selected ? 'selected' : ''}>${esc(n)}</option>`;
        }).join('');
    }
    return {
        esc: esc, js: js, fmt: fmt, today: today, load: load, save: save,
        gradeBadge: gradeBadge, verdictBadge: verdictBadge, gradePie: gradePie,
        isAdmin: isAdmin, personOptions: personOptions
    };
})();

/* ════════════════════════════════════════════════════════════════════
   메인 허브
════════════════════════════════════════════════════════════════════ */
var CertHubModule = (function () {
    const KEYS = {
        eval: 'cert_eval_v1',
        ledger: 'cert_ledger_v1',
        msEval: 'cert_multiskill_eval_v1',
        msAnalysis: 'cert_multiskill_analysis_v1',
        rrVar: 'gauge_rr_variable_v1',
        rrAttr: 'gauge_rr_attribute_v1'
    };

    function _metricCard(tone, value, label, subLabel) {
        return `
            <div class="stat-card ${tone}">
                <div class="stat-card-value">${value}</div>
                <div class="stat-card-label">${label}</div>
                ${subLabel ? `<div style="margin-top:4px;font-size:.76rem;color:var(--text-muted);">${subLabel}</div>` : ''}
            </div>`;
    }

    function _homeCard(title, desc, icon, countText, onClick, tone) {
        const border = {
            blue: '#3b82f6', green: '#10b981', purple: '#8b5cf6',
            orange: '#f97316', red: '#ef4444', cyan: '#06b6d4', slate: '#64748b'
        }[tone || 'blue'] || '#3b82f6';
        return `
            <button type="button" onclick="${onClick}"
                onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(15,23,42,.10)'"
                onmouseleave="this.style.transform='';this.style.boxShadow='0 2px 8px rgba(15,23,42,.06)'"
                style="text-align:left;border:1px solid var(--border);border-top:3px solid ${border};background:#fff;border-radius:14px;
                       padding:20px;box-shadow:0 2px 8px rgba(15,23,42,.06);cursor:pointer;transition:all .15s;
                       display:flex;flex-direction:column;gap:14px;min-height:150px;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                    <span class="material-symbols-outlined"
                        style="width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;
                               background:#eff6ff;color:${border};font-size:22px;">${icon}</span>
                    <span style="font-size:.78rem;color:var(--text-muted);font-weight:700;">${countText || ''}</span>
                </div>
                <div>
                    <div style="font-size:1rem;font-weight:800;color:var(--text-primary);margin-bottom:6px;">${title}</div>
                    <div style="font-size:.84rem;line-height:1.5;color:var(--text-muted);">${desc}</div>
                </div>
            </button>`;
    }

    async function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                ${CertProcessUI.renderSection('certifications-mgmt')}
                <div class="section-card" style="padding:0;overflow:hidden;">
                    <div style="padding:24px;">
                        <div id="certHubStats" class="stat-cards" style="margin-bottom:18px;"></div>
                        <div id="certHubCards" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;"></div>
                    </div>
                </div>
            </div>`;

        const evalRows = await CertCommon.load(KEYS.eval);
        const ledgerRows = await CertCommon.load(KEYS.ledger);
        const msEvalRows = await CertCommon.load(KEYS.msEval);
        const msAnalysisRows = await CertCommon.load(KEYS.msAnalysis);
        const rrVarRows = await CertCommon.load(KEYS.rrVar);
        const rrAttrRows = await CertCommon.load(KEYS.rrAttr);

        const today = CertCommon.today();
        const passCount = evalRows.filter(function (r) { return r.passed; }).length;
        // 유효기간(갱신일) 만료 임박/만료 집계
        const expSoon = ledgerRows.filter(function (r) {
            if (!r.renewDate) return false;
            const diff = (new Date(r.renewDate) - new Date(today)) / 86400000;
            return diff <= 30;
        }).length;

        const statsEl = document.getElementById('certHubStats');
        if (statsEl) {
            statsEl.innerHTML = [
                _metricCard('blue', CertCommon.fmt(ledgerRows.length), '인증 인원', '관리대장 등록'),
                _metricCard('green', CertCommon.fmt(passCount), '자격 합격', `평가 ${evalRows.length}건`),
                _metricCard('purple', CertCommon.fmt(msEvalRows.length), '다기능 평가', `분석표 ${msAnalysisRows.length}건`),
                _metricCard('orange', CertCommon.fmt(expSoon), '갱신 임박', '30일 이내')
            ].join('');
        }

        const cardsEl = document.getElementById('certHubCards');
        if (cardsEl) {
            cardsEl.innerHTML = [
                _homeCard('자격인증 및 다기능 평가 기준서', '자격 부여 요건, 평가 방식, 주기 기준을 관리합니다.', 'menu_book', '기준', "Router.navigate('cert-standard')", 'slate'),
                _homeCard('자격인증 평가서', '검사원 자격 인증 평가 점수와 합부를 기록합니다.', 'assignment_turned_in', `${evalRows.length}건`, "Router.navigate('cert-eval')", 'blue'),
                _homeCard('자격인증 평가 관리대장', '인증서 번호, 유효기간, 평점을 통합 관리합니다.', 'view_list', `${ledgerRows.length}명`, "Router.navigate('cert-ledger')", 'green'),
                _homeCard('작업자 다기능 평가서', '공정별 작업자 다기능 평가 점수와 등급을 기록합니다.', 'grading', `${msEvalRows.length}건`, "Router.navigate('cert-multiskill-eval')", 'purple'),
                _homeCard('작업자 다기능 분석표', '작업자 × 공정 다기능 보유 현황을 시각화합니다.', 'donut_large', `${msAnalysisRows.length}건`, "Router.navigate('cert-multiskill-analysis')", 'cyan'),
                _homeCard('계량형 게이지 R&R 관리대장', '계량형 측정 시스템 분석(%R&R) 이력을 관리합니다.', 'straighten', `${rrVarRows.length}건`, "Router.navigate('gauge-rr-variable')", 'orange'),
                _homeCard('계수형 GAUGE R&R 평가서', '계수형(합부 판정) 측정 일치율·Kappa를 평가합니다.', 'rule', `${rrAttrRows.length}건`, "Router.navigate('gauge-rr-attribute')", 'red'),
                _homeCard('자격인증 현황', '부여된 자격 인증 현황을 확인합니다.', 'workspace_premium', '', "Router.navigate('cert-status')", 'slate'),
                _homeCard('검사자 / 작업자 관리', '검사자·작업자 인력 마스터를 관리합니다.', 'badge', '', "Router.navigate('inspectors-mgmt')", 'blue')
            ].join('');
        }
    }

    return { render: render, init: render };
})();

/* ════════════════════════════════════════════════════════════════════
   1) 자격인증 및 다기능 평가 기준서
════════════════════════════════════════════════════════════════════ */
var CertStandardModule = (function () {
    const KEY = 'cert_standard_v1';
    const C = CertCommon;

    const DEFAULTS = [
        { field: '검사원', target: '수입검사원', method: '자격인증 평가', cycle: '1회/년', career: '3개월 이상', evalScore: '70점 이상', msScore: '-', rrAttr: 'A등급 이상', rrVar: '합격', confirm: '자격인증서' },
        { field: '검사원', target: '공정 검사원', method: '자격인증 평가', cycle: '1회/년', career: '3개월 이상', evalScore: '70점 이상', msScore: '-', rrAttr: 'A등급 이상', rrVar: '합격', confirm: '자격인증서' },
        { field: '검사원', target: '출하검사원', method: '자격인증 평가', cycle: '1회/년', career: '3개월 이상', evalScore: '70점 이상', msScore: '-', rrAttr: 'A등급 이상', rrVar: '합격', confirm: '자격인증서' },
        { field: '작업자', target: '설비 셋업 작업자', method: '다기능 평가 문제', cycle: '1회/년', career: '3개월 이상', evalScore: '70점 이상', msScore: '70점 이상', rrAttr: 'A등급 이상', rrVar: '-', confirm: '다기능 분석표' },
        { field: '작업자', target: '포장/외관검사원', method: '다기능 평가서', cycle: '1회/년', career: '3개월 이상', evalScore: '70점 이상', msScore: 'B등급 이상', rrAttr: 'A등급 이상', rrVar: '-', confirm: '다기능 분석표' }
    ];

    const NOTES = [
        '자격 부여는 자격 요건 항목에 적합 시 자격 인증을 부여한다.',
        '자격 인증 유효기간은 1년이며 1년 마다 갱신 평가하여 재 인증서를 부여한다.',
        '자격 인증 평가는 매년 01월에 평가를 실시 한다.',
        '퇴사자 또는 기타 변경 사유 발생 시 재 평가 하여 자격을 부여한다.',
        '검사원은 결원/휴가 시 대응 방안으로 대체 자격 인증을 부여 한다 (2개 이상 인증분야 평가).',
        '자격 인증 평가 방법 — ① 검사원 자격 인증 평가: 품질팀장이 이론·실기 평가 후 합격자에게 자격인증서 발행 / ② 작업자 다기능 평가: 품질팀장이 이론·실기 평가 후 다기능 분석표로 공정 자격 부여.'
    ];

    async function _ensureSeed() {
        const rows = await C.load(KEY);
        if (!rows.length) {
            await C.save(KEY, DEFAULTS.map(function (r) { return Object.assign({ id: Storage.generateId() }, r); }));
        }
    }

    async function render(container) {
        await _ensureSeed();
        container.innerHTML = `
            <div class="fade-in-up">
                ${CertProcessUI.renderSection('cert-standard', '<button class="btn btn-primary btn-sm" onclick="CertStandardModule.openModal()"><span class="material-symbols-outlined">add</span> 기준 추가</button>')}
                <div class="card" style="margin-bottom:16px;">
                    <div class="card-header"><h4><span class="material-symbols-outlined">info</span> 자격 인증 및 다기능 평가 방법</h4></div>
                    <div class="card-body">
                        <ol style="margin:0;padding-left:20px;line-height:1.9;color:var(--text-secondary);font-size:0.88rem;">
                            ${NOTES.map(function (n, i) {
                                return `<li ${i === 4 ? 'style="color:var(--accent-red);font-weight:600;"' : ''}>${C.esc(n)}</li>`;
                            }).join('')}
                        </ol>
                    </div>
                </div>
                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>자격 분야</th>
                                        <th>대상자</th>
                                        <th>평가 방식</th>
                                        <th>평가 주기</th>
                                        <th>경력</th>
                                        <th>자격인증 평가서</th>
                                        <th>다기능 평가서</th>
                                        <th>계수형 R&R</th>
                                        <th>계량형 R&R</th>
                                        <th>자격부여 확인</th>
                                        <th style="width:110px;">작업</th>
                                    </tr>
                                </thead>
                                <tbody id="certStandardBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>`;
        await renderTable();
    }

    async function renderTable() {
        const tbody = document.getElementById('certStandardBody');
        if (!tbody) return;
        const rows = await C.load(KEY);
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:36px;color:var(--text-muted);">등록된 기준이 없습니다.</td></tr>`;
            return;
        }
        tbody.innerHTML = rows.map(function (r) {
            return `
                <tr>
                    <td><strong>${C.esc(r.field)}</strong></td>
                    <td>${C.esc(r.target)}</td>
                    <td>${C.esc(r.method)}</td>
                    <td>${C.esc(r.cycle)}</td>
                    <td>${C.esc(r.career)}</td>
                    <td>${C.esc(r.evalScore)}</td>
                    <td>${C.esc(r.msScore)}</td>
                    <td>${C.esc(r.rrAttr)}</td>
                    <td>${C.esc(r.rrVar)}</td>
                    <td>${C.esc(r.confirm)}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="CertStandardModule.openModal('${C.js(r.id)}')">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="CertStandardModule.remove('${C.js(r.id)}')">삭제</button>
                    </td>
                </tr>`;
        }).join('');
    }

    async function openModal(id) {
        const rows = await C.load(KEY);
        const r = id ? rows.find(function (x) { return x.id === id; }) : null;
        const f = function (k, label, ph) {
            return `<div class="form-group"><label class="form-label">${label}</label><input class="form-input" id="cs_${k}" value="${C.esc(r && r[k] || '')}" placeholder="${ph || ''}"></div>`;
        };
        UIUtils.showModal(
            r ? '평가 기준 수정' : '평가 기준 추가',
            `
                <div class="form-row">${f('field', '자격 분야', '검사원 / 작업자')}${f('target', '대상자', '예: 수입검사원')}</div>
                <div class="form-row">${f('method', '평가 방식', '자격인증 평가')}${f('cycle', '평가 주기', '1회/년')}</div>
                <div class="form-row">${f('career', '경력', '3개월 이상')}${f('evalScore', '자격인증 평가서', '70점 이상')}</div>
                <div class="form-row">${f('msScore', '다기능 평가서', '70점 이상 / -')}${f('confirm', '자격부여 확인', '자격인증서')}</div>
                <div class="form-row">${f('rrAttr', '계수형 R&R', 'A등급 이상')}${f('rrVar', '계량형 R&R', '합격')}</div>
            `,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" onclick="CertStandardModule.save('${id || ''}')">저장</button>`,
            'lg'
        );
    }

    async function save(id) {
        const rows = await C.load(KEY);
        const g = function (k) { var el = document.getElementById('cs_' + k); return el ? el.value.trim() : ''; };
        const payload = {
            field: g('field'), target: g('target'), method: g('method'), cycle: g('cycle'),
            career: g('career'), evalScore: g('evalScore'), msScore: g('msScore'),
            rrAttr: g('rrAttr'), rrVar: g('rrVar'), confirm: g('confirm')
        };
        if (!payload.target) { UIUtils.toast('대상자를 입력하세요.', 'warning'); return; }
        if (id) {
            const i = rows.findIndex(function (x) { return x.id === id; });
            if (i > -1) rows[i] = Object.assign({}, rows[i], payload);
        } else {
            rows.push(Object.assign({ id: Storage.generateId() }, payload));
        }
        await C.save(KEY, rows);
        UIUtils.closeModal();
        UIUtils.toast('기준이 저장되었습니다.', 'success');
        await renderTable();
    }

    async function remove(id) {
        UIUtils.confirm('이 기준을 삭제하시겠습니까?', async function () {
            const rows = await C.load(KEY);
            await C.save(KEY, rows.filter(function (x) { return x.id !== id; }));
            UIUtils.toast('삭제되었습니다.', 'success');
            await renderTable();
        });
    }

    return { render: render, init: render, openModal: openModal, save: save, remove: remove };
})();

/* ════════════════════════════════════════════════════════════════════
   2) 자격인증 평가서
════════════════════════════════════════════════════════════════════ */
var CertEvalModule = (function () {
    const KEY = 'cert_eval_v1';
    const C = CertCommon;

    const FIELDS = ['수입/공정/출하 검사원', '포장/외관 검사원', '설비 셋업 작업자'];

    // 교육훈련(40) 8항목 × 5
    const EDU_ITEMS = [
        '해당 공정 교육훈련 4시간 이상 이수자',
        '리스크 기반 사고를 포함한, 자동차 산업 프로세스 접근법의 이해',
        '고객 지정 요구사항의 이해',
        'ISO9001, IATF 16949 요구사항의 이해',
        'CORE TOOLS 요구사항의 이해',
        '계획, 수행, 보고와 심사발견사항 종결방법에 대한 이해',
        '기타 내부 교육 (내부 심사 관련)',
        '기타 외부 교육 (내부 심사 관련)'
    ];
    // 이해도(15) 3항목 × 5
    const UNDERSTAND_ITEMS = [
        '제품별 주요 검사항목은 숙지하고 있는가',
        '부적합품 발생시 처리 요령은 숙지하고 있는가',
        '제품의 불량 유형을 숙지하고 있는가'
    ];
    // 게이지 R&R(15) 3항목 × 5
    const RR_ITEMS = ['계수형', '계량형', '교육유효성 평가'];
    // 기술자격 가산점
    const CERT_BONUS = [
        { label: '없음', score: 0 },
        { label: '품질경영기사 (15점)', score: 15 },
        { label: '품질경영산업기사 (10점)', score: 10 },
        { label: '기타 품질관련 기술자격 (5점)', score: 5 }
    ];

    async function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                ${CertProcessUI.renderSection('cert-eval', '<button class="btn btn-primary btn-sm" onclick="CertEvalModule.openModal()"><span class="material-symbols-outlined">add</span> 평가 등록</button>')}
                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>평가일자</th><th>성명</th><th>직위</th><th>경력</th>
                                        <th>인증 분야</th><th>평가자</th>
                                        <th style="text-align:right;">총점</th><th>판정</th>
                                        <th style="width:110px;">작업</th>
                                    </tr>
                                </thead>
                                <tbody id="certEvalBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>`;
        await renderTable();
    }

    async function renderTable() {
        const tbody = document.getElementById('certEvalBody');
        if (!tbody) return;
        const rows = (await C.load(KEY)).sort(function (a, b) {
            return String(b.date || '').localeCompare(String(a.date || ''));
        });
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:36px;color:var(--text-muted);">등록된 자격인증 평가서가 없습니다.</td></tr>`;
            return;
        }
        tbody.innerHTML = rows.map(function (r) {
            return `
                <tr>
                    <td>${C.esc(r.date)}</td>
                    <td><strong>${C.esc(r.name)}</strong></td>
                    <td>${C.esc(r.position || '-')}</td>
                    <td>${C.esc(r.career || '-')}</td>
                    <td>${C.esc(r.field || '-')}</td>
                    <td>${C.esc(r.evaluator || '-')}</td>
                    <td style="text-align:right;font-weight:800;">${C.fmt(r.total || 0)}</td>
                    <td>${C.verdictBadge(!!r.passed)}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="CertEvalModule.openModal('${C.js(r.id)}')">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="CertEvalModule.remove('${C.js(r.id)}')">삭제</button>
                    </td>
                </tr>`;
        }).join('');
    }

    function _scoreRow(no, label, id, val, max) {
        return `
            <div style="display:grid;grid-template-columns:30px 1fr 70px;gap:8px;align-items:center;padding:5px 8px;border-bottom:1px solid var(--border-color);">
                <span style="color:var(--text-muted);font-size:0.78rem;">${no}</span>
                <span style="font-size:0.84rem;">${C.esc(label)}</span>
                <input type="number" class="form-input ce-score" id="${id}" min="0" max="${max}" step="1"
                       value="${val == null ? '' : val}" placeholder="0~${max}"
                       oninput="CertEvalModule.recalc()" style="text-align:right;padding:4px 8px;">
            </div>`;
    }

    function _section(title, total) {
        return `<div style="margin:14px 0 6px;padding:7px 10px;background:var(--bg-secondary);border-left:4px solid var(--accent-blue);border-radius:6px;font-weight:800;display:flex;justify-content:space-between;">
                    <span>${C.esc(title)}</span><span style="color:var(--text-muted);font-size:0.8rem;">배점 ${total}</span>
                </div>`;
    }

    async function openModal(id) {
        const rows = await C.load(KEY);
        const r = id ? rows.find(function (x) { return x.id === id; }) : null;
        const s = (r && r.scores) || {};
        const v = function (k) { return s[k] == null ? '' : s[k]; };

        const eduHtml = EDU_ITEMS.map(function (label, i) { return _scoreRow(i + 1, label, 'ce_edu_' + i, v('edu_' + i), 5); }).join('');
        const undHtml = UNDERSTAND_ITEMS.map(function (label, i) { return _scoreRow(i + 1, label, 'ce_und_' + i, v('und_' + i), 5); }).join('');
        const rrHtml = RR_ITEMS.map(function (label, i) { return _scoreRow(i + 1, label, 'ce_rr_' + i, v('rr_' + i), 5); }).join('');

        UIUtils.showModal(
            r ? '자격인증 평가서 수정' : '자격인증 평가서 등록',
            `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">평가일자</label><input class="form-input" id="ceDate" type="date" value="${C.esc((r && r.date) || C.today())}"></div>
                    <div class="form-group"><label class="form-label">성명</label><input class="form-input" id="ceName" value="${C.esc(r && r.name || '')}"></div>
                    <div class="form-group"><label class="form-label">직위</label><input class="form-input" id="cePosition" value="${C.esc(r && r.position || '')}" placeholder="예: 사원"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">경력</label><input class="form-input" id="ceCareer" value="${C.esc(r && r.career || '')}" placeholder="예: 11년"></div>
                    <div class="form-group"><label class="form-label">인증 분야</label>
                        <select class="form-select" id="ceField">
                            ${FIELDS.map(function (x) { return `<option value="${C.esc(x)}" ${((r && r.field) || '') === x ? 'selected' : ''}>${C.esc(x)}</option>`; }).join('')}
                        </select>
                    </div>
                    <div class="form-group"><label class="form-label">평가자</label><input class="form-input" id="ceEvaluator" value="${C.esc(r && r.evaluator || '')}"></div>
                </div>

                ${_section('경력 (10점)', 10)}
                ${_scoreRow(1, '6개월 이상 10점 / 미만 0점', 'ce_career', v('career'), 10)}

                ${_section('교육훈련 (40점)', 40)}
                ${eduHtml}

                ${_section('이해도 (15점)', 15)}
                ${undHtml}

                ${_section('게이지 R&R 평가점수 (15점)', 15)}
                ${rrHtml}

                ${_section('직무능력 선택 (20점)', 20)}
                <div style="padding:4px 8px;color:var(--text-muted);font-size:0.8rem;">해당 직무의 항목별 점수를 입력합니다 (각 10점).</div>
                ${_scoreRow(1, '직무 항목 ① (검사절차/셋팅 등)', 'ce_job_0', v('job_0'), 10)}
                ${_scoreRow(2, '직무 항목 ② (계측기/판정/이상조치 등)', 'ce_job_1', v('job_1'), 10)}

                ${_section('기술자격 (가산점)', '+')}
                <div class="form-group" style="padding:6px 8px;">
                    <select class="form-select ce-bonus" id="ceBonus" onchange="CertEvalModule.recalc()">
                        ${CERT_BONUS.map(function (b, i) { return `<option value="${b.score}" ${(s.bonus == null ? 0 : Number(s.bonus)) === b.score ? 'selected' : ''}>${C.esc(b.label)}</option>`; }).join('')}
                    </select>
                </div>

                <div style="margin-top:14px;padding:12px 16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;display:flex;align-items:center;justify-content:space-between;">
                    <span style="font-weight:800;color:var(--text-primary);">평가 점수 합계</span>
                    <span><strong id="ceTotal" style="font-size:1.4rem;color:var(--accent-blue);">0</strong> 점
                        <span id="ceVerdict" style="margin-left:10px;"></span>
                    </span>
                </div>
            `,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" onclick="CertEvalModule.save('${id || ''}')">저장</button>`,
            'xl'
        );
        setTimeout(recalc, 30);
    }

    function recalc() {
        var total = 0;
        document.querySelectorAll('.ce-score').forEach(function (el) {
            var max = Number(el.max) || 9999;
            var val = Math.min(Number(el.value) || 0, max);
            total += val;
        });
        var bonusEl = document.getElementById('ceBonus');
        if (bonusEl) total += Number(bonusEl.value) || 0;
        var totalEl = document.getElementById('ceTotal');
        if (totalEl) totalEl.textContent = total;
        var vEl = document.getElementById('ceVerdict');
        if (vEl) vEl.innerHTML = total >= 70 ? CertCommon.verdictBadge(true) : CertCommon.verdictBadge(false);
        return total;
    }

    async function save(id) {
        const rows = await C.load(KEY);
        const g = function (k) { var el = document.getElementById(k); return el ? el.value.trim() : ''; };
        const scores = {};
        EDU_ITEMS.forEach(function (_, i) { scores['edu_' + i] = Number((document.getElementById('ce_edu_' + i) || {}).value) || 0; });
        UNDERSTAND_ITEMS.forEach(function (_, i) { scores['und_' + i] = Number((document.getElementById('ce_und_' + i) || {}).value) || 0; });
        RR_ITEMS.forEach(function (_, i) { scores['rr_' + i] = Number((document.getElementById('ce_rr_' + i) || {}).value) || 0; });
        scores.career = Number((document.getElementById('ce_career') || {}).value) || 0;
        scores.job_0 = Number((document.getElementById('ce_job_0') || {}).value) || 0;
        scores.job_1 = Number((document.getElementById('ce_job_1') || {}).value) || 0;
        scores.bonus = Number((document.getElementById('ceBonus') || {}).value) || 0;

        const total = recalc();
        const payload = {
            date: g('ceDate'), name: g('ceName'), position: g('cePosition'),
            career: g('ceCareer'), field: g('ceField'), evaluator: g('ceEvaluator'),
            scores: scores, total: total, passed: total >= 70
        };
        if (!payload.name) { UIUtils.toast('성명을 입력하세요.', 'warning'); return; }
        if (id) {
            const i = rows.findIndex(function (x) { return x.id === id; });
            if (i > -1) rows[i] = Object.assign({}, rows[i], payload, { updatedAt: new Date().toISOString() });
        } else {
            rows.unshift(Object.assign({ id: Storage.generateId(), createdAt: new Date().toISOString() }, payload));
        }
        await C.save(KEY, rows);
        UIUtils.closeModal();
        UIUtils.toast('자격인증 평가서가 저장되었습니다.', 'success');
        await renderTable();
    }

    async function remove(id) {
        UIUtils.confirm('이 평가서를 삭제하시겠습니까?', async function () {
            const rows = await C.load(KEY);
            await C.save(KEY, rows.filter(function (x) { return x.id !== id; }));
            UIUtils.toast('삭제되었습니다.', 'success');
            await renderTable();
        });
    }

    return { render: render, init: render, openModal: openModal, save: save, remove: remove, recalc: recalc };
})();

/* ════════════════════════════════════════════════════════════════════
   3) 자격인증 평가 관리대장
════════════════════════════════════════════════════════════════════ */
var CertLedgerModule = (function () {
    const KEY = 'cert_ledger_v1';
    const C = CertCommon;

    async function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                ${CertProcessUI.renderSection('cert-ledger', '<button class="btn btn-primary btn-sm" onclick="CertLedgerModule.openModal()"><span class="material-symbols-outlined">add</span> 인증 인원 등록</button>')}
                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>NO</th>
                                        <th>자격인증 분야</th>
                                        <th>인증서 번호</th>
                                        <th>성명</th>
                                        <th>팀명/직책</th>
                                        <th>대체 자격인증</th>
                                        <th>최초</th>
                                        <th>갱신</th>
                                        <th style="text-align:right;">평가서 평점</th>
                                        <th style="text-align:right;">다기능 평가</th>
                                        <th>계량형 R&R</th>
                                        <th>계수형 R&R</th>
                                        <th>비고</th>
                                        <th style="width:110px;">작업</th>
                                    </tr>
                                </thead>
                                <tbody id="certLedgerBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>`;
        await renderTable();
    }

    async function renderTable() {
        const tbody = document.getElementById('certLedgerBody');
        if (!tbody) return;
        const rows = await C.load(KEY);
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="14" style="text-align:center;padding:36px;color:var(--text-muted);">등록된 인증 인원이 없습니다.</td></tr>`;
            return;
        }
        const today = C.today();
        tbody.innerHTML = rows.map(function (r, idx) {
            const expSoon = r.renewDate && (new Date(r.renewDate) - new Date(today)) / 86400000 <= 30;
            return `
                <tr>
                    <td>${idx + 1}</td>
                    <td>${C.esc(r.field || '-')}</td>
                    <td style="font-family:monospace;">${C.esc(r.certNo || '-')}</td>
                    <td><strong>${C.esc(r.name || '-')}</strong></td>
                    <td>${C.esc(r.team || '-')}</td>
                    <td>${C.esc(r.altCert || '-')}</td>
                    <td>${C.esc(r.firstDate || '-')}</td>
                    <td style="${expSoon ? 'color:var(--accent-red);font-weight:700;' : ''}">${C.esc(r.renewDate || '-')}</td>
                    <td style="text-align:right;">${C.esc(r.evalScore || '-')}</td>
                    <td style="text-align:right;">${C.esc(r.msScore || '-')}</td>
                    <td>${r.rrVar ? C.esc(r.rrVar) : '-'}</td>
                    <td>${r.rrAttr ? C.gradeBadge(r.rrAttr) : '-'}</td>
                    <td>${C.esc(r.note || '-')}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="CertLedgerModule.openModal('${C.js(r.id)}')">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="CertLedgerModule.remove('${C.js(r.id)}')">삭제</button>
                    </td>
                </tr>`;
        }).join('');
    }

    async function openModal(id) {
        const rows = await C.load(KEY);
        const r = id ? rows.find(function (x) { return x.id === id; }) : null;
        const inp = function (k, label, val, attr) {
            return `<div class="form-group"><label class="form-label">${label}</label><input class="form-input" id="cl_${k}" ${attr || ''} value="${C.esc(val == null ? '' : val)}"></div>`;
        };
        UIUtils.showModal(
            r ? '관리대장 수정' : '관리대장 등록',
            `
                <div class="form-row">
                    ${inp('field', '자격인증 분야', r && r.field, 'placeholder="예: 포장/외관 검사원"')}
                    ${inp('certNo', '인증서 번호', r && r.certNo, 'placeholder="예: KC-AQ-001"')}
                </div>
                <div class="form-row">
                    ${inp('name', '성명', r && r.name)}
                    ${inp('team', '팀명/직책', r && r.team, 'placeholder="예: 생산부/사원"')}
                </div>
                <div class="form-row">
                    ${inp('altCert', '대체 자격인증', r && r.altCert, 'placeholder="예: 배합 작업자"')}
                    ${inp('firstDate', '유효기간 (최초)', r && r.firstDate, 'type="date"')}
                </div>
                <div class="form-row">
                    ${inp('renewDate', '유효기간 (갱신)', r && r.renewDate, 'type="date"')}
                    ${inp('evalScore', '자격인증 평가서 평점', r && r.evalScore, 'placeholder="예: 70 점"')}
                </div>
                <div class="form-row">
                    ${inp('msScore', '다기능 평가 점수', r && r.msScore, 'placeholder="예: 100 / B"')}
                    <div class="form-group"><label class="form-label">계량형 GAGE R&R</label>
                        <select class="form-select" id="cl_rrVar">
                            ${['', '합격', '불합격', '-'].map(function (x) { return `<option value="${x}" ${((r && r.rrVar) || '') === x ? 'selected' : ''}>${x || '— 선택 —'}</option>`; }).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">계수형 GAGE R&R 등급</label>
                        <select class="form-select" id="cl_rrAttr">
                            ${['', 'S', 'A', 'B', 'C', 'D', '-'].map(function (x) { return `<option value="${x}" ${((r && r.rrAttr) || '') === x ? 'selected' : ''}>${x || '— 선택 —'}</option>`; }).join('')}
                        </select>
                    </div>
                    ${inp('note', '비고', r && r.note)}
                </div>
            `,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" onclick="CertLedgerModule.save('${id || ''}')">저장</button>`,
            'xl'
        );
    }

    async function save(id) {
        const rows = await C.load(KEY);
        const g = function (k) { var el = document.getElementById('cl_' + k); return el ? el.value.trim() : ''; };
        const payload = {
            field: g('field'), certNo: g('certNo'), name: g('name'), team: g('team'),
            altCert: g('altCert'), firstDate: g('firstDate'), renewDate: g('renewDate'),
            evalScore: g('evalScore'), msScore: g('msScore'), rrVar: g('rrVar'),
            rrAttr: g('rrAttr'), note: g('note')
        };
        if (!payload.name) { UIUtils.toast('성명을 입력하세요.', 'warning'); return; }
        if (id) {
            const i = rows.findIndex(function (x) { return x.id === id; });
            if (i > -1) rows[i] = Object.assign({}, rows[i], payload, { updatedAt: new Date().toISOString() });
        } else {
            rows.push(Object.assign({ id: Storage.generateId(), createdAt: new Date().toISOString() }, payload));
        }
        await C.save(KEY, rows);
        UIUtils.closeModal();
        UIUtils.toast('관리대장이 저장되었습니다.', 'success');
        await renderTable();
    }

    async function remove(id) {
        UIUtils.confirm('이 인원을 관리대장에서 삭제하시겠습니까?', async function () {
            const rows = await C.load(KEY);
            await C.save(KEY, rows.filter(function (x) { return x.id !== id; }));
            UIUtils.toast('삭제되었습니다.', 'success');
            await renderTable();
        });
    }

    return { render: render, init: render, openModal: openModal, save: save, remove: remove };
})();

/* ════════════════════════════════════════════════════════════════════
   4) 작업자 다기능 평가서
════════════════════════════════════════════════════════════════════ */
var CertMultiskillEvalModule = (function () {
    const KEY = 'cert_multiskill_eval_v1';
    const C = CertCommon;

    const GROUPS = [
        { title: '작업수행능력', items: ['작업 순서 및 방법 이해', '해당 작업에 대한 제품 특성 및 기능 이해', '작업 셋팅 요령 숙지', '작업시 이상 발생에 대한 조치 요령'] },
        { title: '설비조작능력', items: ['담당 설비에 대한 특성 및 기능 이해', '설비 운전 및 조작 기능 여부', '설비 취급 및 관리 상태', '설비 점검 요령 및 소모품 교체방법 숙지', '설비 이상 및 에러 발생시 응급조치 및 해제 요령'] },
        { title: '품질관리능력', items: ['작업 표준내용 숙지 및 표준작업 준수', '제품의 중요 품질특성 숙지', '계측기 및 검사구 사용방법 숙지', '중요 품질특성에 대한 검사 방법 숙지', '제품품질 확인 요령 및 이상발생시 조치 요령'] },
        { title: '작업안전 3정5행', items: ['작업시 안전에 대한 보호구 착용 준수', '작업시 작업태도 및 작업성실도', '해당 작업 구역 정리정돈 및 청결상태 유지'] }
    ];
    const MAX = GROUPS.reduce(function (s, g) { return s + g.items.length * 5; }, 0); // 17*5 = 85

    function _grade(total) {
        const pct = MAX ? (total / MAX) * 100 : 0;
        if (pct >= 88) return 'A';   // 75점 이상(85점 만점 기준 ≈88%)
        if (pct >= 76) return 'B';   // 65~74
        if (pct >= 64) return 'C';   // 55~64
        return 'D';
    }

    async function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                ${CertProcessUI.renderSection('cert-multiskill-eval', '<button class="btn btn-primary btn-sm" onclick="CertMultiskillEvalModule.openModal()"><span class="material-symbols-outlined">add</span> 평가 등록</button>')}
                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>평가일자</th><th>대상자</th><th>주공정</th><th>평가자</th>
                                        <th style="text-align:right;">작업수행</th>
                                        <th style="text-align:right;">설비조작</th>
                                        <th style="text-align:right;">품질관리</th>
                                        <th style="text-align:right;">안전5행</th>
                                        <th style="text-align:right;">합계</th>
                                        <th>등급</th>
                                        <th style="width:110px;">작업</th>
                                    </tr>
                                </thead>
                                <tbody id="msEvalBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>`;
        await renderTable();
    }

    async function renderTable() {
        const tbody = document.getElementById('msEvalBody');
        if (!tbody) return;
        const rows = (await C.load(KEY)).sort(function (a, b) {
            return String(b.date || '').localeCompare(String(a.date || ''));
        });
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:36px;color:var(--text-muted);">등록된 다기능 평가서가 없습니다.</td></tr>`;
            return;
        }
        tbody.innerHTML = rows.map(function (r) {
            const g = r.groupTotals || [0, 0, 0, 0];
            return `
                <tr>
                    <td>${C.esc(r.date)}</td>
                    <td><strong>${C.esc(r.name)}</strong></td>
                    <td>${C.esc(r.process || '-')}</td>
                    <td>${C.esc(r.evaluator || '-')}</td>
                    <td style="text-align:right;">${C.fmt(g[0])}</td>
                    <td style="text-align:right;">${C.fmt(g[1])}</td>
                    <td style="text-align:right;">${C.fmt(g[2])}</td>
                    <td style="text-align:right;">${C.fmt(g[3])}</td>
                    <td style="text-align:right;font-weight:800;">${C.fmt(r.total || 0)}</td>
                    <td>${C.gradeBadge(r.grade)}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="CertMultiskillEvalModule.openModal('${C.js(r.id)}')">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="CertMultiskillEvalModule.remove('${C.js(r.id)}')">삭제</button>
                    </td>
                </tr>`;
        }).join('');
    }

    async function openModal(id) {
        const rows = await C.load(KEY);
        const r = id ? rows.find(function (x) { return x.id === id; }) : null;
        const s = (r && r.scores) || {};

        const groupsHtml = GROUPS.map(function (grp, gi) {
            const itemsHtml = grp.items.map(function (label, ii) {
                const key = gi + '_' + ii;
                const val = s[key] == null ? '' : s[key];
                return `
                    <div style="display:grid;grid-template-columns:1fr 80px;gap:8px;align-items:center;padding:5px 8px;border-bottom:1px solid var(--border-color);">
                        <span style="font-size:0.84rem;">${C.esc(label)}</span>
                        <input type="number" class="ms-score form-input" data-group="${gi}" id="ms_${key}" min="0" max="5" step="1"
                               value="${val}" placeholder="0~5" oninput="CertMultiskillEvalModule.recalc()" style="text-align:right;padding:4px 8px;">
                    </div>`;
            }).join('');
            return `
                <div style="margin:14px 0 6px;padding:7px 10px;background:var(--bg-secondary);border-left:4px solid var(--accent-blue);border-radius:6px;font-weight:800;display:flex;justify-content:space-between;">
                    <span>${C.esc(grp.title)}</span>
                    <span style="color:var(--text-muted);font-size:0.8rem;">배점 ${grp.items.length * 5} · 소계 <strong id="msGroupTotal_${gi}">0</strong></span>
                </div>
                ${itemsHtml}`;
        }).join('');

        UIUtils.showModal(
            r ? '작업자 다기능 평가서 수정' : '작업자 다기능 평가서 등록',
            `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">평가일자</label><input class="form-input" id="msDate" type="date" value="${C.esc((r && r.date) || C.today())}"></div>
                    <div class="form-group"><label class="form-label">대상자</label>
                        <select class="form-select" id="msName">${C.personOptions(r && r.name)}</select>
                    </div>
                    <div class="form-group"><label class="form-label">주공정</label><input class="form-input" id="msProcess" value="${C.esc(r && r.process || '')}" placeholder="예: P1 / 자재 / 포장외관검사"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">평가자팀</label><input class="form-input" id="msTeam" value="${C.esc(r && r.team || '')}" placeholder="예: 생산부"></div>
                    <div class="form-group"><label class="form-label">평가자</label><input class="form-input" id="msEvaluator" value="${C.esc(r && r.evaluator || '')}"></div>
                </div>
                <div style="font-size:0.78rem;color:var(--text-muted);margin:6px 2px;">각 항목 5점 만점 · 우수 5~4 / 보통 3~2 / 미흡 1~0</div>
                ${groupsHtml}
                <div style="margin-top:14px;padding:12px 16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;display:flex;align-items:center;justify-content:space-between;">
                    <span style="font-weight:800;">평가 점수 합계 (배점 ${MAX})</span>
                    <span><strong id="msTotal" style="font-size:1.4rem;color:var(--accent-blue);">0</strong> 점
                        <span id="msGrade" style="margin-left:10px;"></span>
                    </span>
                </div>
            `,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" onclick="CertMultiskillEvalModule.save('${id || ''}')">저장</button>`,
            'xl'
        );
        setTimeout(recalc, 30);
    }

    function recalc() {
        const groupTotals = [0, 0, 0, 0];
        document.querySelectorAll('.ms-score').forEach(function (el) {
            const gi = Number(el.dataset.group);
            const val = Math.min(Number(el.value) || 0, 5);
            if (!isNaN(gi)) groupTotals[gi] += val;
        });
        groupTotals.forEach(function (t, gi) {
            const el = document.getElementById('msGroupTotal_' + gi);
            if (el) el.textContent = t;
        });
        const total = groupTotals.reduce(function (a, b) { return a + b; }, 0);
        const totalEl = document.getElementById('msTotal');
        if (totalEl) totalEl.textContent = total;
        const grade = _grade(total);
        const gEl = document.getElementById('msGrade');
        if (gEl) gEl.innerHTML = CertCommon.gradeBadge(grade);
        return { total: total, grade: grade, groupTotals: groupTotals };
    }

    async function save(id) {
        const rows = await C.load(KEY);
        const g = function (k) { var el = document.getElementById(k); return el ? el.value.trim() : ''; };
        const scores = {};
        GROUPS.forEach(function (grp, gi) {
            grp.items.forEach(function (_, ii) {
                scores[gi + '_' + ii] = Number((document.getElementById('ms_' + gi + '_' + ii) || {}).value) || 0;
            });
        });
        const calc = recalc();
        const payload = {
            date: g('msDate'), name: g('msName'), process: g('msProcess'),
            team: g('msTeam'), evaluator: g('msEvaluator'),
            scores: scores, groupTotals: calc.groupTotals, total: calc.total, grade: calc.grade
        };
        if (!payload.name) { UIUtils.toast('대상자를 선택하세요.', 'warning'); return; }
        if (id) {
            const i = rows.findIndex(function (x) { return x.id === id; });
            if (i > -1) rows[i] = Object.assign({}, rows[i], payload, { updatedAt: new Date().toISOString() });
        } else {
            rows.unshift(Object.assign({ id: Storage.generateId(), createdAt: new Date().toISOString() }, payload));
        }
        await C.save(KEY, rows);
        UIUtils.closeModal();
        UIUtils.toast('다기능 평가서가 저장되었습니다.', 'success');
        await renderTable();
    }

    async function remove(id) {
        UIUtils.confirm('이 평가서를 삭제하시겠습니까?', async function () {
            const rows = await C.load(KEY);
            await C.save(KEY, rows.filter(function (x) { return x.id !== id; }));
            UIUtils.toast('삭제되었습니다.', 'success');
            await renderTable();
        });
    }

    return { render: render, init: render, openModal: openModal, save: save, remove: remove, recalc: recalc };
})();

/* ════════════════════════════════════════════════════════════════════
   5) 작업자 다기능 분석표
════════════════════════════════════════════════════════════════════ */
var CertMultiskillAnalysisModule = (function () {
    const KEY = 'cert_multiskill_analysis_v1';
    const C = CertCommon;
    const DEFAULT_PROCESSES = ['P1', 'P2', '하우징커버 조립 설비', '자재', '포장/외관 검사'];

    async function _getProcesses(rows) {
        const set = new Set(DEFAULT_PROCESSES);
        rows.forEach(function (r) { Object.keys(r.grades || {}).forEach(function (p) { set.add(p); }); });
        return Array.from(set);
    }

    async function render(container) {
        const rows = await C.load(KEY);
        const processes = await _getProcesses(rows);

        const legend = `
            <div style="display:flex;gap:18px;flex-wrap:wrap;align-items:center;margin-bottom:14px;">
                ${['A', 'B', 'C', 'D'].map(function (g) {
                    const label = { A: '90점 이상', B: '89~80점', C: '79~70점', D: '69점 이하' }[g];
                    return `<span style="display:flex;align-items:center;gap:6px;font-size:0.82rem;">${C.gradePie(g)} <strong>${g}등급</strong> <span style="color:var(--text-muted);">${label}</span></span>`;
                }).join('')}
            </div>`;

        const headCols = processes.map(function (p) { return `<th style="text-align:center;min-width:90px;">${C.esc(p)}</th>`; }).join('');
        const bodyRows = rows.length
            ? rows.map(function (r) {
                const cells = processes.map(function (p) {
                    const grade = (r.grades || {})[p];
                    return `<td style="text-align:center;">${grade ? C.gradePie(grade) : '<span style="color:var(--text-muted);">-</span>'}</td>`;
                }).join('');
                return `
                    <tr>
                        <td><strong>${C.esc(r.name)}</strong></td>
                        <td>${C.esc(r.dept || '-')}</td>
                        ${cells}
                        <td>
                            <button class="btn btn-sm btn-outline" onclick="CertMultiskillAnalysisModule.openModal('${C.js(r.id)}')">수정</button>
                            <button class="btn btn-sm btn-danger" onclick="CertMultiskillAnalysisModule.remove('${C.js(r.id)}')">삭제</button>
                        </td>
                    </tr>`;
            }).join('')
            : `<tr><td colspan="${processes.length + 3}" style="text-align:center;padding:36px;color:var(--text-muted);">등록된 다기능 분석 데이터가 없습니다.</td></tr>`;

        container.innerHTML = `
            <div class="fade-in-up">
                ${CertProcessUI.renderSection('cert-multiskill-analysis', '<button class="btn btn-primary btn-sm" onclick="CertMultiskillAnalysisModule.openModal()"><span class="material-symbols-outlined">add</span> 작업자 등록</button>')}
                <div class="card">
                    <div class="card-body">
                        ${legend}
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>작업자명</th><th>소속</th>
                                        ${headCols}
                                        <th style="width:110px;">작업</th>
                                    </tr>
                                </thead>
                                <tbody>${bodyRows}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>`;
    }

    async function openModal(id) {
        const rows = await C.load(KEY);
        const r = id ? rows.find(function (x) { return x.id === id; }) : null;
        const grades = (r && r.grades) || {};
        const procRows = DEFAULT_PROCESSES.map(function (p) {
            const val = grades[p] || '';
            return `
                <div style="display:grid;grid-template-columns:1fr 130px;gap:10px;align-items:center;padding:6px 8px;border-bottom:1px solid var(--border-color);">
                    <span style="font-weight:600;">${C.esc(p)}</span>
                    <select class="form-select ma-grade" data-proc="${C.esc(p)}">
                        ${['', 'A', 'B', 'C', 'D'].map(function (g) { return `<option value="${g}" ${val === g ? 'selected' : ''}>${g || '— 미보유 —'}</option>`; }).join('')}
                    </select>
                </div>`;
        }).join('');

        UIUtils.showModal(
            r ? '다기능 분석 수정' : '다기능 분석 등록',
            `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">작업자명</label>
                        <select class="form-select" id="maName">${C.personOptions(r && r.name)}</select>
                    </div>
                    <div class="form-group"><label class="form-label">소속</label><input class="form-input" id="maDept" value="${C.esc(r && r.dept || '')}" placeholder="예: 생산부"></div>
                </div>
                <div style="margin:10px 0 6px;font-weight:800;">공정별 다기능 등급</div>
                ${procRows}
            `,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" onclick="CertMultiskillAnalysisModule.save('${id || ''}')">저장</button>`,
            'lg'
        );
    }

    async function save(id) {
        const rows = await C.load(KEY);
        const name = (document.getElementById('maName') || {}).value || '';
        const dept = ((document.getElementById('maDept') || {}).value || '').trim();
        const grades = {};
        document.querySelectorAll('.ma-grade').forEach(function (el) {
            if (el.value) grades[el.dataset.proc] = el.value;
        });
        if (!name) { UIUtils.toast('작업자를 선택하세요.', 'warning'); return; }
        const payload = { name: name, dept: dept, grades: grades };
        if (id) {
            const i = rows.findIndex(function (x) { return x.id === id; });
            if (i > -1) rows[i] = Object.assign({}, rows[i], payload, { updatedAt: new Date().toISOString() });
        } else {
            rows.push(Object.assign({ id: Storage.generateId(), createdAt: new Date().toISOString() }, payload));
        }
        await C.save(KEY, rows);
        UIUtils.closeModal();
        UIUtils.toast('다기능 분석표가 저장되었습니다.', 'success');
        const area = document.getElementById('contentArea');
        if (area) render(area);
    }

    async function remove(id) {
        UIUtils.confirm('이 작업자를 분석표에서 삭제하시겠습니까?', async function () {
            const rows = await C.load(KEY);
            await C.save(KEY, rows.filter(function (x) { return x.id !== id; }));
            UIUtils.toast('삭제되었습니다.', 'success');
            const area = document.getElementById('contentArea');
            if (area) render(area);
        });
    }

    return { render: render, init: render, openModal: openModal, save: save, remove: remove };
})();

/* ════════════════════════════════════════════════════════════════════
   6) 계량형 게이지 R&R 관리대장
════════════════════════════════════════════════════════════════════ */
var GaugeRRVariableModule = (function () {
    const KEY = 'gauge_rr_variable_v1';
    const C = CertCommon;

    function _verdict(rr) {
        const v = Number(rr);
        if (isNaN(v)) return { label: '-', type: 'secondary' };
        if (v < 10) return { label: '합격 (우수)', type: 'success' };
        if (v <= 30) return { label: '조건부 합격', type: 'warning' };
        return { label: '불합격', type: 'danger' };
    }

    async function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                ${CertProcessUI.renderSection('gauge-rr-variable', '<button class="btn btn-primary btn-sm" onclick="GaugeRRVariableModule.openModal()"><span class="material-symbols-outlined">add</span> R&R 등록</button>')}
                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>측정일</th><th>게이지명</th><th>관리번호</th><th>측정자</th>
                                        <th>부품/특성</th><th>공차</th>
                                        <th style="text-align:right;">%R&R</th>
                                        <th style="text-align:right;">ndc</th>
                                        <th>판정</th><th>비고</th>
                                        <th style="width:110px;">작업</th>
                                    </tr>
                                </thead>
                                <tbody id="rrVarBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>`;
        await renderTable();
    }

    async function renderTable() {
        const tbody = document.getElementById('rrVarBody');
        if (!tbody) return;
        const rows = (await C.load(KEY)).sort(function (a, b) {
            return String(b.date || '').localeCompare(String(a.date || ''));
        });
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;padding:36px;color:var(--text-muted);">등록된 계량형 R&R 데이터가 없습니다.</td></tr>`;
            return;
        }
        tbody.innerHTML = rows.map(function (r) {
            const v = _verdict(r.rr);
            return `
                <tr>
                    <td>${C.esc(r.date)}</td>
                    <td><strong>${C.esc(r.gaugeName)}</strong></td>
                    <td style="font-family:monospace;">${C.esc(r.gaugeNo || '-')}</td>
                    <td>${C.esc(r.measurer || '-')}</td>
                    <td>${C.esc(r.part || '-')}</td>
                    <td>${C.esc(r.tolerance || '-')}</td>
                    <td style="text-align:right;font-weight:700;">${r.rr == null || r.rr === '' ? '-' : r.rr + '%'}</td>
                    <td style="text-align:right;">${C.esc(r.ndc || '-')}</td>
                    <td><span class="badge badge-${v.type}">${v.label}</span></td>
                    <td>${C.esc(r.note || '-')}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="GaugeRRVariableModule.openModal('${C.js(r.id)}')">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="GaugeRRVariableModule.remove('${C.js(r.id)}')">삭제</button>
                    </td>
                </tr>`;
        }).join('');
    }

    async function openModal(id) {
        const rows = await C.load(KEY);
        const r = id ? rows.find(function (x) { return x.id === id; }) : null;
        const inp = function (k, label, val, attr) {
            return `<div class="form-group"><label class="form-label">${label}</label><input class="form-input" id="rv_${k}" ${attr || ''} value="${C.esc(val == null ? '' : val)}"></div>`;
        };
        UIUtils.showModal(
            r ? '계량형 R&R 수정' : '계량형 R&R 등록',
            `
                <div class="form-row">
                    ${inp('date', '측정일', (r && r.date) || C.today(), 'type="date"')}
                    ${inp('gaugeName', '게이지명', r && r.gaugeName, 'placeholder="예: 버니어 캘리퍼스"')}
                </div>
                <div class="form-row">
                    ${inp('gaugeNo', '관리번호', r && r.gaugeNo)}
                    ${inp('measurer', '측정자', r && r.measurer)}
                </div>
                <div class="form-row">
                    ${inp('part', '부품/특성', r && r.part, 'placeholder="예: GUIDE LAMP 외경"')}
                    ${inp('tolerance', '공차', r && r.tolerance, 'placeholder="예: 18.1 +0/-0.25"')}
                </div>
                <div class="form-row">
                    ${inp('rr', '%R&R', r && r.rr, 'type="number" step="0.1" min="0" placeholder="예: 8.5"')}
                    ${inp('ndc', 'ndc (구별 범주수)', r && r.ndc, 'type="number" step="1" min="0" placeholder="예: 5"')}
                </div>
                <div class="form-group"><label class="form-label">비고</label><textarea class="form-textarea" id="rv_note" rows="2">${C.esc(r && r.note || '')}</textarea></div>
            `,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" onclick="GaugeRRVariableModule.save('${id || ''}')">저장</button>`,
            'lg'
        );
    }

    async function save(id) {
        const rows = await C.load(KEY);
        const g = function (k) { var el = document.getElementById('rv_' + k); return el ? el.value.trim() : ''; };
        const payload = {
            date: g('date'), gaugeName: g('gaugeName'), gaugeNo: g('gaugeNo'),
            measurer: g('measurer'), part: g('part'), tolerance: g('tolerance'),
            rr: g('rr'), ndc: g('ndc'), note: g('note')
        };
        if (!payload.gaugeName) { UIUtils.toast('게이지명을 입력하세요.', 'warning'); return; }
        if (id) {
            const i = rows.findIndex(function (x) { return x.id === id; });
            if (i > -1) rows[i] = Object.assign({}, rows[i], payload, { updatedAt: new Date().toISOString() });
        } else {
            rows.unshift(Object.assign({ id: Storage.generateId(), createdAt: new Date().toISOString() }, payload));
        }
        await C.save(KEY, rows);
        UIUtils.closeModal();
        UIUtils.toast('계량형 R&R이 저장되었습니다.', 'success');
        await renderTable();
    }

    async function remove(id) {
        UIUtils.confirm('이 R&R 데이터를 삭제하시겠습니까?', async function () {
            const rows = await C.load(KEY);
            await C.save(KEY, rows.filter(function (x) { return x.id !== id; }));
            UIUtils.toast('삭제되었습니다.', 'success');
            await renderTable();
        });
    }

    return { render: render, init: render, openModal: openModal, save: save, remove: remove };
})();

/* ════════════════════════════════════════════════════════════════════
   7) 계수형 GAUGE R&R 평가서
════════════════════════════════════════════════════════════════════ */
var GaugeRRAttributeModule = (function () {
    const KEY = 'gauge_rr_attribute_v1';
    const C = CertCommon;

    // 일치율(%) → 등급
    function _grade(rate) {
        const v = Number(rate);
        if (isNaN(v)) return '';
        if (v >= 95) return 'A';
        if (v >= 90) return 'B';
        if (v >= 80) return 'C';
        return 'D';
    }

    async function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                ${CertProcessUI.renderSection('gauge-rr-attribute', '<button class="btn btn-primary btn-sm" onclick="GaugeRRAttributeModule.openModal()"><span class="material-symbols-outlined">add</span> 평가 등록</button>')}
                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>평가일</th><th>게이지/검사항목</th><th>평가자</th><th>부품/특성</th>
                                        <th style="text-align:right;">평가자내 일치율</th>
                                        <th style="text-align:right;">기준 대비 일치율</th>
                                        <th style="text-align:right;">Kappa</th>
                                        <th>등급</th><th>판정</th>
                                        <th style="width:110px;">작업</th>
                                    </tr>
                                </thead>
                                <tbody id="rrAttrBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>`;
        await renderTable();
    }

    async function renderTable() {
        const tbody = document.getElementById('rrAttrBody');
        if (!tbody) return;
        const rows = (await C.load(KEY)).sort(function (a, b) {
            return String(b.date || '').localeCompare(String(a.date || ''));
        });
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:36px;color:var(--text-muted);">등록된 계수형 R&R 평가가 없습니다.</td></tr>`;
            return;
        }
        tbody.innerHTML = rows.map(function (r) {
            const passed = r.grade === 'A' || r.grade === 'B';
            return `
                <tr>
                    <td>${C.esc(r.date)}</td>
                    <td><strong>${C.esc(r.gaugeName)}</strong></td>
                    <td>${C.esc(r.evaluator || '-')}</td>
                    <td>${C.esc(r.part || '-')}</td>
                    <td style="text-align:right;">${r.within == null || r.within === '' ? '-' : r.within + '%'}</td>
                    <td style="text-align:right;font-weight:700;">${r.vsRef == null || r.vsRef === '' ? '-' : r.vsRef + '%'}</td>
                    <td style="text-align:right;">${C.esc(r.kappa || '-')}</td>
                    <td>${C.gradeBadge(r.grade)}</td>
                    <td>${C.verdictBadge(passed)}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="GaugeRRAttributeModule.openModal('${C.js(r.id)}')">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="GaugeRRAttributeModule.remove('${C.js(r.id)}')">삭제</button>
                    </td>
                </tr>`;
        }).join('');
    }

    function recalc() {
        const vsRef = (document.getElementById('ra_vsRef') || {}).value;
        const grade = _grade(vsRef);
        const gEl = document.getElementById('raGrade');
        if (gEl) gEl.innerHTML = grade ? CertCommon.gradeBadge(grade) : '<span style="color:var(--text-muted);">-</span>';
        return grade;
    }

    async function openModal(id) {
        const rows = await C.load(KEY);
        const r = id ? rows.find(function (x) { return x.id === id; }) : null;
        const inp = function (k, label, val, attr) {
            return `<div class="form-group"><label class="form-label">${label}</label><input class="form-input" id="ra_${k}" ${attr || ''} value="${C.esc(val == null ? '' : val)}"></div>`;
        };
        UIUtils.showModal(
            r ? '계수형 R&R 평가 수정' : '계수형 R&R 평가 등록',
            `
                <div class="form-row">
                    ${inp('date', '평가일', (r && r.date) || C.today(), 'type="date"')}
                    ${inp('gaugeName', '게이지/검사항목', r && r.gaugeName, 'placeholder="예: 외관 합부 판정"')}
                </div>
                <div class="form-row">
                    ${inp('evaluator', '평가자', r && r.evaluator)}
                    ${inp('part', '부품/특성', r && r.part)}
                </div>
                <div class="form-row">
                    ${inp('within', '평가자내 일치율 (%)', r && r.within, 'type="number" step="0.1" min="0" max="100"')}
                    ${inp('vsRef', '기준 대비 일치율 (%)', r && r.vsRef, 'type="number" step="0.1" min="0" max="100" oninput="GaugeRRAttributeModule.recalc()"')}
                </div>
                <div class="form-row">
                    ${inp('kappa', 'Kappa 계수', r && r.kappa, 'type="number" step="0.01" min="0" max="1" placeholder="예: 0.92"')}
                    <div class="form-group"><label class="form-label">등급 (자동)</label>
                        <div style="padding:8px 4px;" id="raGrade"></div>
                    </div>
                </div>
                <div class="form-group"><label class="form-label">비고</label><textarea class="form-textarea" id="ra_note" rows="2">${C.esc(r && r.note || '')}</textarea></div>
            `,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" onclick="GaugeRRAttributeModule.save('${id || ''}')">저장</button>`,
            'lg'
        );
        setTimeout(recalc, 30);
    }

    async function save(id) {
        const rows = await C.load(KEY);
        const g = function (k) { var el = document.getElementById('ra_' + k); return el ? el.value.trim() : ''; };
        const grade = recalc();
        const payload = {
            date: g('date'), gaugeName: g('gaugeName'), evaluator: g('evaluator'),
            part: g('part'), within: g('within'), vsRef: g('vsRef'),
            kappa: g('kappa'), grade: grade, note: g('note')
        };
        if (!payload.gaugeName) { UIUtils.toast('게이지/검사항목을 입력하세요.', 'warning'); return; }
        if (id) {
            const i = rows.findIndex(function (x) { return x.id === id; });
            if (i > -1) rows[i] = Object.assign({}, rows[i], payload, { updatedAt: new Date().toISOString() });
        } else {
            rows.unshift(Object.assign({ id: Storage.generateId(), createdAt: new Date().toISOString() }, payload));
        }
        await C.save(KEY, rows);
        UIUtils.closeModal();
        UIUtils.toast('계수형 R&R 평가가 저장되었습니다.', 'success');
        await renderTable();
    }

    async function remove(id) {
        UIUtils.confirm('이 평가를 삭제하시겠습니까?', async function () {
            const rows = await C.load(KEY);
            await C.save(KEY, rows.filter(function (x) { return x.id !== id; }));
            UIUtils.toast('삭제되었습니다.', 'success');
            await renderTable();
        });
    }

    return { render: render, init: render, openModal: openModal, save: save, remove: remove, recalc: recalc };
})();
