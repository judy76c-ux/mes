/**
 * 수입검사 허브 (사출 입고 + 도료 입고 통합 현황)
 */
var IncomingOverviewModule = (function () {

    // 렌더 시 계산한 데이터를 캐시 (detail modal에서 재사용)
    let _inj = null;
    let _paint = null;

    function init() {}

    function render(container) {
        const now = new Date();
        const monthStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        const monthLabel = now.getFullYear() + '년 ' + String(now.getMonth() + 1).padStart(2, '0') + '월';

        _inj   = _calcInjStats(monthStr);
        _paint = _calcPaintStats(monthStr);

        const injBadges   = _buildBadges(_inj);
        const paintBadges = _buildPaintBadges(_paint);

        container.innerHTML = `
            <div class="fade-in-up">

                <!-- ── 섹션 카드 ── -->
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:28px;">
                    ${_sectionCard('사출 입고', '사출 자재 수입검사 등록 및 관리',
                        'fact_check', 'var(--accent-blue)', '#ffffff',
                        'injection-incoming', injBadges)}
                    ${_sectionCard('도료 입고', '도료 수입검사 등록 및 관리',
                        'colorize', '#8b5cf6', '#ffffff',
                        'paint-incoming-inspection', paintBadges)}
                </div>

                <!-- ── 사출 수입검사 실적 ── -->
                <div style="font-size:0.82rem;font-weight:700;color:var(--text-muted);
                            text-transform:uppercase;letter-spacing:0.5px;
                            margin-bottom:10px;padding-left:2px;">
                    사출 수입검사 — ${monthLabel} 실적
                </div>
                <div class="stat-cards" style="margin-bottom:28px;">
                    ${_sc('검사 건수',    _inj.count,       '건',   'blue',   false, '')}
                    ${_sc('입고 수량',    UIUtils.formatNumber(_inj.totalQty), 'ea', 'purple', false, '')}
                    ${_sc('합격',         _inj.passCount,   '건',   'green',  false, '')}
                    ${_sc('불합격',       _inj.failCount,   '건',
                        _inj.failCount   > 0 ? 'red'    : '', _inj.failCount   > 0,
                        'IncomingOverviewModule.showInjFail()')}
                    ${_sc('성적서 미접수', _inj.certPending, '건',
                        _inj.certPending > 0 ? 'red'    : '', _inj.certPending > 0,
                        'IncomingOverviewModule.showInjCert()')}
                    ${_sc('FIFO 위반',    _inj.fifoCount,   '건',
                        _inj.fifoCount   > 0 ? 'orange' : '', _inj.fifoCount   > 0,
                        'IncomingOverviewModule.showInjFifo()')}
                </div>

                <!-- ── 도료 수입검사 실적 ── -->
                <div style="font-size:0.82rem;font-weight:700;color:var(--text-muted);
                            text-transform:uppercase;letter-spacing:0.5px;
                            margin-bottom:10px;padding-left:2px;">
                    도료 수입검사 — ${monthLabel} 실적
                </div>
                <div class="stat-cards">
                    ${_sc('검사 건수',    _paint.count,        '건',    'blue',   false, '')}
                    ${_sc('입고 수량',    UIUtils.formatNumber(_paint.totalQty), 'L/kg', 'purple', false, '')}
                    ${_sc('불합격',       _paint.failCount,    '건',
                        _paint.failCount    > 0 ? 'red'    : '', _paint.failCount    > 0,
                        'IncomingOverviewModule.showPaintFail()')}
                    ${_sc('성적서 미접수', _paint.certPending,  '건',
                        _paint.certPending  > 0 ? 'red'    : '', _paint.certPending  > 0,
                        'IncomingOverviewModule.showPaintCert()')}
                    ${_sc('유효기간 임박', _paint.expiringCount,'건',
                        _paint.expiringCount> 0 ? 'orange' : '', _paint.expiringCount> 0,
                        'IncomingOverviewModule.showPaintExpiring()')}
                    ${_sc('유효기간 만료', _paint.expiredCount, '건',
                        _paint.expiredCount > 0 ? 'red'    : '', _paint.expiredCount > 0,
                        'IncomingOverviewModule.showPaintExpired()')}
                </div>

            </div>
        `;
    }

    /* ── 섹션 카드 ── */
    function _sectionCard(title, sub, icon, accentColor, iconBg, page, badges) {
        const badgesHtml = badges.length
            ? badges.map(b => `<span style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;
                border-radius:12px;padding:2px 10px;font-size:0.78rem;font-weight:700;">${b}</span>`).join('')
            : '<span style="background:#dcfce7;color:#16a34a;border:1px solid #86efac;border-radius:12px;padding:2px 10px;font-size:0.78rem;font-weight:700;">정상</span>';

        return `
            <div onclick="Router.navigate('${page}')"
                 onmouseenter="this.style.boxShadow='0 6px 24px rgba(0,0,0,0.13)';this.style.transform='translateY(-2px)'"
                 onmouseleave="this.style.boxShadow='0 2px 8px rgba(0,0,0,0.07)';this.style.transform=''"
                 style="background:#ffffff;border:1px solid var(--border-color);
                        border-left:4px solid ${accentColor};border-radius:12px;
                        padding:20px 24px;cursor:pointer;transition:box-shadow 0.2s,transform 0.2s;
                        box-shadow:0 2px 8px rgba(0,0,0,0.07);">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
                    <div style="width:44px;height:44px;border-radius:10px;background:${iconBg};
                                display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <span class="material-symbols-outlined" style="color:${accentColor};font-size:24px;">${icon}</span>
                    </div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:1rem;font-weight:700;color:var(--text-primary);">${title}</div>
                        <div style="font-size:0.8rem;color:var(--text-muted);">${sub}</div>
                    </div>
                    <span class="material-symbols-outlined" style="color:var(--text-muted);flex-shrink:0;">chevron_right</span>
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;">${badgesHtml}</div>
            </div>
        `;
    }

    /* ── 클릭 가능 stat 카드 ── */
    function _sc(label, value, unit, colorClass, clickable, onclickFn) {
        const attrs = clickable
            ? `onclick="${onclickFn}" style="cursor:pointer;position:relative;"
               onmouseenter="this.querySelector('.hint')&&(this.querySelector('.hint').style.opacity='1')"
               onmouseleave="this.querySelector('.hint')&&(this.querySelector('.hint').style.opacity='0')"`
            : 'style="position:relative;"';

        const hint = clickable
            ? `<div class="hint" style="opacity:0;transition:opacity 0.2s;position:absolute;
                    bottom:8px;right:10px;font-size:0.68rem;color:var(--text-muted);
                    display:flex;align-items:center;gap:2px;">
                   <span class="material-symbols-outlined" style="font-size:12px;">open_in_new</span>상세보기
               </div>` : '';

        return `
            <div class="stat-card ${colorClass}" ${attrs}>
                ${hint}
                <div class="stat-card-value">${value}</div>
                <div class="stat-card-label">${label}</div>
                ${unit ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">${unit}</div>` : ''}
            </div>`;
    }

    /* ── 뱃지 생성 ── */
    function _buildBadges(s) {
        const badges = [];
        if (s.certPending  > 0) badges.push(`성적서 미접수 ${s.certPending}건`);
        if (s.fifoCount    > 0) badges.push(`FIFO위반 ${s.fifoCount}건`);
        if (s.failCount    > 0) badges.push(`불합격 ${s.failCount}건`);
        return badges;
    }

    function _buildPaintBadges(s) {
        const badges = [];
        if (s.certPending    > 0) badges.push(`성적서 미접수 ${s.certPending}건`);
        if (s.expiredCount   > 0) badges.push(`유효기간 만료 ${s.expiredCount}건`);
        if (s.expiringCount  > 0) badges.push(`유효기간 임박 ${s.expiringCount}건`);
        if (s.failCount      > 0) badges.push(`불합격 ${s.failCount}건`);
        return badges;
    }

    /* ── 사출 수입검사 통계 계산 ── */
    function _calcInjStats(monthStr) {
        const all  = Storage.getAll(DB.STORES.INJECTION_INSPECTIONS) || [];
        const data = all.filter(d => (d.date || '').startsWith(monthStr));

        // FIFO 위반 계산 (injection_part1.js 동일 로직)
        const fifoViolations = new Set();
        const sorted = data.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        const maxLot = {};
        sorted.forEach(r => {
            const key  = (r.carModel || '') + '|' + (r.partName || '');
            const lots = (r.lots && r.lots.length) ? r.lots : (r.lotNo ? [{ lotNo: r.lotNo }] : []);
            const lotNos = lots.map(l => l.lotNo || '').filter(Boolean);
            const minL = lotNos.slice().sort()[0];
            const maxL = lotNos.slice().sort().pop();
            if (maxLot[key] && minL && minL < maxLot[key]) fifoViolations.add(r.id);
            if (maxL && (!maxLot[key] || maxL > maxLot[key])) maxLot[key] = maxL;
        });

        // 성적서 미접수
        const certPending = data.filter(d => {
            const lots = (d.lots && d.lots.length) ? d.lots
                : (d.lotNo ? [{ lotNo: d.lotNo, certReceived: d.certReceived || false }] : []);
            return lots.some(l => !l.certReceived);
        });

        const failItems = data.filter(d => (Number(d.failQty) || 0) > 0);
        const fifoItems = data.filter(d => fifoViolations.has(d.id));

        return {
            count:       data.length,
            totalQty:    data.reduce((s, d) => s + (Number(d.incomingQty) || 0), 0),
            passCount:   data.filter(d => (Number(d.failQty) || 0) === 0).length,
            failCount:   failItems.length,
            certPending: certPending.length,
            fifoCount:   fifoItems.length,
            data,
            failItems,
            certPendingItems: certPending,
            fifoItems,
        };
    }

    /* ── 도료 수입검사 통계 계산 ── */
    function _calcPaintStats(monthStr) {
        const all  = Storage.getAll(DB.STORES.PAINT_INCOMING_INSPECTIONS) || [];
        const data = all.filter(d => (d.date || '').startsWith(monthStr));

        const today = new Date(); today.setHours(0, 0, 0, 0);
        const expiredItems = [], expiringItems = [];

        data.forEach(d => {
            if (!d.expDate) return;
            const exp  = new Date(d.expDate); exp.setHours(0, 0, 0, 0);
            const diff = Math.round((exp - today) / 86400000);
            if (diff < 0)        expiredItems.push(d);
            else if (diff <= 30) expiringItems.push({ ...d, _daysLeft: diff });
        });

        const failItems   = data.filter(d => d.verdict === '불합격');
        const certPending = data.filter(d => d.certCheck !== '접수완료');

        return {
            count:          data.length,
            totalQty:       data.reduce((s, d) => s + (Number(d.incomingQty) || 0), 0),
            failCount:      failItems.length,
            certPending:    certPending.length,
            expiredCount:   expiredItems.length,
            expiringCount:  expiringItems.length,
            failItems,
            certPendingItems: certPending,
            expiredItems,
            expiringItems,
        };
    }

    /* ============================================================
       세부 정보 모달
    ============================================================ */

    /* 사출 — 불합격 */
    function showInjFail() {
        if (!_inj || !_inj.failItems.length) return;
        const rows = _inj.failItems.map(d => `
            <tr>
                <td>${d.date || '-'}</td>
                <td>${d.carModel || '-'}</td>
                <td>${d.partName || '-'}</td>
                <td style="text-align:right;">${UIUtils.formatNumber(d.incomingQty)}</td>
                <td style="text-align:right;color:var(--accent-red);font-weight:700;">${UIUtils.formatNumber(d.failQty)}</td>
                <td>${d.supplierName || '-'}</td>
            </tr>`).join('');
        UIUtils.showModal('사출 수입검사 — 불합격 목록', `
            <table class="data-table">
                <thead><tr><th>검사일자</th><th>차종</th><th>품명</th><th>입고수량</th><th>불합격수량</th><th>사출처</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`, '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'lg');
    }

    /* 사출 — 성적서 미접수 */
    function showInjCert() {
        if (!_inj || !_inj.certPendingItems.length) return;
        const rows = _inj.certPendingItems.map(d => {
            const lots = (d.lots && d.lots.length) ? d.lots
                : (d.lotNo ? [{ lotNo: d.lotNo, certReceived: d.certReceived || false }] : []);
            const pendingLots = lots.filter(l => !l.certReceived).map(l => l.lotNo || '-').join(', ');
            return `
                <tr style="background:rgba(220,38,38,0.03);">
                    <td>${d.date || '-'}</td>
                    <td>${d.carModel || '-'}</td>
                    <td>${d.partName || '-'}</td>
                    <td style="text-align:right;">${UIUtils.formatNumber(d.incomingQty)}</td>
                    <td style="font-family:monospace;color:#dc2626;font-weight:700;">${pendingLots}</td>
                    <td>${d.supplierName || '-'}</td>
                </tr>`;
        }).join('');
        UIUtils.showModal('사출 수입검사 — 성적서 미접수 목록', `
            <table class="data-table">
                <thead><tr><th>검사일자</th><th>차종</th><th>품명</th><th>입고수량</th><th>미접수 LOT</th><th>사출처</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`, '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'lg');
    }

    /* 사출 — FIFO 위반 */
    function showInjFifo() {
        if (!_inj || !_inj.fifoItems.length) return;
        const rows = _inj.fifoItems.map(d => {
            const lots = (d.lots && d.lots.length) ? d.lots : (d.lotNo ? [{ lotNo: d.lotNo }] : []);
            const lotNos = lots.map(l => l.lotNo || '-').join(', ');
            return `
                <tr style="background:rgba(234,88,12,0.04);">
                    <td>${d.date || '-'}</td>
                    <td>${d.carModel || '-'}</td>
                    <td>${d.partName || '-'}</td>
                    <td style="text-align:right;">${UIUtils.formatNumber(d.incomingQty)}</td>
                    <td style="font-family:monospace;color:#ea580c;font-weight:700;">${lotNos}</td>
                    <td>${d.supplierName || '-'}</td>
                </tr>`;
        }).join('');
        UIUtils.showModal('사출 수입검사 — FIFO 위반 목록', `
            <p style="font-size:0.83rem;color:var(--text-muted);margin-bottom:12px;">
                이전에 등록된 최신 LOT보다 오래된 LOT 번호가 새로 입고된 항목입니다.
            </p>
            <table class="data-table">
                <thead><tr><th>검사일자</th><th>차종</th><th>품명</th><th>입고수량</th><th>LOT</th><th>사출처</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`, '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'lg');
    }

    /* 도료 — 불합격 */
    function showPaintFail() {
        if (!_paint || !_paint.failItems.length) return;
        const rows = _paint.failItems.map(d => `
            <tr style="background:rgba(220,38,38,0.03);">
                <td>${d.date || '-'}</td>
                <td>${d.supplier || '-'}</td>
                <td>${d.paintName || '-'}</td>
                <td style="text-align:right;">${UIUtils.formatNumber(d.incomingQty)} L/kg</td>
                <td>${d.lotNo || '-'}</td>
                <td><span style="color:var(--accent-red);font-weight:700;">불합격</span></td>
            </tr>`).join('');
        UIUtils.showModal('도료 수입검사 — 불합격 목록', `
            <table class="data-table">
                <thead><tr><th>검사일자</th><th>구매처</th><th>원료명</th><th>입고수량</th><th>제조사 LOT</th><th>판정</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`, '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'lg');
    }

    /* 도료 — 성적서 미접수 */
    function showPaintCert() {
        if (!_paint || !_paint.certPendingItems.length) return;
        const rows = _paint.certPendingItems.map(d => `
            <tr style="background:rgba(220,38,38,0.03);">
                <td>${d.date || '-'}</td>
                <td>${d.supplier || '-'}</td>
                <td>${d.paintName || '-'}</td>
                <td style="text-align:right;">${UIUtils.formatNumber(d.incomingQty)} L/kg</td>
                <td>${d.lotNo || '-'}</td>
                <td style="color:#dc2626;font-weight:700;">${d.certCheck || '접수대기'}</td>
            </tr>`).join('');
        UIUtils.showModal('도료 수입검사 — 성적서 미접수 목록', `
            <table class="data-table">
                <thead><tr><th>검사일자</th><th>구매처</th><th>원료명</th><th>입고수량</th><th>제조사 LOT</th><th>접수상태</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`, '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'lg');
    }

    /* 도료 — 유효기간 임박 */
    function showPaintExpiring() {
        if (!_paint || !_paint.expiringItems.length) return;
        const rows = _paint.expiringItems
            .sort((a, b) => (a.expDate || '').localeCompare(b.expDate || ''))
            .map(d => `
                <tr style="background:rgba(245,158,11,0.04);">
                    <td>${d.date || '-'}</td>
                    <td>${d.supplier || '-'}</td>
                    <td>${d.paintName || '-'}</td>
                    <td style="text-align:right;">${UIUtils.formatNumber(d.incomingQty)} L/kg</td>
                    <td>${d.expDate || '-'}</td>
                    <td style="color:var(--accent-orange,#f59e0b);font-weight:700;">${d._daysLeft}일 남음</td>
                </tr>`).join('');
        UIUtils.showModal('도료 수입검사 — 유효기간 임박 목록', `
            <table class="data-table">
                <thead><tr><th>검사일자</th><th>구매처</th><th>원료명</th><th>입고수량</th><th>만료일</th><th>남은 기간</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`, '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'lg');
    }

    /* 도료 — 유효기간 만료 */
    function showPaintExpired() {
        if (!_paint || !_paint.expiredItems.length) return;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const rows = _paint.expiredItems
            .sort((a, b) => (a.expDate || '').localeCompare(b.expDate || ''))
            .map(d => {
                const diff = Math.abs(Math.round((new Date(d.expDate) - today) / 86400000));
                return `
                    <tr style="background:rgba(220,38,38,0.04);">
                        <td>${d.date || '-'}</td>
                        <td>${d.supplier || '-'}</td>
                        <td>${d.paintName || '-'}</td>
                        <td style="text-align:right;">${UIUtils.formatNumber(d.incomingQty)} L/kg</td>
                        <td>${d.expDate || '-'}</td>
                        <td style="color:var(--accent-red);font-weight:700;">${diff}일 경과</td>
                    </tr>`;
            }).join('');
        UIUtils.showModal('도료 수입검사 — 유효기간 만료 목록', `
            <table class="data-table">
                <thead><tr><th>검사일자</th><th>구매처</th><th>원료명</th><th>입고수량</th><th>만료일</th><th>경과 기간</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>`, '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>', 'lg');
    }

    return {
        init, render,
        showInjFail, showInjCert, showInjFifo,
        showPaintFail, showPaintCert, showPaintExpiring, showPaintExpired,
    };
})();
