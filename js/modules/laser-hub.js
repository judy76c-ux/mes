/**
 * 레이져 공정 메인 / 소메뉴 허브
 * - 레이져 작업일지
 * - 외관 검사 일지
 * - 지그 대장
 * - 지그 세척일지
 * - 레이져대기품현황
 * - 레이져 장비 점검/수리 내역
 */

var LaserProcessUI = (function () {
    const MENUS = [
        { id: 'laser-process', label: '메인', icon: 'dashboard' },
        { id: 'laser-work', label: '레이져 작업일지', icon: 'history' },
        { id: 'laser-inspection', label: '외관 검사 일지', icon: 'fact_check' },
        { id: 'laser-jig-master', label: '지그 대장', icon: 'view_list' },
        { id: 'laser-jig-cleaning', label: '지그 세척일지', icon: 'cleaning_services' },
        { id: 'laser-standby', label: '레이져대기품현황', icon: 'hourglass_top' },
        { id: 'laser-equipment-history', label: '장비 점검/수리 내역', icon: 'build_circle' }
    ];

    function renderSection(activePage, title, desc) {
        return `
            <div style="margin-bottom:18px;">
                <div style="margin-bottom:14px;">
                    <h3 style="margin:0 0 6px;font-size:1.15rem;">${title}</h3>
                    <p style="margin:0;color:var(--text-muted);font-size:.9rem;">${desc || ''}</p>
                </div>
                <div style="display:flex;gap:10px;flex-wrap:wrap;">
                    ${MENUS.map(function (menu) {
                        const active = menu.id === activePage;
                        return `
                            <button type="button"
                                onclick="Router.navigate('${menu.id}')"
                                class="btn ${active ? 'btn-primary' : 'btn-outline'}"
                                style="display:flex;align-items:center;gap:6px;${active ? '' : 'background:#fff;'}">
                                <span class="material-symbols-outlined" style="font-size:18px;">${menu.icon}</span>
                                ${menu.label}
                            </button>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    return {
        renderSection: renderSection
    };
})();

var LaserHubModule = (function () {
    const JIG_KEY = 'laser_jig_master_v1';
    const CLEAN_KEY = 'laser_jig_cleaning_v1';
    const EQUIP_KEY = 'laser_equipment_history_v1';

    function _today() {
        return (typeof UIUtils !== 'undefined' && UIUtils.today)
            ? UIUtils.today()
            : new Date().toISOString().slice(0, 10);
    }

    function _fmt(value) {
        return (typeof UIUtils !== 'undefined' && UIUtils.formatNumber)
            ? UIUtils.formatNumber(value || 0)
            : Number(value || 0).toLocaleString('ko-KR');
    }

    function _esc(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    async function _loadList(key) {
        try {
            const rows = await Storage.getConfigValue(key);
            return Array.isArray(rows) ? rows : [];
        } catch (e) {
            console.warn('[LaserHub] config load failed:', key, e);
            return [];
        }
    }

    async function _saveList(key, rows) {
        await Storage.setConfigValue(key, Array.isArray(rows) ? rows : []);
    }

    function _homeCard(title, desc, icon, countText, onClick, tone) {
        const border = {
            blue: '#3b82f6',
            green: '#10b981',
            purple: '#8b5cf6',
            orange: '#f97316',
            red: '#ef4444',
            cyan: '#06b6d4'
        }[tone || 'blue'] || '#3b82f6';

        return `
            <button type="button" onclick="${onClick}"
                onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(15,23,42,.10)'"
                onmouseleave="this.style.transform='';this.style.boxShadow='0 2px 8px rgba(15,23,42,.06)'"
                style="text-align:left;border:1px solid var(--border);border-top:3px solid ${border};background:#fff;border-radius:14px;
                       padding:20px;box-shadow:0 2px 8px rgba(15,23,42,.06);cursor:pointer;transition:all .15s;
                       display:flex;flex-direction:column;gap:14px;min-height:154px;">
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
            </button>
        `;
    }

    function _metricCard(tone, value, label, subLabel) {
        return `
            <div class="stat-card ${tone}">
                <div class="stat-card-value">${value}</div>
                <div class="stat-card-label">${label}</div>
                ${subLabel ? `<div style="margin-top:4px;font-size:.76rem;color:var(--text-muted);">${subLabel}</div>` : ''}
            </div>
        `;
    }

    function _collectLaserDailyMetrics() {
        const today = _today();
        const works = Storage.getAll(DB.STORES.LASER_WORK_LOG) || [];
        const inspections = Storage.getAll(DB.STORES.LASER_INSPECTIONS) || [];

        const todayWorks = works.filter(function (row) {
            return String(row.date || '').slice(0, 10) === today;
        });
        const todayInspections = inspections.filter(function (row) {
            return String(row.date || '').slice(0, 10) === today;
        });

        const inspectedWorkIds = new Set(
            todayInspections.map(function (row) { return row.workLogId; }).filter(Boolean)
        );

        const qcMissingCount = todayWorks.filter(function (row) {
            return !(row.qcFirst && row.qcMiddle && row.qcLast);
        }).length;

        const waitInspectionCount = todayWorks.filter(function (row) {
            return row.id && !inspectedWorkIds.has(row.id);
        }).length;

        const workQty = todayWorks.reduce(function (sum, row) {
            return sum + (Number(row.quantity) || 0);
        }, 0);
        const inspectionQty = todayInspections.reduce(function (sum, row) {
            return sum + (Number(row.inspQty) || 0);
        }, 0);
        const defectQty = todayInspections.reduce(function (sum, row) {
            return sum + (Number(row.failQty) || 0);
        }, 0);

        const efficiency = workQty > 0 ? ((inspectionQty / workQty) * 100).toFixed(1) : '0.0';

        return {
            today: today,
            workCount: todayWorks.length,
            inspectionCount: todayInspections.length,
            workQty: workQty,
            inspectionQty: inspectionQty,
            defectQty: defectQty,
            qcMissingCount: qcMissingCount,
            waitInspectionCount: waitInspectionCount,
            efficiency: efficiency
        };
    }

    async function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                ${LaserProcessUI.renderSection('laser-process', '레이져 공정', '레이져 작업, 외관 검사, 지그 관리, 대기품 현황, 장비 점검/수리 내역을 한 화면에서 선택합니다.')}
                <div class="section-card" style="padding:0;overflow:hidden;">
                    <div style="padding:22px 24px;border-bottom:1px solid var(--border);">
                        <h3 style="margin:0 0 6px;font-size:1.15rem;">레이져 공정</h3>
                        <p style="margin:0;color:var(--text-muted);font-size:.9rem;">
                            작업일지, 외관 검사, 지그 관리, 대기품 현황, 장비 점검/수리 이력을 한 화면에서 선택합니다.
                        </p>
                    </div>
                    <div style="padding:24px;">
                        <div id="laserHubStats" class="stat-cards" style="margin-bottom:18px;"></div>
                        <div id="laserHubCards" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;"></div>
                    </div>
                </div>
            </div>
        `;

        const metrics = _collectLaserDailyMetrics();
        const standbyItems = (Storage.getAll(DB.STORES.LASER_WORK_LOG) || []).length;
        const jigRows = await _loadList(JIG_KEY);
        const cleanRows = await _loadList(CLEAN_KEY);
        const equipRows = await _loadList(EQUIP_KEY);

        const thisMonth = metrics.today.slice(0, 7);
        const cleanThisMonth = cleanRows.filter(function (row) {
            return String(row.date || '').slice(0, 7) === thisMonth;
        }).length;
        const repairOpenCount = equipRows.filter(function (row) {
            return String(row.status || '') === '진행중';
        }).length;

        const statsEl = document.getElementById('laserHubStats');
        if (statsEl) {
            statsEl.innerHTML = [
                _metricCard('blue', _fmt(metrics.workQty), '금일 작업수량', `${metrics.workCount}건`),
                _metricCard('green', `${metrics.efficiency}%`, '가동 효율', `검사 ${_fmt(metrics.inspectionQty)} EA`),
                _metricCard('red', _fmt(metrics.defectQty), '금일 불량', `${metrics.inspectionCount}건 검사`),
                _metricCard('orange', _fmt(metrics.qcMissingCount), '초중종물 누락', `검사 대기 ${metrics.waitInspectionCount}건`)
            ].join('');
        }

        const cardsEl = document.getElementById('laserHubCards');
        if (cardsEl) {
            cardsEl.innerHTML = [
                _homeCard('레이져 작업일지', '금일 작업 실적과 가동 이력을 기록합니다.', 'history', `${metrics.workCount}건`, "Router.navigate('laser-work')", 'blue'),
                _homeCard('외관 검사 일지', '검사 대기, 검사 결과, 불량 유형을 관리합니다.', 'fact_check', `${metrics.inspectionCount}건`, "Router.navigate('laser-inspection')", 'green'),
                _homeCard('지그 대장', '레이져 지그 품목, 재질, 수량, 보관 위치를 관리합니다.', 'view_list', `${jigRows.length}건`, "Router.navigate('laser-jig-master')", 'purple'),
                _homeCard('지그 세척일지', '지그 세척 실적과 다음 세척 예정일을 기록합니다.', 'cleaning_services', `${cleanThisMonth}건`, "Router.navigate('laser-jig-cleaning')", 'cyan'),
                _homeCard('레이져대기품현황', '도장 완료 후 레이져 대기 중인 재공 현황을 확인합니다.', 'hourglass_top', `${standbyItems}건`, "Router.navigate('laser-standby')", 'orange'),
                _homeCard('레이져 장비 점검/수리 내역', '설비 점검, 이상, 수리 이력을 관리합니다.', 'build_circle', `${repairOpenCount}건 진행`, "Router.navigate('laser-equipment-history')", 'red')
            ].join('');
        }
    }

    return {
        render: render,
        init: render
    };
})();

var LaserJigMasterModule = (function () {
    const CONFIG_KEY = 'laser_jig_master_v1';

    function _esc(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function _fmt(value) {
        return (typeof UIUtils !== 'undefined' && UIUtils.formatNumber)
            ? UIUtils.formatNumber(value || 0)
            : Number(value || 0).toLocaleString('ko-KR');
    }

    async function _load() {
        const rows = await Storage.getConfigValue(CONFIG_KEY);
        return Array.isArray(rows) ? rows : [];
    }

    async function _save(rows) {
        await Storage.setConfigValue(CONFIG_KEY, rows);
    }

    async function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                ${LaserProcessUI.renderSection('laser-jig-master', '지그 대장', '레이져 공정용 지그의 등록 정보, 재질, 수량, 보관 위치와 상태를 관리합니다.')}
                <div class="page-header">
                    <div class="page-actions">
                        <button class="btn btn-primary" onclick="LaserJigMasterModule.openModal()">
                            <span class="material-symbols-outlined">add</span> 지그 등록
                        </button>
                    </div>
                </div>
                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>등록일</th>
                                        <th>지그명</th>
                                        <th>차종</th>
                                        <th>품명</th>
                                        <th>재질</th>
                                        <th>수량</th>
                                        <th>보관위치</th>
                                        <th>상태</th>
                                        <th>비고</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="laserJigMasterBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        await renderTable();
    }

    async function renderTable() {
        const tbody = document.getElementById('laserJigMasterBody');
        if (!tbody) return;
        const rows = (await _load()).sort(function (a, b) {
            return String(b.registDate || '').localeCompare(String(a.registDate || ''));
        });

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:36px;color:var(--text-muted);">등록된 지그 대장이 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(function (row) {
            return `
                <tr>
                    <td>${_esc(row.registDate || '-')}</td>
                    <td><strong>${_esc(row.jigName || '-')}</strong></td>
                    <td>${_esc(row.carModel || '-')}</td>
                    <td>${_esc(row.partName || '-')}</td>
                    <td>${_esc(row.material || '-')}</td>
                    <td style="text-align:right;">${_fmt(row.qty || 0)}</td>
                    <td>${_esc(row.location || '-')}</td>
                    <td>${UIUtils.badge(row.status || '사용중', (row.status || '') === '보관' ? 'secondary' : 'success')}</td>
                    <td>${_esc(row.note || '-')}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="LaserJigMasterModule.openModal('${row.id}')">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="LaserJigMasterModule.remove('${row.id}')">삭제</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async function openModal(id) {
        const rows = await _load();
        const row = id ? rows.find(function (item) { return item.id === id; }) : null;

        UIUtils.showModal(
            row ? '지그 대장 수정' : '지그 대장 등록',
            `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">등록일</label><input class="form-input" id="ljmDate" type="date" value="${_esc((row && row.registDate) || UIUtils.today())}"></div>
                    <div class="form-group"><label class="form-label">지그명</label><input class="form-input" id="ljmName" value="${_esc((row && row.jigName) || '')}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">차종</label><input class="form-input" id="ljmCar" value="${_esc((row && row.carModel) || '')}"></div>
                    <div class="form-group"><label class="form-label">품명</label><input class="form-input" id="ljmPart" value="${_esc((row && row.partName) || '')}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">재질</label><input class="form-input" id="ljmMaterial" value="${_esc((row && row.material) || '')}"></div>
                    <div class="form-group"><label class="form-label">수량</label><input class="form-input" id="ljmQty" type="number" min="0" value="${_esc((row && row.qty) || 0)}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">보관위치</label><input class="form-input" id="ljmLocation" value="${_esc((row && row.location) || '')}"></div>
                    <div class="form-group"><label class="form-label">상태</label>
                        <select class="form-select" id="ljmStatus">
                            ${['사용중','보관','수리중','폐기'].map(function (status) {
                                return `<option value="${status}" ${((row && row.status) || '사용중') === status ? 'selected' : ''}>${status}</option>`;
                            }).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-group"><label class="form-label">비고</label><textarea class="form-textarea" id="ljmNote" rows="3">${_esc((row && row.note) || '')}</textarea></div>
            `,
            `
                <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
                <button class="btn btn-primary" onclick="LaserJigMasterModule.save('${id || ''}')">저장</button>
            `
        );
    }

    async function save(id) {
        const rows = await _load();
        const payload = {
            registDate: document.getElementById('ljmDate').value,
            jigName: document.getElementById('ljmName').value.trim(),
            carModel: document.getElementById('ljmCar').value.trim(),
            partName: document.getElementById('ljmPart').value.trim(),
            material: document.getElementById('ljmMaterial').value.trim(),
            qty: Number(document.getElementById('ljmQty').value) || 0,
            location: document.getElementById('ljmLocation').value.trim(),
            status: document.getElementById('ljmStatus').value,
            note: document.getElementById('ljmNote').value.trim()
        };

        if (!payload.jigName) {
            UIUtils.toast('지그명을 입력하세요.', 'warning');
            return;
        }

        if (id) {
            const index = rows.findIndex(function (item) { return item.id === id; });
            if (index > -1) rows[index] = Object.assign({}, rows[index], payload, { updatedAt: new Date().toISOString() });
        } else {
            rows.unshift(Object.assign({
                id: Storage.generateId(),
                createdAt: new Date().toISOString()
            }, payload));
        }

        await _save(rows);
        UIUtils.closeModal();
        UIUtils.toast('지그 대장이 저장되었습니다.', 'success');
        const area = document.getElementById('contentArea');
        if (area) render(area);
    }

    async function remove(id) {
        UIUtils.confirm('이 지그 대장을 삭제하시겠습니까?', async function () {
            const rows = await _load();
            await _save(rows.filter(function (item) { return item.id !== id; }));
            UIUtils.toast('삭제되었습니다.', 'success');
            await renderTable();
        });
    }

    return {
        render: render,
        init: render,
        openModal: openModal,
        save: save,
        remove: remove
    };
})();

var LaserJigCleaningModule = (function () {
    const CONFIG_KEY = 'laser_jig_cleaning_v1';
    const JIG_KEY = 'laser_jig_master_v1';

    function _esc(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    async function _load() {
        const rows = await Storage.getConfigValue(CONFIG_KEY);
        return Array.isArray(rows) ? rows : [];
    }

    async function _save(rows) {
        await Storage.setConfigValue(CONFIG_KEY, rows);
    }

    async function _jigs() {
        const rows = await Storage.getConfigValue(JIG_KEY);
        return Array.isArray(rows) ? rows : [];
    }

    async function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                ${LaserProcessUI.renderSection('laser-jig-cleaning', '지그 세척일지', '지그 세척 이력과 세척 방법, 담당자, 다음 세척 예정일을 기록합니다.')}
                <div class="page-header">
                    <div class="page-actions">
                        <button class="btn btn-primary" onclick="LaserJigCleaningModule.openModal()">
                            <span class="material-symbols-outlined">add</span> 세척 기록 등록
                        </button>
                    </div>
                </div>
                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>세척일</th>
                                        <th>지그명</th>
                                        <th>세척수량</th>
                                        <th>세척자</th>
                                        <th>세척방법</th>
                                        <th>결과</th>
                                        <th>다음 세척일</th>
                                        <th>비고</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="laserJigCleaningBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        await renderTable();
    }

    async function renderTable() {
        const tbody = document.getElementById('laserJigCleaningBody');
        if (!tbody) return;
        const rows = (await _load()).sort(function (a, b) {
            return String(b.date || '').localeCompare(String(a.date || ''));
        });

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:36px;color:var(--text-muted);">등록된 지그 세척일지가 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(function (row) {
            return `
                <tr>
                    <td>${_esc(row.date || '-')}</td>
                    <td><strong>${_esc(row.jigName || '-')}</strong></td>
                    <td style="text-align:right;">${_esc(row.cleanQty || 0)}</td>
                    <td>${_esc(row.cleaner || '-')}</td>
                    <td>${_esc(row.method || '-')}</td>
                    <td>${UIUtils.badge(row.result || '완료', (row.result || '') === '이상' ? 'danger' : 'success')}</td>
                    <td>${_esc(row.nextDate || '-')}</td>
                    <td>${_esc(row.note || '-')}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="LaserJigCleaningModule.openModal('${row.id}')">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="LaserJigCleaningModule.remove('${row.id}')">삭제</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async function openModal(id) {
        const rows = await _load();
        const row = id ? rows.find(function (item) { return item.id === id; }) : null;
        const jigs = await _jigs();

        UIUtils.showModal(
            row ? '지그 세척일지 수정' : '지그 세척일지 등록',
            `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">세척일</label><input class="form-input" id="ljcDate" type="date" value="${_esc((row && row.date) || UIUtils.today())}"></div>
                    <div class="form-group"><label class="form-label">지그명</label>
                        <select class="form-select" id="ljcName">
                            <option value="">선택</option>
                            ${jigs.map(function (jig) {
                                const selected = ((row && row.jigName) || '') === jig.jigName ? 'selected' : '';
                                return `<option value="${_esc(jig.jigName)}" ${selected}>${_esc(jig.jigName)}</option>`;
                            }).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">세척수량</label><input class="form-input" id="ljcQty" type="number" min="0" value="${_esc((row && row.cleanQty) || 0)}"></div>
                    <div class="form-group"><label class="form-label">세척자</label><input class="form-input" id="ljcCleaner" value="${_esc((row && row.cleaner) || '')}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">세척방법</label><input class="form-input" id="ljcMethod" value="${_esc((row && row.method) || '에어/세척포')}" ></div>
                    <div class="form-group"><label class="form-label">결과</label>
                        <select class="form-select" id="ljcResult">
                            ${['완료','이상','보류'].map(function (result) {
                                return `<option value="${result}" ${((row && row.result) || '완료') === result ? 'selected' : ''}>${result}</option>`;
                            }).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-group"><label class="form-label">다음 세척일</label><input class="form-input" id="ljcNextDate" type="date" value="${_esc((row && row.nextDate) || '')}"></div>
                <div class="form-group"><label class="form-label">비고</label><textarea class="form-textarea" id="ljcNote" rows="3">${_esc((row && row.note) || '')}</textarea></div>
            `,
            `
                <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
                <button class="btn btn-primary" onclick="LaserJigCleaningModule.save('${id || ''}')">저장</button>
            `
        );
    }

    async function save(id) {
        const rows = await _load();
        const payload = {
            date: document.getElementById('ljcDate').value,
            jigName: document.getElementById('ljcName').value,
            cleanQty: Number(document.getElementById('ljcQty').value) || 0,
            cleaner: document.getElementById('ljcCleaner').value.trim(),
            method: document.getElementById('ljcMethod').value.trim(),
            result: document.getElementById('ljcResult').value,
            nextDate: document.getElementById('ljcNextDate').value,
            note: document.getElementById('ljcNote').value.trim()
        };

        if (!payload.jigName) {
            UIUtils.toast('지그명을 선택하세요.', 'warning');
            return;
        }

        if (id) {
            const index = rows.findIndex(function (item) { return item.id === id; });
            if (index > -1) rows[index] = Object.assign({}, rows[index], payload, { updatedAt: new Date().toISOString() });
        } else {
            rows.unshift(Object.assign({
                id: Storage.generateId(),
                createdAt: new Date().toISOString()
            }, payload));
        }

        await _save(rows);
        UIUtils.closeModal();
        UIUtils.toast('지그 세척일지가 저장되었습니다.', 'success');
        const area = document.getElementById('contentArea');
        if (area) render(area);
    }

    async function remove(id) {
        UIUtils.confirm('이 세척 기록을 삭제하시겠습니까?', async function () {
            const rows = await _load();
            await _save(rows.filter(function (item) { return item.id !== id; }));
            UIUtils.toast('삭제되었습니다.', 'success');
            await renderTable();
        });
    }

    return {
        render: render,
        init: render,
        openModal: openModal,
        save: save,
        remove: remove
    };
})();

var LaserEquipmentHistoryModule = (function () {
    const CONFIG_KEY = 'laser_equipment_history_v1';

    function _esc(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    async function _load() {
        const rows = await Storage.getConfigValue(CONFIG_KEY);
        return Array.isArray(rows) ? rows : [];
    }

    async function _save(rows) {
        await Storage.setConfigValue(CONFIG_KEY, rows);
    }

    async function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                ${LaserProcessUI.renderSection('laser-equipment-history', '레이져 장비 점검/수리 내역', '레이져 장비의 이상, 점검, 수리 이력을 기록하고 진행 상태를 관리합니다.')}
                <div class="page-header">
                    <div class="page-actions">
                        <button class="btn btn-primary" onclick="LaserEquipmentHistoryModule.openModal()">
                            <span class="material-symbols-outlined">add</span> 점검/수리 등록
                        </button>
                    </div>
                </div>
                <div class="card">
                    <div class="card-body" style="padding:0;">
                        <div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>일자</th>
                                        <th>장비명</th>
                                        <th>구분</th>
                                        <th>상태</th>
                                        <th>담당자</th>
                                        <th>이상 내용</th>
                                        <th>조치 내용</th>
                                        <th>비가동시간(h)</th>
                                        <th>비용</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody id="laserEquipHistoryBody"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;

        await renderTable();
    }

    async function renderTable() {
        const tbody = document.getElementById('laserEquipHistoryBody');
        if (!tbody) return;
        const rows = (await _load()).sort(function (a, b) {
            return String(b.date || '').localeCompare(String(a.date || ''));
        });

        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:36px;color:var(--text-muted);">등록된 레이져 장비 점검/수리 내역이 없습니다.</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(function (row) {
            const statusType = row.status === '진행중' ? 'warning' : (row.status === '보류' ? 'secondary' : 'success');
            return `
                <tr>
                    <td>${_esc(row.date || '-')}</td>
                    <td><strong>${_esc(row.equipmentName || '-')}</strong></td>
                    <td>${_esc(row.category || '-')}</td>
                    <td>${UIUtils.badge(row.status || '완료', statusType)}</td>
                    <td>${_esc(row.worker || '-')}</td>
                    <td>${_esc(row.issue || '-')}</td>
                    <td>${_esc(row.actionTaken || '-')}</td>
                    <td style="text-align:right;">${_esc(row.downHours || 0)}</td>
                    <td style="text-align:right;">${_esc(row.cost || 0)}</td>
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="LaserEquipmentHistoryModule.openModal('${row.id}')">수정</button>
                        <button class="btn btn-sm btn-danger" onclick="LaserEquipmentHistoryModule.remove('${row.id}')">삭제</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    async function openModal(id) {
        const rows = await _load();
        const row = id ? rows.find(function (item) { return item.id === id; }) : null;

        UIUtils.showModal(
            row ? '레이져 장비 점검/수리 수정' : '레이져 장비 점검/수리 등록',
            `
                <div class="form-row">
                    <div class="form-group"><label class="form-label">일자</label><input class="form-input" id="lehDate" type="date" value="${_esc((row && row.date) || UIUtils.today())}"></div>
                    <div class="form-group"><label class="form-label">장비명</label><input class="form-input" id="lehName" value="${_esc((row && row.equipmentName) || '')}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">구분</label>
                        <select class="form-select" id="lehCategory">
                            ${['정기점검','수리','이상조치','교체'].map(function (category) {
                                return `<option value="${category}" ${((row && row.category) || '정기점검') === category ? 'selected' : ''}>${category}</option>`;
                            }).join('')}
                        </select>
                    </div>
                    <div class="form-group"><label class="form-label">상태</label>
                        <select class="form-select" id="lehStatus">
                            ${['완료','진행중','보류'].map(function (status) {
                                return `<option value="${status}" ${((row && row.status) || '완료') === status ? 'selected' : ''}>${status}</option>`;
                            }).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">담당자</label><input class="form-input" id="lehWorker" value="${_esc((row && row.worker) || '')}"></div>
                    <div class="form-group"><label class="form-label">비가동시간(h)</label><input class="form-input" id="lehDownHours" type="number" min="0" step="0.1" value="${_esc((row && row.downHours) || 0)}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label class="form-label">비용</label><input class="form-input" id="lehCost" type="number" min="0" step="1000" value="${_esc((row && row.cost) || 0)}"></div>
                    <div class="form-group"><label class="form-label">이상 내용</label><input class="form-input" id="lehIssue" value="${_esc((row && row.issue) || '')}"></div>
                </div>
                <div class="form-group"><label class="form-label">조치 내용</label><textarea class="form-textarea" id="lehAction" rows="3">${_esc((row && row.actionTaken) || '')}</textarea></div>
            `,
            `
                <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
                <button class="btn btn-primary" onclick="LaserEquipmentHistoryModule.save('${id || ''}')">저장</button>
            `
        );
    }

    async function save(id) {
        const rows = await _load();
        const payload = {
            date: document.getElementById('lehDate').value,
            equipmentName: document.getElementById('lehName').value.trim(),
            category: document.getElementById('lehCategory').value,
            status: document.getElementById('lehStatus').value,
            worker: document.getElementById('lehWorker').value.trim(),
            downHours: Number(document.getElementById('lehDownHours').value) || 0,
            cost: Number(document.getElementById('lehCost').value) || 0,
            issue: document.getElementById('lehIssue').value.trim(),
            actionTaken: document.getElementById('lehAction').value.trim()
        };

        if (!payload.equipmentName) {
            UIUtils.toast('장비명을 입력하세요.', 'warning');
            return;
        }

        if (id) {
            const index = rows.findIndex(function (item) { return item.id === id; });
            if (index > -1) rows[index] = Object.assign({}, rows[index], payload, { updatedAt: new Date().toISOString() });
        } else {
            rows.unshift(Object.assign({
                id: Storage.generateId(),
                createdAt: new Date().toISOString()
            }, payload));
        }

        await _save(rows);
        UIUtils.closeModal();
        UIUtils.toast('장비 점검/수리 내역이 저장되었습니다.', 'success');
        const area = document.getElementById('contentArea');
        if (area) render(area);
    }

    async function remove(id) {
        UIUtils.confirm('이 장비 이력을 삭제하시겠습니까?', async function () {
            const rows = await _load();
            await _save(rows.filter(function (item) { return item.id !== id; }));
            UIUtils.toast('삭제되었습니다.', 'success');
            await renderTable();
        });
    }

    return {
        render: render,
        init: render,
        openModal: openModal,
        save: save,
        remove: remove
    };
})();
