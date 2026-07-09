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
        { id: 'shipping-standard',    label: '출하검사 기준서', icon: 'fact_check',    desc: '품목별 출하검사 기준서 등록·편집·출력' },
        { id: 'shipping-std-photo',   label: '출하검사 표준서', icon: 'photo_library', desc: '차종·품명별 출하검사 기준 사진 및 표준서 관리' },
    ];

    function renderSection(activePage) {
        return `
            <div class="mes-apple-menu-hero" style="padding:16px 20px;margin-bottom:20px;display:flex;gap:10px;flex-wrap:wrap;">
                ${MENUS.map(function (menu) {
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
   출하 신뢰성 (기본 기록 페이지 — config 기반)
══════════════════════════════════════════════════════════════ */
var ShippingReliabilityModule = (function () {
    const CONFIG_KEY = 'shipping_reliability_records_v1';
    const _esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    let _records = [];

    function init() {}

    async function _load() {
        _records = (await Storage.getConfigValue(CONFIG_KEY).catch(() => ([]))) || [];
        if (!Array.isArray(_records)) _records = [];
    }
    async function _save() {
        await Storage.setConfigValue(CONFIG_KEY, _records);
    }

    function render(container) {
        container.innerHTML = `
        <div class="fade-in-up">
            ${ShippingUI.renderSection('shipping-reliability')}
            <div class="card">
                <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
                    <h4 style="margin:0;display:flex;align-items:center;gap:6px;">
                        <span class="material-symbols-outlined" style="color:var(--accent-green);">science</span>
                        출하 신뢰성 시험 기록
                    </h4>
                    <button class="btn btn-primary btn-sm" onclick="ShippingReliabilityModule.openForm()">
                        <span class="material-symbols-outlined" style="font-size:16px;">add</span> 신뢰성 기록 등록
                    </button>
                </div>
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>시험일자</th>
                                    <th>차종</th>
                                    <th>품명</th>
                                    <th>시험항목</th>
                                    <th>시험결과</th>
                                    <th style="text-align:center;">판정</th>
                                    <th>비고</th>
                                    <th style="text-align:center;width:110px;">작업</th>
                                </tr>
                            </thead>
                            <tbody id="shipReliBody">
                                <tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted);">로딩 중...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>`;
        _renderList();
    }

    async function _renderList() {
        await _load();
        const tbody = document.getElementById('shipReliBody');
        if (!tbody) return;
        const rows = _records.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:40px;color:var(--text-muted);">등록된 신뢰성 기록이 없습니다.</td></tr>`;
            return;
        }
        tbody.innerHTML = rows.map(r => {
            const verdict = r.verdict || '';
            const vBadge = verdict === '합격'
                ? `<span class="badge badge-success">합격</span>`
                : verdict === '불합격'
                    ? `<span class="badge badge-danger">불합격</span>`
                    : `<span class="badge badge-warning">${_esc(verdict) || '-'}</span>`;
            return `<tr>
                <td>${_esc(r.date || '-')}</td>
                <td>${_esc(r.carModel || '-')}</td>
                <td><strong>${_esc(r.partName || '-')}</strong></td>
                <td>${_esc(r.testItem || '-')}</td>
                <td>${_esc(r.result || '-')}</td>
                <td style="text-align:center;">${vBadge}</td>
                <td style="color:var(--text-muted);font-size:0.85rem;">${_esc(r.note || '')}</td>
                <td style="text-align:center;white-space:nowrap;">
                    <button class="btn btn-sm btn-outline" onclick="ShippingReliabilityModule.openForm('${r.id}')">수정</button>
                    <button class="btn btn-sm btn-danger" onclick="ShippingReliabilityModule.remove('${r.id}')">삭제</button>
                </td>
            </tr>`;
        }).join('');
    }

    function openForm(id) {
        const rec = id ? _records.find(r => r.id === id) : null;
        const products = (Storage.getAll(DB.STORES.PRODUCTS) || []).filter(p => p.carModel || p.partName);
        const carList = [...new Set(products.map(p => p.carModel).filter(Boolean))].sort();
        const carOpts = carList.map(c => `<option value="${_esc(c)}" ${rec && rec.carModel === c ? 'selected' : ''}>${_esc(c)}</option>`).join('');
        const g = k => rec ? _esc(rec[k] || '') : '';

        UIUtils.showModal(rec ? '신뢰성 기록 수정' : '신뢰성 기록 등록', `
            <div class="form-row">
                <div class="form-group"><label class="form-label">시험일자 <span style="color:var(--accent-red)">*</span></label>
                    <input type="date" class="form-input" id="reliDate" value="${rec ? _esc(rec.date) : UIUtils.today()}"></div>
                <div class="form-group"><label class="form-label">차종</label>
                    <input class="form-input" id="reliCarModel" list="reliCarList" value="${g('carModel')}" placeholder="차종">
                    <datalist id="reliCarList">${carOpts}</datalist></div>
                <div class="form-group"><label class="form-label">품명</label>
                    <input class="form-input" id="reliPartName" value="${g('partName')}" placeholder="품명"></div>
            </div>
            <div class="form-group"><label class="form-label">시험항목 <span style="color:var(--accent-red)">*</span></label>
                <input class="form-input" id="reliTestItem" value="${g('testItem')}" placeholder="예: 내열성, 내구성, 부착력, 내화학성 등"></div>
            <div class="form-group"><label class="form-label">시험결과</label>
                <textarea class="form-textarea" id="reliResult" style="height:90px;" placeholder="시험 조건 및 측정 결과">${rec ? _esc(rec.result || '') : ''}</textarea></div>
            <div class="form-row">
                <div class="form-group"><label class="form-label">판정</label>
                    <select class="form-select" id="reliVerdict">
                        <option value="" ${!rec || !rec.verdict ? 'selected' : ''}>-- 선택 --</option>
                        <option value="합격" ${rec && rec.verdict === '합격' ? 'selected' : ''}>합격</option>
                        <option value="불합격" ${rec && rec.verdict === '불합격' ? 'selected' : ''}>불합격</option>
                        <option value="진행중" ${rec && rec.verdict === '진행중' ? 'selected' : ''}>진행중</option>
                    </select></div>
                <div class="form-group"><label class="form-label">비고</label>
                    <input class="form-input" id="reliNote" value="${g('note')}" placeholder="비고"></div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="ShippingReliabilityModule.saveForm('${id || ''}')">저장</button>
        `, 'lg');
    }

    async function saveForm(id) {
        const g = elId => (document.getElementById(elId) || {}).value || '';
        const date = g('reliDate').trim();
        const testItem = g('reliTestItem').trim();
        if (!date) { UIUtils.toast('시험일자를 입력하세요.', 'warning'); return; }
        if (!testItem) { UIUtils.toast('시험항목을 입력하세요.', 'warning'); return; }

        await _load();
        const payload = {
            date,
            carModel: g('reliCarModel').trim(),
            partName: g('reliPartName').trim(),
            testItem,
            result: g('reliResult'),
            verdict: g('reliVerdict'),
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
        UIUtils.toast('신뢰성 기록이 저장되었습니다.', 'success');
        UIUtils.closeModal();
        _renderList();
    }

    function remove(id) {
        UIUtils.confirm('이 신뢰성 기록을 삭제하시겠습니까?', async () => {
            await _load();
            _records = _records.filter(r => r.id !== id);
            await _save();
            UIUtils.toast('삭제되었습니다.', 'success');
            _renderList();
        });
    }

    return { init, render, openForm, saveForm, remove };
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
