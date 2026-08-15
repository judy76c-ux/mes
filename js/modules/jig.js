/**
 * 도장 JIG 수명 관리 모듈
 * - 도장 공정 제품만 JIG 등록 대상으로 표시
 * - 제품 정보의 도장-A / 도장-B 공정으로 라인 자동 구분
 * - 색상/품명 변형이 같은 JIG를 쓰는 경우 partAliases로 병합 관리
 */
var JigModule = (function () {
    const STORE = DB.STORES.JIG_MASTER;
    const LOG_STORE = DB.STORES.JIG_LOG;
    const DISPOSAL_KEY = 'painting_jig_disposal_v1';
    const CLEANING_KEY = 'painting_jig_cleaning_v1';
    const REPAIR_KEY = 'painting_jig_repair_v1';
    const LIFE_STANDARD_KEY = 'painting_jig_life_standard_v1';
    const LIFE_STANDARD_IMAGE_KEY = 'painting_jig_life_standard_image_v1';
    const A_LINE_CYCLE = 1092;
    const B_LINE_CYCLE = 175;
    const LINE_ORDER_RATE = 1.01; // 101%
    const THICKNESS_POINT_PHOTO_COUNT = 3;
    const THICKNESS_POINT_META = [
        { label: '1. 초기 지그 두께', desc: '도장 전 지그 두께 측정' },
        { label: '2. 1회 도장 후 두께', desc: '스프레이 1회 후 측정' },
        { label: '3. 2회 도장 후 두께', desc: '스프레이 2회 후 측정' }
    ];
    const STANDARD_UPLOAD_ROLES = ['admin', 'prod_manager', 'quality_manager', 'paint_line_op'];

    let _currentLine = '';
    let _currentStatus = '';
    let _batchMergeRows = [];
    let _activeView = 'life';
    let _masterCarFilter = '';
    let _jigPasteTargetId = '';
    let _jigPasteListenerReady = false;
    let _lifeStandardPasteArmed = false;
    let _lifeStandardImage = null;
    let _jigLifeFitBound = false;
    let _jigLifeFitRaf = 0;

    const _today = () => (UIUtils.today ? UIUtils.today() : new Date().toISOString().split('T')[0]);
    const _monthAgo = () => {
        if (UIUtils.monthAgo) return UIUtils.monthAgo();
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.toISOString().split('T')[0];
    };
    const _fmt = n => (UIUtils.formatNumber ? UIUtils.formatNumber(n) : Number(n || 0).toLocaleString('ko-KR'));
    const _esc = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const _js = s => String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ');

    function _calcAvgFilmThickness(pointMms) {
        const p0 = _numMm(pointMms[0]);
        const p1 = _numMm(pointMms[1]);
        const p2 = _numMm(pointMms[2]);
        if (!p0 || !p1 || !p2 || p1 <= p0 || p2 <= p1) return 0;
        const film1 = p1 - p0;
        const film2 = p2 - p1;
        return Math.round(((film1 + film2) / 2) * 1000) / 1000;
    }

    function _calcFilmThicknessDetail(pointMms) {
        const p0 = _numMm(pointMms[0]);
        const p1 = _numMm(pointMms[1]);
        const p2 = _numMm(pointMms[2]);
        if (!p0 || !p1 || !p2 || p1 <= p0 || p2 <= p1) {
            return {
                avg: 0,
                text: '3개 측정값을 입력하면 1회 평균 도막두께가 자동 계산됩니다.'
            };
        }
        const film1 = Math.round((p1 - p0) * 1000) / 1000;
        const film2 = Math.round((p2 - p1) * 1000) / 1000;
        const avg = Math.round(((film1 + film2) / 2) * 1000) / 1000;
        return {
            avg: avg,
            text: '1회 도막 ' + _fmtMm(film1) + ' mm + 2회 도막 ' + _fmtMm(film2) + ' mm → 평균 ' + _fmtMm(avg) + ' mm'
        };
    }

    function _getThicknessPointMm(d, index) {
        const arr = Array.isArray(d.thicknessPointMm) ? d.thicknessPointMm : [];
        if (arr[index] != null && arr[index] !== '') return arr[index];
        if (index === 0 && d.initialThicknessMm) return d.initialThicknessMm;
        return '';
    }

    function _readThicknessPointsFromForm() {
        return Array.from({ length: THICKNESS_POINT_PHOTO_COUNT }, function (_, i) {
            return document.getElementById('thicknessPointMm' + i)?.value || '';
        });
    }

    /** 수명 근거 계산: 제한두께 ÷ 1회 도막두께 = 도달 횟수, 관리 횟수 = 도달 × 90% */
    function _numMm(v) {
        const n = Number(String(v == null ? '' : v).replace(/,/g, ''));
        return Number.isFinite(n) && n > 0 ? n : 0;
    }
    function _calcLifeFromThickness(limitMm, filmMm) {
        const limit = _numMm(limitMm);
        const film = _numMm(filmMm);
        if (!limit || !film) return { limitCoatCount: 0, manageCount: 0 };
        const limitCoatCount = Math.floor(limit / film);
        const manageCount = Math.floor(limitCoatCount * 0.9);
        return { limitCoatCount: limitCoatCount, manageCount: manageCount };
    }
    function _fmtMm(v) {
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) return '—';
        return (Math.round(n * 1000) / 1000).toString();
    }
    function _fmtCountOrDash(v) {
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0) return '—';
        return _fmt(n);
    }
    const _isAdminUser = () => {
        const user = (typeof AuthModule !== 'undefined' && AuthModule.getCurrentUser)
            ? AuthModule.getCurrentUser()
            : null;
        return !!(user && user.role === 'admin');
    };
    const _currentUser = () => {
        try {
            return (typeof AuthModule !== 'undefined' && typeof AuthModule.getCurrentUser === 'function')
                ? AuthModule.getCurrentUser()
                : null;
        } catch (e) {
            return null;
        }
    };
    const _canUploadLifeStandard = () => {
        const user = _currentUser();
        return !!(user && STANDARD_UPLOAD_ROLES.includes(String(user.role || '')));
    };

    const JIG_MENUS = [
        { id: 'painting-jig', label: '메인', icon: 'dashboard' },
        { id: 'jig-management', label: '수명관리', icon: 'monitor_heart' },
        { id: 'jig-life-standard', label: '지그수명기준서', icon: 'description' },
        { id: 'jig-master', label: '도장 지그대장', icon: 'fact_check' },
        { id: 'jig-layout', label: '지그창고 레이아웃', icon: 'map' },
        { id: 'jig-disposal', label: '지그 폐기 대장', icon: 'delete_sweep' },
        { id: 'jig-ordering', label: '지그 발주 관리', icon: 'shopping_cart' },
        { id: 'jig-change-history', label: '조치 이력', icon: 'sync_alt' },
        { id: 'jig-repair-history', label: '지그수리 개선 이력', icon: 'build_circle' }
    ];

    function renderMenu(activePage) {
        return `
            <div class="mes-apple-menu-hero" style="padding:16px 20px;margin-bottom:20px;display:flex;gap:10px;flex-wrap:wrap;">
                ${JIG_MENUS.map(menu => {
                    const active = menu.id === activePage;
                    return `<button type="button" onclick="Router.navigate('${menu.id}')"
                        style="display:flex;align-items:center;gap:12px;padding:12px 18px;border-radius:14px;
                               border:${active ? '2px solid var(--accent-blue)' : '1.5px solid var(--border-color)'};
                               background:var(--bg-primary);color:var(--text-primary);
                               cursor:pointer;min-width:130px;text-align:left;box-shadow:0 1px 4px rgba(0,0,0,.06);">
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

    async function _loadConfigList(key) {
        try {
            const rows = await Storage.getConfigValue(key);
            return Array.isArray(rows) ? rows : [];
        } catch (e) {
            console.warn('[JigModule] config load failed:', key, e);
            return [];
        }
    }

    async function _saveConfigList(key, rows) {
        await Storage.setConfigValue(key, Array.isArray(rows) ? rows : []);
    }
    function _getLifeStandardDefaults() {
        return {
            companyKo: 'KC 케미칼 주식회사',
            companyEn: 'KOREA CHEMITECH CHEMICAL CO., LTD.',
            title: '도장 지그 수명 관리 기준서',
            revisionLabel: '결재',
            writerTitle: '작성',
            reviewerTitle: '검토',
            approverTitle: '승인',
            writerSign: '',
            reviewerSign: '',
            approverSign: '',
            section1Title: '1. 목적  Purpose',
            section1DescKo: '도장 지그의 적절한 수명 관리 및 교체 주기 설정을 통해 품질 문제 및 생산성 저하를 방지한다.',
            section1DescEn: 'Prevent quality problems and productivity declines by setting appropriate life management and replacement cycles for painting jigs.',
            section1LifeKo: '수명: 최초 사용 시점부터 품질 또는 안전 기준을 만족하지 않을 때까지의 사용 기간',
            section1LifeEn: 'Shelf life: The period of use from the time of first use until the quality or safety standards are no longer met.',
            section2Title: '2. 적용 범위  Scope of application',
            section2DescKo: '도장 공정에 사용되는 모든 차종의 JIG의 수명 한도의 주기를 설정하고 교체한다.',
            section2DescEn: 'Set and replace the life limit cycle of the JIG for all types of vehicles used in the painting process.',
            section3Title: '3. 수명 관리 기준  Life management standards',
            table1Head1: '항목',
            table1Head2: '내용',
            table1Head3: '기준',
            table1Head4: '관리',
            row1ItemKo: '사용 횟수 기준',
            row1ItemEn: 'Standard for number of uses',
            row1DescKo: '제품 생산 수량 또는 도장 횟수 기준으로 관리',
            row1DescEn: 'Managed by production quantity or number of paints',
            row1Std: '제한 두께:\n단면 2 mm\n양면 4 mm',
            row1Mgmt: '제한두께 ÷ 1회 증가두께\n= 제한횟수',
            row2ItemKo: '변형 기준',
            row2ItemEn: 'Transformation criteria',
            row2DescKo: '지그의 변형, 파손, 마모/부식 등 육안으로 확인 시 교체 또는 수리',
            row2DescEn: 'Replace or repair the jig if it is visually confirmed to be deformed, damaged, worn/corroded, etc.',
            row2Std: '제품과 결합불량\n지그간 간섭발생\n연 제품간 간섭\n제품 위치 틀어짐',
            row2Mgmt: '공정조건C/Sheet\n(로딩)',
            section5Title: '5. 지그 수명 이력 증감 방식  Jig life history management',
            section5Bullet: '- 이력관리는 자동으로 기록 관리된다.',
            historyHead1: '라인',
            historyHead2: '1 CYCLE 기준',
            historyHead3: '환산 방식',
            historyRow1Line: 'A라인',
            historyRow1Cycle: '1,092 spindle',
            historyRow1Rule: 'SPINDLE ≤ 1,092 → 1회 / 초과 시 → round(SPINDLE ÷ 1,092)',
            historyRow2Line: 'B라인',
            historyRow2Cycle: '175 spindle',
            historyRow2Rule: 'SPINDLE ≤ 175 → 1회 / 초과 시 → round(SPINDLE ÷ 175)',
            section6Title: '6. 교체 기준',
            replaceLine1: '1) 도장 사용 기준 횟수시  - 전체 교체',
            replaceLine1En: 'When the number of times used is reached - replace the entire seal',
            replaceLine2: '2) 구조적 손상 확인 시 (파손 및 변형) - 해당 JIG 교체',
            replaceLine2En: 'When structural damage is confirmed (weld joint breakage, frame bending, etc.)',
            footerDocNo: '문서번호 : KC-IT-009'
        };
    }

    async function _loadLifeStandard() {
        try {
            const saved = await Storage.getConfigValue(LIFE_STANDARD_KEY);
            return { ..._getLifeStandardDefaults(), ...(saved && typeof saved === 'object' ? saved : {}) };
        } catch (e) {
            console.warn('[JigModule] life standard load failed:', e);
            return _getLifeStandardDefaults();
        }
    }

    async function _saveLifeStandard(data) {
        await Storage.setConfigValue(LIFE_STANDARD_KEY, data || _getLifeStandardDefaults());
    }

    function _lifeField(name, value, tag, extraClass) {
        const fieldTag = tag || 'div';
        return `<${fieldTag} class="jig-life-edit ${extraClass || ''}" contenteditable="true" data-field="${name}">${_esc(String(value || '')).replace(/\n/g, '<br>')}</${fieldTag}>`;
    }

    function _collectLifeStandard() {
        const root = document.getElementById('jigLifeStandardDoc');
        if (!root) return _getLifeStandardDefaults();
        const data = _getLifeStandardDefaults();
        root.querySelectorAll('[data-field]').forEach(node => {
            const key = node.getAttribute('data-field');
            if (!key) return;
            const text = String(node.innerText || '')
                .replace(/\r/g, '')
                .replace(/\u00a0/g, ' ')
                .split('\n')
                .map(line => line.trimEnd())
                .join('\n')
                .trim();
            data[key] = text;
        });
        return data;
    }

    async function saveLifeStandard() {
        await _saveLifeStandard(_collectLifeStandard());
        UIUtils.toast('도장지그 수명관리 기준서를 저장했습니다.', 'success');
    }

    async function _loadLifeStandardImage() {
        try {
            return await Storage.getConfigValue(LIFE_STANDARD_IMAGE_KEY) || null;
        } catch (e) {
            console.warn('[JigModule] life standard image load failed:', e);
            return null;
        }
    }

    async function _saveLifeStandardImage(dataUrl) {
        await Storage.setConfigValue(LIFE_STANDARD_IMAGE_KEY, dataUrl || null);
    }

    function _homeCard(title, desc, icon, countText, route, tone) {
        const color = {
            blue: '#3b82f6',
            green: '#10b981',
            purple: '#8b5cf6',
            orange: '#f97316',
            red: '#ef4444',
            cyan: '#06b6d4'
        }[tone || 'blue'] || '#3b82f6';
        return `
            <button type="button" onclick="Router.navigate('${route}')"
                style="text-align:left;border:1px solid var(--border-color);border-top:3px solid ${color};background:#fff;border-radius:12px;
                       padding:18px;box-shadow:0 2px 8px rgba(15,23,42,.06);cursor:pointer;display:flex;flex-direction:column;gap:12px;min-height:142px;">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                    <span class="material-symbols-outlined" style="width:40px;height:40px;border-radius:11px;display:flex;align-items:center;justify-content:center;background:#eff6ff;color:${color};font-size:22px;">${icon}</span>
                    <span style="font-size:.78rem;color:var(--text-muted);font-weight:700;">${countText || ''}</span>
                </div>
                <div>
                    <div style="font-size:1rem;font-weight:800;color:var(--text-primary);margin-bottom:6px;">${title}</div>
                    <div style="font-size:.84rem;line-height:1.45;color:var(--text-muted);">${desc}</div>
                </div>
            </button>`;
    }

    function render(container) {
        container.innerHTML = `
        <div class="fade-in-up jig-page">
            ${renderMenu('jig-management', '수명관리', '도장 지그의 사용 횟수와 수명 임박/초과 상태를 확인합니다.')}
            <div class="page-header">
                <div class="page-actions">
                    <button id="jigFilterAll" class="btn btn-primary btn-sm" onclick="JigModule.filterLine('')">전체</button>
                    <button id="jigFilterA" class="btn btn-outline btn-sm" onclick="JigModule.filterLine('A라인')">A라인</button>
                    <button id="jigFilterB" class="btn btn-outline btn-sm" onclick="JigModule.filterLine('B라인')">B라인</button>
                    ${_isAdminUser() ? `
                        <button class="btn btn-outline btn-sm" onclick="JigModule.syncFromPaintingWork()"
                            title="자동 생성된 JIG 사용 이력을 삭제 후 도장 작업 실적 기준으로 다시 계산합니다.">
                            <span class="material-symbols-outlined">sync</span> 데이터 보정/재계산
                        </button>
                    ` : ''}
                </div>
            </div>

            <div id="jigLifeView">

            <div id="jigBlocks"></div>

            <div class="card" style="margin-top:20px;">
                <div class="card-body">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
                        <h4 style="margin:0;">사용 이력</h4>
                        <button class="btn btn-outline btn-sm" onclick="JigModule.openAddLogModal()">
                            <span class="material-symbols-outlined">add</span> 사용 등록
                        </button>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:10px 12px;background:var(--bg-secondary);border-radius:8px;margin-bottom:12px;">
                        <input type="date" id="jigLogStart" class="form-input" style="width:130px;" value="${_monthAgo()}">
                        <span style="color:var(--text-muted);font-size:0.85rem;">~</span>
                        <input type="date" id="jigLogEnd" class="form-input" style="width:130px;" value="${_today()}">
                        <select id="jigLogCarFilter" class="form-select" style="width:120px;" onchange="JigModule.onLogCarChange()">
                            <option value="">전체 차종</option>
                        </select>
                        <select id="jigLogPartFilter" class="form-select" style="width:180px;">
                            <option value="">전체 품목</option>
                        </select>
                        <button class="btn btn-primary btn-sm" onclick="JigModule.renderLog()">
                            <span class="material-symbols-outlined">search</span> 조회
                        </button>
                        <button class="btn btn-outline btn-sm" onclick="JigModule.resetLogFilter()">초기화</button>
                    </div>
                    <div id="jigLogTable"></div>
                </div>
            </div>
            </div>

            <div id="jigMasterView" style="display:none;"></div>
        </div>`;

        _currentLine = '';
        _currentStatus = '';
        _activeView = 'life';
        loadAll();
        switchView(_activeView);
    }

    function switchView(view) {
        _activeView = view || 'life';
        const life = document.getElementById('jigLifeView');
        const master = document.getElementById('jigMasterView');
        const lifeBtn = document.getElementById('jigViewLife');
        const masterBtn = document.getElementById('jigViewMaster');
        if (life) life.style.display = _activeView === 'life' ? '' : 'none';
        if (master) master.style.display = _activeView === 'master' ? '' : 'none';
        if (lifeBtn) lifeBtn.className = `btn btn-sm ${_activeView === 'life' ? 'btn-primary' : 'btn-outline'}`;
        if (masterBtn) masterBtn.className = `btn btn-sm ${_activeView === 'master' ? 'btn-primary' : 'btn-outline'}`;
        if (_activeView === 'master') renderJigMaster();
    }

    // 제품의 공정별 사양(process1~4)에 도장 공정이 있는지 검사
    function _hasPaintingProcess(product) {
        return ['process1', 'process2', 'process3', 'process4'].some(key => {
            const v = String(product[key] || '').replace(/\s+/g, '');
            return v.includes('도장') || v.toUpperCase().includes('PAINT');
        });
    }

    // 도장 공정 제품만 추출
    function _paintingProducts() {
        return (Storage.getAll(DB.STORES.PRODUCTS) || []).filter(_hasPaintingProcess);
    }

    function _lineFromProcessValue(value) {
        const s = String(value || '').replace(/\s+/g, '').toUpperCase();
        if (!s) return null;
        if ((s.includes('도장') || s.includes('PAINT')) && s.includes('B')) return 'B라인';
        if ((s.includes('도장') || s.includes('PAINT')) && s.includes('A')) return 'A라인';
        if (s === 'A라인' || s === 'ALINE' || s === 'A-LINE') return 'A라인';
        if (s === 'B라인' || s === 'BLINE' || s === 'B-LINE') return 'B라인';
        return null;
    }

    function _getProductPaintingLines(product) {
        const lines = [];
        ['process1', 'process2', 'process3', 'process4'].forEach(key => {
            const line = _lineFromProcessValue(product && product[key]);
            if (line && !lines.includes(line)) lines.push(line);
        });
        return lines;
    }

    function _jigPartNames(jig) {
        return [jig && jig.partName, ...((jig && jig.partAliases) || [])]
            .map(v => String(v || '').trim())
            .filter(Boolean);
    }

    function _jigMatchesPart(jig, partName) {
        const target = String(partName || '').trim();
        return !!target && _jigPartNames(jig).includes(target);
    }

    function _findJigForProduct(jigs, carModel, partName, line) {
        return (jigs || []).find(j =>
            j.carModel === carModel && j.line === line && _jigMatchesPart(j, partName)
        );
    }

    function _lifePct(j) {
        const max = Number(j.maxCount) || 0;
        return max ? ((Number(j.usedCount) || 0) / max) * 100 : 0;
    }

    function _resetActionForJig(jig) {
        const material = String(jig && jig.material || '').toUpperCase().replace(/\s+/g, '');
        if (material.includes('STEEL') || material.includes('스틸') || material.includes('SUS') || material.includes('STS')) {
            return '박리 세척';
        }
        return '교체';
    }

    function _isResetWorkType(workType) {
        return ['교체', '박리 세척'].includes(String(workType || ''));
    }

    function _latestReplacementDate(logs, jigId) {
        return (logs || []).reduce((latest, log) => {
            if (log.jigId !== jigId || !_isResetWorkType(log.workType)) return latest;
            const date = String(log.date || '');
            return date && (!latest || date > latest) ? date : latest;
        }, null);
    }

    function _isOnOrAfterReplacement(date, replacementDate) {
        if (!replacementDate) return true;
        const targetDate = String(date || '');
        return !!targetDate && targetDate >= replacementDate;
    }

    function _enrichedJigs() {
        const jigs = Storage.getAll(STORE) || [];
        const logs = Storage.getAll(LOG_STORE) || [];
        const countMap = {};
        const lastResetMap = {};
        logs.forEach(log => {
            if (_isResetWorkType(log.workType) && (!lastResetMap[log.jigId] || log.date > lastResetMap[log.jigId])) {
                lastResetMap[log.jigId] = log.date;
            }
        });
        logs.forEach(log => {
            if (!_isOnOrAfterReplacement(log.date, lastResetMap[log.jigId])) return;
            if (!countMap[log.jigId]) countMap[log.jigId] = 0;
            countMap[log.jigId] += Number(log.useCount) || 0;
        });
        const preMesMap = {};
        logs.forEach(function (log) {
            if (log.source !== 'pre_mes_baseline') return;
            if (!_isOnOrAfterReplacement(log.date, lastResetMap[log.jigId])) return;
            preMesMap[log.jigId] = Number(log.useCount) || 0;
        });
        return jigs.map(j => ({
            ...j,
            usedCount: countMap[j.id] || 0,
            preMesUsedCount: preMesMap[j.id] || 0,
            lastResetDate: lastResetMap[j.id] || null
        }));
    }

    function _preMesBaselineLog(jigId) {
        const logs = Storage.getAll(LOG_STORE) || [];
        const replacementDate = _latestReplacementDate(logs, jigId);
        return logs.find(function (log) {
            return log.jigId === jigId
                && log.source === 'pre_mes_baseline'
                && _isOnOrAfterReplacement(log.date, replacementDate);
        }) || null;
    }

    function _usageLogsForJig(jigId) {
        const logs = Storage.getAll(LOG_STORE) || [];
        const replacementDate = _latestReplacementDate(logs, jigId);
        return logs.filter(function (log) {
            if (log.jigId !== jigId) return false;
            if (!_isOnOrAfterReplacement(log.date, replacementDate)) return false;
            if (_isResetWorkType(log.workType)) return false;
            return (Number(log.useCount) || 0) > 0;
        }).sort(function (a, b) {
            return String(b.date || '').localeCompare(String(a.date || ''))
                || String(a.id || '').localeCompare(String(b.id || ''));
        });
    }

    function _paintingWorkById(id) {
        if (!id) return null;
        try {
            return Storage.getById(DB.STORES.PAINTING_WORK, id) || null;
        } catch (e) {
            return null;
        }
    }

    function _workLotText(work) {
        if (!work) return '';
        if (Array.isArray(work.lots) && work.lots.length) {
            return work.lots.map(function (l) {
                return String(l.lotNo || '') + (l.qty ? '(' + _fmt(l.qty) + ')' : '');
            }).filter(Boolean).join(' / ');
        }
        return String(work.lotNo || '');
    }

    function openUsageHistory(jigId) {
        const jig = Storage.getById(STORE, jigId);
        if (!jig) {
            UIUtils.toast('JIG를 찾을 수 없습니다.', 'warning');
            return;
        }
        const logs = _usageLogsForJig(jigId);
        const total = logs.reduce(function (s, l) { return s + (Number(l.useCount) || 0); }, 0);
        const baseline = _preMesBaselineLog(jigId);
        const preMes = Number(baseline && baseline.useCount) || 0;
        const afterMes = Math.max(0, total - preMes);
        const resetDate = _latestReplacementDate(Storage.getAll(LOG_STORE) || [], jigId) || jig.lastResetDate || jig.registDate || '-';
        const adminForm = _isAdminUser()
            ? '<div style="margin:0 0 12px;padding:10px 12px;border-radius:8px;border:1px solid rgba(234,88,12,0.28);background:rgba(234,88,12,0.05);">' +
                '<div style="font-size:0.82rem;font-weight:700;color:#ea580c;margin-bottom:4px;">EMS 구축 전 누적횟수 (관리자)</div>' +
                '<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:8px;">MES 구축 전에 사용한 횟수를 입력합니다. 구축 이후 도장 작업일보 횟수에 더해 현재 실적과 맞춥니다. 0이면 구축 전 분을 제거합니다.</div>' +
                '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">' +
                    '<input type="number" id="jigPreMesUsedCount" class="form-input" min="0" step="1" value="' + preMes + '" ' +
                        'style="width:auto;min-width:7em;text-align:right;">' +
                    '<span style="font-size:0.8rem;color:var(--text-secondary);">회</span>' +
                    '<button type="button" class="btn btn-sm btn-primary" onclick="JigModule.savePreMesUsedCount(\'' + _js(jigId) + '\')">저장</button>' +
                '</div></div>'
            : '';
        const aliases = (jig.partAliases || []).filter(function (p) { return p !== jig.partName; });
        const th = 'padding:6px 8px;text-align:center;font-size:0.72rem;color:var(--text-muted);font-weight:600;border-bottom:1px solid var(--border-color);white-space:nowrap;';
        const td = 'padding:7px 8px;border-bottom:1px solid var(--border-color);font-size:0.8rem;white-space:nowrap;';

        const rows = logs.length ? logs.map(function (log, idx) {
            const work = _paintingWorkById(log.paintingWorkId);
            const inputQty = work ? (Number(work.inputQty) || 0) : 0;
            const productionQty = work ? (Number(work.productionQty) || Number(work.inputQty) || 0) : 0;
            const cvt = work ? _getProductCvt(work.carModel, work.partName) : 0;
            const spindle = (work && cvt && inputQty) ? Math.ceil(inputQty / cvt) : 0;
            const lotText = _workLotText(work);
            const sourceLabel = log.source === 'pre_mes_baseline'
                ? 'EMS 구축 전'
                : (log.source === 'auto_painting' ? '도장 작업일보' : (log.workType || '수동 등록'));
            const viewBtn = (work && work.id && typeof PaintingWorkModule !== 'undefined' && PaintingWorkModule.openWorkViewPage)
                ? '<button type="button" class="btn btn-sm btn-outline" style="padding:1px 7px;font-size:0.72rem;" ' +
                    'onclick="UIUtils.closeModal();PaintingWorkModule.openWorkViewPage(\'' + _js(work.id) + '\')">보기</button>'
                : '<span style="color:var(--text-muted);">-</span>';
            return '<tr>' +
                '<td style="' + td + 'text-align:center;color:var(--text-muted);">' + (idx + 1) + '</td>' +
                '<td style="' + td + '">' + _esc(log.date || (work && work.date) || '-') + '</td>' +
                '<td style="' + td + '">' + _esc((work && work.line) || jig.line || '-') + '</td>' +
                '<td style="' + td + '">' + _esc((work && work.carModel) || jig.carModel || '-') + '</td>' +
                '<td style="' + td + '">' + _esc((work && work.partName) || jig.partName || '-') + '</td>' +
                '<td style="' + td + 'color:var(--text-muted);">' + _esc((work && work.color) || '-') + '</td>' +
                '<td style="' + td + 'font-family:monospace;color:var(--text-muted);">' + _esc(lotText || '-') + '</td>' +
                '<td style="' + td + 'text-align:right;">' + (work ? _fmt(inputQty) : '-') + '</td>' +
                '<td style="' + td + 'text-align:right;">' + (work ? _fmt(productionQty) : '-') + '</td>' +
                '<td style="' + td + 'text-align:right;">' + (spindle ? _fmt(spindle) : '-') + '</td>' +
                '<td style="' + td + 'text-align:right;font-weight:700;color:var(--accent-blue);">' + _fmt(log.useCount || 0) + '</td>' +
                '<td style="' + td + '">' + _esc(sourceLabel) + '</td>' +
                '<td style="' + td + 'white-space:normal;max-width:220px;" class="wrap" title="' + _esc(log.note || '') + '">' + _esc(log.note || '-') + '</td>' +
                '<td style="' + td + 'text-align:center;">' + viewBtn + '</td>' +
                '</tr>';
        }).join('') : '<tr><td colspan="14" style="padding:28px 12px;text-align:center;color:var(--text-muted);">이전 교체일 이후 사용 이력이 없습니다.</td></tr>';

        UIUtils.showModal(
            '지그 사용 이력 — 생산일보',
            '<div style="margin-bottom:12px;padding:10px 12px;border-radius:8px;background:rgba(37,99,235,0.06);border:1px solid rgba(37,99,235,0.2);font-size:0.84rem;">' +
                '<div><strong>' + _esc(jig.carModel || '-') + '</strong> / ' + _esc(jig.partName || '-') +
                (jig.line ? ' <span style="font-size:0.68rem;background:var(--accent-blue);color:#fff;padding:1px 6px;border-radius:4px;margin-left:4px;">' + _esc(jig.line) + '</span>' : '') +
                '</div>' +
                (aliases.length ? '<div style="margin-top:4px;font-size:0.75rem;color:var(--text-muted);">병합 품명: ' + aliases.map(_esc).join(', ') + '</div>' : '') +
                '<div style="margin-top:6px;color:var(--text-secondary);">' +
                    '이전교체일 <strong>' + _esc(resetDate) + '</strong> · ' +
                    '이력 <strong>' + _fmt(logs.length) + '</strong>건 · ' +
                    '누적 <strong style="color:var(--accent-blue);">' + _fmt(total) + '</strong>회' +
                    ' <span style="font-size:0.75rem;color:var(--text-muted);">(구축 전 ' + _fmt(preMes) + ' + 구축 후 ' + _fmt(afterMes) + ')</span>' +
                '</div>' +
                '<div style="margin-top:6px;font-size:0.75rem;color:var(--text-muted);">' +
                    '누적횟수 = EMS 구축 전 입력분 + 이전 교체일 이후 도장 작업일보(및 수동 등록) 합계입니다.</div>' +
            '</div>' +
            adminForm +
            '<div style="overflow-x:auto;">' +
                '<table class="data-table data-table--content" style="width:max-content;table-layout:auto;border-collapse:collapse;">' +
                    '<thead><tr style="background:var(--bg-secondary);">' +
                        '<th style="' + th + '">No</th>' +
                        '<th style="' + th + '">작업일</th>' +
                        '<th style="' + th + '">라인</th>' +
                        '<th style="' + th + '">차종</th>' +
                        '<th style="' + th + '">품명</th>' +
                        '<th style="' + th + '">컬러</th>' +
                        '<th style="' + th + '">LOT</th>' +
                        '<th style="' + th + '">투입</th>' +
                        '<th style="' + th + '">산출</th>' +
                        '<th style="' + th + '">SPINDLE</th>' +
                        '<th style="' + th + '">지그횟수</th>' +
                        '<th style="' + th + '">출처</th>' +
                        '<th style="' + th + '">비고</th>' +
                        '<th style="' + th + '">일보</th>' +
                    '</tr></thead>' +
                    '<tbody>' + rows + '</tbody>' +
                '</table>' +
            '</div>',
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>',
            'xl'
        );
    }

    async function savePreMesUsedCount(jigId) {
        if (!_isAdminUser()) {
            UIUtils.toast('EMS 구축 전 누적횟수는 관리자만 입력할 수 있습니다.', 'warning');
            return;
        }
        const jig = Storage.getById(STORE, jigId);
        if (!jig) {
            UIUtils.toast('JIG를 찾을 수 없습니다.', 'warning');
            return;
        }
        const raw = document.getElementById('jigPreMesUsedCount');
        const qty = parseInt(raw && raw.value, 10);
        if (!Number.isFinite(qty) || qty < 0) {
            UIUtils.toast('누적횟수를 0 이상으로 입력하세요.', 'warning');
            return;
        }
        const logs = Storage.getAll(LOG_STORE) || [];
        const replacementDate = _latestReplacementDate(logs, jigId);
        const existing = _preMesBaselineLog(jigId);
        const actor = _currentUser();
        const worker = actor
            ? String(actor.displayName || actor.username || actor.id || '')
            : '';
        const date = replacementDate || _today();
        const payload = {
            jigId: jigId,
            date: date,
            workType: 'EMS 구축 전 누적',
            useCount: qty,
            source: 'pre_mes_baseline',
            note: 'EMS 구축 전 실적 매칭',
            worker: worker
        };
        try {
            if (qty === 0) {
                if (existing) await Storage.remove(LOG_STORE, existing.id);
                UIUtils.toast('EMS 구축 전 누적횟수를 제거했습니다.', 'success');
            } else if (existing) {
                await Storage.update(LOG_STORE, existing.id, Object.assign({}, existing, payload));
                UIUtils.toast('EMS 구축 전 누적횟수를 수정했습니다.', 'success');
            } else {
                await Storage.add(LOG_STORE, payload);
                UIUtils.toast('EMS 구축 전 누적횟수를 등록했습니다.', 'success');
            }
        } catch (e) {
            UIUtils.toast('저장에 실패했습니다.', 'error');
            return;
        }
        UIUtils.closeModal();
        loadAll();
        openUsageHistory(jigId);
    }

    function loadAll() {
        const enriched = _enrichedJigs();
        renderBlocks(_applyJigFilters(enriched));
        _populateLogFilter(Storage.getAll(STORE) || []);
        renderLog();
    }

    function _applyJigFilters(jigs) {
        return (jigs || []).filter(j => {
            if (_currentLine && j.line !== _currentLine) return false;
            if (_currentStatus === 'warning') return _lifePct(j) >= 80 && _lifePct(j) < 100;
            if (_currentStatus === 'exceeded') return _lifePct(j) >= 100;
            return true;
        });
    }

    function _updateFilterButtons() {
        const lineMap = { All: '', A: 'A라인', B: 'B라인' };
        Object.keys(lineMap).forEach(key => {
            const btn = document.getElementById('jigFilter' + key);
            if (btn) btn.className = 'btn btn-sm ' + (_currentLine === lineMap[key] && !_currentStatus ? 'btn-primary' : 'btn-outline');
        });
        const warningBtn = document.getElementById('jigFilterWarning');
        const exceededBtn = document.getElementById('jigFilterExceeded');
        if (warningBtn) warningBtn.className = 'btn btn-sm ' + (_currentStatus === 'warning' ? 'btn-primary' : 'btn-outline');
        if (exceededBtn) exceededBtn.className = 'btn btn-sm ' + (_currentStatus === 'exceeded' ? 'btn-primary' : 'btn-outline');
    }

    function filterLine(line) {
        _currentLine = line;
        _currentStatus = '';
        const enriched = _enrichedJigs();
        _updateFilterButtons();
        renderBlocks(_applyJigFilters(enriched));
    }

    function filterStatus(status) {
        _currentStatus = _currentStatus === status ? '' : status;
        _currentLine = '';
        const enriched = _enrichedJigs();
        _updateFilterButtons();
        renderBlocks(_applyJigFilters(enriched));
    }

    function renderBlocks(jigs) {
        const el = document.getElementById('jigBlocks');
        if (!el) return;
        if (!jigs.length) {
            el.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size:3rem;display:block;opacity:0.3;margin-bottom:8px;">build</span>
                등록된 JIG가 없습니다. 단건 등록으로 도장 JIG를 등록하세요.
            </div>`;
            return;
        }

        const groups = {};
        jigs.forEach(j => {
            const car = j.carModel || '차종 미지정';
            if (!groups[car]) groups[car] = [];
            groups[car].push(j);
        });

        const orderings = Storage.getAll(DB.STORES.JIG_ORDERING) || [];
        const orderingByJigId = {};
        orderings.forEach(o => {
            if (o.jigId) orderingByJigId[o.jigId] = o;
        });

        const thStyle = 'padding:6px 8px;text-align:center;font-size:0.72rem;color:var(--text-muted);font-weight:600;border-bottom:2px solid var(--border-color);white-space:nowrap;';

        const sorted = jigs.slice().sort((a, b) =>
            (a.carModel || '').localeCompare(b.carModel || '', 'ko') ||
            (a.partName || '').localeCompare(b.partName || '', 'ko') ||
            (a.line || '').localeCompare(b.line || '')
        );

        let prevCar = null;
        const rows = sorted.map(j => {
            const pct = Math.min(100, _lifePct(j));
            const barColor = pct >= 100 ? 'var(--accent-red)' : pct >= 80 ? 'var(--accent-orange)' : 'var(--accent-green)';
            const status = pct >= 100 ? ['수명초과', 'var(--accent-red)'] : pct >= 80 ? ['임박', 'var(--accent-orange)'] : ['정상', 'var(--accent-green)'];
            const aliases = (j.partAliases || []).filter(p => p !== j.partName);
            const car = j.carModel || '차종 미지정';
            const td  = 'padding:6px 8px;border-bottom:1px solid var(--border-color);font-size:0.82rem;';
            const tdn = td + 'white-space:nowrap;';
            const isNewCar = car !== prevCar;
            prevCar = car;
            const partTitle = (j.partName || '-') + (aliases.length ? ' / 병합: ' + aliases.join(', ') : '');
            const carCell = isNewCar
                ? `<td class="jig-col-short" style="${tdn}text-align:center;font-weight:700;color:var(--accent-blue);border-top:${isNewCar && sorted.indexOf(j) > 0 ? '2px solid var(--border-color)' : 'none'};">${_esc(car)}</td>`
                : `<td class="jig-col-short" style="${td}text-align:center;color:var(--text-muted);font-size:0.75rem;"></td>`;
            return `
            <tr${isNewCar && sorted.indexOf(j) > 0 ? ' style="border-top:2px solid var(--border-color);"' : ''}>
                ${carCell}
                <td class="jig-col-part" style="${td}">
                    <span class="jig-part-name-text" title="${_esc(partTitle)}">${_esc(j.partName || '-')}</span>
                    ${aliases.length ? `<span class="jig-part-alias">병합: ${aliases.map(_esc).join(', ')}</span>` : ''}
                </td>
                <td class="jig-col-short" style="${tdn}text-align:center;"><span style="background:var(--accent-blue);color:#fff;padding:1px 6px;border-radius:4px;font-size:0.68rem;">${_esc(j.line || '-')}</span></td>
                <td class="jig-col-short" style="${tdn}text-align:center;">${j.maxCount ? _fmt(j.maxCount) : '-'}</td>
                <td class="jig-col-short" style="${tdn}text-align:center;">
                    <button type="button" class="btn btn-sm btn-outline"
                        title="${_isAdminUser() ? '이력 보기 · EMS 구축 전 횟수 입력' : '생산일보 이력 보기'}${(j.preMesUsedCount || 0) ? ' (구축 전 ' + _fmt(j.preMesUsedCount) + '회 포함)' : ''}"
                        onclick="JigModule.openUsageHistory('${_js(j.id)}')"
                        style="padding:1px 8px;font-size:0.82rem;font-weight:700;color:var(--accent-blue);border-color:rgba(37,99,235,.35);">
                        ${_fmt(j.usedCount || 0)}
                    </button>
                </td>
                <td class="jig-col-progress" style="${td}">
                    <div class="jig-life-bar-wrap" title="90% 도달 시 조치 준비">
                        <div class="jig-life-bar">
                            <div style="width:${pct}%;background:${barColor};height:100%;border-radius:4px;"></div>
                            <div style="position:absolute;left:90%;top:0;bottom:0;width:2px;background:var(--accent-red);box-shadow:0 0 0 1px rgba(255,255,255,.8);"></div>
                        </div>
                        <span style="font-size:0.72rem;font-weight:700;color:${barColor};">${pct.toFixed(0)}%</span>
                    </div>
                </td>
                <td class="jig-col-short" style="${tdn}text-align:center;font-size:0.78rem;color:var(--text-muted);">
                    ${j.lastResetDate || j.registDate || '-'}
                    ${orderingByJigId[j.id] ? `<span style="margin-left:4px;padding:1px 5px;background:var(--accent-blue);color:#fff;border-radius:4px;font-size:0.68rem;font-weight:600;">발주 ${_esc(orderingByJigId[j.id].orderDate || '-')}</span>` : ''}
                </td>
                <td class="jig-col-short" style="${tdn}text-align:center;"><span style="background:${status[1]};color:#fff;padding:1px 7px;border-radius:4px;font-size:0.68rem;">${status[0]}</span></td>
                <td class="jig-col-short" style="${tdn}text-align:center;">
                    <button class="btn btn-sm btn-outline" onclick="JigModule.resetCount('${_js(j.id)}')" style="padding:2px 8px;font-size:0.78rem;" title="조치 초기화">
                        조치
                    </button>
                </td>
            </tr>`;
        }).join('');

        el.innerHTML = `
        <div class="jig-block">
            <div class="jig-table-scroll">
            <table class="jig-life-table">
                <thead><tr style="background:var(--bg-secondary);">
                    <th class="jig-col-short" style="${thStyle}">차종</th>
                    <th class="jig-col-part" style="${thStyle}">제품명</th>
                    <th class="jig-col-short" style="${thStyle}">라인</th>
                    <th class="jig-col-short" style="${thStyle}">수명횟수</th>
                    <th class="jig-col-short" style="${thStyle}">누적횟수</th>
                    <th class="jig-col-progress" style="${thStyle}">수명진행률</th>
                    <th class="jig-col-short" style="${thStyle}">이전교체일</th>
                    <th class="jig-col-short" style="${thStyle}">상태</th>
                    <th class="jig-col-short" style="${thStyle}">수명조치</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
            </div>
        </div>`;
        _bindJigLifeFit();
        _scheduleFitJigLifePartNames();
    }

    function _fitJigLifePartNames() {
        const table = document.querySelector('#jigBlocks .jig-life-table');
        if (!table) return;
        const wrap = table.closest('.jig-table-scroll');
        if (!wrap) return;
        const names = table.querySelectorAll('.jig-part-name-text');
        names.forEach(function (el) { el.style.fontSize = ''; });
        table.querySelectorAll('.jig-col-part, .jig-col-progress').forEach(function (cell) {
            cell.style.width = '';
            cell.style.maxWidth = '';
        });
        const oldGroup = table.querySelector('colgroup');
        if (oldGroup) oldGroup.remove();
        table.style.tableLayout = 'auto';
        table.style.width = 'max-content';

        const row = (table.tHead && table.tHead.rows[0]) || (table.tBodies[0] && table.tBodies[0].rows[0]);
        if (!row) return;

        let nameW = 0;
        names.forEach(function (el) {
            nameW = Math.max(nameW, el.scrollWidth);
        });
        const partSample = table.querySelector('th.jig-col-part, td.jig-col-part');
        const pad = partSample ? (
            (parseFloat(window.getComputedStyle(partSample).paddingLeft) || 0) +
            (parseFloat(window.getComputedStyle(partSample).paddingRight) || 0)
        ) : 16;
        const avail = wrap.clientWidth;
        const colWidths = Array.from(row.cells).map(function (cell) {
            return cell.getBoundingClientRect().width;
        });
        let otherW = 0;
        Array.from(row.cells).forEach(function (cell, i) {
            if (!cell.classList.contains('jig-col-part') && !cell.classList.contains('jig-col-progress')) {
                otherW += colWidths[i] || 0;
            }
        });

        const minProgress = Math.max(260, Math.round(avail * 0.38));
        const maxPart = Math.min(Math.round(avail * 0.28), Math.max(160, avail - otherW - minProgress));
        let partW = Math.ceil(nameW + pad + 2);
        partW = Math.min(Math.max(partW, 96), Math.max(96, maxPart));
        let progressW = Math.max(minProgress, avail - otherW - partW);
        if (otherW + partW + progressW > avail) {
            progressW = Math.max(minProgress, avail - otherW - partW);
            partW = Math.max(96, avail - otherW - progressW);
        }

        const group = document.createElement('colgroup');
        Array.from(row.cells).forEach(function (cell, i) {
            const col = document.createElement('col');
            let w = colWidths[i] || 0;
            if (cell.classList.contains('jig-col-part')) w = partW;
            if (cell.classList.contains('jig-col-progress')) w = progressW;
            col.style.width = w + 'px';
            group.appendChild(col);
        });
        table.insertBefore(group, table.firstChild);
        table.style.tableLayout = 'fixed';
        table.style.width = avail + 'px';

        names.forEach(function (el) {
            const base = parseFloat(window.getComputedStyle(el).fontSize) || 13;
            if (el.scrollWidth <= el.clientWidth + 0.5) return;
            let lo = 8;
            let hi = base;
            let best = 8;
            for (let i = 0; i < 12; i++) {
                const mid = (lo + hi) / 2;
                el.style.fontSize = mid + 'px';
                if (el.scrollWidth <= el.clientWidth + 0.5) {
                    best = mid;
                    lo = mid;
                } else {
                    hi = mid;
                }
            }
            el.style.fontSize = best + 'px';
        });
    }

    function _scheduleFitJigLifePartNames() {
        if (_jigLifeFitRaf) cancelAnimationFrame(_jigLifeFitRaf);
        _jigLifeFitRaf = requestAnimationFrame(function () {
            _jigLifeFitRaf = 0;
            _fitJigLifePartNames();
        });
    }

    function _bindJigLifeFit() {
        if (_jigLifeFitBound) return;
        _jigLifeFitBound = true;
        window.addEventListener('resize', _scheduleFitJigLifePartNames);
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', _scheduleFitJigLifePartNames);
        }
    }

    function _populateLogFilter(jigs) {
        const carSel = document.getElementById('jigLogCarFilter');
        const partSel = document.getElementById('jigLogPartFilter');
        if (!carSel || !partSel) return;
        const curCar = carSel.value || '';
        const curPart = partSel.value || '';
        const cars = [...new Set(jigs.map(j => j.carModel).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
        carSel.innerHTML = `<option value="">전체 차종</option>` + cars.map(c => `<option value="${_esc(c)}" ${c === curCar ? 'selected' : ''}>${_esc(c)}</option>`).join('');
        const parts = [...new Set(jigs.filter(j => !curCar || j.carModel === curCar).flatMap(_jigPartNames))].sort((a, b) => a.localeCompare(b, 'ko'));
        partSel.innerHTML = `<option value="">전체 품목</option>` + parts.map(p => `<option value="${_esc(p)}" ${p === curPart ? 'selected' : ''}>${_esc(p)}</option>`).join('');
    }

    function onLogCarChange() {
        _populateLogFilter(Storage.getAll(STORE) || []);
    }

    function resetLogFilter() {
        const s = document.getElementById('jigLogStart');
        const e = document.getElementById('jigLogEnd');
        const c = document.getElementById('jigLogCarFilter');
        const p = document.getElementById('jigLogPartFilter');
        if (s) s.value = _monthAgo();
        if (e) e.value = _today();
        if (c) c.value = '';
        if (p) p.value = '';
        _populateLogFilter(Storage.getAll(STORE) || []);
        renderLog();
    }

    function renderLog() {
        const el = document.getElementById('jigLogTable');
        if (!el) return;
        const start = document.getElementById('jigLogStart')?.value || '';
        const end = document.getElementById('jigLogEnd')?.value || '';
        const carFilter = document.getElementById('jigLogCarFilter')?.value || '';
        const partFilter = document.getElementById('jigLogPartFilter')?.value || '';
        const jigs = Storage.getAll(STORE) || [];
        const jigMap = {};
        jigs.forEach(j => { jigMap[j.id] = j; });
        let logs = Storage.getAll(LOG_STORE) || [];
        logs = logs.filter(l => {
            if (start && l.date < start) return false;
            if (end && l.date > end) return false;
            const jig = jigMap[l.jigId];
            if (carFilter && (jig?.carModel || '') !== carFilter) return false;
            if (partFilter && !_jigMatchesPart(jig, partFilter)) return false;
            return true;
        }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        if (!logs.length) {
            el.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem;padding:16px 0;text-align:center;">조회된 이력이 없습니다.</p>`;
            return;
        }

        const table = rows => `
        <div class="data-table-wrapper jig-log-table-wrap">
        <table class="data-table" style="width:100%;font-size:0.8rem;">
            <thead><tr>
                <th>일자</th><th>차종</th><th>품명</th><th>내용</th><th>횟수</th><th>비고</th><th>작업</th>
            </tr></thead>
            <tbody>${rows.map(l => {
                const jig = jigMap[l.jigId] || {};
                return `<tr>
                    <td>${_esc(l.date || '-')}</td>
                    <td>${_esc(jig.carModel || '-')}</td>
                    <td>${_esc(jig.partName || '-')}</td>
                    <td>${_esc(l.workType || '-')}</td>
                    <td style="text-align:right;font-weight:700;color:var(--accent-blue);">${_fmt(l.useCount || 0)}</td>
                    <td style="color:var(--text-muted);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${_esc(l.note || '')}">${_esc(l.note || '')}</td>
                    <td><button class="btn btn-sm btn-danger" onclick="JigModule.removeLog('${_js(l.id)}')" style="padding:2px 8px;">삭제</button></td>
                </tr>`;
            }).join('')}</tbody>
        </table>
        </div>`;

        const aLogs = logs.filter(l => (jigMap[l.jigId]?.line || '') === 'A라인');
        const bLogs = logs.filter(l => (jigMap[l.jigId]?.line || '') === 'B라인');
        const etcLogs = logs.filter(l => !['A라인', 'B라인'].includes(jigMap[l.jigId]?.line || ''));
        el.innerHTML = `
            <div class="jig-log-grid">
                <div>${aLogs.length ? `<h5 style="margin:0 0 6px;">A라인 (${aLogs.length}건)</h5>${table(aLogs)}` : ''}</div>
                <div>${bLogs.length ? `<h5 style="margin:0 0 6px;">B라인 (${bLogs.length}건)</h5>${table(bLogs)}` : ''}</div>
            </div>
            ${etcLogs.length ? `<div style="margin-top:12px;"><h5 style="margin:0 0 6px;">기타 (${etcLogs.length}건)</h5>${table(etcLogs)}</div>` : ''}`;
    }

    function openBatchRegisterModal() {
        // 도장 공정이 있는 제품만 대상
        const products = _paintingProducts();
        const jigs = Storage.getAll(STORE) || [];
        if (!products.length) {
            UIUtils.toast('도장 공정이 설정된 제품이 없습니다. 관리/설정 > 제품 정보에서 공정별 사양에 도장-A 또는 도장-B를 등록하세요.', 'warning');
            return;
        }

        const jigMap = {};
        jigs.forEach(j => {
            _jigPartNames(j).forEach(part => {
                const key = `${j.carModel}||${part}`;
                if (!jigMap[key]) jigMap[key] = {};
                jigMap[key][j.line || ''] = j;
            });
        });

        const groups = {};
        let excluded = 0;
        products.forEach(p => {
            if (!p.partName) return;
            if (_getProductPaintingLines(p).length === 0) {
                excluded++;
                return;
            }
            const car = p.carModel || '미지정';
            if (!groups[car]) groups[car] = [];
            if (!groups[car].find(x => x.partName === p.partName)) groups[car].push(p);
        });

        const groupEntries = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b, 'ko'));
        let rowIndex = 0;
        const carFilterOptions = groupEntries.map(([car, prods]) => `<option value="${_esc(car)}">${_esc(car)} (${prods.length})</option>`).join('');
        const hiddenRegistered = [];
        const groupHtmls = groupEntries.map(([car, prods]) => {
            const items = prods.sort((a, b) => (a.partName || '').localeCompare(b.partName || '', 'ko'));
            const cells = items.flatMap(p => {
                const key = `${car}||${p.partName}`;
                return _getProductPaintingLines(p).map(line => {
                    const existing = (jigMap[key] || {})[line];
                    if (existing && Number(existing.maxCount) > 0) {
                        hiddenRegistered.push({ id: existing.id, car, partName: p.partName, line, maxCount: existing.maxCount });
                        return '';
                    }
                    const ri = rowIndex++;
                    return `
                    <div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:6px;padding:10px 12px;display:grid;grid-template-columns:28px minmax(180px,1fr) 90px minmax(180px,260px);gap:12px;align-items:center;">
                        <input type="checkbox" data-merge-ri="${ri}" title="병합 선택">
                        <div>
                            <div style="font-size:0.82rem;font-weight:600;color:var(--text-primary);">${_esc(p.partName)}</div>
                            <div style="font-size:0.72rem;color:var(--text-muted);">${_esc(car)}</div>
                        </div>
                        <div style="text-align:center;"><span style="background:var(--accent-blue);color:#fff;padding:2px 8px;border-radius:4px;font-size:0.75rem;">${line}</span></div>
                        <div style="display:flex;align-items:center;gap:6px;">
                            <input type="hidden" data-ri="${ri}" data-field="carModel" value="${_esc(car)}">
                            <input type="hidden" data-ri="${ri}" data-field="partName" value="${_esc(p.partName)}">
                            <input type="hidden" data-ri="${ri}" data-field="line" value="${line}">
                            <input type="hidden" data-ri="${ri}" data-field="id" value="${existing ? _esc(existing.id) : ''}">
                            <input type="number" class="form-input" data-ri="${ri}" data-field="maxCount" value="${existing ? (existing.maxCount || '') : ''}" placeholder="수명 횟수" min="0" style="flex:1;font-size:0.82rem;text-align:right;">
                            <span style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap;">회</span>
                        </div>
                    </div>`;
                });
            });
            if (!cells.join('').trim()) return '';
            return `
            <div class="jig-batch-car-group" data-car="${_esc(car)}" style="margin-bottom:14px;">
                <div style="font-size:0.82rem;font-weight:700;color:var(--accent-blue);padding:8px 10px;margin-bottom:8px;display:flex;align-items:center;gap:6px;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.18);border-radius:8px;">
                    <span class="material-symbols-outlined" style="font-size:0.95rem;">directions_car</span>${_esc(car)}
                    <span style="font-weight:400;color:var(--text-muted);">(${items.length}개 품목)</span>
                </div>
                <div style="display:grid;grid-template-columns:1fr;gap:8px;">${cells.join('')}</div>
            </div>`;
        }).join('');

        const hiddenHtml = hiddenRegistered.length ? `
            <details style="margin-top:12px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-primary);">
                <summary style="cursor:pointer;padding:10px 12px;font-size:0.82rem;font-weight:700;color:var(--text-secondary);">
                    등록 완료 항목 ${hiddenRegistered.length}건
                </summary>
                <div style="max-height:220px;overflow:auto;border-top:1px solid var(--border-color);">
                    <table class="data-table" style="width:100%;font-size:0.78rem;">
                        <thead><tr><th>차종</th><th>품명</th><th>라인</th><th style="text-align:right;">수명 횟수</th><th style="width:80px;text-align:center;">저장</th></tr></thead>
                        <tbody>
                            ${hiddenRegistered.map(r => `
                                <tr>
                                    <td>${_esc(r.car)}</td>
                                    <td>${_esc(r.partName)}</td>
                                    <td>${_esc(r.line)}</td>
                                    <td style="text-align:right;">
                                        <input type="number" class="form-input" id="batchDoneMax_${_esc(r.id)}" value="${r.maxCount}" min="1" style="width:120px;text-align:right;display:inline-block;">
                                    </td>
                                    <td style="text-align:center;">
                                        <button class="btn btn-sm btn-outline" onclick="JigModule.updateRegisteredMaxCount('${_js(r.id)}')">저장</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </details>` : '';

        UIUtils.showModal(
            '<span class="material-symbols-outlined" style="vertical-align:middle;margin-right:4px;">table_rows</span> 전품목 JIG 일괄 등록',
            `<div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:12px;padding:8px 12px;background:rgba(59,130,246,0.06);border-radius:6px;border-left:3px solid var(--accent-blue);">
                제품 정보의 제조공정(도장-A/도장-B)을 기준으로 해당 라인만 표시됩니다. 수명 횟수를 입력한 항목만 저장됩니다.
                ${excluded ? `<br><span>도장 공정이 없는 사출품 ${excluded}건은 목록에서 제외했습니다.</span>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:12px;padding:10px 12px;background:var(--bg-secondary);border-radius:8px;">
                <label style="font-size:0.82rem;font-weight:700;color:var(--text-secondary);">차종 필터</label>
                <select class="form-select" id="batchJigCarFilter" style="width:220px;" onchange="JigModule.filterBatchCar(this.value)">
                    <option value="">전체 차종</option>${carFilterOptions}
                </select>
                <button type="button" class="btn btn-sm btn-outline" onclick="document.getElementById('batchJigCarFilter').value=''; JigModule.filterBatchCar('');">전체 보기</button>
                <button type="button" class="btn btn-sm btn-primary" onclick="JigModule.openBatchMergeModal()">
                    <span class="material-symbols-outlined" style="font-size:0.9rem;vertical-align:middle;">merge_type</span> 선택 병합
                </button>
            </div>
            <div id="batchJigForm" style="max-height:60vh;overflow-y:auto;padding-right:4px;">${groupHtmls || '<p style="padding:20px;color:var(--text-muted);">새로 등록할 도장 JIG 항목이 없습니다.</p>'}</div>
            ${hiddenHtml}`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" onclick="JigModule.saveBatch()">
                <span class="material-symbols-outlined" style="font-size:0.9rem;vertical-align:middle;">save</span> 일괄 저장
             </button>`,
            'xl'
        );
    }

    function filterBatchCar(carModel) {
        document.querySelectorAll('#batchJigForm .jig-batch-car-group').forEach(group => {
            group.style.display = (!carModel || group.dataset.car === carModel) ? '' : 'none';
        });
    }

    function _refreshBatchRegisterModal(fromNestedModal) {
        UIUtils.closeModal();
        setTimeout(() => {
            if (fromNestedModal) UIUtils.closeModal();
            openBatchRegisterModal();
            loadAll();
        }, 0);
    }

    function _collectBatchRowsFromForm() {
        const rows = {};
        const form = document.getElementById('batchJigForm');
        if (!form) return rows;
        form.querySelectorAll('[data-ri]').forEach(el => {
            const ri = el.dataset.ri;
            if (!rows[ri]) rows[ri] = {};
            rows[ri][el.dataset.field] = el.value;
        });
        return rows;
    }

    async function updateRegisteredMaxCount(id) {
        const input = document.getElementById('batchDoneMax_' + id);
        const maxCount = parseInt(input && input.value || 0);
        if (!maxCount) {
            UIUtils.toast('수명 횟수를 입력하세요.', 'warning');
            return;
        }
        const jig = Storage.getById(STORE, id);
        if (!jig) {
            UIUtils.toast('JIG 정보를 찾을 수 없습니다.', 'warning');
            return;
        }
        await Storage.update(STORE, id, { ...jig, maxCount, updatedAt: new Date().toISOString() });
        UIUtils.toast('수명 횟수가 수정되었습니다.', 'success');
        _refreshBatchRegisterModal(false);
    }

    function openBatchMergeModal() {
        const rows = _collectBatchRowsFromForm();
        const selected = Array.from(document.querySelectorAll('#batchJigForm [data-merge-ri]:checked'))
            .map(chk => rows[chk.dataset.mergeRi])
            .filter(Boolean);
        if (selected.length < 2) {
            UIUtils.toast('병합할 품목을 2개 이상 선택하세요.', 'warning');
            return;
        }
        const carSet = [...new Set(selected.map(r => r.carModel))];
        const lineSet = [...new Set(selected.map(r => r.line))];
        if (carSet.length > 1 || lineSet.length > 1) {
            UIUtils.toast('병합은 같은 차종, 같은 라인끼리만 가능합니다.', 'warning');
            return;
        }
        _batchMergeRows = selected;
        const maxCount = selected.map(r => parseInt(r.maxCount || 0)).find(Boolean) || '';
        const defaultName = selected[0].partName || '';
        UIUtils.showModal(
            'JIG 품목 병합',
            `<div style="font-size:0.82rem;color:var(--text-muted);margin-bottom:12px;padding:10px 12px;background:var(--bg-secondary);border-radius:8px;">
                선택한 품목들은 하나의 JIG 수명으로 누적됩니다. 데이터 보정/재계산 시 아래 모든 품명이 같은 JIG로 연결됩니다.
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group"><label class="form-label">차종</label><input class="form-input" value="${_esc(carSet[0])}" disabled></div>
                <div class="form-group"><label class="form-label">라인</label><input class="form-input" value="${_esc(lineSet[0])}" disabled></div>
                <div class="form-group" style="grid-column:1 / -1;"><label class="form-label">대표 JIG 품명</label><input class="form-input" id="mergeJigPartName" value="${_esc(defaultName)}"></div>
                <div class="form-group"><label class="form-label">수명 횟수</label><input type="number" class="form-input" id="mergeJigMaxCount" value="${maxCount}" min="1"></div>
            </div>
            <div style="margin-top:10px;font-size:0.82rem;">
                <div style="font-weight:700;margin-bottom:6px;">병합 품목</div>
                <ul style="margin:0;padding-left:20px;line-height:1.7;">${selected.map(r => `<li>${_esc(r.partName)}</li>`).join('')}</ul>
            </div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" onclick="JigModule.saveBatchMerge()">병합 저장</button>`,
            'lg'
        );
    }

    async function saveBatchMerge() {
        if (!_batchMergeRows.length) return;
        const carModel = _batchMergeRows[0].carModel;
        const line = _batchMergeRows[0].line;
        const partAliases = [...new Set(_batchMergeRows.map(r => r.partName).filter(Boolean))];
        const partName = document.getElementById('mergeJigPartName')?.value.trim() || partAliases[0];
        const maxCount = parseInt(document.getElementById('mergeJigMaxCount')?.value || 0);
        if (!maxCount) {
            UIUtils.toast('수명 횟수를 입력하세요.', 'warning');
            return;
        }

        const allJigs = Storage.getAll(STORE) || [];
        const selectedIds = [...new Set(_batchMergeRows.map(r => r.id).filter(Boolean))];
        let target = selectedIds.length ? allJigs.find(j => j.id === selectedIds[0]) : null;
        if (!target) target = allJigs.find(j => j.carModel === carModel && j.line === line && partAliases.some(p => _jigMatchesPart(j, p)));

        const payload = {
            ...(target || {}),
            carModel,
            partName,
            partAliases,
            line,
            maxCount,
            registDate: (target && target.registDate) || _today(),
            merged: true,
            updatedAt: new Date().toISOString()
        };

        let targetId = target && target.id;
        if (targetId) {
            await Storage.update(STORE, targetId, payload);
        } else {
            const added = await Storage.add(STORE, payload);
            targetId = added && added.id;
        }

        if (targetId) {
            const logs = Storage.getAll(LOG_STORE) || [];
            for (const id of selectedIds) {
                if (id === targetId) continue;
                for (const log of logs.filter(l => l.jigId === id)) {
                    await Storage.update(LOG_STORE, log.id, { ...log, jigId: targetId, note: `${log.note || ''} / 병합 이전` });
                }
                await Storage.remove(STORE, id);
            }
        }

        UIUtils.toast(`JIG 병합 완료 (${partAliases.length}개 품목)`, 'success');
        _batchMergeRows = [];
        _refreshBatchRegisterModal(true);
    }

    async function saveBatch() {
        const rows = _collectBatchRowsFromForm();
        let saved = 0;
        let skipped = 0;
        for (const r of Object.values(rows)) {
            const maxCount = parseInt(r.maxCount || 0);
            if (!maxCount) {
                skipped++;
                continue;
            }
            const data = { carModel: r.carModel, partName: r.partName, line: r.line, maxCount, registDate: _today() };
            if (r.id) {
                const prev = Storage.getById(STORE, r.id) || {};
                await Storage.update(STORE, r.id, { ...prev, ...data });
            } else {
                const existing = _findJigForProduct(Storage.getAll(STORE) || [], r.carModel, r.partName, r.line);
                if (existing) await Storage.update(STORE, existing.id, { ...existing, maxCount });
                else await Storage.add(STORE, data);
            }
            saved++;
        }
        UIUtils.toast(`저장 완료: ${saved}건 저장, ${skipped}건 건너뜀`, 'success');
        UIUtils.closeModal();
        loadAll();
    }

    function _carModelOptions(selected = '') {
        // 도장 공정이 있는 제품의 차종만 표시
        const paintingProds = _paintingProducts();
        const cars = [...new Set(paintingProds.map(p => p.carModel).filter(Boolean))];
        if (selected && !cars.includes(selected)) cars.push(selected);
        cars.sort((a, b) => a.localeCompare(b, 'ko'));
        const note = cars.length === 0
            ? '<option value="" disabled>도장 공정 제품 없음</option>'
            : '';
        return `<option value="">선택</option>${note}` + cars.map(c => `<option value="${_esc(c)}" ${c === selected ? 'selected' : ''}>${_esc(c)}</option>`).join('');
    }

    function _partNameOptions(carModel, selected = '') {
        // 도장 공정이 있는 제품의 품명만 표시
        const paintingProds = _paintingProducts();
        const parts = [...new Set(
            paintingProds.filter(p => !carModel || p.carModel === carModel)
                      .map(p => p.partName).filter(Boolean)
        )];
        // 기존 대장 품명이 마스터 목록에 없어도 보기/수정 시 표시
        if (selected && !parts.includes(selected)) parts.push(selected);
        const sorted = [...parts].sort((a, b) => a.localeCompare(b, 'ko'));
        return `<option value="">선택</option>` + sorted.map(p => `<option value="${_esc(p)}" ${p === selected ? 'selected' : ''}>${_esc(p)}</option>`).join('');
    }

    function _masterSelectedPartNames(d = {}) {
        return [...new Set(_jigPartNames(d))];
    }

    function _masterPartListForCar(carModel, selectedParts = []) {
        const paintingProds = _paintingProducts();
        const parts = [...new Set(
            paintingProds.filter(p => !carModel || p.carModel === carModel)
                .map(p => p.partName).filter(Boolean)
        )];
        (selectedParts || []).forEach(p => {
            if (p && !parts.includes(p)) parts.push(p);
        });
        return parts.sort((a, b) => a.localeCompare(b, 'ko'));
    }

    function _masterPartNamesFieldHtml(carModel, selectedParts = [], readOnly = false) {
        const selected = [...new Set((selectedParts || []).filter(Boolean))];
        if (readOnly) {
            if (!selected.length) {
                return `<div style="padding:10px 12px;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:8px;">품명 없음</div>`;
            }
            return `<div style="display:flex;flex-wrap:wrap;gap:6px;">
                ${selected.map((p, i) => `
                    <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;font-size:0.78rem;font-weight:${i === 0 ? 700 : 500};
                        background:${i === 0 ? 'rgba(37,99,235,0.12)' : 'var(--bg-secondary)'};color:${i === 0 ? 'var(--accent-blue)' : 'var(--text-primary)'};border:1px solid ${i === 0 ? 'rgba(37,99,235,0.35)' : 'var(--border-color)'};">
                        ${i === 0 ? '대표 · ' : ''}${_esc(p)}
                    </span>`).join('')}
            </div>
            ${selected.length > 1 ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-top:6px;">공용 지그 · ${selected.length}개 품명</div>` : ''}`;
        }
        const parts = _masterPartListForCar(carModel, selected);
        if (!parts.length) {
            return `<div id="jigMasterPartPick" style="padding:10px 12px;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:8px;">해당 차종의 도장 제품이 없습니다.</div>`;
        }
        return `
            <div id="jigMasterPartPick" style="max-height:180px;overflow:auto;border:1px solid var(--border-color);border-radius:8px;padding:8px 10px;background:var(--bg-secondary);">
                ${parts.map(p => `
                    <label style="display:flex;align-items:center;gap:8px;padding:4px 2px;font-size:0.82rem;cursor:pointer;">
                        <input type="checkbox" class="jigMasterPartChk" value="${_esc(p)}" ${selected.includes(p) ? 'checked' : ''} onchange="JigModule.recalcMasterOrderQty()">
                        <span>${_esc(p)}</span>
                    </label>`).join('')}
            </div>
            <div style="font-size:0.72rem;color:var(--text-muted);margin-top:6px;">공용 지그는 품명을 여러 개 선택하세요. 기존 대표 품명은 유지되고, 없으면 목록에서 먼저 체크된 항목이 대표가 됩니다.</div>`;
    }

    function _collectMasterPartNames() {
        const checked = Array.from(document.querySelectorAll('.jigMasterPartChk:checked'))
            .map(el => (el.value || '').trim())
            .filter(Boolean);
        return [...new Set(checked)];
    }

    function onCarModelChange() {
        const car = document.getElementById('jigCarModel')?.value || '';
        const sel = document.getElementById('jigPartName');
        if (sel) sel.innerHTML = _partNameOptions(car);
    }

    function _formHtml(d = {}) {
        return `
        <div style="margin-bottom:12px;padding:8px 12px;background:rgba(99,102,241,0.07);
                    border:1px solid rgba(99,102,241,0.3);border-radius:6px;
                    font-size:0.8rem;color:var(--text-secondary);display:flex;align-items:center;gap:6px;">
            <span class="material-symbols-outlined" style="font-size:16px;color:#6366f1;">info</span>
            제품 정보의 <b style="color:#6366f1;">도장 공정</b>이 설정된 제품만 선택 가능합니다.
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div class="form-group">
                <label class="form-label">차종 <span style="color:var(--accent-red)">*</span></label>
                <select class="form-select" id="jigCarModel" onchange="JigModule.onCarModelChange()">${_carModelOptions(d.carModel || '')}</select>
            </div>
            <div class="form-group">
                <label class="form-label">제품명 <span style="color:var(--accent-red)">*</span></label>
                <select class="form-select" id="jigPartName">${_partNameOptions(d.carModel || '', d.partName || '')}</select>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
            <div class="form-group">
                <label class="form-label">도장라인 <span style="color:var(--accent-red)">*</span></label>
                <select class="form-select" id="jigLine">
                    <option value="A라인" ${d.line === 'A라인' ? 'selected' : ''}>A라인</option>
                    <option value="B라인" ${d.line === 'B라인' ? 'selected' : ''}>B라인</option>
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">JIG 번호</label>
                <input type="text" class="form-input" id="jigNo" value="${_esc(d.jigNo || '')}" placeholder="예: JIG-001">
            </div>
            <div class="form-group">
                <label class="form-label">수명 횟수 <span style="color:var(--accent-red)">*</span></label>
                <input type="number" class="form-input" id="jigMaxCount" value="${d.maxCount || ''}" placeholder="예: 10000" min="1">
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;">
            <div class="form-group"><label class="form-label">제작처</label><input type="text" class="form-input" id="jigMaker" value="${_esc(d.maker || '')}"></div>
            <div class="form-group"><label class="form-label">재질</label><input type="text" class="form-input" id="jigMaterial" value="${_esc(d.material || '')}" placeholder="예: SUS, AL"></div>
            <div class="form-group"><label class="form-label">단가</label><input type="number" class="form-input" id="jigUnitPrice" value="${d.unitPrice || ''}" min="0"></div>
            <div class="form-group"><label class="form-label">등록일</label><input type="date" class="form-input" id="jigRegistDate" value="${d.registDate || _today()}"></div>
        </div>
        <div class="form-group"><label class="form-label">비고</label><textarea class="form-textarea" id="jigNote" rows="2">${_esc(d.note || '')}</textarea></div>`;
    }

    function _collectForm() {
        const carModel = document.getElementById('jigCarModel')?.value.trim();
        const partName = document.getElementById('jigPartName')?.value.trim();
        const maxCount = parseInt(document.getElementById('jigMaxCount')?.value || 0);
        if (!carModel) { UIUtils.toast('차종을 선택하세요.', 'warning'); return null; }
        if (!partName) { UIUtils.toast('제품명을 선택하세요.', 'warning'); return null; }
        if (!maxCount) { UIUtils.toast('수명 횟수를 입력하세요.', 'warning'); return null; }
        return {
            carModel,
            partName,
            line: document.getElementById('jigLine')?.value || 'A라인',
            jigNo: document.getElementById('jigNo')?.value.trim() || '',
            maxCount,
            maker: document.getElementById('jigMaker')?.value.trim() || '',
            material: document.getElementById('jigMaterial')?.value.trim() || '',
            unitPrice: parseInt(document.getElementById('jigUnitPrice')?.value || 0) || 0,
            registDate: document.getElementById('jigRegistDate')?.value || _today(),
            note: document.getElementById('jigNote')?.value.trim() || ''
        };
    }

    function _lineForMaster(carModel, partName) {
        const prod = _paintingProducts().find(p => p.carModel === carModel && p.partName === partName);
        const lines = _getProductPaintingLines(prod);
        return lines[0] || 'A라인';
    }

    const APPLIED_LINE_OPTIONS = ['도장-A', '도장-B'];

    function _appliedLineBadges(appliedLines) {
        const lines = Array.isArray(appliedLines) ? appliedLines.filter(Boolean) : [];
        if (!lines.length) return '<span style="color:var(--text-muted);">-</span>';
        return lines.map(l => `<span style="background:var(--accent-blue);color:#fff;padding:1px 6px;border-radius:4px;font-size:0.7rem;margin-right:4px;white-space:nowrap;">${_esc(l)}</span>`).join('');
    }

    function _photoThumbs(jig, key) {
        const photos = Array.isArray(jig[key]) ? jig[key].filter(Boolean).slice(0, 2) : [];
        if (!photos.length) return '<span style="color:var(--text-muted);">-</span>';
        return `<div style="display:flex;gap:6px;justify-content:center;">${photos.map((src, idx) => `
            <button type="button" class="btn btn-outline btn-sm" style="padding:2px;border-radius:6px;"
                onclick="JigModule.viewJigPhoto('${_js(jig.id)}','${_js(key)}',${idx})">
                <img src="${_esc(_jigPhotoSrc(src))}" alt="" style="width:42px;height:32px;object-fit:cover;border-radius:4px;display:block;">
            </button>
        `).join('')}</div>`;
    }

    const CAR_ORDER = ['GOLF7','GOLF-7','A3','A3(PA)','Q2','A3 PA','A8','XFD','J34A','T1XX','DECO','EMBLEM','C223','FORD','P702','C300','리비안'];

    /* 제품 구분(양산/개발/A·S) 배지 색상 — 안전관리 MSDS 화면과 동일 컨벤션 */
    const PROD_COLORS = { '양산': '#059669', 'A/S': '#2563eb', '개발': '#7c3aed' };

    /* itemType 정규화: '양산품'→'양산', 'A/S품'→'A/S' */
    function _normItemType(raw) {
        if (!raw) return '';
        return String(raw).replace(/품$/, '').trim();
    }

    /* 차종+품명 → 제품 itemType 조회맵 (도장 지그는 제품을 직접 참조하지 않고 텍스트로 저장되어 있어 매칭) */
    function _productItemTypeMap() {
        const map = {};
        (Storage.getAll(DB.STORES.PRODUCTS) || []).forEach(p => {
            const key = `${p.carModel || ''}||${p.partName || ''}`;
            map[key] = _normItemType(p.itemType);
        });
        return map;
    }

    function _itemTypeBadge(pt) {
        if (!pt) return `<span style="font-size:.63rem;background:#f3f4f6;color:#9ca3af;border-radius:3px;padding:1px 5px;">미지정</span>`;
        const col = PROD_COLORS[pt] || '#9ca3af';
        return `<span style="font-size:.63rem;background:${col}22;color:${col};border-radius:3px;padding:1px 5px;font-weight:700;">${_esc(pt)}</span>`;
    }

    /* A/S는 목록·필터 결과에서 항상 하단 */
    function _itemTypeSortRank(pt) {
        return _normItemType(pt) === 'A/S' ? 1 : 0;
    }

    function _jigItemType(j, itemTypeMap) {
        return itemTypeMap[`${j.carModel || ''}||${j.partName || ''}`] || '';
    }

    function _sortJigMasterList(jigs, itemTypeMap) {
        return jigs.slice().sort((a, b) => {
            const aAs = _itemTypeSortRank(_jigItemType(a, itemTypeMap));
            const bAs = _itemTypeSortRank(_jigItemType(b, itemTypeMap));
            if (aAs !== bAs) return aAs - bAs;
            const ai = CAR_ORDER.indexOf(a.carModel);
            const bi = CAR_ORDER.indexOf(b.carModel);
            if (ai !== bi) return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
            return (a.partName || '').localeCompare(b.partName || '', 'ko');
        });
    }

    function renderJigMaster() {
        const el = document.getElementById('jigMasterView');
        if (!el) return;
        const itemTypeMap = _productItemTypeMap();
        const jigs = _sortJigMasterList(
            (Storage.getAll(STORE) || []).filter(j => !_masterCarFilter || j.carModel === _masterCarFilter),
            itemTypeMap
        );
        el.innerHTML = `
            <div class="card">
                <div class="card-body">
                    <h4 style="margin:0 0 12px;">도장 지그 대장</h4>
                    <div style="margin-bottom:10px;padding:8px 12px;background:rgba(37,99,235,0.06);border:1px solid rgba(37,99,235,0.18);border-radius:8px;font-size:0.78rem;color:var(--text-secondary);line-height:1.45;">
                        수명 근거: <strong>제한 두께 도달 도장횟수 = JIG 제한 두께 ÷ 1회 도막형성 두께</strong>
                        · <strong>수명 관리 설정 횟수 = 도달 횟수 × 90%</strong> (내림)
                    </div>
                    <div class="data-table-wrapper" style="overflow-x:auto;">
                        <table class="data-table data-table--content">
                            <thead>
                                <tr>
                                    <th>차종</th>
                                    <th>구분</th>
                                    <th>품명</th>
                                    <th style="text-align:right;">초기두께<br><small style="font-weight:400;">(mm)</small></th>
                                    <th style="text-align:right;">1회도막<br><small style="font-weight:400;">(mm)</small></th>
                                    <th style="text-align:right;">제한두께<br><small style="font-weight:400;">(mm)</small></th>
                                    <th style="text-align:right;">도달횟수<br><small style="font-weight:400;">(회)</small></th>
                                    <th style="text-align:right;">관리횟수<br><small style="font-weight:400;">(회)</small></th>
                                    <th style="text-align:right;">발주</th>
                                    <th>적용라인</th>
                                    <th>재질</th>
                                    <th>구매처</th>
                                    <th>제작일</th>
                                    <th>지그사진</th>
                                    <th>결합사진</th>
                                    <th>측정포인트</th>
                                    <th>작업</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${jigs.length ? jigs.map(j => {
                                    const calc = _calcLifeFromThickness(j.limitThicknessMm, j.filmThicknessMm);
                                    const limitCoat = Number(j.limitCoatCount) > 0 ? Number(j.limitCoatCount) : calc.limitCoatCount;
                                    const manage = Number(j.maxCount) > 0 ? Number(j.maxCount) : calc.manageCount;
                                    const allParts = _masterSelectedPartNames(j);
                                    const aliases = allParts.filter(p => p !== j.partName);
                                    return `
                                    <tr>
                                        <td><strong>${_esc(j.carModel || '-')}</strong></td>
                                        <td>${_itemTypeBadge(itemTypeMap[`${j.carModel || ''}||${j.partName || ''}`])}</td>
                                        <td title="${_esc(allParts.join(', '))}">
                                            <span style="font-weight:600;">${_esc(j.partName || '-')}</span>
                                            ${aliases.length ? `<span style="font-size:0.72rem;color:var(--text-muted);margin-left:6px;">+${aliases.length}</span>` : ''}
                                        </td>
                                        <td style="text-align:right;">${_fmtMm(j.initialThicknessMm)}</td>
                                        <td style="text-align:right;">${_fmtMm(j.filmThicknessMm)}</td>
                                        <td style="text-align:right;">${_fmtMm(j.limitThicknessMm)}</td>
                                        <td style="text-align:right;font-weight:600;">${_fmtCountOrDash(limitCoat)}</td>
                                        <td style="text-align:right;font-weight:800;color:var(--accent-blue);">${_fmtCountOrDash(manage)}</td>
                                        <td style="text-align:right;">${j.orderQty ? _fmt(j.orderQty) : '-'}</td>
                                        <td>${_appliedLineBadges(j.appliedLines)}</td>
                                        <td>${_esc(j.material || '-')}</td>
                                        <td>${_esc(j.supplier || '-')}</td>
                                        <td>${_esc(j.madeDate || j.registDate || '-')}</td>
                                        <td>${_photoThumbs(j, 'jigPhotos')}</td>
                                        <td>${_photoThumbs(j, 'productFitPhotos')}</td>
                                        <td>${_photoThumbs(j, 'thicknessPointPhotos')}</td>
                                        <td>
                                            <button class="btn btn-outline btn-sm" onclick="JigModule.openJigMasterModal('${_js(j.id)}')">보기</button>
                                        </td>
                                    </tr>`;
                                }).join('') : `
                                    <tr><td colspan="17" style="text-align:center;padding:36px;color:var(--text-muted);white-space:normal;">등록된 도장 지그가 없습니다.</td></tr>
                                `}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>`;
    }

    function onMasterCarFilterChange() {
        _masterCarFilter = document.getElementById('jigMasterCarFilter')?.value || '';
        renderJigMaster();
    }

    function renderMasterPage(container) {
        const cars = [...new Set((Storage.getAll(STORE) || []).map(j => j.carModel).filter(Boolean))]
            .sort((a, b) => {
                const ai = CAR_ORDER.indexOf(a);
                const bi = CAR_ORDER.indexOf(b);
                if (ai !== bi) return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
                return a.localeCompare(b, 'ko');
            });
        container.innerHTML = `
        <div class="fade-in-up jig-page">
            ${renderMenu('jig-master', '도장 지그대장', '도장 지그의 기본 정보와 사진 자료를 관리합니다.')}
            <div class="page-header">
                <div class="page-actions">
                    <button class="btn btn-primary btn-sm" onclick="JigModule.openJigMasterModal()">
                        <span class="material-symbols-outlined">add</span> 지그 등록
                    </button>
                    <select id="jigMasterCarFilter" class="form-select" style="width:220px;height:34px;font-size:0.78rem;padding:5px 28px 5px 10px;" onchange="JigModule.onMasterCarFilterChange()">
                        <option value="">전체 차종</option>
                        ${cars.map(car => `<option value="${_esc(car)}" ${car === _masterCarFilter ? 'selected' : ''}>${_esc(car)}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div id="jigMasterView"></div>
        </div>`;
        renderJigMaster();
    }

    async function renderHub(container) {
        const jigs = _enrichedJigs();
        const total = jigs.length;
        const warning = jigs.filter(j => _lifePct(j) >= 80 && _lifePct(j) < 100).length;
        const exceeded = jigs.filter(j => _lifePct(j) >= 100).length;
        const normal = total - warning - exceeded;
        const aCount = jigs.filter(j => j.line === 'A라인').length;
        const bCount = jigs.filter(j => j.line === 'B라인').length;
        const disposal = await _loadConfigList(DISPOSAL_KEY);
        const repair = await _loadConfigList(REPAIR_KEY);
        const changeLogs = (Storage.getAll(LOG_STORE) || []).filter(l => _isResetWorkType(l.workType));
        const ordering = Storage.getAll(DB.STORES.JIG_ORDERING) || [];

        container.innerHTML = `
            <div class="fade-in-up jig-page">
                ${renderMenu('painting-jig', '도장지그', '도장 지그의 수명, 대장, 보관 레이아웃, 이력을 한 화면에서 관리합니다.')}
                <div class="section-card" style="padding:0;overflow:hidden;">
                    <div style="padding:22px;">
                        <div class="jig-hub-stats">
                            <div class="stat-card blue"><div class="stat-card-value">${_fmt(total)}</div><div class="stat-card-label">전체 지그</div></div>
                            <div class="stat-card green"><div class="stat-card-value">${_fmt(normal)}</div><div class="stat-card-label">정상</div></div>
                            <div class="stat-card orange"><div class="stat-card-value">${_fmt(warning)}</div><div class="stat-card-label">수명 임박</div></div>
                            <div class="stat-card red"><div class="stat-card-value">${_fmt(exceeded)}</div><div class="stat-card-label">수명 초과</div></div>
                            <div class="stat-card cyan"><div class="stat-card-value">${_fmt(aCount)}</div><div class="stat-card-label">A라인</div></div>
                            <div class="stat-card purple"><div class="stat-card-value">${_fmt(bCount)}</div><div class="stat-card-label">B라인</div></div>
                        </div>
                        <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-top:18px;">
                            ${_homeCard('수명관리', '사용 횟수 기준으로 정상, 임박, 초과 지그를 확인합니다.', 'monitor_heart', `${warning + exceeded}건 주의`, 'jig-management', 'blue')}
                            ${_homeCard('수명 기준서', '지그 수명 관리 기준을 문서 형태로 작성하고 인쇄합니다.', 'description', '기준서', 'jig-life-standard', 'cyan')}
                            ${_homeCard('도장 지그대장', '차종, 품명, 수명 횟수, 사진 등 지그 기본 정보를 등록합니다.', 'fact_check', `${total}건`, 'jig-master', 'green')}
                            ${_homeCard('지그창고 레이아웃', '지그 보관 위치를 시각적으로 배치하고 확인합니다.', 'map', '배치도', 'jig-layout', 'purple')}
                            ${_homeCard('지그 폐기 대장', '폐기된 지그의 일자, 사유, 담당자 이력을 남깁니다.', 'delete_sweep', `${disposal.length}건`, 'jig-disposal', 'red')}
                            ${_homeCard('지그 발주 관리', '지그 발주 일자, 납기일, 상태를 관리합니다.', 'shopping_cart', `${ordering.length}건`, 'jig-ordering', 'blue')}
                            ${_homeCard('조치 이력', '수명 초기화 및 교체/박리 세척 기록을 확인합니다.', 'sync_alt', `${changeLogs.length}건`, 'jig-change-history', 'orange')}
                            ${_homeCard('지그수리/개선 이력', '수리, 개선, 보완 작업 내역과 진행 상태를 관리합니다.', 'build_circle', `${repair.length}건`, 'jig-repair-history', 'red')}
                        </div>
                    </div>
                </div>
            </div>`;
    }

    async function renderLifeStandardPage(container) {
        _lifeStandardImage = await _loadLifeStandardImage();
        const canUpload = _canUploadLifeStandard();
        container.innerHTML =             `
            <div class="fade-in-up jig-page">
                ${renderMenu('jig-life-standard', '지그수명기준서', '도장 지그 수명 관리 기준서를 등록하고 인쇄합니다.')}
                <div class="page-header">
                    <div class="page-actions" style="display:flex;justify-content:flex-end;gap:6px;width:100%;">
                        <button class="btn btn-outline btn-sm" onclick="JigModule.printLifeStandardPage()"
                            style="padding:5px 10px;font-size:0.76rem;line-height:1.2;min-height:auto;">
                            <span class="material-symbols-outlined" style="font-size:15px;">print</span> 인쇄
                        </button>
                        <button class="btn btn-outline btn-sm" onclick="JigModule.focusLifeStandardPasteZone()"
                            ${canUpload ? '' : 'disabled'}
                            style="padding:5px 10px;font-size:0.76rem;line-height:1.2;min-height:auto;${canUpload ? '' : 'opacity:.5;cursor:not-allowed;'}">
                            <span class="material-symbols-outlined" style="font-size:15px;">upload_file</span> 기준서 업로드
                        </button>
                    </div>
                </div>

                <style>
                    .jig-life-standard-wrap {
                        display:inline-block;
                        width:auto;
                        max-width:100%;
                        background:linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
                        overflow:auto;
                        padding:18px 18px 24px;
                        border-radius:18px;
                        box-shadow:0 18px 42px rgba(15,23,42,0.14), 0 6px 14px rgba(15,23,42,0.10);
                    }
                    .jig-life-standard-doc {
                        width:auto;
                        color:#111827;
                        font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;
                        background:transparent;
                    }
                    @media print {
                        .page-header, .jig-page > div:first-child { display:none !important; }
                        .jig-life-standard-wrap { border:none; overflow:visible; box-shadow:none !important; padding:0; background:#fff; }
                        .jig-life-standard-doc { width:auto; }
                    }
                </style>

                <div class="section-card jig-life-standard-wrap">
                    <div id="jigLifeStandardDoc" class="jig-life-standard-doc">
                        <div id="jigLifeStandardPasteZone" tabindex="0" onpaste="JigModule.handleLifeStandardPaste(event)"
                            style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;" aria-hidden="true"></div>
                        ${_lifeStandardImage
                            ? `<div style="display:inline-flex;justify-content:flex-start;align-items:flex-start;width:fit-content;max-width:100%;border:1px solid #111;box-shadow:0 10px 28px rgba(15,23,42,0.18), 0 3px 8px rgba(15,23,42,0.12);">
                                <img src="${_lifeStandardImage}" alt="지그 수명 관리 기준서"
                                    style="display:block;max-width:100%;height:auto;">
                               </div>`
                            : `<div style="min-width:980px;min-height:1385px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:1rem;">
                                등록된 기준서 이미지가 없습니다.
                               </div>`}
                    </div>
                </div>
            </div>`;
    }

    function focusLifeStandardPasteZone() {
        if (!_canUploadLifeStandard()) {
            UIUtils.toast('지그 기준서 업로드는 관리자 또는 관리 권한자만 가능합니다.', 'warning');
            return;
        }
        _ensureJigPasteListener();
        _lifeStandardPasteArmed = true;
        const zone = document.getElementById('jigLifeStandardPasteZone');
        if (zone) zone.focus();
        UIUtils.toast('기준서 업로드 영역이 선택되었습니다. Ctrl+V로 붙여넣어 주세요.', 'info');
    }

    async function handleLifeStandardPaste(event) {
        event.preventDefault();
        if (!_canUploadLifeStandard()) {
            UIUtils.toast('기준서 업로드 권한이 없습니다.', 'warning');
            return;
        }
        const items = Array.from(event.clipboardData?.items || []);
        const imageItem = items.find(item => item.type && item.type.startsWith('image/'));
        if (!imageItem) {
            UIUtils.toast('클립보드 이미지가 없습니다. 엑셀이나 화면을 복사한 뒤 다시 붙여넣어 주세요.', 'warning');
            return;
        }
        const file = imageItem.getAsFile();
        if (!file) {
            UIUtils.toast('이미지 읽기 중 오류가 발생했습니다.', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                _lifeStandardImage = reader.result;
                await _saveLifeStandardImage(_lifeStandardImage);
                UIUtils.toast('기준서 이미지가 저장되었습니다.', 'success');
                const root = document.querySelector('.jig-page');
                if (root && root.parentElement) await renderLifeStandardPage(root.parentElement);
            } catch (error) {
                console.error('Failed to save jig life standard image:', error);
                UIUtils.toast('기준서 저장 중 오류가 발생했습니다.', 'error');
            }
        };
        reader.onerror = () => UIUtils.toast('클립보드 이미지를 읽을 수 없습니다.', 'error');
        reader.readAsDataURL(file);
    }

    function printLifeStandardPage() {
        const img = document.querySelector('#jigLifeStandardDoc img');
        const imageSrc = img ? String(img.getAttribute('src') || '') : String(_lifeStandardImage || '');
        if (!imageSrc) {
            UIUtils.toast('인쇄할 기준서가 없습니다. 먼저 기준서를 업로드해 주세요.', 'warning');
            return;
        }
        const win = window.open('', 'jig_life_standard_print', 'width=1200,height=900');
        if (!win) {
            UIUtils.toast('인쇄할 기준서가 없습니다. 먼저 기준서를 업로드해 주세요.', 'warning');
            return;
        }
        win.document.open();
        win.document.write(`
            <!doctype html>
            <html lang="ko">
            <head>
                <meta charset="utf-8">
                <title>지그 수명 관리 기준서</title>
                <style>
                    @page { size: A4 landscape; margin:4mm 6mm 6mm 6mm; }
                    html, body {
                        margin:0;
                        padding:0;
                        background:#fff;
                    }
                    body {
                        font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;
                        display:flex;
                        align-items:flex-start;
                        justify-content:center;
                        overflow:hidden;
                    }
                    .print-sheet {
                        width:285mm;
                        height:198mm;
                        display:flex;
                        align-items:flex-start;
                        justify-content:center;
                        overflow:hidden;
                        margin:0 auto;
                        padding-top:1mm;
                    }
                    img {
                        display:block;
                        width:auto;
                        height:auto;
                        max-width:285mm;
                        max-height:197mm;
                        object-fit:contain;
                        break-inside:avoid;
                        page-break-inside:avoid;
                    }
                    * {
                        box-sizing:border-box;
                        break-inside:avoid;
                        page-break-inside:avoid;
                    }
                </style>
            </head>
            <body>
                <div class="print-sheet">
                    <img src="${imageSrc}" alt="지그 수명 관리 기준서">
                </div>
            </body>
            </html>
        `);
        win.document.close();
        win.focus();
        win.print();
    }

    function onMasterCarModelChange() {
        const car = document.getElementById('jigMasterCarModel')?.value || '';
        const wrap = document.getElementById('jigMasterPartField');
        if (!wrap) return;
        const keep = _collectMasterPartNames();
        wrap.innerHTML = _masterPartNamesFieldHtml(car, keep, false);
        recalcMasterOrderQty();
    }

    function _getProductCvtForAppliedLine(carModel, partName, appliedLine) {
        const prod = (Storage.getAll(DB.STORES.PRODUCTS) || []).find(function (p) {
            return p.carModel === carModel && p.partName === partName;
        });
        if (!prod) return 0;
        if (appliedLine) {
            for (let i = 1; i <= 4; i++) {
                if ((prod['process' + i] || '') === appliedLine) {
                    const v = Number(prod['cvt' + i]) || 0;
                    if (v) return v;
                }
            }
        }
        for (let i = 1; i <= 4; i++) {
            if (String(prod['process' + i] || '').includes('도장')) {
                const v = Number(prod['cvt' + i]) || 0;
                if (v) return v;
            }
        }
        return Number(prod.cvt1) || 0;
    }

    function _isIntegratedJigChecked() {
        return !!document.getElementById('jigMasterIntegratedJig')?.checked;
    }

    function _getIntegratedJigCvt() {
        if (!_isIntegratedJigChecked()) return 0;
        return Number(document.getElementById('jigMasterIntegratedJigCvt')?.value) || 0;
    }

    function _syncIntegratedJigCvtField() {
        const wrap = document.getElementById('jigMasterIntegratedJigCvtWrap');
        if (!wrap) return;
        wrap.style.display = _isIntegratedJigChecked() ? '' : 'none';
    }

    function onIntegratedJigToggle() {
        _syncIntegratedJigCvtField();
        recalcMasterOrderQty();
    }

    function _calcLineOrderQty(carModel, partName, appliedLine, spindle, integrated, integratedCvt) {
        const masterCvt = _getProductCvtForAppliedLine(carModel, partName, appliedLine);
        if (!masterCvt && !integrated) {
            return { orderQty: 0, needQty: 0, cvt: 0, masterCvt: 0, hint: appliedLine + ' CVT 없음' };
        }
        if (integrated) {
            const manualCvt = Number(integratedCvt) || 0;
            if (!manualCvt) {
                return { orderQty: 0, needQty: 0, cvt: 0, masterCvt: masterCvt, hint: appliedLine + ' 일체형 CVT 입력 필요' };
            }
            const needQty = spindle * manualCvt;
            const orderQty = Math.max(1, Math.ceil(needQty * LINE_ORDER_RATE));
            const cvtLabel = masterCvt > 0 && masterCvt !== manualCvt
                ? ('CVT ' + masterCvt + '→' + manualCvt + '(일체형)')
                : ('CVT ' + manualCvt + '(일체형)');
            return {
                orderQty: orderQty,
                needQty: needQty,
                cvt: manualCvt,
                masterCvt: masterCvt,
                hint: spindle.toLocaleString('ko-KR') + ' × ' + cvtLabel + ' = 필요 ' + needQty.toLocaleString('ko-KR') + ' EA × 101% → ' + orderQty.toLocaleString('ko-KR') + ' EA'
            };
        }
        const calcCvt = masterCvt;
        const needQty = spindle * calcCvt;
        const orderQty = Math.max(1, Math.ceil(needQty * LINE_ORDER_RATE));
        return {
            orderQty: orderQty,
            needQty: needQty,
            cvt: calcCvt,
            masterCvt: masterCvt,
            hint: spindle.toLocaleString('ko-KR') + ' × CVT ' + calcCvt + ' = 필요 ' + needQty.toLocaleString('ko-KR') + ' EA × 101% → ' + orderQty.toLocaleString('ko-KR') + ' EA'
        };
    }

    function _getAppliedPaintLines() {
        return Array.from(document.querySelectorAll('.jigMasterAppliedLine:checked'))
            .map(function (el) { return el.value; })
            .filter(function (line) { return line === '도장-A' || line === '도장-B'; });
    }

    function recalcMasterOrderQty() {
        const qtyEl = document.getElementById('jigMasterOrderQty');
        const hintEl = document.getElementById('jigMasterOrderQtyHint');
        if (!qtyEl) return;
        const autoLines = _getAppliedPaintLines();
        if (!autoLines.length) {
            qtyEl.readOnly = false;
            qtyEl.style.background = '';
            if (hintEl) hintEl.textContent = '도장-A/B 선택 시 자동 계산됩니다.';
            return;
        }
        const carModel = document.getElementById('jigMasterCarModel')?.value || '';
        const partName = (_collectMasterPartNames()[0] || '');
        if (!carModel || !partName) {
            qtyEl.value = '';
            qtyEl.readOnly = true;
            qtyEl.style.background = 'var(--bg-secondary)';
            if (hintEl) hintEl.textContent = '차종·품명 선택 후 발주 수량이 자동 계산됩니다.';
            return;
        }
        const hints = [];
        let totalOrder = 0;
        const integrated = _isIntegratedJigChecked();
        const integratedCvt = _getIntegratedJigCvt();
        _syncIntegratedJigCvtField();
        if (autoLines.includes('도장-A')) {
            const calcA = _calcLineOrderQty(carModel, partName, '도장-A', A_LINE_CYCLE, integrated, integratedCvt);
            if (calcA.orderQty > 0) totalOrder += calcA.orderQty;
            hints.push('도장-A: ' + calcA.hint);
        }
        if (autoLines.includes('도장-B')) {
            const calcB = _calcLineOrderQty(carModel, partName, '도장-B', B_LINE_CYCLE, integrated, integratedCvt);
            if (calcB.orderQty > 0) totalOrder += calcB.orderQty;
            hints.push('도장-B: ' + calcB.hint);
        }
        qtyEl.value = totalOrder > 0 ? totalOrder : '';
        qtyEl.readOnly = true;
        qtyEl.style.background = 'var(--bg-secondary)';
        if (hintEl) {
            hintEl.textContent = hints.length > 1
                ? ('합계 ' + totalOrder.toLocaleString('ko-KR') + ' EA · ' + hints.join(' / '))
                : (hints[0] || '발주 수량을 계산할 수 없습니다.');
        }
    }

    // 지그 대장 사진: 신규 저장분은 NAS 상대경로, 과거 저장분은 data: base64가 섞여 있을 수 있음
    function _jigPhotoSrc(src) {
        if (!src) return '';
        if (src.startsWith('data:') || src.startsWith('http')) return src;
        return (typeof ApiClient !== 'undefined' && ApiClient.photoUrl) ? ApiClient.photoUrl(src) : src;
    }

    const JIG_PHOTO_UPLOAD_OPTS = { maxSize: 4096, quality: 0.98 };
    const MASTER_PHOTO_VIEW_PX = 600;
    const MASTER_PHOTO_VIEW_IMG_STYLE = 'display:block;margin:0 auto;width:' + MASTER_PHOTO_VIEW_PX + 'px;height:' + MASTER_PHOTO_VIEW_PX + 'px;max-width:100%;object-fit:contain;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,.12);background:#fff;border:1px solid var(--border-color);';
    const JIG_PHOTO_VIEW_IMG_STYLE = 'display:block;margin:0 auto;width:auto;height:auto;max-width:min(96vw,100%);max-height:85vh;object-fit:contain;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,.12);background:#fff;border:1px solid var(--border-color);';
    const MASTER_PHOTO_THUMB_W = 172; // 143px + 20%
    const MASTER_PHOTO_THUMB_H = 113; // 94px + 20%
    const MASTER_PHOTO_THUMB_CSS = 'width:100%;max-width:' + MASTER_PHOTO_THUMB_W + 'px;height:' + MASTER_PHOTO_THUMB_H + 'px;object-fit:contain;background:#fff;border:1px solid var(--border-color);border-radius:6px;cursor:zoom-in;display:block;margin:0 auto;';
    const MASTER_PHOTO_EMPTY_CSS = 'width:100%;max-width:' + MASTER_PHOTO_THUMB_W + 'px;height:' + MASTER_PHOTO_THUMB_H + 'px;display:flex;align-items:center;justify-content:center;color:var(--text-muted);border:1px dashed var(--border-color);border-radius:6px;font-size:0.68rem;text-align:center;margin:0 auto;padding:4px;';

    function _isJigNativePhotoTarget(targetId) {
        if (!targetId) return false;
        const id = String(targetId).replace(/Preview$/, '');
        return /^(jigPhoto|productFitPhoto)\d+$/.test(id)
            || /^view_지그_사진_|^view_제품_결합_사진_/.test(id);
    }

    function _masterPhotoThumbHtml(photoSrc, targetId, emptyLabel) {
        const url = _jigPhotoSrc(photoSrc);
        const nativeView = _isJigNativePhotoTarget(targetId);
        if (!photoSrc) {
            return '<div id="' + targetId + 'Preview" style="' + MASTER_PHOTO_EMPTY_CSS + '">' + (emptyLabel || '사진 없음') + '</div>';
        }
        return '<img id="' + targetId + 'Preview" src="' + _esc(url) + '" alt="" style="' + MASTER_PHOTO_THUMB_CSS + '" title="클릭하여 확대"' +
            ' onclick="JigModule.viewJigMasterPhoto(\'' + _js(url) + '\', ' + nativeView + ')">';
    }

    function _bindMasterPhotoPreview(preview, src) {
        if (!preview) return;
        const url = _jigPhotoSrc(src);
        const nativeView = _isJigNativePhotoTarget(preview.id);
        if (preview.tagName === 'IMG') {
            if (!src) {
                const empty = document.createElement('div');
                empty.id = preview.id;
                empty.style.cssText = MASTER_PHOTO_EMPTY_CSS;
                empty.textContent = '사진 없음';
                preview.replaceWith(empty);
                return;
            }
            preview.src = url;
            preview.style.cssText = MASTER_PHOTO_THUMB_CSS;
            preview.title = '클릭하여 확대';
            preview.onclick = function () { viewJigMasterPhoto(url, nativeView); };
            preview.style.display = 'block';
            return;
        }
        if (src) {
            const img = document.createElement('img');
            img.id = preview.id;
            img.alt = '';
            img.src = url;
            img.style.cssText = MASTER_PHOTO_THUMB_CSS;
            img.title = '클릭하여 확대';
            img.onclick = function () { viewJigMasterPhoto(url, nativeView); };
            preview.replaceWith(img);
        } else {
            preview.style.cssText = MASTER_PHOTO_EMPTY_CSS;
            preview.textContent = preview.textContent || '사진 없음';
            preview.style.display = 'flex';
        }
    }

    function _masterPhotoBox(targetId, title, src) {
        return `
            <div style="border:1px solid var(--border-color);border-radius:8px;padding:8px;background:var(--bg-secondary);">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px;">
                    <strong style="font-size:0.78rem;">${title}</strong>
                    <div style="display:flex;gap:4px;flex-wrap:wrap;">
                        <label class="btn btn-sm btn-outline" style="cursor:pointer;font-size:0.72rem;padding:2px 8px;">
                            파일
                            <input type="file" accept="image/*" style="display:none;" onchange="JigModule.readJigMasterPhoto(this, '${targetId}')">
                        </label>
                        <button type="button" class="btn btn-sm btn-outline" style="font-size:0.72rem;padding:2px 8px;" onclick="JigModule.pasteJigMasterPhoto('${targetId}')">붙여넣기</button>
                        <button type="button" class="btn btn-sm btn-danger" style="font-size:0.72rem;padding:2px 8px;" onclick="JigModule.clearJigMasterPhoto('${targetId}')">삭제</button>
                    </div>
                </div>
                <input type="hidden" id="${targetId}Data" value="${_esc(src || '')}">
                ${_masterPhotoThumbHtml(src, targetId)}
                <div style="font-size:0.66rem;color:var(--text-muted);margin-top:4px;text-align:center;">썸네일 클릭 시 확대</div>
            </div>`;
    }

    function _masterPhotoViewBox(title, src) {
        return `
            <div style="border:1px solid var(--border-color);border-radius:8px;padding:8px;background:var(--bg-secondary);text-align:center;">
                <strong style="font-size:0.78rem;display:block;margin-bottom:6px;">${title}</strong>
                ${_masterPhotoThumbHtml(src, 'view_' + title.replace(/\s+/g, '_'), '사진 없음')}
            </div>`;
    }

    function _thicknessMeasurePointCard(index, mm, photoSrc, readOnly) {
        const meta = THICKNESS_POINT_META[index] || { label: '측정 포인트 ' + (index + 1), desc: '' };
        const targetId = 'thicknessPointPhoto' + index;
        const roAttr = readOnly ? ' disabled' : '';
        const photoControls = readOnly ? '' : `
            <div style="display:flex;gap:6px;flex-wrap:wrap;flex-shrink:0;">
                <label class="btn btn-sm btn-outline" style="cursor:pointer;">
                    파일 선택
                    <input type="file" accept="image/*" style="display:none;" onchange="JigModule.readJigMasterPhoto(this, '${targetId}')">
                </label>
                <button type="button" class="btn btn-sm btn-outline" onclick="JigModule.pasteJigMasterPhoto('${targetId}')">붙여넣기</button>
                <button type="button" class="btn btn-sm btn-danger" onclick="JigModule.clearJigMasterPhoto('${targetId}')">삭제</button>
            </div>`;
        const photoBlock = _masterPhotoThumbHtml(photoSrc, targetId, '측정 위치 사진');
        return `
            <div style="border:1px solid var(--border-color);border-radius:8px;padding:8px;background:var(--bg-secondary);">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;margin-bottom:6px;">
                    <div style="min-width:0;">
                        <strong style="font-size:0.8rem;display:block;">${meta.label}</strong>
                        <span style="font-size:0.68rem;color:var(--text-muted);">${meta.desc}</span>
                    </div>
                    ${photoControls}
                </div>
                <div class="form-group" style="margin:0 0 6px;">
                    <label class="form-label" style="font-size:0.78rem;">측정 두께 (mm) <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="thicknessPointMm${index}" value="${mm || ''}" min="0" step="0.001" placeholder="예: 16.520"${roAttr}
                        oninput="JigModule.recalcMasterLifeFromThickness()">
                </div>
                <input type="hidden" id="${targetId}Data" value="${_esc(photoSrc || '')}">
                ${photoBlock}
                ${readOnly ? '<div style="font-size:0.66rem;color:var(--text-muted);margin-top:4px;text-align:center;">썸네일 클릭 시 확대</div>'
                    : '<div style="font-size:0.66rem;color:var(--text-muted);margin-top:4px;text-align:center;">썸네일 클릭 시 확대 · Ctrl+V 붙여넣기</div>'}
            </div>`;
    }

    function _thicknessMeasurePointCards(d, readOnly) {
        const thicknessPhotos = Array.isArray(d.thicknessPointPhotos) ? d.thicknessPointPhotos : [];
        return Array.from({ length: THICKNESS_POINT_PHOTO_COUNT }, function (_, i) {
            return _thicknessMeasurePointCard(i, _getThicknessPointMm(d, i), thicknessPhotos[i] || '', readOnly);
        }).join('');
    }

    function _masterFormHtml(d = {}, opts = {}) {
        const readOnly = !!opts.readOnly;
        const roAttr = readOnly ? ' disabled' : '';
        const jigPhotos = Array.isArray(d.jigPhotos) ? d.jigPhotos : [];
        const fitPhotos = Array.isArray(d.productFitPhotos) ? d.productFitPhotos : [];
        const pointMms = Array.from({ length: THICKNESS_POINT_PHOTO_COUNT }, function (_, i) {
            return _getThicknessPointMm(d, i);
        });
        const filmDetail = _calcFilmThicknessDetail(pointMms);
        const displayFilmMm = filmDetail.avg > 0 ? filmDetail.avg : (d.filmThicknessMm || '');
        const infoText = readOnly
            ? '등록된 지그 정보를 확인합니다. 수정이 필요하면 하단의 수정 버튼을 누르세요.'
            : '도장 공정에 연결된 제품만 선택할 수 있으며, 대장 수정 시 기존 사진도 함께 유지됩니다.';
        return `
            <div style="max-height:min(72vh,820px);overflow-y:auto;padding-right:4px;">
            <div style="margin-bottom:12px;padding:8px 12px;background:rgba(99,102,241,0.07);
                        border:1px solid rgba(99,102,241,0.3);border-radius:6px;
                        font-size:0.8rem;color:var(--text-secondary);display:flex;align-items:center;gap:6px;">
                <span class="material-symbols-outlined" style="font-size:16px;color:#6366f1;">info</span>
                ${infoText}
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group">
                    <label class="form-label">차종 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="jigMasterCarModel" onchange="JigModule.onMasterCarModelChange()"${roAttr}>${_carModelOptions(d.carModel || '')}</select>
                </div>
                <div class="form-group">
                    <label class="form-label">수명 관리 설정 횟수 (회) <span style="color:var(--accent-red)">*</span></label>
                    <input type="number" class="form-input" id="jigMasterMaxCount" value="${d.maxCount || ''}" min="1" placeholder="자동계산(90%)"${roAttr}>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;">도달 횟수의 90% (두께 입력 시 자동)</div>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">품명 <span style="color:var(--accent-red)">*</span>${_masterSelectedPartNames(d).length > 1 ? ' <span style="font-size:0.72rem;color:var(--accent-blue);font-weight:600;">(공용)</span>' : ''}</label>
                <div id="jigMasterPartField">${_masterPartNamesFieldHtml(d.carModel || '', _masterSelectedPartNames(d), readOnly)}</div>
            </div>
            <div style="margin:4px 0 10px;padding:10px 12px;border:1px solid rgba(37,99,235,0.2);border-radius:8px;background:rgba(37,99,235,0.04);">
                <div style="font-size:0.8rem;font-weight:700;color:var(--accent-blue);margin-bottom:4px;">수명 근거 (두께)</div>
                <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:10px;">지그 스프레이 1회 도막두께 측정 기록 — 초기·1회·2회 도장 후 두께로 1회 평균 도막두께를 자동 계산합니다.</div>
                <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:12px;">
                    ${_thicknessMeasurePointCards(d, readOnly)}
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">1회 평균 도막두께 (mm) <span style="color:var(--accent-red)">*</span></label>
                        <input type="number" class="form-input" id="jigMasterFilmThickness" value="${displayFilmMm || ''}" min="0" step="0.001" readonly
                            style="background:var(--bg-secondary);font-weight:700;">
                        <div id="jigMasterFilmHint" style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;">${filmDetail.text}</div>
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">JIG 제한 두께 (mm) <span style="color:var(--accent-red)">*</span></label>
                        <input type="number" class="form-input" id="jigMasterLimitThickness" value="${d.limitThicknessMm || ''}" min="0" step="0.001" placeholder="예: 5.000"${roAttr}
                            oninput="JigModule.recalcMasterLifeFromThickness()">
                    </div>
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">제한 두께 도달 도장횟수 (회)</label>
                        <input type="number" class="form-input" id="jigMasterLimitCoatCount" value="${d.limitCoatCount || ''}" min="0" readonly
                            style="background:var(--bg-secondary);font-weight:700;">
                        <div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;">제한 두께 ÷ 1회 평균 도막두께</div>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px;">
                    <div class="form-group" style="margin:0;">
                        <label class="form-label">계산된 관리 횟수 (90%)</label>
                        <div id="jigMasterManageCountHint" style="padding:9px 12px;font-weight:800;color:var(--accent-blue);">
                            ${d.maxCount ? _fmt(d.maxCount) + ' 회' : '—'}
                        </div>
                    </div>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
                <div class="form-group">
                    <label class="form-label">발주 수량 (EA)</label>
                    <input type="number" class="form-input" id="jigMasterOrderQty" value="${d.orderQty || ''}" min="0" placeholder="도장-A 자동"${roAttr}>
                    <div id="jigMasterOrderQtyHint" style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;">
                        도장-A: 1,092 × CVT · 도장-B: 175 × CVT → 필요 수량 × 101% = 발주 수량
                    </div>
                    <label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:0.8rem;cursor:${readOnly ? 'default' : 'pointer'};">
                        <input type="checkbox" id="jigMasterIntegratedJig" ${d.integratedJig ? 'checked' : ''}${roAttr}
                            onchange="JigModule.onIntegratedJigToggle()">
                        <span><strong>CVT 일체형 지그</strong> <span style="color:var(--text-muted);font-weight:400;">(6거치 일체 지그 등 — CVT 직접 입력)</span></span>
                    </label>
                    ${readOnly && d.integratedJig
                        ? `<div style="font-size:0.78rem;margin-top:6px;color:var(--text-secondary);">일체형 CVT: <strong>${d.integratedJigCvt || 1}</strong></div>`
                        : `<div id="jigMasterIntegratedJigCvtWrap" style="display:${d.integratedJig ? '' : 'none'};margin-top:6px;">
                            <label class="form-label" style="font-size:0.78rem;margin-bottom:4px;">일체형 CVT <span style="color:var(--accent-red)">*</span></label>
                            <input type="number" class="form-input" id="jigMasterIntegratedJigCvt" value="${d.integratedJigCvt || (d.integratedJig ? 1 : '')}" min="1" step="1" placeholder="예: 6"${roAttr}
                                oninput="JigModule.recalcMasterOrderQty()">
                        </div>`}
                </div>
                <div class="form-group" style="grid-column:span 2;">
                    <label class="form-label">적용 라인</label>
                    <div style="display:flex;gap:14px;align-items:center;height:38px;">
                        ${APPLIED_LINE_OPTIONS.map(line => `
                            <label style="display:flex;align-items:center;gap:5px;font-size:0.85rem;cursor:${readOnly ? 'default' : 'pointer'};">
                                <input type="checkbox" class="jigMasterAppliedLine" value="${_esc(line)}" ${(Array.isArray(d.appliedLines) && d.appliedLines.includes(line)) ? 'checked' : ''}${roAttr}
                                    onchange="JigModule.recalcMasterOrderQty()">
                                ${_esc(line)}
                            </label>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
                <div class="form-group">
                    <label class="form-label">재질</label>
                    <input type="text" class="form-input" id="jigMasterMaterial" value="${_esc(d.material || '')}" placeholder="예: SUS, AL"${roAttr}>
                </div>
                <div class="form-group">
                    <label class="form-label">구매처</label>
                    <input type="text" class="form-input" id="jigMasterSupplier" value="${_esc(d.supplier || '')}" placeholder="구매처 입력"${roAttr}>
                </div>
                <div class="form-group">
                    <label class="form-label">제작일</label>
                    <input type="date" class="form-input" id="jigMasterMadeDate" value="${d.madeDate || d.registDate || _today()}"${roAttr}>
                </div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:4px;">
                ${readOnly
                    ? [
                        _masterPhotoViewBox('지그 사진 1', jigPhotos[0] || ''),
                        _masterPhotoViewBox('지그 사진 2', jigPhotos[1] || ''),
                        _masterPhotoViewBox('제품 결합 사진 1', fitPhotos[0] || ''),
                        _masterPhotoViewBox('제품 결합 사진 2', fitPhotos[1] || '')
                    ].join('')
                    : [
                        _masterPhotoBox('jigPhoto0', '지그 사진 1', jigPhotos[0] || ''),
                        _masterPhotoBox('jigPhoto1', '지그 사진 2', jigPhotos[1] || ''),
                        _masterPhotoBox('productFitPhoto0', '제품 결합 사진 1', fitPhotos[0] || ''),
                        _masterPhotoBox('productFitPhoto1', '제품 결합 사진 2', fitPhotos[1] || '')
                    ].join('')}
            </div>
            </div>`;
    }

    function recalcMasterLifeFromThickness() {
        const points = _readThicknessPointsFromForm();
        const filmDetail = _calcFilmThicknessDetail(points);
        const film = filmDetail.avg > 0 ? filmDetail.avg : 0;
        const limit = document.getElementById('jigMasterLimitThickness')?.value;
        const calc = _calcLifeFromThickness(limit, film);
        const filmEl = document.getElementById('jigMasterFilmThickness');
        const filmHintEl = document.getElementById('jigMasterFilmHint');
        const limitEl = document.getElementById('jigMasterLimitCoatCount');
        const maxEl = document.getElementById('jigMasterMaxCount');
        const hintEl = document.getElementById('jigMasterManageCountHint');
        if (filmEl) filmEl.value = film > 0 ? film : '';
        if (filmHintEl) filmHintEl.textContent = filmDetail.text;
        if (limitEl) limitEl.value = calc.limitCoatCount > 0 ? calc.limitCoatCount : '';
        if (maxEl && !maxEl.disabled && calc.manageCount > 0) {
            maxEl.value = calc.manageCount;
        }
        if (hintEl) {
            hintEl.textContent = calc.manageCount > 0
                ? (_fmt(calc.manageCount) + ' 회 (도달 ' + _fmt(calc.limitCoatCount) + ' × 90%)')
                : '—';
        }
    }

    function _collectMasterForm(id) {
        const carModel = document.getElementById('jigMasterCarModel')?.value.trim();
        const partNames = _collectMasterPartNames();
        const prev = id ? (Storage.getById(STORE, id) || {}) : {};
        // 대표 품명: 기존 partName이 선택에 남아 있으면 유지, 아니면 첫 선택
        let partName = partNames.includes(prev.partName) ? prev.partName : (partNames[0] || '');
        const partAliases = partNames;
        const thicknessPointMm = _readThicknessPointsFromForm().map(function (v) { return _numMm(v) || 0; });
        const initialThicknessMm = thicknessPointMm[0] || 0;
        const filmThicknessMm = _calcAvgFilmThickness(thicknessPointMm)
            || _numMm(document.getElementById('jigMasterFilmThickness')?.value)
            || _numMm(prev.filmThicknessMm);
        const limitThicknessMm = _numMm(document.getElementById('jigMasterLimitThickness')?.value);
        const calc = _calcLifeFromThickness(limitThicknessMm, filmThicknessMm);
        let limitCoatCount = parseInt(document.getElementById('jigMasterLimitCoatCount')?.value || 0, 10) || 0;
        let maxCount = parseInt(document.getElementById('jigMasterMaxCount')?.value || 0, 10) || 0;
        if (calc.limitCoatCount > 0) limitCoatCount = calc.limitCoatCount;
        if (!maxCount && calc.manageCount > 0) maxCount = calc.manageCount;
        if (!carModel) { UIUtils.toast('차종을 선택하세요.', 'warning'); return null; }
        if (!partNames.length) { UIUtils.toast('품명을 1개 이상 선택하세요.', 'warning'); return null; }
        if (!filmThicknessMm || !limitThicknessMm) {
            // 기존 대장(두께 미입력)은 수명 횟수만으로 저장 허용
            if (!maxCount) {
                UIUtils.toast('초기·1회·2회 도장 후 두께 3개와 JIG 제한 두께를 입력하거나, 수명 관리 설정 횟수를 직접 입력하세요.', 'warning');
                return null;
            }
        } else if (!maxCount) {
            UIUtils.toast('수명 관리 설정 횟수를 입력하세요.', 'warning');
            return null;
        }
        const madeDate = document.getElementById('jigMasterMadeDate')?.value || _today();
        const appliedLines = Array.from(document.querySelectorAll('.jigMasterAppliedLine:checked')).map(el => el.value);
        return {
            ...prev,
            carModel,
            partName,
            partAliases,
            merged: partAliases.length > 1,
            line: prev.line || _lineForMaster(carModel, partName),
            initialThicknessMm: initialThicknessMm || 0,
            thicknessPointMm: thicknessPointMm,
            filmThicknessMm,
            limitThicknessMm,
            limitCoatCount,
            maxCount,
            orderQty: parseInt(document.getElementById('jigMasterOrderQty')?.value || 0) || 0,
            integratedJig: !!document.getElementById('jigMasterIntegratedJig')?.checked,
            integratedJigCvt: _getIntegratedJigCvt() || null,
            appliedLines,
            material: document.getElementById('jigMasterMaterial')?.value.trim() || '',
            supplier: document.getElementById('jigMasterSupplier')?.value.trim() || '',
            madeDate,
            registDate: prev.registDate || madeDate,
            jigPhotos: [0, 1].map(i => document.getElementById(`jigPhoto${i}Data`)?.value || '').filter(Boolean),
            productFitPhotos: [0, 1].map(i => document.getElementById(`productFitPhoto${i}Data`)?.value || '').filter(Boolean),
            thicknessPointPhotos: Array.from({ length: THICKNESS_POINT_PHOTO_COUNT }, function (_, i) {
                return document.getElementById('thicknessPointPhoto' + i + 'Data')?.value || '';
            }).filter(Boolean)
        };
    }

    function openJigMasterModal(id = '') {
        if (!id) {
            UIUtils.showModal(
                '도장 지그 대장 등록',
                _masterFormHtml({}, { readOnly: false }),
                `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="JigModule.saveJigMaster('')">저장</button>`,
                'xl'
            );
            _ensureJigPasteListener();
            setTimeout(function () {
                recalcMasterLifeFromThickness();
                recalcMasterOrderQty();
            }, 0);
            return;
        }
        const jig = Storage.getById(STORE, id) || {};
        UIUtils.showModal(
            '도장 지그 대장 보기',
            _masterFormHtml(jig, { readOnly: true }),
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>
             <button class="btn btn-primary" onclick="JigModule.enableJigMasterEdit('${_js(id)}')">
                <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">edit</span> 수정
             </button>`,
            'xl'
        );
        setTimeout(function () {
            recalcMasterLifeFromThickness();
            recalcMasterOrderQty();
        }, 0);
    }

    function enableJigMasterEdit(id) {
        const jig = Storage.getById(STORE, id);
        if (!jig) {
            UIUtils.toast('지그 정보를 찾을 수 없습니다.', 'warning');
            return;
        }
        UIUtils.showModal(
            '도장 지그 대장 수정',
            _masterFormHtml(jig, { readOnly: false }),
            `<div style="display:flex;width:100%;align-items:center;gap:8px;">
                <button class="btn btn-danger" onclick="JigModule.remove('${_js(id)}')">삭제</button>
                <div style="margin-left:auto;display:flex;gap:8px;">
                    <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
                    <button class="btn btn-primary" onclick="JigModule.saveJigMaster('${_js(id)}')">저장</button>
                </div>
            </div>`,
            'xl'
        );
        _ensureJigPasteListener();
        setTimeout(function () {
            recalcMasterLifeFromThickness();
            recalcMasterOrderQty();
        }, 0);
    }

    function _masterPhotoViewBody(src, nativeView) {
        const style = nativeView ? JIG_PHOTO_VIEW_IMG_STYLE : MASTER_PHOTO_VIEW_IMG_STYLE;
        return '<div style="text-align:center;padding:8px 0;overflow:auto;max-height:85vh;">' +
            '<img src="' + _esc(src) + '" alt="" style="' + style + '">' +
            '</div>';
    }

    async function _uploadJigPhoto(file) {
        return ApiClient.uploadPhoto(file, 'paint_jig', JIG_PHOTO_UPLOAD_OPTS);
    }

    function viewJigMasterPhoto(src, nativeView) {
        if (!src) return;
        UIUtils.showModal('사진 보기', _masterPhotoViewBody(src, !!nativeView),
            '<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>',
            'xl');
    }

    async function saveJigMaster(id = '') {
        const data = _collectMasterForm(id);
        if (!data) return;
        if (id) await Storage.update(STORE, id, data);
        else await Storage.add(STORE, data);
        UIUtils.closeModal();
        UIUtils.toast('도장 지그 대장이 저장되었습니다.', 'success');
        loadAll();
        renderJigMaster();
    }

    async function readJigMasterPhoto(input, targetId) {
        const file = input?.files?.[0];
        if (!file) return;
        try {
            UIUtils.toast('사진 업로드 중...', 'info');
            const url = await _uploadJigPhoto(file);
            _setJigMasterPhoto(targetId, url);
            UIUtils.toast('사진이 NAS에 등록되었습니다.', 'success');
        } catch (e) {
            UIUtils.toast('사진 업로드에 실패했습니다: ' + e.message, 'error');
            console.warn('[JigModule] photo upload failed:', e);
        }
    }

    function _setJigMasterPhoto(targetId, src) {
        const hidden = document.getElementById(`${targetId}Data`);
        const preview = document.getElementById(`${targetId}Preview`);
        if (hidden) hidden.value = src || '';
        _bindMasterPhotoPreview(preview, src);
    }

    async function _readJigImageBlob(targetId, blob) {
        if (!targetId || !blob) return false;
        try {
            UIUtils.toast('사진 업로드 중...', 'info');
            const url = await _uploadJigPhoto(blob);
            _setJigMasterPhoto(targetId, url);
            UIUtils.toast('스크린샷이 NAS에 등록되었습니다.', 'success');
            return true;
        } catch (e) {
            UIUtils.toast('스크린샷 업로드에 실패했습니다: ' + e.message, 'error');
            console.warn('[JigModule] paste photo upload failed:', e);
            return false;
        }
    }

    function _imageFileFromPasteEvent(event) {
        const files = Array.from(event.clipboardData?.files || []);
        const imageFile = files.find(file => file.type && file.type.startsWith('image/'));
        if (imageFile) return imageFile;

        const items = Array.from(event.clipboardData?.items || []);
        for (const item of items) {
            if (item.type && item.type.startsWith('image/')) return item.getAsFile();
        }
        return null;
    }

    function _imageSrcFromPasteHtml(event) {
        const html = event.clipboardData?.getData?.('text/html') || '';
        if (!html) return '';
        const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (!match) return '';
        const src = match[1] || '';
        if (src.startsWith('data:image/')) return src;
        return '';
    }

    async function _blobFromDataUrl(src) {
        const response = await fetch(src);
        return response.blob();
    }

    function _ensureJigPasteListener() {
        if (_jigPasteListenerReady) return;
        _jigPasteListenerReady = true;
        document.addEventListener('paste', function(event) {
            if (_lifeStandardPasteArmed) {
                const saveLifeStandardBlob = function(blob) {
                    const reader = new FileReader();
                    reader.onload = async () => {
                        try {
                            await _saveLifeStandardImage(String(reader.result || ''));
                            _lifeStandardImage = await _loadLifeStandardImage();
                            const container = document.getElementById('page-content');
                            if (container) {
                                await renderLifeStandardPage(container);
                            }
                            UIUtils.toast('기준서 이미지가 저장되었습니다.', 'success');
                        } catch (e) {
                            console.warn('[JigModule] life standard paste save failed:', e);
                            UIUtils.toast('기준서 저장 중 오류가 발생했습니다.', 'error');
                        }
                    };
                    reader.onerror = () => UIUtils.toast('클립보드 이미지를 읽을 수 없습니다.', 'error');
                    reader.readAsDataURL(blob);
                };

                const file = _imageFileFromPasteEvent(event);
                if (!file) {
                    const htmlSrc = _imageSrcFromPasteHtml(event);
                    if (!htmlSrc) {
                        UIUtils.toast('클립보드 이미지가 없습니다. 엑셀이나 화면을 복사한 뒤 다시 붙여넣어 주세요.', 'warning');
                        return;
                    }
                    event.preventDefault();
                    _lifeStandardPasteArmed = false;
                    _blobFromDataUrl(htmlSrc)
                        .then(saveLifeStandardBlob)
                        .catch(e => {
                            UIUtils.toast('엑셀 이미지 변환에 실패했습니다.', 'error');
                            console.warn('[JigModule] life standard pasted html image conversion failed:', e);
                        });
                    return;
                }
                event.preventDefault();
                _lifeStandardPasteArmed = false;
                saveLifeStandardBlob(file);
                return;
            }
            if (!_jigPasteTargetId) return;
            const hidden = document.getElementById(`${_jigPasteTargetId}Data`);
            if (!hidden) return;
            const file = _imageFileFromPasteEvent(event);
            if (!file) {
                const htmlSrc = _imageSrcFromPasteHtml(event);
                if (!htmlSrc) return;
                event.preventDefault();
                _blobFromDataUrl(htmlSrc)
                    .then(blob => _readJigImageBlob(_jigPasteTargetId, blob))
                    .catch(e => {
                        UIUtils.toast('엑셀 이미지 변환에 실패했습니다.', 'error');
                        console.warn('[JigModule] pasted html image conversion failed:', e);
                    });
                return;
            }
            event.preventDefault();
            _readJigImageBlob(_jigPasteTargetId, file);
        });
    }

    function pasteJigMasterPhoto(targetId) {
        _jigPasteTargetId = targetId;
        _ensureJigPasteListener();
        const previewIds = ['jigPhoto0Preview', 'jigPhoto1Preview', 'productFitPhoto0Preview', 'productFitPhoto1Preview']
            .concat(Array.from({ length: THICKNESS_POINT_PHOTO_COUNT }, function (_, i) {
                return 'thicknessPointPhoto' + i + 'Preview';
            }));
        previewIds.forEach(function (id) {
            const img = document.getElementById(id);
            if (img) img.style.outline = '';
        });
        const preview = document.getElementById(`${targetId}Preview`);
        if (preview) {
            preview.style.display = 'block';
            preview.style.outline = '3px solid var(--accent-blue)';
            preview.style.outlineOffset = '2px';
        }
        UIUtils.toast('이미지 칸 선택됨: Ctrl+V로 붙여넣으세요.', 'info');
    }

    function clearJigMasterPhoto(targetId) {
        _setJigMasterPhoto(targetId, '');
    }

    function viewJigPhoto(id, key, idx) {
        const jig = Storage.getById(STORE, id);
        const src = jig && Array.isArray(jig[key]) ? jig[key][idx] : '';
        if (!src) return;
        UIUtils.showModal('사진 보기', _masterPhotoViewBody(_jigPhotoSrc(src), true), `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>`, 'xl');
    }

    function viewResetPhoto(photoUrl) {
        if (!photoUrl) return;
        const src = ApiClient.photoUrl(photoUrl);
        UIUtils.showModal('교체일 작성 사진', _masterPhotoViewBody(src, true), `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>`, 'xl');
    }

    function _historyMeta(type) {
        return {
            disposal: { key: DISPOSAL_KEY, route: 'jig-disposal', title: '지그 폐기 대장', action: '폐기', icon: 'delete_sweep' },
            repair: { key: REPAIR_KEY, route: 'jig-repair-history', title: '지그수리/개선 이력', action: '수리/개선', icon: 'build_circle' }
        }[type];
    }

    async function renderHistoryPage(container, type) {
        if (type === 'change') {
            renderChangeHistoryPage(container);
            return;
        }
        const meta = _historyMeta(type);
        const rows = await _loadConfigList(meta.key);
        container.innerHTML = `
            <div class="fade-in-up jig-page">
                ${renderMenu(meta.route, meta.title, `${meta.action} 작업 이력을 등록하고 조회합니다.`)}
                <div class="page-header">
                    <div class="page-actions">
                        <button class="btn btn-primary btn-sm" onclick="JigModule.openHistoryModal('${type}')">
                            <span class="material-symbols-outlined">add</span> 이력 등록
                        </button>
                    </div>
                </div>
                <div class="card"><div class="card-body">
                    <table class="data-table">
                        <thead><tr><th>일자</th><th>차종</th><th>품명</th><th>구분</th><th>내용/사유</th><th>담당자</th><th>상태</th><th>작업</th></tr></thead>
                        <tbody>
                            ${rows.length ? rows.map(row => `
                                <tr>
                                    <td>${_esc(row.date || '-')}</td>
                                    <td>${_esc(row.carModel || '-')}</td>
                                    <td>${_esc(row.partName || '-')}</td>
                                    <td>${_esc(row.category || meta.action)}</td>
                                    <td>${_esc(row.note || '-')}</td>
                                    <td>${_esc(row.worker || '-')}</td>
                                    <td>${_esc(row.status || '완료')}</td>
                                    <td><button class="btn btn-danger btn-sm" onclick="JigModule.removeHistory('${type}','${_js(row.id)}')">삭제</button></td>
                                </tr>
                            `).join('') : `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted);">등록된 이력이 없습니다.</td></tr>`}
                        </tbody>
                    </table>
                </div></div>
            </div>`;
    }

    function renderChangeHistoryPage(container) {
        const jigs = Storage.getAll(STORE) || [];
        const jigMap = {};
        jigs.forEach(j => { jigMap[j.id] = j; });
        const rows = (Storage.getAll(LOG_STORE) || []).filter(l => _isResetWorkType(l.workType)).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
        container.innerHTML = `
            <div class="fade-in-up jig-page">
                ${renderMenu('jig-change-history', '조치 이력', '수명 초기화와 교체/박리 세척 기록을 조회합니다.')}
                <div class="card"><div class="card-body">
                    <table class="data-table">
                        <thead><tr><th>일자</th><th>차종</th><th>품명</th><th>라인</th><th>내용</th><th>작업자</th><th>사진</th></tr></thead>
                        <tbody>
                            ${rows.length ? rows.map(row => {
                                const jig = jigMap[row.jigId] || {};
                                const photoCell = row.photoUrl
                                    ? `<button type="button" class="btn btn-outline btn-sm" style="padding:2px 8px;" onclick="JigModule.viewResetPhoto('${_js(row.photoUrl)}')">보기</button>`
                                    : '<span style="color:var(--text-muted);">-</span>';
                                return `<tr><td>${_esc(row.date || '-')}</td><td>${_esc(jig.carModel || '-')}</td><td>${_esc(jig.partName || '-')}</td><td>${_esc(jig.line || '-')}</td><td>${_esc(row.note || '교체')}</td><td>${_esc(row.worker || '-')}</td><td>${photoCell}</td></tr>`;
                            }).join('') : `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted);">조치 이력이 없습니다.</td></tr>`}
                        </tbody>
                    </table>
                </div></div>
            </div>`;
    }

    async function renderOrderingPage(container) {
        const orderings = Storage.getAll(DB.STORES.JIG_ORDERING) || [];
        const jigs = Storage.getAll(STORE) || [];
        const jigMap = {};
        jigs.forEach(j => { jigMap[j.id] = j; });

        container.innerHTML = `
            <div class="fade-in-up jig-page">
                ${renderMenu('jig-ordering', '지그 발주 관리', '지그 발주 일자, 납기일, 상태를 관리합니다.')}
                <div class="page-header">
                    <div class="page-actions">
                        <button class="btn btn-primary btn-sm" onclick="JigModule.openOrderingModal()">
                            <span class="material-symbols-outlined">add</span> 발주 등록
                        </button>
                    </div>
                </div>
                <div class="card"><div class="card-body">
                    <table class="data-table">
                        <thead><tr><th>발주일</th><th>납기일</th><th>차종</th><th>품명</th><th>라인</th><th>상태</th><th>비고</th><th>작업</th></tr></thead>
                        <tbody>
                            ${orderings.length ? orderings.sort((a, b) => (b.orderDate || '').localeCompare(a.orderDate || '')).map(row => {
                                const jig = jigMap[row.jigId] || {};
                                return `<tr>
                                    <td>${_esc(row.orderDate || '-')}</td>
                                    <td>${_esc(row.dueDate || '-')}</td>
                                    <td>${_esc(jig.carModel || '-')}</td>
                                    <td>${_esc(jig.partName || '-')}</td>
                                    <td>${_esc(jig.line || '-')}</td>
                                    <td><span style="background:${row.status === '완료' ? 'var(--accent-green)' : row.status === '진행중' ? 'var(--accent-blue)' : 'var(--accent-orange)'};color:#fff;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;">${_esc(row.status || '대기')}</span></td>
                                    <td style="color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;" title="${_esc(row.note || '')}">${_esc(row.note || '')}</td>
                                    <td><button class="btn btn-sm btn-outline" onclick="JigModule.editOrdering('${_js(row.id)}')">수정</button> <button class="btn btn-sm btn-danger" onclick="JigModule.removeOrdering('${_js(row.id)}')">삭제</button></td>
                                </tr>`;
                            }).join('') : `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-muted);">등록된 발주가 없습니다.</td></tr>`}
                        </tbody>
                    </table>
                </div></div>
            </div>`;
    }

    function openOrderingModal(id) {
        const orderings = Storage.getAll(DB.STORES.JIG_ORDERING) || [];
        const jigs = (Storage.getAll(STORE) || []).sort((a, b) => (a.carModel || '').localeCompare(b.carModel || '', 'ko') || (a.partName || '').localeCompare(b.partName || '', 'ko'));
        const existing = id ? orderings.find(o => o.id === id) : null;
        const title = existing ? '발주 수정' : '발주 등록';

        UIUtils.showModal(title, `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group"><label class="form-label">지그</label><select class="form-select" id="orderingJigId"><option value="">선택</option>${jigs.map(j => `<option value="${_esc(j.id)}" ${existing && existing.jigId === j.id ? 'selected' : ''}>[${_esc(j.carModel || '-')}] ${_esc(j.partName || '-')}${j.line ? ' (' + _esc(j.line) + ')' : ''}</option>`).join('')}</select></div>
                <div class="form-group"><label class="form-label">발주일</label><input type="date" class="form-input" id="orderingOrderDate" value="${existing?.orderDate || _today()}"></div>
                <div class="form-group"><label class="form-label">납기일</label><input type="date" class="form-input" id="orderingDueDate" value="${existing?.dueDate || ''}"></div>
                <div class="form-group"><label class="form-label">상태</label><select class="form-select" id="orderingStatus"><option ${!existing || existing.status === '대기' ? 'selected' : ''}>대기</option><option ${existing?.status === '진행중' ? 'selected' : ''}>진행중</option><option ${existing?.status === '완료' ? 'selected' : ''}>완료</option></select></div>
            </div>
            <div class="form-group"><label class="form-label">비고</label><textarea class="form-textarea" id="orderingNote" rows="2">${existing?.note || ''}</textarea></div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="JigModule.saveOrdering('${id || ''}')">저장</button>`,
            'lg'
        );
    }

    function editOrdering(id) {
        openOrderingModal(id);
    }

    async function saveOrdering(id) {
        const jigId = document.getElementById('orderingJigId')?.value?.trim() || '';
        const orderDate = document.getElementById('orderingOrderDate')?.value?.trim() || '';
        const dueDate = document.getElementById('orderingDueDate')?.value?.trim() || '';
        const status = document.getElementById('orderingStatus')?.value?.trim() || '대기';
        const note = document.getElementById('orderingNote')?.value?.trim() || '';

        if (!jigId || !orderDate) {
            UIUtils.toast('지그와 발주일을 입력하세요.', 'warning');
            return;
        }

        const data = { jigId, orderDate, dueDate, status, note };
        try {
            if (id) {
                await Storage.update(DB.STORES.JIG_ORDERING, id, data);
            } else {
                await Storage.add(DB.STORES.JIG_ORDERING, data);
            }
            UIUtils.closeModal();
            UIUtils.toast(id ? '수정되었습니다.' : '등록되었습니다.', 'success');
            renderOrderingPage(document.getElementById('contentArea'));
        } catch (e) {
            UIUtils.toast('저장 실패: ' + e.message, 'error');
        }
    }

    async function removeOrdering(id) {
        UIUtils.confirm('발주를 삭제하시겠습니까?', async () => {
            try {
                await Storage.remove(DB.STORES.JIG_ORDERING, id);
                UIUtils.toast('삭제되었습니다.', 'success');
                renderOrderingPage(document.getElementById('contentArea'));
            } catch (e) {
                UIUtils.toast('삭제 실패: ' + e.message, 'error');
            }
        });
    }

    function openHistoryModal(type) {
        const meta = _historyMeta(type);
        const jigs = (Storage.getAll(STORE) || []).sort((a, b) => (a.carModel || '').localeCompare(b.carModel || '', 'ko') || (a.partName || '').localeCompare(b.partName || '', 'ko'));
        UIUtils.showModal(`${meta.title} 등록`, `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group"><label class="form-label">일자</label><input type="date" class="form-input" id="jigHistoryDate" value="${_today()}"></div>
                <div class="form-group"><label class="form-label">대상 지그</label><select class="form-select" id="jigHistoryJigId"><option value="">선택</option>${jigs.map(j => `<option value="${_esc(j.id)}">[${_esc(j.carModel || '-')}] ${_esc(j.partName || '-')}${j.line ? ' (' + _esc(j.line) + ')' : ''}</option>`).join('')}</select></div>
                <div class="form-group"><label class="form-label">구분</label><input type="text" class="form-input" id="jigHistoryCategory" value="${_esc(meta.action)}"></div>
                <div class="form-group"><label class="form-label">담당자</label><input type="text" class="form-input" id="jigHistoryWorker"></div>
                <div class="form-group"><label class="form-label">상태</label><select class="form-select" id="jigHistoryStatus"><option>완료</option><option>진행중</option><option>보류</option></select></div>
            </div>
            <div class="form-group"><label class="form-label">내용/사유</label><textarea class="form-textarea" id="jigHistoryNote" rows="3"></textarea></div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="JigModule.saveHistory('${type}')">저장</button>`,
            'lg'
        );
    }

    async function saveHistory(type) {
        const meta = _historyMeta(type);
        const jigId = document.getElementById('jigHistoryJigId')?.value || '';
        const jig = jigId ? Storage.getById(STORE, jigId) : {};
        const rows = await _loadConfigList(meta.key);
        rows.unshift({
            id: Storage.generateId ? Storage.generateId() : 'hist_' + Date.now(),
            date: document.getElementById('jigHistoryDate')?.value || _today(),
            jigId,
            carModel: jig?.carModel || '',
            partName: jig?.partName || '',
            category: document.getElementById('jigHistoryCategory')?.value.trim() || meta.action,
            worker: document.getElementById('jigHistoryWorker')?.value.trim() || '',
            status: document.getElementById('jigHistoryStatus')?.value || '완료',
            note: document.getElementById('jigHistoryNote')?.value.trim() || '',
            createdAt: new Date().toISOString()
        });
        await _saveConfigList(meta.key, rows);
        UIUtils.closeModal();
        UIUtils.toast('이력이 저장되었습니다.', 'success');
        Router.navigate(meta.route);
    }

    async function removeHistory(type, id) {
        const meta = _historyMeta(type);
        UIUtils.confirm('이력을 삭제하시겠습니까?', async () => {
            const rows = (await _loadConfigList(meta.key)).filter(row => row.id !== id);
            await _saveConfigList(meta.key, rows);
            UIUtils.toast('삭제되었습니다.', 'success');
            Router.navigate(meta.route);
        });
    }

    function openAddModal() {
        UIUtils.showModal('JIG 단건 등록', _formHtml(), `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="JigModule.saveNew()">등록</button>`, 'lg');
    }

    async function saveNew() {
        const data = _collectForm();
        if (!data) return;
        await Storage.add(STORE, data);
        UIUtils.closeModal();
        UIUtils.toast('JIG가 등록되었습니다.', 'success');
        loadAll();
    }

    function openEditModal(id) {
        const jig = Storage.getById(STORE, id);
        if (!jig) return;
        UIUtils.showModal('JIG 수정', _formHtml(jig), `<button class="btn btn-danger" onclick="JigModule.remove('${_js(id)}')">삭제</button><button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="JigModule.saveEdit('${_js(id)}')">저장</button>`, 'lg');
    }

    async function saveEdit(id) {
        const data = _collectForm();
        if (!data) return;
        const prev = Storage.getById(STORE, id) || {};
        await Storage.update(STORE, id, { ...prev, ...data });
        UIUtils.closeModal();
        UIUtils.toast('수정되었습니다.', 'success');
        loadAll();
    }

    function remove(id) {
        const jig = Storage.getById(STORE, id);
        UIUtils.confirm(`[${jig?.carModel || '-'}] ${jig?.partName || '-'} JIG를 삭제하시겠습니까?\n관련 이력도 함께 삭제됩니다.`, async () => {
            const logs = (Storage.getAll(LOG_STORE) || []).filter(l => l.jigId === id);
            for (const log of logs) await Storage.remove(LOG_STORE, log.id);
            await Storage.remove(STORE, id);
            UIUtils.closeModal();
            UIUtils.toast('삭제되었습니다.', 'success');
            loadAll();
            renderJigMaster();
        });
    }

    let _resetPhotoUrl = '';

    function resetCount(id) {
        const jig = Storage.getById(STORE, id);
        if (!jig) return;
        const action = _resetActionForJig(jig);
        _resetPhotoUrl = '';
        UIUtils.showModal(`[${jig.carModel}] ${jig.partName} JIG ${action} 초기화`, `
            <div style="margin-bottom:12px;font-size:0.85rem;color:var(--text-secondary);">
                [${_esc(jig.carModel)}] ${_esc(jig.partName)} (${_esc(jig.line || '-')}) JIG를 ${action} 초기화합니다.<br>
                기존 사용 이력은 삭제되고 ${action} 기록이 남습니다.
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group"><label class="form-label">${action}일 <span style="color:var(--accent-red)">*</span></label><input type="date" class="form-input" id="jigResetDate" value="${_today()}"></div>
                <div class="form-group"><label class="form-label">${action} 작업자 <span style="color:var(--accent-red)">*</span></label><input type="text" class="form-input" id="jigResetWorker" placeholder="작업자명 입력"></div>
            </div>
            <div class="form-group">
                <label class="form-label">지그박스 ${action}일 작성 사진 <span style="color:var(--accent-red)">*</span></label>
                <div style="font-size:0.76rem;color:var(--text-muted);margin-bottom:6px;">지그박스에 ${action}일을 기재한 사진을 첨부하세요. (NAS 저장)</div>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;padding:6px 12px;border:1px dashed var(--accent-blue);border-radius:6px;font-size:0.8rem;color:var(--accent-blue);white-space:nowrap;">
                        <span class="material-symbols-outlined" style="font-size:16px;">add_photo_alternate</span>
                        사진 선택
                        <input type="file" id="jigResetPhotoFile" accept="image/*" style="display:none;" onchange="JigModule.uploadResetPhoto()">
                    </label>
                    <span id="jigResetPhotoStatus" style="font-size:0.78rem;color:var(--text-muted);">선택된 사진 없음</span>
                </div>
                <div id="jigResetPhotoPreviewWrap" style="display:none;margin-top:8px;">
                    <img id="jigResetPhotoPreview" src="" alt="" style="max-width:100%;max-height:140px;border-radius:6px;border:1px solid var(--border-color);object-fit:cover;">
                </div>
            </div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="JigModule.confirmResetCount('${_js(id)}')">확인</button>`,
            'lg'
        );
    }

    async function uploadResetPhoto() {
        const input = document.getElementById('jigResetPhotoFile');
        if (!input || !input.files[0]) return;
        const file = input.files[0];
        const statusEl = document.getElementById('jigResetPhotoStatus');
        if (statusEl) statusEl.textContent = '업로드 중...';
        try {
            const url = await _uploadJigPhoto(file);
            _resetPhotoUrl = url;
            if (statusEl) statusEl.textContent = file.name;
            const wrap = document.getElementById('jigResetPhotoPreviewWrap');
            const img = document.getElementById('jigResetPhotoPreview');
            if (img) img.src = ApiClient.photoUrl(url);
            if (wrap) wrap.style.display = 'block';
        } catch (e) {
            _resetPhotoUrl = '';
            if (statusEl) statusEl.textContent = '업로드 실패';
            UIUtils.toast('사진 업로드 실패: ' + e.message, 'error');
        }
    }

    async function confirmResetCount(id) {
        const jig = Storage.getById(STORE, id);
        if (!jig) return;
        const action = _resetActionForJig(jig);
        const date = document.getElementById('jigResetDate')?.value || '';
        const worker = document.getElementById('jigResetWorker')?.value.trim() || '';
        if (!date) { UIUtils.toast(`${action}일을 입력하세요.`, 'warning'); return; }
        if (!worker) { UIUtils.toast(`${action} 작업자를 입력하세요.`, 'warning'); return; }
        if (!_resetPhotoUrl) { UIUtils.toast('지그박스 교체일 작성 사진을 첨부하세요.', 'warning'); return; }
        const logs = (Storage.getAll(LOG_STORE) || []).filter(l => l.jigId === id && !_isResetWorkType(l.workType));
        for (const log of logs) await Storage.remove(LOG_STORE, log.id);
        await Storage.add(LOG_STORE, { jigId: id, date, workType: action, useCount: 0, note: `${action} 초기화`, worker, photoUrl: _resetPhotoUrl });
        UIUtils.closeModal();
        UIUtils.toast('사용 횟수가 초기화되었습니다.', 'success');
        loadAll();
    }

    function openAddLogModal() {
        const jigs = (Storage.getAll(STORE) || []).sort((a, b) => (a.carModel || '').localeCompare(b.carModel || '', 'ko') || (a.partName || '').localeCompare(b.partName || '', 'ko'));
        UIUtils.showModal('JIG 사용 등록', `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div class="form-group">
                    <label class="form-label">JIG 선택 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="logJigId">
                        <option value="">선택</option>
                        ${jigs.map(j => `<option value="${_esc(j.id)}">[${_esc(j.carModel || '-')}] ${_esc(j.partName || '-')}${j.line ? ' (' + _esc(j.line) + ')' : ''}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group"><label class="form-label">사용일</label><input type="date" class="form-input" id="logDate" value="${_today()}"></div>
                <div class="form-group"><label class="form-label">작업 내용</label><select class="form-select" id="logWorkType"><option>도장 작업</option><option>교체</option><option>점검</option><option>기타</option></select></div>
                <div class="form-group"><label class="form-label">사용 횟수</label><input type="number" class="form-input" id="logUseCount" value="1" min="0"></div>
            </div>
            <div class="form-group"><label class="form-label">비고</label><textarea class="form-textarea" id="logNote" rows="2"></textarea></div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button><button class="btn btn-primary" onclick="JigModule.saveLog()">저장</button>`,
            'lg'
        );
    }

    async function saveLog() {
        const jigId = document.getElementById('logJigId')?.value;
        if (!jigId) { UIUtils.toast('JIG를 선택하세요.', 'warning'); return; }
        await Storage.add(LOG_STORE, {
            jigId,
            date: document.getElementById('logDate')?.value || _today(),
            workType: document.getElementById('logWorkType')?.value || '도장 작업',
            useCount: parseInt(document.getElementById('logUseCount')?.value || 0) || 0,
            note: document.getElementById('logNote')?.value.trim() || ''
        });
        UIUtils.closeModal();
        UIUtils.toast('사용 이력이 등록되었습니다.', 'success');
        loadAll();
    }

    function removeLog(id) {
        UIUtils.confirm('사용 이력을 삭제하시겠습니까?', async () => {
            await Storage.remove(LOG_STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            loadAll();
        });
    }

    function _normalizeLine(lineVal) {
        const s = String(lineVal || '').toUpperCase().replace(/\s/g, '');
        if (s.includes('B')) return 'B라인';
        if (s.includes('A')) return 'A라인';
        return null;
    }

    function _calcUseCount(spindle, line) {
        const cycle = line === 'A라인' ? A_LINE_CYCLE : B_LINE_CYCLE;
        if (spindle <= cycle) return 1;
        return Math.round(spindle / cycle);
    }

    function _getProductCvt(carModel, partName) {
        const prod = (Storage.getAll(DB.STORES.PRODUCTS) || []).find(p => p.carModel === carModel && p.partName === partName);
        if (!prod) return 0;
        for (let i = 1; i <= 4; i++) {
            const proc = String(prod['process' + i] || '').toLowerCase();
            if (proc.includes('도장') || proc.includes('paint')) return Number(prod['cvt' + i]) || 0;
        }
        return Number(prod.cvt1) || 0;
    }

    async function addUsageFromWork(work) {
        if (!work) return;
        const line = _normalizeLine(work.line);
        if (!line) return;
        const cvt = _getProductCvt(work.carModel, work.partName);
        const inputQty = Number(work.inputQty) || 0;
        if (!cvt || !inputQty) return;
        const spindle = Math.ceil(inputQty / cvt);
        const useCount = _calcUseCount(spindle, line);
        const jig = _findJigForProduct(Storage.getAll(STORE) || [], work.carModel, work.partName, line);
        if (!jig) return;
        const logs = Storage.getAll(LOG_STORE) || [];
        const replacementDate = _latestReplacementDate(logs, jig.id);
        if (!_isOnOrAfterReplacement(work.date, replacementDate)) return;
        if (logs.some(l => l.paintingWorkId === work.id && l.source === 'auto_painting')) return;
        await Storage.add(LOG_STORE, {
            jigId: jig.id,
            date: work.date,
            workType: '도장 작업',
            useCount,
            note: `자동: SPINDLE ${_fmt(spindle)}개 (투입 ${_fmt(inputQty)} ÷ CVT ${cvt}) 1CYCLE=${line === 'A라인' ? A_LINE_CYCLE : B_LINE_CYCLE}`,
            source: 'auto_painting',
            paintingWorkId: work.id
        });
    }

    async function syncFromPaintingWork() {
        if (!_isAdminUser()) {
            UIUtils.toast('데이터 보정/재계산은 관리자만 실행할 수 있습니다.', 'warning');
            return;
        }
        UIUtils.confirm('도장 작업 실적 전체를 기준으로 JIG 자동 사용 이력을 재계산합니다.\n기존 자동 생성 이력은 삭제 후 재등록됩니다.\n교체일 이전 실적은 제외됩니다.\n계속하시겠습니까?', async () => {
            const oldLogs = (Storage.getAll(LOG_STORE) || []).filter(l => l.source === 'auto_painting');
            for (const log of oldLogs) await Storage.remove(LOG_STORE, log.id);
            const works = Storage.getAll(DB.STORES.PAINTING_WORK) || [];
            const jigs = Storage.getAll(STORE) || [];
            const resetLogs = Storage.getAll(LOG_STORE) || [];
            let added = 0;
            let skipped = 0;
            for (const work of works) {
                const line = _normalizeLine(work.line);
                const cvt = _getProductCvt(work.carModel, work.partName);
                const inputQty = Number(work.inputQty) || 0;
                if (!line || !cvt || !inputQty) { skipped++; continue; }
                const spindle = Math.ceil(inputQty / cvt);
                const jig = _findJigForProduct(jigs, work.carModel, work.partName, line);
                if (!jig) { skipped++; continue; }
                const replacementDate = _latestReplacementDate(resetLogs, jig.id);
                if (!_isOnOrAfterReplacement(work.date, replacementDate)) { skipped++; continue; }
                await Storage.add(LOG_STORE, {
                    jigId: jig.id,
                    date: work.date,
                    workType: '도장 작업',
                    useCount: _calcUseCount(spindle, line),
                    note: `자동: SPINDLE ${_fmt(spindle)}개 (투입 ${_fmt(inputQty)} ÷ CVT ${cvt}) 1CYCLE=${line === 'A라인' ? A_LINE_CYCLE : B_LINE_CYCLE}`,
                    source: 'auto_painting',
                    paintingWorkId: work.id
                });
                added++;
            }
            UIUtils.toast(`동기화 완료: ${added}건 등록 / ${skipped}건 스킵`, 'success');
            loadAll();
        });
    }

    return {
        init: render,
        renderMenu,
        renderHub,
        renderLifeStandardPage,
        render,
        renderMasterPage,
        renderHistoryPage,
        renderOrderingPage,
        switchView,
        loadAll,
        filterLine,
        filterStatus,
        renderJigMaster,
        renderLog,
        onCarModelChange,
        onMasterCarModelChange,
        onMasterCarFilterChange,
        onLogCarChange,
        resetLogFilter,
        openJigMasterModal,
        enableJigMasterEdit,
        recalcMasterLifeFromThickness,
        recalcMasterOrderQty,
        onIntegratedJigToggle,
        viewJigMasterPhoto,
        openAddModal,
        openEditModal,
        openBatchRegisterModal,
        filterBatchCar,
        updateRegisteredMaxCount,
        openBatchMergeModal,
        saveBatchMerge,
        saveBatch,
        openAddLogModal,
        saveJigMaster,
        saveNew,
        saveEdit,
        saveLog,
        saveLifeStandard,
        focusLifeStandardPasteZone,
        handleLifeStandardPaste,
        printLifeStandardPage,
        readJigMasterPhoto,
        pasteJigMasterPhoto,
        clearJigMasterPhoto,
        viewJigPhoto,
        viewResetPhoto,
        openHistoryModal,
        saveHistory,
        removeHistory,
        openOrderingModal,
        editOrdering,
        saveOrdering,
        removeOrdering,
        remove,
        removeLog,
        resetCount,
        uploadResetPhoto,
        confirmResetCount,
        addUsageFromWork,
        syncFromPaintingWork,
        openUsageHistory,
        savePreMesUsedCount
    };
})();
