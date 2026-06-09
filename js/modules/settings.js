/**
 * 관리/설정 모듈
 * 제품 마스터, 불량 유형, 시스템 설정, 데이터 백업/복원
 */

const SettingsModule = (function() {
    const PRODUCTS_STORE = DB.STORES.PRODUCTS;
    const DEFECTS_STORE = DB.STORES.DEFECT_TYPES;
    const PAINT_STORE = DB.STORES.PAINT_MATERIALS;
    const INSPECTORS_STORE = DB.STORES.INSPECTORS;
    const OPERATORS_STORE = DB.STORES.OPERATORS;

    const SETTINGS_TAB_KEY = 'mes_settings_tab';
    const DOCUMENT_DESIGN_KEY = 'mes_document_designs_v1';
    let currentTab = (() => {
        try { return sessionStorage.getItem(SETTINGS_TAB_KEY) || 'products'; } catch(e) { return 'products'; }
    })();
    let _pendingPhoto = null; // 모달 사진 임시 보관
    let _pendingSeal = null;  // 모달 서명/날인 임시 보관

    // ── 제조 공정 타입 관리 ──────────────────────────────────────────
    const DEFAULT_PROCESS_TYPES = ['사출', '도장-A', '도장-B', '레이저', '인쇄', '외관 검사', '외관+각인 검사'];
    let _processTypes = [...DEFAULT_PROCESS_TYPES];
    const PROCESS_CONFIG_KEY = 'processTypes';

    // ── 세부 공정 관리 ───────────────────────────────────────────────
    const SUB_PROCESS_CONFIG_KEY = 'subProcessTypes';
    // CP 관리계획서 공정 명칭과 일치하는 기본 세부 공정
    const DEFAULT_SUB_PROCESS_TYPES = {
        '사출':           ['재료 투입', '사출 성형', '냉각', '취출', '게이트 처리', '외관 검사'],
        '도장-A':         ['로딩', '세척', '제전', '배합', '하도 공급', '상도 공급', '하도 스프레이', '상도 스프레이', '건조', '언로딩', '도장 검사', '포장'],
        '도장-B':         ['로딩', '세척', '제전', '배합', '하도 공급', '상도 공급', '하도 스프레이', '상도 스프레이', '건조', '언로딩', '도장 검사', '포장'],
        '레이저':         ['레이져', '공정 검사'],
        '인쇄':           ['로딩', '인쇄', '건조', '검사', '언로딩'],
        '외관 검사':      ['외관 검사', '합부 판정'],
        '외관+각인 검사': ['외관 검사', '각인 검사', '합부 판정'],
        '조립압착':       ['부품 준비', '조립', '압착', '검사'],
    };
    let _subProcessTypes = {};          // { mainProcess: [subProc, ...] }
    let _selectedMainForSub = '';       // 현재 선택된 주공정 (세부 공정 패널)


    async function render(container) {
        if (currentTab === 'documentDesign') currentTab = 'products';
        await _loadProcessTypes();
        container.innerHTML = `
            <div class="fade-in-up">
                <!-- 탭 네비게이션 -->
                <div class="settings-tabs">
                    <button class="tab-btn ${currentTab === 'products' ? 'active' : ''}" 
                        onclick="SettingsModule.switchTab('products')">
                        <span class="material-symbols-outlined">category</span> 제품 정보
                    </button>
                    <button class="tab-btn ${currentTab === 'defects' ? 'active' : ''}" 
                        onclick="SettingsModule.switchTab('defects')">
                        <span class="material-symbols-outlined">report_problem</span> 불량 유형
                    </button>
                    <button class="tab-btn ${currentTab === 'paint' ? 'active' : ''}"
                        onclick="SettingsModule.switchTab('paint')">
                        <span class="material-symbols-outlined">palette</span> 도료 관리
                    </button>
                    <button class="tab-btn ${currentTab === 'injectMat' ? 'active' : ''}"
                        onclick="SettingsModule.switchTab('injectMat')">
                        <span class="material-symbols-outlined">inventory_2</span> 사출자재
                    </button>
                    <button class="tab-btn ${currentTab === 'rawMaterials' ? 'active' : ''}"
                        onclick="SettingsModule.switchTab('rawMaterials')">
                        <span class="material-symbols-outlined">science</span> 원재료
                    </button>
                    <button class="tab-btn ${currentTab === 'process' ? 'active' : ''}"
                        onclick="SettingsModule.switchTab('process')">
                        <span class="material-symbols-outlined">settings_applications</span> 공정 관리
                    </button>
                    <button class="tab-btn ${currentTab === 'backup' ? 'active' : ''}"
                        onclick="SettingsModule.switchTab('backup')">
                        <span class="material-symbols-outlined">backup</span> 백업/복원
                    </button>
                    <button class="tab-btn ${currentTab === 'system' ? 'active' : ''}"
                        onclick="SettingsModule.switchTab('system')">
                        <span class="material-symbols-outlined">settings</span> 시스템
                    </button>
                    <button class="tab-btn ${currentTab === 'users' ? 'active' : ''}"
                        onclick="SettingsModule.switchTab('users')"
                        style="${currentTab === 'users' ? '' : 'border-color:#7c3aed;color:#7c3aed;'}">
                        <span class="material-symbols-outlined">manage_accounts</span> 사용자 관리
                    </button>
                </div>

                <!-- 탭 콘텐츠 -->
                <div id="settingsContent"></div>
            </div>
        `;

        renderTabContent();
    }

    function switchTab(tab) {
        if (tab === 'documentDesign') tab = 'products';
        currentTab = tab;
        try { sessionStorage.setItem(SETTINGS_TAB_KEY, tab); } catch(e) {}
        const container = document.getElementById('contentArea');
        render(container);
    }

    // 필터 값 저장: 탭 재렌더링 전에 현재 필터 값을 읽어 둠
    function _saveFilters(ids) {
        const saved = {};
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) saved[id] = el.value || '';
        });
        return saved;
    }
    // 필터 값 복원 후 필터 함수 호출
    function _restoreFilters(saved, filterFn) {
        let any = false;
        Object.entries(saved).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el && val) { el.value = val; any = true; }
        });
        if (any) filterFn();
    }

    function renderTabContent() {
        const el = document.getElementById('settingsContent');

        switch (currentTab) {
            case 'products': {
                const saved = _saveFilters(['carModelFilter', 'customerFilter']);
                renderProductsTab(el);
                _restoreFilters(saved, filterProductList);
                break;
            }
            case 'defects':
                renderDefectsTab(el);
                break;
            case 'paint': {
                const saved = _saveFilters(['paintSupplierFilter']);
                renderPaintTab(el);
                _restoreFilters(saved, filterPaintList);
                break;
            }
            case 'injectMat': {
                const saved = _saveFilters(['injectMatCarModelFilter', 'injectMatSupplierFilter']);
                renderInjectMatTab(el);
                _restoreFilters(saved, filterInjectMatList);
                break;
            }
            case 'rawMaterials': {
                const saved = _saveFilters(['rawMatSupplierFilter', 'rmCarModelFilter']);
                renderRawMatTab(el);
                _restoreFilters(saved, filterRawMatList);
                break;
            }
            case 'inspectors':
                renderInspectorsTab(el);
                break;
            case 'operators':
                renderOperatorsTab(el);
                break;
            case 'certifications':
                renderCertificationTab(el);
                break;
            case 'process':
                renderProcessTab(el);
                break;
            case 'backup':
                renderBackupTab(el);
                break;
            case 'system':
                renderSystemTab(el);
                break;
            case 'users':
                renderUsersTab(el);
                break;
        }
    }

    // =====================================================
    // 제품 창고 탭
    // =====================================================
    // 제품 CSV 열 정의 (순서 고정)
    const PRODUCT_COLUMNS = [{
            key: 'carModel',
            label: '차종'
        },
        {
            key: 'partName',
            label: '품명'
        },
        {
            key: 'color',
            label: '컬러'
        },
        {
            key: 'itemType',
            label: '품목구분'
        },
        {
            key: 'packUnit',
            label: '납품포장용량'
        },
        {
            key: 'customer',
            label: '납품처'
        },
        {
            key: 'salePrice',
            label: '판매가격'
        },
        {
            key: 'injectionPrice',
            label: '사출매입가'
        },
        {
            key: 'manufacturePrice',
            label: '제조가격'
        },
        {
            key: 'process1',
            label: '공정-1'
        },
        {
            key: 'ct1',
            label: 'C/T-1'
        },
        {
            key: 'cvt1',
            label: 'CVT-1'
        },
        {
            key: 'process2',
            label: '공정-2'
        },
        {
            key: 'ct2',
            label: 'C/T-2'
        },
        {
            key: 'cvt2',
            label: 'CVT-2'
        },
        {
            key: 'process3',
            label: '공정-3'
        },
        {
            key: 'ct3',
            label: 'C/T-3'
        },
        {
            key: 'cvt3',
            label: 'CVT-3'
        },
        {
            key: 'process4',
            label: '공정-4'
        },
        {
            key: 'ct4',
            label: 'C/T-4'
        },
        {
            key: 'cvt4',
            label: 'CVT-4'
        }
    ];

    function filterProductList() {
        const selectedModel = (document.getElementById('carModelFilter') || {}).value || '';
        const selectedCustomer = (document.getElementById('customerFilter') || {}).value || '';

        const tbody = document.querySelector('#settingsContent .data-table tbody');
        if (!tbody) return;

        const rows = tbody.querySelectorAll('tr');
        let visibleCount = 0;

        if (rows.length === 1 && rows[0].cells.length === 1) return;

        rows.forEach(row => {
            const modelCell = row.cells[1];
            const customerCell = row.cells[6];
            if (!modelCell) return;

            const rowModel = modelCell.textContent.trim();
            const rowCustomer = customerCell ? customerCell.textContent.trim() : '';

            const modelMatch = selectedModel === '' || rowModel === selectedModel;
            const customerMatch = selectedCustomer === '' || rowCustomer === selectedCustomer;

            if (modelMatch && customerMatch) {
                row.style.display = '';
                visibleCount++;
            } else {
                row.style.display = 'none';
            }
        });

        const countSpan = document.getElementById('productCount');
        if (countSpan) countSpan.textContent = visibleCount;
    }

    // ── 제품 등록 검증 패널 ──────────────────────────────────────────────
    function buildProductValidationPanel() {
        const products  = Storage.getAll(PRODUCTS_STORE) || [];
        const injMats   = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const injInv    = Storage.getAll(DB.STORES.INJECTION_INVENTORY) || [];
        const pNameSet  = new Set(products.map(p => (p.partName || '').trim()).filter(Boolean));

        // ── 검사 항목 ──────────────────────────────────────────────────
        // [1] 필수정보 누락 (carModel / partName / color 없음)
        const missingBasic = products.filter(p => !p.carModel || !p.partName || !p.color);

        // [2] 공정 미설정
        const noProcess = products.filter(p =>
            !p.process1 && !p.process2 && !p.process3 && !p.process4);

        // [3] 사출자재 미연결 (제품 품명을 참조하는 사출자재 없음)
        const noInjMat = products.filter(p => {
            const pn = (p.partName || '').trim();
            if (!pn) return false;
            return !injMats.some(m =>
                (m.mfgProductName  || '').trim() === pn ||
                (m.mfgProductName2 || '').trim() === pn ||
                (m.productIds && m.productIds.includes(p.id))
            );
        });

        // [4] 사출자재 제작품목 미설정 (mfgProductName/2 + productIds 모두 없음)
        const noMfgMap = injMats.filter(m =>
            !(m.mfgProductName || '').trim() &&
            !(m.mfgProductName2 || '').trim() &&
            (!m.productIds || m.productIds.length === 0)
        );

        // [5] injColor 미설정 — 같은 injPartName인 자재가 여러 개인데 injColor 없는 것
        const injPartGroups = {};
        injMats.forEach(m => {
            const k = (m.injPartName || '').trim();
            if (!k) return;
            if (!injPartGroups[k]) injPartGroups[k] = [];
            injPartGroups[k].push(m);
        });
        const noColorMats = [];
        Object.values(injPartGroups).forEach(grp => {
            if (grp.length > 1) grp.forEach(m => { if (!m.injColor) noColorMats.push(m); });
        });

        // [6] 사출자재 제작품목 품명 불일치 (mfgProductName이 제품마스터에 없음)
        const orphanMfg = injMats.filter(m => {
            const n1 = (m.mfgProductName  || '').trim();
            const n2 = (m.mfgProductName2 || '').trim();
            if (!n1 && !n2) return false;
            return (n1 && !pNameSet.has(n1)) || (n2 && !pNameSet.has(n2));
        });

        // [7] 사출창고 재고에 있지만 사출자재 등록 없는 품목 (injPartName 불일치)
        const invPartNames = [...new Set(injInv.map(r => (r.partName || '').trim()).filter(Boolean))];
        const injMatPartNames = new Set(injMats.map(m => (m.injPartName || '').trim()).filter(Boolean));
        const orphanInv = invPartNames.filter(n => !injMatPartNames.has(n));

        // [8] 품명 중복 (carModel + partName 동일, 색상 다름)
        const nameSeen = {};
        products.forEach(p => {
            const k = `${p.carModel||''}||${(p.partName||'').trim()}`;
            if (!nameSeen[k]) nameSeen[k] = [];
            nameSeen[k].push(p);
        });
        const dupNames = Object.entries(nameSeen).filter(([, arr]) => arr.length > 1);

        // [9] 사출자재 텍스트만 연결 (productIds 미등록)
        //     mfgProductName/2 는 있지만 productIds 가 비어있는 자재 → ID 연결 권장
        const textOnlyMats = injMats.filter(m => {
            const n1 = (m.mfgProductName  || '').trim();
            const n2 = (m.mfgProductName2 || '').trim();
            return (n1 || n2) && !(m.productIds && m.productIds.length > 0);
        });

        // ── 요약 집계 ──────────────────────────────────────────────────
        const errors   = missingBasic.length + orphanMfg.length;
        const warnings = noProcess.length + noInjMat.length + noMfgMap.length +
                         noColorMats.length + orphanInv.length + dupNames.length +
                         textOnlyMats.length;
        const allOk    = errors === 0 && warnings === 0;

        const headerColor = allOk ? 'var(--accent-green)'
                          : errors > 0 ? 'var(--accent-red)' : '#d97706';
        const headerBg    = allOk ? 'rgba(52,211,153,0.07)'
                          : errors > 0 ? 'rgba(220,38,38,0.07)' : 'rgba(217,119,6,0.07)';
        const headerBdr   = allOk ? 'rgba(52,211,153,0.3)'
                          : errors > 0 ? 'rgba(220,38,38,0.3)' : 'rgba(217,119,6,0.3)';
        const headerIcon  = allOk ? '✅' : errors > 0 ? '⛔' : '⚠';
        const headerLabel = allOk ? '제품 등록 검증 — 모두 정상'
                          : `제품 등록 검증 — ${errors > 0 ? `오류 ${errors}건` : ''}${errors > 0 && warnings > 0 ? ' · ' : ''}${warnings > 0 ? `경고 ${warnings}건` : ''}`;

        // ── 행 렌더 헬퍼 ───────────────────────────────────────────────
        function issueRow(level, title, items, renderItem) {
            if (items.length === 0) {
                return `<div style="display:flex;align-items:center;gap:8px;padding:5px 10px;font-size:0.82rem;">
                    <span style="color:var(--accent-green);font-size:1rem;">✅</span>
                    <span style="color:var(--text-muted);">${title} — 이상 없음</span>
                </div>`;
            }
            const color = level === 'error' ? 'var(--accent-red)' : '#d97706';
            const icon  = level === 'error' ? '⛔' : '⚠';
            const bg    = level === 'error' ? 'rgba(220,38,38,0.05)' : 'rgba(217,119,6,0.05)';
            const id    = 'pvDetail_' + title.replace(/\s/g,'');
            return `
            <div style="border:1px solid ${color}33;border-radius:6px;overflow:hidden;margin-bottom:6px;">
                <div onclick="(function(el){el.style.display=el.style.display==='none'?'':'none';})(document.getElementById('${id}'))"
                     style="display:flex;align-items:center;justify-content:space-between;
                            padding:6px 12px;background:${bg};cursor:pointer;user-select:none;">
                    <span style="font-size:0.83rem;font-weight:600;color:${color};">
                        ${icon} ${title} <span style="background:${color};color:#fff;border-radius:10px;
                            padding:1px 7px;font-size:0.72rem;margin-left:4px;">${items.length}</span>
                    </span>
                    <span style="font-size:0.72rem;color:var(--text-muted);">클릭하여 상세보기 ▾</span>
                </div>
                <div id="${id}" style="display:none;padding:8px 12px;background:var(--bg-primary);
                                       font-size:0.80rem;max-height:220px;overflow-y:auto;">
                    ${items.map(renderItem).join('')}
                </div>
            </div>`;
        }

        // ── 행 렌더러들 ────────────────────────────────────────────────
        const rowMissingBasic = p => {
            const missing = [!p.carModel && '차종', !p.partName && '품명', !p.color && '컬러'].filter(Boolean);
            return `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;border-bottom:1px solid var(--border-color);">
                <span style="flex:1;"><strong>${p.carModel||'?'}</strong> / ${p.partName||'?'} / ${p.color||'?'}
                    <span style="color:var(--accent-red);font-size:0.75rem;margin-left:6px;">[${missing.join(', ')} 없음]</span></span>
                <button onclick="SettingsModule.editProduct('${p.id}')"
                    style="padding:2px 8px;font-size:0.72rem;background:var(--accent-blue);color:#fff;border:none;border-radius:4px;cursor:pointer;">수정</button>
            </div>`;
        };

        const rowNoProcess = p =>
            `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;border-bottom:1px solid var(--border-color);">
                <span style="flex:1;"><strong>${p.carModel||'-'}</strong> / ${p.partName||'-'} / ${p.color||'-'}</span>
                <button onclick="SettingsModule.editProduct('${p.id}')"
                    style="padding:2px 8px;font-size:0.72rem;background:var(--accent-blue);color:#fff;border:none;border-radius:4px;cursor:pointer;">수정</button>
            </div>`;

        const rowNoInjMat = p =>
            `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;border-bottom:1px solid var(--border-color);">
                <span style="flex:1;"><strong>${p.carModel||'-'}</strong> / ${p.partName||'-'} / ${p.color||'-'}
                    <span style="color:var(--text-muted);font-size:0.75rem;margin-left:4px;">→ 사출자재 미연결 — 수정에서 입력 가능</span></span>
                <button onclick="UIUtils.closeModal();SettingsModule.editProduct('${p.id}');"
                    style="padding:2px 8px;font-size:0.72rem;background:var(--accent-blue);color:#fff;border:none;border-radius:4px;cursor:pointer;">수정</button>
            </div>`;

        const rowNoMfgMap = m => {
            const enc = encodeURIComponent(JSON.stringify({
                carModel:    m.carModel    || '',
                partName:    m.injPartName || '',
                color:       m.injColor    || '',
                injPartName: m.injPartName || '',
                injColor:    m.injColor    || ''
            }));
            return `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border-color);flex-wrap:wrap;">
                <span style="flex:1;min-width:0;"><strong>${m.carModel||'-'}</strong> / 사출품명: ${m.injPartName||'-'}
                    <span style="color:var(--text-muted);font-size:0.75rem;margin-left:4px;">컬러: ${m.injColor||'(없음)'}</span>
                    <span style="color:var(--accent-red);font-size:0.75rem;margin-left:4px;">→ 제작품목 미설정</span></span>
                <button onclick="UIUtils.closeModal();SettingsModule.openAddProductModal(JSON.parse(decodeURIComponent('${enc}')))"
                    style="padding:2px 8px;font-size:0.72rem;background:var(--accent-blue);color:#fff;
                           border:none;border-radius:4px;cursor:pointer;white-space:nowrap;">
                    + 제품 추가</button>
            </div>`;
        };

        const rowNoColor = m =>
            `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;border-bottom:1px solid var(--border-color);">
                <span style="flex:1;"><strong>${m.carModel||'-'}</strong> / ${m.injPartName||'-'}
                    <span style="color:var(--accent-red);font-size:0.75rem;margin-left:4px;">같은 부품명이 여러 개인데 컬러 미설정</span></span>
                <button onclick="SettingsModule.editInjectMat('${m.id}')"
                    style="padding:2px 8px;font-size:0.72rem;background:#d97706;color:#fff;border:none;border-radius:4px;cursor:pointer;">수정</button>
            </div>`;

        const rowOrphanMfg = m => {
            const bad = [(m.mfgProductName||'').trim(), (m.mfgProductName2||'').trim()]
                .filter(n => n && !pNameSet.has(n));
            // 각 불일치 품명마다 제품 추가 버튼 생성
            const addBtns = bad.map(pn => {
                const enc = encodeURIComponent(JSON.stringify({
                    carModel:    m.carModel    || '',
                    partName:    pn,
                    color:       m.injColor    || '',
                    injPartName: m.injPartName || '',
                    injColor:    m.injColor    || ''
                }));
                return `<button onclick="UIUtils.closeModal();SettingsModule.openAddProductModal(JSON.parse(decodeURIComponent('${enc}')))"
                    style="padding:2px 8px;font-size:0.72rem;background:var(--accent-blue);color:#fff;
                           border:none;border-radius:4px;cursor:pointer;white-space:nowrap;">
                    + "${pn}" 제품 추가</button>`;
            }).join('');
            return `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border-color);flex-wrap:wrap;">
                <span style="flex:1;min-width:0;"><strong>${m.carModel||'-'}</strong> / ${m.injPartName||'-'}
                    → 제작품목 "<span style="color:var(--accent-red);">${bad.join(', ')}</span>" 이 제품마스터에 없음</span>
                ${addBtns}
            </div>`;
        };

        const rowOrphanInv = n => {
            const enc = encodeURIComponent(n);
            // 해당 품명의 창고 재고 건수
            const cnt = injInv.filter(r => (r.partName || '').trim() === n).length;
            return `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;border-bottom:1px solid var(--border-color);flex-wrap:wrap;">
                <span style="flex:1;min-width:0;">창고 품명 <strong>"${n}"</strong>
                    <span style="color:var(--text-muted);font-size:0.75rem;margin-left:4px;">→ 사출자재 마스터에 동일 사출품명 없음</span>
                    <span style="color:var(--text-muted);font-size:0.72rem;margin-left:6px;">(재고 ${cnt}건)</span></span>
                <button onclick="SettingsModule.switchTab('injectMat')"
                    style="padding:2px 8px;font-size:0.72rem;background:#d97706;color:#fff;border:none;border-radius:4px;cursor:pointer;white-space:nowrap;">
                    사출자재 등록</button>
                <button onclick="SettingsModule.openInvPartNameEditModal(decodeURIComponent('${enc}'))"
                    style="padding:2px 8px;font-size:0.72rem;background:var(--accent-blue);color:#fff;border:none;border-radius:4px;cursor:pointer;white-space:nowrap;">
                    창고품명 수정</button>
            </div>`;
        };

        const rowDupName = ([key, arr]) => {
            const [cm, pn] = key.split('||');
            return `<div style="padding:3px 0;border-bottom:1px solid var(--border-color);">
                <strong>${cm||'-'}</strong> / ${pn||'-'} — ${arr.length}개 컬러:
                ${arr.map(p => `<span style="background:rgba(217,119,6,0.15);color:#92400e;border:1px solid #d97706;
                    border-radius:4px;padding:0 6px;font-size:0.75rem;margin-left:4px;">${p.color||'(없음)'}
                    <button onclick="SettingsModule.editProduct('${p.id}')"
                        style="margin-left:3px;padding:0 4px;font-size:0.68rem;background:#d97706;
                        color:#fff;border:none;border-radius:2px;cursor:pointer;">수정</button></span>`).join('')}
            </div>`;
        };

        const rowTextOnly = m =>
            `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;border-bottom:1px solid var(--border-color);flex-wrap:wrap;">
                <span style="flex:1;min-width:0;">
                    <strong>${m.carModel||'-'}</strong> / ${m.injPartName||'-'}
                    → 제작품목: <em>${m.mfgProductName||'-'}${m.mfgProductName2 ? ' / '+m.mfgProductName2 : ''}</em>
                    <span style="color:#b45309;font-size:0.75rem;margin-left:4px;">텍스트만 연결 — 제품 ID 미등록</span>
                </span>
                <button onclick="SettingsModule.autoLinkProductIds('${m.id}', true)"
                    style="padding:2px 8px;font-size:0.72rem;background:#6366f1;color:#fff;border:none;border-radius:4px;cursor:pointer;white-space:nowrap;">
                    자동 ID 연결</button>
                <button onclick="UIUtils.closeModal();SettingsModule.editInjectMat('${m.id}')"
                    style="padding:2px 8px;font-size:0.72rem;background:var(--accent-blue);color:#fff;border:none;border-radius:4px;cursor:pointer;white-space:nowrap;">
                    수정</button>
            </div>`;

        return `
        <div class="card" style="margin-bottom:16px;border:1px solid ${headerBdr};background:${headerBg};">
            <div class="card-header" style="padding:10px 16px;cursor:pointer;user-select:none;border-bottom:1px solid ${headerBdr};"
                 onclick="(function(el){
                     el.style.display=el.style.display==='none'?'':'none';
                     document.getElementById('pvToggleIcon').textContent=el.style.display===''?'expand_less':'expand_more';
                 })(document.getElementById('pvBody'))">
                <div style="display:flex;align-items:center;justify-content:space-between;width:100%;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span class="material-symbols-outlined" style="color:${headerColor};font-size:1.2rem;">fact_check</span>
                        <span style="font-weight:700;color:${headerColor};font-size:0.92rem;">${headerLabel}</span>
                        ${!allOk ? `<span style="font-size:0.75rem;color:var(--text-muted);">클릭하여 상세 보기</span>` : ''}
                    </div>
                    <span id="pvToggleIcon" class="material-symbols-outlined" style="color:var(--text-muted);font-size:1.1rem;">${allOk ? 'expand_more' : 'expand_less'}</span>
                </div>
            </div>
            <div id="pvBody" style="padding:12px 16px;display:${allOk ? 'none' : 'block'};">
                ${issueRow('error',   '필수정보 누락 (차종/품명/컬러)',                missingBasic,   rowMissingBasic)}
                ${issueRow('error',   '사출자재 제작품목 품명 불일치',                  orphanMfg,      rowOrphanMfg)}
                ${issueRow('warning', '공정 미설정 (공정1~4 모두 없음)',               noProcess,      rowNoProcess)}
                ${issueRow('warning', '사출자재 미연결 (이 품명 참조 자재 없음)',       noInjMat,       rowNoInjMat)}
                ${issueRow('warning', '사출자재 제작품목 미설정',                      noMfgMap,       rowNoMfgMap)}
                ${issueRow('warning', '사출자재 텍스트 연결만 있음 (ID 미등록)',        textOnlyMats,   rowTextOnly)}
                ${issueRow('warning', '사출자재 컬러 미설정 (동명 자재 여러 개)',        noColorMats,    rowNoColor)}
                ${issueRow('warning', '사출창고 재고 — 자재마스터 불일치',              orphanInv,      rowOrphanInv)}
                ${issueRow('warning', '동일 차종·품명 (컬러 다름, 품명 분리 검토)',     dupNames,       rowDupName)}
                <div style="margin-top:8px;text-align:right;">
                    <button onclick="SettingsModule.switchTab('products')"
                        style="padding:3px 12px;font-size:0.78rem;background:transparent;
                               color:var(--text-muted);border:1px solid var(--border-color);
                               border-radius:4px;cursor:pointer;">🔄 재검사</button>
                </div>
            </div>
        </div>`;
    }

    function renderProductsTab(el) {
        const products = Storage.getAll(PRODUCTS_STORE).sort((a, b) =>
            (a.carModel || '').localeCompare(b.carModel || '', 'ko') || (a.partName || '').localeCompare(b.partName || '', 'ko')
        );
        const injMaterials  = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const paintMaterials = Storage.getAll(DB.STORES.PAINT_MATERIALS) || [];
        const uniqueCarModels = UIUtils.sortCarModels(products.map(p => p.carModel), products);
        const uniqueCustomers = [...new Set(products.map(p => p.customer).filter(Boolean))].sort();
        const colspan = 14;

        el.innerHTML = `
            ${buildProductValidationPanel()}
            <div class="card">
                <div class="card-header" style="flex-wrap: wrap; gap: 10px;">
                    <div style="display:flex; align-items:center; gap: 12px; flex-wrap:wrap;">
                        <h4 style="margin:0;"><span class="material-symbols-outlined">category</span> 제품 목록 (<span id="productCount">${products.length}</span>건)</h4>
                        <select id="carModelFilter" class="form-input" style="width: 140px; padding: 4px 8px;" onchange="SettingsModule.filterProductList()">
                            <option value="">전체 차종</option>
                            ${uniqueCarModels.map(model => `<option value="${model}">${model}</option>`).join('')}
                        </select>
                        <select id="customerFilter" class="form-input" style="width: 140px; padding: 4px 8px;" onchange="SettingsModule.filterProductList()">
                            <option value="">전체 납품처</option>
                            ${uniqueCustomers.map(c => `<option value="${c}">${c}</option>`).join('')}
                        </select>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button class="btn btn-outline" onclick="SettingsModule.downloadProductCSV()">
                            <span class="material-symbols-outlined">download</span> CSV 다운로드
                        </button>
                        <button class="btn btn-secondary" onclick="SettingsModule.openProductUploadModal()">
                            <span class="material-symbols-outlined">upload_file</span> 일괄 업로드
                        </button>
                        <button class="btn btn-secondary" onclick="SettingsModule.showDuplicatePartNameReport()"
                            style="border-color:#d97706;color:#d97706;"
                            title="동일 품명 제품 현황 진단">
                            <span class="material-symbols-outlined">manage_search</span> 품명 중복 진단
                        </button>
                        <button class="btn btn-primary" onclick="SettingsModule.openAddProductModal()">
                            <span class="material-symbols-outlined">add</span> 제품 추가
                        </button>
                    </div>
                </div>
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th style="width:36px;">No</th>
                                    <th style="width:56px;">차종</th>
                                    <th style="min-width:260px;">품명</th>
                                    <th style="width:70px;white-space:nowrap;">도장컬러</th>
                                    <th style="width:48px;white-space:nowrap;text-align:center;">구분</th>
                                    <th style="width:64px;white-space:nowrap;text-align:center;">포장</th>
                                    <th style="width:56px;white-space:nowrap;">납품처</th>
                                    <th style="width:62px;white-space:nowrap;text-align:right;">판매가</th>
                                    <th style="width:62px;white-space:nowrap;text-align:right;">사출매입</th>
                                    <th style="width:62px;white-space:nowrap;text-align:right;">제조가</th>
                                    <th style="white-space:nowrap;">공정별 사양</th>
                                    <th style="white-space:nowrap;">사용 사출 자재</th>
                                    <th style="white-space:nowrap;min-width:360px;">도료 자재</th>
                                    <th style="width:80px;">작업</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${products.length === 0 ?
                `<tr><td colspan="${colspan}" style="text-align:center;padding:40px;color:var(--text-muted);">등록된 제품이 없습니다.</td></tr>` :
                products.map((p, i) => {
                    // 도료 자재: 제품 정보에 등록된 프라이머/경화제/희석제, 컬러/경화제/희석제 조합 전체 표시
                    const paintMap = {};
                    paintMaterials.forEach(pm => { if (pm.id) paintMap[pm.id] = pm; });
                    const paintRows = Array.isArray(p.paintMaterials) ? p.paintMaterials : [];
                    const labelForSpec = spec => spec === 'Primer' ? '프라이머' : spec === 'Color' ? '컬러' : (spec || '도료');
                    const paintName = id => id && paintMap[id] ? (paintMap[id].name || '-') : (id ? '미등록' : '-');
                    const paintTitle = id => {
                        const pm = id ? paintMap[id] : null;
                        return pm ? `${pm.supplier || '-'} / ${pm.manufacturer || '-'} / ${pm.name || '-'}` : (id ? `미등록 ID: ${id}` : '');
                    };
                    const paintBadges = paintRows.length > 0
                        ? paintRows.map(row => {
                            const mainId = row.mainId || row.paintMaterialId || '';
                            const hardId = row.hardId || '';
                            const thinnerId = row.thinnerId || '';
                            const spec = row.paintSpec || (mainId && paintMap[mainId] ? paintMap[mainId].paintSpec : '');
                            const specColor = spec === 'Primer' ? '#6366f1' : spec === 'Color' ? '#ec4899' : '#6b7280';
                            const missing = [mainId, hardId, thinnerId].some(id => id && !paintMap[id]);
                            return `<div style="display:flex;align-items:center;gap:3px;flex-wrap:nowrap;font-size:.62rem;line-height:1.35;margin:1px 0;white-space:nowrap;">
                                <span style="font-weight:800;color:${specColor};background:${specColor}15;border:1px solid ${specColor}55;border-radius:3px;padding:0 4px;min-width:42px;text-align:center;">${labelForSpec(spec)}</span>
                                <span title="${paintTitle(mainId)}" style="font-weight:700;color:${missing && mainId && !paintMap[mainId] ? '#ef4444' : 'var(--text-primary)'};">${paintName(mainId)}</span>
                                <span style="color:var(--text-muted);">/</span>
                                <span title="${paintTitle(hardId)}" style="color:${hardId && !paintMap[hardId] ? '#ef4444' : '#92400e'};">${paintName(hardId)}</span>
                                <span style="color:var(--text-muted);">/</span>
                                <span title="${paintTitle(thinnerId)}" style="color:${thinnerId && !paintMap[thinnerId] ? '#ef4444' : '#0369a1'};">${paintName(thinnerId)}</span>
                            </div>`;
                          }).join('')
                        : '<span style="color:var(--text-muted);font-size:0.75rem;">-</span>';

                    // 사용 사출 자재 매칭: productIds(우선) 또는 mfgProductName 텍스트(fallback)
                    const pName  = (p.partName || '').trim();
                    const pColor = (p.color    || '').trim().toLowerCase();
                    const usedMats = injMaterials.filter(m => {
                        // ID 기반 연결 (productIds 설정된 경우 우선)
                        if (m.productIds && m.productIds.length > 0)
                            return m.productIds.includes(p.id);
                        // 텍스트 기반 fallback (productIds 미설정 시)
                        return pName && (
                            (m.mfgProductName  || '').trim() === pName ||
                            (m.mfgProductName2 || '').trim() === pName
                        );
                    });

                    // 컬러 일치 여부: 제품 컬러 ↔ 사출 자재 injColor (포함 비교)
                    const matBadges = usedMats.length > 0
                        ? usedMats.map(m => {
                            const mColor = (m.injColor || '').trim().toLowerCase();
                            // 제품 컬러와 자재 컬러가 일치하면 초록, 아니면 노란
                            const colorMatch = pColor && mColor && (mColor.includes(pColor) || pColor.includes(mColor));
                            const badgeBg    = colorMatch ? 'rgba(52,211,153,0.15)' : 'rgba(251,191,36,0.15)';
                            const badgeBdr   = colorMatch ? 'var(--accent-green)'   : '#d97706';
                            const badgeClr   = colorMatch ? 'var(--accent-green)'   : '#92400e';
                            const colorLabel = m.injColor || '—';
                            const tip = `생산처: ${m.supplier || '-'} / 자재컬러: ${m.injColor || '-'}`;
                            return `<span title="${tip}"
                                style="display:inline-flex;align-items:center;gap:3px;white-space:nowrap;
                                       background:${badgeBg};border:1px solid ${badgeBdr};border-radius:5px;
                                       padding:2px 8px;font-size:0.72rem;line-height:1.6;">
                                <span style="font-weight:700;color:${badgeClr};">${m.injPartName || '-'}</span>
                                <span style="color:${badgeClr};opacity:0.5;">·</span>
                                <span style="color:${badgeClr};opacity:0.85;">${colorLabel}</span>
                            </span>`;
                          }).join('')
                        : '<span style="color:var(--text-muted);font-size:0.8rem;">-</span>';

                    const itBadge = p.itemType === '양산품'
                        ? '<span class="badge" style="background:rgba(52,211,153,0.15);color:var(--accent-green);border:1px solid var(--accent-green);font-size:.68rem;">양산</span>'
                        : p.itemType === '개발품'
                        ? '<span class="badge" style="background:rgba(59,130,246,0.15);color:var(--accent-blue);border:1px solid var(--accent-blue);font-size:.68rem;">개발</span>'
                        : p.itemType === 'A/S품'
                        ? '<span class="badge" style="background:rgba(245,158,11,0.15);color:#d97706;border:1px solid #d97706;font-size:.68rem;">A/S</span>'
                        : '<span style="color:var(--text-muted);font-size:0.75rem;">-</span>';

                    return `
                                    <tr>
                                        <td style="text-align:center;">${i + 1}</td>
                                        <td style="white-space:nowrap;font-size:.78rem;max-width:56px;overflow:hidden;text-overflow:ellipsis;" title="${p.carModel || ''}">${p.carModel || '-'}</td>
                                        <td style="min-width:260px;"><strong style="font-size:.86rem;">${p.partName || '-'}</strong></td>
                                        <td style="font-size:.8rem;white-space:nowrap;">${p.color || '-'}</td>
                                        <td style="text-align:center;">${itBadge}</td>
                                        <td style="text-align:center;font-size:.8rem;white-space:nowrap;">${p.packUnit || '-'}</td>
                                        <td style="font-size:.76rem;white-space:nowrap;max-width:56px;overflow:hidden;text-overflow:ellipsis;" title="${p.customer||''}">${p.customer || '-'}</td>
                                        <td style="text-align:right;font-size:.76rem;white-space:nowrap;">${p.salePrice ? Number(p.salePrice).toLocaleString() : '-'}</td>
                                        <td style="text-align:right;font-size:.76rem;white-space:nowrap;">${p.injectionPrice ? Number(p.injectionPrice).toLocaleString() : '-'}</td>
                                        <td style="text-align:right;font-size:.76rem;white-space:nowrap;">${p.manufacturePrice ? Number(p.manufacturePrice).toLocaleString() : '-'}</td>
                                        <td>
                                            <div style="display:flex; align-items:center; gap:6px; font-size:0.75rem; flex-wrap:wrap;">
                                                ${[
                            p.process1 ? `<div style="display:flex; align-items:center; gap:4px;"><span class="badge badge-info">${p.process1}</span> <span style="color:var(--text-muted);">${p.cvt1 || '-'}|${p.ct1 || '-'}</span></div>` : '',
                            p.process2 ? `<div style="display:flex; align-items:center; gap:4px;"><span class="badge badge-info">${p.process2}</span> <span style="color:var(--text-muted);">${p.cvt2 || '-'}|${p.ct2 || '-'}</span></div>` : '',
                            p.process3 ? `<div style="display:flex; align-items:center; gap:4px;"><span class="badge badge-info">${p.process3}</span> <span style="color:var(--text-muted);">${p.cvt3 || '-'}|${p.ct3 || '-'}</span></div>` : '',
                            p.process4 ? `<div style="display:flex; align-items:center; gap:4px;"><span class="badge badge-info">${p.process4}</span> <span style="color:var(--text-muted);">${p.cvt4 || '-'}|${p.ct4 || '-'}</span></div>` : ''
                        ].filter(Boolean).join('<span class="material-symbols-outlined" style="font-size:14px; color:var(--text-muted);">arrow_forward</span>')}
                                                ${!p.process1 && !p.process2 && !p.process3 && !p.process4 ? '-' : ''}
                                            </div>
                                        </td>
                                        <td><div style="display:flex;flex-wrap:nowrap;gap:4px;overflow:hidden;">${matBadges}</div></td>
                                        <td style="min-width:360px;max-width:520px;"><div style="display:flex;flex-direction:column;gap:1px;overflow:hidden;">${paintBadges}</div></td>
                                        <td style="white-space:nowrap;">
                                            <button class="btn btn-sm btn-outline" onclick="SettingsModule.editProduct('${p.id}')">수정</button>
                                            <button class="btn btn-sm btn-danger" onclick="SettingsModule.removeProduct('${p.id}')">삭제</button>
                                        </td>
                                    </tr>
                                `;
                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    // 관리 코드 자동 생성 함수 (차종-품명-컬러-NO)
    function generateProductCode(carModel, partName, color) {
        if (!carModel || !partName || !color) return '';

        // 기존 제품 중 같은 차종/품명/컬러 조합 찾기
        const products = Storage.getAll(PRODUCTS_STORE);
        const sameCombo = products.filter(p =>
            p.carModel === carModel &&
            p.partName === partName &&
            p.color === color
        );

        // 다음 번호 = 기존 개수 + 1
        const nextNo = sameCombo.length + 1;
        const noStr = String(nextNo).padStart(3, '0'); // 001, 002...

        // 코드 생성: 차종-품명-컬러-NO (공백 제거)
        const code = `${carModel.replace(/\s+/g, '')}-${partName.replace(/\s+/g, '')}-${color.replace(/\s+/g, '')}-${noStr}`;
        return code;
    }

    // 사출자재 피커 HTML — 차종 필터 + 자재 드롭다운
    function _injMatPickerHTML(idPrefix) {
        const mats = (Storage.getAll(INJECT_MAT_STORE) || [])
            .slice().sort((a, b) =>
                ((a.carModel||'')+(a.injPartName||'')).localeCompare((b.carModel||'')+(b.injPartName||''))
            );
        if (!mats.length) return '';
        const carModels = UIUtils.sortCarModels(mats.map(m => (m.carModel||'').trim()), mats);
        const carOpts = carModels.map(cm =>
            `<option value="${cm.replace(/"/g,'&quot;')}">${cm}</option>`).join('');
        const matOpts = mats.map(m => {
            const label = [m.carModel, m.injPartName, m.injColor ? `(${m.injColor})` : ''].filter(Boolean).join(' / ');
            return `<option value="${(m.id||'').replace(/"/g,'&quot;')}" data-car="${(m.carModel||'').replace(/"/g,'&quot;')}">${label.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</option>`;
        }).join('');
        return `<div style="background:rgba(59,130,246,0.05);border:1px solid rgba(59,130,246,0.25);border-radius:6px;padding:10px 12px;margin-bottom:12px;">
            <div style="font-size:0.78rem;color:var(--accent-blue);font-weight:600;margin-bottom:8px;display:flex;align-items:center;gap:5px;">
                <span class="material-symbols-outlined" style="font-size:15px;">manage_search</span>
                기존 사출자재에서 선택
                <span style="font-weight:400;color:var(--text-muted);font-size:0.72rem;">&nbsp;— 선택 시 아래 항목 자동 채움, 빈 채로 두면 직접 입력</span>
            </div>
            <div class="form-row" style="margin-bottom:0;">
                <div class="form-group">
                    <label class="form-label">차종 필터</label>
                    <select class="form-input" id="${idPrefix}InjPickCarModel"
                        onchange="SettingsModule._filterInjPickList('${idPrefix}')">
                        <option value="">전체</option>
                        ${carOpts}
                    </select>
                </div>
                <div class="form-group" style="flex:2;">
                    <label class="form-label">사출자재 선택</label>
                    <select class="form-input" id="${idPrefix}InjPickSelect"
                        onchange="SettingsModule._applyInjPickMat('${idPrefix}')">
                        <option value="">-- 선택 안 함 (직접 입력) --</option>
                        ${matOpts}
                    </select>
                </div>
            </div>
        </div>`;
    }

    function _filterInjPickList(idPrefix) {
        const carSel = document.getElementById(idPrefix + 'InjPickCarModel');
        const matSel = document.getElementById(idPrefix + 'InjPickSelect');
        if (!carSel || !matSel) return;
        const carVal = carSel.value;
        Array.from(matSel.options).forEach(opt => {
            if (!opt.value) { opt.hidden = false; return; }
            opt.hidden = Boolean(carVal && opt.dataset.car !== carVal);
        });
        matSel.value = '';
        _applyInjPickMat(idPrefix);
    }

    function _applyInjPickMat(idPrefix) {
        const matSel = document.getElementById(idPrefix + 'InjPickSelect');
        if (!matSel) return;
        const matId = matSel.value;
        const mat = matId ? (Storage.getAll(INJECT_MAT_STORE) || []).find(m => m.id === matId) : null;

        const g = id => document.getElementById(id);
        const setField = (id, val, locked) => {
            const el = g(id);
            if (!el) return;
            if (locked) {
                el.value = val || '';
                el.readOnly = true;
                el.style.background = 'var(--bg-secondary)';
                el.style.color = 'var(--text-secondary)';
            } else {
                el.readOnly = false;
                el.style.background = '';
                el.style.color = '';
            }
        };

        const isNew = Boolean(g(idPrefix + 'AutoInjPartName'));
        const f = isNew
            ? { part: idPrefix+'AutoInjPartName', color: idPrefix+'AutoInjColor', sup: idPrefix+'AutoInjSupplier',
                price: idPrefix+'AutoInjPrice', cavity: idPrefix+'AutoInjCavity', weight: idPrefix+'AutoInjWeight',
                linkId: idPrefix+'AutoInjLinkId' }
            : { part: idPrefix+'EditInjPartName_0', color: idPrefix+'EditInjColor_0', sup: idPrefix+'EditInjSupplier_0',
                price: idPrefix+'EditInjPrice_0', cavity: idPrefix+'EditInjCavity_0', weight: idPrefix+'EditInjWeight_0',
                linkId: idPrefix+'EditInjLinkId_0' };

        if (mat) {
            setField(f.part,   mat.injPartName,  true);
            setField(f.color,  mat.injColor,     true);
            setField(f.sup,    mat.supplier,     true);
            setField(f.price,  mat.unitPrice,    true);
            setField(f.cavity, mat.cavityCount,  true);
            setField(f.weight, mat.weight,       true);
            const linkEl = g(f.linkId); if (linkEl) linkEl.value = matId;
        } else {
            [f.part, f.color, f.sup, f.price, f.cavity, f.weight].forEach(id => setField(id, '', false));
            const linkEl = g(f.linkId); if (linkEl) linkEl.value = '';
        }
    }

    function _productFormHTML(p = {}, idPrefix = 'addProd') {
        const v = k => p[k] !== undefined ? p[k] : '';
        const isEdit = idPrefix === 'editProd';
        const processes = ['', ..._processTypes];
        const processOptions = val => processes.map(proc => `<option value="${proc}" ${val === proc ? 'selected' : ''}>${proc || '선택 안함'}</option>`).join('');

        // 도장-A / 도장-B 컬러 행 초기 표시 여부 (둘 다 있을 때만)
        const _procVals = [v('process1'), v('process2'), v('process3'), v('process4')];
        const _showPaintColorRow = _procVals.includes('도장-A') && _procVals.includes('도장-B');

        // 수정 모드: 이 제품에 연결된 사출 자재 조회
        const linkedInjMats = isEdit
            ? (Storage.getAll(INJECT_MAT_STORE) || []).filter(m => {
                // ID 기반 연결 우선
                if (m.productIds && m.productIds.length > 0)
                    return m.productIds.includes(p.id);
                // 텍스트 기반 fallback (carModel + partName 일치)
                return p.partName && m.carModel === p.carModel && (
                    (m.mfgProductName  || '').trim() === p.partName.trim() ||
                    (m.mfgProductName2 || '').trim() === p.partName.trim()
                );
              })
            : [];

        // 도료 다중 선택 초기 렌더링
        const allPaints = Storage.getAll(PAINT_STORE) || [];
        const initialPaintRows = (p.paintMaterials && p.paintMaterials.length > 0)
            ? p.paintMaterials.map(row => ({
                processTag: row.processTag || '공용',
                paintSpec:  row.paintSpec || row.typeFilter || '',
                mainId:     row.mainId    || row.paintMaterialId || '',
                hardId:     row.hardId    || '',
                thinnerId:  row.thinnerId || ''
            }))
            : [{}];
        const initialPaintTableHtml = _paintTableHtml(idPrefix, initialPaintRows, allPaints);

        return `
            <style>
                #modalBody .form-row {
                    gap: 10px !important;
                    margin-bottom: 8px !important;
                }
                #modalBody .form-group {
                    margin-bottom: 6px !important;
                }
                #modalBody .form-label {
                    font-size: 0.74rem !important;
                    margin-bottom: 4px !important;
                }
                #modalBody .form-input,
                #modalBody .form-select {
                    min-height: 32px !important;
                    height: 32px !important;
                    padding: 5px 10px !important;
                    font-size: 0.82rem !important;
                }
                #modalBody [id$="PartNameHint"] {
                    min-height: 10px !important;
                    margin-top: 2px !important;
                    font-size: 0.68rem !important;
                }
                #modalBody [id$="ProcessContainer"] > div {
                    padding: 5px 8px !important;
                    margin-bottom: 5px !important;
                    gap: 8px !important;
                    border-radius: 6px !important;
                }
                #modalBody [id$="ProcessContainer"] .form-label {
                    width: 76px !important;
                }
                #modalBody [id$="ProcessContainer"] button {
                    height: 32px !important;
                    padding: 0 8px !important;
                }
                #modalBody [id$="PaintList"] table th,
                #modalBody [id$="PaintList"] table td {
                    padding: 4px 6px !important;
                    line-height: 1.2 !important;
                    font-size: 0.74rem !important;
                }
                #modalBody [id$="PaintList"] .form-select {
                    height: 30px !important;
                    min-height: 30px !important;
                    padding: 3px 8px !important;
                    font-size: 0.76rem !important;
                }
                #modalBody [style*="margin:16px 0 12px"],
                #modalBody [style*="margin:20px 0 12px"] {
                    margin-top: 10px !important;
                    margin-bottom: 6px !important;
                    padding-bottom: 5px !important;
                }
            </style>
            <div style="font-weight:600;color:var(--text-primary);margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid var(--accent-blue);">
                <span class="material-symbols-outlined" style="vertical-align:middle;font-size:18px;">category</span>
                기본 정보
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <input type="text" class="form-input" id="${idPrefix}CarModel" placeholder="예: HMG-A" value="${v('carModel')}">
                </div>
                <div class="form-group">
                    <label class="form-label">품명 <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="${idPrefix}PartName" placeholder="예: 프론트 범퍼" value="${v('partName')}"
                        oninput="SettingsModule.updateProductInjInfo('${idPrefix}'); SettingsModule.checkPartNameDuplicate('${idPrefix}');">
                    <div id="${idPrefix}PartNameHint" style="margin-top:4px;font-size:0.76rem;min-height:18px;"></div>
                </div>
                <div class="form-group">
                    <label class="form-label">도장 컬러 <span style="font-size:0.68rem;font-weight:400;color:var(--text-muted);">(공통 기본값)</span></label>
                    <input type="text" class="form-input" id="${idPrefix}Color" placeholder="예: 화이트" value="${v('color')}">
                </div>
            </div>
            <div id="${idPrefix}PaintColorRow" class="form-row" style="margin-top:0;display:${_showPaintColorRow ? '' : 'none'};">
                <div class="form-group" style="flex:1;">
                    <label class="form-label" style="display:flex;align-items:center;gap:5px;">
                        <span style="width:9px;height:9px;border-radius:2px;background:var(--accent-blue);display:inline-block;flex-shrink:0;"></span>
                        도장-A 컬러
                        <span style="font-size:0.66rem;font-weight:400;color:var(--text-muted);">미입력 시 공통 컬러 사용</span>
                    </label>
                    <input type="text" class="form-input" id="${idPrefix}PaintColorA" placeholder="예: 하도 그레이" value="${v('paintColorA')}">
                </div>
                <div class="form-group" style="flex:1;">
                    <label class="form-label" style="display:flex;align-items:center;gap:5px;">
                        <span style="width:9px;height:9px;border-radius:2px;background:var(--accent-orange);display:inline-block;flex-shrink:0;"></span>
                        도장-B 컬러
                        <span style="font-size:0.66rem;font-weight:400;color:var(--text-muted);">미입력 시 공통 컬러 사용</span>
                    </label>
                    <input type="text" class="form-input" id="${idPrefix}PaintColorB" placeholder="예: 외관 블랙" value="${v('paintColorB')}">
                </div>
                <div class="form-group" style="flex:1;"></div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">품목구분 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="${idPrefix}ItemType">
                        <option value="" ${!v('itemType') ? 'selected' : ''}>-- 선택 --</option>
                        <option value="양산품" ${v('itemType') === '양산품' ? 'selected' : ''}>양산품</option>
                        <option value="개발품" ${v('itemType') === '개발품' ? 'selected' : ''}>개발품</option>
                        <option value="A/S품" ${v('itemType') === 'A/S품' ? 'selected' : ''}>A/S품</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">납품포장용량</label>
                    <input type="text" class="form-input" id="${idPrefix}PackUnit" placeholder="예: 1EA/BOX" value="${v('packUnit')}">
                </div>
                <div class="form-group">
                    <label class="form-label">납품처</label>
                    <input type="text" class="form-input" id="${idPrefix}Customer" placeholder="예: 현대모비스" value="${v('customer')}">
                </div>
            </div>

            <div style="font-weight:600;color:var(--text-primary);margin:16px 0 12px;padding-bottom:8px;border-bottom:2px solid var(--accent-blue);">
                <span class="material-symbols-outlined" style="vertical-align:middle;font-size:18px;">payments</span>
                가격 정보
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">판매가격 (원)</label>
                    <input type="number" class="form-input" id="${idPrefix}SalePrice" placeholder="0" min="0" value="${v('salePrice')}">
                </div>
                <div class="form-group">
                    <label class="form-label">사출매입가 (원)</label>
                    <input type="number" class="form-input" id="${idPrefix}InjectionPrice" placeholder="0" min="0" value="${v('injectionPrice')}">
                </div>
                <div class="form-group">
                    <label class="form-label">제조가격 (원)</label>
                    <input type="number" class="form-input" id="${idPrefix}ManufacturePrice" placeholder="0" min="0" value="${v('manufacturePrice')}">
                </div>
            </div>

            <div style="font-weight:600;color:var(--text-primary);margin:16px 0 12px;padding-bottom:8px;border-bottom:2px solid var(--accent-blue);">
                <span class="material-symbols-outlined" style="vertical-align:middle;font-size:18px;">account_tree</span>
                제조 공정 및 사양 (C/T, CVT)
            </div>
            
            <div id="${idPrefix}ProcessContainer">
                <!-- 제조공정 Row 1 (항상 노출) -->
                <div id="${idPrefix}Row1" style="background:var(--bg-secondary); padding:10px; border-radius:8px; margin-bottom:8px; display:flex !important; flex-wrap:nowrap; align-items:center; gap:12px;">
                    <div style="display:flex; align-items:center; gap:8px; flex: 0 0 380px;">
                        <label class="form-label" style="white-space:nowrap; margin-bottom:0; width:85px;">제조공정-1</label>
                        <select class="form-input" id="${idPrefix}Process1" style="margin-top:0;" onchange="SettingsModule.onProductProcessChange('${idPrefix}')">${processOptions(v('process1'))}</select>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; flex: 0 0 200px;">
                        <label class="form-label" style="white-space:nowrap; margin-bottom:0; width:50px;">CVT</label>
                        <input type="text" class="form-input" id="${idPrefix}Cvt1" placeholder="예: 1" value="${v('cvt1')}" style="margin-top:0;">
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; flex: 0 0 220px;">
                        <label class="form-label" style="white-space:nowrap; margin-bottom:0; width:65px;">C.TIME</label>
                        <input type="text" class="form-input" id="${idPrefix}Ct1" placeholder="예: 60" value="${v('ct1')}" style="margin-top:0;">
                    </div>
                    <button type="button" class="btn btn-sm btn-outline" id="${idPrefix}AddBtn2" style="height:38px; padding:0 10px; ${v('process2') || v('process3') ? 'display:none !important;' : ''}" onclick="this.style.setProperty('display', 'none', 'important'); document.getElementById('${idPrefix}Row2').style.setProperty('display', 'flex', 'important');">
                        <span class="material-symbols-outlined" style="font-size:18px;">add</span>
                    </button>
                </div>

                <!-- 제조공정 Row 2 (동적 노출 - 데이터가 있을 때만 flex) -->
                <div id="${idPrefix}Row2" style="background:var(--bg-secondary); padding:10px; border-radius:8px; margin-bottom:8px; display:${v('process2') ? 'flex' : 'none'} !important; flex-wrap:nowrap; align-items:center; gap:12px;">
                    <div style="display:flex; align-items:center; gap:8px; flex: 0 0 380px;">
                        <label class="form-label" style="white-space:nowrap; margin-bottom:0; width:85px;">제조공정-2</label>
                        <select class="form-input" id="${idPrefix}Process2" style="margin-top:0;" onchange="SettingsModule.onProductProcessChange('${idPrefix}')">${processOptions(v('process2'))}</select>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; flex: 0 0 200px;">
                        <label class="form-label" style="white-space:nowrap; margin-bottom:0; width:50px;">CVT</label>
                        <input type="text" class="form-input" id="${idPrefix}Cvt2" placeholder="예: 1" value="${v('cvt2')}" style="margin-top:0;">
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; flex: 0 0 220px;">
                        <label class="form-label" style="white-space:nowrap; margin-bottom:0; width:65px;">C.TIME</label>
                        <input type="text" class="form-input" id="${idPrefix}Ct2" placeholder="예: 60" value="${v('ct2')}" style="margin-top:0;">
                    </div>
                    <button type="button" class="btn btn-sm btn-outline" id="${idPrefix}AddBtn3" style="height:38px; padding:0 10px; ${v('process3') ? 'display:none !important;' : ''}" onclick="this.style.setProperty('display', 'none', 'important'); document.getElementById('${idPrefix}Row3').style.setProperty('display', 'flex', 'important');">
                        <span class="material-symbols-outlined" style="font-size:18px;">add</span>
                    </button>
                </div>

                <!-- 제조공정 Row 3 (동적 노출 - 데이터가 있을 때만 flex) -->
                <div id="${idPrefix}Row3" style="background:var(--bg-secondary); padding:10px; border-radius:8px; margin-bottom:8px; display:${v('process3') ? 'flex' : 'none'} !important; flex-wrap:nowrap; align-items:center; gap:12px;">
                    <div style="display:flex; align-items:center; gap:8px; flex: 0 0 380px;">
                        <label class="form-label" style="white-space:nowrap; margin-bottom:0; width:85px;">제조공정-3</label>
                        <select class="form-input" id="${idPrefix}Process3" style="margin-top:0;" onchange="SettingsModule.onProductProcessChange('${idPrefix}')">${processOptions(v('process3'))}</select>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; flex: 0 0 200px;">
                        <label class="form-label" style="white-space:nowrap; margin-bottom:0; width:50px;">CVT</label>
                        <input type="text" class="form-input" id="${idPrefix}Cvt3" placeholder="예: 1" value="${v('cvt3')}" style="margin-top:0;">
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; flex: 0 0 220px;">
                        <label class="form-label" style="white-space:nowrap; margin-bottom:0; width:65px;">C.TIME</label>
                        <input type="text" class="form-input" id="${idPrefix}Ct3" placeholder="예: 60" value="${v('ct3')}" style="margin-top:0;">
                    </div>
                    <button type="button" class="btn btn-sm btn-outline" id="${idPrefix}AddBtn4" style="height:38px; padding:0 10px; ${v('process4') ? 'display:none !important;' : ''}" onclick="this.style.setProperty('display', 'none', 'important'); document.getElementById('${idPrefix}Row4').style.setProperty('display', 'flex', 'important');">
                        <span class="material-symbols-outlined" style="font-size:18px;">add</span>
                    </button>
                </div>

                <!-- 제조공정 Row 4 (동적 노출 - 데이터가 있을 때만 flex) -->
                <div id="${idPrefix}Row4" style="background:var(--bg-secondary); padding:10px; border-radius:8px; margin-bottom:8px; display:${v('process4') ? 'flex' : 'none'} !important; flex-wrap:nowrap; align-items:center; gap:12px;">
                    <div style="display:flex; align-items:center; gap:8px; flex: 0 0 380px;">
                        <label class="form-label" style="white-space:nowrap; margin-bottom:0; width:85px;">제조공정-4</label>
                        <select class="form-input" id="${idPrefix}Process4" style="margin-top:0;" onchange="SettingsModule.onProductProcessChange('${idPrefix}')">${processOptions(v('process4'))}</select>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; flex: 0 0 200px;">
                        <label class="form-label" style="white-space:nowrap; margin-bottom:0; width:50px;">CVT</label>
                        <input type="text" class="form-input" id="${idPrefix}Cvt4" placeholder="예: 1" value="${v('cvt4')}" style="margin-top:0;">
                    </div>
                    <div style="display:flex; align-items:center; gap:8px; flex: 0 0 220px;">
                        <label class="form-label" style="white-space:nowrap; margin-bottom:0; width:65px;">C.TIME</label>
                        <input type="text" class="form-input" id="${idPrefix}Ct4" placeholder="예: 60" value="${v('ct4')}" style="margin-top:0;">
                    </div>
                    <div style="width:38px;"></div>
                </div>
            </div>

            <input type="hidden" id="${idPrefix}Code" value="${v('code')}">

            <!-- 도료 정보 섹션 -->
            <div style="font-weight:600;color:var(--text-primary);margin:20px 0 12px;padding-bottom:8px;border-bottom:2px solid var(--accent-blue);">
                <span class="material-symbols-outlined" style="vertical-align:middle;font-size:18px;">water_drop</span>
                도료 정보
                <span style="font-size:0.75rem;font-weight:400;color:var(--text-muted);margin-left:8px;">도료 유형 먼저 선택 후 도료를 선택하세요 (복수 추가 가능)</span>
            </div>
            <div id="${idPrefix}PaintList">
                ${initialPaintTableHtml}
            </div>
            <button type="button" onclick="SettingsModule.addProductPaintRow('${idPrefix}')"
                style="display:inline-flex;align-items:center;gap:4px;padding:5px 14px;border:1px dashed var(--accent-blue);border-radius:6px;background:transparent;color:var(--accent-blue);cursor:pointer;font-size:0.82rem;margin-bottom:12px;">
                <span class="material-symbols-outlined" style="font-size:15px;">add</span> 도료 추가
            </button>


            ${isEdit ? `
            <!-- ─── 수정 모드: 사출 자재 정보 표시 + 수정/등록 ──────── -->
            <div style="font-weight:600;color:var(--text-primary);margin:20px 0 10px;padding-bottom:8px;border-bottom:2px solid var(--accent-blue);display:flex;align-items:center;justify-content:space-between;">
                <div>
                    <span class="material-symbols-outlined" style="vertical-align:middle;font-size:18px;">precision_manufacturing</span>
                    사출 자재 정보
                    ${linkedInjMats.length === 0 ? `<span style="margin-left:8px;font-size:0.72rem;background:rgba(217,119,6,0.15);color:#b45309;border:1px solid rgba(217,119,6,0.4);border-radius:4px;padding:1px 7px;">⚠ 미연결</span>` : ''}
                </div>
                <button type="button" id="${idPrefix}InjEditBtn"
                    onclick="document.getElementById('${idPrefix}InjViewMode').style.display='none';
                             document.getElementById('${idPrefix}InjEditMode').style.display='block';
                             this.style.display='none';"
                    style="display:${linkedInjMats.length > 0 ? 'flex' : 'none'};align-items:center;gap:5px;padding:5px 14px;border:1px solid var(--accent-blue);border-radius:6px;background:transparent;color:var(--accent-blue);cursor:pointer;font-size:0.82rem;font-weight:600;">
                    <span class="material-symbols-outlined" style="font-size:16px;">edit</span> 수정
                </button>
            </div>

            <!-- 읽기 모드 (기본, 연결된 자재 있을 때만) -->
            <div id="${idPrefix}InjViewMode" style="margin-bottom:12px;display:${linkedInjMats.length > 0 ? 'block' : 'none'};">
                <div style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;">
                <table style="width:100%;border-collapse:collapse;font-size:0.82rem;">
                    <thead><tr style="background:var(--bg-secondary);">
                        <th style="padding:7px 12px;text-align:left;font-weight:600;color:var(--text-secondary);border-bottom:1px solid var(--border-color);">사출 부품명</th>
                        <th style="padding:7px 12px;text-align:left;font-weight:600;color:var(--text-secondary);border-bottom:1px solid var(--border-color);">사출 컬러</th>
                        <th style="padding:7px 12px;text-align:left;font-weight:600;color:var(--text-secondary);border-bottom:1px solid var(--border-color);">생산처</th>
                        <th style="padding:7px 12px;text-align:right;font-weight:600;color:var(--text-secondary);border-bottom:1px solid var(--border-color);">단가</th>
                        <th style="padding:7px 12px;text-align:right;font-weight:600;color:var(--text-secondary);border-bottom:1px solid var(--border-color);">캐비티</th>
                        <th style="padding:7px 12px;text-align:right;font-weight:600;color:var(--text-secondary);border-bottom:1px solid var(--border-color);">중량(g)</th>
                    </tr></thead>
                    <tbody>
                        ${linkedInjMats.map(m => `
                        <tr style="border-top:1px solid var(--border-color);">
                            <td style="padding:7px 12px;font-weight:600;">${m.injPartName || '-'}</td>
                            <td style="padding:7px 12px;">${m.injColor || '-'}</td>
                            <td style="padding:7px 12px;">${m.supplier || '-'}</td>
                            <td style="padding:7px 12px;text-align:right;">${m.unitPrice ? Number(m.unitPrice).toLocaleString()+'원' : '-'}</td>
                            <td style="padding:7px 12px;text-align:right;">${m.cavityCount || '-'}</td>
                            <td style="padding:7px 12px;text-align:right;">${m.weight || '-'}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
                </div>
            </div>

            <!-- 편집 모드: 자재 있으면 수정 버튼 클릭 후 표시, 없으면 바로 표시 -->
            <div id="${idPrefix}InjEditMode" style="display:${linkedInjMats.length === 0 ? 'block' : 'none'};margin-bottom:12px;">
                <input type="hidden" id="${idPrefix}InjEditCount" value="${linkedInjMats.length > 0 ? linkedInjMats.length : 1}">
                ${linkedInjMats.length > 0 ? linkedInjMats.map((m, i) => `
                <input type="hidden" id="${idPrefix}EditInjId_${i}" value="${m.id}">
                <div style="background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:8px;padding:12px;${i > 0 ? 'margin-top:8px;' : ''}">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                        <div style="font-size:0.75rem;color:var(--text-muted);font-weight:600;">${linkedInjMats.length > 1 ? `자재 ${i+1}` : '사출자재'}</div>
                        <button type="button"
                            onclick="SettingsModule._unlinkInjMat('${m.id}', '${p.id}')"
                            style="display:flex;align-items:center;gap:3px;padding:3px 10px;border:1px solid var(--accent-red);border-radius:5px;background:transparent;color:var(--accent-red);cursor:pointer;font-size:0.75rem;">
                            <span class="material-symbols-outlined" style="font-size:14px;">link_off</span> 연결 해제
                        </button>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">사출 부품명(금형명)</label>
                            <input type="text" class="form-input" id="${idPrefix}EditInjPartName_${i}" value="${(m.injPartName||'').replace(/"/g,'&quot;')}">
                        </div>
                        <div class="form-group">
                            <label class="form-label">사출 컬러</label>
                            <input type="text" class="form-input" id="${idPrefix}EditInjColor_${i}" value="${(m.injColor||'').replace(/"/g,'&quot;')}">
                        </div>
                        <div class="form-group">
                            <label class="form-label">생산처</label>
                            <input type="text" class="form-input" id="${idPrefix}EditInjSupplier_${i}" value="${(m.supplier||'').replace(/"/g,'&quot;')}">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">단가 (원)</label>
                            <input type="number" class="form-input" id="${idPrefix}EditInjPrice_${i}" value="${m.unitPrice||''}" min="0">
                        </div>
                        <div class="form-group">
                            <label class="form-label">캐비티 수</label>
                            <input type="number" class="form-input" id="${idPrefix}EditInjCavity_${i}" value="${m.cavityCount||''}" min="1">
                        </div>
                        <div class="form-group">
                            <label class="form-label">중량 (g)</label>
                            <input type="number" class="form-input" id="${idPrefix}EditInjWeight_${i}" value="${m.weight||''}" min="0">
                        </div>
                    </div>
                </div>`).join('') : `
                <!-- 사출자재 없음 → 기존 선택 or 신규 등록 -->
                <input type="hidden" id="${idPrefix}EditInjId_0" value="">
                <input type="hidden" id="${idPrefix}EditInjLinkId_0" value="">
                <div style="background:rgba(217,119,6,0.05);border:1px dashed rgba(217,119,6,0.5);border-radius:8px;padding:12px;">
                    <div style="font-size:0.78rem;color:#b45309;margin-bottom:10px;font-weight:600;">
                        ⚠ 연결된 사출자재가 없습니다 — 기존 자재를 선택하거나 아래에 직접 입력하세요
                    </div>
                    ${_injMatPickerHTML(idPrefix)}
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">사출 부품명(금형명)</label>
                            <input type="text" class="form-input" id="${idPrefix}EditInjPartName_0" placeholder="예: KNOB LED">
                        </div>
                        <div class="form-group">
                            <label class="form-label">사출 컬러</label>
                            <input type="text" class="form-input" id="${idPrefix}EditInjColor_0" placeholder="예: GRAY">
                        </div>
                        <div class="form-group">
                            <label class="form-label">생산처</label>
                            <input type="text" class="form-input" id="${idPrefix}EditInjSupplier_0" placeholder="예: (주)협력사">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label class="form-label">단가 (원)</label>
                            <input type="number" class="form-input" id="${idPrefix}EditInjPrice_0" placeholder="0" min="0">
                        </div>
                        <div class="form-group">
                            <label class="form-label">캐비티 수</label>
                            <input type="number" class="form-input" id="${idPrefix}EditInjCavity_0" placeholder="1" min="1">
                        </div>
                        <div class="form-group">
                            <label class="form-label">중량 (g)</label>
                            <input type="number" class="form-input" id="${idPrefix}EditInjWeight_0" placeholder="0" min="0">
                        </div>
                    </div>
                    <div style="font-size:0.73rem;color:var(--text-muted);margin-top:4px;">
                        ※ 부품명만 입력해도 사출자재가 자동 등록됩니다. 비워두면 등록되지 않습니다.
                    </div>
                </div>`}
                ${linkedInjMats.length > 0 ? `<div style="font-size:0.73rem;color:var(--text-muted);margin-top:6px;">
                    ※ 제작품목명은 자동으로 현재 "품명"으로 유지됩니다. 원재료 등은 <strong>사출자재</strong> 탭에서 수정하세요.
                </div>` : ''}
            </div>

            ` : `
            <!-- ─── 신규 모드: 사출 자재 동시 등록 ──────────────── -->
            <div style="font-weight:600;color:var(--text-primary);margin:20px 0 10px;padding-bottom:8px;border-bottom:2px solid #34d399;display:flex;align-items:center;justify-content:space-between;">
                <div>
                    <span class="material-symbols-outlined" style="vertical-align:middle;font-size:18px;color:#34d399;">add_link</span>
                    사출 자재 연동 등록
                    <span style="font-size:0.72rem;font-weight:400;color:var(--text-muted);margin-left:8px;">저장 시 사출 자재를 함께 등록합니다</span>
                </div>
                <label style="display:flex;align-items:center;gap:6px;font-size:0.85rem;font-weight:500;cursor:pointer;color:var(--text-secondary);">
                    <input type="checkbox" id="${idPrefix}AutoInjEnabled" checked
                        onchange="document.getElementById('${idPrefix}AutoInjSection').style.display=this.checked?'block':'none'">
                    자동 등록
                </label>
            </div>
            <div id="${idPrefix}AutoInjSection" style="display:block;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:8px;padding:14px;margin-bottom:16px;">
                <div style="font-size:0.78rem;color:var(--text-secondary);background:rgba(52,211,153,0.1);border-radius:6px;padding:8px 12px;margin-bottom:12px;line-height:1.5;">
                    <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;color:#34d399;">info</span>
                    <strong>제작품목명</strong>은 위 <strong>"품명"</strong>으로 자동 설정됩니다 — 이름 일치가 보장되어 창고 예약 집계가 정확해집니다.
                </div>
                <input type="hidden" id="${idPrefix}AutoInjLinkId" value="">
                ${_injMatPickerHTML(idPrefix)}
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">사출 부품명(금형명) <span style="color:var(--accent-red)">*</span></label>
                        <input type="text" class="form-input" id="${idPrefix}AutoInjPartName" placeholder="예: FRONT BUMPER">
                    </div>
                    <div class="form-group">
                        <label class="form-label">사출 컬러</label>
                        <input type="text" class="form-input" id="${idPrefix}AutoInjColor" placeholder="예: Black, White">
                    </div>
                    <div class="form-group">
                        <label class="form-label">생산처</label>
                        <input type="text" class="form-input" id="${idPrefix}AutoInjSupplier" placeholder="예: (주)우성">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label class="form-label">단가 (원)</label>
                        <input type="number" class="form-input" id="${idPrefix}AutoInjPrice" placeholder="0" min="0">
                    </div>
                    <div class="form-group">
                        <label class="form-label">캐비티 수</label>
                        <input type="number" class="form-input" id="${idPrefix}AutoInjCavity" placeholder="예: 4" min="1">
                    </div>
                    <div class="form-group">
                        <label class="form-label">중량 (g)</label>
                        <input type="number" class="form-input" id="${idPrefix}AutoInjWeight" placeholder="예: 1250" min="0">
                    </div>
                </div>
                <div style="font-size:0.73rem;color:var(--text-muted);margin-top:4px;">
                    ※ 원재료·캐비티 등 추가 정보는 저장 후 <strong>사출자재</strong> 탭에서 수정할 수 있습니다.
                </div>
            </div>
            `}
        `;
    }

    // prefill: { carModel, partName, color } — 선택적으로 초기값 주입
    function openAddProductModal(prefill) {
        const init = prefill || {};
        UIUtils.showModal({ title: '제품 추가', body: _productFormHTML({}, 'addProd'), footer: `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SettingsModule.saveProduct()">추가</button>
        `, size: 'xxxl', noBackdropClose: true });

        setTimeout(() => {
            // ── 기본 정보: injPartName/injColor 경유 시 공란 유지 ──
            const fromInjMat = !!(init.injPartName || init.injColor);
            if (!fromInjMat) {
                // 일반 prefill (검증 패널 외 경로) — 기존 동작 유지
                if (init.carModel) { const el = document.getElementById('addProdCarModel'); if (el) el.value = init.carModel; }
                if (init.partName) { const el = document.getElementById('addProdPartName'); if (el) el.value = init.partName; }
                if (init.color)    { const el = document.getElementById('addProdColor');    if (el) el.value = init.color; }
            }

            const upd = () => {
                const cm = document.getElementById('addProdCarModel').value.trim();
                const pn = document.getElementById('addProdPartName').value.trim();
                const cl = document.getElementById('addProdColor').value.trim();
                document.getElementById('addProdCode').value = (cm && pn && cl) ? generateProductCode(cm, pn, cl) : '';
            };
            ['addProdCarModel', 'addProdPartName', 'addProdColor'].forEach(id => {
                document.getElementById(id).addEventListener('input', upd);
            });
            if (!fromInjMat && (init.carModel || init.partName || init.color)) upd();
            if (!fromInjMat && init.partName) SettingsModule.checkPartNameDuplicate('addProd');

            // ── 사출자재 연동 등록 섹션만 자동 활성화·입력 ────────
            if (fromInjMat) {
                const chk = document.getElementById('addProdAutoInjEnabled');
                const sec = document.getElementById('addProdAutoInjSection');
                if (chk) { chk.checked = true; }
                if (sec) { sec.style.display = 'block'; }

                const pnEl = document.getElementById('addProdAutoInjPartName');
                const clEl = document.getElementById('addProdAutoInjColor');
                if (pnEl && init.injPartName) pnEl.value = init.injPartName;
                if (clEl && init.injColor)    clEl.value = init.injColor;
            }
        }, 100);
    }

    // ─── 도료 다중 선택 헬퍼 ───────────────────────────────────────

    // 도료 행 1개 HTML 생성
    // 도료 행 1개 → <tr> 반환
    function _paintRowHtml(idPrefix, rowIdx, rowData, allPaints) {
        const paintSpec  = rowData.paintSpec  || '';
        const processTag = rowData.processTag || '공용';
        const mainId     = rowData.mainId     || '';
        const hardId     = rowData.hardId     || '';
        const thinnerId  = rowData.thinnerId  || '';

        // 선택된 주제 도료의 공급처 파악 (경화제/신너 필터링용)
        const mainPm = mainId ? allPaints.find(p => p.id === mainId) : null;
        const supplierFilter = mainPm ? (mainPm.supplier || '') : '';

        // 주제 목록: 도료 사양(Primer/Color/Clear/공용)으로 필터링
        const mainPaints = allPaints.filter(p =>
            p.paintType === '주제' && (!paintSpec || p.paintSpec === paintSpec || p.paintSpec === '공용'));

        // 경화제: 동일 공급처 우선 → 없으면 전체 목록 폴백
        const allHard    = allPaints.filter(p => p.paintType === '경화제');
        const hardBySup  = supplierFilter ? allHard.filter(p => p.supplier === supplierFilter) : [];
        const hardPaints = hardBySup.length ? hardBySup : allHard;

        // 신너(희석제): 동일 공급처 우선 → 없으면 전체 목록 폴백
        const allThinner     = allPaints.filter(p => p.paintType === '희석제');
        const thinnerBySup   = supplierFilter ? allThinner.filter(p => p.supplier === supplierFilter) : [];
        const thinnerPaints  = thinnerBySup.length ? thinnerBySup : allThinner;

        const mkOpts = (list, selectedId) => list.map(pm =>
            `<option value="${pm.id}" ${pm.id === selectedId ? 'selected' : ''}>${pm.name || ''}${pm.supplier ? ' · ' + pm.supplier : ''}</option>`
        ).join('');

        const tdStyle  = 'padding:5px 6px;vertical-align:middle;';
        const selStyle = 'width:100%;font-size:0.82rem;padding:5px 8px;box-sizing:border-box;border:1.5px solid var(--border-color);border-radius:var(--border-radius);background:var(--bg-secondary);color:var(--text-primary);font-family:inherit;';
        const noSel    = '-- 선택 --';

        return `
        <tr data-paint-row="${rowIdx}" style="border-bottom:1px solid var(--border-color);">
            <td style="${tdStyle}width:80px;">
                <select id="${idPrefix}ProcessTag_${rowIdx}" style="${selStyle}" title="공정 라인">
                    <option value="공용"   ${processTag === '공용'   ? 'selected' : ''}>공용</option>
                    <option value="도장-A" ${processTag === '도장-A' ? 'selected' : ''}>도장-A</option>
                    <option value="도장-B" ${processTag === '도장-B' ? 'selected' : ''}>도장-B</option>
                </select>
            </td>
            <td style="${tdStyle}width:110px;">
                <select id="${idPrefix}PaintSpec_${rowIdx}"
                    style="${selStyle}"
                    onchange="SettingsModule.onProductPaintSpecChange('${idPrefix}', ${rowIdx})">
                    <option value="">-- 선택 --</option>
                    <option value="Primer" ${paintSpec === 'Primer' ? 'selected' : ''}>Primer</option>
                    <option value="Color"  ${paintSpec === 'Color'  ? 'selected' : ''}>Color</option>
                    <option value="Clear"  ${paintSpec === 'Clear'  ? 'selected' : ''}>Clear</option>
                    <option value="공용"   ${paintSpec === '공용'   ? 'selected' : ''}>공용</option>
                </select>
            </td>
            <td style="${tdStyle}">
                <select id="${idPrefix}PaintMain_${rowIdx}" style="${selStyle}"
                    onchange="SettingsModule.onProductPaintMainSelect('${idPrefix}', ${rowIdx})">
                    <option value="">-- 선택 --</option>
                    ${mkOpts(mainPaints, mainId)}
                </select>
            </td>
            <td style="${tdStyle}">
                <select id="${idPrefix}PaintHard_${rowIdx}" style="${selStyle}">
                    <option value="">${noSel}</option>
                    ${mkOpts(hardPaints, hardId)}
                </select>
            </td>
            <td style="${tdStyle}">
                <select id="${idPrefix}PaintThinner_${rowIdx}" style="${selStyle}">
                    <option value="">${noSel}</option>
                    ${mkOpts(thinnerPaints, thinnerId)}
                </select>
            </td>
            <td style="${tdStyle}width:36px;text-align:center;">
                <button type="button" onclick="SettingsModule.removeProductPaintRow('${idPrefix}', ${rowIdx})"
                    title="삭제"
                    style="padding:2px 6px;border:1px solid var(--border-color);border-radius:4px;background:transparent;color:var(--text-muted);cursor:pointer;line-height:1;"
                    onmouseenter="this.style.color='var(--accent-red)';this.style.borderColor='var(--accent-red)';"
                    onmouseleave="this.style.color='var(--text-muted)';this.style.borderColor='var(--border-color)';">
                    <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">remove</span>
                </button>
            </td>
        </tr>`;
    }

    // DOM에서 현재 도료 행 데이터 수집
    function _getCurrentPaintRows(idPrefix) {
        const container = document.getElementById(`${idPrefix}PaintList`);
        if (!container) return [];
        return Array.from(container.querySelectorAll('[data-paint-row]')).map(row => {
            const ri = row.dataset.paintRow;
            const g = id => (document.getElementById(id) || {}).value || '';
            return {
                processTag: g(`${idPrefix}ProcessTag_${ri}`) || '공용',
                paintSpec:  g(`${idPrefix}PaintSpec_${ri}`),
                mainId:     g(`${idPrefix}PaintMain_${ri}`),
                hardId:     g(`${idPrefix}PaintHard_${ri}`),
                thinnerId:  g(`${idPrefix}PaintThinner_${ri}`)
            };
        });
    }

    // 헤더 포함 테이블 HTML 문자열 생성 (초기 렌더 + 재렌더 공용)
    function _paintTableHtml(idPrefix, paintRows, allPaints) {
        if (!paintRows || paintRows.length === 0) paintRows = [{}];
        const thStyle = 'padding:6px 8px;font-size:0.78rem;font-weight:600;color:var(--text-secondary);background:var(--bg-primary);border-bottom:2px solid var(--border-color);white-space:nowrap;text-align:left;';
        return `
        <table style="width:100%;border-collapse:collapse;border:1px solid var(--border-color);border-radius:8px;overflow:hidden;margin-bottom:4px;">
            <thead>
                <tr>
                    <th style="${thStyle}width:80px;">공정</th>
                    <th style="${thStyle}width:110px;">도료 사양</th>
                    <th style="${thStyle}">주제</th>
                    <th style="${thStyle}">경화제</th>
                    <th style="${thStyle}">신너</th>
                    <th style="${thStyle}width:36px;"></th>
                </tr>
            </thead>
            <tbody>
                ${paintRows.map((row, i) => _paintRowHtml(idPrefix, i, row, allPaints)).join('')}
            </tbody>
        </table>`;
    }

    // 도료 목록 전체 재렌더링
    function _renderPaintList(idPrefix, paintRows) {
        const container = document.getElementById(`${idPrefix}PaintList`);
        if (!container) return;
        const ap = Storage.getAll(PAINT_STORE) || [];
        container.innerHTML = _paintTableHtml(idPrefix, paintRows, ap);
    }

    // 도료 행 추가
    function addProductPaintRow(idPrefix) {
        _renderPaintList(idPrefix, [..._getCurrentPaintRows(idPrefix), {}]);
    }

    // 도료 행 제거
    function removeProductPaintRow(idPrefix, rowIdx) {
        const rows = _getCurrentPaintRows(idPrefix);
        rows.splice(rowIdx, 1);
        _renderPaintList(idPrefix, rows);
    }

    // 도료 사양 변경 (Primer/Color/Clear) → 재렌더링
    function onProductPaintSpecChange(idPrefix, rowIdx) {
        _renderPaintList(idPrefix, _getCurrentPaintRows(idPrefix));
    }

    // 주제 선택 변경 → 경화제/신너를 동일 도료사로 필터링 재렌더링
    function onProductPaintMainSelect(idPrefix, rowIdx) {
        const rows = _getCurrentPaintRows(idPrefix);
        if (rows[rowIdx]) {
            // 주제가 바뀌면 경화제/신너 선택 초기화 (도료사가 달라지므로)
            rows[rowIdx].hardId    = '';
            rows[rowIdx].thinnerId = '';
        }
        _renderPaintList(idPrefix, rows);
    }

    // ──────────────────────────────────────────────────────────────

    // 사출 자재 정보 테이블 렌더링 (자동매칭 + 필터 결합)
    function updateProductInjInfo(idPrefix) {
        const partNameEl  = document.getElementById(`${idPrefix}PartName`);
        const infoBox     = document.getElementById(`${idPrefix}InjInfo`);
        if (!infoBox) return;

        const partName    = partNameEl ? partNameEl.value.trim() : '';
        const filtCar     = (document.getElementById(`${idPrefix}InjFiltCar`)   || {}).value || '';
        const filtPart    = (document.getElementById(`${idPrefix}InjFiltPart`)  || {}).value || '';
        const filtColor   = (document.getElementById(`${idPrefix}InjFiltColor`) || {}).value || '';

        const mats = Storage.getAll(INJECT_MAT_STORE) || [];

        // 자동 매칭 집합 (제작품목1/2 ↔ 품명)
        const autoMatchIds = new Set(
            mats.filter(m => partName && (m.mfgProductName === partName || m.mfgProductName2 === partName))
                .map(m => m.id)
        );

        // 필터 적용
        const hasFilter = filtCar || filtPart || filtColor;
        const filtered = mats.filter(m => {
            const inAutoMatch = autoMatchIds.has(m.id);
            const inFilter = (!filtCar   || m.carModel   === filtCar)   &&
                             (!filtPart  || m.injPartName === filtPart)  &&
                             (!filtColor || (m.injColor || '').includes(filtColor));
            return inAutoMatch || (hasFilter && inFilter);
        });

        if (filtered.length === 0) {
            const msg = hasFilter
                ? '필터 조건에 맞는 사출 자재가 없습니다.'
                : (partName ? '매칭된 사출 자재가 없습니다.' : '품명을 입력하면 매칭된 사출 자재가 표시됩니다.');
            infoBox.innerHTML = `<div style="padding:10px 14px;color:var(--text-muted);">${msg}</div>`;
            return;
        }

        // 제품 컬러 (폼에서 읽기)
        const prodColorEl  = document.getElementById(`${idPrefix}Color`);
        const prodColor    = (prodColorEl ? prodColorEl.value.trim() : '').toLowerCase();

        const th = (label, align='left') =>
            `<th style="padding:6px 10px;text-align:${align};font-weight:600;font-size:0.78rem;background:var(--bg-secondary);border-bottom:1px solid var(--border-color);">${label}</th>`;

        infoBox.innerHTML = `
            <div style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;">
            <table style="width:100%;border-collapse:collapse;">
                <thead><tr>
                    ${th('생산처')}${th('사출품명')}${th('자재 컬러')}${th('단가','right')}${th('매칭','center')}${th('컬러 일치','center')}
                </tr></thead>
                <tbody>
                    ${filtered.map(m => {
                        const isAuto   = autoMatchIds.has(m.id);
                        const mColor   = (m.injColor || '').trim().toLowerCase();
                        // 컬러 일치: 제품 컬러 ↔ 자재 컬러 (포함 비교)
                        const colorMatch = prodColor && mColor &&
                            (mColor.includes(prodColor) || prodColor.includes(mColor));

                        const matchLabel = isAuto
                            ? (m.mfgProductName === partName && m.mfgProductName2 === partName ? '품목1+2' : m.mfgProductName === partName ? '품목1' : '품목2')
                            : '수동';
                        const badgeColor = isAuto ? 'var(--accent-blue)' : 'var(--accent-green)';
                        const rowBg = colorMatch
                            ? 'background:rgba(52,211,153,0.07);'
                            : (isAuto ? '' : 'background:rgba(52,211,153,0.03);');
                        const colorCellStyle = colorMatch
                            ? 'padding:6px 10px;font-weight:700;color:var(--accent-green);'
                            : 'padding:6px 10px;color:var(--text-muted);';
                        const colorMatchBadge = colorMatch
                            ? `<span style="padding:2px 7px;border-radius:10px;font-size:0.7rem;font-weight:700;background:rgba(52,211,153,0.2);color:var(--accent-green);">✓ 일치</span>`
                            : `<span style="font-size:0.7rem;color:var(--text-muted);">—</span>`;

                        return `
                        <tr style="border-top:1px solid var(--border-color);${rowBg}">
                            <td style="padding:6px 10px;">${m.supplier || '-'}</td>
                            <td style="padding:6px 10px;"><strong>${m.injPartName || '-'}</strong></td>
                            <td style="${colorCellStyle}">${m.injColor || '-'}</td>
                            <td style="padding:6px 10px;text-align:right;">${m.unitPrice ? Number(m.unitPrice).toLocaleString()+'원' : '-'}</td>
                            <td style="padding:6px 10px;text-align:center;">
                                <span style="padding:2px 8px;border-radius:12px;font-size:0.72rem;font-weight:700;background:${badgeColor}20;color:${badgeColor};">${matchLabel}</span>
                            </td>
                            <td style="padding:6px 10px;text-align:center;">${colorMatchBadge}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table></div>
            <div style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;padding-left:2px;">
                총 ${filtered.length}건 (자동매칭 ${autoMatchIds.size}건)
                ${prodColor ? ` · 제품 컬러 <strong>${prodColor.toUpperCase()}</strong> 기준 컬러 일치 표시` : ''}
            </div>`;
    }

    // 차종 필터 변경 → 사출품명 옵션 갱신 + 결과 갱신
    function onProdInjFiltCarChange(idPrefix) {
        const carVal   = (document.getElementById(`${idPrefix}InjFiltCar`)  || {}).value || '';
        const partSel  = document.getElementById(`${idPrefix}InjFiltPart`);
        const colorSel = document.getElementById(`${idPrefix}InjFiltColor`);
        if (!partSel) return;

        const mats = Storage.getAll(INJECT_MAT_STORE) || [];
        const filtMats = carVal ? mats.filter(m => m.carModel === carVal) : mats;

        const parts = [...new Set(filtMats.map(m => m.injPartName).filter(Boolean))].sort();
        partSel.innerHTML = '<option value="">전체</option>' +
            parts.map(p => `<option value="${p}">${p}</option>`).join('');
        if (colorSel) colorSel.innerHTML = '<option value="">전체</option>';

        _updateInjFiltSupplierPrice(idPrefix, filtMats, '', '');
        updateProductInjInfo(idPrefix);
    }

    // 사출품명 필터 변경 → 컬러 옵션 갱신 + 공급처/단가 자동표시 + 결과 갱신
    function onProdInjFiltPartChange(idPrefix) {
        const carVal   = (document.getElementById(`${idPrefix}InjFiltCar`)  || {}).value || '';
        const partVal  = (document.getElementById(`${idPrefix}InjFiltPart`) || {}).value || '';
        const colorSel = document.getElementById(`${idPrefix}InjFiltColor`);
        if (!colorSel) return;

        const mats = Storage.getAll(INJECT_MAT_STORE) || [];
        const filtMats = mats.filter(m =>
            (!carVal  || m.carModel    === carVal) &&
            (!partVal || m.injPartName === partVal)
        );

        // 컬러 옵션: injColor를 ','로 파싱
        const colorSet = new Set();
        filtMats.forEach(m => {
            if (m.injColor) m.injColor.split(/[,，\/]/).map(c => c.trim()).filter(Boolean).forEach(c => colorSet.add(c));
        });
        colorSel.innerHTML = '<option value="">전체</option>' +
            [...colorSet].sort().map(c => `<option value="${c}">${c}</option>`).join('');

        _updateInjFiltSupplierPrice(idPrefix, filtMats, partVal, '');
        updateProductInjInfo(idPrefix);
    }

    // 컬러 필터 변경 → 공급처/단가 자동표시 + 결과 갱신
    function onProdInjFiltChange(idPrefix) {
        const carVal   = (document.getElementById(`${idPrefix}InjFiltCar`)   || {}).value || '';
        const partVal  = (document.getElementById(`${idPrefix}InjFiltPart`)  || {}).value || '';
        const colorVal = (document.getElementById(`${idPrefix}InjFiltColor`) || {}).value || '';

        const mats = Storage.getAll(INJECT_MAT_STORE) || [];
        const filtMats = mats.filter(m =>
            (!carVal   || m.carModel    === carVal) &&
            (!partVal  || m.injPartName === partVal) &&
            (!colorVal || (m.injColor||'').includes(colorVal))
        );
        _updateInjFiltSupplierPrice(idPrefix, filtMats, partVal, colorVal);
        updateProductInjInfo(idPrefix);
    }

    // 공급처/단가 자동표시 헬퍼
    function _updateInjFiltSupplierPrice(idPrefix, filtMats, partVal, colorVal) {
        const supplierEl = document.getElementById(`${idPrefix}InjFiltSupplier`);
        const priceEl    = document.getElementById(`${idPrefix}InjFiltPrice`);
        if (!supplierEl || !priceEl) return;

        const exact = filtMats.find(m => partVal && m.injPartName === partVal);
        if (exact) {
            supplierEl.textContent = exact.supplier || '—';
            priceEl.textContent    = exact.unitPrice ? Number(exact.unitPrice).toLocaleString() + '원' : '—';
            supplierEl.style.color = 'var(--text-primary)';
            priceEl.style.color    = 'var(--text-primary)';
        } else {
            const suppliers = [...new Set(filtMats.map(m => m.supplier).filter(Boolean))];
            supplierEl.textContent = suppliers.length === 1 ? suppliers[0] : (suppliers.length > 1 ? '복수' : '—');
            priceEl.textContent    = '—';
            supplierEl.style.color = suppliers.length === 1 ? 'var(--text-primary)' : 'var(--text-muted)';
            priceEl.style.color    = 'var(--text-muted)';
        }
    }

    // 필터 초기화
    function resetProdInjFilter(idPrefix) {
        const ids = [`${idPrefix}InjFiltCar`, `${idPrefix}InjFiltPart`, `${idPrefix}InjFiltColor`];
        ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        const supEl = document.getElementById(`${idPrefix}InjFiltSupplier`);
        const prcEl = document.getElementById(`${idPrefix}InjFiltPrice`);
        if (supEl) { supEl.textContent = '—'; supEl.style.color = 'var(--text-muted)'; }
        if (prcEl) { prcEl.textContent = '—'; prcEl.style.color = 'var(--text-muted)'; }
        // 사출품명/컬러 옵션도 전체로 리셋
        const mats = Storage.getAll(INJECT_MAT_STORE) || [];
        const partSel = document.getElementById(`${idPrefix}InjFiltPart`);
        if (partSel) {
            const parts = [...new Set(mats.map(m => m.injPartName).filter(Boolean))].sort();
            partSel.innerHTML = '<option value="">전체</option>' + parts.map(p => `<option value="${p}">${p}</option>`).join('');
        }
        const colorSel = document.getElementById(`${idPrefix}InjFiltColor`);
        if (colorSel) colorSel.innerHTML = '<option value="">전체</option>';
        updateProductInjInfo(idPrefix);
    }

    /* 제조공정 셀렉트 변경 시 도장-A/B 컬러 행 표시/숨김 */
    function onProductProcessChange(prefix) {
        const g = id => (document.getElementById(id) || {}).value || '';
        const procs = [1,2,3,4].map(i => g(`${prefix}Process${i}`));
        const hasA = procs.includes('도장-A');
        const hasB = procs.includes('도장-B');
        const row = document.getElementById(`${prefix}PaintColorRow`);
        if (row) row.style.display = (hasA && hasB) ? '' : 'none';
    }

    function _collectProductForm(prefix) {
        const g = id => (document.getElementById(id) || {}).value || '';
        return {
            carModel: g(`${prefix}CarModel`).trim(),
            partName: g(`${prefix}PartName`).trim(),
            color: g(`${prefix}Color`).trim(),
            paintColorA: g(`${prefix}PaintColorA`).trim(),
            paintColorB: g(`${prefix}PaintColorB`).trim(),
            itemType: g(`${prefix}ItemType`).trim(),
            packUnit: g(`${prefix}PackUnit`).trim(),
            customer: g(`${prefix}Customer`).trim(),
            salePrice: g(`${prefix}SalePrice`).trim(),
            injectionPrice: g(`${prefix}InjectionPrice`).trim(),
            manufacturePrice: g(`${prefix}ManufacturePrice`).trim(),
            process1: g(`${prefix}Process1`).trim(),
            ct1: g(`${prefix}Ct1`).trim(),
            cvt1: g(`${prefix}Cvt1`).trim(),
            process2: g(`${prefix}Process2`).trim(),
            ct2: g(`${prefix}Ct2`).trim(),
            cvt2: g(`${prefix}Cvt2`).trim(),
            process3: g(`${prefix}Process3`).trim(),
            ct3: g(`${prefix}Ct3`).trim(),
            cvt3: g(`${prefix}Cvt3`).trim(),
            process4: g(`${prefix}Process4`).trim(),
            ct4: g(`${prefix}Ct4`).trim(),
            cvt4: g(`${prefix}Cvt4`).trim(),
            code: g(`${prefix}Code`).trim(),
            paintMaterials: _getCurrentPaintRows(prefix).filter(r => r.paintSpec || r.mainId || r.hardId || r.thinnerId)
        };
    }

    async function saveProduct() {
        const data = _collectProductForm('addProd');
        if (!data.partName) {
            UIUtils.toast('품명은 필수입니다.', 'warning');
            return;
        }

        // ── 중복 검사 ──────────────────────────────────────────────────
        const _existing = Storage.getAll(PRODUCTS_STORE) || [];
        const _exactDup = _existing.find(p =>
            (p.carModel || '') === (data.carModel || '') &&
            (p.partName  || '').trim() === (data.partName || '').trim() &&
            (p.color     || '').trim() === (data.color    || '').trim()
        );
        if (_exactDup) {
            UIUtils.toast(`이미 동일한 제품이 존재합니다: [${data.carModel}] ${data.partName} ${data.color}`, 'error');
            const hintEl = document.getElementById('addProdPartNameHint');
            if (hintEl) {
                hintEl.innerHTML = `<span style="color:var(--accent-red);font-weight:600;">⛔ 동일 차종·품명·컬러 제품이 이미 등록되어 있습니다. 저장 불가.</span>`;
            }
            return;
        }
        // ──────────────────────────────────────────────────────────────

        if (!data.code) data.code = generateProductCode(data.carModel, data.partName, data.color);
        data.displayName = `${data.carModel} ${data.partName} ${data.color}`.trim();
        const savedProduct = await Storage.add(PRODUCTS_STORE, data);

        // ── 사출 자재 연결/등록 (체크박스 활성화 시) ──────────────────
        const autoInjEnabled = document.getElementById('addProdAutoInjEnabled');
        if (autoInjEnabled && autoInjEnabled.checked) {
            const g = id => (document.getElementById(id) || {}).value || '';
            const linkId = g('addProdAutoInjLinkId').trim();
            if (linkId) {
                // 기존 사출자재에 연결
                const existingMat = Storage.getById(INJECT_MAT_STORE, linkId);
                if (existingMat && savedProduct) {
                    const existingIds = existingMat.productIds || [];
                    if (!existingIds.includes(savedProduct.id)) {
                        await Storage.update(INJECT_MAT_STORE, linkId, {
                            productIds: [...existingIds, savedProduct.id],
                            mfgProductName: data.partName
                        });
                    }
                }
                UIUtils.closeModal();
                UIUtils.toast('제품이 등록되었습니다. 기존 사출자재에 연결되었습니다.', 'success');
            } else {
                const injPartName = g('addProdAutoInjPartName').trim();
                if (injPartName) {
                    const injMat = {
                        carModel:        data.carModel,
                        supplier:        g('addProdAutoInjSupplier').trim(),
                        injPartName:     injPartName,
                        injColor:        g('addProdAutoInjColor').trim(),
                        unitPrice:       g('addProdAutoInjPrice').trim(),
                        itemType:        data.itemType || '',
                        mfgProductName:  data.partName,
                        mfgProductName2: '',
                        cavityCount:     g('addProdAutoInjCavity').trim(),
                        weight:          g('addProdAutoInjWeight').trim(),
                        productIds:      savedProduct ? [savedProduct.id] : []
                    };
                    await Storage.add(INJECT_MAT_STORE, injMat);
                    UIUtils.closeModal();
                    UIUtils.toast('제품 및 사출 자재가 함께 등록되었습니다.', 'success');
                } else {
                    UIUtils.closeModal();
                    UIUtils.toast('제품이 추가되었습니다. (사출 부품명 미입력 → 사출 자재 등록 생략)', 'warning');
                }
            }
        } else {
            UIUtils.closeModal();
            UIUtils.toast('제품이 추가되었습니다.', 'success');
        }

        renderTabContent();
    }

    function editProduct(id, returnToValidation = false) {
        const p = Storage.getById(PRODUCTS_STORE, id);
        if (!p) return;
        UIUtils.showModal({ title: '제품 수정', body: _productFormHTML(p, 'editProd'), footer: `
            <button class="btn btn-secondary" onclick="${returnToValidation ? 'SettingsModule.openPaintValidationModal()' : 'UIUtils.closeModal()'}">취소</button>
            <button class="btn btn-primary" onclick="SettingsModule.updateProduct('${id}', ${returnToValidation ? 'true' : 'false'})">저장</button>
        `, size: 'xxxl', noBackdropClose: true });
        setTimeout(() => {
            // 품명/컬러 변경 시 코드 자동 갱신
            const upd = () => {
                const cm = document.getElementById('editProdCarModel').value.trim();
                const pn = document.getElementById('editProdPartName').value.trim();
                const cl = document.getElementById('editProdColor').value.trim();
                const codeEl = document.getElementById('editProdCode');
                if (codeEl && !codeEl.value) codeEl.value = (cm && pn && cl) ? generateProductCode(cm, pn, cl) : '';
            };
            ['editProdCarModel', 'editProdPartName', 'editProdColor'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.addEventListener('input', upd);
            });
        }, 100);
    }

    async function updateProduct(id, returnToValidation = false) {
        const data = _collectProductForm('editProd');
        if (!data.partName) {
            UIUtils.toast('품명은 필수입니다.', 'warning');
            return;
        }

        // ── 품명 변경 감지 (저장 전에 원본 읽기) ───────────────────
        const oldRec     = Storage.getById(PRODUCTS_STORE, id);
        const oldPartName = (oldRec && oldRec.partName) ? oldRec.partName.trim() : '';
        const newPartName = data.partName.trim();
        const partNameChanged = oldPartName && newPartName && oldPartName !== newPartName;

        data.displayName = `${data.carModel} ${data.partName} ${data.color}`.trim();
        await Storage.update(PRODUCTS_STORE, id, data);

        // ── 사출 자재 수정/신규 등록 (편집 모드가 활성화된 경우) ────
        const injEditMode = document.getElementById('editProdInjEditMode');
        let injMatChanged = false;
        if (injEditMode && injEditMode.style.display !== 'none') {
            const countEl = document.getElementById('editProdInjEditCount');
            const count = countEl ? parseInt(countEl.value) || 0 : 0;
            const g = elId => (document.getElementById(elId) || {}).value || '';
            for (let i = 0; i < count; i++) {
                const matId       = g(`editProdEditInjId_${i}`);
                const linkId      = g(`editProdEditInjLinkId_${i}`).trim();
                const injPartName = g(`editProdEditInjPartName_${i}`).trim();
                const injColor    = g(`editProdEditInjColor_${i}`).trim();
                const supplier    = g(`editProdEditInjSupplier_${i}`).trim();
                const unitPrice   = g(`editProdEditInjPrice_${i}`).trim();
                const cavityCount = g(`editProdEditInjCavity_${i}`).trim();
                const weight      = g(`editProdEditInjWeight_${i}`).trim();

                if (matId) {
                    // 기존 연결 자재 수정
                    await Storage.update(INJECT_MAT_STORE, matId, {
                        injPartName, injColor, supplier, unitPrice, cavityCount, weight,
                        mfgProductName: data.partName
                    });
                    injMatChanged = true;
                } else if (linkId) {
                    // 피커에서 기존 자재 선택 → 연결만 추가
                    const existingMat = Storage.getById(INJECT_MAT_STORE, linkId);
                    if (existingMat) {
                        const existingIds = existingMat.productIds || [];
                        if (!existingIds.includes(id)) {
                            await Storage.update(INJECT_MAT_STORE, linkId, {
                                productIds: [...existingIds, id],
                                mfgProductName: data.partName
                            });
                            injMatChanged = true;
                        }
                    }
                } else if (injPartName) {
                    // 신규 자재 등록 (부품명이 입력된 경우에만)
                    const newMat = {
                        carModel:       data.carModel || '',
                        injPartName,
                        injColor,
                        supplier,
                        unitPrice,
                        cavityCount,
                        weight,
                        mfgProductName: data.partName,
                        mfgProductName2: '',
                        productIds:     [id]
                    };
                    await Storage.add(INJECT_MAT_STORE, newMat);
                    injMatChanged = true;
                }
            }
        }

        UIUtils.closeModal();
        UIUtils.toast(injMatChanged ? '제품 및 사출 자재가 저장되었습니다.' : '수정되었습니다.', 'success');

        if (returnToValidation) {
            openPaintValidationModal();
        } else {
            renderTabContent();
        }

        // ── 품명이 변경된 경우 → 전체 이력 일괄 변경 질의 ───────────
        if (partNameChanged) {
            _askCascadeRename(oldPartName, newPartName, data.color || '');
        }
    }

    function removeProduct(id) {
        UIUtils.confirm('이 제품을 삭제하시겠습니까?', async () => {
            await Storage.remove(PRODUCTS_STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            renderTabContent();
        });
    }

    // =====================================================
    // 제품 CSV 다운로드 / 일괄 업로드
    // =====================================================
    function downloadProductCSV() {
        const products = Storage.getAll(PRODUCTS_STORE);
        const allPaints = Storage.getAll(PAINT_STORE) || [];
        const injMats   = Storage.getAll(INJECT_MAT_STORE) || [];

        // 도료 ID → 이름 조회 맵
        const paintMap = {};
        allPaints.forEach(p => { paintMap[p.id] = p; });

        // 도료 행은 항상 4행 고정 (A~AP = 42컬럼 일치)
        const paintRowCount = 4;

        // 헤더 구성: 기본 + 도료N(사양/주제/경화제/희석제) + 사출자재
        const headers = [...PRODUCT_COLUMNS.map(c => c.label), '관리코드'];
        for (let i = 1; i <= paintRowCount; i++) {
            headers.push(`도료${i}_사양`, `도료${i}_주제`, `도료${i}_경화제`, `도료${i}_희석제`);
        }
        headers.push('사출자재_생산처', '사출자재_품명', '사출자재_컬러', '사출자재_단가');

        const rows = products.length > 0 ? products.map(p => {
            const row = [...PRODUCT_COLUMNS.map(c => p[c.key] || ''), p.code || ''];

            // 도료 정보
            const pm = p.paintMaterials || [];
            for (let i = 0; i < paintRowCount; i++) {
                const pr = pm[i];
                if (pr) {
                    const mainP    = paintMap[pr.mainId];
                    const hardP    = paintMap[pr.hardId];
                    const thinnerP = paintMap[pr.thinnerId];
                    row.push(
                        pr.paintSpec || '',
                        mainP    ? mainP.name    : (pr.mainId    || ''),
                        hardP    ? hardP.name    : (pr.hardId    || ''),
                        thinnerP ? thinnerP.name : (pr.thinnerId || '')
                    );
                } else {
                    row.push('', '', '', '');
                }
            }

            // 사출자재 정보 (품명 일치 첫 번째)
            const pName = (p.partName || '').trim();
            const mat = injMats.find(m =>
                (m.mfgProductName  || '').trim() === pName ||
                (m.mfgProductName2 || '').trim() === pName
            );
            row.push(
                mat ? (mat.supplier    || '') : '',
                mat ? (mat.injPartName || '') : '',
                mat ? (mat.injColor    || '') : '',
                mat ? (mat.unitPrice   || '') : ''
            );

            return row;
        }) : [Array(headers.length).fill('')];

        Storage.exportToCSV(headers, rows, '제품_정보');
        UIUtils.toast('CSV 다운로드 완료 (엑셀에서 편집 후 재업로드 하세요)', 'success');
    }

    function _parseProductCSVLine(line, sep) {
        const result = [];
        let cur = '',
            inQ = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQ && line[i + 1] === '"') {
                    cur += '"';
                    i++;
                } else inQ = !inQ;
            } else if (ch === sep && !inQ) {
                result.push(cur.trim());
                cur = '';
            } else cur += ch;
        }
        result.push(cur.trim());
        return result;
    }

    function _parseProductText(text) {
        const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
        if (!lines.length) return [];
        const sep = lines[0].includes('\t') ? '\t' : ',';
        const parsed = lines.map(l => _parseProductCSVLine(l, sep));
        const hdrKw = ['차종', '품명', 'carmodel', 'partname'];
        const first = parsed[0].map(c => c.toLowerCase());
        const isHeader = hdrKw.some(kw => first.includes(kw));
        const dataRows = isHeader ? parsed.slice(1) : parsed;

        // 도료명 → ID 역매핑
        const allPaints = Storage.getAll(PAINT_STORE) || [];
        const nameToId = {};
        allPaints.forEach(pm => { if (pm.name) nameToId[pm.name.trim()] = pm.id; });

        // 컬럼 시작 인덱스 상수
        const CODE_IDX        = PRODUCT_COLUMNS.length;      // 21 (V열)
        const PAINT_COL_START = CODE_IDX + 1;                // 22 (W열)
        const PAINT_ROW_COUNT = 4;
        const INJ_COL_START   = PAINT_COL_START + PAINT_ROW_COUNT * 4; // 38 (AM열)

        return dataRows
            .filter(row => row.some(c => c !== ''))
            .map(row => {
                const p = {};
                PRODUCT_COLUMNS.forEach((col, idx) => {
                    p[col.key] = row[idx] || '';
                });
                p.code = row[CODE_IDX] || ''; // V열 관리코드

                // ── 도료 정보 파싱 (W~AL, 4행 × 4필드) ──
                const paintMaterials = [];
                for (let i = 0; i < PAINT_ROW_COUNT; i++) {
                    const base      = PAINT_COL_START + i * 4;
                    const spec      = (row[base]   || '').trim();
                    const mainName  = (row[base+1] || '').trim();
                    const hardName  = (row[base+2] || '').trim();
                    const thinnerNm = (row[base+3] || '').trim();
                    if (spec || mainName || hardName || thinnerNm) {
                        paintMaterials.push({
                            paintSpec: spec,
                            mainId:    nameToId[mainName]  || '',
                            hardId:    nameToId[hardName]  || '',
                            thinnerId: nameToId[thinnerNm] || ''
                        });
                    }
                }
                if (paintMaterials.length) p.paintMaterials = paintMaterials;

                // ── 사출자재 (AM~AP) ── 참조 전용, 제품 레코드에 저장 안 함 ──
                // row[INJ_COL_START] ~ row[INJ_COL_START+3] : 공급처, 품명, 컬러, 단가

                return p;
            })
            .filter(p => p.partName);
    }

    function _renderProductUploadPreview(rows) {
        const box = document.getElementById('prodUploadPreview');
        const btn = document.getElementById('prodUploadConfirmBtn');
        if (!rows.length) {
            box.innerHTML = '<p style="color:var(--accent-red);padding:8px;">유효한 데이터가 없습니다. 열 순서를 확인해주세요.</p>';
            btn.style.display = 'none';
            return;
        }
        box.innerHTML = `
            <div style="margin-bottom:8px;font-size:0.85rem;color:var(--text-secondary);">
                총 <strong>${rows.length}건</strong> 인식됨
                <span style="color:var(--text-muted);font-size:0.78rem;">(품명 없는 행 제외됨)</span>
            </div>
            <div style="overflow-x:auto;max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;">
                <table style="width:100%;border-collapse:collapse;font-size:0.78rem;white-space:nowrap;">
                    <thead>
                        <tr style="background:var(--bg-secondary);position:sticky;top:0;">
                            ${PRODUCT_COLUMNS.map(c => `<th style="padding:5px 10px;text-align:left;color:var(--text-secondary);">${c.label}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(r => `
                            <tr style="border-top:1px solid var(--border);">
                                ${PRODUCT_COLUMNS.map(c => `<td style="padding:4px 10px;">${r[c.key] || '-'}</td>`).join('')}
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
        btn.style.display = '';
        window._productUploadRows = rows;
    }

    function openProductUploadModal() {
        window._productUploadRows = [];

        // 열 index → Excel 열 문자 변환
        function colLetter(i) {
            return i < 26
                ? String.fromCharCode(65 + i)
                : String.fromCharCode(64 + Math.floor(i / 26)) + String.fromCharCode(65 + (i % 26));
        }

        // 기본 제품 컬럼 안내 (A~U)
        const prodGuide = PRODUCT_COLUMNS.map((c, i) =>
            `<span style="background:var(--bg-primary);border-radius:4px;padding:2px 6px;">${colLetter(i)}: ${c.label}</span>`
        ).join(' ');

        // 도료 컬럼 안내 (W~AL, 4행 × 4필드)
        const PAINT_START = PRODUCT_COLUMNS.length + 1; // 22
        const paintLabels = ['사양', '주제', '경화제', '희석제'];
        const paintGuide = [1,2,3,4].map(n => {
            const base = PAINT_START + (n-1) * 4;
            return paintLabels.map((lbl, j) =>
                `<span style="background:var(--bg-primary);border-radius:4px;padding:2px 6px;">${colLetter(base+j)}: 도료${n}_${lbl}</span>`
            ).join(' ');
        }).join(' ');

        // 사출자재 컬럼 안내 (AM~AP, 참조 전용)
        const INJ_START = PAINT_START + 4 * 4; // 38
        const injLabels = ['생산처', '품명', '컬러', '단가'];
        const injGuide = injLabels.map((lbl, j) =>
            `<span style="background:var(--bg-primary);border-radius:4px;padding:2px 6px;opacity:0.7;">${colLetter(INJ_START+j)}: 사출자재_${lbl}</span>`
        ).join(' ');

        UIUtils.showModal('제품 정보 일괄 업로드', `
            <div style="background:var(--bg-secondary);border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:0.825rem;line-height:2;">
                <div style="font-weight:600;margin-bottom:6px;">📋 열 순서 (엑셀 A~AP열, 총 42열)</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px;">${prodGuide}</div>
                <div style="color:var(--text-muted);font-size:0.78rem;margin-bottom:4px;">V열(관리코드)이 있으면 사용, 없으면 자동 생성됩니다.</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px;padding-top:6px;border-top:1px dashed var(--border);">${paintGuide}</div>
                <div style="color:var(--text-muted);font-size:0.78rem;margin-bottom:4px;">도료 주제·경화제·희석제는 도료명으로 조회 후 ID 연결됩니다. 비워도 됩니다.</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;padding-top:6px;border-top:1px dashed var(--border);">${injGuide}</div>
                <div style="color:var(--text-muted);font-size:0.78rem;">사출자재 열(AM~AP)은 참조 전용 — 업로드 시 무시됩니다.</div>
            </div>

            <div style="margin-bottom:4px;">
                <label class="form-label" style="margin-bottom:4px;">① CSV 파일 선택</label>
                <input type="file" id="prodUploadFile" accept=".csv,.tsv,.txt"
                    class="form-input" style="padding:6px;"
                    onchange="SettingsModule.handleProductUploadFile(this)">
            </div>

            <div style="text-align:center;color:var(--text-muted);padding:8px 0;font-size:0.85rem;">— 또는 —</div>

            <div style="margin-bottom:14px;">
                <label class="form-label" style="margin-bottom:4px;">② 엑셀에서 복사 후 붙여넣기 <span style="color:var(--text-muted);font-weight:400;">(헤더 포함 가능)</span></label>
                <textarea id="prodUploadText" class="form-textarea" rows="7"
                    placeholder="엑셀에서 A~AP열 범위 선택 → Ctrl+C → 여기서 Ctrl+V"
                    style="font-family:monospace;font-size:0.8rem;resize:vertical;"
                    oninput="SettingsModule.handleProductUploadText()"></textarea>
            </div>

            <div id="prodUploadPreview" style="margin-bottom:12px;"></div>

            <div id="prodUploadOptions" style="display:none;padding:10px 14px;background:var(--bg-secondary);border-radius:8px;">
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.875rem;">
                    <input type="checkbox" id="prodUploadReplace" style="width:16px;height:16px;">
                    <span>기존 제품 정보 전체 삭제 후 교체
                        <span style="color:var(--accent-red);font-size:0.78rem;display:block;margin-top:1px;">
                            ⚠️ 체크 안 하면 기존 데이터에 추가됩니다
                        </span>
                    </span>
                </label>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" id="prodUploadConfirmBtn" style="display:none;"
                onclick="SettingsModule.confirmProductUpload()">
                <span class="material-symbols-outlined">upload</span> 업로드 확인
            </button>
        `);
    }

    function handleProductUploadFile(input) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            document.getElementById('prodUploadText').value = '';
            const rows = _parseProductText(e.target.result);
            _renderProductUploadPreview(rows);
            document.getElementById('prodUploadOptions').style.display = rows.length ? '' : 'none';
        };
        reader.readAsText(file, 'UTF-8');
    }

    function handleProductUploadText() {
        const text = document.getElementById('prodUploadText').value;
        if (!text.trim()) {
            document.getElementById('prodUploadPreview').innerHTML = '';
            document.getElementById('prodUploadConfirmBtn').style.display = 'none';
            document.getElementById('prodUploadOptions').style.display = 'none';
            return;
        }
        const rows = _parseProductText(text);
        _renderProductUploadPreview(rows);
        document.getElementById('prodUploadOptions').style.display = rows.length ? '' : 'none';
    }

    async function confirmProductUpload() {
        const rows = window._productUploadRows || [];
        if (!rows.length) {
            UIUtils.toast('업로드할 데이터가 없습니다.', 'warning');
            return;
        }

        const doReplace = document.getElementById('prodUploadReplace').checked;

        // 데이터 정제: 품명 없는 행 제외, ID/code/displayName 부여 (순차 처리로 ID 충돌 방지)
        const ts = new Date().toISOString();
        const newItems = [];
        let seq = 0;
        for (const r of rows) {
            if (!r.partName) continue;
            const item = { ...r };
            if (!item.id) item.id = Date.now().toString(36) + (++seq).toString(36).padStart(3,'0') + Math.random().toString(36).substr(2, 5);
            if (!item.createdAt) item.createdAt = ts;
            if (!item.code) item.code = generateProductCode(item.carModel, item.partName, item.color);
            item.displayName = `${item.carModel || ''} ${item.partName || ''} ${item.color || ''}`.trim();
            newItems.push(item);
        }

        if (!newItems.length) {
            UIUtils.toast('유효한 데이터(품명 있는 행)가 없습니다.', 'warning');
            return;
        }

        try {
            if (doReplace) {
                // ── 전체 교체: bulk API (DELETE + INSERT) ──
                await Storage.saveAll(PRODUCTS_STORE, newItems);
            } else {
                // ── 개별 추가: API await 후 캐시 갱신 ──
                const cacheArr = Storage.getAll(PRODUCTS_STORE);
                for (const item of newItems) {
                    await ApiClient.save(PRODUCTS_STORE, item);
                    cacheArr.push(item);
                }
            }

            // DB 최신 상태로 캐시 재동기화
            await Storage.refresh(PRODUCTS_STORE);

            UIUtils.closeModal();
            UIUtils.toast(`${newItems.length}건 업로드 완료${doReplace ? ' (기존 데이터 교체)' : ' (기존 데이터에 추가)'}`, 'success');
            renderTabContent();
        } catch (e) {
            console.error('제품 업로드 실패:', e);
            UIUtils.toast('저장 실패: ' + e.message, 'error');
        }
    }

    // =====================================================
    // 사출자재 관리 탭
    // =====================================================
    const INJECT_MAT_STORE = DB.STORES.INJECTION_MATERIALS;

    const INJECT_MAT_COLUMNS = [
        { key: 'carModel',        label: '차종'       },
        { key: 'supplier',        label: '생산처'     },
        { key: 'injPartName',     label: '사출품명'   },
        { key: 'injColor',        label: '컬러'       },
        { key: 'unitPrice',       label: '단가'       },
        { key: 'itemType',        label: '품목구분'   },
        { key: 'mfgProductName',  label: '제작품목1'  },
        { key: 'mfgProductName2', label: '제작품목2'  },
        { key: 'weight',          label: '중량(g)'    },
        { key: 'rawMatName',      label: '원재료명'   },
        { key: 'rawMatColor',     label: '원재료 컬러' }
    ];

    function filterInjectMatList() {
        const supplierEl  = document.getElementById('injectMatSupplierFilter');
        const carModelEl  = document.getElementById('injectMatCarModelFilter');
        if (!supplierEl) return;

        const selectedSupplier = supplierEl.value;
        const selectedCarModel = carModelEl ? carModelEl.value : '';

        const tbody = document.querySelector('#settingsContent .data-table tbody');
        if (!tbody) return;

        const rows = tbody.querySelectorAll('tr');
        let visibleCount = 0;

        // 데이터가 없는 경우의 메시지 행 처리
        if (rows.length === 1 && rows[0].cells.length === 1) return;

        rows.forEach(row => {
            const rowSupplier  = (row.dataset.supplier  || '');
            const rowCarModel  = (row.dataset.carModel  || '');
            const matchSupplier = selectedSupplier === '' || rowSupplier === selectedSupplier;
            const matchCarModel = selectedCarModel === '' || rowCarModel === selectedCarModel;

            if (matchSupplier && matchCarModel) {
                row.style.display = '';
                visibleCount++;
            } else {
                row.style.display = 'none';
            }
        });

        const countSpan = document.getElementById('injectMatCount');
        if (countSpan) countSpan.textContent = visibleCount;
    }

    // 사출자재 중복 데이터 자동 정리
    // 중복 기준: carModel + supplier + injPartName + injColor 동일
    // 정리한 경우 true 반환, 이미 깨끗하면 false 반환
    async function _deduplicateInjectMats() {
        const items = Storage.getAll(INJECT_MAT_STORE) || [];
        const seen = new Map(); // key → 첫 번째 항목 id
        const deduped = [];

        for (const item of items) {
            const key = [
                (item.carModel    || '').trim(),
                (item.supplier    || '').trim(),
                (item.injPartName || '').trim(),
                (item.injColor    || '').trim()
            ].join('||');

            if (!seen.has(key)) {
                seen.set(key, item.id);
                deduped.push(item);
            }
            // 중복이면 deduped에 추가하지 않음 (제거)
        }

        const removedCount = items.length - deduped.length;
        if (removedCount === 0) return false;

        await Storage.saveAll(INJECT_MAT_STORE, deduped);
        await Storage.refresh(INJECT_MAT_STORE);
        UIUtils.toast(`사출자재 중복 ${removedCount}건 정리 완료 (${deduped.length}건 유지)`, 'success');
        return true;
    }

    function renderInjectMatTab(el) {
        // 중복 데이터 감지 시 자동 정리 후 재렌더
        _deduplicateInjectMats().then(cleaned => {
            if (cleaned) renderInjectMatTab(el);
        }).catch(() => {});

        const items = Storage.getAll(INJECT_MAT_STORE).sort((a, b) =>
            (a.carModel || '').localeCompare(b.carModel || '', 'ko') || (a.injPartName || '').localeCompare(b.injPartName || '', 'ko')
        );
        const uniqueSuppliers  = [...new Set(items.map(m => m.supplier).filter(Boolean))].sort();
        const uniqueCarModels  = UIUtils.sortCarModels(items.map(m => m.carModel), items);

        // 원재료 실시간 매칭 헬퍼 (injPartName → usedFor + injColor → color 동시 매칭)
        const rawMats = Storage.getAll(DB.STORES.RAW_MATERIALS) || [];
        function _colorMatch(rawColor, injColor) {
            if (!rawColor || !injColor) return false;
            const rc = rawColor.toLowerCase();
            const ic = injColor.toLowerCase();
            return rc.split(/[,，\/]/).map(s => s.trim()).some(c => c && (ic.includes(c) || c.includes(ic)));
        }
        function _findMatchedRawMats(injPartName, injColor) {
            if (!injPartName) return [];
            const byPart = rawMats.filter(r =>
                r.usedFor && r.usedFor.split(/[,，]/).map(s => s.trim()).includes(injPartName.trim())
            );
            // 컬러까지 매칭되는 것 우선, 없으면 품명 매칭만
            const byBoth = injColor ? byPart.filter(r => _colorMatch(r.color, injColor)) : [];
            return byBoth.length > 0 ? byBoth : byPart;
        }

        el.innerHTML = `
            <div class="card">
                <div class="card-header" style="flex-wrap: wrap; gap: 10px;">
                    <div style="display:flex; align-items:center; gap: 12px; flex-wrap:wrap;">
                        <h4 style="margin:0;"><span class="material-symbols-outlined">inventory_2</span> 사출품 목록 (<span id="injectMatCount">${items.length}</span>건)</h4>
                        <select id="injectMatCarModelFilter" class="form-input" style="width: 130px; padding: 4px 8px;" onchange="SettingsModule.filterInjectMatList()">
                            <option value="">전체 차종</option>
                            ${uniqueCarModels.map(c => `<option value="${c}">${c}</option>`).join('')}
                        </select>
                        <select id="injectMatSupplierFilter" class="form-input" style="width: 140px; padding: 4px 8px;" onchange="SettingsModule.filterInjectMatList()">
                            <option value="">전체 생산처</option>
                            ${uniqueSuppliers.map(s => `<option value="${s}">${s}</option>`).join('')}
                        </select>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button class="btn btn-outline" onclick="SettingsModule.downloadInjectMatCSV()">
                            <span class="material-symbols-outlined">download</span> CSV 다운로드
                        </button>
                        <button class="btn btn-outline" style="border-color:#6366f1;color:#4f46e5;"
                                onclick="SettingsModule.openMfgMatchingReview()"
                                title="사출자재 제작품목(productIds) ↔ 제품 정보 연결 상태를 검증합니다">
                            <span class="material-symbols-outlined" style="font-size:16px;vertical-align:-3px;">verified</span>
                            사출자재 검증
                        </button>
                        <button class="btn btn-primary" onclick="SettingsModule.openAddInjectMatModal()">
                            <span class="material-symbols-outlined">add</span> 자재 추가
                        </button>
                    </div>
                </div>
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>No</th>
                                    <th>차종</th>
                                    <th>생산처</th>
                                    <th>사출품명</th>
                                    <th>컬러</th>
                                    <th>단가</th>
                                    <th>제작품목1</th>
                                    <th>제작품목2</th>
                                    <th style="text-align:right;">중량(g)</th>
                                    <th>원재료명</th>
                                    <th>원재료 컬러</th>
                                    <th>작업</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${items.length === 0 ?
                `<tr><td colspan="12" style="text-align:center;padding:40px;color:var(--text-muted);">등록된 사출품이 없습니다.</td></tr>` :
                items.map((m, i) => {
                    // rawMatId가 직접 지정된 경우 그것을 우선 표시; 없으면 usedFor 자동매칭
                    let rawMatName, rawMatColor, matchedCount = 0;
                    if (m.rawMatId) {
                        const manualMat = rawMats.find(r => r.id === m.rawMatId);
                        rawMatName  = manualMat ? (manualMat.matName || '-') : (m.rawMatName || '-');
                        rawMatColor = manualMat ? (manualMat.color  || '-') : (m.rawMatColor || '-');
                    } else {
                        const matched = _findMatchedRawMats(m.injPartName, m.injColor);
                        matchedCount = matched.length;
                        rawMatName  = matched.length > 0 ? matched.map(r => r.matName).filter(Boolean).join(', ') : (m.rawMatName || '-');
                        rawMatColor = matched.length > 0 ? matched.map(r => r.color).filter(Boolean).join(', ') : (m.rawMatColor || '-');
                    }
                    return `
                                        <tr data-supplier="${m.supplier || ''}" data-car-model="${m.carModel || ''}">
                                            <td>${i + 1}</td>
                                            <td>${m.carModel || '-'}</td>
                                            <td>${m.supplier || '-'}</td>
                                            <td><strong>${m.injPartName || '-'}</strong></td>
                                            <td>${m.injColor || '-'}</td>
                                            <td style="text-align:right;">${m.unitPrice ? Number(m.unitPrice).toLocaleString() : '-'}</td>
                                            <td>${m.mfgProductName || '-'}</td>
                                            <td>${m.mfgProductName2 || '-'}</td>
                                            <td style="text-align:right;">${m.weight ? Number(m.weight).toLocaleString() + ' g' : '-'}</td>
                                            <td>${rawMatName}${matchedCount > 1 ? `<span style="font-size:0.72rem;color:var(--text-muted);margin-left:4px;">(${matchedCount}건)</span>` : ''}</td>
                                            <td>${rawMatColor}</td>
                                            <td>
                                                <button class="btn btn-sm btn-outline" onclick="SettingsModule.editInjectMat('${m.id}')">수정</button>
                                                <button class="btn btn-sm btn-danger" onclick="SettingsModule.removeInjectMat('${m.id}')">삭제</button>
                                            </td>
                                        </tr>
                                    `;
                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    function _injectMatFormHTML(m = {}) {
        const v = k => m[k] !== undefined ? m[k] : '';
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const rawMats = Storage.getAll(DB.STORES.RAW_MATERIALS) || [];
        const uniqueCarModels = UIUtils.sortCarModels(products.map(p => p.carModel), products);
        const carModelOptions = uniqueCarModels.map(c =>
            `<option value="${c}" ${v('carModel') === c ? 'selected' : ''}>${c}</option>`
        ).join('');

        // 제작품목 드롭다운 옵션 생성 (차종 기준 필터)
        const _selCarModel = v('carModel');
        const _productIds  = v('productIds') || [];
        const _filteredProds = _selCarModel
            ? products.filter(p => p.carModel === _selCarModel)
            : products;
        // ID 우선; 없으면 mfgProductName 텍스트로 역매칭하여 선택값 결정
        const _resolveProductId = (slot) => {
            if (_productIds[slot]) return _productIds[slot];
            const fallbackName = slot === 0 ? v('mfgProductName') : v('mfgProductName2');
            if (!fallbackName) return '';
            const found = products.find(p => p.partName && p.partName.trim() === fallbackName.trim()
                && (!_selCarModel || p.carModel === _selCarModel));
            return found ? found.id : '';
        };
        const _prodId1 = _resolveProductId(0);
        const _prodId2 = _resolveProductId(1);
        const _makeProductOptions = (selectedId) => {
            const opts = _filteredProds.map(p =>
                `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>`
                + `${p.partName || ''}${p.color ? ' / ' + p.color : ''}`
                + `</option>`
            ).join('');
            return opts;
        };

        // injPartName + injColor 기준으로 원재료 자동 매칭
        const injPartName = v('injPartName');
        const injColor    = v('injColor');
        function _fColorMatch(rawColor, ic) {
            if (!rawColor || !ic) return false;
            const rc = rawColor.toLowerCase(), icc = ic.toLowerCase();
            return rawColor.split(/[,，\/]/).map(s => s.trim()).some(c => c && (icc.includes(c.toLowerCase()) || c.toLowerCase().includes(icc)));
        }
        const byPart = injPartName
            ? rawMats.filter(r => r.usedFor && r.usedFor.split(/[,，]/).map(s => s.trim()).includes(injPartName))
            : [];
        const byBoth = injColor ? byPart.filter(r => _fColorMatch(r.color, injColor)) : [];
        const matchedRawMat = (byBoth.length > 0 ? byBoth : byPart)[0] || null;
        const selectedRawMatId = v('rawMatId') || (matchedRawMat ? matchedRawMat.id : '');

        const rawMatOptions = rawMats.map(r =>
            `<option value="${r.id}" ${selectedRawMatId === r.id ? 'selected' : ''}>` +
            `${r.matName}${r.color ? ' / ' + r.color : ''}${r.supplier ? ' (' + r.supplier + ')' : ''}</option>`
        ).join('');
        return `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <select class="form-select" id="imCarModel"
                        onchange="SettingsModule._onInjectMatCarModelChange()">
                        <option value="">-- 선택 --</option>
                        ${carModelOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">생산처</label>
                    <input type="text" class="form-input" id="imSupplier" placeholder="예: 현대모비스" value="${v('supplier')}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">사출품명 <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="imInjPartName" placeholder="예: 프론트 범퍼" value="${v('injPartName')}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">사출 컬러</label>
                    <input type="text" class="form-input" id="imInjColor" placeholder="예: 화이트, 블랙" value="${v('injColor')}">
                </div>
                <div class="form-group">
                    <label class="form-label">단가 (원)</label>
                    <input type="number" class="form-input" id="imUnitPrice" placeholder="0" min="0" value="${v('unitPrice')}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">품목구분</label>
                    <select class="form-select" id="imItemType">
                        <option value="" ${!v('itemType') ? 'selected' : ''}>-- 선택 --</option>
                        <option value="양산" ${v('itemType') === '양산' ? 'selected' : ''}>양산</option>
                        <option value="A/S" ${v('itemType') === 'A/S' ? 'selected' : ''}>A/S</option>
                        <option value="개발" ${v('itemType') === '개발' ? 'selected' : ''}>개발</option>
                    </select>
                </div>
                <div class="form-group" style="visibility:hidden;"></div>
            </div>
            <!-- 제작품목 동적 리스트 -->
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
                <label class="form-label" style="margin:0;">
                    제작품목
                    <span style="font-size:0.72rem;color:var(--accent-orange,#ea580c);font-weight:600;margin-left:4px;">★ 예약 연동 필수</span>
                </label>
                <button type="button" onclick="SettingsModule.addInjMatProductSlot()"
                    style="display:flex;align-items:center;gap:3px;padding:3px 10px;
                           border:1px solid var(--accent-blue);border-radius:5px;background:transparent;
                           color:var(--accent-blue);cursor:pointer;font-size:0.78rem;font-weight:600;">
                    <span class="material-symbols-outlined" style="font-size:14px;">add</span> 제품 추가
                </button>
            </div>
            <div id="imProductList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:4px;">
                ${(() => {
                    // 기존 productIds 배열 기반으로 초기 슬롯 생성 (최소 1개)
                    const initIds = (_productIds && _productIds.length > 0)
                        ? _productIds
                        : (_prodId1 ? [_prodId1, _prodId2].filter(Boolean) : ['']);
                    return initIds.map((pid, idx) => {
                        const isFirst = idx === 0;
                        return `<div id="imProductRow_${idx}" style="display:flex;align-items:center;gap:6px;">
                            <select class="form-select" id="imProductId_${idx}" style="flex:1;">
                                <option value="">-- 제품 선택 (차종 먼저 선택) --</option>
                                ${_makeProductOptions(pid)}
                            </select>
                            ${!isFirst ? `<button type="button" onclick="SettingsModule.removeInjMatProductSlot(${idx})"
                                title="제거"
                                style="flex-shrink:0;width:28px;height:28px;border:1px solid var(--accent-red);
                                       border-radius:5px;background:transparent;color:var(--accent-red);
                                       cursor:pointer;font-size:1rem;line-height:1;display:flex;align-items:center;justify-content:center;">
                                <span class="material-symbols-outlined" style="font-size:16px;">close</span>
                            </button>` : '<div style="width:28px;flex-shrink:0;"></div>'}
                        </div>`;
                    }).join('');
                })()}
            </div>
            <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:8px;">
                제품 정보에서 선택 — 생산계획과 <strong>ID로 정확히 연결</strong>됩니다. 같은 금형으로 여러 제품 생산 시 추가하세요.
            </div>
            <!-- 하위 호환: 텍스트 기반 매칭용 hidden (기존값 보존) -->
            <input type="hidden" id="imMfgProductName" value="${v('mfgProductName')}">
            <input type="hidden" id="imMfgProductName2" value="${v('mfgProductName2')}">
            <div style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);letter-spacing:0.05em;text-transform:uppercase;margin:12px 0 6px;padding-bottom:4px;border-bottom:1px solid var(--border-color);">
                금형 / 중량 정보
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">취수 / CVT <span style="font-size:0.75rem;color:var(--text-muted);">(1 Shot 생산 수량)</span></label>
                    <input type="number" class="form-input" id="imCavityCount" placeholder="예: 2, 4, 8" min="1" value="${v('cavityCount')}" style="text-align:right;">
                </div>
                <div class="form-group">
                    <label class="form-label">사출 중량 (g) <span style="font-size:0.75rem;color:var(--text-muted);">개당</span></label>
                    <input type="number" class="form-input" id="imWeight" placeholder="예: 125.5" min="0" step="0.1" value="${v('weight')}" style="text-align:right;">
                </div>
            </div>
            <div style="font-size:0.78rem;font-weight:700;color:var(--text-secondary);letter-spacing:0.05em;text-transform:uppercase;margin:12px 0 6px;padding-bottom:4px;border-bottom:1px solid var(--border-color);">
                원재료 정보
            </div>
            <div class="form-row">
                <div class="form-group" style="grid-column:1/-1;">
                    <label class="form-label">원재료 선택
                        ${matchedRawMat ? `<span style="font-size:0.74rem;color:var(--accent-green);margin-left:6px;">✓ 사용품목 자동 매칭</span>` : ''}
                    </label>
                    <select class="form-select" id="imRawMatId" onchange="SettingsModule._onRawMatSelect(this)">
                        <option value="">-- 원재료 선택 (선택 안함) --</option>
                        ${rawMatOptions}
                    </select>
                </div>
            </div>
            <div id="imRawMatInfo" style="display:${selectedRawMatId ? 'grid' : 'none'};grid-template-columns:1fr 1fr 1fr;gap:10px;padding:10px 12px;background:var(--bg-tertiary);border-radius:6px;font-size:0.84rem;">
                ${(() => {
                    const sel = rawMats.find(r => r.id === selectedRawMatId);
                    if (!sel) return '';
                    return `<div><span style="color:var(--text-muted);">원재료명</span><br><strong>${sel.matName || '-'}</strong></div>
                            <div><span style="color:var(--text-muted);">컬러</span><br><strong>${sel.color || '-'}</strong></div>
                            <div><span style="color:var(--text-muted);">공급처</span><br><strong>${sel.supplier || '-'}</strong></div>`;
                })()}
            </div>
            <input type="hidden" id="imRawMatName" value="${v('rawMatName')}">
            <input type="hidden" id="imRawMatColor" value="${v('rawMatColor')}">
        `;
    }

    // 원재료 선택 시 정보 패널 갱신
    function _onRawMatSelect(sel) {
        const rawMats = Storage.getAll(DB.STORES.RAW_MATERIALS) || [];
        const mat = rawMats.find(r => r.id === sel.value);
        const infoEl = document.getElementById('imRawMatInfo');
        const nameEl = document.getElementById('imRawMatName');
        const colorEl = document.getElementById('imRawMatColor');
        if (!infoEl) return;
        if (mat) {
            infoEl.style.display = 'grid';
            infoEl.innerHTML =
                `<div><span style="color:var(--text-muted);">원재료명</span><br><strong>${mat.matName || '-'}</strong></div>` +
                `<div><span style="color:var(--text-muted);">컬러</span><br><strong>${mat.color || '-'}</strong></div>` +
                `<div><span style="color:var(--text-muted);">공급처</span><br><strong>${mat.supplier || '-'}</strong></div>`;
            if (nameEl) nameEl.value = mat.matName || '';
            if (colorEl) colorEl.value = mat.color || '';
        } else {
            infoEl.style.display = 'none';
            infoEl.innerHTML = '';
            if (nameEl) nameEl.value = '';
            if (colorEl) colorEl.value = '';
        }
    }

    function _collectInjectMatForm() {
        const g = id => (document.getElementById(id) || {}).value || '';
        const cavityRaw = g('imCavityCount').trim();

        // ── 동적 제작품목 슬롯 수집 ────────────────────────────────
        const productIds = [];
        let _slotIdx = 0;
        while (document.getElementById(`imProductId_${_slotIdx}`)) {
            const val = (document.getElementById(`imProductId_${_slotIdx}`) || {}).value || '';
            if (val) productIds.push(val);
            _slotIdx++;
        }
        // 구버전 폼 호환 (imProductId1/2)
        if (_slotIdx === 0) {
            const v1 = g('imProductId1').trim();
            const v2 = g('imProductId2').trim();
            if (v1) productIds.push(v1);
            if (v2) productIds.push(v2);
        }

        // 하위 호환: 첫 두 ID에서 partName 역참조
        const _allProds = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const _p1 = productIds[0] ? _allProds.find(p => p.id === productIds[0]) : null;
        const _p2 = productIds[1] ? _allProds.find(p => p.id === productIds[1]) : null;
        const mfgProductName  = _p1 ? _p1.partName : g('imMfgProductName').trim();
        const mfgProductName2 = _p2 ? _p2.partName : g('imMfgProductName2').trim();

        const cavityRawTrimmed = g('imCavityCount').trim();
        return {
            carModel:        g('imCarModel').trim(),
            supplier:        g('imSupplier').trim(),
            injPartName:     g('imInjPartName').trim(),
            injColor:        g('imInjColor').trim(),
            unitPrice:       g('imUnitPrice').trim(),
            itemType:        g('imItemType').trim(),
            productIds,          // v19: ID 배열
            mfgProductName,      // 하위 호환 텍스트
            mfgProductName2,     // 하위 호환 텍스트
            cavityCount:     cavityRaw ? Number(cavityRaw) : '',
            weight:          g('imWeight').trim() ? Number(g('imWeight').trim()) : '',
            rawMatId:        g('imRawMatId').trim(),
            rawMatName:      g('imRawMatName').trim(),
            rawMatColor:     g('imRawMatColor').trim()
        };
    }

    // 차종 변경 시 제작품목 드롭다운 전체 갱신
    function _onInjectMatCarModelChange() {
        const carModel = (document.getElementById('imCarModel') || {}).value || '';
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const filtered = carModel ? products.filter(p => p.carModel === carModel) : products;
        const makeOpts = (selectedId, isFirst) =>
            `<option value="">${isFirst ? '-- 제품 선택 --' : '-- 선택 없음 --'}</option>` +
            filtered.map(p =>
                `<option value="${p.id}" ${p.id === selectedId ? 'selected' : ''}>`
                + `${p.partName || ''}${p.color ? ' / ' + p.color : ''}`
                + `</option>`
            ).join('');
        // 동적 슬롯 전체 갱신
        let idx = 0;
        while (document.getElementById(`imProductId_${idx}`)) {
            const sel = document.getElementById(`imProductId_${idx}`);
            sel.innerHTML = makeOpts(sel.value, idx === 0);
            idx++;
        }
        // 구버전 폼 호환
        const sel1 = document.getElementById('imProductId1');
        const sel2 = document.getElementById('imProductId2');
        if (sel1) sel1.innerHTML = makeOpts(sel1.value, true);
        if (sel2) sel2.innerHTML = makeOpts(sel2.value, false);
    }

    // 제작품목 슬롯 추가
    function addInjMatProductSlot() {
        const list = document.getElementById('imProductList');
        if (!list) return;
        const idx = list.querySelectorAll('[id^="imProductRow_"]').length;
        const carModel = (document.getElementById('imCarModel') || {}).value || '';
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const filtered = carModel ? products.filter(p => p.carModel === carModel) : products;
        const opts = '<option value="">-- 선택 없음 --</option>' +
            filtered.map(p =>
                `<option value="${p.id}">${p.partName || ''}${p.color ? ' / '+p.color : ''}</option>`
            ).join('');
        const row = document.createElement('div');
        row.id = `imProductRow_${idx}`;
        row.style.cssText = 'display:flex;align-items:center;gap:6px;';
        row.innerHTML = `
            <select class="form-select" id="imProductId_${idx}" style="flex:1;">
                ${opts}
            </select>
            <button type="button" onclick="SettingsModule.removeInjMatProductSlot(${idx})"
                title="제거"
                style="flex-shrink:0;width:28px;height:28px;border:1px solid var(--accent-red);
                       border-radius:5px;background:transparent;color:var(--accent-red);
                       cursor:pointer;display:flex;align-items:center;justify-content:center;">
                <span class="material-symbols-outlined" style="font-size:16px;">close</span>
            </button>`;
        list.appendChild(row);
    }

    // 제작품목 슬롯 제거
    function removeInjMatProductSlot(idx) {
        const row = document.getElementById(`imProductRow_${idx}`);
        if (row) row.remove();
    }

    function openAddInjectMatModal() {
        UIUtils.showModal('사출자재 추가', _injectMatFormHTML(), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SettingsModule.saveInjectMat()">추가</button>
        `);
    }

    async function saveInjectMat() {
        const data = _collectInjectMatForm();
        if (!data.injPartName) {
            UIUtils.toast('사출명은 필수입니다.', 'warning');
            return;
        }
        await Storage.add(INJECT_MAT_STORE, data);
        UIUtils.closeModal();
        UIUtils.toast('사출자재가 추가되었습니다.', 'success');
        renderTabContent();
    }

    function editInjectMat(id) {
        const m = Storage.getById(INJECT_MAT_STORE, id);
        if (!m) return;
        UIUtils.showModal('사출자재 수정', _injectMatFormHTML(m), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SettingsModule.updateInjectMat('${id}')">저장</button>
        `);
    }

    async function updateInjectMat(id) {
        const data = _collectInjectMatForm();
        if (!data.injPartName) {
            UIUtils.toast('사출명은 필수입니다.', 'warning');
            return;
        }

        // ── 품명 변경 감지 (저장 전에 원본 읽기) ───────────────────
        const oldRec = Storage.getById(INJECT_MAT_STORE, id);
        const oldInjPartName  = (oldRec && oldRec.injPartName)     ? oldRec.injPartName.trim()     : '';
        const oldMfgName      = (oldRec && oldRec.mfgProductName)  ? oldRec.mfgProductName.trim()  : '';
        const oldMfgName2     = (oldRec && oldRec.mfgProductName2) ? oldRec.mfgProductName2.trim() : '';
        const newInjPartName  = data.injPartName.trim();
        const newMfgName      = (data.mfgProductName  || '').trim();
        const newMfgName2     = (data.mfgProductName2 || '').trim();

        const injPartChanged = oldInjPartName && newInjPartName && oldInjPartName !== newInjPartName;
        const mfgChanged     = (oldMfgName  && newMfgName  && oldMfgName  !== newMfgName)  ||
                               (oldMfgName2 && newMfgName2 && oldMfgName2 !== newMfgName2);

        await Storage.update(INJECT_MAT_STORE, id, data);
        UIUtils.closeModal();
        UIUtils.toast('수정되었습니다.', 'success');
        renderTabContent();

        // ── 사출부품명(injPartName) 변경 → 전체 이력 일괄 변경 질의 ─
        if (injPartChanged) {
            _askCascadeRename(oldInjPartName, newInjPartName, data.injColor || '', 'inj');
        }
        // ── 제작품목(mfgProductName) 변경 → 전체 이력 일괄 변경 질의 ─
        if (!injPartChanged && mfgChanged) {
            const pairs = [];
            if (oldMfgName  && newMfgName  && oldMfgName  !== newMfgName)  pairs.push([oldMfgName,  newMfgName]);
            if (oldMfgName2 && newMfgName2 && oldMfgName2 !== newMfgName2) pairs.push([oldMfgName2, newMfgName2]);
            for (const [on, nn] of pairs) {
                _askCascadeRename(on, nn, data.injColor || '', 'mfg');
            }
        }
    }

    function removeInjectMat(id) {
        UIUtils.confirm('이 사출자재를 삭제하시겠습니까?', async () => {
            await Storage.remove(INJECT_MAT_STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            renderTabContent();
        });
    }

    /**
     * 제품 편집 폼에서 "연결 해제" 버튼 클릭 시
     * — 사출자재의 productIds에서 해당 제품 ID를 제거
     * — 다른 연결 제품이 없는 경우 모달로 "연결만 해제 / 삭제" 선택
     */
    function _unlinkInjMat(matId, productId) {
        const mat = Storage.getById(INJECT_MAT_STORE, matId);
        if (!mat) { UIUtils.toast('사출자재를 찾을 수 없습니다.', 'error'); return; }

        const remainIds = (mat.productIds || []).filter(id => id !== productId);
        const matLabel  = mat.injPartName ? `"${mat.injPartName}"` : '이 사출자재';

        if (remainIds.length === 0) {
            // 다른 연결 제품 없음 → 연결 해제 or 삭제 선택
            UIUtils.showModal(
                '사출자재 연결 해제',
                `<p style="margin:8px 0;font-size:0.9rem;">${matLabel}에서 이 제품 연결을 해제하면 연결된 제품이 없어집니다.</p>
                 <p style="font-size:0.82rem;color:var(--text-muted);">어떻게 처리할까요?</p>`,
                `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
                 <button class="btn btn-outline" style="border-color:var(--accent-orange);color:var(--accent-orange);"
                     onclick="SettingsModule._doUnlink('${matId}','${productId}',false)">
                     연결만 해제 (자재 유지)
                 </button>
                 <button class="btn btn-danger"
                     onclick="SettingsModule._doUnlink('${matId}','${productId}',true)">
                     연결 해제 + 자재 삭제
                 </button>`
            );
        } else {
            UIUtils.confirm(`${matLabel}에서 이 제품 연결을 해제하시겠습니까?`, async () => {
                await Storage.update(INJECT_MAT_STORE, matId, { ...mat, productIds: remainIds });
                UIUtils.toast('연결이 해제되었습니다.', 'success');
                UIUtils.closeModal();
                renderTabContent();
            });
        }
    }

    async function _doUnlink(matId, productId, deletemat) {
        const mat = Storage.getById(INJECT_MAT_STORE, matId);
        if (!mat) return;
        if (deletemat) {
            await Storage.remove(INJECT_MAT_STORE, matId);
            UIUtils.toast('사출자재가 삭제되었습니다.', 'success');
        } else {
            const remainIds = (mat.productIds || []).filter(id => id !== productId);
            await Storage.update(INJECT_MAT_STORE, matId, { ...mat, productIds: remainIds });
            UIUtils.toast('연결이 해제되었습니다.', 'success');
        }
        UIUtils.closeModal();
        renderTabContent();
    }

    // ---- 사출자재 CSV 다운로드 / 일괄 업로드 ----
    function downloadInjectMatCSV() {
        const items = Storage.getAll(INJECT_MAT_STORE);
        const headers = INJECT_MAT_COLUMNS.map(c => c.label);
        const rows = items.length > 0 ?
            items.map(m => INJECT_MAT_COLUMNS.map(c => m[c.key] !== undefined ? m[c.key] : '')) : [Array(headers.length).fill('')];
        Storage.exportToCSV(headers, rows, '사출자재_정보');
        UIUtils.toast('CSV 다운로드 완료 (엑셀에서 편집 후 재업로드 하세요)', 'success');
    }

    function _parseInjectMatCSVLine(line, sep) {
        const result = [];
        let cur = '',
            inQ = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQ && line[i + 1] === '"') {
                    cur += '"';
                    i++;
                } else inQ = !inQ;
            } else if (ch === sep && !inQ) {
                result.push(cur.trim());
                cur = '';
            } else cur += ch;
        }
        result.push(cur.trim());
        return result;
    }

    function _parseInjectMatText(text) {
        const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
        if (!lines.length) return [];
        const sep = lines[0].includes('\t') ? '\t' : ',';
        const parsed = lines.map(l => _parseInjectMatCSVLine(l, sep));
        const hdrKw = ['차종', '생산처', '공급처', '사출품명', '컬러', '단가', '제작품목1', '제작품목2'];
        const first = parsed[0].map(c => c.toLowerCase());
        const isHeader = hdrKw.some(kw => first.includes(kw.toLowerCase()));
        const dataRows = isHeader ? parsed.slice(1) : parsed;
        return dataRows
            .filter(row => row.some(c => c !== ''))
            .map(row => ({
                carModel:        row[0] || '',
                supplier:        row[1] || '',
                injPartName:     row[2] || '',
                injColor:        row[3] || '',
                unitPrice:       row[4] || '',
                itemType:        row[5] || '',
                mfgProductName:  row[6] || '',
                mfgProductName2: row[7] || '',
                weight:          row[8] || '',
                rawMatName:      row[9] || '',
                rawMatColor:     row[10] || ''
            }))
            .filter(m => m.injPartName);
    }

    function _renderInjectMatUploadPreview(rows) {
        const box = document.getElementById('imUploadPreview');
        const btn = document.getElementById('imUploadConfirmBtn');
        if (!rows.length) {
            box.innerHTML = '<p style="color:var(--accent-red);padding:8px;">유효한 데이터가 없습니다. 열 순서를 확인해주세요.</p>';
            btn.style.display = 'none';
            return;
        }
        box.innerHTML = `
            <div style="margin-bottom:8px;font-size:0.85rem;color:var(--text-secondary);">
                총 <strong>${rows.length}건</strong> 인식됨
                <span style="color:var(--text-muted);font-size:0.78rem;">(사출품명 없는 행 제외됨)</span>
            </div>
            <div style="overflow-x:auto;max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;">
                <table style="width:100%;border-collapse:collapse;font-size:0.78rem;white-space:nowrap;">
                    <thead>
                        <tr style="background:var(--bg-secondary);position:sticky;top:0;">
                            ${INJECT_MAT_COLUMNS.map(c => `<th style="padding:5px 10px;text-align:left;color:var(--text-secondary);">${c.label}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(r => `
                            <tr style="border-top:1px solid var(--border);">
                                <td style="padding:4px 10px;">${r.carModel || '-'}</td>
                                <td style="padding:4px 10px;">${r.supplier || '-'}</td>
                                <td style="padding:4px 10px;font-weight:600;">${r.injPartName || '-'}</td>
                                <td style="padding:4px 10px;">${r.injColor || '-'}</td>
                                <td style="padding:4px 10px;text-align:right;">${r.unitPrice || '-'}</td>
                                <td style="padding:4px 10px;">${r.itemType || '-'}</td>
                                <td style="padding:4px 10px;">${r.mfgProductName || '-'}</td>
                                <td style="padding:4px 10px;">${r.mfgProductName2 || '-'}</td>
                                <td style="padding:4px 10px;text-align:right;">${r.weight || '-'}</td>
                                <td style="padding:4px 10px;">${r.rawMatName || '-'}</td>
                                <td style="padding:4px 10px;">${r.rawMatColor || '-'}</td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
        btn.style.display = '';
        window._imUploadRows = rows;
    }

    function openInjectMatUploadModal() {
        window._imUploadRows = [];
        const colGuide = INJECT_MAT_COLUMNS.map((c, i) =>
            `<span style="background:var(--bg-primary);border-radius:4px;padding:2px 6px;">${String.fromCharCode(65 + i)}: ${c.label}</span>`
        ).join(' ');

        UIUtils.showModal('사출 원재료 일괄 업로드', `
            <div style="background:var(--bg-secondary);border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:0.825rem;line-height:1.8;">
                <div style="font-weight:600;margin-bottom:6px;">📋 열 순서 (엑셀 A~K열, 총 11열)</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;">${colGuide}</div>
            </div>

            <div style="margin-bottom:4px;">
                <label class="form-label" style="margin-bottom:4px;">① CSV 파일 선택</label>
                <input type="file" id="imUploadFile" accept=".csv,.tsv,.txt"
                    class="form-input" style="padding:6px;"
                    onchange="SettingsModule.handleInjectMatUploadFile(this)">
            </div>

            <div style="text-align:center;color:var(--text-muted);padding:8px 0;font-size:0.85rem;">— 또는 —</div>

            <div style="margin-bottom:14px;">
                <label class="form-label" style="margin-bottom:4px;">② 엑셀에서 복사 후 붙여넣기 <span style="color:var(--text-muted);font-weight:400;">(헤더 포함 가능)</span></label>
                <textarea id="imUploadText" class="form-textarea" rows="7"
                    placeholder="엑셀에서 A~K열 범위 선택 → Ctrl+C → 여기서 Ctrl+V"
                    style="font-family:monospace;font-size:0.8rem;resize:vertical;"
                    oninput="SettingsModule.handleInjectMatUploadText()"></textarea>
            </div>

            <div id="imUploadPreview" style="margin-bottom:12px;"></div>

            <div id="imUploadOptions" style="display:none;padding:10px 14px;background:var(--bg-secondary);border-radius:8px;">
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.875rem;">
                    <input type="checkbox" id="imUploadReplace" style="width:16px;height:16px;">
                    <span>기존 사출자재 정보 전체 삭제 후 교체
                        <span style="color:var(--accent-red);font-size:0.78rem;display:block;margin-top:1px;">
                            ⚠️ 체크 안 하면 기존 데이터에 추가됩니다
                        </span>
                    </span>
                </label>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" id="imUploadConfirmBtn" style="display:none;"
                onclick="SettingsModule.confirmInjectMatUpload()">
                <span class="material-symbols-outlined">upload</span> 업로드 확인
            </button>
        `);
    }

    function handleInjectMatUploadFile(input) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            document.getElementById('imUploadText').value = '';
            const rows = _parseInjectMatText(e.target.result);
            _renderInjectMatUploadPreview(rows);
            document.getElementById('imUploadOptions').style.display = rows.length ? '' : 'none';
        };
        reader.readAsText(file, 'UTF-8');
    }

    function handleInjectMatUploadText() {
        const text = document.getElementById('imUploadText').value;
        if (!text.trim()) {
            document.getElementById('imUploadPreview').innerHTML = '';
            document.getElementById('imUploadConfirmBtn').style.display = 'none';
            document.getElementById('imUploadOptions').style.display = 'none';
            return;
        }
        const rows = _parseInjectMatText(text);
        _renderInjectMatUploadPreview(rows);
        document.getElementById('imUploadOptions').style.display = rows.length ? '' : 'none';
    }

    async function confirmInjectMatUpload() {
        const rows = window._imUploadRows || [];
        if (!rows.length) {
            UIUtils.toast('업로드할 데이터가 없습니다.', 'warning');
            return;
        }

        const doReplace = document.getElementById('imUploadReplace').checked;

        // 데이터 정제 및 ID 부여 (루프로 순차 처리 → ID 충돌 방지)
        const ts = new Date().toISOString();
        const newItems = [];
        let seq = 0;
        for (const r of rows) {
            if (!r.injPartName) continue;
            const item = { ...r };
            if (!item.id) item.id = Date.now().toString(36) + (++seq).toString(36).padStart(3,'0') + Math.random().toString(36).substr(2, 5);
            if (!item.createdAt) item.createdAt = ts;
            newItems.push(item);
        }

        if (!newItems.length) {
            UIUtils.toast('유효한 데이터(사출품명 있는 행)가 없습니다.', 'warning');
            return;
        }

        try {
            if (doReplace) {
                // 전체 교체: bulk API (DELETE + INSERT)
                await Storage.saveAll(INJECT_MAT_STORE, newItems);
            } else {
                // 개별 추가: API await 후 캐시 갱신
                const cacheArr = Storage.getAll(INJECT_MAT_STORE);
                for (const item of newItems) {
                    await ApiClient.save(INJECT_MAT_STORE, item);
                    cacheArr.push(item);
                }
            }

            // DB 최신 상태로 캐시 재동기화
            await Storage.refresh(INJECT_MAT_STORE);

            UIUtils.closeModal();
            UIUtils.toast(`${newItems.length}건 업로드 완료${doReplace ? ' (기존 데이터 교체)' : ' (기존 데이터에 추가)'}`, 'success');
            renderTabContent();
        } catch (e) {
            console.error('사출자재 업로드 실패:', e);
            UIUtils.toast('저장 실패: ' + e.message, 'error');
        }
    }

    // =====================================================
    // 불량 유형 탭 (사출 / 도장 / 레이져 / 인쇄 모두 한 화면에 표시)
    // =====================================================

    // 도장 불량으로 자동 재분류할 기준 이름 목록
    // (type 없이 저장된 기존 데이터 중 이 이름이면 → 'painting' 으로 재분류)
    const KNOWN_PAINTING_DEFECT_NAMES = new Set([
        '이물', '기포', '흘러내림', '핀홀', '긁힘', 'Peel Off',
        '색차', '오렌지 필', '미도장', '찍힘', '광택불량', '백화'
    ]);

    // ── 사출 불량 기본 데이터 (일반적인 사출 성형 불량 유형 10종)
    const DEFAULT_INJECTION_DEFECTS = [{
            name: '수축',
            description: '냉각 수축에 의한 표면 함몰 (Sink Mark)'
        },
        {
            name: '웰드라인',
            description: '두 수지 흐름 합류 지점의 선상 불량'
        },
        {
            name: '플래시(버)',
            description: '파팅라인·게이트 부위 수지 넘침'
        },
        {
            name: '변형(휨)',
            description: '성형 후 제품 뒤틀림·변형 (Warpage)'
        },
        {
            name: '미성형',
            description: '수지 미충전으로 성형 불완전 (Short Shot)'
        },
        {
            name: '크랙',
            description: '성형품 표면 또는 내부 균열'
        },
        {
            name: '에어마크',
            description: '공기 혼입에 의한 표면 은백색 불량'
        },
        {
            name: '플로우마크',
            description: '수지 흐름 방향의 표면 줄무늬 자국'
        },
        {
            name: '이물질혼입',
            description: '성형 중 이물질 혼입에 의한 불량'
        },
        {
            name: '색상불량',
            description: '컬러 배합 불균일 또는 변색'
        }
    ];

    // 기본 사출 불량 데이터 추가 (중복 이름 제외하고 누락된 항목만 추가)
    async function loadDefaultInjectionDefects() {
        const existing = Storage.getAll(DEFECTS_STORE) || [];
        const existingInjNames = new Set(
            existing.filter(d => d && (d.type === 'injection' || !d.type)).map(d => d.name)
        );

        const toAdd = DEFAULT_INJECTION_DEFECTS.filter(d => !existingInjNames.has(d.name));

        if (toAdd.length === 0) {
            UIUtils.toast('이미 모든 기본 사출 불량 유형이 등록되어 있습니다.', 'info');
            return;
        }

        try {
            for (const d of toAdd) {
                await Storage.add(DEFECTS_STORE, {
                    name: d.name,
                    description: d.description,
                    type: 'injection'
                });
            }
            UIUtils.toast(`기본 사출 불량 ${toAdd.length}건이 추가되었습니다.`, 'success');
            defectSubTab = 'injection';
            renderTabContent();
        } catch (err) {
            console.error('[기본 사출 불량 추가] 오류:', err);
            UIUtils.toast('추가 중 오류가 발생했습니다.', 'error');
        }
    }

    function switchDefectSubTab(subTab) {
        // 단일 화면 개편으로 인해 더 이상 사용되지 않음 (하위 호환성을 위해 빈 함수로 유지)
    }

    function renderDefectsTab(el) {
        if (!el) return;

        // ── 스마트 마이그레이션 (기존 logic 유지)
        try {
            const allDefects = Storage.getAll(DEFECTS_STORE) || [];
            allDefects.forEach(d => {
                if (!d || !d.id) return;
                if (!d.type) {
                    const correctType = KNOWN_PAINTING_DEFECT_NAMES.has(d.name) ? 'painting' : 'injection';
                    Storage.update(DEFECTS_STORE, d.id, {
                        type: correctType
                    }).catch(() => {});
                } else if (d.type === 'injection' && KNOWN_PAINTING_DEFECT_NAMES.has(d.name)) {
                    Storage.update(DEFECTS_STORE, d.id, {
                        type: 'painting'
                    }).catch(() => {});
                }
            });
        } catch (migErr) {}

        const defects = Storage.getAll(DEFECTS_STORE) || [];

        // 공정별 데이터 분류
        const categories = [{
                id: 'injection',
                title: '사출 불량',
                icon: 'precision_manufacturing',
                color: '#ea580c',
                bg: 'rgba(234,88,12,0.05)',
                desc: '사출 수입검사 사용'
            },
            {
                id: 'painting',
                title: '도장 불량',
                icon: 'format_paint',
                color: '#16a34a',
                bg: 'rgba(22,163,74,0.05)',
                desc: '도장 검사/집계 사용'
            },
            {
                id: 'laser',
                title: '레이져 불량',
                icon: 'flare',
                color: '#7c3aed',
                bg: 'rgba(124,58,237,0.05)',
                desc: '레이져 공정 불량'
            },
            {
                id: 'printing',
                title: '인쇄 불량',
                icon: 'print',
                color: '#0891b2',
                bg: 'rgba(8,145,178,0.05)',
                desc: '인쇄 공정 불량'
            }
        ];

        el.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 20px;">
                
                <!-- ▌ 상단 요약 카드 -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
                    ${categories.map(cat => {
            const count = defects.filter(d => d.type === cat.id).length;
            return `
                            <div style="padding:16px; background:#fff; border-radius:12px; border:1px solid var(--border-color); display:flex; align-items:center; gap:12px; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                                <div style="width:40px; height:40px; border-radius:10px; background:${cat.bg}; display:flex; align-items:center; justify-content:center;">
                                    <span class="material-symbols-outlined" style="color:${cat.color}; font-size:22px;">${cat.icon}</span>
                                </div>
                                <div>
                                    <div style="font-size:0.8rem; color:var(--text-muted); font-weight:500;">${cat.title}</div>
                                    <div style="font-size:1.4rem; font-weight:800; color:${cat.color}; line-height:1.2;">${count} <span style="font-size:0.8rem; font-weight:400; color:var(--text-muted);">건</span></div>
                                </div>
                            </div>
                        `;
        }).join('')}
                </div>

                <!-- ▌ 공정별 목록 섹션 (2열 그리드) -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px;">
                    ${categories.map(cat => {
            const list = defects.filter(d => d.type === cat.id);
            return `
                            <div class="card" style="margin:0; display:flex; flex-direction:column; border-top: 4px solid ${cat.color};">
                                <div class="card-header" style="padding:12px 16px; background:var(--bg-secondary);">
                                    <div>
                                        <h5 style="margin:0; font-size:1rem; display:flex; align-items:center; gap:8px;">
                                            <span class="material-symbols-outlined" style="font-size:18px; color:${cat.color};">${cat.icon}</span>
                                            ${cat.title}
                                            <span style="font-size:0.8rem; font-weight:400; color:var(--text-muted);">(${list.length}건)</span>
                                        </h5>
                                        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">${cat.desc}</div>
                                    </div>
                                    <div style="display:flex; gap:6px;">
                                        ${cat.id === 'injection' ? `
                                            <button class="btn btn-sm btn-outline" style="font-size:0.75rem; padding:2px 8px; color:${cat.color}; border-color:${cat.color};" onclick="SettingsModule.loadDefaultInjectionDefects()">
                                                <span class="material-symbols-outlined" style="font-size:14px;">auto_fix_high</span> 기본값
                                            </button>
                                        ` : ''}
                                        <button class="btn btn-sm" style="background:${cat.color}; color:#fff; border:none; padding:2px 10px; font-size:0.75rem;" onclick="SettingsModule.openAddDefectModal('${cat.id}')">
                                            추가
                                        </button>
                                    </div>
                                </div>
                                <div class="card-body" style="padding:12px; max-height:400px; overflow-y:auto; background:var(--bg-primary);">
                                    ${list.length === 0 ? `
                                        <div style="text-align:center; padding:30px; border:1px dashed var(--border-color); border-radius:8px; color:var(--text-muted); font-size:0.85rem;">
                                            등록된 데이터가 없습니다.
                                        </div>
                                    ` : `
                                        <div style="display:grid; gap:8px;">
                                            ${list.map((d, i) => `
                                                <div style="display:flex; align-items:center; justify-content:space-between; padding:8px 12px; background:#fff; border:1px solid var(--border-color); border-radius:8px; transition:all 0.1s;">
                                                    <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                                                        <span style="font-size:0.75rem; font-weight:700; color:var(--text-muted); width:18px;">${i + 1}</span>
                                                        <div style="min-width:0;">
                                                            <div style="font-weight:600; font-size:0.85rem; color:var(--text-primary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${(d.name || '').replace(/</g, '&lt;')}</div>
                                                            ${d.description ? `<div style="font-size:0.75rem; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${(d.description || '').replace(/</g, '&lt;')}</div>` : ''}
                                                        </div>
                                                    </div>
                                                    <div style="display:flex; gap:4px; flex-shrink:0;">
                                                        <button class="btn btn-sm btn-outline" style="padding:2px 6px; font-size:0.7rem;" onclick="SettingsModule.editDefect('${d.id}')">수정</button>
                                                        <button class="btn btn-sm btn-danger" style="padding:2px 6px; font-size:0.7rem;" onclick="SettingsModule.removeDefect('${d.id}')">삭제</button>
                                                    </div>
                                                </div>
                                            `).join('')}
                                        </div>
                                    `}
                                </div>
                            </div>
                        `;
        }).join('')}
                </div>
            </div>
        `;
    }

    function openAddDefectModal(initialType) {
        const defaultType = initialType || 'injection';

        UIUtils.showModal('불량 유형 추가', `
            <div class="form-group">
                <label class="form-label">구분 <span style="color:var(--accent-red)">*</span></label>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:8px;">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 10px;border-radius:6px;border:2px solid ${defaultType === 'injection' ? '#ea580c' : 'var(--border-color)'};background:${defaultType === 'injection' ? 'rgba(234,88,12,0.06)' : 'transparent'}" id="defectTypeLabel_injection">
                        <input type="radio" name="defectType" value="injection" ${defaultType === 'injection' ? 'checked' : ''}
                            onchange="updateDefectModalStyles('injection')">
                        <span class="material-symbols-outlined" style="font-size:16px;color:#ea580c;">precision_manufacturing</span>
                        <span style="font-weight:600; font-size:0.85rem; color:#ea580c;">사출</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 10px;border-radius:6px;border:2px solid ${defaultType === 'painting' ? '#16a34a' : 'var(--border-color)'};background:${defaultType === 'painting' ? 'rgba(22,163,74,0.06)' : 'transparent'}" id="defectTypeLabel_painting">
                        <input type="radio" name="defectType" value="painting" ${defaultType === 'painting' ? 'checked' : ''}
                            onchange="updateDefectModalStyles('painting')">
                        <span class="material-symbols-outlined" style="font-size:16px;color:#16a34a;">format_paint</span>
                        <span style="font-weight:600; font-size:0.85rem; color:#16a34a;">도장</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 10px;border-radius:6px;border:2px solid ${defaultType === 'laser' ? '#7c3aed' : 'var(--border-color)'};background:${defaultType === 'laser' ? 'rgba(124,58,237,0.06)' : 'transparent'}" id="defectTypeLabel_laser">
                        <input type="radio" name="defectType" value="laser" ${defaultType === 'laser' ? 'checked' : ''}
                            onchange="updateDefectModalStyles('laser')">
                        <span class="material-symbols-outlined" style="font-size:16px;color:#7c3aed;">flare</span>
                        <span style="font-weight:600; font-size:0.85rem; color:#7c3aed;">레이져</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 10px;border-radius:6px;border:2px solid ${defaultType === 'printing' ? '#0891b2' : 'var(--border-color)'};background:${defaultType === 'printing' ? 'rgba(8,145,178,0.06)' : 'transparent'}" id="defectTypeLabel_printing">
                        <input type="radio" name="defectType" value="printing" ${defaultType === 'printing' ? 'checked' : ''}
                            onchange="updateDefectModalStyles('printing')">
                        <span class="material-symbols-outlined" style="font-size:16px;color:#0891b2;">print</span>
                        <span style="font-weight:600; font-size:0.85rem; color:#0891b2;">인쇄</span>
                    </label>
                </div>
                <script>
                    function updateDefectModalStyles(type) {
                        const types = {
                            injection: { color: '#ea580c', bg: 'rgba(234,88,12,0.06)' },
                            painting: { color: '#16a34a', bg: 'rgba(22,163,74,0.06)' },
                            laser: { color: '#7c3aed', bg: 'rgba(124,58,237,0.06)' },
                            printing: { color: '#0891b2', bg: 'rgba(8,145,178,0.06)' }
                        };
                        Object.keys(types).forEach(k => {
                            const el = document.getElementById('defectTypeLabel_' + k) || document.getElementById('editDefectTypeLabel_' + k);
                            if (el) {
                                if (k === type) {
                                    el.style.borderColor = types[k].color;
                                    el.style.background = types[k].bg;
                                } else {
                                    el.style.borderColor = 'var(--border-color)';
                                    el.style.background = 'transparent';
                                }
                            }
                        });
                    }
                </script>
            </div>
            <div class="form-group">
                <label class="form-label">불량 유형명 <span style="color:var(--accent-red)">*</span></label>
                <input type="text" class="form-input" id="addDefectName" placeholder="예: 레이져 미가공, 인쇄 번짐" autofocus>
            </div>
            <div class="form-group">
                <label class="form-label">설명 <span style="color:var(--text-muted);font-weight:400;">(선택)</span></label>
                <input type="text" class="form-input" id="addDefectDesc" placeholder="간단한 설명">
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SettingsModule.saveDefect()">추가</button>
        `);
    }

    async function saveDefect() {
        const nameEl = document.getElementById('addDefectName');
        const descEl = document.getElementById('addDefectDesc');
        const name = nameEl ? nameEl.value.trim() : '';
        const description = descEl ? descEl.value.trim() : '';
        const typeRadios = document.querySelectorAll('input[name="defectType"]:checked');
        const type = typeRadios.length > 0 ? typeRadios[0].value : 'injection';
        const typeNames = {
            injection: '사출',
            painting: '도장',
            laser: '레이져',
            printing: '인쇄'
        };
        const typeName = typeNames[type] || '기타';

        if (!name) {
            UIUtils.toast('불량 유형명을 입력하세요.', 'warning');
            if (nameEl) nameEl.focus();
            return;
        }

        // ── 동일 구분 내 중복 이름 검사
        const existing = Storage.getAll(DEFECTS_STORE) || [];
        const isDuplicate = existing.some(d => d && d.type === type && (d.name || '').trim() === name);
        if (isDuplicate) {
            UIUtils.toast(`"${name}"은 이미 등록된 ${typeName} 불량 유형입니다.`, 'warning');
            if (nameEl) nameEl.focus();
            return;
        }

        try {
            await Storage.add(DEFECTS_STORE, {
                name,
                description,
                type
            });
            UIUtils.closeModal();
            UIUtils.toast(`${typeName} 불량 유형 "${name}"이 추가되었습니다.`, 'success');
            renderTabContent();
        } catch (err) {
            console.error('[불량유형 추가] 오류:', err);
            UIUtils.toast('추가에 실패했습니다. 다시 시도해주세요.', 'error');
        }
    }

    function editDefect(id) {
        const d = Storage.getById(DEFECTS_STORE, id);
        if (!d) {
            UIUtils.toast('해당 불량 유형을 찾을 수 없습니다.', 'error');
            return;
        }
        const safeType = d.type === 'painting' ? 'painting' : 'injection';
        const safeName = (d.name || '').replace(/"/g, '&quot;');
        const safeDesc = (d.description || '').replace(/"/g, '&quot;');

        UIUtils.showModal('불량 유형 수정', `
            <div class="form-group">
                <label class="form-label">구분 <span style="color:var(--accent-red)">*</span></label>
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:8px;">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 10px;border-radius:6px;border:2px solid ${safeType === 'injection' ? '#ea580c' : 'var(--border-color)'};background:${safeType === 'injection' ? 'rgba(234,88,12,0.06)' : 'transparent'}" id="editDefectTypeLabel_injection">
                        <input type="radio" name="editDefectType" value="injection" ${safeType === 'injection' ? 'checked' : ''}
                            onchange="updateDefectModalStyles('injection')">
                        <span class="material-symbols-outlined" style="font-size:16px;color:#ea580c;">precision_manufacturing</span>
                        <span style="font-weight:600; font-size:0.85rem; color:#ea580c;">사출</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 10px;border-radius:6px;border:2px solid ${safeType === 'painting' ? '#16a34a' : 'var(--border-color)'};background:${safeType === 'painting' ? 'rgba(22,163,74,0.06)' : 'transparent'}" id="editDefectTypeLabel_painting">
                        <input type="radio" name="editDefectType" value="painting" ${safeType === 'painting' ? 'checked' : ''}
                            onchange="updateDefectModalStyles('painting')">
                        <span class="material-symbols-outlined" style="font-size:16px;color:#16a34a;">format_paint</span>
                        <span style="font-weight:600; font-size:0.85rem; color:#16a34a;">도장</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 10px;border-radius:6px;border:2px solid ${safeType === 'laser' ? '#7c3aed' : 'var(--border-color)'};background:${safeType === 'laser' ? 'rgba(124,58,237,0.06)' : 'transparent'}" id="editDefectTypeLabel_laser">
                        <input type="radio" name="editDefectType" value="laser" ${safeType === 'laser' ? 'checked' : ''}
                            onchange="updateDefectModalStyles('laser')">
                        <span class="material-symbols-outlined" style="font-size:16px;color:#7c3aed;">flare</span>
                        <span style="font-weight:600; font-size:0.85rem; color:#7c3aed;">레이져</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 10px;border-radius:6px;border:2px solid ${safeType === 'printing' ? '#0891b2' : 'var(--border-color)'};background:${safeType === 'printing' ? 'rgba(8,145,178,0.06)' : 'transparent'}" id="editDefectTypeLabel_printing">
                        <input type="radio" name="editDefectType" value="printing" ${safeType === 'printing' ? 'checked' : ''}
                            onchange="updateDefectModalStyles('printing')">
                        <span class="material-symbols-outlined" style="font-size:16px;color:#0891b2;">print</span>
                        <span style="font-weight:600; font-size:0.85rem; color:#0891b2;">인쇄</span>
                    </label>
                </div>
                <script>
                    if(typeof updateDefectModalStyles === 'undefined') {
                        function updateDefectModalStyles(type) {
                            const types = {
                                injection: { color: '#ea580c', bg: 'rgba(234,88,12,0.06)' },
                                painting: { color: '#16a34a', bg: 'rgba(22,163,74,0.06)' },
                                laser: { color: '#7c3aed', bg: 'rgba(124,58,237,0.06)' },
                                printing: { color: '#0891b2', bg: 'rgba(8,145,178,0.06)' }
                            };
                            Object.keys(types).forEach(k => {
                                ['defectTypeLabel_', 'editDefectTypeLabel_'].forEach(prefix => {
                                    const el = document.getElementById(prefix + k);
                                    if (el) {
                                        if (k === type) {
                                            el.style.borderColor = types[k].color;
                                            el.style.background = types[k].bg;
                                        } else {
                                            el.style.borderColor = 'var(--border-color)';
                                            el.style.background = 'transparent';
                                        }
                                    }
                                });
                            });
                        }
                    }
                </script>
            </div>
            <div class="form-group">
                <label class="form-label">불량 유형명 <span style="color:var(--accent-red)">*</span></label>
                <input type="text" class="form-input" id="editDefectName" value="${safeName}">
            </div>
            <div class="form-group">
                <label class="form-label">설명 <span style="color:var(--text-muted);font-weight:400;">(선택)</span></label>
                <input type="text" class="form-input" id="editDefectDesc" value="${safeDesc}">
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SettingsModule.updateDefect('${id}')">저장</button>
        `);
    }

    async function updateDefect(id) {
        const nameEl = document.getElementById('editDefectName');
        const descEl = document.getElementById('editDefectDesc');
        const name = nameEl ? nameEl.value.trim() : '';
        const description = descEl ? descEl.value.trim() : '';
        const typeRadios = document.querySelectorAll('input[name="editDefectType"]:checked');
        const type = typeRadios.length > 0 ? typeRadios[0].value : 'injection';
        const typeNames = {
            injection: '사출',
            painting: '도장',
            laser: '레이져',
            printing: '인쇄'
        };
        const typeName = typeNames[type] || '기타';

        if (!name) {
            UIUtils.toast('불량 유형명을 입력하세요.', 'warning');
            if (nameEl) nameEl.focus();
            return;
        }

        // ── 동일 구분 내 중복 이름 검사 (자신 제외)
        const existing = Storage.getAll(DEFECTS_STORE) || [];
        const isDuplicate = existing.some(d => d && d.id !== id && d.type === type && (d.name || '').trim() === name);
        if (isDuplicate) {
            UIUtils.toast(`"${name}"은 이미 등록된 ${typeName} 불량 유형입니다.`, 'warning');
            if (nameEl) nameEl.focus();
            return;
        }

        try {
            await Storage.update(DEFECTS_STORE, id, {
                name,
                description,
                type
            });
            UIUtils.closeModal();
            UIUtils.toast(`"${name}" 불량 유형이 수정되었습니다.`, 'success');
            renderTabContent();
        } catch (err) {
            console.error('[불량유형 수정] 오류:', err);
            UIUtils.toast('수정에 실패했습니다. 다시 시도해주세요.', 'error');
        }
    }

    function removeDefect(id) {
        const d = Storage.getById(DEFECTS_STORE, id);
        if (!d) {
            UIUtils.toast('해당 불량 유형을 찾을 수 없습니다.', 'error');
            return;
        }
        const safeName = d.name || '(이름 없음)';
        const typeNames = {
            injection: '사출',
            painting: '도장',
            laser: '레이져',
            printing: '인쇄'
        };
        const typeName = typeNames[d.type] || '기타';

        UIUtils.confirm(
            `"${safeName}" (${typeName} 불량) 유형을 삭제하시겠습니까?\n\n※ 이미 기록된 검사 데이터의 유형명은 유지됩니다.`,
            async () => {
                try {
                    await Storage.remove(DEFECTS_STORE, id);
                    UIUtils.toast(`"${safeName}" 불량 유형이 삭제되었습니다.`, 'success');
                    renderTabContent();
                } catch (err) {
                    console.error('[불량유형 삭제] 오류:', err);
                    UIUtils.toast('삭제에 실패했습니다. 다시 시도해주세요.', 'error');
                }
            }
        );
    }
    // =====================================================
    // 원재료 관리 탭 (사내 생산용)
    // =====================================================
    const RAW_MAT_STORE = DB.STORES.RAW_MATERIALS;

    const RAW_MAT_COLUMNS = [
        { key: 'supplier',    label: '공급처'   },
        { key: 'matName',     label: '원재료명' },
        { key: 'color',       label: '컬러'     },
        { key: 'unitPrice',   label: '단가'     },
        { key: 'usedFor',     label: '사용품목' }
    ];

    // 원재료 데이터 따옴표 자동 정리 (CSV 잘못 파싱된 데이터 복구)
    // 정리한 경우 true 반환, 이미 깨끗하면 false 반환
    async function _cleanRawMatQuotes() {
        const stripQ = v => typeof v === 'string' ? v.replace(/^"+|"+$/g, '').trim() : v;
        const items = Storage.getAll(RAW_MAT_STORE) || [];
        const hasDirty = items.some(m =>
            ['supplier','matName','color','packLabel','usedFor'].some(k =>
                typeof m[k] === 'string' && /^"|"$/.test(m[k])
            )
        );
        if (!hasDirty) return false;

        const cleaned = items.map(m => ({
            ...m,
            supplier:  stripQ(m.supplier),
            matName:   stripQ(m.matName),
            color:     stripQ(m.color),
            packLabel: stripQ(m.packLabel),
            usedFor:   stripQ(m.usedFor)
        }));
        await Storage.saveAll(RAW_MAT_STORE, cleaned);
        await Storage.refresh(RAW_MAT_STORE);
        UIUtils.toast(`원재료 데이터 따옴표 정리 완료 (${cleaned.length}건)`, 'success');
        return true;
    }

    function renderRawMatTab(el) {
        // 따옴표 잔존 데이터 감지 시 자동 정리 후 재렌더
        _cleanRawMatQuotes().then(cleaned => {
            if (cleaned) renderRawMatTab(el);
        }).catch(() => {});

        const items = Storage.getAll(RAW_MAT_STORE) || [];
        const uniqueSuppliers = [...new Set(items.map(m => m.supplier).filter(Boolean))].sort();

        el.innerHTML = `
            <div class="card">
                <div class="card-header" style="flex-wrap:wrap;gap:10px;">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <h4 style="margin:0;">
                            <span class="material-symbols-outlined">science</span>
                            원재료 목록 (<span id="rawMatCount">${items.length}</span>건)
                        </h4>
                        <select id="rawMatSupplierFilter" class="form-input" style="width:150px;padding:4px 8px;"
                                onchange="SettingsModule.filterRawMatList()">
                            <option value="">전체 공급처</option>
                            ${uniqueSuppliers.map(s => `<option value="${s}">${s}</option>`).join('')}
                        </select>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button class="btn btn-outline" onclick="SettingsModule.downloadRawMatCSV()">
                            <span class="material-symbols-outlined">download</span> CSV 다운로드
                        </button>
                        <button class="btn btn-outline" onclick="SettingsModule.openUploadRawMatModal()">
                            <span class="material-symbols-outlined">upload</span> CSV 업로드
                        </button>
                        <button class="btn btn-primary" onclick="SettingsModule.openAddRawMatModal()">
                            <span class="material-symbols-outlined">add</span> 원재료 추가
                        </button>
                    </div>
                </div>
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>No</th>
                                    <th>공급처</th>
                                    <th>원재료명</th>
                                    <th>컬러</th>
                                    <th style="text-align:center">포장 단위</th>
                                    <th style="text-align:right">단가 (원)</th>
                                    <th>사용품목</th>
                                    <th>작업</th>
                                </tr>
                            </thead>
                            <tbody id="rawMatTbody">
                                ${_renderRawMatRows(items)}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    function _renderRawMatRows(items) {
        if (!items.length) {
            return `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">등록된 원재료가 없습니다.</td></tr>`;
        }
        return items.map((m, i) => `
            <tr data-supplier="${m.supplier || ''}">
                <td>${i + 1}</td>
                <td>${m.supplier || '-'}</td>
                <td><strong>${m.matName || '-'}</strong></td>
                <td>${m.color || '-'}</td>
                <td style="text-align:center;">
                    <span style="font-weight:600;">${m.packLabel || (m.packKg ? m.packKg + 'KG/포' : '25KG/포')}</span>
                </td>
                <td style="text-align:right;">${m.unitPrice ? Number(m.unitPrice).toLocaleString() : '-'}</td>
                <td>
                    <div style="display:flex;flex-wrap:wrap;gap:3px;">
                        ${(m.usedFor || '')
                            .split(/[,，、]/)
                            .map(s => s.trim())
                            .filter(Boolean)
                            .map(s => `<span class="badge badge-info" style="font-size:0.72rem;">${s}</span>`)
                            .join('') || '<span style="color:var(--text-muted);">-</span>'}
                    </div>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline" onclick="SettingsModule.editRawMat('${m.id}')">수정</button>
                    <button class="btn btn-sm btn-danger" onclick="SettingsModule.removeRawMat('${m.id}')">삭제</button>
                </td>
            </tr>
        `).join('');
    }

    function filterRawMatList() {
        const sel = document.getElementById('rawMatSupplierFilter');
        if (!sel) return;
        const selected = sel.value;
        const tbody = document.getElementById('rawMatTbody');
        if (!tbody) return;
        let count = 0;
        tbody.querySelectorAll('tr').forEach(row => {
            const show = !selected || (row.dataset.supplier || '') === selected;
            row.style.display = show ? '' : 'none';
            if (show) count++;
        });
        const countEl = document.getElementById('rawMatCount');
        if (countEl) countEl.textContent = count;
    }

    function _rawMatFormHTML(m = {}) {
        const v = k => m[k] !== undefined ? m[k] : '';

        // 사출자재(injPartName) 기준으로 사용품목 후보 추출 — 차종+사출품명 그룹
        const injMats = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        // { label: '사출품명', carModel, injPartName } 리스트 (중복 제거)
        const usedForOptions = [...new Map(
            injMats
                .filter(im => im.injPartName)
                .map(im => [`${im.carModel || ''}||${im.injPartName}`, {
                    key:      im.injPartName,
                    carModel: im.carModel || '',
                    label:    im.carModel ? `[${im.carModel}] ${im.injPartName}` : im.injPartName
                }])
        ).values()].sort((a, b) => a.label.localeCompare(b.label));

        // 기존 선택값 파싱
        const selected = (v('usedFor') || '').split(/[,，、]/).map(s => s.trim()).filter(Boolean);

        return `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">공급처</label>
                    <input type="text" class="form-input" id="rmSupplier" placeholder="예: 삼양사" value="${v('supplier')}">
                </div>
                <div class="form-group">
                    <label class="form-label">원재료명 <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="rmMatName" placeholder="예: 30**U-***AXP" value="${v('matName')}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">컬러</label>
                    <input type="text" class="form-input" id="rmColor" placeholder="예: GRAY, WHITE" value="${v('color')}">
                </div>
                <div class="form-group">
                    <label class="form-label">단가 (원)</label>
                    <input type="number" class="form-input" id="rmUnitPrice" placeholder="0" min="0" value="${v('unitPrice')}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">포장 단위 (KG/포)
                        <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;margin-left:6px;">기본: 25 KG = 1포</span>
                    </label>
                    <input type="number" class="form-input" id="rmPackKg" placeholder="25" min="0.1" step="0.1"
                        value="${v('packKg') !== '' ? v('packKg') : '25'}"
                        style="text-align:right;">
                </div>
                <div class="form-group">
                    <label class="form-label">포장 단위 표기</label>
                    <input type="text" class="form-input" id="rmPackLabel" placeholder="예: 25KG/포, 20KG/BOX"
                        value="${v('packLabel') || '25KG/포'}">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">사용품목
                    <span style="font-size:0.78rem;color:var(--text-muted);font-weight:400;margin-left:6px;">사출자재에서 검색 후 선택 (복수 가능)</span>
                </label>
                ${usedForOptions.length > 0 ? (() => {
                    const carModels = UIUtils.sortCarModels(usedForOptions.map(o => o.carModel));
                    return `
                <div style="display:flex;gap:8px;margin-bottom:6px;align-items:center;">
                    <select id="rmCarModelFilter" class="form-select" style="width:130px;padding:5px 8px;font-size:0.82rem;flex-shrink:0;"
                        onchange="SettingsModule._filterRawMatOptions()">
                        <option value="">전체 차종</option>
                        ${carModels.map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                    <div style="position:relative;flex:1;">
                        <span class="material-symbols-outlined"
                            style="position:absolute;left:8px;top:50%;transform:translateY(-50%);font-size:16px;color:var(--text-muted);pointer-events:none;">
                            search
                        </span>
                        <input type="text" class="form-input" id="rmUsedForSearch"
                            placeholder="사출품명 검색..."
                            style="padding-left:30px;"
                            oninput="SettingsModule._filterRawMatOptions()">
                    </div>
                </div>
                <div id="rmUsedForList"
                    style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;padding:8px;margin-bottom:6px;background:var(--bg-secondary);
                           display:grid;grid-template-columns:repeat(3,1fr);gap:2px 8px;align-items:start;">
                    ${usedForOptions.map(opt => `
                        <label class="rm-opt-row"
                            style="display:flex;align-items:center;gap:5px;padding:4px 6px;cursor:pointer;font-size:0.8rem;border-radius:4px;
                                   white-space:nowrap;overflow:hidden;min-width:0;"
                            title="${opt.label}"
                            data-label="${opt.label.toLowerCase()}"
                            data-carmodel="${(opt.carModel || '').toLowerCase()}">
                            <input type="checkbox" value="${opt.key}"
                                style="flex-shrink:0;"
                                ${selected.includes(opt.key) ? 'checked' : ''}
                                onchange="SettingsModule._syncRawMatUsedFor()">
                            <span style="color:var(--accent-blue);font-size:0.7rem;flex-shrink:0;font-weight:600;">${opt.carModel ? opt.carModel : ''}</span>
                            <span style="overflow:hidden;text-overflow:ellipsis;">${opt.key}</span>
                        </label>
                    `).join('')}
                </div>`;
                })() : `
                <div style="padding:8px;color:var(--text-muted);font-size:0.85rem;border:1px solid var(--border);border-radius:6px;margin-bottom:6px;">
                    사출자재 목록이 없습니다. 먼저 사출자재를 등록하세요.
                </div>`}
                <div style="display:flex;align-items:center;gap:6px;margin-top:4px;">
                    <span class="material-symbols-outlined" style="font-size:15px;color:var(--accent-blue);">check_circle</span>
                    <span id="rmUsedForCount" style="font-size:0.8rem;color:var(--accent-blue);font-weight:600;">
                        ${selected.length > 0 ? selected.length + '개 선택됨' : '선택 없음'}
                    </span>
                </div>
                <input type="hidden" id="rmUsedFor" value="${v('usedFor')}">
            </div>
        `;
    }

    function _filterRawMatOptions() {
        const kw  = ((document.getElementById('rmUsedForSearch') || {}).value || '').toLowerCase().trim();
        const car = ((document.getElementById('rmCarModelFilter') || {}).value || '').toLowerCase().trim();
        const list = document.getElementById('rmUsedForList');
        if (!list) return;
        list.querySelectorAll('.rm-opt-row').forEach(row => {
            const label    = row.dataset.label    || '';
            const rowCar   = row.dataset.carmodel || '';
            const kwMatch  = !kw  || label.includes(kw);
            const carMatch = !car || rowCar === car;
            row.style.display = (kwMatch && carMatch) ? '' : 'none';
        });
    }

    function _syncRawMatUsedFor() {
        const list = document.getElementById('rmUsedForList');
        if (!list) return;
        const vals = Array.from(list.querySelectorAll('input[type=checkbox]:checked'))
            .map(c => c.value).filter(Boolean);
        const hidden = document.getElementById('rmUsedFor');
        if (hidden) hidden.value = vals.join(', ');
        const countEl = document.getElementById('rmUsedForCount');
        if (countEl) countEl.textContent = vals.length > 0 ? vals.length + '개 선택됨' : '선택 없음';
    }

    function _collectRawMatForm() {
        const g = id => (document.getElementById(id) || {}).value || '';
        const packKgRaw = g('rmPackKg').trim();
        return {
            supplier:   g('rmSupplier').trim(),
            matName:    g('rmMatName').trim(),
            color:      g('rmColor').trim(),
            unitPrice:  g('rmUnitPrice').trim(),
            usedFor:    g('rmUsedFor').trim(),
            packKg:     packKgRaw !== '' ? Number(packKgRaw) : 25,
            packLabel:  g('rmPackLabel').trim() || '25KG/포'
        };
    }

    function openAddRawMatModal() {
        UIUtils.showModal('원재료 추가', _rawMatFormHTML(), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SettingsModule.saveRawMat()">추가</button>
        `);
    }

    async function saveRawMat() {
        const data = _collectRawMatForm();
        if (!data.matName) {
            UIUtils.toast('원재료명은 필수입니다.', 'warning');
            return;
        }
        await Storage.add(RAW_MAT_STORE, data);
        UIUtils.closeModal();
        UIUtils.toast('원재료가 추가되었습니다.', 'success');
        renderTabContent();
    }

    function editRawMat(id) {
        const m = Storage.getById(RAW_MAT_STORE, id);
        if (!m) return;
        UIUtils.showModal('원재료 수정', _rawMatFormHTML(m), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SettingsModule.updateRawMat('${id}')">저장</button>
        `);
    }

    async function updateRawMat(id) {
        const data = _collectRawMatForm();
        if (!data.matName) {
            UIUtils.toast('원재료명은 필수입니다.', 'warning');
            return;
        }
        await Storage.update(RAW_MAT_STORE, id, data);
        UIUtils.closeModal();
        UIUtils.toast('수정되었습니다.', 'success');
        renderTabContent();
    }

    function removeRawMat(id) {
        UIUtils.confirm('이 원재료를 삭제하시겠습니까?', async () => {
            await Storage.remove(RAW_MAT_STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            renderTabContent();
        });
    }

    function downloadRawMatCSV() {
        const items = Storage.getAll(RAW_MAT_STORE);
        if (!items.length) { UIUtils.toast('데이터가 없습니다.', 'warning'); return; }
        const headers = RAW_MAT_COLUMNS.map(c => c.label);
        const rows = items.map(m => RAW_MAT_COLUMNS.map(c => m[c.key] !== undefined ? m[c.key] : ''));
        Storage.exportToCSV(headers, rows, '원재료_정보');
        UIUtils.toast('CSV 다운로드 완료', 'success');
    }

    function openUploadRawMatModal() {
        const footer = `
            <button class="btn btn-outline" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SettingsModule.uploadRawMatCSV()">업로드</button>
        `;

        const body = `
            <p style="margin-bottom:15px; color: var(--text-muted);">
                CSV 파일을 선택하여 원재료를 일괄 업로드합니다.<br>
                <strong>헤더:</strong> 공급처, 원재료명, 컬러, 포장 단위, 단가 (원), 사용품목
            </p>
            <div style="border: 2px dashed var(--border-color); padding: 20px; border-radius: 8px; text-align: center;">
                <input type="file" id="rawMatCSVFile" accept=".csv" style="cursor: pointer;">
            </div>
            <div style="margin-top:12px;padding:10px 14px;background:var(--bg-secondary);border-radius:8px;">
                <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:0.875rem;">
                    <input type="checkbox" id="rawMatUploadReplace" style="width:16px;height:16px;">
                    <span>기존 원재료 정보 전체 삭제 후 교체
                        <span style="color:var(--accent-red);font-size:0.78rem;display:block;margin-top:1px;">
                            ⚠️ 체크 안 하면 기존 데이터에 추가됩니다
                        </span>
                    </span>
                </label>
            </div>
            <div id="uploadPreview" style="margin-top: 15px; display: none;">
                <p style="font-weight: 600; margin-bottom: 10px;">업로드 예정: <span id="previewCount">0</span>개</p>
                <div style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 4px;">
                    <table class="data-table" style="width: 100%; margin: 0;">
                        <thead>
                            <tr>
                                <th>공급처</th>
                                <th>원재료명</th>
                                <th>컬러</th>
                            </tr>
                        </thead>
                        <tbody id="previewTbody"></tbody>
                    </table>
                </div>
            </div>
        `;

        UIUtils.showModal('원재료 CSV 업로드', body, footer);

        // 파일 선택 이벤트
        document.getElementById('rawMatCSVFile').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const csv = event.target.result;
                    const lines = csv.split('\n').map(l => l.trim()).filter(Boolean);

                    if (lines.length < 2) {
                        UIUtils.toast('파일이 비어있습니다.', 'error');
                        return;
                    }

                    // 따옴표 제거 헬퍼
                    const unq = v => (v || '').trim().replace(/^"+|"+$/g, '').trim();
                    const headerLine = lines[0].split(',');
                    const data = lines.slice(1).map(line => {
                        const cells = line.split(',');
                        return {
                            supplier: unq(cells[0]),
                            matName: unq(cells[1]),
                            color: unq(cells[2]),
                            packKg: unq(cells[3]) || '25',
                            unitPrice: unq(cells[4]) || '0',
                            usedFor: unq(cells[5])
                        };
                    });

                    // 미리보기 표시
                    const preview = document.getElementById('uploadPreview');
                    const tbody = document.getElementById('previewTbody');
                    const count = document.getElementById('previewCount');

                    tbody.innerHTML = data.slice(0, 10).map(d => `
                        <tr>
                            <td>${d.supplier || '-'}</td>
                            <td>${d.matName || '-'}</td>
                            <td>${d.color || '-'}</td>
                        </tr>
                    `).join('');

                    count.textContent = data.length;
                    preview.style.display = 'block';

                    // 데이터를 전역 변수로 저장 (업로드 버튼에서 사용)
                    window._rawMatUploadData = data;

                } catch (err) {
                    UIUtils.toast('CSV 파일 오류: ' + err.message, 'error');
                }
            };
            reader.readAsText(file);
        });
    }

    async function uploadRawMatCSV() {
        if (!window._rawMatUploadData || window._rawMatUploadData.length === 0) {
            UIUtils.toast('파일을 선택해주세요.', 'warning');
            return;
        }

        const data = window._rawMatUploadData;
        const doReplace = (document.getElementById('rawMatUploadReplace') || {}).checked || false;
        const ts = new Date().toISOString();

        // 데이터 정제 및 ID 부여
        const newItems = [];
        let errorCount = 0;
        data.forEach((item, idx) => {
            if (!item.matName) {
                console.error(`CSV 행 ${idx + 1}: 원재료명 없음 — 건너뜀`);
                errorCount++;
                return;
            }
            newItems.push({
                id: Date.now().toString(36) + Math.random().toString(36).substr(2, 8),
                createdAt: ts,
                supplier:  item.supplier  || '',
                matName:   item.matName,
                color:     item.color     || '',
                packKg:    parseFloat(item.packKg) || 25,
                packLabel: `${item.packKg || 25}KG/포`,
                unitPrice: parseInt(item.unitPrice) || 0,
                usedFor:   item.usedFor   || ''
            });
        });

        if (!newItems.length) {
            UIUtils.toast('업로드 실패: 유효한 데이터가 없습니다.', 'error');
            return;
        }

        try {
            if (doReplace) {
                // 전체 교체: bulk API (DELETE + INSERT)
                await Storage.saveAll(RAW_MAT_STORE, newItems);
            } else {
                // 개별 추가: API await 후 캐시 갱신
                const cacheArr = Storage.getAll(RAW_MAT_STORE);
                for (const item of newItems) {
                    await ApiClient.save(RAW_MAT_STORE, item);
                    cacheArr.push(item);
                }
            }

            // DB 최신 상태로 캐시 재동기화
            await Storage.refresh(RAW_MAT_STORE);

            delete window._rawMatUploadData;
            UIUtils.closeModal();
            UIUtils.toast(
                `${newItems.length}개 원재료 업로드 완료${doReplace ? ' (기존 데이터 교체)' : ' (기존 데이터에 추가)'}` +
                (errorCount > 0 ? ` / ${errorCount}개 오류(원재료명 없음)` : ''),
                'success'
            );
            renderTabContent();
        } catch (e) {
            console.error('원재료 업로드 실패:', e);
            UIUtils.toast('저장 실패: ' + e.message, 'error');
        }
    }

    // =====================================================
    // 검사자 관리 탭
    // =====================================================

    // ── 인물 사진 공용 헬퍼 ──────────────────────────────────────────────────
    function _compressPersonPhoto(file, cb) {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                const maxPx = 400;
                let w = img.width, h = img.height;
                if (Math.max(w, h) > maxPx) {
                    const s = maxPx / Math.max(w, h);
                    w = Math.round(w * s); h = Math.round(h * s);
                }
                const cvs = document.createElement('canvas');
                cvs.width = w; cvs.height = h;
                cvs.getContext('2d').drawImage(img, 0, 0, w, h);
                cb(cvs.toDataURL('image/jpeg', 0.85));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function previewPersonPhoto(input) {
        const file = input.files[0];
        if (!file) return;
        _compressPersonPhoto(file, b64 => {
            _pendingPhoto = b64;
            _renderPersonPhotoPreview(b64);
        });
    }

    function _renderPersonPhotoPreview(photo) {
        const preview = document.getElementById('personPhotoPreview');
        if (!preview) return;
        if (photo) {
            preview.innerHTML = `<img src="${photo}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
            preview.style.border = 'none';
        } else {
            preview.innerHTML = `<span class="material-symbols-outlined" style="color:var(--text-muted);font-size:32px;">person</span>`;
            preview.style.border = '2px dashed var(--border-color)';
        }
    }

    function _handlePersonPhotoBlob(fileOrBlob) {
        if (!fileOrBlob) return;
        _compressPersonPhoto(fileOrBlob, b64 => {
            _pendingPhoto = b64;
            _renderPersonPhotoPreview(b64);
            UIUtils.toast('클립보드 사진이 반영되었습니다.', 'success');
        });
    }

    function _bindPersonPhotoPaste() {
        const modal = document.getElementById('modal');
        if (!modal) return;
        modal.onpaste = function (e) {
            const items = (e.clipboardData || window.clipboardData || {}).items || [];
            for (const item of items) {
                if (item && item.type && item.type.startsWith('image/')) {
                    const blob = item.getAsFile ? item.getAsFile() : null;
                    if (blob) {
                        e.preventDefault();
                        _handlePersonPhotoBlob(blob);
                        break;
                    }
                }
            }
        };
    }

    function _photoUploadHtml(existingPhoto) {
        const inner = existingPhoto
            ? `<img src="${existingPhoto}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`
            : `<span class="material-symbols-outlined" style="color:var(--text-muted);font-size:32px;">person</span>`;
        return `
            <div class="form-group">
                <label class="form-label">사진</label>
                <div style="display:flex;align-items:center;gap:16px;margin-top:8px;">
                    <div id="personPhotoPreview"
                        style="width:80px;height:80px;border-radius:50%;background:var(--bg-secondary);border:2px dashed var(--border-color);display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;cursor:pointer;"
                        onclick="document.getElementById('personPhotoInput').click()">
                        ${inner}
                    </div>
                    <div>
                        <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('personPhotoInput').click()">
                            <span class="material-symbols-outlined">upload</span> 사진 선택
                        </button>
                        <input type="file" id="personPhotoInput" accept="image/*" style="display:none"
                            onchange="SettingsModule.previewPersonPhoto(this)">
                        <p style="font-size:0.75rem;color:var(--text-muted);margin-top:6px;">클릭하여 업로드 · 자동 압축 (400px) · 클립보드 붙여넣기 가능</p>
                        ${existingPhoto ? `<button type="button" class="btn btn-sm" style="margin-top:4px;color:var(--accent-red);font-size:0.75rem;padding:2px 8px;border:1px solid var(--accent-red);border-radius:4px;background:none;cursor:pointer;" onclick="SettingsModule.clearPersonPhoto()">사진 삭제</button>` : ''}
                    </div>
                </div>
            </div>`;
    }

    function clearPersonPhoto() {
        _pendingPhoto = '';  // empty string = delete
        _renderPersonPhotoPreview('');
    }

    function _avatarHtml(person, size = 48) {
        if (person.photo) {
            return `<img src="${person.photo}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;flex-shrink:0;">`;
        }
        return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:var(--accent-blue);color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.round(size*0.4)}px;flex-shrink:0;">${(person.name || '?').charAt(0)}</div>`;
    }

    const USER_SEAL_FONTS = [
        { key: 'gothic', label: '굵은 고딕', family: "'Malgun Gothic', 'Arial Black', sans-serif", weight: 900 },
        { key: 'serif', label: '명조체', family: "'Batang', 'Gungsuh', serif", weight: 900 },
        { key: 'gungseo', label: '궁서체', family: "'Gungsuh', 'Batang', serif", weight: 900 },
        { key: 'brush', label: '필기 느낌', family: "'Brush Script MT', 'Gungsuh', cursive", weight: 900 },
        { key: 'square', label: '각인체', family: "'Consolas', 'Malgun Gothic', monospace", weight: 900 }
    ];

    function _sealFontOptionHtml(selectedKey = 'gothic') {
        return USER_SEAL_FONTS.map(font =>
            `<option value="${font.key}" ${font.key === selectedKey ? 'selected' : ''}>${font.label}</option>`
        ).join('');
    }

    function _sealPreviewHtml(existingSeal, selectedFont = 'gothic') {
        const inner = existingSeal
            ? `<img src="${existingSeal}" style="width:100%;height:100%;object-fit:contain;">`
            : `<span style="color:#b91c1c;font-weight:800;font-size:0.78rem;">날인</span>`;
        return `
            <div class="form-group">
                <label class="form-label">서명/날인</label>
                <div style="display:flex;align-items:center;gap:16px;margin-top:8px;">
                    <div id="userSealPreview"
                        style="width:92px;height:92px;background:#fff;border:1px dashed #ef4444;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;">
                        ${inner}
                    </div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                        <select class="form-select" id="umSealFont" style="height:32px;min-width:120px;padding:3px 8px;">
                            ${_sealFontOptionHtml(selectedFont)}
                        </select>
                        <button type="button" class="btn btn-outline btn-sm" onclick="SettingsModule.generateUserSeal()">
                            이름으로 도장 생성
                        </button>
                        <button type="button" class="btn btn-sm" style="color:var(--accent-red);border:1px solid var(--accent-red);background:none;" onclick="SettingsModule.clearUserSeal()">
                            삭제
                        </button>
                        <p style="width:100%;font-size:0.75rem;color:var(--text-muted);margin:2px 0 0;">이름 2~4자를 붉은 도장 이미지로 생성합니다.</p>
                    </div>
                </div>
            </div>`;
    }

    function generateUserSeal() {
        const name = ((document.getElementById('umDisplayName') || {}).value || '').trim();
        if (!name) {
            UIUtils.toast('이름을 먼저 입력하세요.', 'warning');
            return;
        }
        const fontKey = ((document.getElementById('umSealFont') || {}).value || 'gothic');
        const font = USER_SEAL_FONTS.find(f => f.key === fontKey) || USER_SEAL_FONTS[0];
        const chars = Array.from(name.replace(/\s+/g, '')).slice(0, 4);
        const cvs = document.createElement('canvas');
        const size = 220;
        cvs.width = size;
        cvs.height = size;
        const ctx = cvs.getContext('2d');
        ctx.clearRect(0, 0, size, size);
        ctx.strokeStyle = '#dc2626';
        ctx.fillStyle = '#dc2626';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, 92, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, 76, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = `${font.weight} ${chars.length <= 2 ? 58 : 48}px ${font.family}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (chars.length <= 2) {
            chars.forEach((ch, i) => ctx.fillText(ch, size / 2, size / 2 - 30 + i * 60));
        } else {
            const pos = [
                [size / 2 - 34, size / 2 - 34],
                [size / 2 + 34, size / 2 - 34],
                [size / 2 - 34, size / 2 + 34],
                [size / 2 + 34, size / 2 + 34]
            ];
            chars.forEach((ch, i) => ctx.fillText(ch, pos[i][0], pos[i][1]));
        }
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = '#dc2626';
        ctx.beginPath();
        ctx.arc(58, 60, 4, 0, Math.PI * 2);
        ctx.arc(158, 165, 3, 0, Math.PI * 2);
        ctx.arc(148, 48, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        _pendingSeal = cvs.toDataURL('image/png');
        const preview = document.getElementById('userSealPreview');
        if (preview) {
            preview.innerHTML = `<img src="${_pendingSeal}" style="width:100%;height:100%;object-fit:contain;">`;
            preview.style.border = '1px solid #ef4444';
        }
    }

    function clearUserSeal() {
        _pendingSeal = '';
        const preview = document.getElementById('userSealPreview');
        if (preview) {
            preview.innerHTML = `<span style="color:#b91c1c;font-weight:800;font-size:0.78rem;">날인</span>`;
            preview.style.border = '1px dashed #ef4444';
        }
    }

    function renderInspectorsTab(el) {
        const inspectors = Storage.getAll(INSPECTORS_STORE);

        const processLabels = {
            'incoming': '수입검사',
            'shipping': '출하검사',
            'self': '자주검사'
        };

        el.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">verified_user</span> 자격인증 검사자 (${inspectors.length}명)</h4>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button class="btn btn-primary" onclick="SettingsModule.openAddInspectorModal()">
                            <span class="material-symbols-outlined">add</span> 검사자 추가
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    ${inspectors.length === 0 ?
                `<p style="color:var(--text-muted);text-align:center;padding:30px;">등록된 검사자가 없습니다.</p>` :
                `<div class="inspector-list">
                        ${inspectors.map((insp, i) => `
                            <div class="inspector-item" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--bg-primary);border-radius:8px;margin-bottom:8px;border:1px solid var(--border-color);">
                                <div style="display:flex;align-items:center;gap:12px;">
                                    ${_avatarHtml(insp, 48)}
                                    <div>
                                        <div style="font-weight:600;">${insp.name || '-'}</div>
                                        <div style="font-size:0.8rem;color:var(--text-muted);">${insp.qualification || '-'}</div>
                                    </div>
                                </div>
                                <div style="display:flex;align-items:center;gap:12px;">
                                    <div style="display:flex;gap:4px;">
                                        ${(insp.processes || []).map(p => `
                                            <span class="badge" style="background:var(--accent-blue);color:white;padding:2px 8px;border-radius:12px;font-size:0.7rem;">${processLabels[p] || p}</span>
                                        `).join('')}
                                    </div>
                                    <div style="display:flex;gap:4px;">
                                        <button class="btn btn-sm btn-outline" onclick="SettingsModule.editInspector('${insp.id}')">수정</button>
                                        <button class="btn btn-sm btn-danger" onclick="SettingsModule.removeInspector('${insp.id}')">삭제</button>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>`}
                </div>
            </div>
        `;
    }

    function openAddInspectorModal() {
        _pendingPhoto = null;
        UIUtils.showModal('검사자 추가', `
            ${_photoUploadHtml(null)}
            <div class="form-group">
                <label class="form-label">이름 <span style="color:var(--accent-red)">*</span></label>
                <input type="text" class="form-input" id="inspName" placeholder="예: 김검사">
            </div>
            <div class="form-group">
                <label class="form-label">검사자격</label>
                <input type="text" class="form-input" id="inspQualification" placeholder="예: 산업안전보건기사, 품질기사">
            </div>
            <div class="form-group">
                <label class="form-label">주요 공정 (복수 선택 가능)</label>
                <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;">
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                        <input type="checkbox" name="inspProcess" value="incoming" style="width:16px;height:16px;">
                        <span>수입검사</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                        <input type="checkbox" name="inspProcess" value="shipping" style="width:16px;height:16px;">
                        <span>출하검사</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                        <input type="checkbox" name="inspProcess" value="self" style="width:16px;height:16px;">
                        <span>자주검사</span>
                    </label>
                </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SettingsModule.saveInspector()">추가</button>
        `);
        _bindPersonPhotoPaste();
    }

    async function saveInspector() {
        const name = (document.getElementById('inspName') || {}).value || '';
        const qualification = (document.getElementById('inspQualification') || {}).value || '';

        const processCheckboxes = document.querySelectorAll('input[name="inspProcess"]:checked');
        const processes = Array.from(processCheckboxes).map(cb => cb.value);

        if (!name.trim()) {
            UIUtils.toast('이름을 입력하세요.', 'warning');
            return;
        }

        if (processes.length === 0) {
            UIUtils.toast('주요 공정을 선택하세요.', 'warning');
            return;
        }

        await Storage.add(INSPECTORS_STORE, {
            name: name.trim(),
            qualification: qualification.trim(),
            processes,
            photo: _pendingPhoto || null
        });
        _pendingPhoto = null;
        UIUtils.closeModal();
        UIUtils.toast('검사자가 추가되었습니다.', 'success');
        renderTabContent();
    }

    function editInspector(id) {
        const insp = Storage.getById(INSPECTORS_STORE, id);
        if (!insp) return;
        _pendingPhoto = undefined; // undefined = no change

        UIUtils.showModal('검사자 수정', `
            ${_photoUploadHtml(insp.photo || null)}
            <div class="form-group">
                <label class="form-label">이름 <span style="color:var(--accent-red)">*</span></label>
                <input type="text" class="form-input" id="editInspName" value="${insp.name || ''}">
            </div>
            <div class="form-group">
                <label class="form-label">검사자격</label>
                <input type="text" class="form-input" id="editInspQualification" value="${insp.qualification || ''}">
            </div>
            <div class="form-group">
                <label class="form-label">주요 공정 (복수 선택 가능)</label>
                <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;">
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                        <input type="checkbox" name="editInspProcess" value="incoming" ${(insp.processes || []).includes('incoming') ? 'checked' : ''} style="width:16px;height:16px;">
                        <span>수입검사</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                        <input type="checkbox" name="editInspProcess" value="shipping" ${(insp.processes || []).includes('shipping') ? 'checked' : ''} style="width:16px;height:16px;">
                        <span>출하검사</span>
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                        <input type="checkbox" name="editInspProcess" value="self" ${(insp.processes || []).includes('self') ? 'checked' : ''} style="width:16px;height:16px;">
                        <span>자주검사</span>
                    </label>
                </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SettingsModule.updateInspector('${id}')">저장</button>
        `);
        _bindPersonPhotoPaste();
    }

    async function updateInspector(id) {
        const name = (document.getElementById('editInspName') || {}).value || '';
        const qualification = (document.getElementById('editInspQualification') || {}).value || '';

        const processCheckboxes = document.querySelectorAll('input[name="editInspProcess"]:checked');
        const processes = Array.from(processCheckboxes).map(cb => cb.value);

        if (!name.trim()) {
            UIUtils.toast('이름을 입력하세요.', 'warning');
            return;
        }

        if (processes.length === 0) {
            UIUtils.toast('주요 공정을 선택하세요.', 'warning');
            return;
        }

        const existing = Storage.getById(INSPECTORS_STORE, id);
        const photo = _pendingPhoto !== undefined ? (_pendingPhoto || null) : (existing && existing.photo) || null;
        _pendingPhoto = null;
        await Storage.update(INSPECTORS_STORE, id, {
            name: name.trim(),
            qualification: qualification.trim(),
            processes,
            photo
        });
        UIUtils.closeModal();
        UIUtils.toast('수정되었습니다.', 'success');
        renderTabContent();
    }

    function removeInspector(id) {
        UIUtils.confirm('이 검사자를 삭제하시겠습니까?', async () => {
            await Storage.remove(INSPECTORS_STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            renderTabContent();
        });
    }

    // =====================================================
    // 작업자 관리 탭 (NEW)
    // =====================================================

    function renderOperatorsTab(el) {
        const operators = Storage.getAll(OPERATORS_STORE);

        el.innerHTML = `
            <div class="card">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">engineering</span> 현장 작업자 등록 및 관리 (${operators.length}명)</h4>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button class="btn btn-primary" onclick="SettingsModule.openAddOperatorModal()">
                            <span class="material-symbols-outlined">person_add</span> 작업자 추가
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    ${operators.length === 0 ?
                `<p style="color:var(--text-muted);text-align:center;padding:30px;">등록된 작업자가 없습니다. '작업자 추가' 버튼을 눌러 등록하세요.</p>` :
                `<div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>No</th>
                                        <th>사진</th>
                                        <th>성함</th>
                                        <th>소속/직함</th>
                                        <th>주요 공정</th>
                                        <th>연락처</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${operators.map((op, i) => `
                                        <tr>
                                            <td>${i + 1}</td>
                                            <td style="padding:6px 10px;">${_avatarHtml(op, 40)}</td>
                                            <td><strong style="font-size:1.1rem;color:var(--accent-blue);">${op.name}</strong></td>
                                            <td>${op.position || '-'}</td>
                                            <td>${op.dept || '-'}</td>
                                            <td style="font-family:monospace;">${op.phone || '-'}</td>
                                            <td>
                                                <button class="btn btn-sm btn-outline" onclick="SettingsModule.editOperator('${op.id}')">수정</button>
                                                <button class="btn btn-sm btn-danger" onclick="SettingsModule.removeOperator('${op.id}')">삭제</button>
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>`
            }
                </div>
            </div>
        `;
    }

    function openAddOperatorModal() {
        _pendingPhoto = null;
        UIUtils.showModal('현장 작업자 등록', `
            ${_photoUploadHtml(null)}
            <div class="form-group">
                <label class="form-label">성함 <span style="color:var(--accent-red)">*</span></label>
                <input type="text" class="form-input" id="opName" placeholder="성함을 입력하세요">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">소속/직함</label>
                    <input type="text" class="form-input" id="opPosition" placeholder="예: 조장, 작업반장">
                </div>
                <div class="form-group">
                    <label class="form-label">담당 공정</label>
                    <input type="text" class="form-input" id="opDept" placeholder="예: 도장라인, 사출반">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">연락처</label>
                <input type="text" class="form-input" id="opPhone" placeholder="010-0000-0000">
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SettingsModule.saveOperator()">등록</button>
        `);
        _bindPersonPhotoPaste();
    }

    async function saveOperator() {
        const name = document.getElementById('opName').value.trim();
        const position = document.getElementById('opPosition').value.trim();
        const dept = document.getElementById('opDept').value.trim();
        const phone = document.getElementById('opPhone').value.trim();

        if (!name) {
            UIUtils.toast('성함을 입력하세요.', 'warning');
            return;
        }

        await Storage.add(OPERATORS_STORE, {
            name,
            position,
            dept,
            phone,
            photo: _pendingPhoto || null
        });
        _pendingPhoto = null;
        UIUtils.closeModal();
        UIUtils.toast(`작업자 ${name}님이 등록되었습니다.`, 'success');
        renderTabContent();
    }

    function editOperator(id) {
        const op = Storage.getById(OPERATORS_STORE, id);
        if (!op) return;
        _pendingPhoto = undefined; // undefined = no change

        UIUtils.showModal('작업자 정보 수정', `
            ${_photoUploadHtml(op.photo || null)}
            <div class="form-group">
                <label class="form-label">성함 <span style="color:var(--accent-red)">*</span></label>
                <input type="text" class="form-input" id="editOpName" value="${op.name}">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">소속/직함</label>
                    <input type="text" class="form-input" id="editOpPosition" value="${op.position || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">담당 공정</label>
                    <input type="text" class="form-input" id="editOpDept" value="${op.dept || ''}">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">연락처</label>
                <input type="text" class="form-input" id="editOpPhone" value="${op.phone || ''}">
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SettingsModule.updateOperator('${id}')">저장</button>
        `);
        _bindPersonPhotoPaste();
    }

    async function updateOperator(id) {
        const name = document.getElementById('editOpName').value.trim();
        const position = document.getElementById('editOpPosition').value.trim();
        const dept = document.getElementById('editOpDept').value.trim();
        const phone = document.getElementById('editOpPhone').value.trim();

        if (!name) {
            UIUtils.toast('성함을 입력하세요.', 'warning');
            return;
        }

        const existingOp = Storage.getById(OPERATORS_STORE, id);
        const photo = _pendingPhoto !== undefined ? (_pendingPhoto || null) : (existingOp && existingOp.photo) || null;
        _pendingPhoto = null;
        await Storage.update(OPERATORS_STORE, id, {
            name,
            position,
            dept,
            phone,
            photo
        });
        UIUtils.closeModal();
        UIUtils.toast('정보가 수정되었습니다.', 'success');
        renderTabContent();
    }

    function removeOperator(id) {
        const op = Storage.getById(OPERATORS_STORE, id);
        UIUtils.confirm(`${op.name} 작업자 정보를 삭제하시겠습니까?`, async () => {
            await Storage.remove(OPERATORS_STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            renderTabContent();
        });
    }

    // =====================================================
    // 자격인증 관리 탭 (SQ 평가 대응)
    // =====================================================

    const CERT_PROCESS_OPTIONS = [
        '사출', '도장', '도료 액분석', '레이저', '출하검사', '수입검사', '외관검사',
        '치수검사', '자주검사', '리워크 검사', 'AOI 검사', '특별공정'
    ];
    const CERT_METHOD_OPTIONS = [
        '부적합 판별 실기평가', '품질특성 교육', '동일업무 경력', '품질산포 발생 가능성 검증',
        '계측기 사용능력 평가', '특별공정 판독/분석능력 평가'
    ];

    function _certEsc(v) {
        return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _certJs(v) {
        return String(v ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ');
    }

    function _certPeople() {
        const inspectors = (Storage.getAll(INSPECTORS_STORE) || []).map(p => ({ ...p, role: 'inspector', roleLabel: '검사자' }));
        const operators = (Storage.getAll(OPERATORS_STORE) || []).map(p => ({ ...p, role: 'operator', roleLabel: '작업자' }));
        return [...inspectors, ...operators].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ko'));
    }

    function _latestCert(person) {
        return ((person.certifications || []).slice().sort((a, b) => (b.evalDate || '').localeCompare(a.evalDate || '')))[0] || null;
    }

    function _certStatus(cert) {
        if (!cert) return { text: '미인증', type: 'warning' };
        if (cert.result === '불합격') return { text: '불합격', type: 'danger' };
        if (cert.expireDate && cert.expireDate < UIUtils.today()) return { text: '만료', type: 'danger' };
        if (cert.result === '합격') return { text: '인증', type: 'success' };
        return { text: '평가중', type: 'info' };
    }

    function _certPersonStore(role) {
        return role === 'inspector' ? INSPECTORS_STORE : OPERATORS_STORE;
    }

    function _certPerson(role, id) {
        return Storage.getById(_certPersonStore(role), id);
    }

    function _certStats(people) {
        const latest = people.map(_latestCert);
        const certified = latest.filter(c => _certStatus(c).text === '인증').length;
        const expired = latest.filter(c => ['만료', '불합격'].includes(_certStatus(c).text)).length;
        const noCert = latest.filter(c => !c).length;
        const backups = latest.filter(c => c && c.backupPersonId).length;
        return { certified, expired, noCert, backups };
    }

    function renderCertificationTab(el) {
        const people = _certPeople();
        const stats = _certStats(people);
        el.innerHTML = `
            <div class="card" style="margin-bottom:16px;">
                <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
                    <h4><span class="material-symbols-outlined">workspace_premium</span> 자격인증 관리기준</h4>
                </div>
                <div class="card-body">
                    <div class="stat-cards" style="margin-bottom:14px;">
                        <div class="stat-card green"><div class="stat-card-value">${stats.certified}</div><div class="stat-card-label">유효 인증자</div></div>
                        <div class="stat-card orange"><div class="stat-card-value">${stats.expired}</div><div class="stat-card-label">만료/불합격</div></div>
                        <div class="stat-card blue"><div class="stat-card-value">${stats.backups}</div><div class="stat-card-label">대응인원 지정</div></div>
                        <div class="stat-card purple"><div class="stat-card-value">${stats.noCert}</div><div class="stat-card-label">미인증</div></div>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;">
                        ${[
                            ['공정별 배치기준', '작업자/검사자별 담당 공정, 담당 검사항목, 대체 가능 인원을 지정합니다.'],
                            ['인증 실시 기준', '부적합 판별 실기평가, 품질특성 교육, 동일업무 경력, 품질산포 검증을 기록합니다.'],
                            ['검증 신뢰도 확보', '수기 원본데이터, 검증용 시료, 증빙 문서번호와 보관 위치를 남깁니다.'],
                            ['결원 대응', '휴가/결원 시 대응인원과 투입 전 교육 및 품질보증 조치 사항을 관리합니다.'],
                            ['중요/특별 공정', '도장 액분석, 계측기 사용, 리워크/AOI 등 특별 공정 인증 여부를 별도 표시합니다.']
                        ].map(([title, body]) => `
                            <div style="border:1px solid var(--border-color);border-radius:8px;padding:12px;background:var(--bg-primary);">
                                <div style="font-weight:700;color:var(--text-primary);margin-bottom:5px;">${title}</div>
                                <div style="font-size:0.82rem;color:var(--text-secondary);line-height:1.45;">${body}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
            <div class="card">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">fact_check</span> 작업자/검사자 자격인증 현황 (${people.length}명)</h4>
                </div>
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>구분</th><th>성명</th><th>소속/자격</th><th>담당 공정</th><th>인증 공정/항목</th><th>평가기준</th><th>상태</th><th>평가일</th><th>만료일</th><th>대응인원</th><th>증빙</th><th>작업</th>
                                </tr>
                            </thead>
                            <tbody>${_certTableRows(people)}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    function _certTableRows(people) {
        if (!people.length) {
            return `<tr><td colspan="12" style="text-align:center;padding:30px;">검사자 또는 작업자를 먼저 등록하세요.</td></tr>`;
        }
        return people.map(p => {
            const cert = _latestCert(p);
            const status = _certStatus(cert);
            const backup = cert && cert.backupPersonId ? _certPeople().find(x => x.id === cert.backupPersonId) : null;
            const processText = p.role === 'inspector'
                ? (p.processes || []).map(x => ({ incoming:'수입검사', shipping:'출하검사', self:'자주검사' }[x] || x)).join(', ')
                : (p.dept || '-');
            return `
                <tr>
                    <td>${UIUtils.badge(p.roleLabel, p.role === 'inspector' ? 'info' : 'success')}</td>
                    <td><strong>${_certEsc(p.name || '-')}</strong></td>
                    <td>${_certEsc(p.qualification || p.position || '-')}</td>
                    <td>${_certEsc(processText || '-')}</td>
                    <td>${cert ? `<strong>${_certEsc(cert.process || '-')}</strong><br><span style="font-size:0.76rem;color:var(--text-muted);">${_certEsc(cert.duty || '-')}</span>` : '-'}</td>
                    <td style="font-size:0.78rem;">${cert ? _certEsc((cert.methods || []).join(', ') || '-') : '-'}</td>
                    <td>${UIUtils.badge(status.text, status.type)}</td>
                    <td>${cert ? _certEsc(cert.evalDate || '-') : '-'}</td>
                    <td>${cert ? _certEsc(cert.expireDate || '-') : '-'}</td>
                    <td>${backup ? _certEsc(backup.name) : '-'}</td>
                    <td style="font-size:0.78rem;">${cert ? _certEsc([cert.originalDocNo, cert.evidenceSample].filter(Boolean).join(' / ') || '-') : '-'}</td>
                    <td style="white-space:nowrap;">
                        <button class="btn btn-sm btn-outline" onclick="SettingsModule.openCertificationModal('${p.role}','${_certJs(p.id)}')">${cert ? '재평가' : '인증등록'}</button>
                        ${cert ? `<button class="btn btn-sm btn-outline" onclick="SettingsModule.openCertificationModal('${p.role}','${_certJs(p.id)}','${_certJs(cert.id)}')">수정</button>
                        <button class="btn btn-sm btn-outline" onclick="SettingsModule.showCertificationSheet('${p.role}','${_certJs(p.id)}','${_certJs(cert.id)}')">C/S</button>` : ''}
                    </td>
                </tr>`;
        }).join('');
    }

    function _certOptions(selected = '') {
        return CERT_PROCESS_OPTIONS.map(p => `<option value="${_certEsc(p)}" ${p === selected ? 'selected' : ''}>${_certEsc(p)}</option>`).join('');
    }

    function _certMethodChecks(selected = []) {
        return CERT_METHOD_OPTIONS.map(m => `
            <label style="display:flex;align-items:center;gap:6px;">
                <input type="checkbox" name="certMethod" value="${_certEsc(m)}" ${selected.includes(m) ? 'checked' : ''}>
                <span>${_certEsc(m)}</span>
            </label>
        `).join('');
    }

    function _backupOptions(currentId, selected = '') {
        return '<option value="">-- 대응인원 선택 --</option>' + _certPeople()
            .filter(p => p.id !== currentId)
            .map(p => `<option value="${_certEsc(p.id)}" ${p.id === selected ? 'selected' : ''}>${_certEsc(p.roleLabel)} · ${_certEsc(p.name || '')}</option>`)
            .join('');
    }

    function openCertificationModal(role, personId, certId = '') {
        const person = _certPerson(role, personId);
        if (!person) {
            UIUtils.toast('대상자를 찾을 수 없습니다.', 'warning');
            return;
        }
        const cert = certId ? ((person.certifications || []).find(c => c.id === certId) || {}) : {};
        UIUtils.showModal(`${person.name || ''} 자격인증 ${certId ? '수정' : '등록'}`, `
            <div style="padding:10px 12px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:8px;margin-bottom:12px;">
                <strong>${_certEsc(person.name || '-')}</strong>
                <span style="color:var(--text-muted);font-size:0.84rem;margin-left:8px;">${role === 'inspector' ? '검사자' : '작업자'} · ${_certEsc(person.qualification || person.position || person.dept || '-')}</span>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">인증 공정 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="certProcess">${_certOptions(cert.process || '')}</select>
                </div>
                <div class="form-group">
                    <label class="form-label">담당 항목/업무 <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="certDuty" value="${_certEsc(cert.duty || '')}" placeholder="예: 외관검사 부적합 판별, 도장 액분석, A라인 생산">
                </div>
                <div class="form-group">
                    <label class="form-label">평가 결과</label>
                    <select class="form-select" id="certResult">
                        <option value="합격" ${cert.result !== '불합격' ? 'selected' : ''}>합격</option>
                        <option value="불합격" ${cert.result === '불합격' ? 'selected' : ''}>불합격</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">평가일</label>
                    <input type="date" class="form-input" id="certEvalDate" value="${_certEsc(cert.evalDate || UIUtils.today())}">
                </div>
                <div class="form-group">
                    <label class="form-label">유효기간</label>
                    <input type="date" class="form-input" id="certExpireDate" value="${_certEsc(cert.expireDate || '')}">
                </div>
                <div class="form-group">
                    <label class="form-label">평가자</label>
                    <input type="text" class="form-input" id="certEvaluator" value="${_certEsc(cert.evaluator || '')}" placeholder="평가자/승인자">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">자격인증 실시 기준</label>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;font-size:0.84rem;">
                    ${_certMethodChecks(cert.methods || [])}
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">실기평가 결과</label>
                    <input type="text" class="form-input" id="certPractical" value="${_certEsc(cert.practicalResult || '')}" placeholder="예: 불량유형별 검출 18/20, 계측기 사용 적합">
                </div>
                <div class="form-group">
                    <label class="form-label">품질특성 교육</label>
                    <input type="text" class="form-input" id="certTraining" value="${_certEsc(cert.qualityTraining || '')}" placeholder="교육명/일자/시간">
                </div>
                <div class="form-group">
                    <label class="form-label">동일업무 경력</label>
                    <input type="text" class="form-input" id="certExperience" value="${_certEsc(cert.experience || '')}" placeholder="예: 6개월, 1년 이상">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">품질산포/특별특성 검증</label>
                    <input type="text" class="form-input" id="certVariation" value="${_certEsc(cert.variationCheck || '')}" placeholder="반복생산 산포, 특별공정 판독/분석능력 등">
                </div>
                <div class="form-group">
                    <label class="form-label">대응인원</label>
                    <select class="form-select" id="certBackupPerson">${_backupOptions(personId, cert.backupPersonId || '')}</select>
                </div>
                <div class="form-group">
                    <label class="form-label">결원/대체 투입 방안</label>
                    <input type="text" class="form-input" id="certVacancy" value="${_certEsc(cert.vacancyResponse || '')}" placeholder="투입 전 교육, 품질보증 확인 등">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">수기 원본데이터/문서번호</label>
                    <input type="text" class="form-input" id="certDocNo" value="${_certEsc(cert.originalDocNo || '')}" placeholder="평가표 번호, 원본 보관 위치">
                </div>
                <div class="form-group">
                    <label class="form-label">검증용 시료/증빙</label>
                    <input type="text" class="form-input" id="certSample" value="${_certEsc(cert.evidenceSample || '')}" placeholder="시료 LOT, 사진, 교육기록 등">
                </div>
                <div class="form-group">
                    <label class="form-label">중요/특별 공정 여부</label>
                    <select class="form-select" id="certSpecial">
                        <option value="N" ${cert.specialProcess !== 'Y' ? 'selected' : ''}>일반</option>
                        <option value="Y" ${cert.specialProcess === 'Y' ? 'selected' : ''}>중요/특별 공정</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">비고/후속조치</label>
                <textarea class="form-input" id="certNote" rows="3" placeholder="미흡사항, 재평가 예정, 후속조치">${_certEsc(cert.note || '')}</textarea>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            ${certId ? `<button class="btn btn-danger" onclick="SettingsModule.removeCertification('${role}','${_certJs(personId)}','${_certJs(certId)}')">삭제</button>` : ''}
            <button class="btn btn-primary" onclick="SettingsModule.saveCertification('${role}','${_certJs(personId)}','${_certJs(certId)}')">저장</button>
        `, 'xl');
    }

    async function saveCertification(role, personId, certId = '') {
        const person = _certPerson(role, personId);
        if (!person) return;
        const methods = Array.from(document.querySelectorAll('input[name="certMethod"]:checked')).map(cb => cb.value);
        const data = {
            id: certId || Storage.generateId(),
            process: document.getElementById('certProcess')?.value || '',
            duty: document.getElementById('certDuty')?.value.trim() || '',
            result: document.getElementById('certResult')?.value || '합격',
            evalDate: document.getElementById('certEvalDate')?.value || UIUtils.today(),
            expireDate: document.getElementById('certExpireDate')?.value || '',
            evaluator: document.getElementById('certEvaluator')?.value.trim() || '',
            methods,
            practicalResult: document.getElementById('certPractical')?.value.trim() || '',
            qualityTraining: document.getElementById('certTraining')?.value.trim() || '',
            experience: document.getElementById('certExperience')?.value.trim() || '',
            variationCheck: document.getElementById('certVariation')?.value.trim() || '',
            backupPersonId: document.getElementById('certBackupPerson')?.value || '',
            vacancyResponse: document.getElementById('certVacancy')?.value.trim() || '',
            originalDocNo: document.getElementById('certDocNo')?.value.trim() || '',
            evidenceSample: document.getElementById('certSample')?.value.trim() || '',
            specialProcess: document.getElementById('certSpecial')?.value || 'N',
            note: document.getElementById('certNote')?.value.trim() || ''
        };
        if (!data.process || !data.duty) {
            UIUtils.toast('인증 공정과 담당 항목/업무를 입력하세요.', 'warning');
            return;
        }
        if (methods.length === 0) {
            UIUtils.toast('자격인증 실시 기준을 1개 이상 선택하세요.', 'warning');
            return;
        }
        const certifications = (person.certifications || []).filter(c => c.id !== data.id);
        certifications.push(data);
        await Storage.update(_certPersonStore(role), personId, { ...person, certifications });
        UIUtils.closeModal();
        UIUtils.toast('자격인증 기록이 저장되었습니다.', 'success');
        renderTabContent();
    }

    function removeCertification(role, personId, certId) {
        const person = _certPerson(role, personId);
        if (!person) return;
        UIUtils.confirm('자격인증 기록을 삭제하시겠습니까?', async () => {
            const certifications = (person.certifications || []).filter(c => c.id !== certId);
            await Storage.update(_certPersonStore(role), personId, { ...person, certifications });
            UIUtils.closeModal();
            UIUtils.toast('삭제되었습니다.', 'success');
            renderTabContent();
        });
    }

    function showCertificationSheet(role, personId, certId) {
        const person = _certPerson(role, personId);
        const cert = person ? (person.certifications || []).find(c => c.id === certId) : null;
        if (!person || !cert) return;
        const backup = cert.backupPersonId ? _certPeople().find(p => p.id === cert.backupPersonId) : null;
        const status = _certStatus(cert);
        UIUtils.showModal('자격인증 C/S', `
            <div style="border:1px solid var(--border-color);padding:18px;border-radius:8px;background:#fff;color:#111;">
                <h3 style="text-align:center;margin:0 0 16px;">작업자/검사자 자격인증 평가표</h3>
                <table class="data-table" style="font-size:0.86rem;">
                    <tbody>
                        <tr><th>구분</th><td>${role === 'inspector' ? '검사자' : '작업자'}</td><th>성명</th><td>${_certEsc(person.name || '')}</td></tr>
                        <tr><th>인증 공정</th><td>${_certEsc(cert.process || '')}</td><th>담당 항목</th><td>${_certEsc(cert.duty || '')}</td></tr>
                        <tr><th>평가일</th><td>${_certEsc(cert.evalDate || '')}</td><th>유효기간</th><td>${_certEsc(cert.expireDate || '')}</td></tr>
                        <tr><th>평가 결과</th><td>${_certEsc(status.text)}</td><th>평가자</th><td>${_certEsc(cert.evaluator || '')}</td></tr>
                        <tr><th>실시 기준</th><td colspan="3">${_certEsc((cert.methods || []).join(', '))}</td></tr>
                        <tr><th>실기평가</th><td colspan="3">${_certEsc(cert.practicalResult || '')}</td></tr>
                        <tr><th>품질특성 교육</th><td>${_certEsc(cert.qualityTraining || '')}</td><th>동일업무 경력</th><td>${_certEsc(cert.experience || '')}</td></tr>
                        <tr><th>품질산포/특별특성 검증</th><td colspan="3">${_certEsc(cert.variationCheck || '')}</td></tr>
                        <tr><th>원본데이터</th><td>${_certEsc(cert.originalDocNo || '')}</td><th>검증 시료/증빙</th><td>${_certEsc(cert.evidenceSample || '')}</td></tr>
                        <tr><th>결원 대응인원</th><td>${backup ? _certEsc(backup.name || '') : '-'}</td><th>대체 투입 방안</th><td>${_certEsc(cert.vacancyResponse || '')}</td></tr>
                        <tr><th>비고/후속조치</th><td colspan="3">${_certEsc(cert.note || '')}</td></tr>
                    </tbody>
                </table>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:18px;text-align:center;">
                    <div style="border-top:1px solid #111;padding-top:8px;">작성</div>
                    <div style="border-top:1px solid #111;padding-top:8px;">검토</div>
                    <div style="border-top:1px solid #111;padding-top:8px;">승인</div>
                </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>
            <button class="btn btn-primary" onclick="window.print()">인쇄</button>
        `, 'xl');
    }

    function exportCertificationData() {
        const rows = [];
        _certPeople().forEach(p => {
            (p.certifications || []).forEach(c => {
                const backup = c.backupPersonId ? _certPeople().find(x => x.id === c.backupPersonId) : null;
                rows.push([
                    p.roleLabel, p.name || '', p.qualification || p.position || '', c.process || '', c.duty || '',
                    (c.methods || []).join('/'), c.result || '', c.evalDate || '', c.expireDate || '', c.evaluator || '',
                    c.practicalResult || '', c.qualityTraining || '', c.experience || '', c.variationCheck || '',
                    backup ? backup.name || '' : '', c.vacancyResponse || '', c.originalDocNo || '', c.evidenceSample || '',
                    c.specialProcess === 'Y' ? '중요/특별' : '일반', c.note || ''
                ]);
            });
        });
        Storage.exportToCSV(
            ['구분','성명','소속/자격','공정','담당항목','실시기준','결과','평가일','유효기간','평가자','실기평가','품질특성교육','동일업무경력','품질산포검증','대응인원','대체투입방안','원본데이터','검증시료','특별공정','비고'],
            rows,
            '자격인증관리'
        );
    }

    // =====================================================
    // 도료 정보 탭
    // =====================================================
    // 도료종류 배지 색상
    function paintTypeBadge(type) {
        const map = {
            '주제':   'success',
            '경화제': 'danger',
            '희석제': 'warning',
            '안료':   'info'
        };
        return map[type] || '';
    }

    function paintSpecBadge(spec) {
        const map = { 'Primer': 'info', 'Color': 'success', 'Clear': 'warning', '공용': 'secondary' };
        return map[spec] || '';
    }

    function _paintOptionHtml(values, selected = '', placeholder = '-- 선택 --') {
        const selectedValue = (selected || '').trim();
        const uniqueValues = [...new Set([selectedValue, ...values].map(v => (v || '').trim()).filter(Boolean))]
            .sort((a, b) => a.localeCompare(b, 'ko'));
        const esc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        return `<option value="">${placeholder}</option>` +
            uniqueValues.map(v => `<option value="${esc(v)}" ${v === selectedValue ? 'selected' : ''}>${esc(v)}</option>`).join('');
    }

    function _paintSelectOptions(field, selected = '', defaults = []) {
        const paints = Storage.getAll(PAINT_STORE) || [];
        return _paintOptionHtml([
            ...defaults,
            ...paints.map(p => p[field]).filter(Boolean)
        ], selected);
    }

    function _paintShelfLifeOptions(selected = '') {
        return _paintOptionHtml([
            '6개월',
            '1년',
            '2년',
            ...((Storage.getAll(PAINT_STORE) || []).map(p => p.shelfLife).filter(Boolean))
        ], selected);
    }

    function filterPaintList() {
        const selectElement = document.getElementById('paintSupplierFilter');
        if (!selectElement) return;
        const selectedSupplier = selectElement.value;

        const tbody = document.querySelector('#settingsContent .data-table tbody');
        if (!tbody) return;

        const rows = tbody.querySelectorAll('tr');
        let visibleCount = 0;

        // "등록된 도료 정보가 없습니다" 메시지만 있는 경우
        if (rows.length === 1 && rows[0].cells.length === 1) return;

        rows.forEach(row => {
            const supplierCell = row.cells[1];
            if (!supplierCell) return;

            const rowSupplier = supplierCell.textContent.trim();
            if (selectedSupplier === '' || rowSupplier === selectedSupplier) {
                row.style.display = '';
                visibleCount++;
            } else {
                row.style.display = 'none';
            }
        });

        const countSpan = document.getElementById('paintCount');
        if (countSpan) countSpan.textContent = visibleCount;
    }

    function renderPaintTab(el) {
        const paints = Storage.getAll(PAINT_STORE).sort((a, b) =>
            (a.supplier || '').localeCompare(b.supplier || '', 'ko') || (a.name || '').localeCompare(b.name || '', 'ko')
        );
        const uniqueSuppliers = [...new Set(paints.map(p => p.supplier).filter(Boolean))].sort();

        el.innerHTML = `
            <div class="card">
                <div class="card-header" style="flex-wrap: wrap; gap: 10px;">
                    <div style="display:flex; align-items:center; gap: 12px;">
                        <h4 style="margin:0;"><span class="material-symbols-outlined">palette</span> 도료 정보 (<span id="paintCount">${paints.length}</span>건)</h4>
                        <select id="paintSupplierFilter" class="form-input" style="width: 150px; padding: 4px 8px;" onchange="SettingsModule.filterPaintList()">
                            <option value="">전체 구매처</option>
                            ${uniqueSuppliers.map(supplier => `<option value="${supplier}">${supplier}</option>`).join('')}
                        </select>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button class="btn btn-outline" style="border-color:#6366f1;color:#4f46e5;" onclick="SettingsModule.openPaintValidationModal()">
                            <span class="material-symbols-outlined">verified</span> 도료 검증
                        </button>
                        <button class="btn btn-primary" onclick="SettingsModule.openAddPaintModal()">
                            <span class="material-symbols-outlined">add</span> 도료 추가
                        </button>
                    </div>
                </div>
                <div class="card-body">
                    ${paints.length === 0 ?
                `<p style="color:var(--text-muted);text-align:center;padding:30px;">등록된 도료 정보가 없습니다.</p>` :
                `<div class="data-table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>No</th>
                                        <th>구매처</th>
                                        <th>도료명</th>
                                        <th>제조사</th>
                                        <th>도료종류</th>
                                        <th>도료 사양</th>
                                        <th>포장 용량</th>
                                        <th>매입 단가</th>
                                        <th>유효기한</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${paints.map((p, i) => {
                                        return `
                                        <tr>
                                            <td>${i + 1}</td>
                                            <td>${p.supplier || '-'}</td>
                                            <td><strong>${p.name || '-'}</strong></td>
                                            <td>${p.manufacturer || '-'}</td>
                                            <td>${p.paintType ? UIUtils.badge(p.paintType, paintTypeBadge(p.paintType)) : '-'}</td>
                                            <td>${p.paintSpec ? UIUtils.badge(p.paintSpec, paintSpecBadge(p.paintSpec)) : '-'}</td>
                                            <td>${p.packUnit ? p.packUnit + ' KG' : '-'}</td>
                                            <td style="text-align:right;">${p.purchasePrice ? (Number(String(p.purchasePrice).replace(/,/g, '')) || 0).toLocaleString() : '-'}</td>
                                            <td>${p.shelfLife || '-'}</td>
                                            <td>
                                                <button class="btn btn-sm btn-outline" onclick="SettingsModule.editPaint('${p.id}')">수정</button>
                                                <button class="btn btn-sm btn-danger" onclick="SettingsModule.removePaint('${p.id}')">삭제</button>
                                            </td>
                                        </tr>`;
                                    }).join('')}
                                </tbody>
                            </table>
                        </div>`
            }
                </div>
            </div>
        `;
    }

    function _normPaintText(value) {
        return String(value || '')
            .toUpperCase()
            .replace(/\s+/g, '')
            .replace(/[._\-]/g, '')
            .trim();
    }

    function openPaintValidationModal() {
        const paints = Storage.getAll(PAINT_STORE) || [];
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const paintMap = {};
        paints.forEach(p => { if (p.id) paintMap[p.id] = p; });

        const usedIds = new Set();
        const missingRefs = [];
        products.forEach(product => {
            (product.paintMaterials || []).forEach((row, rowIdx) => {
                [
                    ['주제', row.mainId || row.paintMaterialId || ''],
                    ['경화제', row.hardId || ''],
                    ['희석제', row.thinnerId || '']
                ].forEach(([slot, id]) => {
                    if (!id) return;
                    if (paintMap[id]) usedIds.add(id);
                    else missingRefs.push({ product, rowIdx, slot, id });
                });
            });
        });

        const groups = {};
        paints.forEach(p => {
            const key = _normPaintText(p.name);
            if (!key) return;
            if (!groups[key]) groups[key] = [];
            groups[key].push(p);
        });
        const duplicateGroups = Object.values(groups).filter(list => list.length > 1);
        const vendorMismatch = duplicateGroups.filter(list => {
            const suppliers = new Set(list.map(p => (p.supplier || '').trim()).filter(Boolean));
            const makers = new Set(list.map(p => (p.manufacturer || '').trim()).filter(Boolean));
            return suppliers.size > 1 || makers.size > 1;
        });
        const unlinkedPaints = paints.filter(p => !usedIds.has(p.id));
        const noName = paints.filter(p => !(p.name || '').trim());
        const noMeta = paints.filter(p => !(p.supplier || '').trim() || !(p.manufacturer || '').trim());

        const issueCount = missingRefs.length + duplicateGroups.length + noName.length + noMeta.length;
        const warnCount = unlinkedPaints.length + vendorMismatch.length;
        const stat = (label, value, color) => `
            <div style="flex:1;min-width:130px;padding:10px 12px;border-radius:8px;background:${color}12;border:1px solid ${color}44;">
                <div style="font-size:1.2rem;font-weight:800;color:${color};">${value}</div>
                <div style="font-size:0.78rem;color:var(--text-secondary);">${label}</div>
            </div>`;
        const paintEditBtn = id => `<button class="btn btn-sm btn-outline" onclick="SettingsModule.editPaint('${id}', true)">수정</button>`;
        const paintDeleteBtn = id => `<button class="btn btn-sm btn-danger" onclick="SettingsModule.deleteUnlinkedPaintFromValidation('${id}')">삭제</button>`;
        const productEditBtn = id => `<button class="btn btn-sm btn-outline" onclick="SettingsModule.editProduct('${id}', true)">제품 수정</button>`;
        const paintLabel = p => `${p.supplier || '-'} / ${p.name || '-'} / ${p.manufacturer || '-'}`;
        const dupHtml = duplicateGroups.length ? duplicateGroups.map((list, i) => `
            <tr>
                <td>${i + 1}</td>
                <td><strong>${list[0].name || '-'}</strong></td>
                <td>${list.map(p => `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:0.78rem;padding:2px 0;">
                    <span>${paintLabel(p)}</span>${paintEditBtn(p.id)}
                </div>`).join('')}</td>
            </tr>`).join('') : `<tr><td colspan="3" style="text-align:center;color:#10b981;padding:16px;">중복 후보 없음</td></tr>`;
        const missingHtml = missingRefs.length ? missingRefs.map((r, i) => `
            <tr>
                <td>${i + 1}</td>
                <td>${r.product.carModel || '-'}</td>
                <td><strong>${r.product.partName || '-'}</strong></td>
                <td>${r.slot}</td>
                <td style="font-family:monospace;font-size:0.75rem;color:#ef4444;">${r.id}</td>
                <td style="white-space:nowrap;">
                    ${productEditBtn(r.product.id)}
                    <button class="btn btn-sm btn-danger" onclick="SettingsModule.clearMissingPaintRef('${r.product.id}', ${r.rowIdx}, '${r.slot}')">연결 비우기</button>
                </td>
            </tr>`).join('') : `<tr><td colspan="6" style="text-align:center;color:#10b981;padding:16px;">끊어진 제품 연결 없음</td></tr>`;
        const unlinkedHtml = unlinkedPaints.length ? unlinkedPaints.map((p, i) => `
            <tr>
                <td>${i + 1}</td>
                <td>${p.supplier || '-'}</td>
                <td><strong>${p.name || '-'}</strong></td>
                <td>${p.manufacturer || '-'}</td>
                <td>${p.paintType || '-'}</td>
                <td>${p.paintSpec || '-'}</td>
                <td style="white-space:nowrap;">${paintEditBtn(p.id)} ${paintDeleteBtn(p.id)}</td>
            </tr>`).join('') : `<tr><td colspan="7" style="text-align:center;color:#10b981;padding:16px;">모든 도료가 제품정보에 연결되어 있습니다.</td></tr>`;
        const metaHtml = noMeta.length ? noMeta.map((p, i) => `
            <tr>
                <td>${i + 1}</td>
                <td>${p.supplier || '<span style="color:#ef4444;">구매처 없음</span>'}</td>
                <td><strong>${p.name || '-'}</strong></td>
                <td>${p.manufacturer || '<span style="color:#ef4444;">제조사 없음</span>'}</td>
                <td>${paintEditBtn(p.id)}</td>
            </tr>`).join('') : `<tr><td colspan="5" style="text-align:center;color:#10b981;padding:16px;">구매처/제조사 누락 없음</td></tr>`;

        UIUtils.showModal('도료 검증 — 제품정보 연결 및 명칭 점검', `
            <style>
                .paint-validation-view,
                .paint-validation-view table,
                .paint-validation-view th,
                .paint-validation-view td,
                .paint-validation-view div,
                .paint-validation-view span {
                    font-size: 12px !important;
                }
                .paint-validation-view .btn {
                    font-size: 12px !important;
                    padding: 2px 6px !important;
                }
                .paint-validation-view table {
                    table-layout: fixed !important;
                    width: 100% !important;
                }
                .paint-validation-view th,
                .paint-validation-view td {
                    white-space: nowrap !important;
                    overflow: hidden !important;
                    text-overflow: ellipsis !important;
                    padding: 4px 6px !important;
                    line-height: 1.25 !important;
                }
                .paint-validation-view th:nth-child(1),
                .paint-validation-view td:nth-child(1) {
                    width: 34px !important;
                    max-width: 34px !important;
                    text-align: center !important;
                }
                .paint-validation-view th:last-child,
                .paint-validation-view td:last-child {
                    width: 112px !important;
                    max-width: 112px !important;
                    text-align: center !important;
                }
                .paint-validation-view .pv-actions {
                    width: 116px !important;
                    max-width: 116px !important;
                }
                .paint-validation-view td strong {
                    white-space: nowrap !important;
                }
            </style>
            <div class="paint-validation-view" style="font-size:12px;">
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
                ${stat('도료 마스터', paints.length, '#3b82f6')}
                ${stat('제품정보 연결', usedIds.size, '#10b981')}
                ${stat('오류/확인 필요', issueCount, issueCount ? '#ef4444' : '#10b981')}
                ${stat('미사용/주의', warnCount, warnCount ? '#f59e0b' : '#10b981')}
            </div>
            <p style="margin:0 0 12px;color:var(--text-secondary);font-size:0.84rem;line-height:1.6;">
                도료명은 공백, 하이픈, 점, 밑줄을 제거하고 대문자로 변환해 중복 후보를 찾습니다.
                제품정보의 도료 연결은 저장된 도료 ID 기준으로 검증합니다.
            </p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;">
                    <h4 style="margin:0;padding:10px 12px;background:var(--bg-secondary);font-size:0.9rem;">중복/오타 후보</h4>
                    <div style="max-height:220px;overflow:auto;">
                        <table class="data-table">
                            <colgroup><col style="width:34px"><col style="width:120px"><col></colgroup>
                            <thead><tr><th>No</th><th>기준명</th><th>후보 목록</th></tr></thead><tbody>${dupHtml}</tbody>
                        </table>
                    </div>
                </div>
                <div style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;">
                    <h4 style="margin:0;padding:10px 12px;background:var(--bg-secondary);font-size:0.9rem;">끊어진 제품 연결</h4>
                    <div style="max-height:220px;overflow:auto;">
                        <table class="data-table">
                            <colgroup>
                                <col style="width:34px"><col style="width:48px"><col><col style="width:48px"><col style="width:96px"><col style="width:116px">
                            </colgroup>
                            <thead><tr><th>No</th><th>차종</th><th>품명</th><th>구분</th><th>도료 ID</th><th class="pv-actions">작업</th></tr></thead><tbody>${missingHtml}</tbody>
                        </table>
                    </div>
                </div>
                <div style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;">
                    <h4 style="margin:0;padding:10px 12px;background:var(--bg-secondary);font-size:0.9rem;">제품정보 미연결 도료</h4>
                    <div style="max-height:240px;overflow:auto;">
                        <table class="data-table">
                            <colgroup>
                                <col style="width:34px"><col style="width:78px"><col><col style="width:82px"><col style="width:52px"><col style="width:58px"><col style="width:116px">
                            </colgroup>
                            <thead><tr><th>No</th><th>구매처</th><th>도료명</th><th>제조사</th><th>종류</th><th>사양</th><th class="pv-actions">작업</th></tr></thead><tbody>${unlinkedHtml}</tbody>
                        </table>
                    </div>
                </div>
                <div style="border:1px solid var(--border-color);border-radius:8px;overflow:hidden;">
                    <h4 style="margin:0;padding:10px 12px;background:var(--bg-secondary);font-size:0.9rem;">구매처/제조사 누락</h4>
                    <div style="max-height:240px;overflow:auto;">
                        <table class="data-table">
                            <colgroup><col style="width:34px"><col style="width:82px"><col><col style="width:92px"><col style="width:116px"></colgroup>
                            <thead><tr><th>No</th><th>구매처</th><th>도료명</th><th>제조사</th><th class="pv-actions">작업</th></tr></thead><tbody>${metaHtml}</tbody>
                        </table>
                    </div>
                </div>
            </div>
            </div>
        `, `<button class="btn btn-primary" onclick="UIUtils.closeModal()">닫기</button>`, 'xxl');
    }

    function clearMissingPaintRef(productId, rowIdx, slot) {
        const product = Storage.getById(DB.STORES.PRODUCTS, productId);
        if (!product) {
            UIUtils.toast('제품 정보를 찾을 수 없습니다.', 'error');
            return;
        }
        UIUtils.confirm('끊어진 도료 연결을 비우시겠습니까?', async () => {
            const paintMaterials = Array.isArray(product.paintMaterials) ? product.paintMaterials.map(r => ({ ...r })) : [];
            const row = paintMaterials[rowIdx];
            if (!row) {
                UIUtils.toast('도료 연결 행을 찾을 수 없습니다.', 'error');
                return;
            }
            if (slot === '주제') {
                row.mainId = '';
                row.paintMaterialId = '';
            } else if (slot === '경화제') {
                row.hardId = '';
            } else if (slot === '희석제') {
                row.thinnerId = '';
            }
            const cleaned = paintMaterials.filter(r => r.paintSpec || r.mainId || r.hardId || r.thinnerId || r.paintMaterialId);
            await Storage.update(DB.STORES.PRODUCTS, productId, { ...product, paintMaterials: cleaned });
            await Storage.refresh(DB.STORES.PRODUCTS);
            UIUtils.toast('끊어진 도료 연결을 비웠습니다.', 'success');
            openPaintValidationModal();
        });
    }

    function deleteUnlinkedPaintFromValidation(paintId) {
        const paint = Storage.getById(PAINT_STORE, paintId);
        if (!paint) {
            UIUtils.toast('도료 정보를 찾을 수 없습니다.', 'error');
            return;
        }
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const stillLinked = products.some(product =>
            (product.paintMaterials || []).some(row =>
                row.mainId === paintId ||
                row.paintMaterialId === paintId ||
                row.hardId === paintId ||
                row.thinnerId === paintId
            )
        );
        if (stillLinked) {
            UIUtils.toast('제품정보에 연결된 도료는 여기서 삭제할 수 없습니다.', 'warning');
            openPaintValidationModal();
            return;
        }
        UIUtils.confirm(`제품정보 미연결 도료 "${paint.name || '-'}"를 삭제하시겠습니까?`, async () => {
            await Storage.remove(PAINT_STORE, paintId);
            await Storage.refresh(PAINT_STORE);
            UIUtils.toast('미연결 도료를 삭제했습니다.', 'success');
            openPaintValidationModal();
        });
    }

    function openAddPaintModal() {
        UIUtils.showModal('도료 정보 추가', `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">구매처</label>
                    <select class="form-select" id="addPaintSupplier">
                        ${_paintSelectOptions('supplier', '', ['페인트마당', '로얄페인트', 'KCC', '노루페인트'])}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">도료명 <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="addPaintName" placeholder="예: PRIMER BLACK, TOP WHITE">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">제조사</label>
                    <select class="form-select" id="addPaintManufacturer">
                        ${_paintSelectOptions('manufacturer', '', ['NOROO', 'KCC', 'PPG', 'YULIM', 'REDSOPT', 'ORIGIN'])}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">도료종류</label>
                    <select class="form-select" id="addPaintType">
                        <option value="">-- 선택 --</option>
                        <option value="주제">주제</option>
                        <option value="경화제">경화제</option>
                        <option value="희석제">희석제</option>
                        <option value="안료">안료</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">도료 사양</label>
                    <select class="form-select" id="addPaintSpec">
                        <option value="">-- 선택 --</option>
                        <option value="Primer">Primer</option>
                        <option value="Color">Color</option>
                        <option value="Clear">Clear</option>
                        <option value="공용">공용</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">포장 용량 (KG)</label>
                    <input type="number" class="form-input" id="addPaintPackUnit" placeholder="KG 제외 숫자만 입력 (예: 20)">
                </div>
                <div class="form-group">
                    <label class="form-label">매입 단가 (원)</label>
                    <input type="number" class="form-input" id="addPaintPurchasePrice" placeholder="0">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">유효기한</label>
                    <select class="form-select" id="addPaintShelfLife">
                        ${_paintShelfLifeOptions('')}
                    </select>
                </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SettingsModule.savePaint()">추가</button>
        `);
    }

    async function savePaint() {
        const supplier = document.getElementById('addPaintSupplier').value.trim();
        const name = document.getElementById('addPaintName').value.trim();
        const manufacturer = document.getElementById('addPaintManufacturer').value.trim();
        const packUnit = document.getElementById('addPaintPackUnit').value.trim();
        const shelfLife = document.getElementById('addPaintShelfLife').value.trim();
        const paintType = document.getElementById('addPaintType').value;
        const paintSpec = document.getElementById('addPaintSpec').value;

        if (!name) {
            UIUtils.toast('도료명을 입력하세요.', 'warning');
            return;
        }

        await Storage.add(PAINT_STORE, {
            supplier,
            name,
            manufacturer,
            packUnit,
            purchasePrice: document.getElementById('addPaintPurchasePrice').value.trim(),
            shelfLife,
            paintType,
            paintSpec
        });
        UIUtils.closeModal();
        UIUtils.toast('도료 정보가 추가되었습니다.', 'success');
        renderTabContent();
    }

    function editPaint(id, returnToValidation = false) {
        const p = Storage.getById(PAINT_STORE, id);
        if (!p) return;

        UIUtils.showModal('도료 정보 수정', `
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">구매처</label>
                    <select class="form-select" id="editPaintSupplier">
                        ${_paintSelectOptions('supplier', p.supplier || '', ['페인트마당', '로얄페인트', 'KCC', '노루페인트'])}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">도료명 <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="editPaintName" value="${p.name || ''}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">제조사</label>
                    <select class="form-select" id="editPaintManufacturer">
                        ${_paintSelectOptions('manufacturer', p.manufacturer || '', ['NOROO', 'KCC', 'PPG', 'YULIM', 'REDSOPT', 'ORIGIN'])}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">도료종류</label>
                    <select class="form-select" id="editPaintType">
                        <option value="">-- 선택 --</option>
                        <optgroup label="도료">
                            <option value="주제"    ${p.paintType === '주제'    ? 'selected' : ''}>주제</option>
                            <option value="경화제"  ${p.paintType === '경화제'  ? 'selected' : ''}>경화제</option>
                            <option value="희석제"  ${p.paintType === '희석제'  ? 'selected' : ''}>희석 신너</option>
                            <option value="안료"    ${p.paintType === '안료'    ? 'selected' : ''}>안료</option>
                        </optgroup>
                        <optgroup label="세척제">
                            <option value="IPA세척제" ${p.paintType === 'IPA세척제' ? 'selected' : ''}>IPA 세척제</option>
                            <option value="세척신너"  ${p.paintType === '세척신너'  ? 'selected' : ''}>세척신너</option>
                            <option value="세척제"    ${p.paintType === '세척제'    ? 'selected' : ''}>기타 세척제</option>
                        </optgroup>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">도료 사양</label>
                    <select class="form-select" id="editPaintSpec">
                        <option value="">-- 선택 --</option>
                        <option value="Primer" ${p.paintSpec === 'Primer' ? 'selected' : ''}>Primer</option>
                        <option value="Color"  ${p.paintSpec === 'Color'  ? 'selected' : ''}>Color</option>
                        <option value="Clear"  ${p.paintSpec === 'Clear'  ? 'selected' : ''}>Clear</option>
                        <option value="공용"   ${p.paintSpec === '공용'   ? 'selected' : ''}>공용</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">포장 용량 (KG)</label>
                    <input type="number" class="form-input" id="editPaintPackUnit" value="${p.packUnit || ''}" placeholder="KG 제외 숫자만 입력 (예: 20)">
                </div>
                <div class="form-group">
                    <label class="form-label">매입 단가 (원)</label>
                    <input type="number" class="form-input" id="editPaintPurchasePrice" value="${p.purchasePrice || ''}" placeholder="0">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">유효기한</label>
                    <select class="form-select" id="editPaintShelfLife">
                        ${_paintShelfLifeOptions(p.shelfLife || '')}
                    </select>
                </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="${returnToValidation ? 'SettingsModule.openPaintValidationModal()' : 'UIUtils.closeModal()'}">취소</button>
            <button class="btn btn-primary" onclick="SettingsModule.updatePaint('${id}', ${returnToValidation ? 'true' : 'false'})">저장</button>
        `);
    }

    async function updatePaint(id, returnToValidation = false) {
        const supplier = document.getElementById('editPaintSupplier').value.trim();
        const name = document.getElementById('editPaintName').value.trim();
        const manufacturer = document.getElementById('editPaintManufacturer').value.trim();
        const packUnit = document.getElementById('editPaintPackUnit').value.trim();
        const shelfLife = document.getElementById('editPaintShelfLife').value.trim();
        const paintType = document.getElementById('editPaintType').value;
        const paintSpec = document.getElementById('editPaintSpec').value;

        if (!name) {
            UIUtils.toast('도료명을 입력하세요.', 'warning');
            return;
        }

        await Storage.update(PAINT_STORE, id, {
            supplier,
            name,
            manufacturer,
            packUnit,
            purchasePrice: document.getElementById('editPaintPurchasePrice').value.trim(),
            shelfLife,
            paintType,
            paintSpec
        });
        UIUtils.closeModal();
        UIUtils.toast('도료 정보가 수정되었습니다.', 'success');
        if (returnToValidation) {
            openPaintValidationModal();
        } else {
            renderTabContent();
        }
    }

    function removePaint(id) {
        UIUtils.confirm('삭제하시겠습니까?', async () => {
            await Storage.remove(PAINT_STORE, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            renderTabContent();
        });
    }

    // =====================================================
    // 도료 CSV 다운로드 / 일괄 업로드
    // =====================================================
    // 열 정의 (순서 고정)
    const PAINT_COLUMNS = [{
            key: 'supplier',
            label: '구매처'
        },
        {
            key: 'name',
            label: '도료명'
        },
        {
            key: 'manufacturer',
            label: '제조사'
        },
        {
            key: 'paintType',
            label: '도료종류'
        },
        {
            key: 'paintSpec',
            label: '도료사양'
        },
        {
            key: 'packUnit',
            label: '포장단위'
        },
        {
            key: 'purchasePrice',
            label: '매입단가'
        },
        {
            key: 'shelfLife',
            label: '유효기한'
        },
        {
            key: 'usage',
            label: '사용용도'
        },
        {
            key: 'itemType',
            label: '품목구분'
        }
    ];

    function downloadPaintCSV() {
        const paints = Storage.getAll(PAINT_STORE);
        const headers = PAINT_COLUMNS.map(c => c.label);
        const rows = paints.length > 0 ?
            paints.map(p => PAINT_COLUMNS.map(c => p[c.key] || '')) : [PAINT_COLUMNS.map(() => '')]; // 데이터 없으면 빈 행 1줄

        Storage.exportToCSV(headers, rows, '도료_정보');
        UIUtils.toast('CSV 다운로드 완료 (엑셀에서 열어 편집 후 재업로드 하세요)', 'success');
    }

    // CSV/TSV 한 줄 파싱 (따옴표 처리 포함)
    function _parseCSVLine(line, sep) {
        const result = [];
        let cur = '';
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
                if (inQuote && line[i + 1] === '"') {
                    cur += '"';
                    i++;
                } else inQuote = !inQuote;
            } else if (ch === sep && !inQuote) {
                result.push(cur.trim());
                cur = '';
            } else {
                cur += ch;
            }
        }
        result.push(cur.trim());
        return result;
    }

    // 텍스트 → 도료 객체 배열 변환
    // 헤더가 있으면 열 이름으로 매핑, 없으면 순서(인덱스)로 처리
    function _parsePaintText(text) {
        const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n');
        if (!lines.length) return [];

        // 구분자 자동 감지 (탭 우선 → 쉼표)
        const sep = lines[0].includes('\t') ? '\t' : ',';

        const parsed = lines.map(l => _parseCSVLine(l, sep));

        // 헤더 감지 키워드 (한글/영문 모두 지원)
        const headerKeywords = ['도료명', 'name', '구매처', 'supplier', '제조사', '매입단가', 'purchaseprice'];
        const firstRow = parsed[0].map(c => c.toLowerCase().replace(/^\uFEFF/, '')); // BOM 제거
        const isHeader = headerKeywords.some(kw => firstRow.includes(kw.toLowerCase()));

        // 한글 헤더명 → 필드 key 매핑 테이블
        const LABEL_TO_KEY = {};
        PAINT_COLUMNS.forEach(col => {
            LABEL_TO_KEY[col.label.toLowerCase()] = col.key; // 예: '매입단가' → 'purchasePrice'
            LABEL_TO_KEY[col.key.toLowerCase()] = col.key; // 예: 'purchaseprice' → 'purchasePrice'
        });

        if (isHeader) {
            // 헤더 기반 매핑: 헤더 행의 각 열 이름 → 필드 key 대응표 생성
            const colMap = firstRow.map(h => LABEL_TO_KEY[h.trim().toLowerCase()] || null);
            const dataRows = parsed.slice(1);

            return dataRows
                .filter(row => row.some(c => c !== ''))
                .map(row => {
                    const obj = {
                        supplier: '',
                        name: '',
                        manufacturer: '',
                        paintType: '',
                        paintSpec: '',
                        packUnit: '',
                        purchasePrice: '',
                        shelfLife: '',
                        usage: ''
                    };
                    colMap.forEach((key, i) => {
                        if (key && row[i] !== undefined) {
                            // 매입단가는 쉼표(천단위 구분자) 제거 후 저장
                            obj[key] = key === 'purchasePrice' ?
                                String(row[i]).replace(/,/g, '') :
                                row[i];
                        }
                    });
                    return obj;
                })
                .filter(p => p.name);
        } else {
            // 헤더 없음: 순서(인덱스) 기반 매핑 (A~I 순서)
            return parsed
                .filter(row => row.some(c => c !== ''))
                .map(row => ({
                    supplier: row[0] || '',
                    name: row[1] || '',
                    manufacturer: row[2] || '',
                    paintType: row[3] || '',
                    paintSpec: row[4] || '',
                    packUnit: row[5] || '',
                    // 쉼표(천단위 구분자) 제거 후 저장
                    purchasePrice: String(row[6] || '').replace(/,/g, ''),
                    shelfLife: row[7] || '',
                    usage: row[8] || ''
                }))
                .filter(p => p.name);
        }
    }

    // 미리보기 테이블 렌더링
    function _renderUploadPreview(rows) {
        const previewBox = document.getElementById('paintUploadPreview');
        const confirmBtn = document.getElementById('paintUploadConfirmBtn');
        if (!rows.length) {
            previewBox.innerHTML = '<p style="color:var(--accent-red);padding:8px;">유효한 데이터가 없습니다. 열 순서를 확인해주세요.</p>';
            confirmBtn.style.display = 'none';
            return;
        }

        const valid = rows.filter(r => r.name).length;
        previewBox.innerHTML = `
            <div style="margin-bottom:8px;font-size:0.85rem;color:var(--text-secondary);">
                총 <strong>${rows.length}건</strong> 인식됨 (도료명 유효: <strong style="color:var(--accent-green)">${valid}건</strong>)
            </div>
            <div style="overflow-x:auto;max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;">
                <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
                    <thead>
                        <tr style="background:var(--bg-secondary);position:sticky;top:0;">
                            ${PAINT_COLUMNS.map(c => `<th style="padding:6px 10px;text-align:left;white-space:nowrap;color:var(--text-secondary);">${c.label}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${rows.map(r => `
                            <tr style="border-top:1px solid var(--border);">
                                <td style="padding:5px 10px;">${r.supplier || '-'}</td>
                                <td style="padding:5px 10px;font-weight:600;">${r.name || '<span style="color:var(--accent-red)">없음</span>'}</td>
                                <td style="padding:5px 10px;">${r.manufacturer || '-'}</td>
                                <td style="padding:5px 10px;">${r.paintType || '-'}</td>
                                <td style="padding:5px 10px;">${r.paintSpec || '-'}</td>
                                <td style="padding:5px 10px;">${r.packUnit || '-'}</td>
                                <td style="padding:5px 10px;text-align:right;">${r.purchasePrice || '-'}</td>
                                <td style="padding:5px 10px;">${r.shelfLife || '-'}</td>
                                <td style="padding:5px 10px;">${r.usage || '-'}</td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;
        confirmBtn.style.display = '';
        window._paintUploadRows = rows;
    }

    function openPaintUploadModal() {
        window._paintUploadRows = [];
        const colGuide = PAINT_COLUMNS.map((c, i) => `<span style="background:var(--bg-primary);border-radius:4px;padding:2px 6px;">${String.fromCharCode(65 + i)}: ${c.label}</span>`).join(' ');

        UIUtils.showModal('도료 정보 일괄 업로드', `
            <div style="background:var(--bg-secondary);border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:0.825rem;line-height:1.7;">
                <div style="font-weight:600;margin-bottom:6px;">📋 열 순서 (엑셀 A~H열)</div>
                <div style="display:flex;flex-wrap:wrap;gap:6px;">${colGuide}</div>
            </div>

            <div style="margin-bottom:4px;">
                <label class="form-label" style="margin-bottom:4px;">① CSV 파일 선택 <span style="color:var(--text-muted);font-weight:400;">(.csv)</span></label>
                <input type="file" id="paintUploadFile" accept=".csv,.tsv,.txt"
                    class="form-input" style="padding:6px;"
                    onchange="SettingsModule.handlePaintUploadFile(this)">
            </div>

            <div style="text-align:center;color:var(--text-muted);padding:8px 0;font-size:0.85rem;">— 또는 —</div>

            <div style="margin-bottom:14px;">
                <label class="form-label" style="margin-bottom:4px;">② 엑셀에서 복사 후 붙여넣기 <span style="color:var(--text-muted);font-weight:400;">(헤더 포함 가능)</span></label>
                <textarea id="paintUploadText" class="form-textarea" rows="7"
                    placeholder="엑셀에서 A~G열 범위를 선택 → Ctrl+C → 여기서 Ctrl+V"
                    style="font-family:monospace;font-size:0.8rem;resize:vertical;"
                    oninput="SettingsModule.handlePaintUploadText()"></textarea>
            </div>

            <div id="paintUploadPreview" style="margin-bottom:12px;"></div>

            <div id="paintUploadOptions" style="display:none;padding:12px 16px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--border);">
                <div style="font-weight:600;font-size:0.85rem;margin-bottom:10px;color:var(--text-primary);">📂 업로드 방식 선택</div>
                <div style="display:flex;flex-direction:column;gap:8px;">
                    <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:10px 12px;border-radius:8px;border:2px solid transparent;background:white;" id="paintUploadModeAppendLabel">
                        <input type="radio" name="paintUploadMode" value="append" id="paintUploadModeAppend" style="margin-top:3px;" checked onchange="SettingsModule.onPaintUploadModeChange()">
                        <span>
                            <span style="font-weight:600;color:var(--accent-blue);">➕ 추가</span>
                            <span style="display:block;font-size:0.78rem;color:var(--text-muted);margin-top:2px;">기존 데이터를 유지하고 파일의 모든 항목을 새로 추가합니다.</span>
                        </span>
                    </label>
                    <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:10px 12px;border-radius:8px;border:2px solid transparent;background:white;" id="paintUploadModeMergeLabel">
                        <input type="radio" name="paintUploadMode" value="merge" id="paintUploadModeMerge" style="margin-top:3px;" onchange="SettingsModule.onPaintUploadModeChange()">
                        <span>
                            <span style="font-weight:600;color:var(--accent-green);">🔄 스마트 병합 (중복 방지)</span>
                            <span style="display:block;font-size:0.78rem;color:var(--text-muted);margin-top:2px;">구매처 + 원료명이 같은 항목은 <strong>덮어씁니다</strong>. 새 항목은 추가합니다.</span>
                        </span>
                    </label>
                    <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;padding:10px 12px;border-radius:8px;border:2px solid transparent;background:white;" id="paintUploadModeReplaceLabel">
                        <input type="radio" name="paintUploadMode" value="replace" id="paintUploadModeReplace" style="margin-top:3px;" onchange="SettingsModule.onPaintUploadModeChange()">
                        <span>
                            <span style="font-weight:600;color:var(--accent-red);">🗑️ 전체 교체</span>
                            <span style="display:block;font-size:0.78rem;color:var(--accent-red);margin-top:2px;">⚠️ 기존 도료 정보를 모두 삭제하고 파일 내용으로 교체합니다.</span>
                        </span>
                    </label>
                </div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" id="paintUploadConfirmBtn" style="display:none;"
                onclick="SettingsModule.confirmPaintUpload()">
                <span class="material-symbols-outlined">upload</span> 업로드 확인
            </button>
        `);
    }

    function handlePaintUploadFile(input) {
        const file = input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            const text = e.target.result;
            document.getElementById('paintUploadText').value = ''; // 텍스트 박스 초기화
            const rows = _parsePaintText(text);
            _renderUploadPreview(rows);
            document.getElementById('paintUploadOptions').style.display = rows.length ? '' : 'none';
        };
        reader.readAsText(file, 'UTF-8');
    }

    function handlePaintUploadText() {
        const text = document.getElementById('paintUploadText').value;
        if (!text.trim()) {
            document.getElementById('paintUploadPreview').innerHTML = '';
            document.getElementById('paintUploadConfirmBtn').style.display = 'none';
            document.getElementById('paintUploadOptions').style.display = 'none';
            return;
        }
        const rows = _parsePaintText(text);
        _renderUploadPreview(rows);
        document.getElementById('paintUploadOptions').style.display = rows.length ? '' : 'none';
    }

    // 업로드 모드 변경 시 선택된 라디오의 배경색 강조
    function onPaintUploadModeChange() {
        const ids = ['paintUploadModeAppend', 'paintUploadModeMerge', 'paintUploadModeReplace'];
        const colors = {
            'paintUploadModeAppend': 'var(--accent-blue)',
            'paintUploadModeMerge': 'var(--accent-green)',
            'paintUploadModeReplace': 'var(--accent-red)'
        };
        ids.forEach(id => {
            const el = document.getElementById(id);
            const label = document.getElementById(id + 'Label');
            if (!el || !label) return;
            if (el.checked) {
                label.style.borderColor = colors[id];
                label.style.background = 'var(--bg-primary)';
            } else {
                label.style.borderColor = 'transparent';
                label.style.background = 'white';
            }
        });
    }

    async function confirmPaintUpload() {
        const rows = window._paintUploadRows || [];
        if (!rows.length) {
            UIUtils.toast('업로드할 데이터가 없습니다.', 'warning');
            return;
        }

        // 선택된 업로드 모드 파악
        const modeEl = document.querySelector('input[name="paintUploadMode"]:checked');
        const mode = modeEl ? modeEl.value : 'append'; // append | merge | replace

        const ts = new Date().toISOString();
        let added = 0;
        let updated = 0;

        // 기존 도료 마스터: supplier+name 키 → 기존 레코드 맵
        const existing = Storage.getAll(PAINT_STORE);
        const existingMap = {};
        existing.forEach(item => {
            const key = `${(item.supplier || '').trim()}||${(item.name || '').trim()}`;
            existingMap[key] = item;
        });

        function _paintKey(r) {
            return `${(r.supplier || '').trim()}||${(r.name || '').trim()}`;
        }

        // 기존 ID 보존 또는 신규 ID 생성
        function _resolveItem(row) {
            const match = existingMap[_paintKey(row)];
            return {
                id:        match ? match.id        : Storage.generateId(),
                createdAt: match ? match.createdAt : ts,
                ...row
            };
        }

        try {
            if (mode === 'replace') {
                // 전체 교체:
                //  1) 업로드 목록에 없는 기존 항목 → DELETE
                //  2) 업로드 항목 → PUT upsert (기존 ID 보존으로 참조 깨짐 방지)
                const newItems = rows.filter(r => r.name).map(_resolveItem);
                const newIdSet = new Set(newItems.map(i => i.id));

                // 새 목록에 없는 기존 항목 삭제
                let deleted = 0;
                for (const old of existing) {
                    if (!newIdSet.has(old.id)) {
                        await ApiClient.remove(PAINT_STORE, old.id);
                        deleted++;
                    }
                }

                // 각 항목을 PUT(upsert)으로 저장
                for (const item of newItems) {
                    await ApiClient.save(PAINT_STORE, item);
                    added++;
                }

                UIUtils.toast(`${added}건 업로드 완료 (${deleted}건 삭제, 기존 ID 보존)`, 'success');

            } else if (mode === 'merge') {
                // 스마트 병합: supplier+name 키 일치 시 기존 ID 유지하고 덮어쓰기, 없으면 추가
                const cacheArr = Storage.getAll(PAINT_STORE);
                for (const row of rows) {
                    if (!row.name) continue;
                    const match = existingMap[_paintKey(row)];
                    if (match) {
                        const merged = { ...match, ...row, id: match.id, createdAt: match.createdAt };
                        await ApiClient.save(PAINT_STORE, merged);
                        const idx = cacheArr.findIndex(c => c.id === match.id);
                        if (idx !== -1) cacheArr[idx] = merged;
                        updated++;
                    } else {
                        const newItem = _resolveItem(row);
                        await ApiClient.save(PAINT_STORE, newItem);
                        cacheArr.push(newItem);
                        added++;
                    }
                }
                UIUtils.toast(`업로드 완료 — 신규: ${added}건, 덮어쓰기: ${updated}건`, 'success');

            } else {
                // 추가(append): 동일 supplier+name이 이미 있으면 건너뜀 (중복 방지)
                const cacheArr = Storage.getAll(PAINT_STORE);
                let skipped = 0;
                for (const row of rows) {
                    if (!row.name) continue;
                    if (existingMap[_paintKey(row)]) { skipped++; continue; }
                    const newItem = _resolveItem(row);
                    await ApiClient.save(PAINT_STORE, newItem);
                    cacheArr.push(newItem);
                    existingMap[_paintKey(newItem)] = newItem; // 같은 배치 내 중복 방지
                    added++;
                }
                const msg = skipped > 0 ? `${added}건 추가, ${skipped}건 중복 건너뜀` : `${added}건 추가 완료`;
                UIUtils.toast(msg, 'success');
            }

            // DB 최신 상태로 캐시 재동기화
            await Storage.refresh(PAINT_STORE);

            UIUtils.closeModal();
            renderTabContent();
        } catch (e) {
            console.error('도료 업로드 실패:', e);
            UIUtils.toast('저장 실패: ' + e.message, 'error');
        }
    }

    // =====================================================
    // 백업/복원 탭
    // =====================================================
    function renderBackupTab(el) {
        el.innerHTML = `

            <!-- ── 저장 영역 안내 배너 ─────────────────────────────── -->
            <div style="margin-bottom:20px;padding:16px 20px;border-radius:12px;
                        background:linear-gradient(135deg,#1e3a5f 0%,#1e40af 100%);color:#fff;">
                <div style="font-size:1rem;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:8px;">
                    <span class="material-symbols-outlined" style="font-size:22px;">storage</span>
                    MES 데이터 보호 구조
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;font-size:.82rem;">
                    <div style="background:rgba(255,255,255,0.12);border-radius:8px;padding:12px;">
                        <div style="font-weight:700;margin-bottom:4px;display:flex;align-items:center;gap:6px;">
                            <span class="material-symbols-outlined" style="font-size:16px;">computer</span>
                            MES 서버 DB
                        </div>
                        <div style="color:rgba(255,255,255,0.8);line-height:1.55;">
                            운영 데이터의 <b>1차 저장소</b><br>
                            웹서버 로컬 MariaDB에 저장<br>
                            여러 PC가 같은 데이터를 사용
                        </div>
                    </div>
                    <div style="background:rgba(255,255,255,0.12);border-radius:8px;padding:12px;">
                        <div style="font-weight:700;margin-bottom:4px;display:flex;align-items:center;gap:6px;">
                            <span class="material-symbols-outlined" style="font-size:16px;">computer</span>
                            브라우저 캐시
                        </div>
                        <div style="color:rgba(255,255,255,0.8);line-height:1.55;">
                            IndexedDB는 <b>오프라인 조회용 캐시</b><br>
                            서버 장애 시 최근 데이터 확인<br>
                            저장·수정은 서버 연결 필요
                        </div>
                    </div>
                    <div style="background:rgba(255,255,255,0.12);border-radius:8px;padding:12px;">
                        <div style="font-weight:700;margin-bottom:4px;display:flex;align-items:center;gap:6px;">
                            <span class="material-symbols-outlined" style="font-size:16px;">hard_drive</span>
                            서버 자동 백업
                        </div>
                        <div style="color:rgba(255,255,255,0.8);line-height:1.55;">
                            서버 DB를 <b>JSON 파일</b>로 저장<br>
                            로컬 백업 폴더에 주기 보관<br>
                            DB 손상·실수 삭제 시 복구
                        </div>
                    </div>
                    <div style="background:rgba(255,255,255,0.12);border-radius:8px;padding:12px;">
                        <div style="font-weight:700;margin-bottom:4px;display:flex;align-items:center;gap:6px;">
                            <span class="material-symbols-outlined" style="font-size:16px;">folder_zip</span>
                            NAS / 수동 백업
                        </div>
                        <div style="color:rgba(255,255,255,0.8);line-height:1.55;">
                            NAS는 <b>서버 장애 대비 복사본</b><br>
                            로컬 PC JSON은 임시 반출용<br>
                            새 서버 구축·자료 이관에 사용
                        </div>
                    </div>
                </div>
            </div>

            <!-- ── 데이터 백업 (수동 JSON 내보내기) ──────────────────── -->
            <div class="card" style="margin-bottom:20px;">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">cloud_download</span> 수동 파일 백업 <span style="font-size:.72rem;font-weight:400;color:var(--text-muted);margin-left:6px;">현재 화면 데이터 → PC 다운로드 JSON</span></h4>
                </div>
                <div class="card-body" style="display:flex;flex-direction:column;gap:14px;">

                    <!-- 백업 대상 설명 -->
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;">
                        <div style="padding:10px 12px;border-radius:8px;background:#f0fdf4;border:1px solid #86efac;">
                            <div style="font-size:.75rem;font-weight:700;color:#166534;margin-bottom:6px;">✅ 백업 대상</div>
                            <div style="font-size:.78rem;color:#166534;line-height:1.65;">
                                현재 브라우저에 동기화된 MES 데이터<br>
                                제품·자재·도료 마스터<br>
                                생산계획, 공정일지, 검사기록<br>
                                재고, 출하, 품질, 설비, JIG 기록<br>
                                서버와 동기화된 최신 상태에서 실행 권장
                            </div>
                        </div>
                        <div style="padding:10px 12px;border-radius:8px;background:#fff7ed;border:1px solid #fdba74;">
                            <div style="font-size:.75rem;font-weight:700;color:#9a3412;margin-bottom:6px;">💡 언제 사용하나요?</div>
                            <div style="font-size:.78rem;color:#9a3412;line-height:1.65;">
                                • 서버 자동 백업 외에 파일을 따로 보관할 때<br>
                                • 작업 전후 수동 스냅샷이 필요할 때<br>
                                • 다른 PC나 테스트 환경으로 자료를 옮길 때<br>
                                • 서버 연결이 불안정해 임시 보관이 필요할 때<br>
                                • 정식 장애 대비는 서버/NAS 백업 사용
                            </div>
                        </div>
                        <div style="padding:10px 12px;border-radius:8px;background:#eff6ff;border:1px solid #93c5fd;">
                            <div style="font-size:.75rem;font-weight:700;color:#1e3a8a;margin-bottom:6px;">📁 저장 위치</div>
                            <div style="font-size:.78rem;color:#1e3a8a;line-height:1.65;">
                                사용자 PC 다운로드 폴더<br>
                                <code style="background:#dbeafe;padding:1px 4px;border-radius:3px;">mes-backup-YYYYMMDD.json</code><br><br>
                                USB·외장하드·보안 공유 폴더 등에<br>
                                임시 보관 가능
                            </div>
                        </div>
                    </div>

                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        <button class="btn btn-primary" onclick="SettingsModule.backupAll()">
                            <span class="material-symbols-outlined">download</span> 수동 백업 파일 다운로드
                        </button>
                        <span style="font-size:.78rem;color:var(--text-muted);">현재 브라우저가 가진 데이터를 하나의 JSON 파일로 내려받습니다.</span>
                    </div>
                </div>
            </div>

            <!-- ── 데이터 복원 (로컬 JSON 가져오기) ──────────────────── -->
            <div class="card" style="margin-bottom:20px;">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">cloud_upload</span> 수동 파일 복원 <span style="font-size:.72rem;font-weight:400;color:var(--text-muted);margin-left:6px;">PC JSON 파일 → 브라우저 캐시</span></h4>
                </div>
                <div class="card-body" style="display:flex;flex-direction:column;gap:14px;">

                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;">
                        <div style="padding:10px 12px;border-radius:8px;background:#fef2f2;border:1px solid #fca5a5;">
                            <div style="font-size:.75rem;font-weight:700;color:#991b1b;margin-bottom:6px;">⚠️ 주의사항</div>
                            <div style="font-size:.78rem;color:#991b1b;line-height:1.65;">
                                이 복원은 <b>브라우저 캐시</b>를 파일 내용으로 교체합니다.<br>
                                서버 운영 DB 복구는 위 <b>서버 자동 백업</b>의 복원을 사용하세요.<br>
                                실행 전 현재 서버 상태와 백업 시점을 확인하세요.
                            </div>
                        </div>
                        <div style="padding:10px 12px;border-radius:8px;background:#fff7ed;border:1px solid #fdba74;">
                            <div style="font-size:.75rem;font-weight:700;color:#9a3412;margin-bottom:6px;">💡 언제 사용하나요?</div>
                            <div style="font-size:.78rem;color:#9a3412;line-height:1.65;">
                                • 파일로 내려받은 자료를 임시 확인할 때<br>
                                • 오프라인 캐시를 특정 시점으로 되돌릴 때<br>
                                • 다른 PC 브라우저에 자료를 옮길 때<br>
                                • 운영 DB 복구 목적이면 서버/NAS 복원 사용
                            </div>
                        </div>
                    </div>

                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        <input type="file" id="restoreFileInput" accept=".json" style="display:none;"
                            onchange="SettingsModule.restoreFromFile(this)">
                        <button class="btn btn-secondary" onclick="document.getElementById('restoreFileInput').click()">
                            <span class="material-symbols-outlined">upload</span> 수동 백업 파일 선택
                        </button>
                        <span style="font-size:.78rem;color:var(--text-muted);">
                            <code style="background:var(--bg-secondary);padding:1px 5px;border-radius:3px;">mes-backup-*.json</code> 파일만 인식됩니다.
                        </span>
                    </div>
                </div>
            </div>

            <!-- ── 데이터 현황 ─────────────────────────────────────────── -->
            <div class="card">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">analytics</span> 현재 화면 데이터 현황 <span style="font-size:.72rem;font-weight:400;color:var(--text-muted);margin-left:6px;">브라우저 캐시 기준</span></h4>
                </div>
                <div class="card-body" id="dataStatusInfo"></div>
            </div>
        `;

        renderDataStatus();
    }

    function renderDataStatus() {
        const stores = Object.entries(DB.STORES).filter(([k, v]) => v !== 'config');
        const el = document.getElementById('dataStatusInfo');

        const storeLabels = {
            PRODUCTS: '제품 마스터',
            DEFECT_TYPES: '불량 유형',
            PRODUCTION_PLANS: '생산 계획',
            INJECTION_INSPECTIONS: '사출 수입검사',
            INJECTION_INVENTORY: '사출 재고',
            PAINTING_INCOMING: '도장 입고',
            PAINTING_WORK: '도장 작업일지',
            PAINT_MATERIALS: '도료 정보',
            PAINT_INVENTORY: '도료 재고 관리',
            PAINTING_INSPECTIONS: '도장 검사',
            PAINTING_OUTGOING: '도장 출고',
            SHIPPING_STANDBY: '출하 대기',
            SHIPPING_INSPECTIONS: '출하 검사',
            PRODUCT_INVENTORY: '제품 재고',
            PRODUCT_OUTGOING: '제품 출고'
        };

        el.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;">
                ${stores.map(([key, storeName]) => {
            const count = Storage.getAll(storeName).length;
            return `
                        <div style="padding:12px;background:var(--bg-primary);border-radius:6px;border:1px solid var(--border-color);">
                            <div style="font-size:0.8rem;color:var(--text-muted);">${storeLabels[key] || key}</div>
                            <div style="font-size:1.3rem;font-weight:700;margin-top:4px;">${count}건</div>
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    }

    function backupAll() {
        const backup = {};
        const stores = Object.entries(DB.STORES).filter(([k, v]) => v !== 'config');
        stores.forEach(([key, storeName]) => {
            backup[storeName] = Storage.getAll(storeName);
        });

        backup._meta = {
            exportDate: new Date().toISOString(),
            version: '2.0',
            system: '생산 공정 관리 시스템 (MES)'
        };

        Storage.exportJSON(backup, 'MES_전체백업');
        UIUtils.toast('전체 백업이 완료되었습니다.', 'success');
    }

    function restoreFromFile(input) {
        const file = input.files[0];
        if (!file) return;

        UIUtils.confirm('⚠️ 현재 모든 데이터가 삭제되고 백업 파일로 대체됩니다. 복원하시겠습니까?', () => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = JSON.parse(e.target.result);

                    // 각 스토어 복원
                    const stores = Object.entries(DB.STORES).filter(([k, v]) => v !== 'config');
                    for (const [key, storeName] of stores) {
                        if (data[storeName] && Array.isArray(data[storeName])) {
                            await DB.clear(storeName);
                            await DB.saveAll(storeName, data[storeName]);
                        }
                    }

                    // 캐시 재로드
                    await Storage.init();

                    UIUtils.toast('데이터 복원이 완료되었습니다!', 'success');
                    renderTabContent();
                } catch (error) {
                    UIUtils.toast('복원 실패: 올바른 백업 파일이 아닙니다.', 'error');
                    console.error('복원 오류:', error);
                }
            };
            reader.readAsText(file);
        });
    }

    // =====================================================
    // =====================================================
    // 사출 LOT 번호 형식 검증 / 수정
    // =====================================================

    /** LOT 번호 유효성 검사 — YYMMDD 6자리 숫자, 실제 존재하는 날짜 */
    function _isValidLot(v) {
        if (!v) return false;
        const s = String(v).trim();
        if (!/^\d{6}$/.test(s)) return false;
        const yy = parseInt(s.slice(0, 2), 10);
        const mm = parseInt(s.slice(2, 4), 10);
        const dd = parseInt(s.slice(4, 6), 10);
        const fy = yy >= 50 ? 1900 + yy : 2000 + yy;
        const d  = new Date(fy, mm - 1, dd);
        return d.getFullYear() === fy && d.getMonth() === mm - 1 && d.getDate() === dd;
    }

    /**
     * 잘못된 LOT 번호를 수정 시도.
     * 우선순위: ① 입고일 기반 파생(YYMMDD) → ② 자릿수 보충 → ③ 불가
     *
     * 5자리 예시: lotNo='26010', date='2026-04-09 18:28'
     *   → 입고일 파생 '260409' 우선 (자릿수 보충 '260101'은 기존 LOT와 충돌 가능)
     *
     * @param {string} lotNo  원본 LOT
     * @param {string} dateStr 입고일 (YYYY-MM-DD 또는 YYYY-MM-DD HH:MM)
     * @returns {string|null}  수정된 LOT (실패 시 null)
     */
    function _fixLot(lotNo, dateStr) {
        if (_isValidLot(lotNo)) return lotNo; // 이미 유효

        const digits = String(lotNo || '').replace(/\D/g, '');

        // ① 입고일 기반 파생 — 모든 케이스에서 최우선 시도
        //   (자릿수 보충은 기존 LOT와 충돌할 수 있어 차선책으로 사용)
        const derived = _lotFromDate(dateStr);
        if (derived) return derived;

        // ② 자릿수 보충 (입고일 파생 불가 시 폴백)

        // 6자리지만 날짜 오류 → 입고일도 없으면 수정 불가
        if (digits.length === 6) {
            return null;
        }

        // 5자리 → 마지막 자리 보충 시도
        if (digits.length === 5) {
            // 앞 4자리(YYMM)가 유효하면 01일 사용
            const withDay = digits + '01';
            if (_isValidLot(withDay)) return withDay;
            // DD=10, 20, 30 시도
            for (const dd of ['10', '20', '30']) {
                const c = digits.slice(0, 4) + dd;
                if (_isValidLot(c)) return c;
            }
            return null;
        }

        // 3) 4자리 이하 → 입고일로 파생
        if (digits.length <= 4) {
            const derived = _lotFromDate(dateStr);
            if (derived) return derived;
            return null;
        }

        // 4) 7자리 이상 → 앞 6자리 잘라서 시도
        if (digits.length > 6) {
            const c = digits.slice(0, 6);
            if (_isValidLot(c)) return c;
            // 뒤에서 6자리
            const c2 = digits.slice(digits.length - 6);
            if (_isValidLot(c2)) return c2;
            const derived = _lotFromDate(dateStr);
            if (derived) return derived;
            return null;
        }

        return null;
    }

    /** 날짜 문자열(YYYY-MM-DD…)에서 YYMMDD 파생 */
    function _lotFromDate(dateStr) {
        if (!dateStr) return null;
        const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return null;
        const yy = m[1].slice(2);
        const candidate = yy + m[2] + m[3];
        return _isValidLot(candidate) ? candidate : null;
    }

    /** LOT 오류 이유 설명 */
    function _lotErrorReason(v) {
        if (!v || String(v).trim() === '') return '빈 값';
        const s = String(v).trim();
        if (!/^\d+$/.test(s)) return `비숫자 포함 (${s.replace(/\d/g, '').split('').slice(0,3).join('')}…)`;
        if (s.length !== 6)   return `자릿수 오류 (${s.length}자리)`;
        const mm = parseInt(s.slice(2,4), 10);
        const dd = parseInt(s.slice(4,6), 10);
        if (mm < 1 || mm > 12) return `월 오류 (MM=${mm})`;
        if (dd < 1 || dd > 31) return `일 오류 (DD=${dd})`;
        return `날짜 불일치 (MM=${mm}, DD=${dd})`;
    }

    /**
     * 스캔 전용 — 수정하지 않고 오류 목록만 반환
     */
    async function scanInjLotNumbers() {
        const resultEl = document.getElementById('lotRepairResult');
        if (resultEl) resultEl.innerHTML = '<span style="color:var(--text-muted);">스캔 중...</span>';

        const invenItems = Storage.getAll(DB.STORES.INJECTION_INVENTORY) || [];
        const inspItems  = Storage.getAll(DB.STORES.INJECTION_INSPECTIONS) || [];

        const errors = [];

        invenItems.forEach(item => {
            if (!item.lotNo || !_isValidLot(item.lotNo)) {
                const fixed = _fixLot(item.lotNo, item.date);
                errors.push({
                    src: '재고',
                    id: item.id,
                    partName: item.partName || '-',
                    color: item.color || '-',
                    date: item.date || '-',
                    original: item.lotNo || '(없음)',
                    reason: _lotErrorReason(item.lotNo),
                    suggested: fixed || '수정 불가'
                });
            }
            // lots 배열 안 LOT도 검사
            if (item.lots && Array.isArray(item.lots)) {
                item.lots.forEach((lot, idx) => {
                    if (!lot.lotNo || !_isValidLot(lot.lotNo)) {
                        const fixed = _fixLot(lot.lotNo, item.date);
                        errors.push({
                            src: `재고(lots[${idx}])`,
                            id: item.id,
                            partName: item.partName || '-',
                            color: item.color || '-',
                            date: item.date || '-',
                            original: lot.lotNo || '(없음)',
                            reason: _lotErrorReason(lot.lotNo),
                            suggested: fixed || '수정 불가'
                        });
                    }
                });
            }
        });

        inspItems.forEach(item => {
            if (!item.lotNo || !_isValidLot(item.lotNo)) {
                const fixed = _fixLot(item.lotNo, item.date);
                errors.push({
                    src: '수입검사',
                    id: item.id,
                    partName: item.partName || '-',
                    color: item.color || '-',
                    date: item.date || '-',
                    original: item.lotNo || '(없음)',
                    reason: _lotErrorReason(item.lotNo),
                    suggested: fixed || '수정 불가'
                });
            }
            if (item.lots && Array.isArray(item.lots)) {
                item.lots.forEach((lot, idx) => {
                    if (!lot.lotNo || !_isValidLot(lot.lotNo)) {
                        const fixed = _fixLot(lot.lotNo, item.date);
                        errors.push({
                            src: `수입검사(lots[${idx}])`,
                            id: item.id,
                            partName: item.partName || '-',
                            color: item.color || '-',
                            date: item.date || '-',
                            original: lot.lotNo || '(없음)',
                            reason: _lotErrorReason(lot.lotNo),
                            suggested: fixed || '수정 불가'
                        });
                    }
                });
            }
        });

        _renderLotScanResult(errors, false);
    }

    /**
     * 검증 + 자동 수정 실행
     */
    async function repairInjLotNumbers() {
        const resultEl = document.getElementById('lotRepairResult');
        if (resultEl) resultEl.innerHTML = '<span style="color:var(--text-muted);">검증 중...</span>';

        const invenItems = Storage.getAll(DB.STORES.INJECTION_INVENTORY) || [];
        const inspItems  = Storage.getAll(DB.STORES.INJECTION_INSPECTIONS) || [];

        const fixed   = [];  // 수정된 항목
        const unfixed = [];  // 수정 불가 항목

        // ── 사출 재고 ──
        for (const item of invenItems) {
            let changed = false;
            const original = { lotNo: item.lotNo, lots: item.lots ? item.lots.map(l => ({...l})) : [] };

            // 최상위 lotNo
            if (!_isValidLot(item.lotNo)) {
                const f = _fixLot(item.lotNo, item.date);
                if (f) {
                    const prev = item.lotNo;
                    item.lotNo = f;
                    fixed.push({ src:'재고', id:item.id, partName:item.partName||'-', color:item.color||'-', date:item.date||'-', original: prev||'(없음)', fixed: f });
                    changed = true;
                } else {
                    unfixed.push({ src:'재고', id:item.id, partName:item.partName||'-', color:item.color||'-', date:item.date||'-', original: item.lotNo||'(없음)', reason: _lotErrorReason(item.lotNo) });
                }
            }

            // lots[] 배열
            if (item.lots && Array.isArray(item.lots)) {
                item.lots.forEach((lot, idx) => {
                    if (!_isValidLot(lot.lotNo)) {
                        const f = _fixLot(lot.lotNo, item.date);
                        if (f) {
                            const prev = lot.lotNo;
                            lot.lotNo = f;
                            fixed.push({ src:`재고(lots[${idx}])`, id:item.id, partName:item.partName||'-', color:item.color||'-', date:item.date||'-', original: prev||'(없음)', fixed: f });
                            changed = true;
                        } else {
                            unfixed.push({ src:`재고(lots[${idx}])`, id:item.id, partName:item.partName||'-', color:item.color||'-', date:item.date||'-', original: lot.lotNo||'(없음)', reason: _lotErrorReason(lot.lotNo) });
                        }
                    }
                });
            }

            if (changed) {
                await Storage.update(DB.STORES.INJECTION_INVENTORY, item.id, item);
            }
        }

        // ── 사출 수입검사 ──
        for (const item of inspItems) {
            let changed = false;

            if (!_isValidLot(item.lotNo)) {
                const f = _fixLot(item.lotNo, item.date);
                if (f) {
                    const prev = item.lotNo;
                    item.lotNo = f;
                    fixed.push({ src:'수입검사', id:item.id, partName:item.partName||'-', color:item.color||'-', date:item.date||'-', original: prev||'(없음)', fixed: f });
                    changed = true;
                } else {
                    unfixed.push({ src:'수입검사', id:item.id, partName:item.partName||'-', color:item.color||'-', date:item.date||'-', original: item.lotNo||'(없음)', reason: _lotErrorReason(item.lotNo) });
                }
            }

            if (item.lots && Array.isArray(item.lots)) {
                item.lots.forEach((lot, idx) => {
                    if (!_isValidLot(lot.lotNo)) {
                        const f = _fixLot(lot.lotNo, item.date);
                        if (f) {
                            const prev = lot.lotNo;
                            lot.lotNo = f;
                            fixed.push({ src:`수입검사(lots[${idx}])`, id:item.id, partName:item.partName||'-', color:item.color||'-', date:item.date||'-', original: prev||'(없음)', fixed: f });
                            changed = true;
                        } else {
                            unfixed.push({ src:`수입검사(lots[${idx}])`, id:item.id, partName:item.partName||'-', color:item.color||'-', date:item.date||'-', original: lot.lotNo||'(없음)', reason: _lotErrorReason(lot.lotNo) });
                        }
                    }
                });
            }

            if (changed) {
                await Storage.update(DB.STORES.INJECTION_INSPECTIONS, item.id, item);
            }
        }

        _renderLotRepairResult(fixed, unfixed);
    }

    /** 스캔 결과 렌더링 (수정 없음) */
    function _renderLotScanResult(errors, didRepair) {
        const resultEl = document.getElementById('lotRepairResult');
        if (!resultEl) return;

        if (errors.length === 0) {
            resultEl.innerHTML = `
                <div style="padding:10px 14px; background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3);
                    border-radius:8px; color:var(--accent-green,#10b981); font-size:0.875rem;">
                    ✅ 형식 오류 LOT 없음 — 모든 LOT 번호가 유효합니다.
                </div>`;
            return;
        }

        const rows = errors.map(e => `
            <tr>
                <td style="font-size:0.78rem;">${e.src}</td>
                <td><strong>${e.partName}</strong></td>
                <td style="color:var(--text-muted);">${e.color}</td>
                <td style="white-space:nowrap;">${e.date}</td>
                <td style="font-family:monospace;color:var(--accent-red);">${e.original}</td>
                <td style="font-size:0.78rem;color:var(--text-muted);">${e.reason}</td>
                <td style="font-family:monospace;color:var(--accent-blue);">${e.suggested}</td>
            </tr>`).join('');

        resultEl.innerHTML = `
            <div style="margin-bottom:8px; font-size:0.875rem; font-weight:600; color:var(--accent-orange,#f59e0b);">
                ⚠️ 형식 오류 LOT ${errors.length}건 발견
            </div>
            <div style="overflow-x:auto;">
                <table class="data-table" style="font-size:0.8rem;">
                    <thead><tr>
                        <th>구분</th><th>품명</th><th>컬러</th><th>입고일</th>
                        <th>원본 LOT</th><th>오류 내용</th><th>수정 제안</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <p style="margin-top:8px; font-size:0.8rem; color:var(--text-muted);">
                위 목록을 확인한 후 <strong>검증 + 자동 수정</strong> 버튼을 눌러 일괄 적용하세요.
            </p>`;
    }

    /** 수정 결과 렌더링 */
    function _renderLotRepairResult(fixed, unfixed) {
        const resultEl = document.getElementById('lotRepairResult');
        if (!resultEl) return;

        let html = '';

        if (fixed.length === 0 && unfixed.length === 0) {
            html = `<div style="padding:10px 14px; background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3);
                border-radius:8px; color:var(--accent-green,#10b981); font-size:0.875rem;">
                ✅ 형식 오류 LOT 없음 — 수정할 항목이 없습니다.</div>`;
            resultEl.innerHTML = html;
            return;
        }

        if (fixed.length > 0) {
            const rows = fixed.map(e => `
                <tr>
                    <td style="font-size:0.78rem;">${e.src}</td>
                    <td><strong>${e.partName}</strong></td>
                    <td style="color:var(--text-muted);">${e.color}</td>
                    <td style="white-space:nowrap;">${e.date}</td>
                    <td style="font-family:monospace; text-decoration:line-through; color:var(--accent-red);">${e.original}</td>
                    <td style="font-family:monospace; color:var(--accent-green); font-weight:700;">→ ${e.fixed}</td>
                </tr>`).join('');
            html += `
                <div style="margin-bottom:6px; font-size:0.875rem; font-weight:600; color:var(--accent-green,#10b981);">
                    ✅ 자동 수정 완료: ${fixed.length}건
                </div>
                <div style="overflow-x:auto; margin-bottom:16px;">
                    <table class="data-table" style="font-size:0.8rem;">
                        <thead><tr><th>구분</th><th>품명</th><th>컬러</th><th>입고일</th><th>원본 LOT</th><th>수정 LOT</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`;
        }

        if (unfixed.length > 0) {
            const rows = unfixed.map(e => `
                <tr>
                    <td style="font-size:0.78rem;">${e.src}</td>
                    <td><strong>${e.partName}</strong></td>
                    <td style="color:var(--text-muted);">${e.color}</td>
                    <td style="white-space:nowrap;">${e.date}</td>
                    <td style="font-family:monospace; color:var(--accent-red);">${e.original}</td>
                    <td style="font-size:0.78rem; color:var(--text-muted);">${e.reason}</td>
                </tr>`).join('');
            html += `
                <div style="margin-bottom:6px; font-size:0.875rem; font-weight:600; color:var(--accent-orange,#f59e0b);">
                    ⚠️ 수정 불가 (수동 확인 필요): ${unfixed.length}건
                </div>
                <div style="overflow-x:auto;">
                    <table class="data-table" style="font-size:0.8rem;">
                        <thead><tr><th>구분</th><th>품명</th><th>컬러</th><th>입고일</th><th>원본 LOT</th><th>오류 내용</th></tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>`;
        }

        resultEl.innerHTML = html;
        UIUtils.toast(`LOT 수정 완료 (성공 ${fixed.length}건 / 불가 ${unfixed.length}건)`,
            unfixed.length > 0 ? 'warning' : 'success');
    }

    // 시스템 탭
    // =====================================================
    function _fmtBytes(b) {
        if (!b && b !== 0) return '-';
        const gb = b / (1024 ** 3);
        if (gb >= 1) return gb.toFixed(1) + ' GB';
        const mb = b / (1024 ** 2);
        return mb.toFixed(0) + ' MB';
    }
    function _fmtUptime(sec) {
        if (!sec && sec !== 0) return '-';
        const d = Math.floor(sec / 86400);
        const h = Math.floor((sec % 86400) / 3600);
        const m = Math.floor((sec % 3600) / 60);
        return (d ? `${d}일 ` : '') + (h ? `${h}시간 ` : '') + `${m}분`;
    }
    function _statusDot(ok) {
        return ok
            ? `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#22c55e;margin-right:6px;flex-shrink:0;"></span>`
            : `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#ef4444;margin-right:6px;flex-shrink:0;"></span>`;
    }
    function _gauge(pct, color) {
        const p = Math.min(100, Math.max(0, pct || 0));
        const c = color || (p > 85 ? '#ef4444' : p > 65 ? '#f59e0b' : '#22c55e');
        return `
            <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
                <div style="flex:1;height:7px;background:var(--bg-secondary);border-radius:999px;overflow:hidden;">
                    <div style="height:100%;width:${p}%;background:${c};border-radius:999px;transition:width 0.4s;"></div>
                </div>
                <span style="font-size:0.75rem;font-weight:700;color:${c};min-width:38px;text-align:right;">${p.toFixed(1)}%</span>
            </div>`;
    }
    function _sysCard(icon, title, content) {
        return `
            <div class="card" style="flex:1;min-width:240px;">
                <div class="card-header" style="padding:12px 16px;">
                    <h4 style="font-size:0.88rem;font-weight:700;display:flex;align-items:center;gap:6px;margin:0;">
                        <span class="material-symbols-outlined" style="font-size:18px;color:var(--accent-blue);">${icon}</span>
                        ${title}
                    </h4>
                </div>
                <div class="card-body" style="padding:12px 16px;">${content}</div>
            </div>`;
    }
    function _row(label, value) {
        return `<div style="display:flex;justify-content:space-between;align-items:center;
                            padding:4px 0;border-bottom:1px solid var(--border-color);font-size:0.82rem;">
                    <span style="color:var(--text-muted);">${label}</span>
                    <span style="font-weight:600;">${value}</span>
                </div>`;
    }

    let _docDesignEditorId = '';
    let _docDesignSelectedElementId = '';
    let _docReferenceDragState = null;
    let _docElementDragState = null;
    let _docPdfJsPromise = null;

    function _docDesignSeed(id, name, category, paperSize, elements, extra) {
        return {
            id,
            name,
            category,
            paperSize,
            elements,
            referenceScale: 1,
            referenceOffsetX: 0,
            referenceOffsetY: 0,
            ...(extra || {})
        };
    }

    function _docDesignElement(type, x, y, w, h, extra) {
        return { id: `dde-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, x, y, w, h, ...(extra || {}) };
    }

    function _defaultDocumentDesigns() {
        return [
            _docDesignSeed('approval-standard', '기준서 결재형', '기준서', 'A4-L', [
                _docDesignElement('rect', 10, 10, 170, 60, { label: '회사 영역' }),
                _docDesignElement('rect', 180, 10, 540, 60, { label: '문서 제목', fill: '#bcd4f6' }),
                _docDesignElement('approval', 720, 10, 170, 60),
                _docDesignElement('text', 220, 28, 260, 22, { text: '기준서 제목', fontSize: 22, bold: true }),
                _docDesignElement('line', 10, 88, 880, 2, { borderColor: '#111827' }),
                _docDesignElement('table', 10, 110, 880, 180, { rows: 5, cols: 3 })
            ]),
            _docDesignSeed('work-standard', '작업표준 결재형', '작업표준', 'A4-L', [
                _docDesignElement('rect', 10, 10, 120, 50, { label: '로고' }),
                _docDesignElement('rect', 130, 10, 400, 50, { label: '작업표준서', fill: '#bcd4f6' }),
                _docDesignElement('approval', 530, 10, 100, 50),
                _docDesignElement('table', 10, 80, 620, 220, { rows: 6, cols: 4 }),
                _docDesignElement('text', 20, 320, 220, 20, { text: '작업순서 / 관리기준', fontSize: 16, bold: true })
            ])
        ];
    }

    async function _loadDocumentDesigns() {
        try {
            const saved = await Storage.getConfigValue(DOCUMENT_DESIGN_KEY);
            if (Array.isArray(saved) && saved.length) return saved;
        } catch (e) {
            console.warn('[Settings] document designs load failed', e);
        }
        return _defaultDocumentDesigns();
    }

    async function _saveDocumentDesigns(rows) {
        await Storage.setConfigValue(DOCUMENT_DESIGN_KEY, Array.isArray(rows) ? rows : _defaultDocumentDesigns());
    }

    function _docCanvasSize() {
        return { w: 900, h: 640 };
    }

    function _docReferenceTransform(design) {
        const scale = Math.max(0.1, Number(design?.referenceScale) || 1);
        const offsetX = Number(design?.referenceOffsetX) || 0;
        const offsetY = Number(design?.referenceOffsetY) || 0;
        return {
            scale,
            offsetX,
            offsetY,
            transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`
        };
    }

    function _docReferenceBox(size) {
        return {
            x: 12,
            y: 12,
            w: Math.max(120, (size?.w || 0) - 24),
            h: Math.max(120, (size?.h || 0) - 24)
        };
    }

    function _loadPdfJsLibrary() {
        if (window.pdfjsLib) {
            if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            }
            return Promise.resolve(window.pdfjsLib);
        }
        if (_docPdfJsPromise) return _docPdfJsPromise;
        _docPdfJsPromise = new Promise((resolve, reject) => {
            const existing = document.querySelector('script[data-doc-pdfjs="true"]');
            if (existing) {
                existing.addEventListener('load', () => resolve(window.pdfjsLib));
                existing.addEventListener('error', reject);
                return;
            }
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            script.async = true;
            script.dataset.docPdfjs = 'true';
            script.onload = () => {
                if (!window.pdfjsLib) {
                    reject(new Error('pdfjsLib not available'));
                    return;
                }
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                resolve(window.pdfjsLib);
            };
            script.onerror = reject;
            document.head.appendChild(script);
        }).catch(err => {
            _docPdfJsPromise = null;
            throw err;
        });
        return _docPdfJsPromise;
    }

    async function _buildPdfReferencePreview(dataUrl) {
        if (!dataUrl) return null;
        const pdfjsLib = await _loadPdfJsLibrary();
        const buffer = await fetch(dataUrl).then(res => res.arrayBuffer());
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const fitWidth = 1400;
        const scale = Math.max(1, fitWidth / Math.max(1, viewport.width));
        const renderViewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = Math.round(renderViewport.width);
        canvas.height = Math.round(renderViewport.height);
        await page.render({ canvasContext: context, viewport: renderViewport }).promise;
        return {
            referencePreviewDataUrl: canvas.toDataURL('image/png'),
            referencePreviewWidth: canvas.width,
            referencePreviewHeight: canvas.height
        };
    }

    function _escapeDocHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/\n/g, '<br>');
    }

    function _excelPxWidth(col) {
        if (col?.wpx) return Math.max(24, Math.round(col.wpx));
        if (col?.wch) return Math.max(24, Math.round(col.wch * 7 + 12));
        return 80;
    }

    function _excelPxHeight(row) {
        if (row?.hpx) return Math.max(18, Math.round(row.hpx));
        if (row?.hpt) return Math.max(18, Math.round((row.hpt * 96) / 72));
        return 24;
    }

    function _excelColorHex(color, fallback) {
        const raw = color?.rgb || color?.argb || '';
        if (typeof raw === 'string' && raw.length >= 6) {
            const hex = raw.slice(-6);
            if (/^[0-9A-Fa-f]{6}$/.test(hex)) return `#${hex}`;
        }
        return fallback;
    }

    function _excelBorderCss(border) {
        if (!border || border.style === 'none') return '1px solid #cbd5e1';
        if (border.style === 'medium' || border.style === 'thick' || border.style === 'double') {
            return `2px solid ${_excelColorHex(border.color, '#64748b')}`;
        }
        return `1px solid ${_excelColorHex(border.color, '#94a3b8')}`;
    }

    function _excelCellCss(cell) {
        const style = cell?.s || {};
        const font = style.font || {};
        const fill = style.fill || {};
        const alignment = style.alignment || {};
        const border = style.border || {};
        const css = [
            'padding:4px 6px',
            'vertical-align:middle',
            'white-space:pre-wrap',
            `font-size:${Math.max(10, Math.round(font.sz || 11))}px`,
            `font-weight:${font.bold ? 700 : 400}`,
            `font-style:${font.italic ? 'italic' : 'normal'}`,
            `color:${_excelColorHex(font.color, '#111827')}`,
            `background:${_excelColorHex(fill.fgColor || fill.bgColor, '#ffffff')}`,
            `text-align:${alignment.horizontal || 'left'}`,
            `border-top:${_excelBorderCss(border.top)}`,
            `border-right:${_excelBorderCss(border.right)}`,
            `border-bottom:${_excelBorderCss(border.bottom)}`,
            `border-left:${_excelBorderCss(border.left)}`
        ];
        if (alignment.wrapText) css.push('word-break:break-word');
        return css.join(';');
    }

    async function _buildExcelReferencePreview(dataUrl) {
        if (!dataUrl || !window.XLSX) return null;
        const buffer = await fetch(dataUrl).then(res => res.arrayBuffer());
        const workbook = XLSX.read(buffer, { type: 'array', cellStyles: true, cellNF: true, cellHTML: false });
        const sheetName = workbook.SheetNames?.[0];
        if (!sheetName) return null;
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) return null;
        const ref = sheet['!ref'];
        if (!ref) return null;
        const range = XLSX.utils.decode_range(ref);
        const merges = Array.isArray(sheet['!merges']) ? sheet['!merges'] : [];
        const mergeStartMap = new Map();
        const coveredCells = new Set();
        merges.forEach(merge => {
            const key = `${merge.s.r}:${merge.s.c}`;
            mergeStartMap.set(key, merge);
            for (let r = merge.s.r; r <= merge.e.r; r += 1) {
                for (let c = merge.s.c; c <= merge.e.c; c += 1) {
                    if (r !== merge.s.r || c !== merge.s.c) coveredCells.add(`${r}:${c}`);
                }
            }
        });

        const cols = [];
        for (let c = range.s.c; c <= range.e.c; c += 1) {
            cols.push(_excelPxWidth(sheet['!cols']?.[c]));
        }
        const rows = [];
        for (let r = range.s.r; r <= range.e.r; r += 1) {
            rows.push(_excelPxHeight(sheet['!rows']?.[r]));
        }
        const naturalWidth = cols.reduce((sum, value) => sum + value, 0);
        const naturalHeight = rows.reduce((sum, value) => sum + value, 0);

        const colGroup = cols.map(width => `<col style="width:${width}px;">`).join('');
        const bodyRows = [];
        for (let r = range.s.r; r <= range.e.r; r += 1) {
            const rowHeight = rows[r - range.s.r];
            const cells = [];
            for (let c = range.s.c; c <= range.e.c; c += 1) {
                const coveredKey = `${r}:${c}`;
                if (coveredCells.has(coveredKey)) continue;
                const addr = XLSX.utils.encode_cell({ r, c });
                const cell = sheet[addr] || {};
                const merge = mergeStartMap.get(coveredKey);
                const rowspan = merge ? (merge.e.r - merge.s.r + 1) : 1;
                const colspan = merge ? (merge.e.c - merge.s.c + 1) : 1;
                const text = _escapeDocHtml(cell.w ?? cell.v ?? '');
                cells.push(`<td${rowspan > 1 ? ` rowspan="${rowspan}"` : ''}${colspan > 1 ? ` colspan="${colspan}"` : ''} style="${_excelCellCss(cell)}">${text || '&nbsp;'}</td>`);
            }
            bodyRows.push(`<tr style="height:${rowHeight}px;">${cells.join('')}</tr>`);
        }
        const html = `<table style="border-collapse:collapse;table-layout:fixed;width:${naturalWidth}px;background:#fff;color:#0f172a;"><colgroup>${colGroup}</colgroup><tbody>${bodyRows.join('')}</tbody></table>`;
        return {
            referencePreviewHtml: html,
            referenceSheetName: sheetName,
            referencePreviewWidth: naturalWidth,
            referencePreviewHeight: naturalHeight
        };
    }

    async function _normalizeDocumentReferencePreviews(rows) {
        const list = Array.isArray(rows) ? rows : [];
        let changed = false;
        const next = [];
        for (const row of list) {
            if (row && row.referenceDataUrl) {
                if (row.referenceType === 'application/pdf' && !row.referencePreviewDataUrl) {
                    try {
                        const preview = await _buildPdfReferencePreview(row.referenceDataUrl);
                        if (preview?.referencePreviewDataUrl) {
                            next.push({ ...row, ...preview });
                            changed = true;
                            continue;
                        }
                    } catch (error) {
                        console.warn('[Settings] pdf preview build failed', error);
                    }
                }
                if ((row.referenceType || '').includes('sheet') || (row.referenceType || '').includes('excel')) {
                    if (!row.referencePreviewHtml) {
                        try {
                            const preview = await _buildExcelReferencePreview(row.referenceDataUrl);
                            if (preview?.referencePreviewHtml) {
                                next.push({ ...row, ...preview });
                                changed = true;
                                continue;
                            }
                        } catch (error) {
                            console.warn('[Settings] excel preview build failed', error);
                        }
                    }
                }
            }
            next.push(row);
        }
        if (changed) {
            await _saveDocumentDesigns(next);
        }
        return next;
    }

    function _docSelectedDesign(rows) {
        const active = rows.find(d => d.id === _docDesignEditorId) || rows[0] || null;
        if (active) _docDesignEditorId = active.id;
        return active;
    }

    function _docSelectedElement(design) {
        if (!design) return null;
        const active = (design.elements || []).find(el => el.id === _docDesignSelectedElementId) || (design.elements || [])[0] || null;
        if (active) _docDesignSelectedElementId = active.id;
        return active;
    }

    function _resolveReferenceType(file) {
        const type = (file?.type || '').trim();
        if (type) return type;
        const name = (file?.name || '').toLowerCase();
        if (name.endsWith('.pdf')) return 'application/pdf';
        if (name.endsWith('.ppt')) return 'application/vnd.ms-powerpoint';
        if (name.endsWith('.pptx')) return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        if (name.endsWith('.xls')) return 'application/vnd.ms-excel';
        if (name.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        if (name.endsWith('.png')) return 'image/png';
        if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
        if (name.endsWith('.webp')) return 'image/webp';
        if (name.endsWith('.gif')) return 'image/gif';
        return '';
    }

    function _referenceKindLabel(type) {
        if (!type) return '파일';
        if (type.startsWith('image/')) return '이미지';
        if (type === 'application/pdf') return 'PDF';
        if (type.includes('presentation') || type.includes('powerpoint')) return 'PPT';
        if (type.includes('spreadsheet') || type.includes('excel') || type.includes('sheet')) return 'Excel';
        return '파일';
    }

    function _isDesignTemplateReferenceType(type) {
        return Boolean(type) && (type === 'application/pdf' || type.startsWith('image/'));
    }

    function _renderDocReference(design, size) {
        if (!design || !design.referenceDataUrl) return '';
        const { transform } = _docReferenceTransform(design);
        const box = _docReferenceBox(size);
        const previewSrc = design.referencePreviewDataUrl || design.referenceDataUrl;
        if ((design.referenceType || '').startsWith('image/') || ((design.referenceType || '') === 'application/pdf' && design.referencePreviewDataUrl)) {
            return `<div id="doc-reference-preview" style="position:absolute;left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;display:flex;align-items:center;justify-content:center;overflow:hidden;pointer-events:none;transform:${transform};transform-origin:center center;z-index:1;">
                        <img src="${previewSrc}" alt="${design.referenceName || 'reference'}"
                            style="width:100%;height:100%;object-fit:contain;object-position:center top;opacity:.32;box-shadow:0 0 0 1px rgba(148,163,184,.28);">
                    </div>`;
        }
        if (((design.referenceType || '').includes('sheet') || (design.referenceType || '').includes('excel')) && design.referencePreviewHtml) {
            const naturalWidth = Math.max(320, Number(design.referencePreviewWidth) || box.w);
            const naturalHeight = Math.max(160, Number(design.referencePreviewHeight) || box.h);
            const fitScale = Math.min(box.w / naturalWidth, box.h / naturalHeight);
            return `<div id="doc-reference-preview" style="position:absolute;left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;overflow:hidden;pointer-events:none;transform:${transform};transform-origin:center center;z-index:1;background:rgba(255,255,255,.92);box-shadow:0 0 0 1px rgba(148,163,184,.28);">
                        <div style="position:absolute;left:8px;top:8px;padding:2px 8px;border-radius:999px;background:rgba(255,255,255,.92);border:1px solid rgba(148,163,184,.5);font-size:11px;font-weight:700;color:#475569;">시트: ${design.referenceSheetName || 'Sheet1'}</div>
                        <div style="width:${naturalWidth}px;height:${naturalHeight}px;transform:scale(${fitScale});transform-origin:left top;opacity:.62;">
                            ${design.referencePreviewHtml}
                        </div>
                        <div style="position:absolute;right:8px;bottom:8px;padding:2px 6px;border-radius:8px;background:rgba(255,255,255,.88);font-size:10px;color:#64748b;">
                            ${Math.round(naturalWidth)} x ${Math.round(naturalHeight)}
                        </div>
                    </div>`;
            return `<div id="doc-reference-preview" style="position:absolute;left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;overflow:hidden;pointer-events:none;transform:${transform};transform-origin:center center;z-index:1;background:rgba(255,255,255,.92);box-shadow:0 0 0 1px rgba(148,163,184,.28);">
                        <div style="padding:14px;transform-origin:left top;">
                            <div style="font-size:11px;font-weight:700;color:#475569;margin-bottom:8px;">엑셀 시트: ${design.referenceSheetName || 'Sheet1'}</div>
                            <div style="overflow:hidden;opacity:.55;font-size:11px;line-height:1.25;color:#111827;">
                                ${design.referencePreviewHtml
                                    .replace('<table', '<table style="border-collapse:collapse;background:#fff;min-width:max-content;font-size:11px;color:#0f172a;"')
                                    .replace(/<td/g, '<td style="border:1px solid #cbd5e1;padding:4px 6px;vertical-align:middle;white-space:pre-wrap;"')
                                    .replace(/<th/g, '<th style="border:1px solid #94a3b8;padding:4px 6px;background:#e2e8f0;font-weight:800;vertical-align:middle;white-space:pre-wrap;"')}
                            </div>
                        </div>
                    </div>`;
        }
        if ((design.referenceType || '') === 'application/pdf') {
            return `<div id="doc-reference-preview" style="position:absolute;left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;display:flex;align-items:center;justify-content:center;overflow:hidden;pointer-events:none;transform:${transform};transform-origin:center center;z-index:1;">
                        <object data="${design.referenceDataUrl}#toolbar=0&navpanes=0&scrollbar=0" type="application/pdf"
                            style="width:100%;height:100%;opacity:.45;">
                            <embed src="${design.referenceDataUrl}#toolbar=0&navpanes=0&scrollbar=0" type="application/pdf"
                                style="width:100%;height:100%;opacity:.45;">
                        </object>
                    </div>`;
        }
        return `<div id="doc-reference-preview" style="position:absolute;left:${box.x}px;top:${box.y}px;width:${box.w}px;padding:18px;border:1px dashed #94a3b8;border-radius:14px;background:rgba(255,255,255,.94);color:#334155;pointer-events:none;transform:${transform};transform-origin:center center;z-index:1;">?? ??: ${design.referenceName || '??'} (${_referenceKindLabel(design.referenceType)})</div>`;
    }

    function _renderDocReferenceHandles(design, size) {
        if (!design || !design.referenceDataUrl) return '';
        const box = _docReferenceBox(size);
        const { transform } = _docReferenceTransform(design);
        const handles = [
            { mode: 'resize-nw', cursor: 'nwse-resize', left: -6, top: -6 },
            { mode: 'resize-ne', cursor: 'nesw-resize', right: -6, top: -6 },
            { mode: 'resize-sw', cursor: 'nesw-resize', left: -6, bottom: -6 },
            { mode: 'resize-se', cursor: 'nwse-resize', right: -6, bottom: -6 }
        ];
        return `
            <div id="doc-reference-frame" style="position:absolute;left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;transform:${transform};transform-origin:center center;pointer-events:none;z-index:5;">
                <div style="position:absolute;inset:0;border:2px solid rgba(37,99,235,.85);box-shadow:0 0 0 1px rgba(255,255,255,.9) inset;border-radius:2px;"></div>
                <div onmousedown="SettingsModule.startDocumentReferenceDrag(event, 'move')" style="position:absolute;left:50%;top:-18px;transform:translateX(-50%);padding:2px 10px;border:1px solid rgba(37,99,235,.35);border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:700;letter-spacing:0;cursor:move;pointer-events:auto;user-select:none;">양식 이동</div>
                ${handles.map(handle => `<div onmousedown="SettingsModule.startDocumentReferenceDrag(event, '${handle.mode}')" style="position:absolute;width:12px;height:12px;border:2px solid #2563eb;background:#fff;pointer-events:auto;user-select:none;cursor:${handle.cursor};${handle.left != null ? `left:${handle.left}px;` : ''}${handle.right != null ? `right:${handle.right}px;` : ''}${handle.top != null ? `top:${handle.top}px;` : ''}${handle.bottom != null ? `bottom:${handle.bottom}px;` : ''}"></div>`).join('')}
            </div>
        `;
    }

    function _applyDocumentReferencePreview(scale, offsetX, offsetY) {
        const transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
        ['doc-reference-preview', 'doc-reference-frame'].forEach(id => {
            const node = document.getElementById(id);
            if (node) node.style.transform = transform;
        });
    }

    function _cleanupDocumentReferenceDrag() {
        if (_docReferenceDragState?.moveHandler) {
            document.removeEventListener('mousemove', _docReferenceDragState.moveHandler);
        }
        if (_docReferenceDragState?.upHandler) {
            document.removeEventListener('mouseup', _docReferenceDragState.upHandler);
        }
        _docReferenceDragState = null;
    }

    function _renderDocElementHandles(el) {
        if (!el) return '';
        const handles = [
            { mode: 'resize-nw', cursor: 'nwse-resize', left: -6, top: -6 },
            { mode: 'resize-ne', cursor: 'nesw-resize', right: -6, top: -6 },
            { mode: 'resize-sw', cursor: 'nesw-resize', left: -6, bottom: -6 },
            { mode: 'resize-se', cursor: 'nwse-resize', right: -6, bottom: -6 }
        ];
        return `
            <div id="doc-element-frame-${el.id}" style="position:absolute;left:${el.x - 2}px;top:${el.y - 2}px;width:${el.w + 4}px;height:${Math.max(el.h, 2) + 4}px;pointer-events:none;z-index:6;">
                <div style="position:absolute;inset:0;border:2px solid rgba(37,99,235,.92);box-shadow:0 0 0 1px rgba(255,255,255,.9) inset;"></div>
                <div onmousedown="SettingsModule.startDocumentElementDrag(event, '${el.id}', 'move')" style="position:absolute;left:50%;top:-18px;transform:translateX(-50%);padding:2px 10px;border:1px solid rgba(37,99,235,.35);border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:700;cursor:move;pointer-events:auto;user-select:none;">요소 이동</div>
                ${handles.map(handle => `<div onmousedown="SettingsModule.startDocumentElementDrag(event, '${el.id}', '${handle.mode}')" style="position:absolute;width:12px;height:12px;border:2px solid #2563eb;background:#fff;pointer-events:auto;user-select:none;cursor:${handle.cursor};${handle.left != null ? `left:${handle.left}px;` : ''}${handle.right != null ? `right:${handle.right}px;` : ''}${handle.top != null ? `top:${handle.top}px;` : ''}${handle.bottom != null ? `bottom:${handle.bottom}px;` : ''}"></div>`).join('')}
            </div>
        `;
    }

    function _applyDocumentElementPreview(elementId, x, y, w, h) {
        const node = document.getElementById(`doc-element-${elementId}`);
        if (node) {
            node.style.left = `${x}px`;
            node.style.top = `${y}px`;
            node.style.width = `${w}px`;
            node.style.height = `${Math.max(h, 2)}px`;
        }
        const frame = document.getElementById(`doc-element-frame-${elementId}`);
        if (frame) {
            frame.style.left = `${x - 2}px`;
            frame.style.top = `${y - 2}px`;
            frame.style.width = `${w + 4}px`;
            frame.style.height = `${Math.max(h, 2) + 4}px`;
        }
    }

    function _cleanupDocumentElementDrag() {
        if (_docElementDragState?.moveHandler) {
            document.removeEventListener('mousemove', _docElementDragState.moveHandler);
        }
        if (_docElementDragState?.upHandler) {
            document.removeEventListener('mouseup', _docElementDragState.upHandler);
        }
        _docElementDragState = null;
    }

    function _renderDocElement(el) {
        const base = `position:absolute;left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${Math.max(el.h, 2)}px;`;
        const idAttr = `id="doc-element-${el.id}"`;
        if (el.type === 'line') return `<div ${idAttr} onclick="SettingsModule.selectDocumentElement('${el.id}')" style="${base}height:0;border-top:2px solid ${el.borderColor || '#111827'};cursor:pointer;"></div>`;
        if (el.type === 'text') return `<div onclick="SettingsModule.selectDocumentElement('${el.id}')" style="${base}border:1px dashed #94a3b8;background:#fff;padding:4px;font-size:${el.fontSize || 14}px;font-weight:${el.bold ? '800' : '500'};cursor:pointer;overflow:hidden;">${el.text || '텍스트'}</div>`;
        if (el.type === 'table') {
            const rows = Math.max(1, Number(el.rows) || 1);
            const cols = Math.max(1, Number(el.cols) || 1);
            return `<div onclick="SettingsModule.selectDocumentElement('${el.id}')" style="${base}border:1px solid #111827;display:grid;grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${rows},1fr);cursor:pointer;background:#fff;">${Array.from({ length: rows * cols }).map(() => `<div style="border-right:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;"></div>`).join('')}</div>`;
        }
        if (el.type === 'approval') {
            return `<div onclick="SettingsModule.selectDocumentElement('${el.id}')" style="${base}border:1px solid #111827;display:grid;grid-template-columns:48px 1fr 1fr 1fr;background:#fff;cursor:pointer;"><div style="border-right:1px solid #111827;display:flex;align-items:center;justify-content:center;background:#dbeafe;font-size:12px;font-weight:800;">결재</div>${['작성', '검토', '승인'].map((label, idx) => `<div style="border-right:${idx < 2 ? '1px solid #111827' : 'none'};display:flex;flex-direction:column;"><div style="padding:4px 0;border-bottom:1px solid #111827;text-align:center;font-size:11px;font-weight:700;">${label}</div><div style="flex:1;"></div></div>`).join('')}</div>`;
        }
        return `<div onclick="SettingsModule.selectDocumentElement('${el.id}')" style="${base}border:1px solid ${el.borderColor || '#111827'};background:${el.fill || 'transparent'};cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;color:#475569;">${el.label || '박스'}</div>`;
    }

    async function renderDocumentDesignTab(el) {
        const designs = await _normalizeDocumentReferencePreviews(await _loadDocumentDesigns());
        const active = _docSelectedDesign(designs);
        const selected = _docSelectedElement(active);
        const size = _docCanvasSize();

        el.innerHTML = `
            <div style="display:grid;grid-template-columns:260px minmax(0,1fr);gap:16px;">
                <div class="card">
                    <div class="card-header"><h4><span class="material-symbols-outlined">folder_managed</span> 디자인 목록</h4></div>
                    <div class="card-body" style="display:flex;flex-direction:column;gap:10px;">
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            <button class="btn btn-primary btn-sm" onclick="SettingsModule.createDocumentDesign()">빈 디자인 추가</button>
                            <label class="btn btn-outline btn-sm" style="cursor:pointer;">
                                <span class="material-symbols-outlined">upload_file</span> 양식으로 새 디자인
                                <input type="file" accept="image/*,.pdf" style="display:none;" onchange="SettingsModule.createDocumentDesignFromUpload(event)">
                            </label>
                            <button class="btn btn-outline btn-sm" onclick="SettingsModule.resetDocumentDesigns()">샘플 복원</button>
                        </div>
                        ${(designs || []).map(d => `<button class="btn ${active && active.id === d.id ? 'btn-primary' : 'btn-outline'}" style="justify-content:flex-start;text-align:left;" onclick="SettingsModule.selectDocumentDesign('${d.id}')"><span class="material-symbols-outlined">description</span> ${d.name}${d.referenceDataUrl ? ` <span style="font-size:.72rem;opacity:.8;">(${_referenceKindLabel(d.referenceType)})</span>` : ''}</button>`).join('')}
                    </div>
                </div>
                <div class="card">
                    <div class="card-header"><h4><span class="material-symbols-outlined">draw</span> 문서 디자인 편집기</h4></div>
                    <div class="card-body" style="display:flex;flex-direction:column;gap:14px;">
                        ${active ? `
                            <div style="display:grid;grid-template-columns:1fr 160px 160px auto;gap:10px;align-items:end;">
                                <div class="form-group"><label class="form-label">디자인명</label><input class="form-input" value="${active.name || ''}" onchange="SettingsModule.updateDocumentDesignMeta('name', this.value)"></div>
                                <div class="form-group"><label class="form-label">카테고리</label><input class="form-input" value="${active.category || ''}" onchange="SettingsModule.updateDocumentDesignMeta('category', this.value)"></div>
                                <div class="form-group"><label class="form-label">용지</label><input class="form-input" value="A4 가로 고정" readonly></div>
                                <div style="display:flex;gap:8px;"><button class="btn btn-outline btn-sm" onclick="SettingsModule.removeDocumentDesign('${active.id}')">삭제</button><button class="btn btn-primary btn-sm" onclick="SettingsModule.saveActiveDocumentDesign()">저장</button></div>
                            </div>
                            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                                <button class="btn btn-outline btn-sm" onclick="SettingsModule.addDocumentElement('text')">텍스트</button>
                                <button class="btn btn-outline btn-sm" onclick="SettingsModule.addDocumentElement('line')">선</button>
                                <button class="btn btn-outline btn-sm" onclick="SettingsModule.addDocumentElement('rect')">박스</button>
                                <button class="btn btn-outline btn-sm" onclick="SettingsModule.addDocumentElement('table')">표</button>
                                <button class="btn btn-outline btn-sm" onclick="SettingsModule.addDocumentElement('approval')">결재칸</button>
                            </div>
                            <div style="display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px;align-items:start;">
                                <div style="overflow:hidden;border:1px solid var(--border-color);border-radius:12px;background:#eef2f7;padding:16px;">
                                    <div style="position:relative;width:${size.w}px;height:${size.h}px;background:#fff;border:1px solid #111827;margin:0 auto;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.08);">
                                        ${_renderDocReference(active, size)}
                                        ${_renderDocReferenceHandles(active, size)}
                                        ${(active.elements || []).map(item => `${_renderDocElement(item)}${selected && selected.id === item.id ? _renderDocElementHandles(item) : ''}`).join('')}
                                    </div>
                                </div>
                                <div style="border:1px solid var(--border-color);border-radius:12px;padding:12px;background:#fff;">
                                    <div style="padding:10px;border:1px solid var(--border-color);border-radius:10px;background:#f8fafc;margin-bottom:12px;">
                                        <div style="font-size:.82rem;font-weight:700;margin-bottom:8px;">현재 사용 양식 업로드</div>
                                        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                                            <label class="btn btn-outline btn-sm" style="cursor:pointer;">
                                                <span class="material-symbols-outlined">upload_file</span> 양식 업로드
                                                <input type="file" accept="image/*,.pdf" style="display:none;" onchange="SettingsModule.handleDocumentDesignReferenceUpload(event)">
                                            </label>
                                            ${active.referenceDataUrl ? `<button class="btn btn-outline btn-sm" onclick="SettingsModule.clearDocumentDesignReference()">양식 제거</button>` : ''}
                                            ${active.referenceDataUrl ? `<button class="btn btn-outline btn-sm" onclick="window.open('${active.referenceDataUrl}','_blank')">양식 열기</button>` : ''}
                                        </div>
                                        <div style="margin-top:6px;font-size:.76rem;color:var(--text-muted);">
                                            ${active.referenceName ? `등록됨: ${active.referenceName}` : '이미지나 PDF를 올리면 현재 사용 양식을 캔버스 배경 참조로 볼 수 있습니다.'}
                                        </div>
                                        ${active.referenceDataUrl ? `
                                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;">
                                                <div class="form-group" style="margin:0;"><label class="form-label">배율</label><input class="form-input" type="number" min="0.1" step="0.05" value="${active.referenceScale || 1}" onchange="SettingsModule.updateDocumentDesignMeta('referenceScale', this.value)"></div>
                                                <div class="form-group" style="margin:0;"><label class="form-label">X 이동</label><input class="form-input" type="number" step="1" value="${active.referenceOffsetX || 0}" onchange="SettingsModule.updateDocumentDesignMeta('referenceOffsetX', this.value)"></div>
                                                <div class="form-group" style="margin:0;"><label class="form-label">Y 이동</label><input class="form-input" type="number" step="1" value="${active.referenceOffsetY || 0}" onchange="SettingsModule.updateDocumentDesignMeta('referenceOffsetY', this.value)"></div>
                                                <div class="form-group" style="margin:0;"><label class="form-label">빠른 조정</label><button class="btn btn-outline btn-sm" type="button" onclick="SettingsModule.resetDocumentReferenceView()">맞춤 초기화</button></div>
                                            </div>
                                        ` : ''}
                                    </div>
                                    <div style="font-weight:800;margin-bottom:10px;">요소 속성</div>
                                    ${selected ? `
                                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                                            <div class="form-group"><label class="form-label">X</label><input class="form-input" type="number" value="${selected.x}" onchange="SettingsModule.updateDocumentElement('${selected.id}','x', this.value)"></div>
                                            <div class="form-group"><label class="form-label">Y</label><input class="form-input" type="number" value="${selected.y}" onchange="SettingsModule.updateDocumentElement('${selected.id}','y', this.value)"></div>
                                            <div class="form-group"><label class="form-label">W</label><input class="form-input" type="number" value="${selected.w}" onchange="SettingsModule.updateDocumentElement('${selected.id}','w', this.value)"></div>
                                            <div class="form-group"><label class="form-label">H</label><input class="form-input" type="number" value="${selected.h}" onchange="SettingsModule.updateDocumentElement('${selected.id}','h', this.value)"></div>
                                        </div>
                                        ${selected.type === 'text' ? `<div class="form-group"><label class="form-label">텍스트</label><textarea class="form-textarea" rows="4" onchange="SettingsModule.updateDocumentElement('${selected.id}','text', this.value)">${selected.text || ''}</textarea></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><div class="form-group"><label class="form-label">글자 크기</label><input class="form-input" type="number" value="${selected.fontSize || 14}" onchange="SettingsModule.updateDocumentElement('${selected.id}','fontSize', this.value)"></div><div class="form-group"><label class="form-label">굵기</label><select class="form-select" onchange="SettingsModule.updateDocumentElement('${selected.id}','bold', this.value)"><option value="false" ${!selected.bold ? 'selected' : ''}>보통</option><option value="true" ${selected.bold ? 'selected' : ''}>굵게</option></select></div></div>` : ''}
                                        ${selected.type === 'rect' ? `<div class="form-group"><label class="form-label">라벨</label><input class="form-input" value="${selected.label || ''}" onchange="SettingsModule.updateDocumentElement('${selected.id}','label', this.value)"></div>` : ''}
                                        ${selected.type === 'table' ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><div class="form-group"><label class="form-label">행</label><input class="form-input" type="number" value="${selected.rows || 2}" onchange="SettingsModule.updateDocumentElement('${selected.id}','rows', this.value)"></div><div class="form-group"><label class="form-label">열</label><input class="form-input" type="number" value="${selected.cols || 2}" onchange="SettingsModule.updateDocumentElement('${selected.id}','cols', this.value)"></div></div>` : ''}
                                        <button class="btn btn-danger btn-sm" onclick="SettingsModule.removeDocumentElement('${selected.id}')">요소 삭제</button>
                                    ` : `<div style="color:var(--text-muted);font-size:.86rem;">왼쪽 문서 캔버스에서 요소를 선택해 주세요.</div>`}
                                </div>
                            </div>
                        ` : `<div style="color:var(--text-muted);">디자인이 없습니다.</div>`}
                    </div>
                </div>
            </div>`;
    }

    async function _replaceDocumentDesigns(updater) {
        const rows = await _loadDocumentDesigns();
        const next = typeof updater === 'function' ? updater(rows) : rows;
        await _saveDocumentDesigns(next);
        renderTabContent();
    }

    function selectDocumentDesign(id) {
        _docDesignEditorId = id;
        _docDesignSelectedElementId = '';
        renderTabContent();
    }

    async function createDocumentDesign() {
        await _replaceDocumentDesigns(rows => [
            _docDesignSeed(`doc-design-${Date.now()}`, '새 빈 디자인', '기준서', 'A4-L', []),
            ...rows
        ]);
    }

    async function createDocumentDesignFromUpload(event) {
        const file = event?.target?.files?.[0];
        if (!file) return;
        const referenceType = _resolveReferenceType(file);
        if (!_isDesignTemplateReferenceType(referenceType)) {
            UIUtils.toast('문서 디자인 양식은 PDF 또는 이미지 파일만 사용할 수 있습니다.', 'warning');
            if (event.target) event.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
            let previewMeta = {};
            if (referenceType === 'application/pdf') {
                try {
                    previewMeta = await _buildPdfReferencePreview(String(reader.result || '')) || {};
                } catch (error) {
                    console.warn('[Settings] create design pdf preview failed', error);
                }
            }
            if (referenceType.includes('sheet') || referenceType.includes('excel')) {
                try {
                    previewMeta = await _buildExcelReferencePreview(String(reader.result || '')) || {};
                } catch (error) {
                    console.warn('[Settings] create design excel preview failed', error);
                }
            }
            const newId = `doc-design-${Date.now()}`;
            _docDesignEditorId = newId;
            _docDesignSelectedElementId = '';
            await _replaceDocumentDesigns(rows => [
                _docDesignSeed(newId, file.name.replace(/\.[^.]+$/, '') || '업로드 양식', '기준서', 'A4-L', [], {
                    referenceName: file.name,
                    referenceType,
                    referenceDataUrl: String(reader.result || ''),
                    ...previewMeta
                }),
                ...rows
            ]);
            UIUtils.toast('업로드 양식으로 빈 디자인을 만들었습니다.', 'success');
        };
        reader.readAsDataURL(file);
        if (event.target) event.target.value = '';
    }

    async function updateDocumentDesignMeta(key, value) {
        await _replaceDocumentDesigns(rows => rows.map(d => d.id === _docDesignEditorId ? { ...d, [key]: value } : d));
    }

    async function addDocumentElement(type) {
        const extra = type === 'text'
            ? { text: '텍스트', fontSize: 14, bold: false }
            : type === 'table'
                ? { rows: 3, cols: 3 }
                : type === 'rect'
                    ? { label: '박스', fill: 'transparent' }
                    : {};
        const h = type === 'line' ? 2 : type === 'approval' ? 60 : 80;
        const w = type === 'approval' ? 180 : type === 'line' ? 300 : 180;
        const newElement = _docDesignElement(type, 40, 40, w, h, extra);
        _docDesignSelectedElementId = newElement.id;
        await _replaceDocumentDesigns(rows => rows.map(d => d.id === _docDesignEditorId ? { ...d, elements: [...(d.elements || []), newElement] } : d));
    }

    function selectDocumentElement(id) {
        _docDesignSelectedElementId = id;
        renderTabContent();
    }

    async function updateDocumentElement(id, key, value) {
        const numericKeys = ['x', 'y', 'w', 'h', 'rows', 'cols', 'fontSize'];
        const boolKeys = ['bold'];
        const parsed = numericKeys.includes(key)
            ? Number(value) || 0
            : boolKeys.includes(key)
                ? value === true || value === 'true'
                : value;
        await _replaceDocumentDesigns(rows => rows.map(d => d.id === _docDesignEditorId ? {
            ...d,
            elements: (d.elements || []).map(el => el.id === id ? { ...el, [key]: parsed } : el)
        } : d));
    }

    async function removeDocumentElement(id) {
        _docDesignSelectedElementId = '';
        await _replaceDocumentDesigns(rows => rows.map(d => d.id === _docDesignEditorId ? {
            ...d,
            elements: (d.elements || []).filter(el => el.id !== id)
        } : d));
    }

    async function saveActiveDocumentDesign() {
        const rows = await _loadDocumentDesigns();
        await _saveDocumentDesigns(rows);
        UIUtils.toast('문서 디자인을 저장했습니다.', 'success');
    }

    async function removeDocumentDesign(id) {
        UIUtils.confirm('이 문서 디자인을 삭제하시겠습니까?', async () => {
            _docDesignSelectedElementId = '';
            await _replaceDocumentDesigns(rows => rows.filter(d => d.id !== id));
        });
    }

    async function resetDocumentDesigns() {
        UIUtils.confirm('문서 디자인 샘플을 기본값으로 복원하시겠습니까?', async () => {
            _docDesignEditorId = '';
            _docDesignSelectedElementId = '';
            await _saveDocumentDesigns(_defaultDocumentDesigns());
            UIUtils.toast('문서 디자인 샘플을 복원했습니다.', 'success');
            renderTabContent();
        });
    }

    async function handleDocumentDesignReferenceUpload(event) {
        const file = event?.target?.files?.[0];
        if (!file || !_docDesignEditorId) return;
        const referenceType = _resolveReferenceType(file);
        if (!_isDesignTemplateReferenceType(referenceType)) {
            UIUtils.toast('문서 디자인 양식은 PDF 또는 이미지 파일만 사용할 수 있습니다.', 'warning');
            if (event.target) event.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = async () => {
            let previewMeta = {};
            if (referenceType === 'application/pdf') {
                try {
                    previewMeta = await _buildPdfReferencePreview(String(reader.result || '')) || {};
                } catch (error) {
                    console.warn('[Settings] replace design pdf preview failed', error);
                }
            }
            if (referenceType.includes('sheet') || referenceType.includes('excel')) {
                try {
                    previewMeta = await _buildExcelReferencePreview(String(reader.result || '')) || {};
                } catch (error) {
                    console.warn('[Settings] replace design excel preview failed', error);
                }
            }
            await _replaceDocumentDesigns(rows => rows.map(d => d.id === _docDesignEditorId ? {
                ...d,
                referenceName: file.name,
                referenceType,
                referenceDataUrl: String(reader.result || ''),
                referencePreviewDataUrl: '',
                referencePreviewWidth: 0,
                referencePreviewHeight: 0,
                referencePreviewHtml: '',
                referenceSheetName: '',
                ...previewMeta
            } : d));
            UIUtils.toast('양식을 디자인 참조로 등록했습니다.', 'success');
        };
        reader.readAsDataURL(file);
        if (event.target) event.target.value = '';
    }

    async function clearDocumentDesignReference() {
        await _replaceDocumentDesigns(rows => rows.map(d => d.id === _docDesignEditorId ? {
            ...d,
            referenceName: '',
            referenceType: '',
            referenceDataUrl: '',
            referencePreviewDataUrl: '',
            referencePreviewWidth: 0,
            referencePreviewHeight: 0,
            referencePreviewHtml: '',
            referenceSheetName: '',
            referenceScale: 1,
            referenceOffsetX: 0,
            referenceOffsetY: 0
        } : d));
    }

    async function resetDocumentReferenceView() {
        await _replaceDocumentDesigns(rows => rows.map(d => d.id === _docDesignEditorId ? {
            ...d,
            referenceScale: 1,
            referenceOffsetX: 0,
            referenceOffsetY: 0
        } : d));
    }

    async function startDocumentReferenceDrag(event, mode) {
        if (!_docDesignEditorId) return;
        event.preventDefault();
        event.stopPropagation();
        _cleanupDocumentReferenceDrag();

        const rows = await _loadDocumentDesigns();
        const active = _docSelectedDesign(rows);
        if (!active || !active.referenceDataUrl) return;

        const { scale, offsetX, offsetY } = _docReferenceTransform(active);
        const size = _docCanvasSize();
        const box = _docReferenceBox(size);

        const dragState = {
            mode,
            startX: event.clientX,
            startY: event.clientY,
            startScale: scale,
            startOffsetX: offsetX,
            startOffsetY: offsetY,
            boxW: box.w,
            boxH: box.h
        };

        const moveHandler = (moveEvent) => {
            const dx = moveEvent.clientX - dragState.startX;
            const dy = moveEvent.clientY - dragState.startY;
            let nextScale = dragState.startScale;
            let nextOffsetX = dragState.startOffsetX;
            let nextOffsetY = dragState.startOffsetY;

            if (dragState.mode === 'move') {
                nextOffsetX += dx;
                nextOffsetY += dy;
            } else {
                let ratioDelta = 0;
                if (dragState.mode === 'resize-se') ratioDelta = Math.max(dx / dragState.boxW, dy / dragState.boxH);
                if (dragState.mode === 'resize-ne') ratioDelta = Math.max(dx / dragState.boxW, -dy / dragState.boxH);
                if (dragState.mode === 'resize-sw') ratioDelta = Math.max(-dx / dragState.boxW, dy / dragState.boxH);
                if (dragState.mode === 'resize-nw') ratioDelta = Math.max(-dx / dragState.boxW, -dy / dragState.boxH);
                nextScale = Math.max(0.1, Math.min(5, dragState.startScale * (1 + ratioDelta)));
            }

            dragState.currentScale = Number(nextScale.toFixed(3));
            dragState.currentOffsetX = Math.round(nextOffsetX);
            dragState.currentOffsetY = Math.round(nextOffsetY);
            _applyDocumentReferencePreview(dragState.currentScale, dragState.currentOffsetX, dragState.currentOffsetY);
        };

        const upHandler = async () => {
            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('mouseup', upHandler);
            const finalScale = dragState.currentScale ?? dragState.startScale;
            const finalOffsetX = dragState.currentOffsetX ?? dragState.startOffsetX;
            const finalOffsetY = dragState.currentOffsetY ?? dragState.startOffsetY;
            _docReferenceDragState = null;
            await _replaceDocumentDesigns(items => items.map(item => item.id === _docDesignEditorId ? {
                ...item,
                referenceScale: finalScale,
                referenceOffsetX: finalOffsetX,
                referenceOffsetY: finalOffsetY
            } : item));
        };

        dragState.moveHandler = moveHandler;
        dragState.upHandler = upHandler;
        _docReferenceDragState = dragState;
        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', upHandler);
    }

    async function startDocumentElementDrag(event, elementId, mode) {
        if (!_docDesignEditorId || !elementId) return;
        event.preventDefault();
        event.stopPropagation();
        _cleanupDocumentElementDrag();

        const rows = await _loadDocumentDesigns();
        const active = _docSelectedDesign(rows);
        const target = (active?.elements || []).find(el => el.id === elementId);
        if (!target) return;

        const dragState = {
            id: elementId,
            mode,
            startX: event.clientX,
            startY: event.clientY,
            startLeft: Number(target.x) || 0,
            startTop: Number(target.y) || 0,
            startWidth: Math.max(2, Number(target.w) || 0),
            startHeight: Math.max(2, Number(target.h) || 0)
        };

        const moveHandler = (moveEvent) => {
            const dx = moveEvent.clientX - dragState.startX;
            const dy = moveEvent.clientY - dragState.startY;
            let nextX = dragState.startLeft;
            let nextY = dragState.startTop;
            let nextW = dragState.startWidth;
            let nextH = dragState.startHeight;

            if (dragState.mode === 'move') {
                nextX += dx;
                nextY += dy;
            } else if (dragState.mode === 'resize-se') {
                nextW += dx;
                nextH += dy;
            } else if (dragState.mode === 'resize-sw') {
                nextX += dx;
                nextW -= dx;
                nextH += dy;
            } else if (dragState.mode === 'resize-ne') {
                nextY += dy;
                nextW += dx;
                nextH -= dy;
            } else if (dragState.mode === 'resize-nw') {
                nextX += dx;
                nextY += dy;
                nextW -= dx;
                nextH -= dy;
            }

            nextW = Math.max(target.type === 'line' ? 40 : 24, Math.round(nextW));
            nextH = Math.max(target.type === 'line' ? 2 : 24, Math.round(nextH));
            nextX = Math.round(nextX);
            nextY = Math.round(nextY);

            dragState.currentX = nextX;
            dragState.currentY = nextY;
            dragState.currentW = nextW;
            dragState.currentH = nextH;

            const frame = document.getElementById(`doc-element-frame-${elementId}`);
            if (frame) {
                frame.style.left = `${nextX - 2}px`;
                frame.style.top = `${nextY - 2}px`;
                frame.style.width = `${nextW + 4}px`;
                frame.style.height = `${Math.max(nextH, 2) + 4}px`;
            }
        };

        const upHandler = async () => {
            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('mouseup', upHandler);
            _docElementDragState = null;
            await _replaceDocumentDesigns(items => items.map(item => item.id === _docDesignEditorId ? {
                ...item,
                elements: (item.elements || []).map(el => el.id === elementId ? {
                    ...el,
                    x: dragState.currentX ?? dragState.startLeft,
                    y: dragState.currentY ?? dragState.startTop,
                    w: dragState.currentW ?? dragState.startWidth,
                    h: dragState.currentH ?? dragState.startHeight
                } : el)
            } : item));
        };

        dragState.moveHandler = moveHandler;
        dragState.upHandler = upHandler;
        _docElementDragState = dragState;
        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', upHandler);
    }

    function renderSystemTab(el) {
        el.innerHTML = `
            <!-- ── 서버 운영 상태 ───────────────────────────────── -->
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <h4 style="margin:0;font-size:1rem;font-weight:700;display:flex;align-items:center;gap:6px;">
                    <span class="material-symbols-outlined" style="color:var(--accent-blue);">monitor_heart</span>
                    서버 운영 상태
                </h4>
                <button class="btn btn-sm btn-outline" onclick="SettingsModule.refreshSystemInfo()">
                    <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">refresh</span>
                    새로고침
                </button>
            </div>
            <div id="sysInfoArea">
                <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;">
                    ${_sysCard('memory', 'RAM', '<div style="color:var(--text-muted);font-size:0.82rem;text-align:center;padding:12px 0;">로딩 중…</div>')}
                    ${_sysCard('developer_board', 'CPU', '<div style="color:var(--text-muted);font-size:0.82rem;text-align:center;padding:12px 0;">로딩 중…</div>')}
                    ${_sysCard('storage', '디스크', '<div style="color:var(--text-muted);font-size:0.82rem;text-align:center;padding:12px 0;">로딩 중…</div>')}
                    ${_sysCard('cloud_sync', 'NAS 저장소', '<div style="color:var(--text-muted);font-size:0.82rem;text-align:center;padding:12px 0;">로딩 중</div>')}
                    ${_sysCard('database', 'MariaDB / API', '<div style="color:var(--text-muted);font-size:0.82rem;text-align:center;padding:12px 0;">로딩 중…</div>')}
                </div>
            </div>

            <div class="card" style="margin-bottom:20px;">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">tune</span> 시스템 정보</h4>
                </div>
                <div class="card-body">
                    <div class="info-grid">
                        <div class="info-item">
                            <label>시스템 이름</label>
                            <span>생산 공정 관리 시스템 (MES)</span>
                        </div>
                        <div class="info-item">
                            <label>버전</label>
                            <span>v2.0</span>
                        </div>
                        <div class="info-item">
                            <label>DB 이름</label>
                            <span>mes_db (MariaDB)</span>
                        </div>
                        <div class="info-item">
                            <label>API 서버</label>
                            <span id="sysApiBaseDisplay" style="font-family:monospace;font-size:0.85rem;"></span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ── API 서버 URL 설정 ───────────────────────────── -->
            <div class="card" style="margin-bottom:20px;">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">dns</span> API 서버 URL 설정</h4>
                </div>
                <div class="card-body">
                    <p style="margin-bottom:14px;font-size:0.875rem;color:var(--text-secondary);line-height:1.6;">
                        MES 데이터 서버(Node.js API)의 주소를 입력합니다.
                        변경 후에는 <strong>저장 + 새로고침</strong>이 필요합니다.<br>
                        <span style="font-size:0.8rem;color:var(--text-muted);">※ 비워두면 현재 접속한 호스트의 <code>:3000</code> 포트를 자동 사용합니다.</span>
                    </p>
                    <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
                        <div style="flex:1;min-width:260px;">
                            <label class="form-label">API 서버 URL</label>
                            <input type="text" class="form-input" id="sysApiBaseInput"
                                placeholder="예: http://192.168.10.50:3000"
                                style="font-family:monospace;font-size:0.9rem;">
                        </div>
                        <button class="btn btn-primary" onclick="SettingsModule.saveApiBase()"
                            style="white-space:nowrap;height:40px;">
                            <span class="material-symbols-outlined">save</span> 저장 후 새로고침
                        </button>
                        <button class="btn btn-secondary" onclick="SettingsModule.clearApiBase()"
                            style="white-space:nowrap;height:40px;">
                            <span class="material-symbols-outlined">backspace</span> 초기화 (자동)
                        </button>
                    </div>
                    <div id="sysApiBaseStatus" style="margin-top:8px;font-size:0.8rem;color:var(--text-muted);"></div>
                </div>
            </div>

            <div class="card" style="margin-bottom:20px;border-left:3px solid var(--accent-blue);">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">photo_library</span> 이미지 저장 정책</h4>
                </div>
                <div class="card-body">
                    <p style="margin:0;font-size:0.875rem;color:var(--text-secondary);line-height:1.65;">
                        지그 대장처럼 변경이 적은 이미지는 현재 방식으로도 큰 문제는 없습니다.
                        작업조건 관리 C/S처럼 매일 여러 장 촬영되는 이미지는 장기적으로 NAS 파일 저장 방식이 적합합니다.
                        DB에는 파일 경로, 촬영일, 공정, 등록자, 압축 정보만 저장하고 실제 이미지는 NAS 폴더에 저장하는 구조로 설계하는 것을 권장합니다.
                    </p>
                </div>
            </div>
            <div class="card">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">find_replace</span> 데이터 일괄 수정</h4>
                </div>
                <div class="card-body">
                    <p style="margin-bottom:16px;font-size:0.875rem;color:var(--text-secondary);">
                        전체 DB에서 텍스트를 검색하고, 원하는 항목만 선택해 변경합니다.<br>
                        <strong>① 찾기</strong> → 결과 확인 → <strong>② 바꿀 값 입력</strong> → <strong>③ 선택 항목 변경</strong>
                    </p>

                    <!-- ① 찾기 영역 -->
                    <div style="background:var(--bg-secondary);border-radius:8px;padding:14px 16px;margin-bottom:12px;">
                        <div style="font-size:0.8rem;font-weight:700;color:var(--text-muted);margin-bottom:10px;display:flex;align-items:center;gap:5px;">
                            <span class="material-symbols-outlined" style="font-size:16px;">search</span> STEP 1 — 찾기
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;align-items:flex-end;">
                            <div>
                                <label class="form-label" style="font-size:0.8rem;">검색어</label>
                                <input class="form-input" id="bulkReplaceFrom" placeholder="찾을 텍스트 입력"
                                    style="font-size:0.9rem;"
                                    onkeydown="if(event.key==='Enter') SettingsModule.previewBulkReplace()">
                            </div>
                            <div>
                                <label class="form-label" style="font-size:0.8rem;">대상 필드</label>
                                <select class="form-select" id="bulkReplaceField" style="font-size:0.9rem;">
                                    <option value="*">전체 필드</option>
                                    <option value="carModel">차종</option>
                                    <option value="partName">품명</option>
                                    <option value="color">컬러</option>
                                    <option value="customer">납품처</option>
                                    <option value="supplier">공급사</option>
                                    <option value="supplierName">공급사명</option>
                                    <option value="process1">공정1</option>
                                    <option value="process2">공정2</option>
                                    <option value="process3">공정3</option>
                                    <option value="process4">공정4</option>
                                    <option value="lotNo">LOT번호</option>
                                    <option value="note">비고</option>
                                    <option value="name">이름/품명</option>
                                    <option value="material">재질</option>
                                    <option value="standard">규격</option>
                                </select>
                            </div>
                            <div>
                                <label class="form-label" style="font-size:0.8rem;">일치 방식</label>
                                <div style="display:flex;gap:6px;">
                                    <select class="form-select" id="bulkReplaceMode" style="font-size:0.9rem;">
                                        <option value="contains" selected>포함 (부분 일치)</option>
                                        <option value="exact">완전 일치</option>
                                    </select>
                                    <button class="btn btn-primary" onclick="SettingsModule.previewBulkReplace()" style="white-space:nowrap;">
                                        <span class="material-symbols-outlined">search</span> 찾기
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- ② 변경 영역 (찾기 결과 후 표시) -->
                    <div id="bulkReplaceBar" style="display:none;background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.2);border-radius:8px;padding:12px 16px;margin-bottom:12px;">
                        <div style="font-size:0.8rem;font-weight:700;color:var(--accent-blue);margin-bottom:10px;display:flex;align-items:center;gap:5px;">
                            <span class="material-symbols-outlined" style="font-size:16px;">edit</span> STEP 2 — 바꾸기
                        </div>
                        <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
                            <div style="flex:1;min-width:180px;">
                                <label class="form-label" style="font-size:0.8rem;">바꿀 값 (전체 일괄 적용)</label>
                                <input class="form-input" id="bulkReplaceTo" placeholder="변경 후 값 입력"
                                    style="font-size:0.9rem;"
                                    oninput="SettingsModule.applyGlobalNewVal(this.value)">
                            </div>
                            <button class="btn btn-secondary" onclick="SettingsModule.bulkCheckAll(true)">전체 선택</button>
                            <button class="btn btn-secondary" onclick="SettingsModule.bulkCheckAll(false)">전체 해제</button>
                            <button class="btn btn-primary" onclick="SettingsModule.executeBulkReplace()">
                                <span class="material-symbols-outlined">find_replace</span> 선택 항목 변경
                            </button>
                        </div>
                    </div>

                    <div id="bulkReplaceResult" style="margin-top:4px;"></div>
                </div>
            </div>

            <div class="card" style="margin-top:20px; border-left:3px solid var(--accent-orange,#f59e0b);">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined" style="color:var(--accent-orange,#f59e0b);">barcode_scanner</span> 사출 LOT 번호 형식 검증 / 수정</h4>
                </div>
                <div class="card-body">
                    <p style="margin-bottom:10px; font-size:0.875rem;">
                        사출 창고(재고) · 사출 수입검사 기록의 LOT 번호를 일괄 검증합니다.<br>
                        <span style="color:var(--text-muted); font-size:0.8rem;">
                            형식: <strong>YYMMDD</strong> (6자리 숫자, 유효 날짜)<br>
                            수정 우선순위: ① <strong>입고일 기반 파생</strong>(YYMMDD) → ② 자릿수 보충 → ③ 수정 불가<br>
                            예) <code>26010</code> + 입고일 <code>2026-04-09</code> → <strong>260409</strong>
                        </span>
                    </p>
                    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
                        <button class="btn btn-secondary" onclick="SettingsModule.scanInjLotNumbers()">
                            <span class="material-symbols-outlined">search</span> 검증만 (스캔)
                        </button>
                        <button class="btn btn-primary" onclick="SettingsModule.repairInjLotNumbers()">
                            <span class="material-symbols-outlined">auto_fix_high</span> 검증 + 자동 수정
                        </button>
                    </div>
                    <div id="lotRepairResult" style="margin-top:6px;"></div>
                </div>
            </div>

        `;

        // ── API 서버 URL 표시 / 입력 초기화 ──────────────────────────
        setTimeout(() => {
            const apiBase = (typeof ApiClient !== 'undefined' && ApiClient.getBase)
                ? ApiClient.getBase() : '';
            const saved = (() => { try { return localStorage.getItem('MES_API_BASE') || ''; } catch(e) { return ''; } })();

            const displayEl = document.getElementById('sysApiBaseDisplay');
            if (displayEl) {
                displayEl.textContent = apiBase || '(자동 — 현재 호스트:3000)';
                displayEl.style.color = apiBase ? 'var(--accent-blue)' : 'var(--text-muted)';
            }

            const inputEl = document.getElementById('sysApiBaseInput');
            if (inputEl) inputEl.value = saved;

            const statusEl = document.getElementById('sysApiBaseStatus');
            if (statusEl && apiBase) {
                statusEl.innerHTML = `현재 연결 중: <code style="background:var(--bg-secondary);padding:1px 5px;border-radius:3px;">${apiBase}</code>`;
            }

            // 탭 진입 시 서버 상태 자동 조회
            refreshSystemInfo();
        }, 50);
    }

    async function refreshSystemInfo() {
        const area = document.getElementById('sysInfoArea');
        if (!area) return;

        // 로딩 스피너 표시
        area.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;padding:20px;
                        color:var(--text-muted);font-size:0.88rem;">
                <span class="material-symbols-outlined" style="animation:spin 1s linear infinite;font-size:20px;">sync</span>
                서버 상태를 가져오는 중…
            </div>
            <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
        `;

        let d;
        try {
            d = await ApiClient.getSystemInfo();
        } catch(err) {
            area.innerHTML = `
                <div style="padding:16px;background:rgba(239,68,68,0.07);border:1px solid rgba(239,68,68,0.3);
                            border-radius:8px;color:#dc2626;font-size:0.85rem;margin-bottom:20px;">
                    <span class="material-symbols-outlined" style="vertical-align:middle;margin-right:6px;">error</span>
                    서버 상태 조회 실패: ${err.message || err}
                </div>`;
            return;
        }

        // ── 메모리 카드 ──────────────────────────────────────────────
        const memUsedPct = d.mem.total ? (d.mem.used / d.mem.total * 100) : 0;
        const memCard = _sysCard('memory', 'RAM',
            _row('전체', _fmtBytes(d.mem.total)) +
            _row('사용', _fmtBytes(d.mem.used)) +
            _row('여유', _fmtBytes(d.mem.free)) +
            _gauge(memUsedPct)
        );

        // ── CPU 카드 ─────────────────────────────────────────────────
        const la = d.cpu.loadAvg || [0, 0, 0];
        const cpuCard = _sysCard('developer_board', 'CPU',
            _row('모델', `<span style="font-size:0.75rem;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;">${d.cpu.model}</span>`) +
            _row('코어 수', `${d.cpu.count}개`) +
            _row('부하 (1/5/15m)', `${la[0].toFixed(2)} / ${la[1].toFixed(2)} / ${la[2].toFixed(2)}`) +
            _gauge(d.cpu.usagePct)
        );

        // ── 디스크 카드 ──────────────────────────────────────────────
        const diskPct = d.disk ? parseFloat(d.disk.usePct) : 0;
        const diskCard = _sysCard('storage', '디스크 (/)',
            d.disk
                ? _row('전체', d.disk.total) +
                  _row('사용', d.disk.used) +
                  _row('여유', d.disk.avail) +
                  _gauge(diskPct)
                : '<span style="color:var(--text-muted);font-size:0.82rem;">정보 없음</span>'
        );

        let nas = d.nas || null;
        if (!nas && typeof ApiClient !== 'undefined' && ApiClient.getNasConfig) {
            try {
                const cfg = await ApiClient.getNasConfig();
                nas = {
                    configured: !!(cfg?.nasDir),
                    mounted: false,
                    writable: false,
                    path: cfg?.nasDir || '',
                    keepCount: cfg?.keepCount || '',
                    disk: null,
                    legacyOnly: true
                };
            } catch (_) {
                nas = { configured: false, mounted: false, writable: false, path: '', keepCount: '', disk: null, legacyOnly: true };
            }
        }
        nas = nas || {};
        const nasPct = nas.disk ? parseFloat(nas.disk.usePct) : 0;
        const nasStatusText = nas.legacyOnly ? '상태 조회 미지원' : !nas.configured ? '미설정' : nas.mounted ? (nas.writable ? '정상' : '쓰기 불가') : '마운트 안 됨';
        const nasStatusColor = nas.mounted && nas.writable ? '#22c55e' : '#ef4444';
        const nasCard = _sysCard('cloud_sync', 'NAS 저장소',
            `<div style="display:flex;align-items:center;padding:4px 0;border-bottom:1px solid var(--border-color);font-size:0.82rem;">
                 ${_statusDot(nas.mounted && nas.writable)}<span style="color:var(--text-muted);">상태</span>
                 <span style="margin-left:auto;font-weight:600;color:${nasStatusColor};">${nasStatusText}</span>
             </div>` +
            _row('경로', `<span style="font-size:0.72rem;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;">${nas.path || '-'}</span>`) +
            (nas.disk
                ? _row('전체', nas.disk.total) +
                  _row('사용', nas.disk.used) +
                  _row('여유', nas.disk.avail) +
                  _gauge(nasPct)
                : _row('용량', nas.legacyOnly ? '서버 배포 후 표시' : '정보 없음')) +
            _row('보관 개수', `${nas.keepCount || '-'}개`)
        );

        // ── DB / API 카드 ─────────────────────────────────────────────
        const dbOk  = d.db?.ok;
        const apiOk = true; // 여기까지 왔으면 API는 정상
        const nodeRss = _fmtBytes(d.process?.rss);
        const dbCard = _sysCard('database', 'MariaDB / API',
            `<div style="display:flex;align-items:center;padding:4px 0;border-bottom:1px solid var(--border-color);font-size:0.82rem;">
                 ${_statusDot(apiOk)}<span style="color:var(--text-muted);">API 서버</span>
                 <span style="margin-left:auto;font-weight:600;color:#22c55e;">정상</span>
             </div>` +
            `<div style="display:flex;align-items:center;padding:4px 0;border-bottom:1px solid var(--border-color);font-size:0.82rem;">
                 ${_statusDot(dbOk)}<span style="color:var(--text-muted);">MariaDB</span>
                 <span style="margin-left:auto;font-weight:600;color:${dbOk ? '#22c55e' : '#ef4444'};">
                     ${dbOk ? '정상' : '오류'}${dbOk && d.db.latency != null ? ` (${d.db.latency}ms)` : ''}
                 </span>
             </div>` +
            (d.db?.version ? _row('DB 버전', d.db.version) : '') +
            _row('Node.js RSS', nodeRss) +
            _row('서버 업타임', _fmtUptime(d.uptime?.node)) +
            _row('OS 업타임', _fmtUptime(d.uptime?.system))
        );

        // ── OS 정보 배너 ─────────────────────────────────────────────
        const osBanner = `
            <div style="display:flex;gap:20px;flex-wrap:wrap;padding:10px 16px;
                        background:var(--bg-secondary);border-radius:8px;margin-bottom:16px;
                        font-size:0.8rem;color:var(--text-secondary);">
                <span><strong>호스트</strong>: ${d.os?.hostname || '-'}</span>
                <span><strong>OS</strong>: ${d.os?.platform || '-'} ${d.os?.release || ''}</span>
                <span><strong>아키텍처</strong>: ${d.os?.arch || '-'}</span>
                <span style="margin-left:auto;color:var(--text-muted);">
                    조회 시각: ${new Date(d.timestamp).toLocaleTimeString('ko-KR')}
                </span>
            </div>`;

        area.innerHTML = osBanner +
            `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;">
                ${memCard}${cpuCard}${diskCard}${nasCard}${dbCard}
             </div>`;
    }

    function saveApiBase() {
        const inputEl = document.getElementById('sysApiBaseInput');
        const val = (inputEl ? inputEl.value : '').trim().replace(/\/$/, '');
        try {
            if (val) {
                localStorage.setItem('MES_API_BASE', val);
                UIUtils.toast(`API 서버 URL이 저장되었습니다. 새로고침합니다…`, 'success');
            } else {
                localStorage.removeItem('MES_API_BASE');
                UIUtils.toast('API 서버 URL이 초기화되었습니다(자동). 새로고침합니다…', 'success');
            }
            setTimeout(() => location.reload(), 1200);
        } catch(e) {
            UIUtils.toast('저장 실패: ' + e.message, 'error');
        }
    }

    function clearApiBase() {
        try {
            localStorage.removeItem('MES_API_BASE');
        } catch(e) {}
        const inputEl = document.getElementById('sysApiBaseInput');
        if (inputEl) inputEl.value = '';
        const statusEl = document.getElementById('sysApiBaseStatus');
        if (statusEl) statusEl.textContent = 'API 서버 URL 초기화됨 — 저장 후 새로고침하세요.';
        UIUtils.toast('초기화되었습니다. "저장 후 새로고침"을 눌러 적용하세요.', 'info');
    }

    // ── 범용 일괄 수정 ────────────────────────────────────────────────
    const _BULK_TEXT_FIELDS = [
        'carModel','partName','color','customer','supplier','supplierName',
        'process1','process2','process3','process4','process5','process6',
        'lotNo','note','remark','name','type','status','unit','packUnit',
        'material','standard','spec','location','manager','inspector'
    ];

    const _STORE_LABEL = {
        products:'제품 마스터', defect_types:'불량유형', paint_materials:'도료 마스터',
        injection_materials:'사출자재', raw_materials:'원재료',
        production_plans:'생산계획', injection_inspections:'사출 수입검사',
        injection_inventory:'사출 창고', paint_incoming_inspections:'도료 수입검사',
        paint_inventory:'도료 창고', painting_incoming:'도장 입고',
        painting_work:'도장 작업', painting_inspections:'도장 검사',
        painting_outgoing:'도장 출고', shipping_standby:'출하대기',
        shipping_inspections:'출하검사', product_inventory:'제품 창고',
        product_outgoing:'제품 출고', sales_delivery:'납품관리',
        sales_delivery_plan:'납품계획', jig_master:'JIG 마스터',
        prod_conditions:'작업조건', prod_standards:'제조표준'
    };

    const _FIELD_LABEL = {
        carModel:'차종', partName:'품명', color:'컬러', customer:'납품처',
        supplier:'공급사', supplierName:'공급사명', process1:'공정1',
        process2:'공정2', process3:'공정3', process4:'공정4',
        process5:'공정5', process6:'공정6', lotNo:'LOT번호',
        note:'비고', remark:'비고2', name:'이름/품명', type:'유형',
        status:'상태', unit:'단위', packUnit:'포장단위',
        material:'재질', standard:'규격', spec:'사양',
        location:'위치', manager:'담당자', inspector:'검사자'
    };

    let _bulkHits = []; // 조회 결과 캐시

    function _getBulkInputs() {
        const from  = (document.getElementById('bulkReplaceFrom')?.value || '').trim();
        const to    = (document.getElementById('bulkReplaceTo')?.value  ?? '').trim();
        const field = document.getElementById('bulkReplaceField')?.value || '*';
        const mode  = document.getElementById('bulkReplaceMode')?.value  || 'exact';
        return { from, to, field, mode };
    }

    function _bulkScan({ from, field, mode }) {
        if (!from) return [];
        const allStores = Object.values(DB.STORES);
        const hits = [];
        for (const storeName of allStores) {
            try {
                const records = Storage.getAll(storeName) || [];
                for (const rec of records) {
                    const fields = field === '*' ? _BULK_TEXT_FIELDS : [field];
                    for (const f of fields) {
                        const val = rec[f];
                        if (val == null || typeof val !== 'string' || !val.trim()) continue;
                        const matched = mode === 'exact' ? val === from : val.includes(from);
                        if (matched) {
                            // 레코드 식별용 컨텍스트 수집
                            const ctx = [
                                rec.date || rec.inspDate || '',
                                rec.carModel && f !== 'carModel' ? rec.carModel : '',
                                rec.partName && f !== 'partName' ? rec.partName : '',
                                rec.color   && f !== 'color'    ? rec.color    : ''
                            ].filter(Boolean).join(' / ');
                            hits.push({ storeName, id: rec.id, field: f, oldVal: val, ctx });
                        }
                    }
                }
            } catch (_) {}
        }
        return hits;
    }

    function _calcNewVal(oldVal, from, to, mode) {
        return mode === 'exact' ? to : oldVal.replaceAll(from, to);
    }

    function previewBulkReplace() {
        const inputs = _getBulkInputs();
        const resultEl = document.getElementById('bulkReplaceResult');
        const barEl    = document.getElementById('bulkReplaceBar');
        if (!inputs.from) { UIUtils.toast('검색어를 입력하세요.', 'warning'); return; }

        _bulkHits = _bulkScan(inputs);

        if (!_bulkHits.length) {
            if (barEl) barEl.style.display = 'none';
            resultEl.innerHTML = `
                <div style="padding:12px 16px;background:var(--bg-secondary);border-radius:8px;
                            font-size:0.87rem;color:var(--text-muted);display:flex;align-items:center;gap:8px;">
                    <span class="material-symbols-outlined" style="font-size:18px;">search_off</span>
                    "<strong>${_esc(inputs.from)}</strong>" — 일치하는 데이터가 없습니다.
                </div>`;
            return;
        }

        // 변경 바 표시 (바꿀 값 초기화)
        if (barEl) { barEl.style.display = 'block'; }
        const toEl = document.getElementById('bulkReplaceTo');
        if (toEl) toEl.value = '';

        const rows = _bulkHits.map((h, i) => {
            const storeLabel = _STORE_LABEL[h.storeName] || h.storeName;
            const fieldLabel = _FIELD_LABEL[h.field]    || h.field;
            // 검색어 하이라이트
            const highlighted = _esc(h.oldVal).replace(
                new RegExp(_escRegex(_esc(inputs.from)), 'gi'),
                m => `<mark style="background:rgba(251,191,36,0.45);border-radius:2px;padding:0 1px;">${m}</mark>`
            );
            return `
                <tr id="bulkRow_${i}" style="border-bottom:1px solid var(--border-color);">
                    <td style="padding:7px 8px;text-align:center;">
                        <input type="checkbox" class="bulk-row-chk" data-idx="${i}" checked
                            style="width:15px;height:15px;cursor:pointer;accent-color:var(--accent-blue);">
                    </td>
                    <td style="padding:7px 8px;font-size:0.8rem;color:var(--text-muted);white-space:nowrap;">${_esc(storeLabel)}</td>
                    <td style="padding:7px 8px;font-size:0.8rem;white-space:nowrap;">
                        <span style="background:var(--bg-secondary);padding:2px 7px;border-radius:4px;font-size:0.75rem;">${_esc(fieldLabel)}</span>
                    </td>
                    <td style="padding:7px 8px;font-size:0.8rem;color:var(--text-muted);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${_esc(h.ctx)}">${_esc(h.ctx) || '-'}</td>
                    <td style="padding:7px 8px;">${highlighted}</td>
                    <td style="padding:7px 4px;text-align:center;color:var(--text-muted);font-size:0.9rem;">→</td>
                    <td style="padding:5px 6px;">
                        <input type="text" class="form-input bulk-new-val" data-idx="${i}" data-old="${_esc(h.oldVal)}"
                            value=""
                            placeholder="바꿀 값"
                            style="font-size:0.85rem;padding:3px 8px;height:28px;min-width:110px;
                                   color:var(--accent-green);font-weight:600;border-color:rgba(16,185,129,0.35);">
                    </td>
                </tr>`;
        }).join('');

        resultEl.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
                <span class="material-symbols-outlined" style="font-size:17px;color:var(--accent-blue);">list_alt</span>
                <span style="font-size:0.88rem;font-weight:600;">
                    "<strong style="color:var(--accent-blue);">${_esc(inputs.from)}</strong>"
                    — 총 <strong style="color:var(--accent-blue);">${_bulkHits.length}건</strong> 발견
                </span>
                <span style="font-size:0.78rem;color:var(--text-muted);">(바꿀 값을 입력 후 변경하세요)</span>
            </div>
            <div style="border-radius:8px;border:1px solid var(--border-color);overflow:hidden;">
                <div style="max-height:420px;overflow-y:auto;">
                    <table style="width:100%;border-collapse:collapse;">
                        <thead style="background:linear-gradient(180deg,#f1f5f9,#e8ecf1);position:sticky;top:0;z-index:2;">
                            <tr>
                                <th style="padding:7px 8px;text-align:center;border-bottom:1px solid var(--border-color);width:34px;">
                                    <input type="checkbox" id="bulkChkAll" checked
                                        onchange="SettingsModule.bulkCheckAll(this.checked)"
                                        style="width:15px;height:15px;cursor:pointer;accent-color:var(--accent-blue);">
                                </th>
                                <th style="padding:7px 8px;font-size:0.78rem;text-align:left;border-bottom:1px solid var(--border-color);">스토어</th>
                                <th style="padding:7px 8px;font-size:0.78rem;text-align:left;border-bottom:1px solid var(--border-color);">필드</th>
                                <th style="padding:7px 8px;font-size:0.78rem;text-align:left;border-bottom:1px solid var(--border-color);">레코드 정보</th>
                                <th style="padding:7px 8px;font-size:0.78rem;text-align:left;border-bottom:1px solid var(--border-color);">현재 값 (검색어 강조)</th>
                                <th style="padding:7px 2px;border-bottom:1px solid var(--border-color);width:18px;"></th>
                                <th style="padding:7px 8px;font-size:0.78rem;text-align:left;border-bottom:1px solid var(--border-color);">바꿀 값 <span style="font-weight:400;color:var(--text-muted);">(행별 개별 수정 가능)</span></th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
            <div id="bulkApplyResult" style="margin-top:10px;"></div>`;
    }

    function _escRegex(s) {
        return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // 상단 "바꿀 값" 입력 시 모든 행에 자동 반영
    function applyGlobalNewVal(val) {
        const from  = (document.getElementById('bulkReplaceFrom')?.value || '').trim();
        const mode  = document.getElementById('bulkReplaceMode')?.value || 'contains';
        document.querySelectorAll('.bulk-new-val').forEach(el => {
            const oldVal = el.dataset.old || '';
            el.value = mode === 'exact' ? val : oldVal.replaceAll(from, val);
        });
    }

    function bulkCheckAll(checked) {
        document.querySelectorAll('.bulk-row-chk').forEach(el => el.checked = checked);
        const all = document.getElementById('bulkChkAll');
        if (all) all.checked = checked;
    }

    async function executeBulkReplace() {
        const resultEl = document.getElementById('bulkApplyResult') || document.getElementById('bulkReplaceResult');

        // 체크된 행의 idx와 새 값 수집
        const selected = [];
        document.querySelectorAll('.bulk-row-chk:checked').forEach(chk => {
            const idx = parseInt(chk.dataset.idx, 10);
            const newValEl = document.querySelector(`.bulk-new-val[data-idx="${idx}"]`);
            const newVal = newValEl ? newValEl.value : '';
            // 바꿀 값이 비어있으면 변경 대상에서 제외
            if (_bulkHits[idx] && newVal.trim() !== '') selected.push({ hit: _bulkHits[idx], newVal });
            else if (_bulkHits[idx] && newVal.trim() === '') { /* 빈 값 경고를 위해 포함하지 않음 */ }
        });

        const emptyCount = document.querySelectorAll('.bulk-row-chk:checked').length - selected.length;
        if (emptyCount > 0 && selected.length === 0) {
            UIUtils.toast(`바꿀 값을 입력하세요. (${emptyCount}건 모두 비어 있음)`, 'warning'); return;
        }
        if (!selected.length) { UIUtils.toast('수정할 항목을 선택하거나 바꿀 값을 입력하세요.', 'warning'); return; }

        UIUtils.confirm(
            `선택한 ${selected.length}건을 수정합니다.\n계속하시겠습니까?`,
            async () => {
                let done = 0, fail = 0;
                // 같은 레코드에 여러 필드가 선택된 경우 묶기
                const recMap = {};
                for (const { hit, newVal } of selected) {
                    const key = `${hit.storeName}||${hit.id}`;
                    if (!recMap[key]) recMap[key] = { storeName: hit.storeName, id: hit.id, changes: {} };
                    recMap[key].changes[hit.field] = newVal;
                }
                for (const { storeName, id, changes } of Object.values(recMap)) {
                    try {
                        const rec = Storage.getById(storeName, id);
                        if (rec) {
                            await Storage.update(storeName, id, { ...rec, ...changes });
                            done++;
                        }
                    } catch (_) { fail++; }
                }
                const msg = `${done}건 수정 완료${fail ? ` / ${fail}건 실패` : ''}.`;
                const color = fail ? 'var(--accent-red)' : 'var(--accent-green)';
                const bg    = fail ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)';
                const icon  = fail ? 'warning' : 'check_circle';
                if (resultEl) resultEl.innerHTML = `
                    <div style="padding:10px 14px;background:${bg};border-radius:8px;
                                font-size:0.88rem;font-weight:600;color:${color};
                                display:flex;align-items:center;gap:8px;">
                        <span class="material-symbols-outlined" style="font-size:18px;">${icon}</span>${msg}
                    </div>`;
                UIUtils.toast(msg, fail ? 'warning' : 'success');
                // 수정된 행 시각적 처리
                document.querySelectorAll('.bulk-row-chk:checked').forEach(chk => {
                    const row = document.getElementById(`bulkRow_${chk.dataset.idx}`);
                    if (row) row.style.background = 'rgba(16,185,129,0.07)';
                });
                _bulkHits = []; // 캐시 초기화
            }
        );
    }

    function migrateProcessNames() {
        UIUtils.confirm('기존 제품 정보의 공정명을 일괄 수정하시겠습니까?\n• 도장A → 도장-A, 도장B → 도장-B\n• 검사 / 외관검사 → 외관 검사\n• 외관+각인검사 → 외관+각인 검사', async () => {
            const products = Storage.getAll(PRODUCTS_STORE) || [];
            let updatedCount = 0;

            for (const product of products) {
                let hasChanges = false;

                // 모든 process 필드 확인 및 변경
                for (let i = 1; i <= 4; i++) {
                    const processKey = `process${i}`;
                    if (product[processKey]) {
                        const oldValue = product[processKey];
                        // 공정명 변경
                        let newValue = oldValue
                            .replace(/도장A\b/g, '도장-A')      // 도장A → 도장-A
                            .replace(/도장B\b/g, '도장-B')      // 도장B → 도장-B
                            .replace(/^검사$/g, '외관 검사')          // 검사 → 외관 검사
                            .replace(/^외관검사$/g, '외관 검사')      // 외관검사 → 외관 검사 (기존 데이터 호환)
                            .replace(/^외관\+각인검사$/g, '외관+각인 검사'); // 외관+각인검사 → 외관+각인 검사

                        if (newValue !== oldValue) {
                            product[processKey] = newValue;
                            hasChanges = true;
                        }
                    }
                }

                // 변경사항이 있으면 저장
                if (hasChanges) {
                    await Storage.update(PRODUCTS_STORE, product.id, product);
                    updatedCount++;
                }
            }

            // 메모리 캐시 새로고침
            await Storage.init();

            UIUtils.toast(`${updatedCount}개의 제품 정보가 업데이트되었습니다.`, 'success');
            renderTabContent();
        });
    }

    async function migrateSupplierName() {
        const FROM = '화인칼라테크';
        const TO   = '화인컬러테크';
        UIUtils.confirm(`"${FROM}" → "${TO}" 으로 일괄 수정합니까?\n도료 마스터 및 수입검사 기록이 모두 변경됩니다.`, async () => {
            let count = 0;

            // 도료 마스터
            const paints = Storage.getAll(DB.STORES.PAINT_MATERIALS) || [];
            for (const p of paints) {
                if (p.supplier === FROM) {
                    await Storage.update(DB.STORES.PAINT_MATERIALS, p.id, { ...p, supplier: TO });
                    count++;
                }
            }

            // 도료 수입검사 기록
            const inspections = Storage.getAll(DB.STORES.PAINT_INCOMING_INSPECTIONS) || [];
            for (const i of inspections) {
                if (i.supplier === FROM) {
                    await Storage.update(DB.STORES.PAINT_INCOMING_INSPECTIONS, i.id, { ...i, supplier: TO });
                    count++;
                }
            }

            UIUtils.toast(`완료 — ${count}건 수정 (${FROM} → ${TO})`, 'success');
            renderTabContent();
        });
    }

    async function migrateExpDates() {
        UIUtils.confirm('도료 수입검사 기록의 유효기간을 재계산합니까?\n제조일자 + 유효기한으로 유효기간을 다시 계산하고,\n도료 창고 재고의 유효기간도 함께 갱신됩니다.', async () => {
            // shelfLife 문자열 → 개월 수
            function _parseMonths(val) {
                if (!val) return 12;
                const s = String(val).trim();
                const y = s.match(/(\d+)\s*년/);
                const m = s.match(/(\d+)\s*개월/);
                const n = s.match(/^(\d+)$/);
                if (y) return parseInt(y[1]) * 12;
                if (m) return parseInt(m[1]);
                if (n) return parseInt(n[1]);
                return 12;
            }
            // 날짜 + 개월
            function _addMonths(dateStr, months) {
                const d = new Date(dateStr);
                d.setMonth(d.getMonth() + months);
                return d.toISOString().slice(0, 10);
            }

            const inspections = Storage.getAll(DB.STORES.PAINT_INCOMING_INSPECTIONS) || [];
            const inventory   = Storage.getAll(DB.STORES.PAINT_INVENTORY) || [];

            // inspectionId → correct expDate 맵
            const expMap = {};
            let inspCount = 0;

            for (const insp of inspections) {
                if (!insp.mfgDate || !insp.shelfLife) continue;
                const months  = _parseMonths(insp.shelfLife);
                const correct = _addMonths(insp.mfgDate, months);
                if (insp.expDate === correct) continue;
                expMap[insp.id] = correct;
                await Storage.update(DB.STORES.PAINT_INCOMING_INSPECTIONS, insp.id, { ...insp, expDate: correct });
                inspCount++;
            }

            // 도료 창고 재고도 갱신
            let invCount = 0;
            for (const row of inventory) {
                if (!row.sourceInspectionId) continue;
                const correct = expMap[row.sourceInspectionId];
                if (!correct || row.expDate === correct) continue;
                await Storage.update(DB.STORES.PAINT_INVENTORY, row.id, { ...row, expDate: correct });
                invCount++;
            }

            await Storage.init();
            UIUtils.toast(`유효기간 재계산 완료 — 수입검사 ${inspCount}건, 창고재고 ${invCount}건 수정`, 'success');
        });
    }

    // ══════════════════════════════════════════════════════════════════
    // 제조 공정 관리 탭
    // ══════════════════════════════════════════════════════════════════

    async function _loadProcessTypes() {
        try {
            const saved = await Storage.getConfigValue(PROCESS_CONFIG_KEY);
            if (Array.isArray(saved) && saved.length > 0) _processTypes = saved;
        } catch(e) {}
        try {
            const savedSub = await Storage.getConfigValue(SUB_PROCESS_CONFIG_KEY);
            if (savedSub && typeof savedSub === 'object' && !Array.isArray(savedSub)) {
                _subProcessTypes = savedSub;
            } else {
                // 기본값 복사 (새 설치 또는 첫 로드)
                _subProcessTypes = JSON.parse(JSON.stringify(DEFAULT_SUB_PROCESS_TYPES));
            }
        } catch(e) {
            _subProcessTypes = JSON.parse(JSON.stringify(DEFAULT_SUB_PROCESS_TYPES));
        }
        // 현재 주공정 중 세부 공정 키가 없으면 빈 배열로 초기화
        _processTypes.forEach(p => {
            if (!_subProcessTypes[p]) _subProcessTypes[p] = [];
        });
        // 초기 선택 주공정
        if (!_selectedMainForSub || !_processTypes.includes(_selectedMainForSub)) {
            _selectedMainForSub = _processTypes[0] || '';
        }
    }

    async function _saveProcessTypes() {
        await Storage.setConfigValue(PROCESS_CONFIG_KEY, _processTypes);
    }

    async function _saveSubProcessTypes() {
        await Storage.setConfigValue(SUB_PROCESS_CONFIG_KEY, _subProcessTypes);
    }

    function renderProcessTab(el) {
        el.innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1.6fr;gap:20px;align-items:start;">

                <!-- ① 주공정 카드 -->
                <div class="card">
                    <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
                        <h4 style="margin:0;font-size:0.95rem;display:flex;align-items:center;gap:6px;">
                            <span class="material-symbols-outlined" style="font-size:18px;">account_tree</span>
                            주공정 관리
                        </h4>
                        <button class="btn btn-primary btn-sm" onclick="SettingsModule.openAddProcessModal()">
                            <span class="material-symbols-outlined">add</span> 추가
                        </button>
                    </div>
                    <div class="card-body">
                        <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:12px;">
                            제품 정보의 <strong>제조 공정</strong> 선택 항목을 관리합니다.
                        </p>
                        <div id="processTypeList">
                            ${_renderProcessList()}
                        </div>
                        <div style="margin-top:12px;padding:8px 12px;
                                    background:rgba(59,130,246,0.06);border-radius:8px;
                                    font-size:0.78rem;color:var(--text-muted);">
                            <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">info</span>
                            공정 변경 시 기존 저장된 값은 자동 변경되지 않습니다.
                        </div>
                    </div>
                </div>

                <!-- ② 세부 공정 카드 -->
                <div class="card">
                    <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
                        <h4 style="margin:0;font-size:0.95rem;display:flex;align-items:center;gap:6px;">
                            <span class="material-symbols-outlined" style="font-size:18px;">device_hub</span>
                            세부 공정 관리
                        </h4>
                        <button class="btn btn-primary btn-sm" onclick="SettingsModule.openAddSubProcessModal()">
                            <span class="material-symbols-outlined">add</span> 추가
                        </button>
                    </div>
                    <div class="card-body">
                        <p style="font-size:0.8rem;color:var(--text-muted);margin-bottom:12px;">
                            주공정별 <strong>세부 공정(스테이션)</strong>을 관리합니다.
                            CP 관리계획서의 공정 명칭과 일치해야 합니다.
                        </p>
                        <!-- 주공정 탭 선택 -->
                        <div id="subProcMainTabs" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">
                            ${_renderMainProcTabs()}
                        </div>
                        <!-- 세부 공정 목록 -->
                        <div id="subProcessList">
                            ${_renderSubProcessList()}
                        </div>
                        <div style="margin-top:12px;padding:8px 12px;
                                    background:rgba(16,185,129,0.06);border-radius:8px;
                                    font-size:0.78rem;color:var(--text-muted);">
                            <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle;">info</span>
                            세부 공정명은 관리계획서(CP)의 공정 스테이션 명칭과 일치시켜 주세요.
                        </div>
                    </div>
                </div>

            </div>
        `;
    }

    function _renderProcessList() {
        if (_processTypes.length === 0) {
            return `<p style="color:var(--text-muted);text-align:center;padding:30px;">
                        등록된 공정이 없습니다. 공정 추가 버튼으로 추가하세요.
                    </p>`;
        }
        return `
            <div style="display:flex;flex-direction:column;gap:6px;max-width:600px;">
                ${_processTypes.map((proc, idx) => `
                    <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;
                                background:var(--bg-secondary);border-radius:8px;
                                border:1px solid var(--border-color);">
                        <span style="display:flex;flex-direction:column;gap:1px;">
                            <button onclick="SettingsModule.moveProcess(${idx}, -1)"
                                    title="위로"
                                    style="background:none;border:none;cursor:pointer;
                                           color:${idx === 0 ? 'var(--border-color)' : 'var(--text-muted)'};
                                           padding:0;line-height:1;font-size:13px;"
                                    ${idx === 0 ? 'disabled' : ''}>▲</button>
                            <button onclick="SettingsModule.moveProcess(${idx}, 1)"
                                    title="아래로"
                                    style="background:none;border:none;cursor:pointer;
                                           color:${idx === _processTypes.length - 1 ? 'var(--border-color)' : 'var(--text-muted)'};
                                           padding:0;line-height:1;font-size:13px;"
                                    ${idx === _processTypes.length - 1 ? 'disabled' : ''}>▼</button>
                        </span>
                        <span style="font-size:0.8rem;color:var(--text-muted);width:22px;
                                     text-align:right;flex-shrink:0;">${idx + 1}</span>
                        <span style="flex:1;font-weight:600;font-size:0.92rem;
                                     color:var(--text-primary);">${proc}</span>
                        <button class="btn btn-sm btn-outline"
                                onclick="SettingsModule.editProcess(${idx})">수정</button>
                        <button class="btn btn-sm"
                                style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;"
                                onclick="SettingsModule.removeProcess(${idx})">삭제</button>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function _refreshProcessList() {
        const el = document.getElementById('processTypeList');
        if (el) el.innerHTML = _renderProcessList();
        // 주공정 탭도 갱신
        const tabEl = document.getElementById('subProcMainTabs');
        if (tabEl) tabEl.innerHTML = _renderMainProcTabs();
        _refreshSubProcessList();
    }

    // ── 세부 공정 렌더링 ──────────────────────────────────────────────

    function _renderMainProcTabs() {
        if (_processTypes.length === 0) return '';
        // 선택된 주공정이 현재 목록에 없으면 첫 번째로 재설정
        if (!_processTypes.includes(_selectedMainForSub)) {
            _selectedMainForSub = _processTypes[0];
        }
        return _processTypes.map(p => {
            const isActive = p === _selectedMainForSub;
            const subCnt   = (_subProcessTypes[p] || []).length;
            return `
                <button onclick="SettingsModule.selectMainForSub('${p.replace(/'/g, "\\'")}')"
                        style="padding:5px 12px;border-radius:20px;border:1px solid;font-size:0.8rem;
                               cursor:pointer;display:flex;align-items:center;gap:5px;
                               background:${isActive ? 'var(--accent-blue)' : 'transparent'};
                               color:${isActive ? '#fff' : 'var(--text-primary)'};
                               border-color:${isActive ? 'var(--accent-blue)' : 'var(--border-color)'};">
                    ${p}
                    <span style="font-size:0.72rem;padding:1px 5px;border-radius:10px;
                                 background:${isActive ? 'rgba(255,255,255,0.25)' : 'var(--bg-secondary)'};
                                 color:${isActive ? '#fff' : 'var(--text-muted)'};">${subCnt}</span>
                </button>`;
        }).join('');
    }

    function _renderSubProcessList() {
        const main = _selectedMainForSub;
        if (!main) return `<p style="color:var(--text-muted);text-align:center;padding:20px;">주공정을 선택하세요.</p>`;
        const subs = _subProcessTypes[main] || [];
        if (subs.length === 0) {
            return `<p style="color:var(--text-muted);text-align:center;padding:20px;">
                        등록된 세부 공정이 없습니다. <strong>추가</strong> 버튼으로 등록하세요.
                    </p>`;
        }
        return `
            <div style="display:flex;flex-direction:column;gap:5px;">
                ${subs.map((sub, idx) => `
                    <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;
                                background:var(--bg-secondary);border-radius:8px;
                                border:1px solid var(--border-color);">
                        <span style="display:flex;flex-direction:column;gap:1px;">
                            <button onclick="SettingsModule.moveSubProcess(${idx}, -1)"
                                    style="background:none;border:none;cursor:pointer;
                                           color:${idx === 0 ? 'var(--border-color)' : 'var(--text-muted)'};
                                           padding:0;line-height:1;font-size:12px;"
                                    ${idx === 0 ? 'disabled' : ''}>▲</button>
                            <button onclick="SettingsModule.moveSubProcess(${idx}, 1)"
                                    style="background:none;border:none;cursor:pointer;
                                           color:${idx === subs.length - 1 ? 'var(--border-color)' : 'var(--text-muted)'};
                                           padding:0;line-height:1;font-size:12px;"
                                    ${idx === subs.length - 1 ? 'disabled' : ''}>▼</button>
                        </span>
                        <span style="font-size:0.78rem;color:var(--text-muted);width:20px;
                                     text-align:right;flex-shrink:0;">${idx + 1}</span>
                        <span style="flex:1;font-weight:600;font-size:0.88rem;
                                     color:var(--text-primary);">${sub}</span>
                        <button class="btn btn-sm btn-outline"
                                onclick="SettingsModule.editSubProcess(${idx})">수정</button>
                        <button class="btn btn-sm"
                                style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;"
                                onclick="SettingsModule.removeSubProcess(${idx})">삭제</button>
                    </div>
                `).join('')}
            </div>`;
    }

    function _refreshSubProcessList() {
        const el = document.getElementById('subProcessList');
        if (el) el.innerHTML = _renderSubProcessList();
        const tabEl = document.getElementById('subProcMainTabs');
        if (tabEl) tabEl.innerHTML = _renderMainProcTabs();
    }

    function selectMainForSub(mainProc) {
        _selectedMainForSub = mainProc;
        _refreshSubProcessList();
    }

    function openAddSubProcessModal() {
        const main = _selectedMainForSub;
        if (!main) { UIUtils.toast('먼저 주공정을 선택하세요.', 'warning'); return; }
        UIUtils.showModal(`세부 공정 추가 — ${main}`, `
            <div class="form-group">
                <label class="form-label">세부 공정명 <span style="color:red;">*</span></label>
                <input id="newSubProcessName" class="form-control" type="text"
                       placeholder="예: 로딩, 세척, 상도 스프레이" style="font-size:1rem;">
                <p style="font-size:0.8rem;color:var(--text-muted);margin-top:6px;">
                    CP 관리계획서의 스테이션 명칭과 일치하게 입력하세요.
                </p>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SettingsModule.addSubProcess()">추가</button>
        `, 'sm');
        setTimeout(() => { const el = document.getElementById('newSubProcessName'); if(el) el.focus(); }, 80);
    }

    async function addSubProcess() {
        const name = (document.getElementById('newSubProcessName')?.value || '').trim();
        if (!name) { UIUtils.toast('세부 공정명을 입력하세요.', 'warning'); return; }
        const main = _selectedMainForSub;
        if (!main) { UIUtils.toast('주공정이 선택되지 않았습니다.', 'warning'); return; }
        if (!_subProcessTypes[main]) _subProcessTypes[main] = [];
        if (_subProcessTypes[main].includes(name)) {
            UIUtils.toast('이미 존재하는 세부 공정명입니다.', 'warning'); return;
        }
        _subProcessTypes[main].push(name);
        await _saveSubProcessTypes();
        UIUtils.closeModal();
        UIUtils.toast(`"${name}" 세부 공정이 추가되었습니다.`, 'success');
        _refreshSubProcessList();
    }

    function editSubProcess(idx) {
        const main = _selectedMainForSub;
        const current = (_subProcessTypes[main] || [])[idx] || '';
        UIUtils.showModal('세부 공정 수정', `
            <div class="form-group">
                <label class="form-label">세부 공정명</label>
                <input id="editSubProcessName" class="form-control" type="text"
                       value="${current}" style="font-size:1rem;">
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SettingsModule.updateSubProcess(${idx})">수정</button>
        `, 'sm');
        setTimeout(() => { const el = document.getElementById('editSubProcessName'); if(el) el.focus(); }, 80);
    }

    async function updateSubProcess(idx) {
        const name = (document.getElementById('editSubProcessName')?.value || '').trim();
        if (!name) { UIUtils.toast('세부 공정명을 입력하세요.', 'warning'); return; }
        const main = _selectedMainForSub;
        const subs = _subProcessTypes[main] || [];
        if (subs.includes(name) && subs[idx] !== name) {
            UIUtils.toast('이미 존재하는 세부 공정명입니다.', 'warning'); return;
        }
        subs[idx] = name;
        _subProcessTypes[main] = subs;
        await _saveSubProcessTypes();
        UIUtils.closeModal();
        UIUtils.toast('수정되었습니다.', 'success');
        _refreshSubProcessList();
    }

    async function removeSubProcess(idx) {
        const main = _selectedMainForSub;
        const subs = _subProcessTypes[main] || [];
        const name = subs[idx];
        UIUtils.confirm(`"${name}" 세부 공정을 삭제하시겠습니까?`, async () => {
            subs.splice(idx, 1);
            _subProcessTypes[main] = subs;
            await _saveSubProcessTypes();
            UIUtils.toast(`"${name}" 세부 공정이 삭제되었습니다.`, 'success');
            _refreshSubProcessList();
        });
    }

    async function moveSubProcess(idx, dir) {
        const main = _selectedMainForSub;
        const subs = _subProcessTypes[main] || [];
        const newIdx = idx + dir;
        if (newIdx < 0 || newIdx >= subs.length) return;
        [subs[idx], subs[newIdx]] = [subs[newIdx], subs[idx]];
        _subProcessTypes[main] = subs;
        await _saveSubProcessTypes();
        _refreshSubProcessList();
    }

    function openAddProcessModal() {
        UIUtils.showModal('공정 추가', `
            <div class="form-group">
                <label class="form-label">공정명 <span style="color:red;">*</span></label>
                <input id="newProcessName" class="form-control" type="text"
                       placeholder="예: 도장-C, 조립" style="font-size:1rem;">
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SettingsModule.addProcess()">추가</button>
        `, 'sm');
        setTimeout(() => { const el = document.getElementById('newProcessName'); if(el) el.focus(); }, 80);
    }

    async function addProcess() {
        const name = (document.getElementById('newProcessName')?.value || '').trim();
        if (!name) { UIUtils.toast('공정명을 입력하세요.', 'warning'); return; }
        if (_processTypes.includes(name)) { UIUtils.toast('이미 존재하는 공정명입니다.', 'warning'); return; }
        _processTypes.push(name);
        await _saveProcessTypes();
        UIUtils.closeModal();
        UIUtils.toast(`"${name}" 공정이 추가되었습니다.`, 'success');
        _refreshProcessList();
    }

    function editProcess(idx) {
        const current = _processTypes[idx] || '';
        UIUtils.showModal('공정 수정', `
            <div class="form-group">
                <label class="form-label">공정명</label>
                <input id="editProcessName" class="form-control" type="text"
                       value="${current}" style="font-size:1rem;">
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SettingsModule.updateProcess(${idx})">저장</button>
        `, 'sm');
        setTimeout(() => { const el = document.getElementById('editProcessName'); if(el) el.focus(); }, 80);
    }

    async function updateProcess(idx) {
        const name = (document.getElementById('editProcessName')?.value || '').trim();
        if (!name) { UIUtils.toast('공정명을 입력하세요.', 'warning'); return; }
        if (_processTypes.includes(name) && _processTypes[idx] !== name) {
            UIUtils.toast('이미 존재하는 공정명입니다.', 'warning'); return;
        }
        _processTypes[idx] = name;
        await _saveProcessTypes();
        UIUtils.closeModal();
        UIUtils.toast('수정되었습니다.', 'success');
        _refreshProcessList();
    }

    async function removeProcess(idx) {
        const name = _processTypes[idx];
        UIUtils.confirm(`"${name}" 공정을 삭제하시겠습니까?\n기존 제품 정보에 저장된 값은 변경되지 않습니다.`, async () => {
            _processTypes.splice(idx, 1);
            await _saveProcessTypes();
            UIUtils.toast(`"${name}" 공정이 삭제되었습니다.`, 'success');
            _refreshProcessList();
        });
    }

    async function moveProcess(idx, dir) {
        const newIdx = idx + dir;
        if (newIdx < 0 || newIdx >= _processTypes.length) return;
        [_processTypes[idx], _processTypes[newIdx]] = [_processTypes[newIdx], _processTypes[idx]];
        await _saveProcessTypes();
        _refreshProcessList();
    }

    function clearAllData() {
        UIUtils.confirm('⚠️ 정말로 모든 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.', async () => {
            const stores = Object.values(DB.STORES).filter(s => s !== 'config');
            for (const storeName of stores) {
                await DB.clear(storeName);
            }
            await Storage.init();
            UIUtils.toast('모든 데이터가 초기화되었습니다.', 'success');
            renderTabContent();
        });
    }

    // ══════════════════════════════════════════════════════════════════
    // 사출자재 제작품목 ↔ 생산계획 품명 매칭 검토
    // ══════════════════════════════════════════════════════════════════

    /**
     * 문자열 유사도 계산 (0~1)
     * 정확 일치 → 1.0 / 포함 관계 → 0.85 / 공통 문자 비율 → 0~0.8
     */
    /**
     * 사출자재 검증 모달 열기
     * — 사출자재의 productIds ↔ 제품 정보의 연결 상태를 양방향으로 검증
     */
    function openMfgMatchingReview() {
        const mats     = Storage.getAll(INJECT_MAT_STORE) || [];
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];

        if (mats.length === 0) { UIUtils.toast('등록된 사출자재가 없습니다.', 'warning'); return; }

        // 제품 ID → 제품 객체 맵
        const prodMap = {};
        products.forEach(p => { prodMap[p.id] = p; });

        // 사출자재 productIds에 포함된 제품 ID 집합 (역방향 체크용 — ID 연결만)
        const linkedProductIdSet = new Set();
        mats.forEach(m => (m.productIds || []).forEach(id => { if (id) linkedProductIdSet.add(id); }));

        // 텍스트 기반으로 연결된 제품 키 집합 (carModel||partName)
        const textLinkedKeySet = new Set();
        mats.forEach(m => {
            if (m.productIds && m.productIds.length > 0) return; // ID 연결 있으면 스킵
            const mc = m.carModel || '';
            if (m.mfgProductName)  textLinkedKeySet.add(`${mc}||${m.mfgProductName.trim()}`);
            if (m.mfgProductName2) textLinkedKeySet.add(`${mc}||${m.mfgProductName2.trim()}`);
        });

        // ── 슬롯 상태 판별 (ID 우선, 텍스트 fallback) ──────────────────
        // 'linked'     : productId 있고 제품도 존재 (ID 연결)
        // 'text'       : productId 없지만 텍스트 일치 제품 있음
        // 'textOrphan' : 텍스트는 있지만 일치하는 제품 없음
        // 'missing'    : productId 있지만 제품 삭제됨
        // 'empty'      : productId·텍스트 모두 없음
        function slotStatus(mat, slotIdx) {
            const pid      = (mat.productIds || [])[slotIdx] || '';
            const textName = slotIdx === 0
                ? (mat.mfgProductName  || '').trim()
                : (mat.mfgProductName2 || '').trim();

            if (pid) {
                const prod = prodMap[pid] || null;
                return prod ? { type: 'linked', prod, textName }
                            : { type: 'missing', prod: null, textName };
            }
            if (textName) {
                const mc = (mat.carModel || '').trim();
                const prod = products.find(p =>
                    (p.partName || '').trim() === textName &&
                    (!mc || p.carModel === mc)
                ) || products.find(p => (p.partName || '').trim() === textName) || null;
                return prod ? { type: 'text', prod, textName }
                            : { type: 'textOrphan', prod: null, textName };
            }
            return { type: 'empty', prod: null, textName: '' };
        }

        function slotCell(st) {
            if (st.type === 'linked') {
                const name  = st.prod.partName || '-';
                const color = st.prod.color ? ` / ${st.prod.color}` : '';
                return `<td style="padding:5px 8px;font-size:0.78rem;
                                   background:rgba(52,211,153,0.1);border-left:3px solid #10b981;">
                    <span style="font-weight:600;">${name}${color}</span>
                    <span style="display:block;font-size:0.7rem;color:var(--text-muted);">
                        ${st.prod.carModel||''}
                        <span style="background:#10b981;color:#fff;border-radius:3px;padding:0 4px;font-size:0.65rem;margin-left:3px;">ID</span>
                    </span>
                </td>`;
            }
            if (st.type === 'text') {
                const name  = st.prod.partName || st.textName;
                const color = st.prod.color ? ` / ${st.prod.color}` : '';
                return `<td style="padding:5px 8px;font-size:0.78rem;
                                   background:rgba(251,191,36,0.1);border-left:3px solid #f59e0b;">
                    <span style="font-weight:600;color:#92400e;">${name}${color}</span>
                    <span style="display:block;font-size:0.7rem;color:#b45309;">
                        ${st.prod.carModel||''}
                        <span style="background:#f59e0b;color:#fff;border-radius:3px;padding:0 4px;font-size:0.65rem;margin-left:3px;">텍스트</span>
                    </span>
                </td>`;
            }
            if (st.type === 'textOrphan') {
                return `<td style="padding:5px 8px;font-size:0.78rem;
                                   background:rgba(239,68,68,0.1);border-left:3px solid #ef4444;">
                    <span style="color:#ef4444;font-weight:600;">${st.textName}</span>
                    <span style="display:block;font-size:0.7rem;color:#ef4444;">제품마스터 없음</span>
                </td>`;
            }
            if (st.type === 'missing') {
                return `<td style="padding:5px 8px;font-size:0.78rem;
                                   background:rgba(239,68,68,0.1);border-left:3px solid #ef4444;">
                    <span style="color:#ef4444;font-weight:600;">⚠ 제품 없음</span>
                    <span style="display:block;font-size:0.7rem;color:var(--text-muted);">(삭제된 제품 ID)</span>
                </td>`;
            }
            return `<td style="padding:5px 8px;font-size:0.75rem;color:var(--text-muted);">—</td>`;
        }

        function rowStatus(st1, st2) {
            if (st1.type === 'missing'    || st2.type === 'missing' ||
                st1.type === 'textOrphan' || st2.type === 'textOrphan')
                return `<span style="color:#ef4444;font-size:0.75rem;font-weight:700;">✗ 오류</span>`;
            const hasId   = st1.type === 'linked' || st2.type === 'linked';
            const hasText = st1.type === 'text'   || st2.type === 'text';
            if (hasId)   return `<span style="color:#10b981;font-size:0.75rem;font-weight:700;">✓ ID 연결</span>`;
            if (hasText) return `<span style="color:#f59e0b;font-size:0.75rem;font-weight:700;">⚠ 텍스트만</span>`;
            return `<span style="color:#9ca3af;font-size:0.75rem;">— 미설정</span>`;
        }

        // 통계
        let cntOk = 0, cntText = 0, cntError = 0, cntEmpty = 0;
        const uniqueCars = UIUtils.sortCarModels(mats.map(m => m.carModel), mats);

        const rows = mats.map((m, idx) => {
            const st1 = slotStatus(m, 0);
            const st2 = slotStatus(m, 1);
            const hasError = st1.type === 'missing'    || st2.type === 'missing' ||
                             st1.type === 'textOrphan' || st2.type === 'textOrphan';
            const hasId    = st1.type === 'linked' || st2.type === 'linked';
            const hasText  = !hasError && !hasId && (st1.type === 'text' || st2.type === 'text');
            if (hasError)      cntError++;
            else if (hasId)    cntOk++;
            else if (hasText)  cntText++;
            else               cntEmpty++;

            return `<tr data-car="${(m.carModel||'').replace(/"/g,'&quot;')}"
                        data-idx="${idx}"
                        data-issue="${hasError}"
                        data-textonly="${hasText}"
                        style="border-bottom:1px solid var(--border-color);">
                <td style="padding:5px 6px;font-size:0.75rem;white-space:nowrap;width:72px;max-width:72px;overflow:hidden;text-overflow:ellipsis;">${m.carModel||'-'}</td>
                <td style="padding:5px 8px;font-size:0.78rem;font-weight:600;white-space:nowrap;">${m.injPartName||'-'}</td>
                <td style="padding:5px 6px;font-size:0.72rem;color:var(--text-muted);white-space:nowrap;width:56px;max-width:56px;overflow:hidden;text-overflow:ellipsis;">${m.injColor||'-'}</td>
                ${slotCell(st1)}
                ${slotCell(st2)}
                <td style="padding:5px 8px;text-align:center;white-space:nowrap;">${rowStatus(st1,st2)}</td>
            </tr>`;
        }).join('');

        // 역방향: 사출자재에 연결되지 않은 제품 (ID·텍스트 모두 고려)
        const unlinkedProds = products.filter(p => {
            if (linkedProductIdSet.has(p.id)) return false;
            const key1 = `${p.carModel||''}||${(p.partName||'').trim()}`;
            const key2 = `||${(p.partName||'').trim()}`;
            return !textLinkedKeySet.has(key1) && !textLinkedKeySet.has(key2);
        });
        const unlinkedHtml = unlinkedProds.length === 0
            ? `<p style="color:#10b981;font-size:0.82rem;margin:0;">✓ 모든 제품이 사출자재에 연결되어 있습니다.</p>`
            : `<div style="max-height:120px;overflow-y:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:0.78rem;">
                    <thead><tr style="background:var(--bg-secondary);">
                        <th style="padding:5px 8px;text-align:left;">차종</th>
                        <th style="padding:5px 8px;text-align:left;">품명</th>
                        <th style="padding:5px 8px;text-align:left;">컬러</th>
                    </tr></thead>
                    <tbody>
                    ${unlinkedProds.map(p => `<tr style="border-bottom:1px solid var(--border-color);">
                        <td style="padding:4px 8px;">${p.carModel||'-'}</td>
                        <td style="padding:4px 8px;font-weight:600;">${p.partName||'-'}</td>
                        <td style="padding:4px 8px;">${p.color||'-'}</td>
                    </tr>`).join('')}
                    </tbody>
                </table>
              </div>`;

        const bodyHtml = `
        <!-- 범례 -->
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;font-size:0.75rem;">
            <span style="background:rgba(52,211,153,0.15);border:1px solid #10b981;border-radius:4px;padding:2px 8px;color:#065f46;">
                <strong>ID 연결</strong> — productIds로 직접 연결됨 (정상)</span>
            <span style="background:rgba(251,191,36,0.15);border:1px solid #f59e0b;border-radius:4px;padding:2px 8px;color:#92400e;">
                <strong>텍스트만</strong> — 이름 텍스트로만 연결, ID 미등록 (자동 연결 권장)</span>
            <span style="background:rgba(239,68,68,0.15);border:1px solid #ef4444;border-radius:4px;padding:2px 8px;color:#991b1b;">
                <strong>오류</strong> — 삭제된 제품 ID 또는 존재하지 않는 제품명</span>
        </div>
        <!-- 통계 -->
        <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:8px 14px;
                    background:var(--bg-secondary);border-radius:6px;margin-bottom:10px;font-size:0.8rem;">
            <span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;
                               background:#10b981;margin-right:4px;vertical-align:middle;"></span>
                ID 연결 <strong>${cntOk}</strong></span>
            <span style="color:#92400e;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;
                               background:#f59e0b;margin-right:4px;vertical-align:middle;"></span>
                텍스트만 <strong>${cntText}</strong></span>
            <span style="color:#9ca3af;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;
                               background:#d1d5db;margin-right:4px;vertical-align:middle;"></span>
                미설정 <strong>${cntEmpty}</strong></span>
            <span style="color:#ef4444;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;
                               background:#ef4444;margin-right:4px;vertical-align:middle;"></span>
                오류 <strong>${cntError}</strong></span>
            <span style="margin-left:auto;color:var(--text-muted);">
                사출자재 <strong>${mats.length}</strong>건 / 제품 <strong>${products.length}</strong>건
            </span>
        </div>
        <!-- 필터 -->
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
            <select id="matchFiltCar" class="form-select" style="width:130px;font-size:0.82rem;padding:5px 8px;"
                    onchange="SettingsModule._filterMatchTable()">
                <option value="">전체 차종</option>
                ${uniqueCars.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
            <label style="display:flex;align-items:center;gap:5px;font-size:0.82rem;cursor:pointer;user-select:none;">
                <input type="checkbox" id="matchFiltIssue" onchange="SettingsModule._filterMatchTable()">
                오류 항목만 보기
            </label>
            <label style="display:flex;align-items:center;gap:5px;font-size:0.82rem;cursor:pointer;user-select:none;">
                <input type="checkbox" id="matchFiltText" onchange="SettingsModule._filterMatchTable()">
                텍스트만 연결 보기
            </label>
            ${cntText > 0 ? `
            <button onclick="SettingsModule.autoLinkAllProductIds()"
                style="margin-left:auto;padding:5px 14px;font-size:0.8rem;background:#6366f1;color:#fff;
                       border:none;border-radius:6px;cursor:pointer;font-weight:600;">
                <span style="vertical-align:middle;">⚡</span> 텍스트→ID 일괄 자동 연결 (${cntText}건)
            </button>` : ''}
        </div>
        <!-- 사출자재 → 제품 연결 테이블 -->
        <div style="max-height:36vh;overflow-y:auto;overflow-x:auto;
                    border:1px solid var(--border-color);border-radius:6px;margin-bottom:14px;">
            <table style="width:100%;border-collapse:collapse;" id="mfgMatchTable">
                <thead style="position:sticky;top:0;z-index:3;background:var(--bg-secondary);">
                    <tr>
                        <th style="padding:7px 6px;text-align:left;border-bottom:2px solid var(--border-color);font-size:0.72rem;white-space:nowrap;width:72px;max-width:72px;">차종</th>
                        <th style="padding:7px 8px;text-align:left;border-bottom:2px solid var(--border-color);font-size:0.72rem;white-space:nowrap;">사출품명</th>
                        <th style="padding:7px 6px;text-align:left;border-bottom:2px solid var(--border-color);font-size:0.72rem;white-space:nowrap;width:56px;max-width:56px;">컬러</th>
                        <th style="padding:7px 8px;text-align:left;border-bottom:2px solid var(--border-color);font-size:0.72rem;white-space:nowrap;min-width:200px;">제작품목1</th>
                        <th style="padding:7px 8px;text-align:left;border-bottom:2px solid var(--border-color);font-size:0.72rem;white-space:nowrap;min-width:200px;">제작품목2</th>
                        <th style="padding:7px 8px;text-align:center;border-bottom:2px solid var(--border-color);font-size:0.72rem;white-space:nowrap;">연결 상태</th>
                    </tr>
                </thead>
                <tbody id="mfgMatchBody">${rows}</tbody>
            </table>
        </div>
        <!-- 역방향: 사출자재 미연결 제품 -->
        <div style="border:1px solid var(--border-color);border-radius:6px;padding:10px 14px;">
            <div style="font-size:0.8rem;font-weight:700;margin-bottom:8px;color:var(--text-secondary);">
                사출자재 미연결 제품 (ID·텍스트 모두 없음)
                <span style="font-weight:400;color:var(--text-muted);margin-left:6px;">${unlinkedProds.length}건</span>
            </div>
            ${unlinkedHtml}
        </div>`;

        UIUtils.showModal(
            '사출자재 검증 — 제작품목 ↔ 제품 연결 상태',
            bodyHtml,
            `<button class="btn btn-primary" onclick="UIUtils.closeModal()">닫기</button>`,
            'xxl'
        );
        setTimeout(() => {
            const c = document.querySelector('#modal .modal-container');
            if (c) {
                c.style.setProperty('width',      '78vw', 'important');
                c.style.setProperty('max-height', '72vh', 'important');
            }
            _initModalResize();
        }, 0);
    }

    /**
     * 모달 오른쪽 가장자리 드래그 리사이즈 핸들
     * ─ 핸들을 document.body에 position:fixed 로 붙임 (overflow/clip 완전 우회)
     * ─ CSS !important 를 이기기 위해 setProperty(..., 'important') 사용
     */
    function _initModalResize() {
        const container = document.querySelector('#modal .modal-container');
        if (!container) return;

        // ── 기존 핸들 제거 (중복 방지) ──
        const old = document.getElementById('_mfgResizeHandle');
        if (old) old.remove();

        // ── position:fixed 핸들 생성 (body 직속) ──
        const handle = document.createElement('div');
        handle.id    = '_mfgResizeHandle';
        handle.title = '← 드래그하여 창 너비 조절 →';

        function _placeHandle() {
            const r = container.getBoundingClientRect();
            handle.style.cssText = [
                'position:fixed',
                'top:'    + r.top    + 'px',
                'left:'   + (r.right - 14) + 'px',
                'width:14px',
                'height:' + r.height + 'px',
                'cursor:ew-resize',
                'z-index:99999',
                'background:linear-gradient(to right,transparent 0%,rgba(99,102,241,0.45) 100%)',
                'border-radius:0 8px 8px 0',
                'transition:background 0.15s',
            ].join(';');
        }

        _placeHandle();
        document.body.appendChild(handle);

        // ── 드래그 로직 ──
        handle.addEventListener('mousedown', function(e) {
            e.preventDefault();
            const startX = e.clientX;
            const startW = container.offsetWidth;

            document.body.style.userSelect = 'none';
            document.body.style.cursor     = 'ew-resize';

            function onMove(ev) {
                const newW = Math.max(640,
                    Math.min(startW + (ev.clientX - startX), window.innerWidth * 0.98));
                // setProperty 'important' → CSS !important 규칙도 덮어씀
                container.style.setProperty('width',     newW + 'px', 'important');
                container.style.setProperty('max-width', 'none',      'important');
                _placeHandle();   // 핸들 위치도 실시간 갱신
            }
            function onUp() {
                document.body.style.userSelect = '';
                document.body.style.cursor     = '';
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup',  onUp);
            }
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup',  onUp);
        });

        // ── 모달 닫힐 때 핸들 자동 제거 (MutationObserver) ──
        const modalEl = document.getElementById('modal');
        const obs = new MutationObserver(function() {
            if (!modalEl.classList.contains('active')) {
                handle.remove();
                obs.disconnect();
                // 인라인 width 초기화 (다음 모달 오픈 시 영향 방지)
                container.style.removeProperty('width');
                container.style.removeProperty('max-width');
            }
        });
        obs.observe(modalEl, { attributes: true, attributeFilter: ['class'] });
    }

    /** 입력값 변경 시 호출 — 사용자 수정 시 주황 음영으로 교체 */
    /** 사출자재 검증 테이블 필터 */
    function _filterMatchTable() {
        const carFilter  = ((document.getElementById('matchFiltCar')   || {}).value || '');
        const issueOnly  = !!(document.getElementById('matchFiltIssue') || {}).checked;
        const textOnly   = !!(document.getElementById('matchFiltText')  || {}).checked;
        const tbody = document.getElementById('mfgMatchBody');
        if (!tbody) return;
        tbody.querySelectorAll('tr[data-idx]').forEach(row => {
            const matchCar   = !carFilter || row.dataset.car      === carFilter;
            const matchIssue = !issueOnly || row.dataset.issue    === 'true';
            const matchText  = !textOnly  || row.dataset.textonly === 'true';
            row.style.display = (matchCar && matchIssue && matchText) ? '' : 'none';
        });
    }

    // 구버전 호환용 빈 함수 (외부에서 호출될 수 있으므로 유지)
    function _onMatchInput() {}
    async function applyMfgMatching() {}

    /**
     * 텍스트만 연결된 사출자재 1건에 대해 mfgProductName → productIds 자동 변환
     * @param {string} matId  - 사출자재 ID
     * @param {boolean} refresh - true 이면 완료 후 탭 재렌더링
     */
    async function autoLinkProductIds(matId, refresh) {
        const m = Storage.getById(INJECT_MAT_STORE, matId);
        if (!m) { UIUtils.toast('사출자재를 찾을 수 없습니다.', 'warning'); return; }

        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        function findProd(name) {
            if (!name) return null;
            const nm = name.trim();
            const mc = (m.carModel || '').trim();
            return products.find(p =>
                (p.partName || '').trim() === nm && (p.carModel === mc || !mc)
            ) || products.find(p => (p.partName || '').trim() === nm) || null;
        }

        const n1 = (m.mfgProductName  || '').trim();
        const n2 = (m.mfgProductName2 || '').trim();
        const p1 = findProd(n1);
        const p2 = findProd(n2);

        if (!p1 && !p2) {
            UIUtils.toast(`"${n1||n2}" — 일치하는 제품을 찾을 수 없습니다.`, 'warning');
            return;
        }

        const newProductIds = [];
        if (n1) newProductIds.push(p1 ? p1.id : ''); // 슬롯1: 못 찾으면 빈 문자열
        if (n2) newProductIds.push(p2 ? p2.id : ''); // 슬롯2

        await Storage.update(INJECT_MAT_STORE, matId, { ...m, productIds: newProductIds });
        await Storage.refresh(INJECT_MAT_STORE);

        const linked = [p1 && n1, p2 && n2].filter(Boolean).join(', ');
        UIUtils.toast(`ID 연결 완료: ${linked}`, 'success');

        if (refresh) renderTabContent();
    }

    /**
     * 텍스트만 연결된 사출자재 전체를 productIds로 일괄 변환
     */
    async function autoLinkAllProductIds() {
        const mats     = Storage.getAll(INJECT_MAT_STORE) || [];
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];

        function findProd(name, carModel) {
            if (!name) return null;
            const nm = name.trim();
            const mc = (carModel || '').trim();
            return products.find(p =>
                (p.partName || '').trim() === nm && (p.carModel === mc || !mc)
            ) || products.find(p => (p.partName || '').trim() === nm) || null;
        }

        const targets = mats.filter(m => {
            const n1 = (m.mfgProductName  || '').trim();
            const n2 = (m.mfgProductName2 || '').trim();
            return (n1 || n2) && !(m.productIds && m.productIds.length > 0);
        });

        if (targets.length === 0) {
            UIUtils.toast('텍스트만 연결된 사출자재가 없습니다.', 'info');
            return;
        }

        let updated = 0, skipped = 0;
        for (const m of targets) {
            const n1 = (m.mfgProductName  || '').trim();
            const n2 = (m.mfgProductName2 || '').trim();
            const p1 = findProd(n1, m.carModel);
            const p2 = findProd(n2, m.carModel);

            if (!p1 && !p2) { skipped++; continue; }

            const newProductIds = [];
            if (n1) newProductIds.push(p1 ? p1.id : '');
            if (n2) newProductIds.push(p2 ? p2.id : '');

            await Storage.update(INJECT_MAT_STORE, m.id, { ...m, productIds: newProductIds });
            updated++;
        }

        await Storage.refresh(INJECT_MAT_STORE);

        const msg = skipped > 0
            ? `${updated}건 ID 연결 완료, ${skipped}건 매칭 실패 (제품마스터 확인 필요)`
            : `${updated}건 사출자재 ID 연결 완료`;
        UIUtils.toast(msg, updated > 0 ? 'success' : 'warning');
        UIUtils.closeModal();
        renderTabContent();
    }

    // ── 품명 실시간 중복 체크 ───────────────────────────────────────────
    // idPrefix: 'addProd' | 'editProd'
    function checkPartNameDuplicate(idPrefix) {
        const hintEl = document.getElementById(`${idPrefix}PartNameHint`);
        if (!hintEl) return;

        const partName = (document.getElementById(`${idPrefix}PartName`) || {}).value.trim();
        const carModel = (document.getElementById(`${idPrefix}CarModel`) || {}).value.trim();
        const color    = (document.getElementById(`${idPrefix}Color`)    || {}).value.trim();
        // 현재 편집 중인 제품 ID (수정 모드에서는 자기 자신 제외)
        const selfId = idPrefix === 'editProd'
            ? (document.querySelector('[onclick*="updateProduct"]') || {}).onclick?.toString().match(/'([^']+)'/)?.[1] || ''
            : '';

        if (!partName) { hintEl.innerHTML = ''; return; }

        const all = Storage.getAll(PRODUCTS_STORE) || [];
        const sameName = all.filter(p => p.id !== selfId
            && (p.carModel || '') === carModel
            && (p.partName || '').trim() === partName);

        if (sameName.length === 0) {
            hintEl.innerHTML = `<span style="color:var(--accent-green);">✓ 사용 가능한 품명입니다.</span>`;
            return;
        }

        const exactDup = sameName.find(p => (p.color || '').trim() === color);
        if (exactDup) {
            hintEl.innerHTML = `<span style="color:var(--accent-red);font-weight:600;">⛔ 동일 제품(${carModel} / ${partName} / ${color})이 이미 존재합니다. 저장 불가.</span>`;
            return;
        }

        // 같은 차종·품명, 다른 컬러
        const colorList = sameName.map(p => p.color || '(컬러없음)').join(', ');
        hintEl.innerHTML = `<span style="color:#d97706;font-weight:600;">⚠ 동일 차종·품명이 이미 있습니다 (기존 컬러: ${colorList}).<br>
            사출 자재 등록 시 <strong>injColor</strong>로 컬러를 반드시 구분하세요.</span>`;
    }

    // ── 전체 품명 중복 진단 + 인라인 수정 UI ─────────────────────────────
    function showDuplicatePartNameReport() {
        const products = Storage.getAll(PRODUCTS_STORE) || [];
        const injMats  = Storage.getAll(INJECT_MAT_STORE) || [];

        // 1) 완전 중복 (carModel + partName + color 모두 동일)
        const exactDups = [];
        const seen = {};
        products.forEach(p => {
            const key = `${p.carModel||''}||${(p.partName||'').trim()}||${(p.color||'').trim()}`;
            if (!seen[key]) { seen[key] = []; }
            seen[key].push(p);
        });
        Object.entries(seen).forEach(([k, arr]) => {
            if (arr.length > 1) exactDups.push({ key: k, items: arr });
        });

        // 2) 같은 품명 그룹 (carModel + partName 동일, 컬러 다름) → 사출자재 injColor 미설정 위험
        const nameSeen = {};
        products.forEach(p => {
            const key = `${p.carModel||''}||${(p.partName||'').trim()}`;
            if (!nameSeen[key]) nameSeen[key] = [];
            nameSeen[key].push(p);
        });
        const sameNameGroups = Object.entries(nameSeen).filter(([, arr]) => arr.length > 1);

        // 3) 사출자재 injColor 미설정 (같은 injPartName이 여러 제품에 연결)
        const injPartCount = {};
        injMats.forEach(m => {
            const k = `${m.carModel||''}||${(m.injPartName||'').trim()}`;
            if (!injPartCount[k]) injPartCount[k] = { mat: m, count: 0 };
            injPartCount[k].count++;
        });

        // 모달 HTML 생성
        let html = '';

        // 완전 중복
        if (exactDups.length > 0) {
            html += `<div style="margin-bottom:16px;padding:10px 14px;background:rgba(220,38,38,0.07);
                        border:1px solid rgba(220,38,38,0.3);border-radius:8px;">
                <div style="font-weight:700;color:var(--accent-red);margin-bottom:6px;">
                    ⛔ 완전 중복 제품 (${exactDups.length}건) — 한 쪽을 삭제하세요
                </div>`;
            exactDups.forEach(({ key, items }) => {
                const [cm, pn, cl] = key.split('||');
                html += `<div style="font-size:0.83rem;padding:4px 0;border-bottom:1px solid var(--border-color);">
                    <strong>${cm} / ${pn} / ${cl || '(컬러없음)'}</strong>
                    — ${items.length}개 중복
                    ${items.map(p =>
                        `<span style="margin-left:8px;font-size:0.75rem;color:var(--text-muted);">ID: ${p.id}
                        <button onclick="UIUtils.closeModal();SettingsModule.editProduct('${p.id}');"
                            style="margin-left:4px;padding:1px 6px;font-size:0.72rem;background:var(--accent-blue);
                            color:#fff;border:none;border-radius:3px;cursor:pointer;">수정</button>
                        </span>`
                    ).join('')}
                </div>`;
            });
            html += `</div>`;
        }

        // 동일 품명 그룹 (컬러 다름)
        if (sameNameGroups.length > 0) {
            html += `<div style="margin-bottom:16px;padding:10px 14px;background:rgba(217,119,6,0.07);
                        border:1px solid rgba(217,119,6,0.3);border-radius:8px;">
                <div style="font-weight:700;color:#d97706;margin-bottom:8px;">
                    ⚠ 동일 차종·품명 (컬러 다름) — 사출자재 injColor 구분 필요 (${sameNameGroups.length}그룹)
                </div>
                <div style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:8px;">
                    아래 제품들은 같은 품명을 사용합니다.<br>
                    사출자재 마스터에서 각 색상별 <strong>injColor</strong>를 반드시 설정하세요.
                </div>`;
            sameNameGroups.forEach(([key, arr]) => {
                const [cm, pn] = key.split('||');
                html += `<div style="margin-bottom:10px;padding:8px 10px;background:var(--bg-primary);
                                border-radius:6px;border:1px solid var(--border-color);">
                    <div style="font-weight:600;font-size:0.85rem;margin-bottom:5px;">
                        ${cm} / ${pn} — ${arr.length}개 컬러
                    </div>`;
                arr.forEach(p => {
                    html += `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;
                                         border-bottom:1px solid var(--border-color);font-size:0.82rem;">
                        <span style="min-width:80px;color:var(--text-muted);">컬러: <strong>${p.color||'(없음)'}</strong></span>
                        <span style="flex:1;color:var(--text-muted);">코드: ${p.code||'-'}</span>
                        <button onclick="UIUtils.closeModal();SettingsModule.editProduct('${p.id}');"
                            style="padding:2px 10px;font-size:0.75rem;background:var(--accent-blue);
                            color:#fff;border:none;border-radius:4px;cursor:pointer;">품명 수정</button>
                    </div>`;
                });
                html += `</div>`;
            });
            html += `</div>`;
        }

        if (exactDups.length === 0 && sameNameGroups.length === 0) {
            html = `<div style="text-align:center;padding:30px;color:var(--accent-green);font-size:1rem;font-weight:600;">
                ✅ 중복 품명 없음 — 모든 제품이 고유합니다.</div>`;
        }

        html += `<div style="font-size:0.75rem;color:var(--text-muted);margin-top:8px;">
            💡 <strong>품명 수정</strong> 버튼 클릭 → 수정 모달에서 품명 변경 후 저장하세요.<br>
            품명 변경 후에는 <strong>설정 → 사출자재</strong>에서 해당 자재의 <strong>제작품목1</strong>도 동일하게 변경해야 합니다.
        </div>`;

        UIUtils.showModal('품명 중복 진단', html,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>`, 'lg');
    }

    // ── 전체 이력 품명 일괄 변경 (내부 헬퍼) ────────────────────────────
    // context: 'product' | 'inj' | 'mfg'
    function _askCascadeRename(oldName, newName, colorHint, context) {
        const ctxLabel = context === 'inj'  ? '사출부품명(injPartName)'
                       : context === 'mfg'  ? '제작품목(mfgProductName)'
                       : '제품 품명(partName)';

        // 변경 대상 건수 미리 집계
        const cf = colorHint.trim().toLowerCase();
        function nameMatch(val) { return (val || '').trim() === oldName; }
        function colorMatch(rec) {
            if (!cf) return true;
            return (rec.color || rec.injColor || '').toLowerCase().includes(cf);
        }
        const getAll = s => Storage.getAll(s) || [];

        const storesToCheck = [
            { store: DB.STORES.PRODUCTION_PLANS,        label: '생산계획',       field: 'partName' },
            { store: DB.STORES.INJECTION_INVENTORY,     label: '사출창고 재고',   field: 'partName' },
            { store: DB.STORES.INJECTION_INSPECTIONS,   label: '사출 수입검사',   field: 'partName' },
            { store: DB.STORES.PAINTING_INCOMING,       label: '도장 입고',       field: 'partName' },
            { store: DB.STORES.PAINTING_WORK,           label: '도장 작업',       field: 'partName' },
            { store: DB.STORES.PAINTING_INSPECTIONS,    label: '도장 검사',       field: 'partName' },
            { store: DB.STORES.PAINTING_OUTGOING,       label: '도장 출고',       field: 'partName' },
            { store: DB.STORES.SHIPPING_STANDBY,        label: '출하 대기',       field: 'partName' },
            { store: DB.STORES.SHIPPING_INSPECTIONS,    label: '출하 검사',       field: 'partName' },
            { store: DB.STORES.PRODUCT_INVENTORY,       label: '제품창고 재고',   field: 'partName' },
            { store: DB.STORES.PRODUCT_OUTGOING,        label: '제품 출고',       field: 'partName' },
        ];
        // 사출자재 관련
        if (context === 'product' || context === 'mfg') {
            storesToCheck.push(
                { store: DB.STORES.INJECTION_MATERIALS, label: '사출자재 제작품목', field: '_mfg' }
            );
        }
        if (context === 'inj') {
            storesToCheck.push(
                { store: DB.STORES.INJECTION_MATERIALS, label: '사출자재 부품명', field: '_inj' }
            );
        }

        let totalCount = 0;
        const counts = storesToCheck.map(({ store, label, field }) => {
            const recs = getAll(store);
            let cnt;
            if (field === '_mfg') {
                cnt = recs.filter(m => colorMatch(m) && (nameMatch(m.mfgProductName) || nameMatch(m.mfgProductName2))).length;
            } else if (field === '_inj') {
                cnt = recs.filter(m => colorMatch(m) && nameMatch(m.injPartName)).length;
            } else {
                cnt = recs.filter(r => nameMatch(r[field]) && colorMatch(r)).length;
            }
            totalCount += cnt;
            return { label, cnt };
        });

        if (totalCount === 0) return; // 변경할 이력 없으면 질의 안 함

        const countRows = counts.filter(c => c.cnt > 0).map(c =>
            `<div style="display:flex;justify-content:space-between;padding:3px 8px;
                         background:var(--bg-primary);border-radius:4px;font-size:0.82rem;">
                <span style="color:var(--text-secondary);">${c.label}</span>
                <strong style="color:var(--accent-blue);">${c.cnt}건</strong>
            </div>`
        ).join('');

        const colorNote = colorHint
            ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">
                색상 필터: <strong>${colorHint}</strong> 포함 레코드만 변경</div>`
            : '';

        const html = `
        <div style="display:flex;flex-direction:column;gap:12px;">
            <div style="padding:10px 14px;background:rgba(124,58,237,0.07);
                        border:1px solid rgba(124,58,237,0.3);border-radius:8px;font-size:0.85rem;">
                <div style="font-weight:700;color:#7c3aed;margin-bottom:6px;">
                    📋 ${ctxLabel} 변경 감지
                </div>
                <div style="display:flex;align-items:center;gap:10px;font-size:0.9rem;">
                    <span style="background:rgba(220,38,38,0.1);color:var(--accent-red);padding:2px 10px;
                                 border-radius:4px;font-weight:600;">${oldName}</span>
                    <span class="material-symbols-outlined" style="font-size:1.1rem;color:var(--text-muted);">arrow_forward</span>
                    <span style="background:rgba(52,211,153,0.1);color:var(--accent-green);padding:2px 10px;
                                 border-radius:4px;font-weight:600;">${newName}</span>
                </div>
                ${colorNote}
            </div>
            <div>
                <div style="font-size:0.85rem;font-weight:600;color:var(--text-secondary);margin-bottom:6px;">
                    아래 <strong style="color:#7c3aed;">${totalCount}건</strong>의 이력 데이터도 함께 변경하시겠습니까?
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
                    ${countRows}
                </div>
            </div>
            <div style="font-size:0.78rem;color:var(--text-muted);">
                ⚠ "예, 전체 변경"을 선택하면 위 이력 데이터의 품명이 모두 바뀝니다. 되돌릴 수 없습니다.
            </div>
        </div>`;

        UIUtils.showModal('전체 이력 품명 변경', html,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">아니요, 제품만 변경</button>
             <button class="btn btn-danger" onclick="UIUtils.closeModal();SettingsModule._doCascadeRename('${encodeURIComponent(oldName)}','${encodeURIComponent(newName)}','${encodeURIComponent(colorHint)}','${context||'product'}')">
                <span class="material-symbols-outlined" style="font-size:1rem;">find_replace</span> 예, 전체 변경
             </button>`, 'md');
    }

    // 실제 일괄 변경 실행
    async function _doCascadeRename(encOld, encNew, encColor, context) {
        const oldName    = decodeURIComponent(encOld);
        const newName    = decodeURIComponent(encNew);
        const colorHint  = decodeURIComponent(encColor).trim().toLowerCase();

        function nameMatch(val) { return (val || '').trim() === oldName; }
        function colorMatch(rec) {
            if (!colorHint) return true;
            return (rec.color || rec.injColor || '').toLowerCase().includes(colorHint);
        }
        function shouldUpdate(rec, field) { return nameMatch(rec[field]) && colorMatch(rec); }

        const getAll = s => Storage.getAll(s) || [];
        let total = 0;
        const report = [];

        async function processStore(storeName, label, updateFn) {
            const recs = getAll(storeName);
            let cnt = 0;
            for (const rec of recs) {
                if (updateFn(rec)) {
                    try { await Storage.update(storeName, rec.id, rec); cnt++; } catch(e) {}
                }
            }
            if (cnt > 0) { report.push({ label, cnt }); total += cnt; }
        }

        // 공통 partName 스토어
        const partNameStores = [
            [DB.STORES.PRODUCTION_PLANS,      '생산계획'],
            [DB.STORES.INJECTION_INVENTORY,   '사출창고 재고'],
            [DB.STORES.INJECTION_INSPECTIONS, '사출 수입검사'],
            [DB.STORES.PAINTING_INCOMING,     '도장 입고'],
            [DB.STORES.PAINTING_WORK,         '도장 작업'],
            [DB.STORES.PAINTING_INSPECTIONS,  '도장 검사'],
            [DB.STORES.PAINTING_OUTGOING,     '도장 출고'],
            [DB.STORES.SHIPPING_STANDBY,      '출하 대기'],
            [DB.STORES.SHIPPING_INSPECTIONS,  '출하 검사'],
            [DB.STORES.PRODUCT_INVENTORY,     '제품창고 재고'],
            [DB.STORES.PRODUCT_OUTGOING,      '제품 출고'],
        ];
        for (const [storeName, label] of partNameStores) {
            await processStore(storeName, label, rec => {
                if (!shouldUpdate(rec, 'partName')) return false;
                rec.partName = newName; return true;
            });
        }

        // 제품 마스터 partName (context === 'product' 시만)
        if (context === 'product') {
            await processStore(DB.STORES.PRODUCTS, '제품 마스터', rec => {
                if (!shouldUpdate(rec, 'partName')) return false;
                rec.partName = newName;
                if ((rec.displayName || '').includes(oldName)) rec.displayName = rec.displayName.replace(oldName, newName);
                return true;
            });
        }

        // 사출자재 (context별 분기)
        if (context === 'inj') {
            await processStore(DB.STORES.INJECTION_MATERIALS, '사출자재 부품명', rec => {
                if (!colorMatch(rec) || !nameMatch(rec.injPartName)) return false;
                rec.injPartName = newName; return true;
            });
        } else {
            await processStore(DB.STORES.INJECTION_MATERIALS, '사출자재 제작품목', rec => {
                if (!colorMatch(rec)) return false;
                let changed = false;
                if (nameMatch(rec.mfgProductName))  { rec.mfgProductName  = newName; changed = true; }
                if (nameMatch(rec.mfgProductName2)) { rec.mfgProductName2 = newName; changed = true; }
                return changed;
            });
        }

        // 완료 토스트
        UIUtils.toast(`총 ${total}건 이력 변경 완료`, total > 0 ? 'success' : 'info');
        renderTabContent();
    }

    // ── 사출창고 품명 수정 모달 (검증 패널 [7]에서 호출) ──────────────────
    function openInvPartNameEditModal(oldName) {
        const invStore = DB.STORES.INJECTION_INVENTORY;
        const injMats  = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const cnt      = (Storage.getAll(invStore) || []).filter(r => (r.partName || '').trim() === oldName).length;

        // 사출자재 사출품명 목록으로 선택지 제공
        const matNames = [...new Set(injMats.map(m => (m.injPartName || '').trim()).filter(Boolean))].sort();
        const opts = matNames.map(n => `<option value="${n}" ${n === oldName ? 'selected' : ''}>${n}</option>`).join('');

        UIUtils.showModal('사출창고 품명 수정', `
            <div style="margin-bottom:12px;font-size:0.85rem;color:var(--text-secondary);">
                사출창고 재고 <strong>${cnt}건</strong>의 품명을 수정합니다.
            </div>
            <div class="form-group">
                <label class="form-label">현재 품명</label>
                <input type="text" class="form-input" value="${oldName}" disabled
                    style="background:var(--bg-tertiary);color:var(--text-muted);">
            </div>
            <div class="form-group">
                <label class="form-label">변경할 품명 <span style="color:var(--accent-red)">*</span></label>
                <select class="form-input" id="invPartNameSelect" onchange="document.getElementById('invPartNameCustom').value=this.value">
                    <option value="">-- 사출자재 품명 선택 --</option>
                    ${opts}
                </select>
                <input type="text" class="form-input" id="invPartNameCustom" placeholder="직접 입력도 가능"
                    style="margin-top:6px;">
            </div>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-top:4px;">
                ⚠ 변경 시 해당 창고 재고 <strong>${cnt}건</strong>의 품명이 모두 변경됩니다.
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SettingsModule.applyInvPartNameEdit('${encodeURIComponent(oldName)}')">변경 저장</button>
        `);
    }

    async function applyInvPartNameEdit(encOldName) {
        const oldName  = decodeURIComponent(encOldName);
        const newName  = (document.getElementById('invPartNameCustom') || {}).value || '';
        if (!newName.trim()) {
            UIUtils.toast('변경할 품명을 입력하세요.', 'warning'); return;
        }
        if (newName.trim() === oldName.trim()) {
            UIUtils.toast('현재 품명과 동일합니다.', 'warning'); return;
        }
        const invStore = DB.STORES.INJECTION_INVENTORY;
        const recs     = (Storage.getAll(invStore) || []).filter(r => (r.partName || '').trim() === oldName);
        for (const rec of recs) {
            await Storage.update(invStore, rec.id, { ...rec, partName: newName.trim() });
        }
        UIUtils.closeModal();
        UIUtils.toast(`사출창고 품명 ${recs.length}건 → "${newName.trim()}" 변경 완료`, 'success');
        SettingsModule.switchTab('products');
    }

    /* ════════════════════════════════════════════════════════════
       사용자 관리 탭
    ════════════════════════════════════════════════════════════ */
    const _esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    function renderUsersTab(el) {
        const users = AuthModule.getUsers();
        const perms = AuthModule.getPermissions();
        const roles = AuthModule.ROLES;
        const pages = AuthModule.ALL_PAGES;

        /* 역할 뱃지 */
        const roleBadge = r => {
            const role = roles.find(x => x.key === r);
            return role
                ? `<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700;background:${role.bg};color:${role.color};">${role.label}</span>`
                : `<span style="color:var(--text-muted);">${r}</span>`;
        };

        /* 페이지 그룹별 권한 매트릭스 */
        const groups = [...new Set(pages.map(p => p.group))];
        const nonAdminRoles = roles.filter(r => r.key !== 'admin');
        const passwordMask = u => u.password ? '••••••' : '-';

        const matrixRows = groups.map(g => {
            const gPages = pages.filter(p => p.group === g);
            return `
            <tr>
                <td colspan="${nonAdminRoles.length + 1}" style="background:var(--bg-secondary);font-weight:700;font-size:0.8rem;padding:6px 10px;color:var(--text-secondary);">${g}</td>
            </tr>
            ${gPages.map(p => `
            <tr>
                <td style="padding:5px 10px;font-size:0.82rem;">${_esc(p.label)}</td>
                ${nonAdminRoles.map(r => {
                    const accessOk = AuthModule.isPageAccessGranted(r.key, p.id);
                    const writeOk  = AuthModule.isPageWriteGranted(r.key, p.id);
                    return `<td style="text-align:center;padding:3px 4px;">
                        <div style="display:inline-flex;flex-direction:column;gap:2px;align-items:center;">
                            <label style="display:flex;align-items:center;gap:2px;cursor:pointer;font-size:9px;color:var(--text-muted);white-space:nowrap;"
                                title="${_esc(r.label)} — 접근 허용">
                                <input type="checkbox" data-role="${r.key}" data-page="${p.id}" data-type="access"
                                    ${accessOk ? 'checked' : ''}
                                    onchange="SettingsModule.onPermChange(this)"
                                    style="width:13px;height:13px;cursor:pointer;accent-color:${r.color};">
                                <span>접</span>
                            </label>
                            <label style="display:flex;align-items:center;gap:2px;cursor:pointer;font-size:9px;color:var(--text-muted);white-space:nowrap;"
                                title="${_esc(r.label)} — 입력 허용">
                                <input type="checkbox" data-role="${r.key}" data-page="${p.id}" data-type="write"
                                    ${writeOk ? 'checked' : ''}
                                    onchange="SettingsModule.onPermChange(this)"
                                    style="width:13px;height:13px;cursor:pointer;accent-color:#dc2626;">
                                <span style="color:#dc2626;">입</span>
                            </label>
                        </div>
                    </td>`;
                }).join('')}
            </tr>`).join('')}`;
        }).join('');

        el.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start;">

            <!-- 사용자 목록 -->
            <div class="card">
                <div class="card-header" style="display:flex;justify-content:space-between;align-items:center;">
                    <h4><span class="material-symbols-outlined">group</span> 사용자 목록</h4>
                    <button class="btn btn-primary btn-sm" onclick="SettingsModule.openUserModal()">
                        <span class="material-symbols-outlined">person_add</span> 사용자 추가
                    </button>
                </div>
                <div class="card-body" style="padding:0;">
                    <table class="data-table">
                        <thead><tr>
                            <th>ID</th><th>사진</th><th>이름</th><th>비밀번호</th><th>전화번호</th><th>역할</th><th>상태</th><th>작업</th>
                        </tr></thead>
                        <tbody>
                        ${users.length === 0
                            ? `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:20px;">등록된 사용자가 없습니다.</td></tr>`
                            : users.map(u => `
                            <tr>
                                <td style="font-weight:600;">${_esc(u.username)}</td>
                                <td style="padding:6px 10px;">${_avatarHtml(u, 38)}</td>
                                <td>${_esc(u.displayName)}</td>
                                <td style="font-family:monospace;color:var(--text-muted);">${passwordMask(u)}</td>
                                <td style="font-family:monospace;">${_esc(u.phone || '-')}</td>
                                <td>${roleBadge(u.role)}</td>
                                <td>
                                    <span style="color:${u.active !== false ? '#16a34a' : '#dc2626'};font-size:12px;font-weight:600;">
                                        ${u.active !== false ? '● 활성' : '○ 비활성'}
                                    </span>
                                </td>
                                <td style="white-space:nowrap;">
                                    <button class="btn btn-outline btn-sm" onclick="SettingsModule.openUserModal('${_esc(u.id)}')">수정</button>
                                    <button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;"
                                        onclick="SettingsModule.deleteUser('${_esc(u.id)}')">삭제</button>
                                </td>
                            </tr>`).join('')
                        }
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- 역할별 접근 권한 -->
            <div class="card">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">security</span> 역할별 접근 권한</h4>
                </div>
                <div class="card-body" style="padding:0;">
                    <div style="overflow-x:auto;max-height:75vh;overflow-y:auto;">
                        <table class="data-table" style="font-size:0.82rem;">
                            <thead style="position:sticky;top:0;z-index:1;">
                                <tr>
                                    <th rowspan="2" style="min-width:130px;vertical-align:middle;">페이지</th>
                                    ${nonAdminRoles.map(r =>
                                        `<th style="text-align:center;min-width:68px;color:${r.color};border-bottom:1px solid var(--border-color);padding-bottom:2px;">${r.label}</th>`
                                    ).join('')}
                                </tr>
                                <tr style="background:var(--bg-tertiary);">
                                    ${nonAdminRoles.map(r =>
                                        `<th style="text-align:center;padding:2px 4px;font-size:9px;font-weight:600;">
                                            <span style="color:${r.color};">접</span>
                                            <span style="color:var(--text-muted);margin:0 2px;">/</span>
                                            <span style="color:#dc2626;">입</span>
                                        </th>`
                                    ).join('')}
                                </tr>
                                <tr style="background:var(--bg-secondary);">
                                    <td style="padding:4px 10px;font-size:0.75rem;color:var(--text-muted);">관리자는 전체 접근+입력</td>
                                    ${nonAdminRoles.map(r =>
                                        `<td style="text-align:center;padding:3px 2px;">
                                            <button class="btn btn-sm" style="font-size:9px;padding:1px 5px;"
                                                onclick="SettingsModule.toggleAllPerm('${r.key}',true)" title="접근+입력 전체 허용">전체</button>
                                            <button class="btn btn-sm" style="font-size:9px;padding:1px 5px;"
                                                onclick="SettingsModule.toggleAllPerm('${r.key}',false)" title="접근+입력 전체 해제">해제</button>
                                        </td>`
                                    ).join('')}
                                </tr>
                            </thead>
                            <tbody>${matrixRows}</tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>`;
    }

    /* 사용자 추가/수정 모달 */
    function openUserModal(userId) {
        const users = AuthModule.getUsers();
        const u = userId ? users.find(x => x.id === userId) : null;
        const roles = AuthModule.ROLES;
        _pendingPhoto = u ? undefined : null;
        _pendingSeal = u ? undefined : null;
        UIUtils.showModal(
            `<span class="material-symbols-outlined" style="vertical-align:middle;margin-right:6px;">manage_accounts</span> ${u ? '사용자 수정' : '사용자 추가'}`,
            `${_photoUploadHtml(u ? (u.photo || null) : null)}
            <div class="form-group"><label class="form-label">사용자 ID</label>
                <input type="text" class="form-input" id="umUsername" value="${_esc(u ? u.username : '')}" ${u ? 'readonly style="background:var(--bg-secondary);"' : ''} placeholder="영문/숫자">
            </div>
            <div class="form-group"><label class="form-label">이름</label>
                <input type="text" class="form-input" id="umDisplayName" value="${_esc(u ? u.displayName : '')}" placeholder="표시 이름">
            </div>
            ${_sealPreviewHtml(u ? (u.seal || null) : null, u ? (u.sealFont || 'gothic') : 'gothic')}
            <div class="form-group"><label class="form-label">비밀번호 ${u ? '(변경 시만 입력)' : ''}</label>
                <input type="password" class="form-input" id="umPassword" placeholder="${u ? '변경할 비밀번호' : '비밀번호'}">
            </div>
            <div class="form-group"><label class="form-label">전화번호</label>
                <input type="text" class="form-input" id="umPhone" value="${_esc(u ? (u.phone || '') : '')}" placeholder="010-0000-0000">
            </div>
            <div class="form-group"><label class="form-label">역할</label>
                <select class="form-select" id="umRole">
                    ${roles.map(r => `<option value="${r.key}" ${u && u.role === r.key ? 'selected' : ''}>${r.label}</option>`).join('')}
                </select>
            </div>
            <div class="form-group"><label class="form-label">상태</label>
                <select class="form-select" id="umActive">
                    <option value="true" ${!u || u.active !== false ? 'selected' : ''}>활성</option>
                    <option value="false" ${u && u.active === false ? 'selected' : ''}>비활성</option>
                </select>
            </div>`,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" onclick="SettingsModule.saveUser('${userId || ''}')">저장</button>`
        );
    }

    function saveUser(userId) {
        const username    = (document.getElementById('umUsername')    || {}).value || '';
        const displayName = (document.getElementById('umDisplayName') || {}).value || '';
        const password    = (document.getElementById('umPassword')    || {}).value || '';
        const phone       = (document.getElementById('umPhone')       || {}).value || '';
        const sealFont    = (document.getElementById('umSealFont')    || {}).value || 'gothic';
        const role        = (document.getElementById('umRole')        || {}).value || 'operator';
        const active      = (document.getElementById('umActive')      || {}).value !== 'false';

        if (!username.trim()) { UIUtils.toast('사용자 ID를 입력하세요.', 'warning'); return; }
        if (!displayName.trim()) { UIUtils.toast('이름을 입력하세요.', 'warning'); return; }

        const users = AuthModule.getUsers();
        if (userId) {
            /* 수정 */
            const idx = users.findIndex(u => u.id === userId);
            if (idx < 0) return;
            const photo = _pendingPhoto !== undefined ? (_pendingPhoto || null) : (users[idx].photo || null);
            const seal = _pendingSeal !== undefined ? (_pendingSeal || null) : (users[idx].seal || null);
            users[idx] = { ...users[idx], displayName: displayName.trim(), phone: phone.trim(), photo, seal, sealFont, role, active,
                           ...(password ? { password } : {}) };
        } else {
            /* 추가 */
            if (!password) { UIUtils.toast('비밀번호를 입력하세요.', 'warning'); return; }
            if (users.find(u => u.username === username.trim())) {
                UIUtils.toast('이미 존재하는 사용자 ID입니다.', 'warning'); return;
            }
            users.push({ id: 'user_' + Date.now(), username: username.trim(),
                         displayName: displayName.trim(), password, phone: phone.trim(), photo: _pendingPhoto || null, seal: _pendingSeal || null, sealFont, role, active, createdAt: new Date().toISOString() });
        }
        _pendingPhoto = null;
        _pendingSeal = null;
        AuthModule.saveUsers(users);
        UIUtils.closeModal();
        UIUtils.toast('저장되었습니다.', 'success');
        SettingsModule.switchTab('users');
    }

    function deleteUser(userId) {
        const users = AuthModule.getUsers();
        const target = users.find(u => u.id === userId);
        if (!target) return;
        const admins = users.filter(u => u.role === 'admin' && u.active !== false);
        if (target.role === 'admin' && admins.length <= 1) {
            UIUtils.toast('마지막 관리자 계정은 삭제할 수 없습니다.', 'warning'); return;
        }
        if (!confirm(`'${target.displayName}' 사용자를 삭제하시겠습니까?`)) return;
        AuthModule.saveUsers(users.filter(u => u.id !== userId));
        UIUtils.toast('삭제되었습니다.', 'success');
        SettingsModule.switchTab('users');
    }

    /* 권한 체크박스 변경 (data-type="access"|"write") */
    function onPermChange(checkbox) {
        const role   = checkbox.dataset.role;
        const pageId = checkbox.dataset.page;
        const type   = checkbox.dataset.type || 'access';  /* 'access' 또는 'write' */
        const perms  = AuthModule.getPermissions();

        let rp = perms[role];
        /* admin null → 체크박스 변경 불가(모든 항목 checked 상태이므로 건드리지 않음) */
        if (rp === null) {
            const all = AuthModule.ALL_PAGES.map(p => p.id);
            rp = { access: [...all], write: [...all] };
        } else if (Array.isArray(rp)) {
            /* 구버전 array → 신버전 변환 */
            rp = { access: [...rp], write: [...rp] };
        } else if (!rp || typeof rp !== 'object') {
            rp = { access: [], write: [] };
        } else {
            rp = { access: [...(rp.access || [])], write: [...(rp.write || [])] };
        }

        const list = rp[type] ? [...rp[type]] : [];
        if (checkbox.checked) {
            if (!list.includes(pageId)) list.push(pageId);
            /* 입력 허용 시 접근도 자동 허용 */
            if (type === 'write' && !rp.access.includes(pageId)) {
                rp.access.push(pageId);
                /* DOM에서 같은 페이지의 접근 체크박스도 체크 */
                const accessCb = document.querySelector(
                    `input[data-role="${role}"][data-page="${pageId}"][data-type="access"]`
                );
                if (accessCb) accessCb.checked = true;
            }
        } else {
            const idx = list.indexOf(pageId);
            if (idx >= 0) list.splice(idx, 1);
            /* 접근 해제 시 입력도 자동 해제 */
            if (type === 'access') {
                const wi = rp.write.indexOf(pageId);
                if (wi >= 0) rp.write.splice(wi, 1);
                const writeCb = document.querySelector(
                    `input[data-role="${role}"][data-page="${pageId}"][data-type="write"]`
                );
                if (writeCb) writeCb.checked = false;
            }
        }
        rp[type] = list;
        perms[role] = rp;
        AuthModule.savePermissions(perms);
    }

    /* 전체/해제: 접근+입력 동시 적용 */
    function toggleAllPerm(role, grant) {
        const perms = AuthModule.getPermissions();
        const all = AuthModule.ALL_PAGES.map(p => p.id);
        perms[role] = grant
            ? { access: [...all], write: [...all] }
            : { access: [], write: [] };
        AuthModule.savePermissions(perms);
        SettingsModule.switchTab('users');
    }

    return {
        render,
        openUserModal, saveUser, deleteUser, onPermChange, toggleAllPerm,
        switchTab,
        openAddProductModal,
        saveProduct,
        editProduct,
        updateProduct,
        onProductProcessChange,
        removeProduct,
        addProductPaintRow,
        removeProductPaintRow,
        onProductPaintSpecChange,
        onProductPaintMainSelect,
        updateProductInjInfo,
        onProdInjFiltCarChange,
        onProdInjFiltPartChange,
        onProdInjFiltChange,
        resetProdInjFilter,
        downloadProductCSV,
        openProductUploadModal,
        handleProductUploadFile,
        handleProductUploadText,
        confirmProductUpload,
        openAddInjectMatModal,
        saveInjectMat,
        editInjectMat,
        updateInjectMat,
        removeInjectMat,
        downloadInjectMatCSV,
        openInjectMatUploadModal,
        handleInjectMatUploadFile,
        handleInjectMatUploadText,
        confirmInjectMatUpload,
        _onRawMatSelect,
        _onInjectMatCarModelChange,
        addInjMatProductSlot,
        removeInjMatProductSlot,
        switchDefectSubTab,
        loadDefaultInjectionDefects,
        openAddDefectModal,
        saveDefect,
        editDefect,
        updateDefect,
        removeDefect,
        openAddPaintModal,
        savePaint,
        editPaint,
        updatePaint,
        openPaintValidationModal,
        clearMissingPaintRef,
        deleteUnlinkedPaintFromValidation,
        removePaint,
        downloadPaintCSV,
        openPaintUploadModal,
        handlePaintUploadFile,
        handlePaintUploadText,
        confirmPaintUpload,
        onPaintUploadModeChange,
        backupAll,
        restoreFromFile,
        previewBulkReplace,
        applyGlobalNewVal,
        bulkCheckAll,
        executeBulkReplace,
        migrateProcessNames,
        migrateSupplierName,
        migrateExpDates,
        clearAllData,
        filterProductList,
        filterPaintList,
        filterInjectMatList,
        previewPersonPhoto,
        clearPersonPhoto,
        generateUserSeal,
        clearUserSeal,
        renderInspectorsTab,
        openAddInspectorModal,
        saveInspector,
        editInspector,
        updateInspector,
        removeInspector,
        renderCertificationTab,
        openCertificationModal,
        saveCertification,
        removeCertification,
        showCertificationSheet,
        exportCertificationData,
        renderOperatorsTab,
        openAddOperatorModal,
        saveOperator,
        editOperator,
        updateOperator,
        removeOperator,
        // 원재료 관리
        renderRawMatTab,
        filterRawMatList,
        openAddRawMatModal,
        saveRawMat,
        editRawMat,
        updateRawMat,
        removeRawMat,
        downloadRawMatCSV,
        openUploadRawMatModal,
        uploadRawMatCSV,
        _syncRawMatUsedFor,
        _filterRawMatOptions,
        seedTestData: async function() {
            if (typeof DevSeed === 'undefined') {
                UIUtils.toast('dev-seed.js가 로드되지 않았습니다.', 'error');
                return;
            }
            await DevSeed.run();
        },
        scanInjLotNumbers,
        repairInjLotNumbers,
        // 생산계획 매칭 검토
        openMfgMatchingReview,
        autoLinkProductIds,
        autoLinkAllProductIds,
        _onMatchInput,
        _filterMatchTable,
        applyMfgMatching,
        checkPartNameDuplicate,
        showDuplicatePartNameReport,
        buildProductValidationPanel,
        _filterInjPickList,
        _applyInjPickMat,
        saveApiBase,
        clearApiBase,
        refreshSystemInfo,
        _askCascadeRename,
        _doCascadeRename,
        deleteRecordsByPartNames,
        openInvPartNameEditModal,
        applyInvPartNameEdit,
        // 제조 공정 관리 — 주공정
        renderProcessTab,
        openAddProcessModal,
        addProcess,
        editProcess,
        updateProcess,
        removeProcess,
        moveProcess,
        // 세부 공정 관리
        selectMainForSub,
        openAddSubProcessModal,
        addSubProcess,
        editSubProcess,
        updateSubProcess,
        removeSubProcess,
        moveSubProcess,
        renderDocumentDesignTab,
        selectDocumentDesign,
        createDocumentDesign,
        createDocumentDesignFromUpload,
        updateDocumentDesignMeta,
        addDocumentElement,
        selectDocumentElement,
        updateDocumentElement,
        removeDocumentElement,
        saveActiveDocumentDesign,
        removeDocumentDesign,
        resetDocumentDesigns,
        handleDocumentDesignReferenceUpload,
        clearDocumentDesignReference,
        resetDocumentReferenceView,
        startDocumentReferenceDrag,
        startDocumentElementDrag,
    };

    // ── 제작품목 연결 (제품 마스터에서 선택) ─────────────────────────────
    function openMfgProductMapping(matId) {
        const mat = Storage.getById(INJECT_MAT_STORE, matId);
        if (!mat) { UIUtils.toast('사출자재를 찾을 수 없습니다.', 'error'); return; }

        const allProducts = Storage.getAll(PRODUCTS_STORE) || [];
        // 같은 차종 제품 우선, 없으면 전체
        const sameModel = allProducts.filter(p => p.carModel === mat.carModel);
        const targetProds = sameModel.length > 0 ? sameModel : allProducts;

        // 제품 선택 옵션 생성 (품명 + 컬러)
        const makeOptions = (selectedVal) => {
            const blank = `<option value="">-- 선택 안함 --</option>`;
            return blank + targetProds
                .sort((a, b) => (a.partName||'').localeCompare(b.partName||'', 'ko'))
                .map(p => {
                    const label = `${p.partName}${p.color ? ' / '+p.color : ''}`;
                    const sel   = selectedVal && selectedVal.trim() === (p.partName||'').trim() ? 'selected' : '';
                    return `<option value="${p.partName}" ${sel}>${label}</option>`;
                }).join('');
        };

        const pNameSet = new Set(allProducts.map(p => (p.partName||'').trim()));
        const cur1 = (mat.mfgProductName  || '').trim();
        const cur2 = (mat.mfgProductName2 || '').trim();
        const isBad1 = cur1 && !pNameSet.has(cur1);
        const isBad2 = cur2 && !pNameSet.has(cur2);

        const html = `
        <div style="display:flex;flex-direction:column;gap:14px;">
            <!-- 자재 정보 요약 -->
            <div style="padding:10px 14px;background:var(--bg-secondary);border:1px solid var(--border-color);
                        border-radius:8px;font-size:0.85rem;">
                <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;">
                    <span style="color:var(--text-muted);">차종</span>
                    <strong>${mat.carModel||'-'}</strong>
                    <span style="color:var(--text-muted);">사출부품명</span>
                    <strong>${mat.injPartName||'-'}</strong>
                    <span style="color:var(--text-muted);">컬러</span>
                    <span>${mat.injColor||'-'}</span>
                </div>
            </div>

            <div style="font-size:0.8rem;color:var(--text-secondary);background:rgba(59,130,246,0.06);
                        border:1px solid rgba(59,130,246,0.2);border-radius:6px;padding:8px 12px;">
                💡 제품 마스터에 등록된 품명 중에서 선택하세요.<br>
                제작품목1은 주 생산품, 제작품목2는 동일 금형으로 만드는 추가 품목입니다.
            </div>

            <!-- 제작품목1 -->
            <div>
                <label style="font-size:0.83rem;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:5px;">
                    제작품목1 (mfgProductName)
                    ${isBad1 ? `<span style="margin-left:6px;font-size:0.72rem;color:var(--accent-red);">
                        현재값 "${cur1}" — 제품마스터에 없음</span>` : ''}
                </label>
                <select id="mfgMapSel1" class="form-select" style="width:100%;">
                    ${makeOptions(cur1)}
                </select>
            </div>

            <!-- 제작품목2 -->
            <div>
                <label style="font-size:0.83rem;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:5px;">
                    제작품목2 (mfgProductName2)
                    <span style="font-weight:400;font-size:0.75rem;">(선택사항)</span>
                    ${isBad2 ? `<span style="margin-left:6px;font-size:0.72rem;color:var(--accent-red);">
                        현재값 "${cur2}" — 제품마스터에 없음</span>` : ''}
                </label>
                <select id="mfgMapSel2" class="form-select" style="width:100%;">
                    ${makeOptions(cur2)}
                </select>
            </div>
        </div>`;

        UIUtils.showModal('제작품목 연결',  html,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" onclick="SettingsModule.saveMfgProductMapping('${matId}')">
                <span class="material-symbols-outlined" style="font-size:1rem;">link</span> 연결 저장
             </button>`, 'md');
    }

    async function saveMfgProductMapping(matId) {
        const mfg1 = (document.getElementById('mfgMapSel1') || {}).value || '';
        const mfg2 = (document.getElementById('mfgMapSel2') || {}).value || '';

        if (!mfg1) {
            UIUtils.toast('제작품목1은 필수입니다.', 'warning');
            return;
        }

        const mat = Storage.getById(INJECT_MAT_STORE, matId);
        if (!mat) { UIUtils.toast('자재를 찾을 수 없습니다.', 'error'); return; }

        await Storage.update(INJECT_MAT_STORE, matId, {
            ...mat,
            mfgProductName:  mfg1,
            mfgProductName2: mfg2
        });

        UIUtils.closeModal();
        UIUtils.toast(`제작품목 연결 완료: "${mfg1}"${mfg2 ? ' / "'+mfg2+'"' : ''}`, 'success');
        renderTabContent();
    }

    // ── 특정 품명+컬러 레코드 전체 삭제 유틸 (테스트/정리용) ─────────────
    // 사용법: await SettingsModule.deleteRecordsByPartNames([{partName:'HOUSING-1PH',color:'BLACK'}, ...])
    async function deleteRecordsByPartNames(targets) {
        if (!Array.isArray(targets) || targets.length === 0) {
            console.warn('[deleteRecordsByPartNames] targets 배열을 전달하세요.'); return;
        }
        function matches(rec) {
            return targets.some(t => {
                const pnMatch = !t.partName || (rec.partName || '').trim() === t.partName.trim();
                const clMatch = !t.color   || (rec.color  || '').trim().toUpperCase() === t.color.trim().toUpperCase();
                return pnMatch && clMatch;
            });
        }
        const stores = [
            DB.STORES.INJECTION_INVENTORY,
            DB.STORES.INJECTION_INSPECTIONS,
            DB.STORES.PRODUCTION_PLANS,
            DB.STORES.PAINTING_INCOMING,
            DB.STORES.PAINTING_WORK,
            DB.STORES.PAINTING_INSPECTIONS,
            DB.STORES.PAINTING_OUTGOING,
            DB.STORES.SHIPPING_STANDBY,
            DB.STORES.SHIPPING_INSPECTIONS,
            DB.STORES.PRODUCT_INVENTORY,
            DB.STORES.PRODUCT_OUTGOING,
        ];
        let total = 0;
        for (const storeName of stores) {
            const recs = Storage.getAll(storeName) || [];
            const toDelete = recs.filter(matches);
            for (const rec of toDelete) {
                await Storage.remove(storeName, rec.id);
                total++;
            }
            if (toDelete.length > 0) console.log(`[삭제] ${storeName}: ${toDelete.length}건`);
        }
        console.log(`✅ 총 ${total}건 삭제 완료`);
        UIUtils.toast(`총 ${total}건 삭제 완료`, total > 0 ? 'success' : 'info');
        return total;
    }
})();
