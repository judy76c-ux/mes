/**
 * 수입검사 허브 (IncomingHubModule)
 * - 사출 입고 / 도료 입고 진입 버튼
 * - 이번달 수입검사 실적 대시보드
 * - 성적서 미접수 · FIFO위반 · 유효기간 임박 알림
 */
var IncomingHubModule = (function () {
    const INJ_STORE   = DB.STORES.INJECTION_INSPECTIONS;
    const PAINT_STORE = DB.STORES.PAINT_INCOMING_INSPECTIONS;

    // ── 유틸 ──────────────────────────────────────────────────────────
    function _thisMonth() {
        const t = new Date();
        const y = t.getFullYear();
        const m = String(t.getMonth() + 1).padStart(2, '0');
        return { start: `${y}-${m}-01`, end: UIUtils.today(), label: `${y}년 ${m}월` };
    }

    function _fmt(n) { return UIUtils.formatNumber(n); }

    function _badge(text, type) {
        // type: success | danger | warning | info | muted
        const map = {
            success: 'background:#dcfce7;color:#15803d;border:1px solid #86efac;',
            danger:  'background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;',
            warning: 'background:#fff7ed;color:#ea580c;border:1px solid #fdba74;',
            info:    'background:#eff6ff;color:#2563eb;border:1px solid #93c5fd;',
            muted:   'background:var(--bg-secondary);color:var(--text-muted);border:1px solid var(--border-color);',
        };
        return `<span style="${map[type] || map.muted} border-radius:10px;padding:1px 9px;font-size:11px;font-weight:700;">${text}</span>`;
    }

    // ── 사출 수입검사 데이터 분석 ────────────────────────────────────
    function _analyzeInj(period) {
        const all  = Storage.getAll(INJ_STORE);
        const mon  = all.filter(d => d.date >= period.start && d.date <= period.end);

        // 성적서 미접수 (전체 기간)
        const certPending = all.filter(d => {
            const lots = (d.lots && d.lots.length > 0)
                ? d.lots
                : (d.lotNo ? [{ lotNo: d.lotNo, certReceived: d.certReceived || false }] : []);
            return lots.some(l => !l.certReceived);
        }).sort((a, b) => (a.date || '').localeCompare(b.date || ''));

        // FIFO 위반 (이번달)
        const fifoVio = new Set();
        const sorted = [...mon].sort((a, b) => a.date < b.date ? -1 : 1);
        const maxLot = {};
        sorted.forEach(r => {
            const key = `${r.carModel}|${r.partName}`;
            const lots = (r.lots && r.lots.length > 0) ? r.lots : (r.lotNo ? [{ lotNo: r.lotNo }] : []);
            const minLotNo = lots.map(l => l.lotNo || '').filter(Boolean).sort()[0];
            const maxLotNo = lots.map(l => l.lotNo || '').filter(Boolean).sort().pop();
            if (maxLot[key] && minLotNo && minLotNo < maxLot[key]) fifoVio.add(r.id);
            if (maxLotNo && (!maxLot[key] || maxLotNo > maxLot[key])) maxLot[key] = maxLotNo;
        });

        const totalQty  = mon.reduce((s, d) => s + (Number(d.incomingQty) || 0), 0);
        const failCount = mon.filter(d => (Number(d.failQty) || 0) > 0).length;
        const passCount = mon.length - failCount;

        // 차종별 집계 (이번달)
        const byCarModel = {};
        mon.forEach(d => {
            const k = d.carModel || '(차종미상)';
            if (!byCarModel[k]) byCarModel[k] = { count: 0, qty: 0, fail: 0 };
            byCarModel[k].count++;
            byCarModel[k].qty  += Number(d.incomingQty) || 0;
            byCarModel[k].fail += (Number(d.failQty) || 0) > 0 ? 1 : 0;
        });

        return { mon, all, certPending, fifoVio, totalQty, failCount, passCount, byCarModel };
    }

    // ── 도료 수입검사 데이터 분석 ────────────────────────────────────
    function _analyzePaint(period) {
        const all = Storage.getAll(PAINT_STORE);
        const mon = all.filter(d => d.date >= period.start && d.date <= period.end);

        const certPending = all.filter(d => d.certCheck !== '접수완료')
            .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

        // 유효기간 임박 (30일 이내)
        const today = UIUtils.today();
        const warn30 = new Date(today);
        warn30.setDate(warn30.getDate() + 30);
        const warnStr = warn30.toISOString().slice(0, 10);
        const expiring = all.filter(d => {
            if (!d.expiryDate) return false;
            return d.expiryDate >= today && d.expiryDate <= warnStr;
        });
        const expired = all.filter(d => d.expiryDate && d.expiryDate < today);

        const totalQty  = mon.reduce((s, d) => s + (Number(d.incomingQty) || 0), 0);
        const failCount = mon.filter(d => d.finalResult === '불합격').length;

        return { mon, all, certPending, expiring, expired, totalQty, failCount };
    }

    // ── 렌더링 ────────────────────────────────────────────────────────
    function render(container) {
        const period = _thisMonth();
        const inj    = _analyzeInj(period);
        const paint  = _analyzePaint(period);

        const alertCount = inj.certPending.length + paint.certPending.length +
                           inj.fifoVio.size + paint.expiring.length + paint.expired.length;

        container.innerHTML = `
        <div class="fade-in-up">

            <!-- 페이지 헤더 -->
            <!-- ① 진입 버튼 -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px;">
                ${_entryCard('사출 입고', '사출 자재 수입검사 등록 및 관리',
                    'precision_manufacturing', 'var(--accent-blue)', 'injection-incoming',
                    inj.certPending.length > 0 ? `성적서 미접수 ${inj.certPending.length}건` : '')}
                ${_entryCard('도료 입고', '도료 수입검사 등록 및 관리',
                    'colorize', '#a855f7', 'paint-incoming-inspection',
                    paint.certPending.length > 0 ? `성적서 미접수 ${paint.certPending.length}건` : '')}
            </div>

            <!-- ② 사출 KPI 카드 -->
            <div style="font-size:13px;font-weight:700;color:var(--text-muted);margin-bottom:8px;letter-spacing:.04em;">
                사출 수입검사 — ${period.label} 실적
            </div>
            <div class="stat-cards" style="margin-bottom:20px;">
                ${_kpi('검사 건수', inj.mon.length, '건', 'blue', 'assignment_turned_in')}
                ${_kpi('입고 수량', _fmt(inj.totalQty), 'ea', 'purple', 'inventory')}
                ${_kpi('합격', inj.passCount, '건', 'green', 'check_circle')}
                ${_kpi('불합격', inj.failCount, '건', inj.failCount > 0 ? 'red' : 'green', 'cancel')}
                ${_kpi('성적서 미접수', inj.certPending.length, '건', inj.certPending.length > 0 ? 'red' : 'green', 'pending_actions')}
                ${_kpi('FIFO 위반', inj.fifoVio.size, '건', inj.fifoVio.size > 0 ? 'orange' : 'green', 'swap_vert')}
            </div>

            <!-- ③ 도료 KPI 카드 -->
            <div style="font-size:13px;font-weight:700;color:var(--text-muted);margin-bottom:8px;letter-spacing:.04em;">
                도료 수입검사 — ${period.label} 실적
            </div>
            <div class="stat-cards" style="margin-bottom:24px;">
                ${_kpi('검사 건수', paint.mon.length, '건', 'blue', 'assignment_turned_in')}
                ${_kpi('입고 수량', _fmt(paint.totalQty), 'L/kg', 'purple', 'inventory')}
                ${_kpi('불합격', paint.failCount, '건', paint.failCount > 0 ? 'red' : 'green', 'cancel')}
                ${_kpi('성적서 미접수', paint.certPending.length, '건', paint.certPending.length > 0 ? 'red' : 'green', 'pending_actions')}
                ${_kpi('유효기간 임박', paint.expiring.length, '건', paint.expiring.length > 0 ? 'orange' : 'green', 'schedule')}
                ${_kpi('유효기간 만료', paint.expired.length, '건', paint.expired.length > 0 ? 'red' : 'green', 'event_busy')}
            </div>

            <!-- ④ 알림 섹션들 -->
            ${_injCertPendingHtml(inj.certPending)}
            ${_paintCertPendingHtml(paint.certPending)}
            ${_fifoHtml(inj.mon, inj.fifoVio)}
            ${_expiryHtml(paint.expiring, paint.expired)}

            <!-- ⑤ 사출 차종별 현황 -->
            ${_carModelTableHtml(inj.byCarModel, period)}

            <!-- ⑥ 최근 사출 검사 이력 -->
            ${_recentInjHtml(inj.mon)}

        </div>`;
    }

    // ── 진입 카드 ─────────────────────────────────────────────────────
    function _entryCard(title, desc, icon, color, page, badge) {
        return `
        <div onclick="Router.navigate('${page}')"
            style="cursor:pointer;border-radius:12px;border:1px solid color-mix(in srgb, ${color} 38%, var(--border-color));
                border-left:6px solid ${color};
                background:linear-gradient(90deg,
                    color-mix(in srgb, ${color} 20%, #ffffff) 0%,
                    color-mix(in srgb, ${color} 10%, #ffffff) 42%,
                    var(--bg-card) 100%);
                padding:22px 24px;display:flex;align-items:center;gap:18px;
                transition:box-shadow .15s,transform .15s,border-color .15s;
                box-shadow:0 1px 4px rgba(0,0,0,.06);"
            onmouseenter="this.style.boxShadow='0 8px 22px rgba(37,99,235,.18)';this.style.transform='translateY(-2px)'"
            onmouseleave="this.style.boxShadow='0 1px 4px rgba(0,0,0,.06)';this.style.transform=''">
            <div style="width:54px;height:54px;border-radius:12px;
                background:color-mix(in srgb, ${color} 18%, #ffffff);
                border:1px solid color-mix(in srgb, ${color} 35%, #ffffff);
                display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                <span class="material-symbols-outlined" style="font-size:28px;color:${color};">${icon}</span>
            </div>
            <div style="flex:1;min-width:0;">
                <div style="font-size:16px;font-weight:800;color:var(--text-primary);margin-bottom:3px;">${title}</div>
                <div style="font-size:12px;color:var(--text-muted);">${desc}</div>
                ${badge ? `<div style="margin-top:6px;">${_badge(badge, 'danger')}</div>` : ''}
            </div>
            <span class="material-symbols-outlined" style="color:${color};font-size:22px;flex-shrink:0;">chevron_right</span>
        </div>`;
    }

    // ── KPI 카드 ─────────────────────────────────────────────────────
    function _kpi(label, value, unit, color, icon) {
        const colorMap = {
            blue:   { bg: '#eff6ff', val: '#2563eb', icon: '#60a5fa' },
            purple: { bg: '#f5f3ff', val: '#7c3aed', icon: '#a78bfa' },
            green:  { bg: '#f0fdf4', val: '#16a34a', icon: '#4ade80' },
            red:    { bg: '#fff1f2', val: '#dc2626', icon: '#f87171' },
            orange: { bg: '#fff7ed', val: '#ea580c', icon: '#fb923c' },
        };
        const c = colorMap[color] || colorMap.blue;
        return `
        <div class="stat-card" style="background:${c.bg};border:1px solid ${c.icon}40;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
                <span class="material-symbols-outlined" style="font-size:16px;color:${c.icon};">${icon}</span>
                <span style="font-size:11px;color:${c.val};font-weight:600;">${label}</span>
            </div>
            <div style="font-size:24px;font-weight:800;color:${c.val};line-height:1;">${value}</div>
            <div style="font-size:11px;color:${c.icon};margin-top:2px;">${unit}</div>
        </div>`;
    }

    // ── 사출 성적서 미접수 ────────────────────────────────────────────
    function _injCertPendingHtml(pending) {
        if (!pending.length) return '';
        const rows = pending.slice(0, 20).map(d => {
            const lots = (d.lots && d.lots.length > 0)
                ? d.lots : (d.lotNo ? [{ lotNo: d.lotNo, certReceived: d.certReceived || false }] : []);
            const pendingLots = lots.filter(l => !l.certReceived);
            const lotBadges = pendingLots.map(l =>
                `<span style="display:inline-flex;align-items:center;gap:2px;background:#fee2e2;
                    border:1px solid #fca5a5;border-radius:4px;padding:1px 7px;
                    font-size:0.78rem;font-family:monospace;color:#dc2626;font-weight:600;">
                    <span class="material-symbols-outlined" style="font-size:12px;">cancel</span>${l.lotNo || '-'}
                </span>`
            ).join(' ');
            const daysDiff = Math.floor((new Date() - new Date(d.date)) / 86400000);
            return `<tr style="background:rgba(220,38,38,.03);">
                <td>${d.date}</td>
                <td>${d.carModel || '-'}</td>
                <td>${d.partName || '-'}</td>
                <td>${lotBadges}</td>
                <td style="text-align:right;">${_fmt(d.incomingQty)}</td>
                <td>${d.supplierName || '-'}</td>
                <td style="text-align:center;">
                    ${_badge(daysDiff + '일 경과', daysDiff > 14 ? 'danger' : 'warning')}
                </td>
                <td style="text-align:center;">
                    <button class="btn btn-sm btn-primary" style="font-size:11px;"
                        onclick="Router.navigate('injection-incoming')">
                        <span class="material-symbols-outlined" style="font-size:13px;">open_in_new</span> 처리
                    </button>
                </td>
            </tr>`;
        }).join('');
        return `
        <div class="card" style="border:2px solid #fca5a5;margin-bottom:16px;">
            <div class="card-header" style="background:rgba(220,38,38,.05);border-bottom:1px solid #fca5a5;
                display:flex;align-items:center;justify-content:space-between;padding:12px 18px;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span class="material-symbols-outlined" style="color:#dc2626;">pending_actions</span>
                    <span style="font-weight:700;color:#dc2626;font-size:14px;">사출 성적서 미접수</span>
                    <span style="background:#dc2626;color:#fff;border-radius:12px;padding:1px 10px;font-size:11px;font-weight:700;">${pending.length}건</span>
                </div>
                <span style="font-size:12px;color:var(--text-muted);">사출 입고 메뉴에서 접수 완료 처리하세요</span>
            </div>
            <div class="card-body" style="padding:0;">
                <div class="data-table-wrapper">
                    <table class="data-table" style="font-size:12px;">
                        <thead><tr>
                            <th>검사일자</th><th>차종</th><th>품명</th>
                            <th>미접수 LOT</th><th>입고수량</th><th>사출처</th>
                            <th>경과일</th><th style="text-align:center;">처리</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        </div>`;
    }

    // ── 도료 성적서 미접수 ────────────────────────────────────────────
    function _paintCertPendingHtml(pending) {
        if (!pending.length) return '';
        const rows = pending.slice(0, 20).map(d => {
            const daysDiff = Math.floor((new Date() - new Date(d.date)) / 86400000);
            const certStatus = d.certCheck || '접수대기';
            return `<tr style="background:rgba(168,85,247,.03);">
                <td>${d.date}</td>
                <td>${d.supplier || '-'}</td>
                <td>${d.paintName || '-'}</td>
                <td style="text-align:right;">${_fmt(d.incomingQty)}</td>
                <td style="text-align:center;">${_badge(certStatus, certStatus === '접수대기' ? 'warning' : 'muted')}</td>
                <td style="text-align:center;">${_badge(daysDiff + '일 경과', daysDiff > 14 ? 'danger' : 'warning')}</td>
                <td style="text-align:center;">
                    <button class="btn btn-sm" style="font-size:11px;border:1px solid #a855f7;color:#a855f7;background:transparent;"
                        onclick="Router.navigate('paint-incoming-inspection')">
                        <span class="material-symbols-outlined" style="font-size:13px;">open_in_new</span> 처리
                    </button>
                </td>
            </tr>`;
        }).join('');
        return `
        <div class="card" style="border:2px solid #d8b4fe;margin-bottom:16px;">
            <div class="card-header" style="background:rgba(168,85,247,.05);border-bottom:1px solid #d8b4fe;
                display:flex;align-items:center;justify-content:space-between;padding:12px 18px;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span class="material-symbols-outlined" style="color:#a855f7;">pending_actions</span>
                    <span style="font-weight:700;color:#a855f7;font-size:14px;">도료 성적서 미접수</span>
                    <span style="background:#a855f7;color:#fff;border-radius:12px;padding:1px 10px;font-size:11px;font-weight:700;">${pending.length}건</span>
                </div>
                <span style="font-size:12px;color:var(--text-muted);">도료 입고 메뉴에서 접수 완료 처리하세요</span>
            </div>
            <div class="card-body" style="padding:0;">
                <div class="data-table-wrapper">
                    <table class="data-table" style="font-size:12px;">
                        <thead><tr>
                            <th>검사일자</th><th>구매처</th><th>원료명</th>
                            <th>입고수량</th><th>성적서상태</th><th>경과일</th>
                            <th style="text-align:center;">처리</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        </div>`;
    }

    // ── FIFO 위반 ─────────────────────────────────────────────────────
    function _fifoHtml(mon, fifoVio) {
        if (!fifoVio.size) return '';
        const vioRecords = mon.filter(d => fifoVio.has(d.id));
        const rows = vioRecords.map(d => {
            const lots = (d.lots && d.lots.length > 0)
                ? d.lots : (d.lotNo ? [{ lotNo: d.lotNo }] : []);
            return `<tr style="background:#fff7ed;">
                <td>${d.date}</td>
                <td>${d.carModel || '-'}</td>
                <td>${d.partName || '-'}</td>
                <td>${lots.map(l => `<span style="font-family:monospace;font-weight:600;font-size:12px;">${l.lotNo||'-'}</span>`).join(' ')}</td>
                <td style="text-align:right;">${_fmt(d.incomingQty)}</td>
                <td>${d.supplierName || '-'}</td>
            </tr>`;
        }).join('');
        return `
        <div class="card" style="border:2px solid #fdba74;margin-bottom:16px;">
            <div class="card-header" style="background:#fff7ed;border-bottom:1px solid #fdba74;
                display:flex;align-items:center;gap:8px;padding:12px 18px;">
                <span class="material-symbols-outlined" style="color:#ea580c;">swap_vert</span>
                <span style="font-weight:700;color:#ea580c;font-size:14px;">FIFO 위반 (이번달)</span>
                <span style="background:#ea580c;color:#fff;border-radius:12px;padding:1px 10px;font-size:11px;font-weight:700;">${fifoVio.size}건</span>
            </div>
            <div class="card-body" style="padding:0;">
                <div class="data-table-wrapper">
                    <table class="data-table" style="font-size:12px;">
                        <thead><tr><th>검사일자</th><th>차종</th><th>품명</th><th>LOT</th><th>입고수량</th><th>사출처</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        </div>`;
    }

    // ── 도료 유효기간 경고 ────────────────────────────────────────────
    function _expiryHtml(expiring, expired) {
        if (!expiring.length && !expired.length) return '';
        const allItems = [
            ...expired.map(d => ({ ...d, _status: 'expired' })),
            ...expiring.map(d => ({ ...d, _status: 'expiring' }))
        ].sort((a, b) => (a.expiryDate || '').localeCompare(b.expiryDate || ''));

        const rows = allItems.map(d => {
            const today = UIUtils.today();
            const daysLeft = Math.floor((new Date(d.expiryDate) - new Date(today)) / 86400000);
            const statusBadge = d._status === 'expired'
                ? _badge('만료', 'danger')
                : _badge(`D-${daysLeft}`, daysLeft <= 7 ? 'danger' : 'warning');
            return `<tr>
                <td>${d.date}</td>
                <td>${d.supplier || '-'}</td>
                <td>${d.paintName || '-'}</td>
                <td style="text-align:center;">${_fmt(d.incomingQty)}</td>
                <td style="text-align:center;">${d.expiryDate || '-'}</td>
                <td style="text-align:center;">${statusBadge}</td>
            </tr>`;
        }).join('');
        const total = expiring.length + expired.length;
        return `
        <div class="card" style="border:2px solid #fdba74;margin-bottom:16px;">
            <div class="card-header" style="background:#fff7ed;border-bottom:1px solid #fdba74;
                display:flex;align-items:center;gap:8px;padding:12px 18px;">
                <span class="material-symbols-outlined" style="color:#ea580c;">event_busy</span>
                <span style="font-weight:700;color:#ea580c;font-size:14px;">도료 유효기간 주의</span>
                <span style="background:#ea580c;color:#fff;border-radius:12px;padding:1px 10px;font-size:11px;font-weight:700;">${total}건</span>
                ${expired.length ? `<span style="font-size:12px;color:#dc2626;font-weight:700;">만료 ${expired.length}건 포함</span>` : ''}
            </div>
            <div class="card-body" style="padding:0;">
                <div class="data-table-wrapper">
                    <table class="data-table" style="font-size:12px;">
                        <thead><tr><th>입고일</th><th>구매처</th><th>원료명</th><th>수량</th><th>유효기간</th><th style="text-align:center;">상태</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        </div>`;
    }

    // ── 차종별 현황 테이블 ────────────────────────────────────────────
    function _carModelTableHtml(byCarModel, period) {
        const entries = Object.entries(byCarModel).sort((a, b) => b[1].count - a[1].count);
        if (!entries.length) return '';
        const rows = entries.map(([car, v]) => {
            const rate = v.count > 0 ? Math.round((1 - v.fail / v.count) * 100) : 100;
            return `<tr>
                <td style="font-weight:700;">${car}</td>
                <td style="text-align:center;">${v.count}</td>
                <td style="text-align:right;">${_fmt(v.qty)}</td>
                <td style="text-align:center;">${v.fail > 0 ? _badge(v.fail + '건', 'danger') : _badge('0건', 'success')}</td>
                <td style="text-align:center;">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <div style="flex:1;height:6px;border-radius:3px;background:var(--bg-secondary);overflow:hidden;">
                            <div style="height:100%;width:${rate}%;background:${rate === 100 ? '#4ade80' : rate >= 90 ? '#fbbf24' : '#f87171'};border-radius:3px;transition:width .3s;"></div>
                        </div>
                        <span style="font-size:11px;font-weight:700;color:${rate === 100 ? '#16a34a' : rate >= 90 ? '#d97706' : '#dc2626'};">${rate}%</span>
                    </div>
                </td>
            </tr>`;
        }).join('');
        return `
        <div class="card" style="margin-bottom:16px;">
            <div class="card-header" style="display:flex;align-items:center;gap:8px;padding:12px 18px;">
                <span class="material-symbols-outlined" style="color:var(--accent-blue);font-size:18px;">directions_car</span>
                <span style="font-weight:700;font-size:14px;">사출 — 차종별 수입검사 현황 (${period.label})</span>
            </div>
            <div class="card-body" style="padding:0;">
                <div class="data-table-wrapper">
                    <table class="data-table" style="font-size:12px;">
                        <thead><tr>
                            <th>차종</th><th style="text-align:center;">검사건수</th>
                            <th style="text-align:right;">입고수량</th>
                            <th style="text-align:center;">불합격</th>
                            <th style="min-width:140px;">합격률</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        </div>`;
    }

    // ── 최근 사출 검사 이력 ───────────────────────────────────────────
    function _recentInjHtml(mon) {
        const recent = [...mon].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 12);
        if (!recent.length) return '';
        const rows = recent.map(d => {
            const verdict   = (Number(d.failQty) || 0) === 0 ? 'success' : 'danger';
            const vTxt      = (Number(d.failQty) || 0) === 0 ? '합격' : '불합격';
            const lots      = (d.lots && d.lots.length > 0)
                ? d.lots : (d.lotNo ? [{ lotNo: d.lotNo, certReceived: d.certReceived || false }] : []);
            const certOk    = lots.every(l => l.certReceived);
            return `<tr>
                <td>${d.date}</td>
                <td style="font-weight:700;">${d.carModel || '-'}</td>
                <td>${d.partName || '-'}</td>
                <td style="text-align:right;">${_fmt(d.incomingQty)}</td>
                <td style="text-align:center;">${_badge(vTxt, verdict)}</td>
                <td style="text-align:center;">${certOk ? _badge('접수완료','success') : _badge('미접수','danger')}</td>
            </tr>`;
        }).join('');
        return `
        <div class="card" style="margin-bottom:16px;">
            <div class="card-header" style="display:flex;align-items:center;gap:8px;padding:12px 18px;">
                <span class="material-symbols-outlined" style="color:var(--accent-blue);font-size:18px;">history</span>
                <span style="font-weight:700;font-size:14px;">사출 최근 검사 이력 (이번달 최근 12건)</span>
            </div>
            <div class="card-body" style="padding:0;">
                <div class="data-table-wrapper">
                    <table class="data-table" style="font-size:12px;">
                        <thead><tr>
                            <th>검사일자</th><th>차종</th><th>품명</th>
                            <th style="text-align:right;">입고수량</th>
                            <th style="text-align:center;">판정</th>
                            <th style="text-align:center;">성적서</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        </div>`;
    }

    return { init: render, render };
})();
