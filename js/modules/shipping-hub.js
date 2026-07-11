/**
 * 출하검사 허브 (공유 소메뉴 UI + 대시보드 + 신뢰성/표준서/기준서 페이지)
 * IncomingUI / LaserProcessUI 패턴
 */

/* ══════════════════════════════════════════════════════════════
   공유 소메뉴 UI
══════════════════════════════════════════════════════════════ */
var ShippingUI = (function () {
    const MENUS = [
        { id: 'shipping-overview',    label: '출하검사 현황',   icon: 'dashboard',     desc: '출하검사 전반을 한 화면에서 관리합니다.' },
        { id: 'shipping-standby',     label: '출하 일상 검사',  icon: 'verified',      desc: '출하 대기품 일상 검사 등록 및 이력' },
        { id: 'shipping-reliability', label: '출하 신뢰성',     icon: 'science',       desc: '출하 신뢰성 시험 기록 관리' },
        { id: 'shipping-certificate', label: '출하성적서 발행', icon: 'description',   desc: '금일 출하 계획품 성적서 작성·발행' },
        { id: 'shipping-standard',    label: '출하검사 기준서', icon: 'fact_check',    desc: '품목별 출하검사 기준서 등록·편집·출력' },
        { id: 'shipping-std-photo',   label: '출하검사 표준서', icon: 'photo_library', desc: '차종·품명별 출하검사 기준 사진 및 표준서 관리' },
    ];
    const MAIN_MENU_IDS = ['shipping-overview', 'shipping-standby', 'shipping-reliability', 'shipping-certificate'];
    const DOC_MENU_IDS = ['shipping-standard', 'shipping-std-photo'];

    function _menuButton(menu, activePage) {
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
    }

    function renderSection(activePage) {
        const mainMenus = MENUS.filter(m => MAIN_MENU_IDS.includes(m.id));
        const docMenus = MENUS.filter(m => DOC_MENU_IDS.includes(m.id));
        return `
            <div class="mes-apple-menu-hero" style="padding:16px 20px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
                    ${mainMenus.map(m => _menuButton(m, activePage)).join('')}
                </div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-left:auto;">
                    ${docMenus.map(m => _menuButton(m, activePage)).join('')}
                </div>
            </div>`;
    }

    /* 공용 홈 카드 (허브 바로가기) */
    function homeCard(title, desc, icon, countText, onClick, tone) {
        const COLORS = { blue: '#3b82f6', green: '#10b981', purple: '#8b5cf6', orange: '#f97316', red: '#ef4444', cyan: '#06b6d4' };
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

    function metricCard(tone, value, label, subLabel) {
        return `
            <div class="stat-card ${tone}">
                <div class="stat-card-value">${typeof value === 'number' ? value.toLocaleString() : value}</div>
                <div class="stat-card-label">${label}</div>
                ${subLabel ? `<div style="margin-top:4px;font-size:.76rem;color:var(--text-muted);">${subLabel}</div>` : ''}
            </div>`;
    }

    return { renderSection, homeCard, metricCard };
})();

/* ══════════════════════════════════════════════════════════════
   출하검사 허브 메인 (대시보드)
══════════════════════════════════════════════════════════════ */
var ShippingOverviewModule = (function () {
    function init() {}

    function render(container) {
        const now = new Date();
        const monthStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
        const monthLabel = now.getFullYear() + '년 ' + String(now.getMonth() + 1).padStart(2, '0') + '월';

        const insp = (Storage.getAll(DB.STORES.SHIPPING_INSPECTIONS) || []).filter(d => (d.date || '').startsWith(monthStr));
        const standby = Storage.getAll(DB.STORES.SHIPPING_STANDBY) || [];
        const products = (Storage.getAll(DB.STORES.PRODUCTS) || []).filter(p => p.carModel || p.partName);

        container.innerHTML = `
        <div class="fade-in-up">
            ${ShippingUI.renderSection('shipping-overview')}
            <div class="section-card" style="padding:0;overflow:hidden;">
                <div style="padding:24px;">
                    <div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">
                        ${monthLabel} 출하검사 현황
                    </div>
                    <div id="shipHubStats" class="stat-cards" style="margin-bottom:24px;"></div>
                    <div id="shipHubCards" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;"></div>
                </div>
            </div>
        </div>`;

        const statsEl = document.getElementById('shipHubStats');
        if (statsEl) {
            statsEl.innerHTML = [
                ShippingUI.metricCard('blue', insp.length, '이달 출하검사', '검사 이력'),
                ShippingUI.metricCard(standby.length > 0 ? 'orange' : 'green', standby.length, '검사 대기', '출하 대기품'),
                ShippingUI.metricCard('purple', products.length, '제품 품목', '기준서 대상'),
                ShippingUI.metricCard('cyan', '-', '기준서 등록', '로딩 중'),
                ShippingUI.metricCard('green', '-', '신뢰성 기록', '로딩 중')
            ].join('');
        }

        const cardsEl = document.getElementById('shipHubCards');
        if (cardsEl) {
            cardsEl.innerHTML = [
                ShippingUI.homeCard('출하 일상 검사', '출하 대기품 일상 검사 등록 및 이력 관리', 'verified', `대기 ${standby.length}건`, "Router.navigate('shipping-standby')", 'blue'),
                ShippingUI.homeCard('출하 신뢰성', '출하 신뢰성 시험 기록을 등록·관리합니다.', 'science', '-', "Router.navigate('shipping-reliability')", 'green'),
                ShippingUI.homeCard('출하성적서 발행', '금일 출하 계획품 성적서 작성·발행', 'description', '-', "Router.navigate('shipping-certificate')", 'cyan'),
                ShippingUI.homeCard('출하검사 기준서', '품목별 출하검사 기준서 등록·편집·출력', 'fact_check', '-', "Router.navigate('shipping-standard')", 'purple'),
                ShippingUI.homeCard('출하검사 표준서', '차종·품명별 출하검사 기준 사진 및 표준서 관리', 'photo_library', '-', "Router.navigate('shipping-std-photo')", 'orange')
            ].join('');
        }

        // config 기반 카운트 비동기 채움
        (async () => {
            try {
                const stds = (await Storage.getConfigValue('shipping_inspection_standards_v1').catch(() => ({}))) || {};
                const relis = (await Storage.getConfigValue('shipping_reliability_records_v1').catch(() => ([]))) || [];
                const stdCount = Object.keys(stds).length;
                const reliCount = Array.isArray(relis) ? relis.length : 0;
                const st = document.getElementById('shipHubStats');
                if (st) {
                    const cards = st.querySelectorAll('.stat-card');
                    if (cards[3]) {
                        cards[3].querySelector('.stat-card-value').textContent = stdCount.toLocaleString();
                        const sub = cards[3].querySelector('div[style]'); if (sub) sub.textContent = `미등록 ${Math.max(0, products.length - stdCount)}종`;
                    }
                    if (cards[4]) {
                        cards[4].querySelector('.stat-card-value').textContent = reliCount.toLocaleString();
                        const sub = cards[4].querySelector('div[style]'); if (sub) sub.textContent = '누적';
                    }
                }
            } catch (e) { /* 무시 */ }
        })();
    }

    return { init, render };
})();

/* ══════════════════════════════════════════════════════════════
   출하검사 기준서 (페이지 — 목록 인라인)
══════════════════════════════════════════════════════════════ */
var ShippingStandardPageModule = (function () {
    function init() {}
    function render(container) {
        container.innerHTML = `
        <div class="fade-in-up">
            ${ShippingUI.renderSection('shipping-standard')}
            <div id="shipStdPageBody"></div>
        </div>`;
        const body = document.getElementById('shipStdPageBody');
        if (body && typeof ShippingStandbyModule !== 'undefined' && ShippingStandbyModule.renderStandardListInto) {
            ShippingStandbyModule.renderStandardListInto(body);
        }
    }
    return { init, render };
})();

/* ══════════════════════════════════════════════════════════════
   출하 신뢰성
   - 출하 일상 검사(합격) 완료품을 넘겨받아 신뢰성 시험 항목을 진행
   - 항목: 색차/광택/부착력/도막두께/연필경도/내스크래치/내약품성/내크림성 ...
   - 저장: config (shipping_reliability_records_v1)
══════════════════════════════════════════════════════════════ */
var ShippingReliabilityModule = (function () {
    const CONFIG_KEY = 'shipping_reliability_records_v1';
    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    let _records = [];

    // 기본 신뢰성 시험 항목 (출하검사 기준서 신뢰성 항목 기준)
    const DEFAULT_ITEMS = [
        { item: '색차',       standard: '광원 D65/F11 적용시 색상 이상 없을 것', method: '색차계',        sample: '2EA/LOT' },
        { item: '광택',       standard: '광택계 기준값 만족',                    method: '광택계',        sample: '2EA/LOT' },
        { item: '부착력',     standard: '박리 5% 이하일 것 (CROSS CUTTING)',      method: 'X-CUTTER/TAPE', sample: '1EA/LOT' },
        { item: '도막두께',   standard: '20 ~ 40㎛',                             method: '도막두께측정기', sample: '1EA/LOT' },
        { item: '연필경도',   standard: 'B경도 CLEAR 일 것',                     method: '경도시험기',    sample: '1EA/LOT' },
        { item: '내스크래치', standard: '페인트에 갈라짐 없을 것',                method: '테스터기',      sample: '1EA/LOT' },
        { item: '내약품성',   standard: '페인트 컬러, 광택도 변화 없을 것',       method: '항온항습기',    sample: '1EA/LOT' },
        { item: '내크림성',   standard: '광택 증가는 허용하나 색상·촉감 변화 없을 것', method: '항온항습기', sample: '1EA/LOT' }
    ];

    function init() {}

    async function _load() {
        _records = (await Storage.getConfigValue(CONFIG_KEY).catch(() => ([]))) || [];
        if (!Array.isArray(_records)) _records = [];
    }
    async function _save() {
        await Storage.setConfigValue(CONFIG_KEY, _records);
    }

    function _vBadge(verdict) {
        return verdict === '합격' ? `<span class="badge badge-success">합격</span>`
            : verdict === '불합격' ? `<span class="badge badge-danger">불합격</span>`
            : `<span class="badge badge-warning">${_esc(verdict) || '진행중'}</span>`;
    }

    function render(container) {
        container.innerHTML = `
        <div class="fade-in-up">
            ${ShippingUI.renderSection('shipping-reliability')}

            <!-- ① 신뢰성 검사 대기 (일상검사 완료품 인계) -->
            <div class="card" style="margin-bottom:20px;">
                <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <h4 style="margin:0;display:flex;align-items:center;gap:6px;">
                        <span class="material-symbols-outlined" style="color:var(--accent-orange);">move_to_inbox</span>
                        신뢰성 검사 대기 <span style="font-size:0.75rem;font-weight:400;color:var(--text-muted);">(출하 일상 검사 완료품)</span>
                    </h4>
                    <button class="btn btn-outline btn-sm" onclick="ShippingReliabilityModule.openTest()">
                        <span class="material-symbols-outlined" style="font-size:16px;">add</span> 직접 등록
                    </button>
                </div>
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>검사일</th><th>차종</th><th>품명</th><th>컬러</th><th>사출 LOT</th>
                                    <th style="text-align:center;">일상검사</th>
                                    <th style="text-align:center;width:120px;">신뢰성</th>
                                </tr>
                            </thead>
                            <tbody id="shipReliPending"><tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-muted);">로딩 중...</td></tr></tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- ② 신뢰성 검사 이력 -->
            <div class="card">
                <div class="card-header">
                    <h4 style="margin:0;display:flex;align-items:center;gap:6px;">
                        <span class="material-symbols-outlined" style="color:var(--accent-green);">science</span>
                        신뢰성 검사 이력
                    </h4>
                </div>
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>시험일자</th><th>차종</th><th>품명</th><th>사출 LOT</th>
                                    <th style="text-align:center;">항목</th>
                                    <th style="text-align:center;">종합판정</th>
                                    <th>검사자</th>
                                    <th style="text-align:center;width:150px;">작업</th>
                                </tr>
                            </thead>
                            <tbody id="shipReliBody"><tr><td colspan="8" style="text-align:center;padding:24px;color:var(--text-muted);">로딩 중...</td></tr></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>`;
        _renderAll();
    }

    async function _renderAll() {
        await _load();
        _renderPending();
        _renderHistory();
    }

    // 일상검사(합격) 완료품 중 신뢰성 미실시 목록
    function _renderPending() {
        const tbody = document.getElementById('shipReliPending');
        if (!tbody) return;
        const insps = (Storage.getAll(DB.STORES.SHIPPING_INSPECTIONS) || [])
            .filter(d => (d.result || '') === '합격')
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        const doneIds = new Set(_records.map(r => r.inspectionId).filter(Boolean));
        const pending = insps.filter(d => !doneIds.has(d.id)).slice(0, 80);

        if (!pending.length) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--accent-green);">인계 대기 중인 일상검사 완료품이 없습니다.</td></tr>`;
            return;
        }
        tbody.innerHTML = pending.map(d => `
            <tr>
                <td>${_esc((d.date || '-').slice(0, 10))}</td>
                <td>${_esc(d.carModel || '-')}</td>
                <td><strong>${_esc(d.partName || '-')}</strong></td>
                <td>${_esc(d.color || '-')}</td>
                <td style="font-family:monospace;font-size:0.82rem;">${_esc(d.lotNo || d.injectionLot || '-')}</td>
                <td style="text-align:center;">${_vBadge(d.result || '합격')}</td>
                <td style="text-align:center;">
                    <button class="btn btn-sm btn-primary" onclick="ShippingReliabilityModule.openTest('','${_esc(d.id)}')">
                        <span class="material-symbols-outlined" style="font-size:14px;vertical-align:-2px;">science</span> 신뢰성 검사
                    </button>
                </td>
            </tr>`).join('');
    }

    function _renderHistory() {
        const tbody = document.getElementById('shipReliBody');
        if (!tbody) return;
        const rows = _records.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted);">등록된 신뢰성 시험 이력이 없습니다.</td></tr>`;
            return;
        }
        tbody.innerHTML = rows.map(r => {
            const items = Array.isArray(r.items) ? r.items : [];
            const failCnt = items.filter(it => it.judge === '불합격').length;
            return `<tr>
                <td>${_esc(r.date || '-')}</td>
                <td>${_esc(r.carModel || '-')}</td>
                <td><strong>${_esc(r.partName || '-')}</strong></td>
                <td style="font-family:monospace;font-size:0.82rem;">${_esc(r.lotNo || '-')}</td>
                <td style="text-align:center;">${items.length}${failCnt ? ` <span style="color:var(--accent-red);font-size:0.78rem;">(불량 ${failCnt})</span>` : ''}</td>
                <td style="text-align:center;">${_vBadge(r.verdict)}</td>
                <td>${_esc(r.inspector || '-')}</td>
                <td style="text-align:center;white-space:nowrap;">
                    <button class="btn btn-sm btn-primary" onclick="ShippingReliabilityModule.viewTest('${r.id}')">보기</button>
                    <button class="btn btn-sm btn-outline" onclick="ShippingReliabilityModule.openTest('${r.id}')">수정</button>
                    <button class="btn btn-sm btn-danger" onclick="ShippingReliabilityModule.remove('${r.id}')">삭제</button>
                </td>
            </tr>`;
        }).join('');
    }

    function _itemRowHtml(it) {
        it = it || {};
        const opt = v => `<option value="${v}" ${(it.judge || '') === v ? 'selected' : ''}>${v || '-'}</option>`;
        return `<tr>
            <td style="padding:3px;"><input class="reli-item form-input" style="font-size:0.82rem;padding:4px 6px;" value="${_esc(it.item || '')}" placeholder="항목"></td>
            <td style="padding:3px;"><input class="reli-std form-input" style="font-size:0.82rem;padding:4px 6px;" value="${_esc(it.standard || '')}" placeholder="기준"></td>
            <td style="padding:3px;"><input class="reli-method form-input" style="font-size:0.82rem;padding:4px 6px;" value="${_esc(it.method || '')}" placeholder="확인방법"></td>
            <td style="padding:3px;"><input class="reli-sample form-input" style="font-size:0.82rem;padding:4px 6px;width:90px;" value="${_esc(it.sample || '')}" placeholder="시료"></td>
            <td style="padding:3px;"><input class="reli-result form-input" style="font-size:0.82rem;padding:4px 6px;" value="${_esc(it.resultValue || '')}" placeholder="측정/결과"></td>
            <td style="padding:3px;text-align:center;">
                <select class="reli-judge form-select" style="font-size:0.82rem;padding:4px 6px;width:88px;">
                    ${opt('')}${opt('합격')}${opt('불합격')}${opt('N/A')}
                </select>
            </td>
            <td style="padding:3px;text-align:center;">
                <button type="button" class="btn btn-sm btn-danger" style="padding:2px 6px;" onclick="this.closest('tr').remove()">×</button>
            </td>
        </tr>`;
    }

    // id: 기존 신뢰성 기록 수정 / inspId: 일상검사 인계
    function openTest(id, inspId) {
        const rec = id ? _records.find(r => r.id === id) : null;
        let head = { date: UIUtils.today(), carModel: '', partName: '', color: '', lotNo: '', inspector: '' };
        let items = DEFAULT_ITEMS.map(x => ({ ...x }));

        if (rec) {
            head = { date: rec.date || UIUtils.today(), carModel: rec.carModel || '', partName: rec.partName || '', color: rec.color || '', lotNo: rec.lotNo || '', inspector: rec.inspector || '' };
            if (Array.isArray(rec.items) && rec.items.length) items = rec.items.map(x => ({ ...x }));
        } else if (inspId) {
            const insp = Storage.getById(DB.STORES.SHIPPING_INSPECTIONS, inspId);
            if (insp) head = { date: UIUtils.today(), carModel: insp.carModel || '', partName: insp.partName || '', color: insp.color || '', lotNo: insp.lotNo || insp.injectionLot || '', inspector: insp.inspector || '' };
        }

        const g = k => _esc(head[k] || '');
        UIUtils.showModal(rec ? '신뢰성 시험 수정' : '신뢰성 시험 등록', `
            <input type="hidden" id="reliInspId" value="${_esc(inspId || (rec && rec.inspectionId) || '')}">
            <div class="form-row">
                <div class="form-group"><label class="form-label">시험일자 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="reliDate" value="${g('date')}"></div>
                <div class="form-group"><label class="form-label">검사자</label>
                    <input class="form-input" id="reliInspector" value="${g('inspector')}" placeholder="검사자"></div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">차종</label><input class="form-input" id="reliCarModel" value="${g('carModel')}" placeholder="차종"></div>
                <div class="form-group"><label class="form-label">품명</label><input class="form-input" id="reliPartName" value="${g('partName')}" placeholder="품명"></div>
                <div class="form-group"><label class="form-label">컬러</label><input class="form-input" id="reliColor" value="${g('color')}" placeholder="컬러"></div>
                <div class="form-group"><label class="form-label">사출 LOT</label><input class="form-input" id="reliLotNo" value="${g('lotNo')}" placeholder="LOT"></div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin:12px 0 6px;">
                <label class="form-label" style="margin:0;">신뢰성 시험 항목</label>
                <button type="button" class="btn btn-sm btn-outline" onclick="ShippingReliabilityModule.addItemRow()">
                    <span class="material-symbols-outlined" style="font-size:14px;">add</span> 항목 추가
                </button>
            </div>
            <div style="overflow-x:auto;border:1px solid var(--border-color);border-radius:8px;">
                <table class="data-table" style="margin:0;">
                    <thead><tr>
                        <th style="width:90px;">항목</th><th>기준</th><th style="width:120px;">확인방법</th>
                        <th style="width:100px;">시료</th><th style="width:130px;">측정/결과</th>
                        <th style="width:100px;text-align:center;">판정</th><th style="width:40px;"></th>
                    </tr></thead>
                    <tbody id="reliItemsBody">${items.map(_itemRowHtml).join('')}</tbody>
                </table>
            </div>
            <div class="form-row" style="margin-top:12px;">
                <div class="form-group"><label class="form-label">종합 판정 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="reliVerdict">
                        <option value="진행중" ${rec && rec.verdict === '진행중' ? 'selected' : ''}>진행중</option>
                        <option value="합격" ${rec && rec.verdict === '합격' ? 'selected' : ''}>합격</option>
                        <option value="불합격" ${rec && rec.verdict === '불합격' ? 'selected' : ''}>불합격</option>
                    </select></div>
                <div class="form-group" style="flex:2;"><label class="form-label">비고</label>
                    <input class="form-input" id="reliNote" value="${rec ? _esc(rec.note || '') : ''}" placeholder="비고"></div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="ShippingReliabilityModule.saveTest('${id || ''}')">저장</button>
        `, 'xl');
    }

    function addItemRow() {
        const tb = document.getElementById('reliItemsBody');
        if (!tb) return;
        const tr = document.createElement('tr');
        tr.innerHTML = _itemRowHtml({});
        tb.appendChild(tr);
    }

    async function saveTest(id) {
        const g = elId => (document.getElementById(elId) || {}).value || '';
        const date = g('reliDate').trim();
        if (!date) { UIUtils.toast('시험일자를 입력하세요.', 'warning'); return; }

        const items = [];
        document.querySelectorAll('#reliItemsBody tr').forEach(tr => {
            const item = (tr.querySelector('.reli-item') || {}).value || '';
            const standard = (tr.querySelector('.reli-std') || {}).value || '';
            const method = (tr.querySelector('.reli-method') || {}).value || '';
            const sample = (tr.querySelector('.reli-sample') || {}).value || '';
            const resultValue = (tr.querySelector('.reli-result') || {}).value || '';
            const judge = (tr.querySelector('.reli-judge') || {}).value || '';
            if (item || standard || resultValue) items.push({ item, standard, method, sample, resultValue, judge });
        });
        if (!items.length) { UIUtils.toast('시험 항목을 1개 이상 입력하세요.', 'warning'); return; }

        await _load();
        const payload = {
            inspectionId: g('reliInspId') || '',
            date,
            inspector: g('reliInspector').trim(),
            carModel: g('reliCarModel').trim(),
            partName: g('reliPartName').trim(),
            color: g('reliColor').trim(),
            lotNo: g('reliLotNo').trim(),
            items,
            verdict: g('reliVerdict') || '진행중',
            note: g('reliNote').trim(),
            updatedAt: new Date().toISOString()
        };
        if (id) {
            const idx = _records.findIndex(r => r.id === id);
            if (idx >= 0) _records[idx] = { ..._records[idx], ...payload };
        } else {
            payload.id = 'reli_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
            payload.createdAt = new Date().toISOString();
            _records.push(payload);
        }
        await _save();
        UIUtils.toast('신뢰성 시험이 저장되었습니다.', 'success');
        UIUtils.closeModal();
        _renderAll();
    }

    function viewTest(id) {
        const r = _records.find(x => x.id === id);
        if (!r) { UIUtils.toast('기록을 찾을 수 없습니다.', 'error'); return; }
        const itemRows = (r.items || []).map((it, i) => `<tr>
            <td style="text-align:center;">${i + 1}</td>
            <td><strong>${_esc(it.item || '-')}</strong></td>
            <td>${_esc(it.standard || '-')}</td>
            <td style="text-align:center;">${_esc(it.method || '-')}</td>
            <td style="text-align:center;">${_esc(it.sample || '-')}</td>
            <td>${_esc(it.resultValue || '-')}</td>
            <td style="text-align:center;">${it.judge ? _vBadge(it.judge) : '-'}</td>
        </tr>`).join('');
        UIUtils.showModal('신뢰성 시험 결과', `
            <div style="display:flex;flex-wrap:wrap;gap:8px 18px;margin-bottom:14px;padding:10px 14px;background:var(--bg-secondary);border-radius:8px;font-size:0.85rem;">
                <span>시험일: <strong>${_esc(r.date || '-')}</strong></span>
                <span>차종: <strong>${_esc(r.carModel || '-')}</strong></span>
                <span>품명: <strong>${_esc(r.partName || '-')}</strong></span>
                <span>컬러: <strong>${_esc(r.color || '-')}</strong></span>
                <span>LOT: <strong style="font-family:monospace;">${_esc(r.lotNo || '-')}</strong></span>
                <span>검사자: <strong>${_esc(r.inspector || '-')}</strong></span>
                <span>종합판정: ${_vBadge(r.verdict)}</span>
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table">
                    <thead><tr><th>No</th><th>항목</th><th>기준</th><th style="text-align:center;">확인방법</th><th style="text-align:center;">시료</th><th>측정/결과</th><th style="text-align:center;">판정</th></tr></thead>
                    <tbody>${itemRows || `<tr><td colspan="7" style="text-align:center;padding:16px;color:var(--text-muted);">항목 없음</td></tr>`}</tbody>
                </table>
            </div>
            ${r.note ? `<div style="margin-top:12px;font-size:0.85rem;"><strong>비고:</strong> ${_esc(r.note)}</div>` : ''}
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>
            <button class="btn btn-primary" onclick="UIUtils.closeModal();ShippingReliabilityModule.openTest('${r.id}')">수정</button>
        `, 'xl');
    }

    function remove(id) {
        UIUtils.confirm('이 신뢰성 시험 기록을 삭제하시겠습니까?', async () => {
            await _load();
            _records = _records.filter(r => r.id !== id);
            await _save();
            UIUtils.toast('삭제되었습니다.', 'success');
            _renderAll();
        });
    }

    return { init, render, openTest, addItemRow, saveTest, viewTest, remove };
})();

/* ══════════════════════════════════════════════════════════════
   출하성적서 발행
   - 영업관리 > 납품 출하(금일) 목록 기반
   - 출하 일상검사(합격) + 출하 신뢰성(합격) 완료품만 발행 가능
   - 저장: config (shipping_certificates_v1)
══════════════════════════════════════════════════════════════ */
var ShippingCertificateModule = (function () {
    const SHIPMENT_KEY = 'sales_today_shipment_v1';
    const RELI_KEY = 'shipping_reliability_records_v1';
    const CERT_KEY = 'shipping_certificates_v1';
    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    let _certs = [];
    let _reliRecords = [];

    function _norm(v) { return String(v || '').trim(); }

    function _productMatch(rec, car, part, color) {
        if (_norm(rec.carModel) !== _norm(car)) return false;
        if (_norm(rec.partName) !== _norm(part)) return false;
        const rc = _norm(rec.color);
        const tc = _norm(color);
        if (tc && rc && rc !== tc) return false;
        return true;
    }

    function _badge(ok, okText, ngText) {
        return ok
            ? `<span class="badge badge-success">${okText}</span>`
            : `<span class="badge badge-warning">${ngText}</span>`;
    }

    async function _loadShipments(date) {
        const rows = (await Storage.getConfigValue(SHIPMENT_KEY).catch(() => ([]))) || [];
        if (!Array.isArray(rows)) return [];
        return rows.filter(r => (r.date || '') === date)
            .sort((a, b) => (a.customer || '').localeCompare(b.customer || '', 'ko') || (a.carModel || '').localeCompare(b.carModel || '', 'ko'));
    }

    async function _loadCerts() {
        _certs = (await Storage.getConfigValue(CERT_KEY).catch(() => ([]))) || [];
        if (!Array.isArray(_certs)) _certs = [];
    }

    async function _loadReli() {
        _reliRecords = (await Storage.getConfigValue(RELI_KEY).catch(() => ([]))) || [];
        if (!Array.isArray(_reliRecords)) _reliRecords = [];
    }

    async function _saveCerts() {
        await Storage.setConfigValue(CERT_KEY, _certs);
    }

    function _findDailyPass(car, part, color) {
        const rows = (Storage.getAll(DB.STORES.SHIPPING_INSPECTIONS) || [])
            .filter(d => (d.result || '') === '합격' && _productMatch(d, car, part, color))
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        return rows[0] || null;
    }

    function _findReliPass(car, part, color) {
        const rows = _reliRecords
            .filter(d => (d.verdict || '') === '합격' && _productMatch(d, car, part, color))
            .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        return rows[0] || null;
    }

    function _certForShipment(shipmentId) {
        return _certs.find(c => c.shipmentId === shipmentId) || null;
    }

    function _buildRowStatus(row) {
        const daily = _findDailyPass(row.carModel, row.partName, row.color);
        const reli = _findReliPass(row.carModel, row.partName, row.color);
        const cert = _certForShipment(row.id);
        const eligible = !!(daily && reli);
        return { daily, reli, cert, eligible };
    }

    function init() {}

    function render(container) {
        container.innerHTML = `
        <div class="fade-in-up">
            ${ShippingUI.renderSection('shipping-certificate')}
            <div class="card" style="margin-bottom:16px;">
                <div class="card-body" style="padding:12px 16px;font-size:0.85rem;color:var(--text-secondary);line-height:1.55;">
                    <strong style="color:var(--text-primary);">발행 조건</strong><br>
                    영업관리 &gt; <strong>납품 출하(금일)</strong> 목록을 기준으로 하며,
                    <strong>출하 일상검사(합격)</strong>와 <strong>출하 신뢰성(합격)</strong>이 모두 완료된 품목만 성적서 작성·발행할 수 있습니다.
                </div>
            </div>
            <div class="card">
                <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
                    <h4 style="margin:0;display:flex;align-items:center;gap:6px;">
                        <span class="material-symbols-outlined" style="color:var(--accent-cyan,#06b6d4);">description</span>
                        금일 출하 계획품
                        <span style="font-size:0.75rem;font-weight:400;color:var(--text-muted);">납품 출하(금일) 연동</span>
                    </h4>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <label class="form-label" style="margin:0;">출하일자</label>
                        <input type="date" class="form-input" id="scFilterDate" value="${UIUtils.today()}" style="width:150px;" onchange="ShippingCertificateModule.renderList()">
                        <button class="btn btn-outline btn-sm" onclick="ShippingCertificateModule.renderList()">
                            <span class="material-symbols-outlined" style="font-size:16px;">refresh</span> 새로고침
                        </button>
                    </div>
                </div>
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>출하일자</th><th>납품처</th><th>차종</th><th>품명</th><th>컬러</th>
                                    <th style="text-align:right;">수량</th>
                                    <th style="text-align:center;">일상검사</th>
                                    <th style="text-align:center;">신뢰성</th>
                                    <th style="text-align:center;">성적서</th>
                                    <th style="text-align:center;width:170px;">작업</th>
                                </tr>
                            </thead>
                            <tbody id="scBody"><tr><td colspan="10" style="text-align:center;padding:28px;color:var(--text-muted);">로딩 중...</td></tr></tbody>
                        </table>
                    </div>
                </div>
            </div>
            <div class="card" style="margin-top:20px;">
                <div class="card-header">
                    <h4 style="margin:0;display:flex;align-items:center;gap:6px;">
                        <span class="material-symbols-outlined" style="color:var(--accent-green);">history</span>
                        성적서 발행 이력
                    </h4>
                </div>
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>발행일</th><th>출하일</th><th>납품처</th><th>차종</th><th>품명</th><th>컬러</th>
                                    <th style="text-align:right;">수량</th><th>검사자</th>
                                    <th style="text-align:center;width:150px;">작업</th>
                                </tr>
                            </thead>
                            <tbody id="scHistBody"><tr><td colspan="9" style="text-align:center;padding:24px;color:var(--text-muted);">로딩 중...</td></tr></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>`;
        renderList();
    }

    async function renderList() {
        await _loadCerts();
        await _loadReli();
        const dateEl = document.getElementById('scFilterDate');
        const date = dateEl && dateEl.value ? dateEl.value : UIUtils.today();
        const rows = await _loadShipments(date);
        const tbody = document.getElementById('scBody');
        const histBody = document.getElementById('scHistBody');

        if (tbody) {
            if (!rows.length) {
                tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text-muted);">${_esc(date)} 출하 계획품이 없습니다.<br><span style="font-size:0.82rem;">영업관리 &gt; 납품 출하(금일)에서 등록하세요.</span></td></tr>`;
            } else {
                tbody.innerHTML = rows.map(r => {
                    const st = _buildRowStatus(r);
                    const certLabel = st.cert ? '발행완료' : '미발행';
                    const certBadge = st.cert ? 'badge-success' : 'badge-secondary';
                    let action = '';
                    if (st.eligible) {
                        if (st.cert) {
                            action = `
                                <button class="btn btn-sm btn-outline" onclick="ShippingCertificateModule.viewCert('${r.id}')">보기</button>
                                <button class="btn btn-sm btn-primary" onclick="ShippingCertificateModule.printCert('${st.cert.id}')" style="margin-left:4px;">출력</button>`;
                        } else {
                            action = `<button class="btn btn-sm btn-primary" onclick="ShippingCertificateModule.openIssue('${r.id}')">
                                <span class="material-symbols-outlined" style="font-size:14px;vertical-align:-2px;">edit_document</span> 성적서 작성
                            </button>`;
                        }
                    } else {
                        const miss = [];
                        if (!st.daily) miss.push('일상검사');
                        if (!st.reli) miss.push('신뢰성');
                        action = `<span style="font-size:0.78rem;color:var(--text-muted);">${miss.join('·')} 미완료</span>`;
                    }
                    return `<tr>
                        <td>${_esc(r.date || '-')}</td>
                        <td>${_esc(r.customer || '-')}</td>
                        <td>${_esc(r.carModel || '-')}</td>
                        <td><strong>${_esc(r.partName || '-')}</strong></td>
                        <td>${_esc(r.color || '-')}</td>
                        <td style="text-align:right;font-weight:600;">${UIUtils.formatNumber(Number(r.qty) || 0)}</td>
                        <td style="text-align:center;">${_badge(!!st.daily, '합격', '미완료')}</td>
                        <td style="text-align:center;">${_badge(!!st.reli, '합격', '미완료')}</td>
                        <td style="text-align:center;"><span class="badge ${certBadge}">${certLabel}</span></td>
                        <td style="text-align:center;white-space:nowrap;">${action}</td>
                    </tr>`;
                }).join('');
            }
        }

        if (histBody) {
            const hist = _certs.slice().sort((a, b) => (b.issueDate || b.date || '').localeCompare(a.issueDate || a.date || ''));
            if (!hist.length) {
                histBody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:32px;color:var(--text-muted);">발행된 성적서가 없습니다.</td></tr>`;
            } else {
                histBody.innerHTML = hist.map(c => `
                    <tr>
                        <td>${_esc((c.issueDate || c.date || '-').slice(0, 10))}</td>
                        <td>${_esc(c.shipDate || '-')}</td>
                        <td>${_esc(c.customer || '-')}</td>
                        <td>${_esc(c.carModel || '-')}</td>
                        <td><strong>${_esc(c.partName || '-')}</strong></td>
                        <td>${_esc(c.color || '-')}</td>
                        <td style="text-align:right;">${UIUtils.formatNumber(Number(c.qty) || 0)}</td>
                        <td>${_esc(c.inspector || '-')}</td>
                        <td style="text-align:center;white-space:nowrap;">
                            <button class="btn btn-sm btn-outline" onclick="ShippingCertificateModule.viewCertById('${c.id}')">보기</button>
                            <button class="btn btn-sm btn-primary" onclick="ShippingCertificateModule.printCert('${c.id}')" style="margin-left:4px;">출력</button>
                        </td>
                    </tr>`).join('');
            }
        }
    }

    async function _getShipment(shipmentId) {
        const rows = (await Storage.getConfigValue(SHIPMENT_KEY).catch(() => ([]))) || [];
        return (Array.isArray(rows) ? rows : []).find(r => r.id === shipmentId) || null;
    }

    async function openIssue(shipmentId) {
        const row = await _getShipment(shipmentId);
        if (!row) { UIUtils.toast('출하 계획품을 찾을 수 없습니다.', 'error'); return; }
        await _loadReli();
        const st = _buildRowStatus(row);
        if (!st.eligible) {
            UIUtils.toast('일상검사·신뢰성 검사가 모두 합격인 품목만 성적서를 발행할 수 있습니다.', 'warning');
            return;
        }
        if (st.cert) {
            UIUtils.toast('이미 성적서가 발행되었습니다.', 'info');
            viewCert(shipmentId);
            return;
        }

        const daily = st.daily;
        const reli = st.reli;
        UIUtils.showModal('출하검사 성적서 작성', `
            <div style="padding:10px 14px;background:var(--bg-secondary);border-radius:8px;margin-bottom:14px;font-size:0.84rem;line-height:1.6;">
                <div><strong>납품처:</strong> ${_esc(row.customer || '-')} &nbsp;|&nbsp; <strong>출하일:</strong> ${_esc(row.date || '-')}</div>
                <div><strong>품목:</strong> ${_esc(row.carModel || '')} / ${_esc(row.partName || '')} / ${_esc(row.color || '-')}</div>
                <div style="margin-top:6px;color:var(--text-muted);">
                    일상검사: ${_esc((daily.date || '').slice(0, 10))} 합격 &nbsp;|&nbsp;
                    신뢰성: ${_esc((reli.date || '').slice(0, 10))} 합격
                </div>
            </div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">발행일 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="scIssueDate" value="${UIUtils.today()}"></div>
                <div class="form-group"><label class="form-label">검사자</label>
                    <input class="form-input" id="scInspector" value="${_esc(daily.inspector || reli.inspector || '')}" placeholder="검사자"></div>
                <div class="form-group"><label class="form-label">출하 수량</label>
                    <input type="number" class="form-input" id="scQty" min="1" value="${Number(row.qty) || 0}" readonly style="background:var(--bg-secondary);"></div>
            </div>
            <div class="form-group"><label class="form-label">비고</label>
                <textarea class="form-textarea" id="scNote" rows="2" placeholder="특이사항"></textarea></div>
            <input type="hidden" id="scShipmentId" value="${_esc(shipmentId)}">
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="ShippingCertificateModule.saveIssue()">
                <span class="material-symbols-outlined">task_alt</span> 발행 저장
            </button>
        `, 'lg');
    }

    async function saveIssue() {
        const shipmentId = (document.getElementById('scShipmentId') || {}).value || '';
        const issueDate = ((document.getElementById('scIssueDate') || {}).value || '').trim();
        const inspector = ((document.getElementById('scInspector') || {}).value || '').trim();
        const note = ((document.getElementById('scNote') || {}).value || '').trim();
        if (!issueDate) { UIUtils.toast('발행일을 입력하세요.', 'warning'); return; }

        const row = await _getShipment(shipmentId);
        if (!row) { UIUtils.toast('출하 계획품을 찾을 수 없습니다.', 'error'); return; }
        await _loadReli();
        await _loadCerts();
        const st = _buildRowStatus(row);
        if (!st.eligible) { UIUtils.toast('검사 완료 조건을 만족하지 않습니다.', 'warning'); return; }
        if (st.cert) { UIUtils.toast('이미 발행된 성적서입니다.', 'info'); return; }

        const cert = {
            id: 'scert_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            shipmentId,
            issueDate,
            shipDate: row.date || '',
            customer: row.customer || '',
            carModel: row.carModel || '',
            partName: row.partName || '',
            color: row.color || '',
            qty: Number(row.qty) || 0,
            inspector,
            note,
            dailyInspId: st.daily.id || '',
            dailyInspDate: (st.daily.date || '').slice(0, 10),
            dailyLotNo: st.daily.lotNo || st.daily.injectionLot || '',
            reliId: st.reli.id || '',
            reliDate: (st.reli.date || '').slice(0, 10),
            reliLotNo: st.reli.lotNo || '',
            createdAt: new Date().toISOString()
        };
        _certs.push(cert);
        await _saveCerts();
        UIUtils.closeModal();
        UIUtils.toast('출하검사 성적서가 발행되었습니다.', 'success');
        renderList();
    }

    async function viewCert(shipmentId) {
        await _loadCerts();
        const cert = _certs.find(c => c.shipmentId === shipmentId);
        if (!cert) { UIUtils.toast('성적서를 찾을 수 없습니다.', 'info'); return; }
        _showCertModal(cert);
    }

    async function viewCertById(id) {
        await _loadCerts();
        const cert = _certs.find(c => c.id === id);
        if (!cert) { UIUtils.toast('성적서를 찾을 수 없습니다.', 'error'); return; }
        _showCertModal(cert);
    }

    function _showCertModal(cert) {
        UIUtils.showModal('출하검사 성적서', `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:0.86rem;margin-bottom:12px;">
                <div><span style="color:var(--text-muted);">발행일</span><br><strong>${_esc(cert.issueDate || '-')}</strong></div>
                <div><span style="color:var(--text-muted);">출하일</span><br><strong>${_esc(cert.shipDate || '-')}</strong></div>
                <div><span style="color:var(--text-muted);">납품처</span><br><strong>${_esc(cert.customer || '-')}</strong></div>
                <div><span style="color:var(--text-muted);">검사자</span><br><strong>${_esc(cert.inspector || '-')}</strong></div>
                <div style="grid-column:1/-1;"><span style="color:var(--text-muted);">품목</span><br>
                    <strong>${_esc(cert.carModel || '')} / ${_esc(cert.partName || '')} / ${_esc(cert.color || '-')}</strong>
                    &nbsp;·&nbsp; 수량 <strong>${UIUtils.formatNumber(Number(cert.qty) || 0)}</strong></div>
                <div><span style="color:var(--text-muted);">일상검사</span><br>${_esc(cert.dailyInspDate || '-')} 합격</div>
                <div><span style="color:var(--text-muted);">신뢰성</span><br>${_esc(cert.reliDate || '-')} 합격</div>
            </div>
            ${cert.note ? `<div style="font-size:0.84rem;padding:10px;background:var(--bg-secondary);border-radius:8px;"><strong>비고:</strong> ${_esc(cert.note)}</div>` : ''}
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>
            <button class="btn btn-primary" onclick="ShippingCertificateModule.printCert('${cert.id}')">
                <span class="material-symbols-outlined">print</span> 출력
            </button>
        `, 'lg');
    }

    async function printCert(id) {
        await _loadCerts();
        const cert = _certs.find(c => c.id === id);
        if (!cert) { UIUtils.toast('성적서를 찾을 수 없습니다.', 'error'); return; }

        const win = window.open('', '_blank', 'width=860,height=720');
        win.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
        <title>출하검사 성적서 — ${_esc(cert.partName || '')}</title>
        <style>
            @page{size:A4 portrait;margin:12mm;}
            *{box-sizing:border-box;margin:0;padding:0;}
            body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:11px;color:#111;padding:8mm;}
            h1{text-align:center;font-size:20px;letter-spacing:4px;margin:8px 0 16px;}
            table{border-collapse:collapse;width:100%;margin-bottom:10px;}
            th,td{border:1px solid #444;padding:6px 8px;vertical-align:middle;}
            th{background:#e8f0f8;text-align:center;font-weight:700;}
            .lbl{background:#f3f4f6;font-weight:700;text-align:center;width:110px;}
            .ok{text-align:center;font-weight:700;color:#15803d;}
            .foot{margin-top:18px;display:flex;justify-content:space-between;font-size:10px;color:#555;}
        </style></head><body>
        <h1>출 하 검 사 성 적 서</h1>
        <table>
            <tr><td class="lbl">발행일자</td><td>${_esc(cert.issueDate || '-')}</td><td class="lbl">출하일자</td><td>${_esc(cert.shipDate || '-')}</td></tr>
            <tr><td class="lbl">납 품 처</td><td colspan="3">${_esc(cert.customer || '-')}</td></tr>
            <tr><td class="lbl">차 종</td><td>${_esc(cert.carModel || '-')}</td><td class="lbl">컬 러</td><td>${_esc(cert.color || '-')}</td></tr>
            <tr><td class="lbl">품 명</td><td colspan="3" style="font-weight:700;font-size:13px;">${_esc(cert.partName || '-')}</td></tr>
            <tr><td class="lbl">출하수량</td><td style="font-weight:700;">${(Number(cert.qty) || 0).toLocaleString()} EA</td><td class="lbl">검 사 자</td><td>${_esc(cert.inspector || '-')}</td></tr>
        </table>
        <table>
            <tr><th colspan="4">검사 이력</th></tr>
            <tr><th>구분</th><th>검사일</th><th>LOT</th><th>판정</th></tr>
            <tr><td style="text-align:center;">출하 일상검사</td><td style="text-align:center;">${_esc(cert.dailyInspDate || '-')}</td><td style="text-align:center;font-family:monospace;">${_esc(cert.dailyLotNo || '-')}</td><td class="ok">합격</td></tr>
            <tr><td style="text-align:center;">출하 신뢰성</td><td style="text-align:center;">${_esc(cert.reliDate || '-')}</td><td style="text-align:center;font-family:monospace;">${_esc(cert.reliLotNo || '-')}</td><td class="ok">합격</td></tr>
        </table>
        <table>
            <tr><th>종합 판정</th></tr>
            <tr><td class="ok" style="padding:14px;font-size:15px;">합격 (출하 가능)</td></tr>
        </table>
        ${cert.note ? `<div style="margin-top:8px;"><strong>비고:</strong> ${_esc(cert.note)}</div>` : ''}
        <div class="foot">
            <span>(주)케이씨케미칼</span>
            <span>출하검사 성적서</span>
        </div>
        <script>window.onload=function(){window.print();}<\/script>
        </body></html>`);
        win.document.close();
    }

    return { init, render, renderList, openIssue, saveIssue, viewCert, viewCertById, printCert };
})();

/* ══════════════════════════════════════════════════════════════
   출하검사 표준서 (사진 기준 표준서 — 준비 중)
══════════════════════════════════════════════════════════════ */
var ShippingStdPhotoModule = (function () {
    function init() {}
    function render(container) {
        container.innerHTML = `
        <div class="fade-in-up">
            ${ShippingUI.renderSection('shipping-std-photo')}
            <div class="card" style="margin-top:8px;">
                <div class="card-body" style="padding:60px;text-align:center;">
                    <span class="material-symbols-outlined" style="font-size:48px;color:var(--text-muted);display:block;margin-bottom:16px;">photo_library</span>
                    <div style="font-size:1.1rem;font-weight:700;color:var(--text-primary);margin-bottom:8px;">출하검사 표준서</div>
                    <div style="color:var(--text-muted);font-size:0.9rem;">차종·품명별 출하검사 기준 사진 및 표준서 관리 — 준비 중입니다.</div>
                </div>
            </div>
        </div>`;
    }
    return { init, render };
})();
