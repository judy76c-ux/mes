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

    let currentTab = 'products';

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="page-header">
                    <div class="page-header-left">
                        <h3>관리 / 설정</h3>
                        <p>제품, 불량 유형, 시스템 설정을 관리합니다.</p>
                    </div>
                </div>

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
                    <button class="tab-btn ${currentTab === 'inspectors' ? 'active' : ''}" 
                        onclick="SettingsModule.switchTab('inspectors')">
                        <span class="material-symbols-outlined">verified_user</span> 검사자
                    </button>
                    <button class="tab-btn ${currentTab === 'operators' ? 'active' : ''}" 
                        onclick="SettingsModule.switchTab('operators')">
                        <span class="material-symbols-outlined">engineering</span> 작업자
                    </button>
                    <button class="tab-btn ${currentTab === 'certifications' ? 'active' : ''}" 
                        onclick="SettingsModule.switchTab('certifications')">
                        <span class="material-symbols-outlined">workspace_premium</span> 자격인증
                    </button>
                    <button class="tab-btn ${currentTab === 'backup' ? 'active' : ''}" 
                        onclick="SettingsModule.switchTab('backup')">
                        <span class="material-symbols-outlined">backup</span> 백업/복원
                    </button>
                    <button class="tab-btn ${currentTab === 'system' ? 'active' : ''}" 
                        onclick="SettingsModule.switchTab('system')">
                        <span class="material-symbols-outlined">settings</span> 시스템
                    </button>
                </div>

                <!-- 탭 콘텐츠 -->
                <div id="settingsContent"></div>
            </div>
        `;

        renderTabContent();
    }

    function switchTab(tab) {
        currentTab = tab;
        const container = document.getElementById('contentArea');
        render(container);
    }

    function renderTabContent() {
        const el = document.getElementById('settingsContent');

        switch (currentTab) {
            case 'products': {
                const savedFilter = (document.getElementById('carModelFilter') || {}).value || '';
                renderProductsTab(el);
                if (savedFilter) {
                    const filterEl = document.getElementById('carModelFilter');
                    if (filterEl) {
                        filterEl.value = savedFilter;
                        filterProductList();
                    }
                }
                break;
            }
            case 'defects':
                renderDefectsTab(el);
                break;
            case 'paint':
                renderPaintTab(el);
                break;
            case 'injectMat':
                renderInjectMatTab(el);
                break;
            case 'rawMaterials':
                renderRawMatTab(el);
                break;
            case 'inspectors':
                renderInspectorsTab(el);
                break;
            case 'operators':
                renderOperatorsTab(el);
                break;
            case 'certifications':
                renderCertificationTab(el);
                break;
            case 'backup':
                renderBackupTab(el);
                break;
            case 'system':
                renderSystemTab(el);
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
        const selectElement = document.getElementById('carModelFilter');
        if (!selectElement) return;
        const selectedModel = selectElement.value;

        const tbody = document.querySelector('#settingsContent .data-table tbody');
        if (!tbody) return;

        const rows = tbody.querySelectorAll('tr');
        let visibleCount = 0;

        if (rows.length === 1 && rows[0].cells.length === 1) return;

        rows.forEach(row => {
            const modelCell = row.cells[1];
            if (!modelCell) return;

            const rowModel = modelCell.textContent.trim();
            if (selectedModel === '' || rowModel === selectedModel) {
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

        // ── 요약 집계 ──────────────────────────────────────────────────
        const errors   = missingBasic.length + orphanMfg.length;
        const warnings = noProcess.length + noInjMat.length + noMfgMap.length +
                         noColorMats.length + orphanInv.length + dupNames.length;
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
        const injMaterials = Storage.getAll(DB.STORES.INJECTION_MATERIALS) || [];
        const uniqueCarModels = [...new Set(products.map(p => p.carModel).filter(Boolean))].sort();
        const colspan = 13;

        el.innerHTML = `
            ${buildProductValidationPanel()}
            <div class="card">
                <div class="card-header" style="flex-wrap: wrap; gap: 10px;">
                    <div style="display:flex; align-items:center; gap: 12px;">
                        <h4 style="margin:0;"><span class="material-symbols-outlined">category</span> 제품 목록 (<span id="productCount">${products.length}</span>건)</h4>
                        <select id="carModelFilter" class="form-input" style="width: 150px; padding: 4px 8px;" onchange="SettingsModule.filterProductList()">
                            <option value="">전체 차종</option>
                            ${uniqueCarModels.map(model => `<option value="${model}">${model}</option>`).join('')}
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
                                    <th>No</th>
                                    <th>차종</th>
                                    <th>품명</th>
                                    <th>도장 컬러</th>
                                    <th>품목구분</th>
                                    <th>납품포장용량</th>
                                    <th>납품처</th>
                                    <th>판매가격</th>
                                    <th>사출매입가</th>
                                    <th>제조가격</th>
                                    <th>공정별 사양 (공정 | CVT | C/T)</th>
                                    <th>사용 사출 자재</th>
                                    <th>작업</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${products.length === 0 ?
                `<tr><td colspan="${colspan}" style="text-align:center;padding:40px;color:var(--text-muted);">등록된 제품이 없습니다.</td></tr>` :
                products.map((p, i) => {
                    // 사용 사출 자재 매칭: 제작품목1/2 ↔ 제품 품명 (trim 비교)
                    const pName  = (p.partName || '').trim();
                    const pColor = (p.color    || '').trim().toLowerCase();
                    const usedMats = pName ? injMaterials.filter(m =>
                        (m.mfgProductName  || '').trim() === pName ||
                        (m.mfgProductName2 || '').trim() === pName
                    ) : [];

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
                            const tip = `공급처: ${m.supplier || '-'} / 자재컬러: ${m.injColor || '-'}`;
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

                    return `
                                    <tr>
                                        <td>${i + 1}</td>
                                        <td>${p.carModel || '-'}</td>
                                        <td><strong>${p.partName || '-'}</strong></td>
                                        <td>${p.color || '-'}</td>
                                        <td style="text-align:center;">${
                                            p.itemType === '양산품' ? '<span class="badge" style="background:rgba(52,211,153,0.15);color:var(--accent-green);border:1px solid var(--accent-green);">양산품</span>'
                                            : p.itemType === '개발품' ? '<span class="badge" style="background:rgba(59,130,246,0.15);color:var(--accent-blue);border:1px solid var(--accent-blue);">개발품</span>'
                                            : p.itemType === 'A/S품' ? '<span class="badge" style="background:rgba(245,158,11,0.15);color:#d97706;border:1px solid #d97706;">A/S품</span>'
                                            : '<span style="color:var(--text-muted);font-size:0.8rem;">-</span>'
                                        }</td>
                                        <td>${p.packUnit || '-'}</td>
                                        <td>${p.customer || '-'}</td>
                                        <td style="text-align:right">${p.salePrice ? Number(p.salePrice).toLocaleString() : '-'}</td>
                                        <td style="text-align:right">${p.injectionPrice ? Number(p.injectionPrice).toLocaleString() : '-'}</td>
                                        <td style="text-align:right">${p.manufacturePrice ? Number(p.manufacturePrice).toLocaleString() : '-'}</td>
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
                                        <td>
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

    function _productFormHTML(p = {}, idPrefix = 'addProd') {
        const v = k => p[k] !== undefined ? p[k] : '';
        const isEdit = idPrefix === 'editProd';
        const processes = ['', '사출', '도장-A', '도장-B', '레이저', '인쇄', '외관 검사', '외관+각인 검사'];
        const processOptions = val => processes.map(proc => `<option value="${proc}" ${val === proc ? 'selected' : ''}>${proc || '선택 안함'}</option>`).join('');

        // 수정 모드: 이 제품에 연결된 사출 자재 조회
        const linkedInjMats = isEdit
            ? (Storage.getAll(INJECT_MAT_STORE) || []).filter(m =>
                (m.productIds && m.productIds.includes(p.id)) ||
                (!m.productIds && m.mfgProductName && p.partName &&
                 m.mfgProductName.trim() === p.partName.trim() && m.carModel === p.carModel))
            : [];

        // 도료 다중 선택 초기 렌더링
        const allPaints = Storage.getAll(PAINT_STORE) || [];
        const initialPaintRows = (p.paintMaterials && p.paintMaterials.length > 0)
            ? p.paintMaterials.map(row => ({
                paintSpec: row.paintSpec || row.typeFilter || '',
                mainId:    row.mainId    || row.paintMaterialId || '',
                hardId:    row.hardId    || '',
                thinnerId: row.thinnerId || ''
            }))
            : [{}];
        const initialPaintTableHtml = _paintTableHtml(idPrefix, initialPaintRows, allPaints);

        return `
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
                    <label class="form-label">도장 컬러</label>
                    <input type="text" class="form-input" id="${idPrefix}Color" placeholder="예: 화이트" value="${v('color')}">
                </div>
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
            <div id="${idPrefix}ProcessContainer">
                <!-- 제조공정 Row 1 (항상 노출) -->
                <div id="${idPrefix}Row1" style="background:var(--bg-secondary); padding:10px; border-radius:8px; margin-bottom:8px; display:flex !important; flex-wrap:nowrap; align-items:center; gap:12px;">
                    <div style="display:flex; align-items:center; gap:8px; flex: 0 0 380px;">
                        <label class="form-label" style="white-space:nowrap; margin-bottom:0; width:85px;">제조공정-1</label>
                        <select class="form-input" id="${idPrefix}Process1" style="margin-top:0;">${processOptions(v('process1'))}</select>
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
                        <select class="form-input" id="${idPrefix}Process2" style="margin-top:0;">${processOptions(v('process2'))}</select>
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
                        <select class="form-input" id="${idPrefix}Process3" style="margin-top:0;">${processOptions(v('process3'))}</select>
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
                        <select class="form-input" id="${idPrefix}Process4" style="margin-top:0;">${processOptions(v('process4'))}</select>
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
                        <th style="padding:7px 12px;text-align:left;font-weight:600;color:var(--text-secondary);border-bottom:1px solid var(--border-color);">공급처</th>
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
                    ${linkedInjMats.length > 1 ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:8px;font-weight:600;">자재 ${i+1}</div>` : ''}
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
                            <label class="form-label">공급처</label>
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
                <!-- 사출자재 없음 → 신규 등록 폼 바로 표시 -->
                <input type="hidden" id="${idPrefix}EditInjId_0" value="">
                <div style="background:rgba(217,119,6,0.05);border:1px dashed rgba(217,119,6,0.5);border-radius:8px;padding:12px;">
                    <div style="font-size:0.78rem;color:#b45309;margin-bottom:10px;font-weight:600;">
                        ⚠ 연결된 사출자재가 없습니다 — 아래 입력 시 새 사출자재로 등록됩니다
                    </div>
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
                            <label class="form-label">공급처</label>
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
                        <label class="form-label">공급처</label>
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
        UIUtils.showModal('제품 추가', _productFormHTML({}, 'addProd'), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SettingsModule.saveProduct()">추가</button>
        `, 'xl');

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
        const paintSpec = rowData.paintSpec || '';
        const mainId    = rowData.mainId    || '';
        const hardId    = rowData.hardId    || '';
        const thinnerId = rowData.thinnerId || '';

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
                paintSpec: g(`${idPrefix}PaintSpec_${ri}`),
                mainId:    g(`${idPrefix}PaintMain_${ri}`),
                hardId:    g(`${idPrefix}PaintHard_${ri}`),
                thinnerId: g(`${idPrefix}PaintThinner_${ri}`)
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
                    ${th('공급처')}${th('사출품명')}${th('자재 컬러')}${th('단가','right')}${th('매칭','center')}${th('컬러 일치','center')}
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

    function _collectProductForm(prefix) {
        const g = id => (document.getElementById(id) || {}).value || '';
        return {
            carModel: g(`${prefix}CarModel`).trim(),
            partName: g(`${prefix}PartName`).trim(),
            color: g(`${prefix}Color`).trim(),
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

        // ── 사출 자재 자동 등록 (체크박스 + 금형명 입력 시) ──────────
        const autoInjEnabled = document.getElementById('addProdAutoInjEnabled');
        if (autoInjEnabled && autoInjEnabled.checked) {
            const g = id => (document.getElementById(id) || {}).value || '';
            const injPartName = g('addProdAutoInjPartName').trim();
            if (injPartName) {
                const injMat = {
                    carModel:        data.carModel,
                    supplier:        g('addProdAutoInjSupplier').trim(),
                    injPartName:     injPartName,
                    injColor:        g('addProdAutoInjColor').trim(),
                    unitPrice:       g('addProdAutoInjPrice').trim(),
                    itemType:        data.itemType || '',
                    mfgProductName:  data.partName,   // ← 제품 품명과 동일하게 고정
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
        } else {
            UIUtils.closeModal();
            UIUtils.toast('제품이 추가되었습니다.', 'success');
        }

        renderTabContent();
    }

    function editProduct(id) {
        const p = Storage.getById(PRODUCTS_STORE, id);
        if (!p) return;
        UIUtils.showModal('제품 수정', _productFormHTML(p, 'editProd'), `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SettingsModule.updateProduct('${id}')">저장</button>
        `, 'xl');
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

    async function updateProduct(id) {
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
                const injPartName = g(`editProdEditInjPartName_${i}`).trim();
                const injColor    = g(`editProdEditInjColor_${i}`).trim();
                const supplier    = g(`editProdEditInjSupplier_${i}`).trim();
                const unitPrice   = g(`editProdEditInjPrice_${i}`).trim();
                const cavityCount = g(`editProdEditInjCavity_${i}`).trim();
                const weight      = g(`editProdEditInjWeight_${i}`).trim();

                if (matId) {
                    // 기존 자재 수정
                    await Storage.update(INJECT_MAT_STORE, matId, {
                        injPartName, injColor, supplier, unitPrice, cavityCount, weight,
                        mfgProductName: data.partName
                    });
                    injMatChanged = true;
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

        renderTabContent();

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
        headers.push('사출자재_공급처', '사출자재_품명', '사출자재_컬러', '사출자재_단가');

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
        const injLabels = ['공급처', '품명', '컬러', '단가'];
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
        { key: 'supplier',        label: '공급처'     },
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
        const uniqueCarModels  = [...new Set(items.map(m => m.carModel).filter(Boolean))].sort();

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
                            <option value="">전체 공급처</option>
                            ${uniqueSuppliers.map(s => `<option value="${s}">${s}</option>`).join('')}
                        </select>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;">
                        <button class="btn btn-outline" onclick="SettingsModule.downloadInjectMatCSV()">
                            <span class="material-symbols-outlined">download</span> CSV 다운로드
                        </button>
                        <button class="btn btn-secondary" onclick="SettingsModule.openInjectMatUploadModal()">
                            <span class="material-symbols-outlined">upload_file</span> 일괄 업로드
                        </button>
                        <button class="btn btn-outline" style="border-color:#f59e0b;color:#b45309;"
                                onclick="SettingsModule.openMfgMatchingReview()"
                                title="사출자재 제작품목과 생산계획 품명을 비교하여 불일치 항목을 한 번에 수정합니다">
                            <span class="material-symbols-outlined" style="font-size:16px;vertical-align:-3px;">link</span>
                            생산계획 매칭 검토
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
                                    <th>공급처</th>
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
                    const matched = _findMatchedRawMats(m.injPartName, m.injColor);
                    const rawMatName  = matched.length > 0 ? matched.map(r => r.matName).filter(Boolean).join(', ') : (m.rawMatName || '-');
                    const rawMatColor = matched.length > 0 ? matched.map(r => r.color).filter(Boolean).join(', ') : (m.rawMatColor || '-');
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
                                            <td>${rawMatName}${matched.length > 1 ? `<span style="font-size:0.72rem;color:var(--text-muted);margin-left:4px;">(${matched.length}건)</span>` : ''}</td>
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
        const uniqueCarModels = [...new Set(products.map(p => p.carModel).filter(Boolean))].sort();
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
                    <label class="form-label">공급처</label>
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
        const hdrKw = ['차종', '공급처', '사출품명', '컬러', '단가', '제작품목1', '제작품목2'];
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
                    const carModels = [...new Set(usedForOptions.map(o => o.carModel).filter(Boolean))].sort();
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
                        <button class="btn btn-outline" onclick="SettingsModule.switchTab('certifications')">
                            <span class="material-symbols-outlined">workspace_premium</span> 자격인증 관리
                        </button>
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
                                    <div style="width:40px;height:40px;border-radius:50%;background:var(--accent-blue);color:white;display:flex;align-items:center;justify-content:center;font-weight:600;">
                                        ${(insp.name || '').charAt(0)}
                                    </div>
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
        UIUtils.showModal('검사자 추가', `
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
            processes
        });
        UIUtils.closeModal();
        UIUtils.toast('검사자가 추가되었습니다.', 'success');
        renderTabContent();
    }

    function editInspector(id) {
        const insp = Storage.getById(INSPECTORS_STORE, id);
        if (!insp) return;

        UIUtils.showModal('검사자 수정', `
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

        await Storage.update(INSPECTORS_STORE, id, {
            name: name.trim(),
            qualification: qualification.trim(),
            processes
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
                        <button class="btn btn-outline" onclick="SettingsModule.switchTab('certifications')">
                            <span class="material-symbols-outlined">workspace_premium</span> 자격인증 관리
                        </button>
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
        UIUtils.showModal('현장 작업자 등록', `
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
            phone
        });
        UIUtils.closeModal();
        UIUtils.toast(`작업자 ${name}님이 등록되었습니다.`, 'success');
        renderTabContent();
    }

    function editOperator(id) {
        const op = Storage.getById(OPERATORS_STORE, id);
        if (!op) return;

        UIUtils.showModal('작업자 정보 수정', `
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

        await Storage.update(OPERATORS_STORE, id, {
            name,
            position,
            dept,
            phone
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
                    <button class="btn btn-outline" onclick="SettingsModule.exportCertificationData()">
                        <span class="material-symbols-outlined">download</span> 내보내기
                    </button>
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
                        <button class="btn btn-outline" onclick="SettingsModule.downloadPaintCSV()">
                            <span class="material-symbols-outlined">download</span> CSV 다운로드
                        </button>
                        <button class="btn btn-secondary" onclick="SettingsModule.openPaintUploadModal()">
                            <span class="material-symbols-outlined">upload_file</span> 일괄 업로드
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
                                        <th>유통기한</th>
                                        <th>작업</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${paints.map((p, i) => `
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

    function openAddPaintModal() {
        UIUtils.showModal('도료 정보 추가', `
            <datalist id="manufacturerList">
                <option value="NOROO">
                <option value="KCC">
                <option value="PPG">
                <option value="YULIM">
                <option value="REDSOPT">
                <option value="ORIGIN">
            </datalist>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">구매처</label>
                    <input type="text" class="form-input" id="addPaintSupplier" placeholder="예: KCC, 노루페인트">
                </div>
                <div class="form-group">
                    <label class="form-label">도료명 <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="addPaintName" placeholder="예: PRIMER BLACK, TOP WHITE">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">제조사</label>
                    <input type="text" class="form-input" id="addPaintManufacturer"
                        list="manufacturerList" placeholder="선택 또는 직접 입력" autocomplete="off">
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
                    <label class="form-label">유통기한</label>
                    <input type="text" class="form-input" id="addPaintShelfLife" placeholder="예: 12개월, 6개월">
                </div>
                <div class="form-group" style="visibility:hidden;"></div>
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

    function editPaint(id) {
        const p = Storage.getById(PAINT_STORE, id);
        if (!p) return;

        UIUtils.showModal('도료 정보 수정', `
            <datalist id="manufacturerList">
                <option value="NOROO">
                <option value="KCC">
                <option value="PPG">
                <option value="YULIM">
                <option value="REDSOPT">
                <option value="ORIGIN">
            </datalist>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">구매처</label>
                    <input type="text" class="form-input" id="editPaintSupplier" value="${p.supplier || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">도료명 <span style="color:var(--accent-red)">*</span></label>
                    <input type="text" class="form-input" id="editPaintName" value="${p.name || ''}">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label">제조사</label>
                    <input type="text" class="form-input" id="editPaintManufacturer"
                        list="manufacturerList" value="${p.manufacturer || ''}"
                        placeholder="선택 또는 직접 입력" autocomplete="off">
                </div>
                <div class="form-group">
                    <label class="form-label">도료종류</label>
                    <select class="form-select" id="editPaintType">
                        <option value="">-- 선택 --</option>
                        <option value="주제"   ${p.paintType === '주제'   ? 'selected' : ''}>주제</option>
                        <option value="경화제" ${p.paintType === '경화제' ? 'selected' : ''}>경화제</option>
                        <option value="희석제" ${p.paintType === '희석제' ? 'selected' : ''}>희석제</option>
                        <option value="안료"   ${p.paintType === '안료'   ? 'selected' : ''}>안료</option>
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
                    <label class="form-label">유통기한</label>
                    <input type="text" class="form-input" id="editPaintShelfLife" value="${p.shelfLife || ''}">
                </div>
                <div class="form-group" style="visibility:hidden;"></div>
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="SettingsModule.updatePaint('${id}')">저장</button>
        `);
    }

    async function updatePaint(id) {
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
        renderTabContent();
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
            label: '유통기한'
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
            <div class="card" style="margin-bottom:20px;">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">cloud_download</span> 데이터 백업</h4>
                </div>
                <div class="card-body">
                    <p style="margin-bottom:16px;">현재 모든 데이터를 JSON 파일로 백업합니다. 정기적으로 백업하는 것을 권장합니다.</p>
                    <button class="btn btn-primary" onclick="SettingsModule.backupAll()">
                        <span class="material-symbols-outlined">download</span> 전체 백업
                    </button>
                </div>
            </div>

            <div class="card" style="margin-bottom:20px;">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">cloud_upload</span> 데이터 복원</h4>
                </div>
                <div class="card-body">
                    <p style="margin-bottom:16px;color:var(--accent-red);font-weight:500;">
                        ⚠️ 복원하면 현재 모든 데이터가 삭제되고 백업 파일의 데이터로 대체됩니다.
                    </p>
                    <input type="file" id="restoreFileInput" accept=".json" style="display:none;"
                        onchange="SettingsModule.restoreFromFile(this)">
                    <button class="btn btn-secondary" onclick="document.getElementById('restoreFileInput').click()">
                        <span class="material-symbols-outlined">upload</span> 백업 파일 선택
                    </button>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">info</span> 데이터 현황</h4>
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
    function renderSystemTab(el) {
        el.innerHTML = `
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
                            <label>저장소</label>
                            <span>NAS 서버 (192.168.10.15)</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined">update</span> 데이터 마이그레이션</h4>
                </div>
                <div class="card-body">
                    <p style="margin-bottom:16px;">
                        기존 제품 정보의 공정명을 일괄 변경합니다.<br>
                        • 도장A → 도장-A, 도장B → 도장-B<br>
                        • 검사 / 외관검사 → 외관 검사
                    </p>
                    <button class="btn btn-primary" onclick="SettingsModule.migrateProcessNames()">
                        <span class="material-symbols-outlined">upgrade</span> 공정명 일괄 수정
                    </button>
                    <hr style="margin:18px 0; border:none; border-top:1px solid var(--border);">
                    <p style="margin-bottom:10px; font-size:0.875rem;">
                        도료 공급사 오타 수정 — <strong>화인칼라테크 → 화인컬러테크</strong><br>
                        <span style="color:var(--text-muted); font-size:0.8rem;">도료 마스터 · 도료 수입검사 기록의 공급사명을 일괄 통합합니다.</span>
                    </p>
                    <button class="btn btn-primary" onclick="SettingsModule.migrateSupplierName()">
                        <span class="material-symbols-outlined">find_replace</span> 공급사명 오타 수정
                    </button>
                    <hr style="margin:18px 0; border:none; border-top:1px solid var(--border);">
                    <p style="margin-bottom:10px; font-size:0.875rem;">
                        도료 수입검사 유효기간 재계산 — <strong>제조일자 + 유통기한</strong><br>
                        <span style="color:var(--text-muted); font-size:0.8rem;">기존 잘못 계산된 유효기간(expDate)을 올바르게 재계산하고 창고 재고에도 반영합니다.</span>
                    </p>
                    <button class="btn btn-primary" onclick="SettingsModule.migrateExpDates()">
                        <span class="material-symbols-outlined">event_repeat</span> 도료 유효기간 재계산
                    </button>
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

            <div class="card" style="border-left:3px solid var(--accent-purple,#8b5cf6); margin-bottom:20px;">
                <div class="card-header">
                    <h4><span class="material-symbols-outlined" style="color:var(--accent-purple,#8b5cf6);">science</span> 개발/테스트 데이터</h4>
                </div>
                <div class="card-body">
                    <p style="margin-bottom:16px;font-size:0.875rem;color:var(--text-secondary);">
                        등록된 모든 <strong>사출 자재</strong>와 <strong>도료</strong>에 대해 각 1건씩 수입검사 기록을 임의 생성합니다.<br>
                        (사출: 입고수량 500개 / 도료: 입고수량 10개, 판정 합격)
                    </p>
                    <button class="btn btn-primary" onclick="SettingsModule.seedTestData()">
                        <span class="material-symbols-outlined">add_circle</span> 수입검사 테스트 데이터 삽입
                    </button>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <h4 style="color:var(--accent-red)"><span class="material-symbols-outlined">warning</span> 위험 영역</h4>
                </div>
                <div class="card-body">
                    <p style="margin-bottom:16px;color:var(--accent-red);">
                        아래 작업은 되돌릴 수 없습니다. 반드시 백업을 먼저 하세요.
                    </p>
                    <button class="btn btn-danger" onclick="SettingsModule.clearAllData()">
                        <span class="material-symbols-outlined">delete_forever</span> 전체 데이터 초기화
                    </button>
                </div>
            </div>
        `;
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
        UIUtils.confirm('도료 수입검사 기록의 유효기간을 재계산합니까?\n제조일자 + 유통기한으로 유효기간을 다시 계산하고,\n도료 창고 재고의 유효기간도 함께 갱신됩니다.', async () => {
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
    function _mfgMatchSimilarity(a, b) {
        if (!a || !b) return 0;
        const sa = a.trim().toLowerCase().replace(/\s+/g, '');
        const sb = b.trim().toLowerCase().replace(/\s+/g, '');
        if (sa === sb) return 1.0;
        if (sa.includes(sb) || sb.includes(sa)) {
            return 0.85 - Math.abs(sa.length - sb.length) * 0.005;
        }
        const maxLen = Math.max(sa.length, sb.length);
        if (maxLen === 0) return 1.0;
        const bArr = [...sb], used = new Array(bArr.length).fill(false);
        let common = 0;
        for (const ch of [...sa]) {
            for (let i = 0; i < bArr.length; i++) {
                if (!used[i] && bArr[i] === ch) { common++; used[i] = true; break; }
            }
        }
        return common / maxLen;
    }

    /**
     * 생산계획 품명 집합에서 현재 제작품목명에 가장 적합한 값을 제안
     * @returns {{ value:string, type:'exact'|'suggested'|'nomatch'|'empty', score:number }}
     */
    function _suggestMfgMatch(currentName, planPartNameSet, planPartNames) {
        if (!currentName || !currentName.trim()) return { value: '', type: 'empty', score: 0 };
        const trimmed = currentName.trim();
        if (planPartNameSet.has(trimmed)) return { value: trimmed, type: 'exact', score: 1 };
        // 최적 매칭 탐색
        let best = null, bestScore = 0;
        for (const pn of planPartNames) {
            const s = _mfgMatchSimilarity(trimmed, pn);
            if (s > bestScore) { bestScore = s; best = pn; }
        }
        if (bestScore >= 0.45) return { value: best, type: 'suggested', score: bestScore };
        return { value: trimmed, type: 'nomatch', score: 0 };
    }

    /**
     * 매칭 검토 모달 열기
     */
    function openMfgMatchingReview() {
        const mats  = Storage.getAll(INJECT_MAT_STORE) || [];
        const plans = Storage.getAll(DB.STORES.PRODUCTION_PLANS) || [];

        if (mats.length === 0) { UIUtils.toast('등록된 사출자재가 없습니다.', 'warning'); return; }

        const planPartNameSet = new Set(plans.map(p => (p.partName || '').trim()).filter(Boolean));
        const planPartNames   = [...planPartNameSet].sort();

        if (planPartNames.length === 0) {
            UIUtils.toast('생산계획에 품명 데이터가 없습니다. 먼저 생산계획을 등록하세요.', 'warning');
            return;
        }

        // 생산계획 품명을 datalist로 제공
        const datalistHtml = `<datalist id="planNamesDatalistMfg">
            ${planPartNames.map(n => `<option value="${n.replace(/"/g,'&quot;')}"></option>`).join('')}
        </datalist>`;

        // 행별 스타일 헬퍼
        function cellBg(type) {
            if (type === 'exact')     return 'background:rgba(52,211,153,0.13);';
            if (type === 'suggested') return 'background:rgba(251,191,36,0.22);box-shadow:inset 3px 0 0 #f59e0b;';
            if (type === 'nomatch')   return 'background:rgba(239,68,68,0.12);box-shadow:inset 3px 0 0 #ef4444;';
            return '';  // empty → no style
        }
        function statusBadge(s1, s2, hasMfg1, hasMfg2) {
            const t1 = hasMfg1 ? s1.type : 'empty';
            const t2 = hasMfg2 ? s2.type : 'empty';
            const allExact = (t1 === 'exact' || t1 === 'empty') && (t2 === 'exact' || t2 === 'empty');
            if (allExact)
                return `<span style="color:#10b981;font-size:0.75rem;font-weight:700;">✓ 일치</span>`;
            if (t1 === 'nomatch' || t2 === 'nomatch')
                return `<span style="color:#ef4444;font-size:0.75rem;font-weight:700;">✗ 미매칭</span>`;
            return `<span style="color:#f59e0b;font-size:0.75rem;font-weight:700;">◈ 제안</span>`;
        }
        function inputCell(field, sug, matId, inputId) {
            const orig    = (sug.type !== 'empty' ? sug.value : '');
            const bgStyle = cellBg(sug.type);
            const tooltip = sug.type === 'suggested'
                ? `title="유사도 ${Math.round(sug.score * 100)}% - 확인 후 저장하세요"`
                : (sug.type === 'nomatch' ? `title="생산계획에서 매칭되는 품명을 찾지 못했습니다"` : '');
            const badge = sug.type === 'suggested'
                ? `<span style="position:absolute;right:5px;top:50%;transform:translateY(-50%);
                               font-size:0.6rem;color:#b45309;font-weight:700;
                               pointer-events:none;user-select:none;">제안</span>`
                : (sug.type === 'nomatch'
                   ? `<span style="position:absolute;right:5px;top:50%;transform:translateY(-50%);
                                  font-size:0.6rem;color:#ef4444;font-weight:700;
                                  pointer-events:none;user-select:none;">?</span>` : '');
            return `<td style="padding:3px 5px;min-width:175px;">
                <div style="position:relative;">
                    <input type="text" list="planNamesDatalistMfg"
                           id="${inputId}"
                           data-mat-id="${matId}"
                           data-field="${field}"
                           data-original="${(orig).replace(/"/g,'&quot;')}"
                           data-sug-type="${sug.type}"
                           value="${(orig).replace(/"/g,'&quot;')}"
                           ${tooltip}
                           placeholder="${sug.type === 'empty' ? '(미입력)' : '품명 입력 또는 선택'}"
                           style="width:100%;padding:4px 22px 4px 7px;font-size:0.78rem;
                                  border:1px solid var(--border-color);border-radius:4px;
                                  box-sizing:border-box;${bgStyle}"
                           oninput="SettingsModule._onMatchInput(this)">
                    ${badge}
                </div>
            </td>`;
        }

        // 차종 목록 (필터용)
        const uniqueCars = [...new Set(mats.map(m => m.carModel).filter(Boolean))].sort();

        // 통계 집계
        let cntExact = 0, cntSuggested = 0, cntNomatch = 0, cntEmpty = 0;

        const rows = mats.map((m, idx) => {
            const hasMfg1 = !!(m.mfgProductName  && m.mfgProductName.trim());
            const hasMfg2 = !!(m.mfgProductName2 && m.mfgProductName2.trim());
            const s1 = _suggestMfgMatch(m.mfgProductName,  planPartNameSet, planPartNames);
            const s2 = _suggestMfgMatch(m.mfgProductName2, planPartNameSet, planPartNames);

            // 통계
            [s1, s2].forEach(s => {
                if      (s.type === 'exact')     cntExact++;
                else if (s.type === 'suggested') cntSuggested++;
                else if (s.type === 'nomatch')   cntNomatch++;
                else                             cntEmpty++;
            });

            // 행 전체 상태 (음영 필터용)
            const rowHasHighlight = (hasMfg1 && s1.type !== 'exact') || (hasMfg2 && s2.type !== 'exact')
                                  || (!hasMfg1) || (!hasMfg2);

            return `<tr data-car="${(m.carModel||'').replace(/"/g,'&quot;')}"
                        data-idx="${idx}"
                        data-highlight="${rowHasHighlight}"
                        style="border-bottom:1px solid var(--border-color);">
                <td style="padding:4px 8px;font-size:0.78rem;white-space:nowrap;">${m.carModel||'-'}</td>
                <td style="padding:4px 8px;font-size:0.78rem;font-weight:600;white-space:nowrap;">${m.injPartName||'-'}</td>
                <td style="padding:4px 8px;font-size:0.75rem;color:var(--text-muted);white-space:nowrap;">${m.injColor||'-'}</td>
                <td style="padding:4px 8px;font-size:0.75rem;color:var(--text-muted);max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                    title="${(m.mfgProductName||'').replace(/"/g,'&quot;')}">${m.mfgProductName||'<em style="color:var(--text-muted)">없음</em>'}</td>
                ${inputCell('mfgProductName',  s1, m.id, `mfgM1_${m.id}`)}
                <td style="padding:4px 8px;font-size:0.75rem;color:var(--text-muted);max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                    title="${(m.mfgProductName2||'').replace(/"/g,'&quot;')}">${m.mfgProductName2||'<em style="color:var(--text-muted)">없음</em>'}</td>
                ${inputCell('mfgProductName2', s2, m.id, `mfgM2_${m.id}`)}
                <td style="padding:4px 8px;text-align:center;white-space:nowrap;">${statusBadge(s1,s2,hasMfg1,hasMfg2)}</td>
            </tr>`;
        }).join('');

        const bodyHtml = `
        ${datalistHtml}
        <!-- 범례 & 통계 -->
        <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:8px 14px;
                    background:var(--bg-secondary);border-radius:6px;margin-bottom:10px;font-size:0.78rem;">
            <span style="font-weight:700;color:var(--text-secondary);">범례</span>
            <span><span style="display:inline-block;width:12px;height:12px;border-radius:2px;
                               background:rgba(52,211,153,0.25);border:1px solid rgba(52,211,153,0.5);
                               vertical-align:middle;margin-right:3px;"></span>정확 일치 <strong>${cntExact}</strong></span>
            <span><span style="display:inline-block;width:12px;height:12px;border-radius:2px;
                               background:rgba(251,191,36,0.3);border-left:3px solid #f59e0b;
                               vertical-align:middle;margin-right:3px;"></span>자동 제안 (음영) <strong>${cntSuggested}</strong></span>
            <span><span style="display:inline-block;width:12px;height:12px;border-radius:2px;
                               background:rgba(239,68,68,0.15);border-left:3px solid #ef4444;
                               vertical-align:middle;margin-right:3px;"></span>매칭 실패 <strong>${cntNomatch}</strong></span>
            <span style="color:var(--text-muted);">미입력 <strong>${cntEmpty}</strong></span>
            <span style="margin-left:auto;color:var(--text-muted);">
                생산계획 품명: <strong>${planPartNames.length}</strong>종 / 사출자재: <strong>${mats.length}</strong>건
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
                <input type="checkbox" id="matchFiltDiff" onchange="SettingsModule._filterMatchTable()">
                음영(제안/미매칭/미입력) 항목만 보기
            </label>
            <span style="font-size:0.75rem;color:var(--text-muted);">
                ※ 수정 입력란에 직접 입력하거나 드롭다운으로 품명을 선택하세요
            </span>
        </div>
        <!-- 테이블 -->
        <div style="max-height:58vh;overflow-y:auto;overflow-x:auto;
                    border:1px solid var(--border-color);border-radius:6px;">
            <table style="width:100%;border-collapse:collapse;" id="mfgMatchTable">
                <thead style="position:sticky;top:0;z-index:3;background:var(--bg-secondary);">
                    <tr>
                        <th style="padding:7px 8px;text-align:left;border-bottom:2px solid var(--border-color);
                                   font-size:0.72rem;white-space:nowrap;">차종</th>
                        <th style="padding:7px 8px;text-align:left;border-bottom:2px solid var(--border-color);
                                   font-size:0.72rem;white-space:nowrap;">사출품명</th>
                        <th style="padding:7px 8px;text-align:left;border-bottom:2px solid var(--border-color);
                                   font-size:0.72rem;white-space:nowrap;">컬러</th>
                        <th style="padding:7px 8px;text-align:left;border-bottom:2px solid var(--border-color);
                                   font-size:0.72rem;white-space:nowrap;min-width:100px;">현재 제작품목1</th>
                        <th style="padding:7px 8px;text-align:left;border-bottom:2px solid var(--border-color);
                                   font-size:0.72rem;white-space:nowrap;min-width:175px;">수정 제작품목1 ✏</th>
                        <th style="padding:7px 8px;text-align:left;border-bottom:2px solid var(--border-color);
                                   font-size:0.72rem;white-space:nowrap;min-width:100px;">현재 제작품목2</th>
                        <th style="padding:7px 8px;text-align:left;border-bottom:2px solid var(--border-color);
                                   font-size:0.72rem;white-space:nowrap;min-width:175px;">수정 제작품목2 ✏</th>
                        <th style="padding:7px 8px;text-align:center;border-bottom:2px solid var(--border-color);
                                   font-size:0.72rem;white-space:nowrap;">상태</th>
                    </tr>
                </thead>
                <tbody id="mfgMatchBody">
                    ${rows}
                </tbody>
            </table>
        </div>`;

        UIUtils.showModal(
            '사출자재 제작품목 ↔ 생산계획 품명 매칭 검토',
            bodyHtml,
            `<button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
             <button class="btn btn-primary" onclick="SettingsModule.applyMfgMatching()">
                 <span class="material-symbols-outlined" style="font-size:15px;vertical-align:-2px;">save</span>
                 변경 항목 저장
             </button>`,
            'xxl'
        );
        // 모달 DOM 렌더 후 드래그 핸들 초기화
        setTimeout(_initModalResize, 0);
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
    function _onMatchInput(el) {
        const val  = (el.value  || '').trim();
        const orig = (el.dataset.original || '').trim();
        const sugType = el.dataset.sugType || '';

        if (val === orig) {
            // 원래대로 돌아온 경우 → 제안 타입 기준 색상 복원
            if (sugType === 'exact') {
                el.style.background = 'rgba(52,211,153,0.13)';
                el.style.boxShadow  = '';
            } else if (sugType === 'suggested') {
                el.style.background = 'rgba(251,191,36,0.22)';
                el.style.boxShadow  = 'inset 3px 0 0 #f59e0b';
            } else if (sugType === 'nomatch') {
                el.style.background = 'rgba(239,68,68,0.12)';
                el.style.boxShadow  = 'inset 3px 0 0 #ef4444';
            } else {
                el.style.background = '';
                el.style.boxShadow  = '';
            }
        } else {
            // 사용자가 값을 바꿈 → 주황 음영 (직접 수정)
            el.style.background = 'rgba(234,88,12,0.15)';
            el.style.boxShadow  = 'inset 3px 0 0 #ea580c';
        }

        // 행의 data-highlight 갱신 (필터 반영)
        const row = el.closest('tr');
        if (row) {
            const anyChanged = Array.from(row.querySelectorAll('input[data-mat-id]'))
                .some(inp => (inp.value||'').trim() !== (inp.dataset.original||'').trim()
                          || (inp.dataset.sugType !== 'exact' && (inp.value||'').trim() !== ''));
            row.dataset.highlight = anyChanged ? 'true' : 'false';
        }
    }

    /** 차종 및 음영 필터 적용 */
    function _filterMatchTable() {
        const carFilter = ((document.getElementById('matchFiltCar') || {}).value || '');
        const diffOnly  = !!(document.getElementById('matchFiltDiff') || {}).checked;
        const tbody = document.getElementById('mfgMatchBody');
        if (!tbody) return;
        tbody.querySelectorAll('tr[data-idx]').forEach(row => {
            const matchCar  = !carFilter || row.dataset.car === carFilter;
            const matchDiff = !diffOnly  || row.dataset.highlight === 'true';
            row.style.display = (matchCar && matchDiff) ? '' : 'none';
        });
    }

    /** 변경된 제작품목 일괄 저장 */
    async function applyMfgMatching() {
        const inputs = document.querySelectorAll('#mfgMatchBody input[data-mat-id]');
        if (!inputs.length) return;

        // 변경 항목 수집 — data-original과 다른 값만
        const changes = {};  // matId → { field: newValue }
        inputs.forEach(inp => {
            const matId    = inp.dataset.matId;
            const field    = inp.dataset.field;
            const original = (inp.dataset.original || '').trim();
            const newVal   = (inp.value || '').trim();
            if (newVal !== original) {
                if (!changes[matId]) changes[matId] = {};
                changes[matId][field] = newVal;
            }
        });

        const changeCount = Object.keys(changes).length;
        if (changeCount === 0) {
            UIUtils.toast('변경된 항목이 없습니다.', 'info');
            return;
        }

        let savedCount = 0;
        for (const [matId, delta] of Object.entries(changes)) {
            const mat = Storage.getById(INJECT_MAT_STORE, matId);
            if (!mat) continue;
            await Storage.update(INJECT_MAT_STORE, matId, { ...mat, ...delta });
            savedCount++;
        }

        UIUtils.closeModal();
        UIUtils.toast(`${savedCount}건 사출자재 제작품목 업데이트 완료`, 'success');
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

    return {
        render,
        switchTab,
        openAddProductModal,
        saveProduct,
        editProduct,
        updateProduct,
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
        removePaint,
        downloadPaintCSV,
        openPaintUploadModal,
        handlePaintUploadFile,
        handlePaintUploadText,
        confirmPaintUpload,
        onPaintUploadModeChange,
        backupAll,
        restoreFromFile,
        migrateProcessNames,
        migrateSupplierName,
        migrateExpDates,
        clearAllData,
        filterProductList,
        filterPaintList,
        filterInjectMatList,
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
        _onMatchInput,
        _filterMatchTable,
        applyMfgMatching,
        checkPartNameDuplicate,
        showDuplicatePartNameReport,
        buildProductValidationPanel,
        _askCascadeRename,
        _doCascadeRename,
        deleteRecordsByPartNames,
        openInvPartNameEditModal,
        applyInvPartNameEdit
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
