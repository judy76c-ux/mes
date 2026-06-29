/**
 * 수입검사 허브 (공유 UI + 메인 허브)
 */

/* ══════════════════════════════════════════════════════════════
   공유 소메뉴 UI (LaserProcessUI 패턴)
══════════════════════════════════════════════════════════════ */
var IncomingUI = (function () {
    const MENUS = [
        { id: 'incoming-overview',         label: '수입검사 현황',    icon: 'dashboard',       desc: '사출·도료 입고검사 등록, 기준서, 표준서를 한 화면에서 관리합니다.' },
        { id: 'injection-incoming',        label: '사출 입고',        icon: 'fact_check',      desc: '사출 자재 수입검사 등록 및 LOT·성적서·FIFO 관리' },
        { id: 'paint-incoming-inspection', label: '도료 입고',        icon: 'colorize',        desc: '도료 수입검사 등록 및 유효기간·성적서 관리' },
        { id: 'inj-incoming-std',          label: '사출 수입검사 기준서', icon: 'description',     desc: '사출 수입검사 기준서 등록·편집·출력' },
        { id: 'paint-incoming-std',        label: '도료 수입검사 기준서', icon: 'picture_as_pdf',  desc: '입고 도료에 대한 수입검사 기준서 목록' },
        { id: 'inj-insp-std-photo',        label: '수입검사 표준서',  icon: 'photo_library',   desc: '차종·품명별 수입검사 기준 사진 및 표준서 관리' },
        { id: 'incoming-delete-log',       label: '이력변경 관리',    icon: 'manage_history',  desc: '수입검사 삭제 이력 및 변경 감사 로그' },
    ];

    function renderSection(activePage) {
        return `
            <div class="mes-apple-menu-hero" style="padding:16px 20px;margin-bottom:20px;display:flex;gap:10px;flex-wrap:wrap;">
                ${MENUS.map(function(menu) {
                    const active = menu.id === activePage;
                    return `<button type="button" onclick="Router.navigate('${menu.id}')"
                        style="display:flex;align-items:center;gap:12px;padding:12px 18px;border-radius:14px;
                               border:${active ? '2px solid var(--accent-blue)' : '1.5px solid var(--border-color)'};
                               background:var(--bg-primary);color:var(--text-primary);
                               cursor:pointer;min-width:140px;text-align:left;box-shadow:0 1px 4px rgba(0,0,0,.06);">
                        <span style="display:inline-flex;align-items:center;justify-content:center;
                                     width:42px;height:42px;border-radius:10px;flex-shrink:0;
                                     background:${active ? 'var(--accent-blue)' : 'var(--bg-secondary)'};">
                            <span class="material-symbols-outlined" style="font-size:24px;color:${active ? '#fff' : 'var(--text-muted)'};">${menu.icon}</span>
                        </span>
                        <span style="display:flex;flex-direction:column;gap:2px;">
                            <span style="font-size:0.88rem;font-weight:700;white-space:nowrap;">${menu.label}</span>
                        </span>
                    </button>`;
                }).join('')}
            </div>`;
    }
    return { renderSection };
})();

/* ══════════════════════════════════════════════════════════════
   수입검사 허브 메인
══════════════════════════════════════════════════════════════ */
var IncomingOverviewModule = (function () {

    let _inj   = null;
    let _paint = null;

    function init() {}

    function render(container) {
        const now = new Date();
        const monthStr   = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        const monthLabel = now.getFullYear() + '년 ' + String(now.getMonth() + 1).padStart(2, '0') + '월';

        _inj   = _calcInjStats(monthStr);
        _paint = _calcPaintStats(monthStr);

        // 기준서 등록 현황 (사출 자재 마스터 기준)
        const allProds = (Storage.getAll(DB.STORES.INJECTION_MATERIALS) || []).filter(p => p.carModel && p.injPartName);
        const allStds  = Storage.getAll(DB.STORES.INJ_INCOMING_STD) || [];
        const stdCount = allStds.length;
        const unregCount = Math.max(0, allProds.length - stdCount);

        container.innerHTML = `
        <div class="fade-in-up">
            ${IncomingUI.renderSection('incoming-overview')}

            <div class="section-card" style="padding:0;overflow:hidden;">
                <div style="padding:24px;">

                    <!-- ── 이달 실적 지표 ── -->
                    <div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);
                                text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">
                        ${monthLabel} 수입검사 실적
                    </div>
                    <div id="incomingHubStats" class="stat-cards" style="margin-bottom:24px;"></div>

                    <!-- ── 바로가기 카드 ── -->
                    <div id="incomingHubCards" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;"></div>
                </div>
            </div>
        </div>`;

        /* stat cards */
        const statsEl = document.getElementById('incomingHubStats');
        if (statsEl) {
            statsEl.innerHTML = [
                _metricCard('blue',   _inj.count,                          '사출 검사건수',   `${UIUtils.formatNumber(_inj.totalQty)} EA`),
                _metricCard('green',  _inj.passCount,                      '사출 합격',       `불합격 ${_inj.failCount}건`),
                _metricCard(_inj.certPending > 0 ? 'red' : '',
                                      _inj.certPending,                    '성적서 미접수',   '사출'),
                _metricCard('purple', _paint.count,                        '도료 검사건수',   `${UIUtils.formatNumber(_paint.totalQty)} L/kg`),
                _metricCard(_paint.expiredCount > 0 ? 'red' : 'orange',
                                      _paint.expiredCount + _paint.expiringCount, '도료 유효기간 이슈', `만료 ${_paint.expiredCount} / 임박 ${_paint.expiringCount}`),
                _metricCard(unregCount > 0 ? 'orange' : 'green',
                                      unregCount,                          '기준서 미등록',   `등록 ${stdCount}종`)
            ].join('');
        }

        /* nav cards */
        const cardsEl = document.getElementById('incomingHubCards');
        if (cardsEl) {
            cardsEl.innerHTML = [
                _homeCard('사출 입고',
                    '사출 자재 수입검사 등록 및 LOT·성적서·FIFO 관리',
                    'fact_check', `${_inj.count}건`, "Router.navigate('injection-incoming')", 'blue'),
                _homeCard('도료 입고',
                    '도료 수입검사 등록 및 유효기간·성적서 관리',
                    'colorize', `${_paint.count}건`, "Router.navigate('paint-incoming-inspection')", 'purple'),
                _homeCard('사출 수입검사 기준서',
                    '사출 수입검사 기준서 등록·편집·출력',
                    'description', `${stdCount}종 등록${unregCount > 0 ? ' / ' + unregCount + '종 미등록' : ''}`,
                    "Router.navigate('inj-incoming-std')", unregCount > 0 ? 'orange' : 'green'),
                _homeCard('도료 수입검사 기준서',
                    '도료 수입검사 기준서 목록',
                    'picture_as_pdf', '-', "Router.navigate('paint-incoming-std')", 'purple'),
                _homeCard('수입검사 표준서',
                    '차종·품명별 수입검사 기준 사진 및 표준서 관리',
                    'photo_library', '-', "Router.navigate('inj-insp-std-photo')", 'blue'),
            ].join('');
        }
    }

    /* ── 홈 카드 ── */
    function _homeCard(title, desc, icon, countText, onClick, tone) {
        const COLORS = {
            blue: '#3b82f6', green: '#10b981', purple: '#8b5cf6',
            orange: '#f97316', red: '#ef4444', cyan: '#06b6d4'
        };
        const border = COLORS[tone] || '#3b82f6';
        return `
            <button type="button" onclick="${onClick}"
                onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(15,23,42,.10)'"
                onmouseleave="this.style.transform='';this.style.boxShadow='0 2px 8px rgba(15,23,42,.06)'"
                style="text-align:left;border:1px solid var(--border-color);border-top:3px solid ${border};
                       background:#fff;border-radius:14px;padding:20px;
                       box-shadow:0 2px 8px rgba(15,23,42,.06);cursor:pointer;transition:all .15s;
                       display:flex;flex-direction:column;gap:14px;min-height:140px;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                    <span class="material-symbols-outlined"
                        style="width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;
                               background:${border}18;color:${border};font-size:22px;">${icon}</span>
                    <span style="font-size:.78rem;color:var(--text-muted);font-weight:700;">${countText}</span>
                </div>
                <div>
                    <div style="font-size:1rem;font-weight:800;color:var(--text-primary);margin-bottom:6px;">${title}</div>
                    <div style="font-size:.84rem;line-height:1.5;color:var(--text-muted);">${desc}</div>
                </div>
            </button>`;
    }

    /* ── 지표 카드 ── */
    function _metricCard(tone, value, label, subLabel) {
        return `
            <div class="stat-card ${tone}">
                <div class="stat-card-value">${typeof value === 'number' ? value.toLocaleString() : value}</div>
                <div class="stat-card-label">${label}</div>
                ${subLabel ? `<div style="margin-top:4px;font-size:.76rem;color:var(--text-muted);">${subLabel}</div>` : ''}
            </div>`;
    }

    /* ── 클릭 가능 stat ── */
    function _sc(label, value, unit, colorClass, clickable, onclickFn) {
        const attrs = clickable
            ? `onclick="${onclickFn}" style="cursor:pointer;position:relative;"
               onmouseenter="this.querySelector('.hint')&&(this.querySelector('.hint').style.opacity='1')"
               onmouseleave="this.querySelector('.hint')&&(this.querySelector('.hint').style.opacity='0')"`
            : 'style="position:relative;"';
        const hint = clickable ? `<div class="hint" style="opacity:0;transition:opacity 0.2s;position:absolute;
                bottom:8px;right:10px;font-size:0.68rem;color:var(--text-muted);display:flex;align-items:center;gap:2px;">
                <span class="material-symbols-outlined" style="font-size:12px;">open_in_new</span>상세보기</div>` : '';
        return `<div class="stat-card ${colorClass}" ${attrs}>${hint}
                <div class="stat-card-value">${value}</div>
                <div class="stat-card-label">${label}</div>
                ${unit ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">${unit}</div>` : ''}
            </div>`;
    }

    /* ── 뱃지 ── */
    function _buildBadges(s) {
        const b = [];
        if (s.certPending > 0) b.push(`성적서 미접수 ${s.certPending}건`);
        if (s.fifoCount   > 0) b.push(`FIFO위반 ${s.fifoCount}건`);
        if (s.failCount   > 0) b.push(`불합격 ${s.failCount}건`);
        return b;
    }
    function _buildPaintBadges(s) {
        const b = [];
        if (s.certPending   > 0) b.push(`성적서 미접수 ${s.certPending}건`);
        if (s.expiredCount  > 0) b.push(`유효기간 만료 ${s.expiredCount}건`);
        if (s.expiringCount > 0) b.push(`유효기간 임박 ${s.expiringCount}건`);
        if (s.failCount     > 0) b.push(`불합격 ${s.failCount}건`);
        return b;
    }

    /* ── 사출 통계 ── */
    function _calcInjStats(monthStr) {
        const all  = Storage.getAll(DB.STORES.INJECTION_INSPECTIONS) || [];
        const data = all.filter(d => (d.date || '').startsWith(monthStr));
        const fifoViolations = new Set();
        const sorted = data.slice().sort((a, b) => (a.date||'').localeCompare(b.date||''));
        const maxLot = {};
        sorted.forEach(r => {
            const key  = (r.carModel||'') + '|' + (r.partName||'');
            const lots = (r.lots && r.lots.length) ? r.lots : (r.lotNo ? [{ lotNo: r.lotNo }] : []);
            const lotNos = lots.map(l => l.lotNo||'').filter(Boolean);
            const minL = lotNos.slice().sort()[0];
            const maxL = lotNos.slice().sort().pop();
            if (maxLot[key] && minL && minL < maxLot[key]) fifoViolations.add(r.id);
            if (maxL && (!maxLot[key] || maxL > maxLot[key])) maxLot[key] = maxL;
        });
        const certPending = data.filter(d => {
            const lots = (d.lots && d.lots.length) ? d.lots : (d.lotNo ? [{ lotNo: d.lotNo, certReceived: d.certReceived||false }] : []);
            return lots.length > 0 && !lots.some(l => l.certReceived);
        });
        const failItems = data.filter(d => (Number(d.failQty)||0) > 0);
        const fifoItems = data.filter(d => fifoViolations.has(d.id));
        return {
            count: data.length,
            totalQty: data.reduce((s,d) => s+(Number(d.incomingQty)||0), 0),
            passCount: data.filter(d => (Number(d.failQty)||0) === 0).length,
            failCount: failItems.length,
            certPending: certPending.length,
            fifoCount: fifoItems.length,
            data, failItems, certPendingItems: certPending, fifoItems,
        };
    }

    /* ── 도료 통계 ── */
    function _calcPaintStats(monthStr) {
        const all  = Storage.getAll(DB.STORES.PAINT_INCOMING_INSPECTIONS) || [];
        const data = all.filter(d => (d.date||'').startsWith(monthStr));
        const today = new Date(); today.setHours(0,0,0,0);
        const expiredItems = [], expiringItems = [];
        data.forEach(d => {
            if (!d.expDate) return;
            const exp  = new Date(d.expDate); exp.setHours(0,0,0,0);
            const diff = Math.round((exp - today) / 86400000);
            if (diff < 0)        expiredItems.push(d);
            else if (diff <= 30) expiringItems.push({ ...d, _daysLeft: diff });
        });
        const failItems   = data.filter(d => d.verdict === '불합격');
        const certPending = data.filter(d => d.certCheck !== '접수완료');
        return {
            count: data.length,
            totalQty: data.reduce((s,d) => s+(Number(d.incomingQty)||0), 0),
            failCount: failItems.length,
            certPending: certPending.length,
            expiredCount: expiredItems.length,
            expiringCount: expiringItems.length,
            failItems, certPendingItems: certPending, expiredItems, expiringItems,
        };
    }

    /* ── 상세 모달 ── */
    function showInjFail() {
        if (!_inj || !_inj.failItems.length) return;
        const rows = _inj.failItems.map(d => `<tr>
            <td>${d.date||'-'}</td><td>${d.carModel||'-'}</td><td>${d.partName||'-'}</td>
            <td style="text-align:right;">${UIUtils.formatNumber(d.incomingQty)}</td>
            <td style="text-align:right;color:var(--accent-red);font-weight:700;">${UIUtils.formatNumber(d.failQty)}</td>
            <td>${d.supplierName||'-'}</td></tr>`).join('');
        UIUtils.showModal('사출 수입검사 — 불합격 목록', `<table class="data-table">
            <thead><tr><th>검사일자</th><th>차종</th><th>품명</th><th>입고수량</th><th>불합격수량</th><th>사출처</th></tr></thead>
            <tbody>${rows}</tbody></table>`,
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'lg');
    }
    function showInjCert() {
        if (!_inj || !_inj.certPendingItems.length) return;
        const rows = _inj.certPendingItems.map(d => {
            const lots = (d.lots && d.lots.length) ? d.lots : (d.lotNo ? [{ lotNo: d.lotNo, certReceived: d.certReceived||false }] : []);
            const pendingLots = lots.map(l => l.lotNo||'-').join(', ');
            return `<tr><td>${d.date||'-'}</td><td>${d.carModel||'-'}</td><td>${d.partName||'-'}</td>
                <td style="text-align:right;">${UIUtils.formatNumber(d.incomingQty)}</td>
                <td style="font-family:monospace;color:#dc2626;font-weight:700;">${pendingLots}</td>
                <td>${d.supplierName||'-'}</td></tr>`;
        }).join('');
        UIUtils.showModal('사출 수입검사 — 성적서 미접수 목록', `<table class="data-table">
            <thead><tr><th>검사일자</th><th>차종</th><th>품명</th><th>입고수량</th><th>미접수 LOT</th><th>사출처</th></tr></thead>
            <tbody>${rows}</tbody></table>`,
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'lg');
    }
    function showInjFifo() {
        if (!_inj || !_inj.fifoItems.length) return;
        const rows = _inj.fifoItems.map(d => {
            const lots = (d.lots && d.lots.length) ? d.lots : (d.lotNo ? [{ lotNo: d.lotNo }] : []);
            return `<tr><td>${d.date||'-'}</td><td>${d.carModel||'-'}</td><td>${d.partName||'-'}</td>
                <td style="text-align:right;">${UIUtils.formatNumber(d.incomingQty)}</td>
                <td style="font-family:monospace;color:#ea580c;font-weight:700;">${lots.map(l=>l.lotNo||'-').join(', ')}</td>
                <td>${d.supplierName||'-'}</td></tr>`;
        }).join('');
        UIUtils.showModal('사출 수입검사 — FIFO 위반 목록', `<table class="data-table">
            <thead><tr><th>검사일자</th><th>차종</th><th>품명</th><th>입고수량</th><th>LOT</th><th>사출처</th></tr></thead>
            <tbody>${rows}</tbody></table>`,
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'lg');
    }
    function showPaintFail() {
        if (!_paint || !_paint.failItems.length) return;
        const rows = _paint.failItems.map(d => `<tr>
            <td>${d.date||'-'}</td><td>${d.supplier||'-'}</td><td>${d.paintName||'-'}</td>
            <td style="text-align:right;">${UIUtils.formatNumber(d.incomingQty)} L/kg</td>
            <td>${d.lotNo||'-'}</td><td style="color:var(--accent-red);font-weight:700;">불합격</td></tr>`).join('');
        UIUtils.showModal('도료 수입검사 — 불합격 목록', `<table class="data-table">
            <thead><tr><th>검사일자</th><th>구매처</th><th>원료명</th><th>입고수량</th><th>LOT</th><th>판정</th></tr></thead>
            <tbody>${rows}</tbody></table>`,
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'lg');
    }
    function showPaintCert() {
        if (!_paint || !_paint.certPendingItems.length) return;
        const rows = _paint.certPendingItems.map(d => `<tr>
            <td>${d.date||'-'}</td><td>${d.supplier||'-'}</td><td>${d.paintName||'-'}</td>
            <td style="text-align:right;">${UIUtils.formatNumber(d.incomingQty)} L/kg</td>
            <td>${d.lotNo||'-'}</td><td style="color:#dc2626;font-weight:700;">${d.certCheck||'접수대기'}</td></tr>`).join('');
        UIUtils.showModal('도료 수입검사 — 성적서 미접수 목록', `<table class="data-table">
            <thead><tr><th>검사일자</th><th>구매처</th><th>원료명</th><th>입고수량</th><th>LOT</th><th>접수상태</th></tr></thead>
            <tbody>${rows}</tbody></table>`,
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'lg');
    }
    function showPaintExpiring() {
        if (!_paint || !_paint.expiringItems.length) return;
        const rows = _paint.expiringItems.sort((a,b)=>(a.expDate||'').localeCompare(b.expDate||'')).map(d => `<tr>
            <td>${d.date||'-'}</td><td>${d.supplier||'-'}</td><td>${d.paintName||'-'}</td>
            <td style="text-align:right;">${UIUtils.formatNumber(d.incomingQty)} L/kg</td>
            <td>${d.expDate||'-'}</td><td style="color:var(--accent-orange,#f59e0b);font-weight:700;">${d._daysLeft}일 남음</td></tr>`).join('');
        UIUtils.showModal('도료 수입검사 — 유효기간 임박', `<table class="data-table">
            <thead><tr><th>검사일자</th><th>구매처</th><th>원료명</th><th>입고수량</th><th>만료일</th><th>남은 기간</th></tr></thead>
            <tbody>${rows}</tbody></table>`,
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'lg');
    }
    function showPaintExpired() {
        if (!_paint || !_paint.expiredItems.length) return;
        const today = new Date(); today.setHours(0,0,0,0);
        const rows = _paint.expiredItems.sort((a,b)=>(a.expDate||'').localeCompare(b.expDate||'')).map(d => {
            const diff = Math.abs(Math.round((new Date(d.expDate)-today)/86400000));
            return `<tr><td>${d.date||'-'}</td><td>${d.supplier||'-'}</td><td>${d.paintName||'-'}</td>
                <td style="text-align:right;">${UIUtils.formatNumber(d.incomingQty)} L/kg</td>
                <td>${d.expDate||'-'}</td><td style="color:var(--accent-red);font-weight:700;">${diff}일 경과</td></tr>`;
        }).join('');
        UIUtils.showModal('도료 수입검사 — 유효기간 만료', `<table class="data-table">
            <thead><tr><th>검사일자</th><th>구매처</th><th>원료명</th><th>입고수량</th><th>만료일</th><th>경과</th></tr></thead>
            <tbody>${rows}</tbody></table>`,
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'lg');
    }

    return {
        init, render,
        showInjFail, showInjCert, showInjFifo,
        showPaintFail, showPaintCert, showPaintExpiring, showPaintExpired,
    };
})();

/* ══════════════════════════════════════════════════════════════
   수입검사 이력변경 관리 (삭제 감사 로그)
══════════════════════════════════════════════════════════════ */
var IncomingDeleteLogModule = (function () {
    const LOG_STORE = DB.STORES.INSPECTION_DELETE_LOGS;

    function init() {}

    function render(container) {
        container.innerHTML = `
        <div class="fade-in-up">
            ${IncomingUI.renderSection('incoming-delete-log')}
            <div class="card">
                <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span class="material-symbols-outlined" style="color:var(--accent-red);">manage_history</span>
                        <strong>수입검사 이력변경 관리</strong>
                        <span style="font-size:0.8rem;color:var(--text-muted);">삭제된 검사 기록의 감사 로그입니다.</span>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <select class="form-select" id="delLogTypeFilter" style="min-width:120px;">
                            <option value="">전체 유형</option>
                            <option value="injection">사출 수입검사</option>
                            <option value="paint">도료 수입검사</option>
                        </select>
                        <button class="btn btn-outline" onclick="IncomingDeleteLogModule.search()">
                            <span class="material-symbols-outlined">search</span> 조회
                        </button>
                    </div>
                </div>
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>삭제 일시</th>
                                    <th>유형</th>
                                    <th>원본 요약</th>
                                    <th>삭제자</th>
                                    <th>삭제 사유</th>
                                    <th>원본 보기</th>
                                </tr>
                            </thead>
                            <tbody id="delLogTableBody">
                                <tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">로딩 중...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>`;
        search();
    }

    function search() {
        const typeFilter = (document.getElementById('delLogTypeFilter') || {}).value || '';
        let logs = (Storage.getAll(LOG_STORE) || [])
            .sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
        if (typeFilter) logs = logs.filter(l => l.type === typeFilter);

        const tbody = document.getElementById('delLogTableBody');
        if (!tbody) return;
        if (!logs.length) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">삭제 이력이 없습니다.</td></tr>`;
            return;
        }
        tbody.innerHTML = logs.map(l => {
            const deletedAt = l.deletedAt ? l.deletedAt.replace('T', ' ').slice(0, 19) : '-';
            const typeLabel = l.typeLabel || (l.type === 'injection' ? '사출 수입검사' : '도료 수입검사');
            const typeBadge = l.type === 'injection'
                ? `<span style="background:#dbeafe;color:#2563eb;border-radius:4px;padding:2px 8px;font-size:0.78rem;font-weight:700;">사출</span>`
                : `<span style="background:#ede9fe;color:#7c3aed;border-radius:4px;padding:2px 8px;font-size:0.78rem;font-weight:700;">도료</span>`;
            return `<tr>
                <td style="font-size:0.82rem;color:var(--text-muted);">${deletedAt}</td>
                <td>${typeBadge}</td>
                <td style="font-size:0.85rem;">${l.summary || '-'}</td>
                <td style="font-size:0.85rem;">${l.deletedBy || '-'}</td>
                <td style="font-size:0.85rem;color:var(--accent-red);">${l.reason || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-outline" onclick="IncomingDeleteLogModule.viewOriginal('${l.id}')">
                        <span class="material-symbols-outlined" style="font-size:14px;vertical-align:-2px;">open_in_new</span> 원본
                    </button>
                </td>
            </tr>`;
        }).join('');
    }

    function viewOriginal(logId) {
        const log = Storage.getById(LOG_STORE, logId);
        if (!log) return;
        const d = log.originalData || {};
        const typeLabel = log.typeLabel || (log.type === 'injection' ? '사출 수입검사' : '도료 수입검사');
        const deletedAt = log.deletedAt ? log.deletedAt.replace('T', ' ').slice(0, 19) : '-';

        const row = (label, value) =>
            `<div style="display:flex;gap:0;border-bottom:1px solid var(--border);">
                <div style="width:140px;flex-shrink:0;padding:7px 12px;background:var(--bg-secondary);font-size:0.8rem;font-weight:600;color:var(--text-muted);">${label}</div>
                <div style="flex:1;padding:7px 14px;font-size:0.85rem;">${value !== undefined && value !== null && value !== '' ? value : '-'}</div>
            </div>`;

        const fields = log.type === 'injection' ? [
            row('검사일자', d.date), row('검사자', d.inspector), row('차종', d.carModel),
            row('품명', d.partName), row('컬러', d.color), row('사출처', d.supplierName),
            row('입고수량', UIUtils.formatNumber(d.incomingQty) + ' EA'),
            row('검사수량', UIUtils.formatNumber(d.inspectionQty)),
            row('합격수량', UIUtils.formatNumber(d.passQty)),
            row('불합격수량', UIUtils.formatNumber(d.failQty)),
            row('합격 판정', d.verdict), row('비고', d.note),
        ] : [
            row('검사일자', d.date), row('검사자', d.inspector), row('구매처', d.supplier),
            row('도료품명', d.paintName), row('제조사 표기 LOT', d.lotNo),
            row('제조일자', d.mfgDate), row('유효기간', d.expDate),
            row('입고수량', UIUtils.formatNumber(d.incomingQty)),
            row('용기 상태', d.containerStatus), row('유효기간 확인', d.expDateCheck),
            row('성적서 접수', d.certCheck), row('최종 판정', d.verdict), row('비고', d.note),
        ];

        UIUtils.showModal(`원본 데이터 — ${typeLabel}`, `
            <div style="padding:4px 0 12px;display:flex;gap:16px;font-size:0.82rem;color:var(--text-muted);">
                <span><strong>삭제 일시:</strong> ${deletedAt}</span>
                <span><strong>삭제자:</strong> ${log.deletedBy || '-'}</span>
                <span><strong>사유:</strong> <span style="color:var(--accent-red);">${log.reason || '-'}</span></span>
            </div>
            <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;">
                ${fields.join('')}
            </div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>`,
            '600px'
        );
    }

    return { init, render, search, viewOriginal };
})();
