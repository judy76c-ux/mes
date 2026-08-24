/**
 * 수입검사 기준서 모듈 (InjIncomingStdModule)
 * 사출 수입검사 기준서 — 원본 양식과 동일한 레이아웃으로 편집/출력
 */
var InjIncomingStdModule = (function () {
    const STORE   = DB.STORES.INJ_INCOMING_STD;
    const PROD_ST = DB.STORES.INJECTION_MATERIALS;

    const _esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    /** 양산품/양산, A/S품/A/S 등 저장 표기를 양산·A/S·개발로 통일 */
    function _stdNormItemType(t) {
        const s = String(t || '').trim();
        if (!s) return '';
        const n = s.replace(/품$/u, '').replace(/용$/u, '').trim();
        if (n === '양산') return '양산';
        if (n === 'A/S' || n === 'AS' || /^A\/?S$/i.test(n)) return 'A/S';
        if (n === '개발') return '개발';
        if (/양산/.test(s)) return '양산';
        if (/A\/?S/i.test(s)) return 'A/S';
        if (/개발/.test(s)) return '개발';
        return '';
    }

    function _stdItemTypeRank(t) {
        const n = _stdNormItemType(t);
        if (n === '양산') return 0;
        if (n === 'A/S') return 1;
        if (n === '개발') return 2;
        return 3;
    }

    function _stdItemTypeBadge(t) {
        const n = _stdNormItemType(t);
        if (n === '양산') {
            return '<span style="font-size:.72rem;font-weight:700;padding:2px 8px;border-radius:999px;background:rgba(5,150,105,.12);color:#059669;border:1px solid #6ee7b7;white-space:nowrap;">양산</span>';
        }
        if (n === 'A/S') {
            return '<span style="font-size:.72rem;font-weight:700;padding:2px 8px;border-radius:999px;background:rgba(217,119,6,.12);color:#d97706;border:1px solid #fcd34d;white-space:nowrap;">A/S</span>';
        }
        if (n === '개발') {
            return '<span style="font-size:.72rem;font-weight:700;padding:2px 8px;border-radius:999px;background:rgba(124,58,237,.12);color:#7c3aed;border:1px solid #c4b5fd;white-space:nowrap;">개발</span>';
        }
        return '-';
    }

    function _stdEffectiveItemType(mat, productsById, products) {
        const own = _stdNormItemType(mat && mat.itemType);
        if (own) return own;
        const ids = (mat && Array.isArray(mat.productIds)) ? mat.productIds : [];
        for (let i = 0; i < ids.length; i++) {
            const p = productsById && productsById[ids[i]];
            const fromId = _stdNormItemType(p && p.itemType);
            if (fromId) return fromId;
        }
        const names = [mat && mat.mfgProductName, mat && mat.mfgProductName2]
            .map(s => String(s || '').trim()).filter(Boolean);
        const car = String((mat && mat.carModel) || '').trim();
        if (names.length && products && products.length) {
            for (let i = 0; i < products.length; i++) {
                const p = products[i];
                if (car && String(p.carModel || '').trim() !== car) continue;
                if (!names.includes(String(p.partName || '').trim())) continue;
                const fromName = _stdNormItemType(p.itemType);
                if (fromName) return fromName;
            }
        }
        return '';
    }

    function _sealForName(name, existingSeal) {
        if (existingSeal && String(existingSeal).trim()) return existingSeal;
        if (!name) return '';
        if (typeof ApprovalUtils !== 'undefined' && ApprovalUtils.resolveSeal) {
            return ApprovalUtils.resolveSeal(name, '') || '';
        }
        return '';
    }

    /** 보기/출력 결재란: 날인만 (없으면 이름) */
    function _signView(name, seal) {
        const resolved = _sealForName(name, seal);
        if (resolved) {
            const src = String(resolved).replace(/"/g, '&quot;');
            return `<div style="display:flex;align-items:center;justify-content:center;min-height:56px;padding:2px;">
                <img class="std-seal" src="${src}" alt="${_esc(name || '날인')}" style="max-width:64px;max-height:64px;width:auto;object-fit:contain;" title="${_esc(name || '')}">
            </div>`;
        }
        return name ? `<span style="font-weight:700;">${_esc(name)}</span>` : '';
    }

    /** 개정내용 확인란: 결재 날인의 ~1/3 크기 */
    function _confirmerView(name) {
        const resolved = _sealForName(name, '');
        if (resolved) {
            const src = String(resolved).replace(/"/g, '&quot;');
            return `<img class="std-seal" src="${src}" alt="${_esc(name || '날인')}" style="max-width:22px;max-height:22px;width:auto;object-fit:contain;vertical-align:middle;" title="${_esc(name || '')}">`;
        }
        return name ? `<span style="font-weight:700;">${_esc(name)}</span>` : '';
    }

    let _formImages = [];   // 편집 중 이미지 배열
    let _kbHandler  = null; // 편집 모달 키보드 핸들러

    /* ═══════════════════════════════════════════════════════════════
       LIST 페이지
    ═══════════════════════════════════════════════════════════════ */
    function init() {}

    function render(container) {
        container.innerHTML = `
        <div class="fade-in-up">
            ${IncomingUI.renderSection('inj-incoming-std')}
            <div class="page-header">
                <div class="page-actions">
                    <button class="btn btn-primary" onclick="InjIncomingStdModule.openNewForm()">
                        <span class="material-symbols-outlined">add</span> 신규 기준서 등록
                    </button>
                </div>
            </div>

            <div class="filter-bar" style="flex-wrap:wrap;gap:10px;margin-bottom:16px;">
                <div class="form-group">
                    <label class="form-label">차종</label>
                    <select class="form-select" id="stdFilterCar" onchange="InjIncomingStdModule.renderList()">
                        <option value="">전체</option>${_carOptions()}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">품목구분</label>
                    <select class="form-select" id="stdFilterType" onchange="InjIncomingStdModule.renderList()">
                        <option value="">전체</option>
                        <option value="양산품">양산품</option>
                        <option value="A/S품">A/S품</option>
                        <option value="개발품">개발품</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">등록여부</label>
                    <select class="form-select" id="stdFilterReg" onchange="InjIncomingStdModule.renderList()">
                        <option value="">전체</option>
                        <option value="등록">등록</option>
                        <option value="미등록">미등록</option>
                    </select>
                </div>
                <div class="form-group" style="align-self:flex-end;">
                    <input type="text" class="form-input" id="stdFilterKeyword" placeholder="품명 검색..." oninput="InjIncomingStdModule.renderList()" style="min-width:160px;">
                </div>
            </div>

            <div id="stdSummary" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;"></div>

            <div class="card">
                <div class="card-body" style="padding:0;">
                    <div class="data-table-wrapper">
                        <table class="data-table">
                            <thead><tr>
                                <th>No</th><th>차종</th><th>품명</th><th>컬러</th>
                                <th style="text-align:center;">품목구분</th>
                                <th style="text-align:center;">등록여부</th>
                                <th>문서번호</th><th>Rev</th><th>제정일자</th>
                                <th style="text-align:center;">작업</th>
                            </tr></thead>
                            <tbody id="stdListBody"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>`;
        renderList();
    }

    function _carOptions() {
        const mats = Storage.getAll(PROD_ST) || [];
        return [...new Set(mats.map(p=>p.carModel).filter(Boolean))].sort()
            .map(c=>`<option value="${_esc(c)}">${_esc(c)}</option>`).join('');
    }

    function renderList() {
        const carFilter  = (document.getElementById('stdFilterCar')||{}).value||'';
        const typeFilter = (document.getElementById('stdFilterType')||{}).value||'';
        const regFilter  = (document.getElementById('stdFilterReg')||{}).value||'';
        const kw         = ((document.getElementById('stdFilterKeyword')||{}).value||'').toLowerCase();

        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const productsById = {};
        products.forEach(p => { if (p && p.id) productsById[p.id] = p; });

        const allProds = (Storage.getAll(PROD_ST)||[])
            .filter(p=>p.carModel && p.injPartName)
            .map(p=>({
                ...p,
                partName: p.injPartName,
                color: p.injColor||'',
                _itemType: _stdEffectiveItemType(p, productsById, products)
            }));

        const allStds = Storage.getAll(STORE)||[];
        const stdMap  = {};
        allStds.forEach(s=>{stdMap[s.productId]=s;});

        const typeNorm = _stdNormItemType(typeFilter);

        let rows = allProds.filter(p=>{
            if (carFilter  && p.carModel!==carFilter) return false;
            if (typeNorm && p._itemType !== typeNorm) return false;
            if (kw && !(p.partName||'').toLowerCase().includes(kw) && !(p.carModel||'').toLowerCase().includes(kw)) return false;
            const has=!!stdMap[p.id];
            if (regFilter==='등록' && !has) return false;
            if (regFilter==='미등록' && has) return false;
            return true;
        });

        rows.sort((a, b) =>
            _stdItemTypeRank(a._itemType) - _stdItemTypeRank(b._itemType) ||
            String(a.carModel || '').localeCompare(String(b.carModel || ''), 'ko') ||
            String(a.partName || '').localeCompare(String(b.partName || ''), 'ko') ||
            String(a.color || '').localeCompare(String(b.color || ''), 'ko')
        );

        const totalReg=rows.filter(p=>stdMap[p.id]).length;
        const totalUnreg=rows.filter(p=>!stdMap[p.id]).length;
        const sum=document.getElementById('stdSummary');
        if(sum) sum.innerHTML=`
            <span style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;border-radius:20px;padding:4px 14px;font-size:.82rem;font-weight:700;">전체 ${rows.length}종</span>
            <span style="background:#f0fdf4;color:#16a34a;border:1px solid #86efac;border-radius:20px;padding:4px 14px;font-size:.82rem;font-weight:700;">✓ 등록 ${totalReg}</span>
            <span style="background:#fff7ed;color:#d97706;border:1px solid #fcd34d;border-radius:20px;padding:4px 14px;font-size:.82rem;font-weight:700;">⚠ 미등록 ${totalUnreg}</span>`;

        const tbody=document.getElementById('stdListBody');
        if(!tbody) return;
        if(!rows.length){tbody.innerHTML=`<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text-muted);">해당하는 품목이 없습니다.</td></tr>`;return;}

        tbody.innerHTML=rows.map((p,i)=>{
            const std=stdMap[p.id],has=!!std;
            const itB=_stdItemTypeBadge(p._itemType);
            const regB=has
                ?`<span style="font-size:.72rem;font-weight:700;padding:2px 8px;border-radius:999px;background:#dcfce7;color:#16a34a;border:1px solid #86efac;">✓ 등록</span>`
                :`<span style="font-size:.72rem;font-weight:700;padding:2px 8px;border-radius:999px;background:#fef9c3;color:#d97706;border:1px solid #fde047;">미등록</span>`;
            return `<tr>
                <td>${i+1}</td>
                <td style="white-space:nowrap;"><strong>${_esc(p.carModel)}</strong></td>
                <td style="white-space:nowrap;">${_esc(p.partName)}</td>
                <td style="white-space:nowrap;">${_esc(p.color||'-')}</td>
                <td style="text-align:center;white-space:nowrap;">${itB}</td>
                <td style="text-align:center;">${regB}</td>
                <td style="white-space:nowrap;font-family:monospace;font-size:.8rem;">${has?_esc(std.docNo||'-'):'-'}</td>
                <td style="text-align:center;">${has?_esc(std.revNo||'00'):'-'}</td>
                <td>${has?_esc(std.createdDate||'-'):'-'}</td>
                <td style="text-align:center;white-space:nowrap;">
                    ${has
                        ?`<button class="btn btn-sm btn-primary" onclick="InjIncomingStdModule.openViewForm('${std.id}')">보기</button>
                          <button class="btn btn-sm btn-outline" onclick="InjIncomingStdModule.printStd('${std.id}')" title="출력"><span class="material-symbols-outlined" style="font-size:.9rem;">print</span></button>`
                        :`<button class="btn btn-sm btn-primary" onclick="InjIncomingStdModule.openNewFormForProduct('${p.id}')">등록</button>`}
                </td></tr>`;
        }).join('');
    }

    /* ═══════════════════════════════════════════════════════════════
       FORM 열기
    ═══════════════════════════════════════════════════════════════ */
    function openNewForm()                { _openForm(null,null); }
    function openNewFormForProduct(pid)   { _openForm(null, Storage.getById(PROD_ST,pid)); }
    function openEditForm(id)             { const s=Storage.getById(STORE,id); if(s) _openForm(s, s.productId?Storage.getById(PROD_ST,s.productId):null); }

    /* ── 뷰 모드 (읽기 전용) ── */
    function openViewForm(id) {
        const std = Storage.getById(STORE, id);
        if (!std) { UIUtils.toast('기준서를 찾을 수 없습니다.', 'error'); return; }

        // 주요검사 Point 읽기 전용
        const ptRows = (std.checkPoints||[]).map((pt,i) => `<tr style="${_stdPtRowHeightStyle(pt)}">
            <td style="text-align:center;padding:3px;border:1px solid #bbb;font-size:10px;vertical-align:top;">${_esc(_stdPtNoDisplay(pt,i))}</td>
            <td style="padding:4px;border:1px solid #bbb;font-size:10px;vertical-align:top;white-space:nowrap;">${_esc(pt.item||'')}</td>
            <td style="padding:4px;border:1px solid #bbb;font-size:10px;white-space:pre-wrap;vertical-align:top;">${_esc(pt.standard||'')}</td>
            <td style="padding:4px;border:1px solid #bbb;font-size:10px;text-align:center;vertical-align:top;">${_esc(pt.method||'')}</td>
            <td style="padding:4px;border:1px solid #bbb;font-size:10px;text-align:center;vertical-align:top;">${_esc(pt.sample||'')}</td>
            <td style="padding:4px;border:1px solid #bbb;font-size:10px;vertical-align:top;">${_esc(pt.management||'')}</td>
        </tr>`).join('');

        // 개정이력 읽기 전용
        const _DIAG = 'linear-gradient(to top right,transparent calc(50% - 0.5px),#bbb calc(50% - 0.5px),#bbb calc(50% + 0.5px),transparent calc(50% + 0.5px))';
        const revRows = (std.revisions||[]).map(r => {
            const cf = r.confirmer||'';
            return `<tr style="height:32px;">
            <td style="padding:3px;border:1px solid #bbb;text-align:center;font-size:10px;">${_esc(r.no||'')}</td>
            <td style="padding:3px;border:1px solid #bbb;text-align:center;font-size:10px;">${_esc(r.date||'')}</td>
            <td style="padding:3px;border:1px solid #bbb;text-align:center;font-size:10px;">${_esc(r.reason||'')}</td>
            <td style="padding:${cf?'2px':'0'};border:1px solid #bbb;text-align:center;vertical-align:middle;${cf?'':'background:'+_DIAG}">${cf ? _confirmerView(cf) : ''}</td>
        </tr>`;}).join('');

        // 이미지
        const imgs = (std.images||[]).map(_normImg);
        const imgHtml = imgs.length ? imgs.map((o,i) => `
            <div style="border:1px solid #ddd;border-radius:4px;overflow:hidden;background:#f9f9f9;">
                ${o.label?`<div style="padding:2px 4px;background:#e8edf2;border-bottom:1px solid #ddd;font-size:10px;font-weight:700;">${_esc(o.label)}</div>`:''}
                <img src="${o.src}" style="width:100%;height:${o.h}px;object-fit:contain;display:block;background:#fff;">
            </div>`).join('')
            : `<div style="display:flex;align-items:center;justify-content:center;min-height:120px;color:#bbb;font-size:.8rem;">이미지 없음</div>`;

        const _layout = _stdReadLayout(std);
        const _ptColWidths = _stdScale6ColWidths(_layout.ptColWidths);
        const _splitLeftWidth = _layout.splitLeftWidth;
        const _bottomLeftWidth = _layout.bottomLeftWidth;
        const _revDateWidth = _layout.revDateWidth;

        UIUtils.showModal('수입검사 기준서 보기', `
        <style>
            #stdViewDoc { font-family:'Malgun Gothic','맑은 고딕',sans-serif; font-size:11px; color:#111; }
            #stdViewDoc table { border-collapse:collapse; width:100%; }
            #stdViewDoc td, #stdViewDoc th { border:1px solid #888; padding:3px 6px; vertical-align:middle; }
            #stdViewDoc .dth { background:#d0e4f7; font-weight:700; text-align:center; }
            #stdViewDoc .dlb { background:#f0f0f0; font-weight:700; text-align:center; white-space:nowrap; }
            #stdViewDoc .dsec { background:#d0e4f7; font-weight:700; text-align:center; padding:5px; font-size:12px; }
            #stdViewDoc .dtitle { font-size:20px; font-weight:900; text-align:center; letter-spacing:3px; }
            #stdViewDoc .std-corrective-stack { height:100%; }
            #stdViewDoc .std-corrective-body { white-space:pre-wrap; }
        </style>
        <div id="stdViewDoc">
            <!-- 헤더 -->
            <table>
                <colgroup><col style="width:58px"><col style="width:130px"><col style="width:auto"><col style="width:26px"><col style="width:88px"><col style="width:88px"><col style="width:88px"></colgroup>
                <tr style="height:20px;">
                    <td class="dlb">공정NO</td><td style="text-align:center;font-weight:700;">10</td>
                    <td rowspan="4" class="dtitle">수입검사 기준서</td>
                    <td class="dth" style="border-bottom:none;"></td>
                    <td class="dth">작 성</td><td class="dth">검 토</td><td class="dth">승 인</td>
                </tr>
                <tr style="height:20px;">
                    <td class="dlb">공정명</td><td style="text-align:center;font-weight:700;">${_esc(std.processName||'수입검사')}</td>
                    <td class="dth" rowspan="3" style="writing-mode:vertical-rl;text-align:center;vertical-align:middle;border-top:none;font-size:11px;letter-spacing:3px;">결 재</td>
                    <td rowspan="3" style="text-align:center;vertical-align:middle;padding:2px;">${_signView(std.author, std.authorSeal)}</td>
                    <td rowspan="3" style="text-align:center;vertical-align:middle;padding:2px;">${_signView(std.reviewer, std.reviewerSeal)}</td>
                    <td rowspan="3" style="text-align:center;vertical-align:middle;padding:2px;">${_signView(std.approver, std.approverSeal)}</td>
                </tr>
                <tr style="height:20px;"><td class="dlb">차 종</td><td style="text-align:center;font-weight:700;">${_esc(std.carModel||'')}</td></tr>
                <tr style="height:20px;"><td class="dlb">품 명</td><td style="text-align:center;font-weight:700;color:#1d4ed8;">${_esc(std.partName||'')}</td></tr>
            </table>
            <!-- 이미지 + 검사포인트 -->
            <table style="margin-top:0;table-layout:fixed;width:100%;">
                <colgroup><col style="width:${_esc(_splitLeftWidth)}"><col></colgroup>
                <tr>
                    <td style="width:${_esc(_splitLeftWidth)};vertical-align:top;padding:0;">
                        <div class="dsec">외관 / 치수포인트</div>
                        <div style="padding:6px;display:grid;grid-template-columns:${imgs.length>1?'1fr 1fr':'1fr'};gap:4px;">${imgHtml}</div>
                    </td>
                    <td style="vertical-align:top;padding:0;">
                        <div class="dsec">주요검사 Point</div>
                        <table style="font-size:10px;width:100%;table-layout:fixed;border-collapse:collapse;">
                            <colgroup>${_ptColWidths.map(w => `<col style="width:${_esc(w)}">`).join('')}</colgroup>
                            <thead><tr>
                                <td class="dth" style="white-space:nowrap;">No</td>
                                <td class="dth" style="white-space:nowrap;">항 목</td>
                                <td class="dth">기 준</td>
                                <td class="dth" style="white-space:nowrap;">확인방법</td>
                                <td class="dth" style="white-space:nowrap;">시 료</td>
                                <td class="dth" style="white-space:nowrap;">관리방안</td>
                            </tr></thead>
                            <tbody>${ptRows}</tbody>
                        </table>
                    </td>
                </tr>
            </table>
            <!-- 검사순서 / 조치사항 -->
            <table style="margin-top:0;width:100%;table-layout:fixed;">
                <colgroup><col style="width:${_esc(_bottomLeftWidth)}"><col></colgroup>
                <tr>
                    <td style="vertical-align:top;padding:0;">
                        <div class="dsec">검 사 순 서</div>
                        <div style="padding:6px;white-space:pre-wrap;font-size:11px;line-height:1.8;">${_esc(std.procedure||'')}</div>
                    </td>
                    <td style="vertical-align:top;padding:0;height:1px;">
                        ${_stdRightStackHtml('dsec', _esc(std.corrective||''), `
                        <table style="font-size:10px;width:100%;border-collapse:collapse;table-layout:fixed;flex:0 0 auto;">
                            ${_stdRevColgroupHtml(_revDateWidth, false)}
                            <tr style="height:24px;">
                                <td class="dlb" rowspan="99" style="writing-mode:vertical-rl;text-align:center;vertical-align:middle;padding:2px;font-size:10px;">개정내용</td>
                                <td class="dth" style="white-space:nowrap;">NO</td>
                                <td class="dth" style="white-space:nowrap;">개정일자</td>
                                <td class="dth">개정사유</td>
                                <td class="dth" style="white-space:nowrap;">확 인</td>
                            </tr>
                            ${revRows}
                        </table>`)}
                    </td>
                </tr>
                <tr>
                    <td colspan="2" style="border:none;padding:3px 0 0 0;">
                        <div style="display:flex;justify-content:space-between;font-size:9px;color:#888;">
                            <span style="color:#555;">${_stdDocNoEditHtml(std)}</span>
                            <span>(주)케이씨케미칼&nbsp;&nbsp;A4(297×210)</span>
                        </div>
                    </td>
                </tr>
            </table>
        </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">닫기</button>
            <button class="btn btn-outline" onclick="UIUtils.closeModal();InjIncomingStdModule.printStd('${id}')">
                <span class="material-symbols-outlined">print</span> 출력
            </button>
            <button class="btn btn-primary" onclick="UIUtils.closeModal();InjIncomingStdModule.openEditForm('${id}')">
                <span class="material-symbols-outlined">edit</span> 편집
            </button>
            ${_stdCanWrite() ? `<button class="btn btn-danger" onclick="InjIncomingStdModule.deleteStd('${id}')"><span class="material-symbols-outlined">delete</span> 삭제</button>` : ''}
        `, 'xl');
    }

    /* 수입검사 기준서를 별도 오버레이로 보기 (등록 모달 위에 표시) */
    function openViewFormOverlay(id) {
        const std = Storage.getById(STORE, id);
        if (!std) { UIUtils.toast('기준서를 찾을 수 없습니다.', 'error'); return; }

        const old = document.getElementById('_injStdViewOv');
        if (old) old.remove();

        const ptRows = (std.checkPoints||[]).map((pt,i) => `<tr style="${_stdPtRowHeightStyle(pt)}">
            <td style="text-align:center;padding:3px;border:1px solid #bbb;font-size:10px;vertical-align:top;">${_esc(_stdPtNoDisplay(pt,i))}</td>
            <td style="padding:4px;border:1px solid #bbb;font-size:10px;vertical-align:top;white-space:nowrap;">${_esc(pt.item||'')}</td>
            <td style="padding:4px;border:1px solid #bbb;font-size:10px;white-space:pre-wrap;vertical-align:top;">${_esc(pt.standard||'')}</td>
            <td style="padding:4px;border:1px solid #bbb;font-size:10px;text-align:center;vertical-align:top;">${_esc(pt.method||'')}</td>
            <td style="padding:4px;border:1px solid #bbb;font-size:10px;text-align:center;vertical-align:top;">${_esc(pt.sample||'')}</td>
            <td style="padding:4px;border:1px solid #bbb;font-size:10px;vertical-align:top;">${_esc(pt.management||'')}</td>
        </tr>`).join('');

        const _DIAG = 'linear-gradient(to top right,transparent calc(50% - 0.5px),#bbb calc(50% - 0.5px),#bbb calc(50% + 0.5px),transparent calc(50% + 0.5px))';
        const _rawRevsOv = (std.revisions||[]).filter(r=>!!(r.no||r.reason));
        const revsOv = _rawRevsOv.length ? _rawRevsOv : [{no:'00', date:std.createdDate||UIUtils.today(), reason:'최초 작성', confirmer:''}];
        const revRows = revsOv.map(r => {
            const cf = r.confirmer||'';
            return `<tr style="height:32px;">
            <td style="padding:3px;border:1px solid #bbb;text-align:center;font-size:10px;">${_esc(r.no||'')}</td>
            <td style="padding:3px;border:1px solid #bbb;text-align:center;font-size:10px;">${_esc(r.date||'')}</td>
            <td style="padding:3px;border:1px solid #bbb;text-align:center;font-size:10px;">${_esc(r.reason||'')}</td>
            <td style="padding:${cf?'2px':'0'};border:1px solid #bbb;text-align:center;vertical-align:middle;${cf?'':'background:'+_DIAG}">${cf ? _confirmerView(cf) : ''}</td>
        </tr>`;}).join('');

        const imgs = (std.images||[]).map(_normImg);
        const imgHtml = imgs.length ? imgs.map(o => `
            <div style="border:1px solid #ddd;border-radius:4px;overflow:hidden;background:#f9f9f9;">
                ${o.label?`<div style="padding:2px 4px;background:#e8edf2;border-bottom:1px solid #ddd;font-size:10px;font-weight:700;">${_esc(o.label)}</div>`:''}
                <img src="${o.src}" style="width:100%;height:${o.h}px;object-fit:contain;display:block;background:#fff;">
            </div>`).join('')
            : `<div style="display:flex;align-items:center;justify-content:center;min-height:120px;color:#bbb;font-size:.8rem;">이미지 없음</div>`;

        const _ovLayout = _stdReadLayout(std);
        const _ovPtCols = _stdScale6ColWidths(_ovLayout.ptColWidths);
        const _ovSplitLeft = _ovLayout.splitLeftWidth;
        const _ovBottomLeft = _ovLayout.bottomLeftWidth;
        const _ovRevDate = _ovLayout.revDateWidth;

        const ov = document.createElement('div');
        ov.id = '_injStdViewOv';
        ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:10000;display:flex;flex-direction:column;overflow:auto;padding:16px;';
        ov.innerHTML = `
        <div style="max-width:1100px;margin:0 auto;width:100%;background:var(--bg-primary);border-radius:10px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.3);">
            <div style="background:var(--bg-tertiary);padding:12px 16px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border-color);">
                <span style="font-weight:700;font-size:1rem;">
                    <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:4px;">description</span>
                    수입검사 기준서
                </span>
                <div style="display:flex;gap:8px;">
                    <button class="btn btn-outline btn-sm" onclick="InjIncomingStdModule.printStd('${id}')">
                        <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">print</span> 출력
                    </button>
                    ${_stdCanWrite() ? `<button class="btn btn-danger btn-sm" onclick="InjIncomingStdModule.deleteStd('${id}')"><span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">delete</span> 삭제</button>` : ''}
                    <button class="btn btn-secondary btn-sm" onclick="document.getElementById('_injStdViewOv').remove()">✕ 닫기</button>
                </div>
            </div>
            <div style="padding:16px;overflow:auto;">
                <style>
                    #_stdOvDoc { font-family:'Malgun Gothic','맑은 고딕',sans-serif; font-size:11px; color:#111; }
                    #_stdOvDoc table { border-collapse:collapse; width:100%; }
                    #_stdOvDoc td, #_stdOvDoc th { border:1px solid #888; padding:3px 6px; vertical-align:middle; }
                    #_stdOvDoc .dth { background:#d0e4f7; font-weight:700; text-align:center; }
                    #_stdOvDoc .dlb { background:#f0f0f0; font-weight:700; text-align:center; white-space:nowrap; }
                    #_stdOvDoc .dsec { background:#d0e4f7; font-weight:700; text-align:center; padding:5px; font-size:12px; }
                    #_stdOvDoc .dtitle { font-size:20px; font-weight:900; text-align:center; letter-spacing:3px; }
                    #_stdOvDoc .std-corrective-stack { height:100%; }
                    #_stdOvDoc .std-corrective-body { white-space:pre-wrap; }
                </style>
                <div id="_stdOvDoc">
                    <table>
                        <colgroup><col style="width:58px"><col style="width:130px"><col style="width:auto"><col style="width:26px"><col style="width:88px"><col style="width:88px"><col style="width:88px"></colgroup>
                        <tr style="height:20px;">
                            <td class="dlb">공정NO</td><td style="text-align:center;font-weight:700;">10</td>
                            <td rowspan="4" class="dtitle">수입검사 기준서</td>
                            <td class="dth" style="border-bottom:none;"></td>
                            <td class="dth">작 성</td><td class="dth">검 토</td><td class="dth">승 인</td>
                        </tr>
                        <tr style="height:20px;">
                            <td class="dlb">공정명</td><td style="text-align:center;font-weight:700;">${_esc(std.processName||'수입검사')}</td>
                            <td class="dth" rowspan="3" style="writing-mode:vertical-rl;text-align:center;vertical-align:middle;border-top:none;font-size:11px;letter-spacing:3px;">결 재</td>
                            <td rowspan="3" style="text-align:center;vertical-align:middle;padding:2px;">${_signView(std.author, std.authorSeal)}</td>
                            <td rowspan="3" style="text-align:center;vertical-align:middle;padding:2px;">${_signView(std.reviewer, std.reviewerSeal)}</td>
                            <td rowspan="3" style="text-align:center;vertical-align:middle;padding:2px;">${_signView(std.approver, std.approverSeal)}</td>
                        </tr>
                        <tr style="height:20px;"><td class="dlb">차 종</td><td style="text-align:center;font-weight:700;">${_esc(std.carModel||'')}</td></tr>
                        <tr style="height:20px;"><td class="dlb">품 명</td><td style="text-align:center;font-weight:700;color:#1d4ed8;">${_esc(std.partName||'')}</td></tr>
                    </table>
                    <table style="margin-top:0;table-layout:fixed;width:100%;">
                        <colgroup><col style="width:${_esc(_ovSplitLeft)}"><col></colgroup>
                        <tr>
                            <td style="width:${_esc(_ovSplitLeft)};vertical-align:top;padding:0;">
                                <div class="dsec">외관 / 치수포인트</div>
                                <div style="padding:6px;display:grid;grid-template-columns:${imgs.length>1?'1fr 1fr':'1fr'};gap:4px;">${imgHtml}</div>
                            </td>
                            <td style="vertical-align:top;padding:0;">
                                <div class="dsec">주요검사 Point</div>
                                <table style="font-size:10px;width:100%;table-layout:fixed;border-collapse:collapse;">
                                    <colgroup>${_ovPtCols.map(w => `<col style="width:${_esc(w)}">`).join('')}</colgroup>
                                    <thead><tr>
                                        <td class="dth" style="white-space:nowrap;">No</td>
                                        <td class="dth" style="white-space:nowrap;">항 목</td>
                                        <td class="dth">기 준</td>
                                        <td class="dth" style="white-space:nowrap;">확인방법</td>
                                        <td class="dth" style="white-space:nowrap;">시 료</td>
                                        <td class="dth" style="white-space:nowrap;">관리방안</td>
                                    </tr></thead>
                                    <tbody>${ptRows}</tbody>
                                </table>
                            </td>
                        </tr>
                    </table>
                    <table style="margin-top:0;width:100%;table-layout:fixed;">
                        <colgroup><col style="width:${_esc(_ovBottomLeft)}"><col></colgroup>
                        <tr>
                            <td style="vertical-align:top;padding:0;">
                                <div class="dsec">검 사 순 서</div>
                                <div style="padding:6px;white-space:pre-wrap;font-size:11px;line-height:1.8;">${_esc(std.procedure||'')}</div>
                            </td>
                            <td style="vertical-align:top;padding:0;height:1px;">
                                ${_stdRightStackHtml('dsec', _esc(std.corrective||''), `
                                <table style="font-size:10px;width:100%;border-collapse:collapse;table-layout:fixed;flex:0 0 auto;">
                                    ${_stdRevColgroupHtml(_ovRevDate, false)}
                                    <tr style="height:24px;">
                                        <td class="dlb" rowspan="99" style="writing-mode:vertical-rl;text-align:center;vertical-align:middle;padding:2px;font-size:10px;">개정내용</td>
                                        <td class="dth" style="white-space:nowrap;">NO</td>
                                        <td class="dth" style="white-space:nowrap;">개정일자</td>
                                        <td class="dth">개정사유</td>
                                        <td class="dth" style="white-space:nowrap;">확 인</td>
                                    </tr>
                                    ${revRows}
                                </table>`)}
                            </td>
                        </tr>
                        <tr>
                            <td colspan="2" style="border:none;padding:3px 0 0 0;">
                                <div style="display:flex;justify-content:space-between;font-size:9px;color:#888;">
                                    <span style="color:#555;">${_stdDocNoEditHtml(std)}</span>
                                    <span>(주)케이씨케미칼&nbsp;&nbsp;A4(297×210)</span>
                                </div>
                            </td>
                        </tr>
                    </table>
                </div>
            </div>
        </div>`;
        document.body.appendChild(ov);
    }

    /* ── 기본 10개 검사항목 ── */
    const DEFAULT_POINTS = [
        {item:'외관',      standard:'BURR, 이물, 흠, SINK MARK 없을 것',                  method:'육안',    sample:'10EA/LOT', management:'수입검사 성적서'},
        {item:'치수',      standard:'도면 규격 이내',                                      method:'V/C',     sample:'5EA/LOT',  management:''},
        {item:'표면장력',  standard:'TEST 시약이 물방울 형태로 맺히지 않을 것',            method:'육안',    sample:'1EA/LOT',  management:''},
        {item:'내포장상태',standard:'포장 BOX 내부에 이물없을 것\n내부 포장비닐등의 찢어짐이 없을 것', method:'육안', sample:'3Box/LOT', management:''},
        {item:'포장·수량', standard:'포장사양, 명세표대비 현품 동일할 것',                 method:'육안',    sample:'BOX',      management:'포장사양서'},
        {},{},{},{},{}
    ];

    function _stdPtNoDisplay(pt, i) {
        const n = pt && pt.no != null ? String(pt.no).trim() : '';
        return n || String(i + 1);
    }

    function _stdCheckRowHtml(pt, i) {
        pt = pt || {};
        const no = (pt.no != null && String(pt.no).trim() !== '') ? String(pt.no) : (i == null ? '' : String(i + 1));
        const rowH = pt.rowHeight ? String(pt.rowHeight).trim() : '';
        const hStyle = rowH ? `height:${_esc(rowH)};` : '';
        const stdMin = rowH ? `min-height:${_esc(rowH)};` : 'min-height:1.5em;';
        return `<tr class="std-pt-row" style="${hStyle}">
            <td style="padding:2px;border:1px solid #bbb;text-align:center;white-space:nowrap;vertical-align:top;">
                <input class="std-pt-no" type="text" value="${_esc(no)}"
                    style="width:100%;border:none;background:transparent;font-size:10px;text-align:center;padding:2px;"></td>
            <td style="padding:2px;border:1px solid #bbb;vertical-align:top;"><input class="std-pt-item" type="text" value="${_esc(pt.item||'')}"
                style="width:100%;border:none;background:transparent;font-size:10px;padding:2px;"></td>
            <td style="padding:4px 2px;border:1px solid #bbb;vertical-align:top;"><div class="std-pt-std" contenteditable="true"
                style="width:100%;border:none;background:transparent;font-size:10px;padding:2px;line-height:1.5;outline:none;white-space:pre-wrap;${stdMin}">${_esc(pt.standard||'')}</div></td>
            <td style="padding:2px;border:1px solid #bbb;vertical-align:top;"><input class="std-pt-method" type="text" value="${_esc(pt.method||'')}"
                style="width:100%;border:none;background:transparent;font-size:10px;padding:2px;"></td>
            <td style="padding:2px;border:1px solid #bbb;vertical-align:top;"><input class="std-pt-sample" type="text" value="${_esc(pt.sample||'')}"
                style="width:100%;border:none;background:transparent;font-size:10px;padding:2px;"></td>
            <td style="padding:2px;border:1px solid #bbb;vertical-align:top;"><input class="std-pt-mgmt" type="text" value="${_esc(pt.management||'')}"
                style="width:100%;border:none;background:transparent;font-size:10px;padding:2px;"></td>
            <td style="padding:2px;border:1px solid #bbb;text-align:right;white-space:nowrap;vertical-align:top;">
                <button type="button" onclick="InjIncomingStdModule._insertCheckRowAfter(this)"
                    style="background:none;border:none;color:#2563eb;cursor:pointer;font-size:14px;line-height:1;" title="아래 행 추가">+</button>
                <button type="button" onclick="InjIncomingStdModule._removeCheckRow(this)"
                    style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:14px;line-height:1;" title="행 삭제">×</button>
            </td></tr>
            <tr class="std-pt-row-sizer">
                <td colspan="7" class="std-pt-row-handle" title="드래그해서 행 높이 조절"
                    onmousedown="InjIncomingStdModule._stdStartPtRowResize(event)"></td>
            </tr>`;
    }

    function _stdPtRowHeightStyle(pt) {
        const h = pt && pt.rowHeight ? String(pt.rowHeight).trim() : '';
        return h ? `height:${_esc(h)};` : '';
    }

    const _STD_REV_DATE_W = '88px';
    const _STD_PT_COL_DEFAULTS = ['6%', '14%', '40%', '12%', '10%', '10%', '8%'];

    function _stdScale6ColWidths(saved7) {
        const fallback = ['7%', '16%', '44%', '13%', '10%', '10%'];
        if (!Array.isArray(saved7) || saved7.length < 6) return fallback;
        const nums = saved7.slice(0, 6).map(w => parseFloat(w) || 0);
        const sum = nums.reduce((a, b) => a + b, 0);
        if (sum <= 0) return fallback;
        return nums.map(n => (n / sum * 100).toFixed(2) + '%');
    }

    function _stdReadLayout(std) {
        const L = (std && std.layout) || {};
        return {
            ptColWidths: _STD_PT_COL_DEFAULTS.map((def, i) => (L.ptColWidths && L.ptColWidths[i]) || def),
            splitLeftWidth: L.splitLeftWidth || '50%',
            splitHeight: L.splitHeight || '',
            bottomLeftWidth: L.bottomLeftWidth || '50%',
            revDateWidth: L.revDateWidth || _STD_REV_DATE_W
        };
    }

    function _stdRevColgroupHtml(dateWidth, forEdit) {
        const dw = dateWidth || _STD_REV_DATE_W;
        return `<colgroup>
            <col style="width:20px">
            <col style="width:28px">
            <col${forEdit ? ' id="stdRevDateCol"' : ''} style="width:${_esc(dw)}">
            <col>
            <col style="width:72px">
            ${forEdit ? '<col style="width:44px">' : ''}
        </colgroup>`;
    }

    /** 조치사항(남은 높이 채움) + 개정내용 표를 편집/보기/출력에서 같은 비율로 쌓는다 */
    function _stdRightStackHtml(headerClass, correctiveInner, revTableHtml) {
        return `<div class="std-corrective-stack" style="display:flex;flex-direction:column;height:100%;">
            <div style="flex:1 1 auto;min-height:0;display:flex;flex-direction:column;">
                <div class="${headerClass}" style="flex:0 0 auto;border:none;border-bottom:1px solid #888;">조 치 사 항</div>
                <div class="std-corrective-body" style="flex:1 1 auto;padding:6px;min-height:0;font-size:11px;line-height:1.8;font-family:'Malgun Gothic','맑은 고딕',sans-serif;">${correctiveInner}</div>
            </div>
            ${revTableHtml}
        </div>`;
    }

    function _stdStartWidthPx(el, tableWidth, fallback) {
        const w = (el && el.style && el.style.width) || '';
        const n = parseFloat(w);
        if (!n) return fallback;
        if (String(w).indexOf('%') >= 0) return (n / 100) * (tableWidth || 1);
        return n;
    }

    function _stdBindDocDrag(onMove) {
        const prevSel = document.body.style.userSelect;
        document.body.style.userSelect = 'none';
        function move(ev) { onMove(ev); ev.preventDefault(); }
        function up() {
            document.body.style.userSelect = prevSel;
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
        }
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
    }

    function _openForm(std, prod) {
        const isEdit = !!std;

        const allMats = (Storage.getAll(PROD_ST)||[]).filter(p=>p.carModel&&p.injPartName);
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const productsById = {};
        products.forEach(p => { if (p && p.id) productsById[p.id] = p; });
        const selectedMat = (std && std.productId ? allMats.find(p=>p.id===std.productId) : null)
            || (prod && prod.id ? allMats.find(p=>p.id===prod.id) || prod : null)
            || null;
        const selCarModel = selectedMat ? (selectedMat.carModel || '') : '';
        const selProdId = selectedMat ? selectedMat.id : '';
        const selectedType = selectedMat ? _stdEffectiveItemType(selectedMat, productsById, products) : '';

        const fv = (field, fallback='') => {
            if (std && std[field] != null && String(std[field]) !== '') return _esc(std[field]);
            if (selectedMat) {
                if (field === 'partName') return _esc(selectedMat.injPartName || selectedMat.partName || fallback);
                if (field === 'carModel') return _esc(selectedMat.carModel || fallback);
                if (field === 'itemType') return _esc(selectedType || fallback);
            }
            return _esc(fallback);
        };

        const carList = [...new Set(allMats.map(p=>p.carModel))].sort();
        const carOpts = carList.map(c=>`<option value="${_esc(c)}" ${selCarModel===c?'selected':''}>${_esc(c)}</option>`).join('');
        const partMats = selCarModel ? allMats.filter(p=>p.carModel===selCarModel) : [];
        const prodSel = partMats.map(p=>`<option value="${p.id}"
            ${selProdId===p.id?'selected':''}
            data-car="${_esc(p.carModel)}" data-part="${_esc(p.injPartName)}"
            data-color="${_esc(p.injColor||'')}" data-type="${_esc(_stdEffectiveItemType(p, productsById, products))}">
            ${_esc(p.injPartName)}${p.injColor?' / '+_esc(p.injColor):''}
        </option>`).join('');

        // 검사 항목 행
        const pts = std ? (std.checkPoints||[]) : DEFAULT_POINTS;
        const ptRows = pts.map((pt,i)=>_stdCheckRowHtml(pt, i)).join('');

        // 개정이력 행
        const _rawRevs = std ? (std.revisions||[]).filter(r=>!!(r.no||r.reason)) : [];
        const revs = _rawRevs.length ? _rawRevs
                   : [{no:'00', date:std?(std.createdDate||''):UIUtils.today(), reason:'최초 작성', confirmer:''}];
        const _DIAG_E = 'linear-gradient(to top right,transparent calc(50% - 0.5px),#bbb calc(50% - 0.5px),#bbb calc(50% + 0.5px),transparent calc(50% + 0.5px))';
        const revRows = revs.map(r=>{
            const hasCf = !!(r.confirmer||'').trim();
            return `<tr style="height:32px;">
            <td style="padding:2px;border:1px solid #bbb;"><input class="std-rev-no" type="text" value="${_esc(r.no||'')}"
                style="width:100%;height:28px;border:none;background:transparent;font-size:10px;text-align:center;"></td>
            <td style="padding:2px;border:1px solid #bbb;"><input class="std-rev-date" type="text" value="${_esc(r.date||'')}"
                style="width:100%;height:28px;border:none;background:transparent;font-size:10px;text-align:center;"></td>
            <td style="padding:2px;border:1px solid #bbb;"><input class="std-rev-reason" type="text" value="${_esc(r.reason||'')}"
                style="width:100%;height:28px;border:none;background:transparent;font-size:10px;"></td>
            <td style="padding:0;border:1px solid #bbb;background:${hasCf?'none':_DIAG_E};">
                <input class="std-rev-confirmer" type="text" list="stdUserDatalist" value="${_esc(r.confirmer||'')}"
                    style="width:100%;height:32px;border:none;background:transparent;font-size:10px;text-align:center;display:block;"
                    oninput="InjIncomingStdModule._onCfInput(this)">
            </td>
            <td style="padding:2px;border:1px solid #bbb;text-align:right;white-space:nowrap;">
                <button type="button" onclick="InjIncomingStdModule._insertRevRowAfter(this)"
                    style="background:none;border:none;color:#2563eb;cursor:pointer;font-size:14px;line-height:1;" title="아래 행 추가">+</button>
                <button type="button" onclick="this.closest('tr').remove()"
                    style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:14px;line-height:1;" title="행 삭제">×</button>
            </td></tr>`;}).join('');

        // 이미지 목록 초기화 (기존 string 포맷도 정규화)
        _formImages = (std ? (std.images||[]) : []).map(_normImg);

        const _layout = _stdReadLayout(std);
        const _ptColWidths = _layout.ptColWidths;
        const _splitLeftWidth = _layout.splitLeftWidth;
        const _splitHeightStyle = _layout.splitHeight ? `height:${_esc(_layout.splitHeight)};` : '';
        const _bottomLeftWidth = _layout.bottomLeftWidth;
        const _revDateWidth = _layout.revDateWidth;

        /* ── 인라인 CSS (문서 스타일) ── */
        const docStyle = `
            <style>
            #stdDoc { font-family:'Malgun Gothic','맑은 고딕',sans-serif; font-size:11px; color:#111; }
            #stdDoc table { border-collapse:collapse; width:100%; }
            #stdDoc td, #stdDoc th { vertical-align:middle; }
            #stdDoc .doc-th { background:#d0e4f7; font-weight:700; text-align:center; border:1px solid #888; padding:4px 6px; }
            #stdDoc .doc-sec { background:#d0e4f7; font-weight:700; text-align:center; border:1px solid #888; padding:5px; font-size:12px; }
            #stdDoc .doc-cell { border:1px solid #888; padding:3px 6px; vertical-align:middle; text-align:left; }
            #stdDoc .doc-label { background:#f0f0f0; font-weight:700; text-align:center; border:1px solid #888; padding:3px 6px; white-space:nowrap; vertical-align:middle; }
            #stdDoc .doc-input { border:none; background:transparent; width:100%; font-family:inherit; font-size:inherit; color:#111; padding:0; outline:none; vertical-align:middle; text-align:left; }
            #stdDoc .doc-input:focus { background:#fffbeb; border-radius:2px; }
            #stdDoc .doc-title { font-size:22px; font-weight:900; text-align:center; letter-spacing:2px; }
            #stdDoc .std-split-handle:hover { background:rgba(37,99,235,0.35); }
            #stdDoc .std-split-vresize:hover { background:rgba(37,99,235,0.35); }
            #stdDoc .std-split-handle { background:rgba(37,99,235,0.14); touch-action:none; }
            #stdDoc .std-split-vresize { background:rgba(37,99,235,0.10); touch-action:none; }
            #stdDoc .std-pt-col-handle { background:rgba(37,99,235,0.14); touch-action:none; }
            #stdDoc .std-pt-col-handle:hover { background:rgba(37,99,235,0.55); }
            #stdDoc .std-pt-table { width:100%; table-layout:fixed; }
            #stdDoc .std-pt-table .doc-th { white-space:nowrap; overflow:hidden; }
            #stdDoc .std-pt-table td { overflow:hidden; }
            #stdDoc .std-pt-table tbody td { overflow:visible; }
            #stdDoc .std-pt-table .std-pt-std { white-space:pre-wrap; word-break:break-all; overflow:auto; }
            #stdDoc .std-pt-row-handle {
                height:7px; padding:0; margin:0; line-height:0; font-size:0;
                cursor:row-resize; touch-action:none;
                background:rgba(37,99,235,0.14);
                border:1px solid #888; border-top:none;
            }
            #stdDoc .std-pt-row-handle:hover { background:rgba(37,99,235,0.55); }
            #stdDoc .std-pt-table input { width:100% !important; min-width:0 !important; }
            #stdDoc #stdRevTable { width:100%; table-layout:fixed; }
            #stdDoc #stdRevTable .std-rev-date { width:100%; min-width:0; }
            #stdDoc .std-corrective-stack { height:100%; }
            #stdDoc .std-corrective-body textarea { width:100%; height:100%; box-sizing:border-box; }
            </style>`;

        // 날인: 편집은 이름만 — 저장 시 매칭
        const userListHtml = (typeof ApprovalUtils !== 'undefined' && ApprovalUtils.userDatalistHtml)
            ? ApprovalUtils.userDatalistHtml('stdUserDatalist')
            : '<datalist id="stdUserDatalist"></datalist>';
        const nameTd = (id, val) => `<td class="doc-cell" rowspan="3" style="text-align:center;vertical-align:middle;padding:4px;min-width:80px;">
            <input class="doc-input" id="${id}" list="stdUserDatalist" value="${_esc(val || '')}" placeholder="이름"
                style="text-align:center;font-weight:700;width:100%;">
        </td>`;
        const signAuthor = nameTd('stdAuthor', std ? (std.author || '') : '');
        const signReviewer = nameTd('stdReviewer', std ? (std.reviewer || '') : '');
        const signApprover = nameTd('stdApprover', std ? (std.approver || '') : '');

        UIUtils.showModal(isEdit ? '수입검사 기준서 편집' : '수입검사 기준서 등록', `
        ${docStyle}
        <!-- 제품 연결 선택 (문서 위) -->
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;padding:8px 12px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;flex-wrap:wrap;">
            <span style="font-size:.82rem;font-weight:700;white-space:nowrap;">제품 연결</span>
            <select class="form-select" id="stdCarFilter" onchange="InjIncomingStdModule._onCarFilterChange()"
                style="width:130px;height:34px;font-size:.82rem;">
                <option value="">-- 차종 선택 --</option>${carOpts}
            </select>
            <select class="form-select" id="stdProductId" onchange="InjIncomingStdModule._onProductChange()"
                style="flex:1;min-width:200px;height:34px;font-size:.82rem;">
                <option value="">${selCarModel ? '-- 사출품명 선택 --' : '← 차종을 먼저 선택하세요'}</option>${prodSel}
            </select>
        </div>

        ${userListHtml}
        <!-- ══ 문서 본체 ══ -->
        <div id="stdDoc">

        <!-- ① 헤더 -->
        <table style="margin-bottom:0;">
            <colgroup>
                <col style="width:58px"><!-- 라벨 -->
                <col style="width:130px"><!-- 값 -->
                <col style="width:auto"><!-- 제목 -->
                <col style="width:26px"><!-- 결재 세로 -->
                <col style="width:88px"><!-- 작성 -->
                <col style="width:88px"><!-- 검토 -->
                <col style="width:88px"><!-- 승인 -->
            </colgroup>
            <tr style="height:20px;">
                <td class="doc-label">공정NO</td>
                <td class="doc-cell" style="text-align:center;font-weight:700;font-size:12px;">10</td>
                <td rowspan="4" class="doc-cell doc-title" style="font-size:20px;letter-spacing:3px;">수입검사 기준서</td>
                <td class="doc-th" style="border-bottom:none;"></td>
                <td class="doc-th">작 성</td>
                <td class="doc-th">검 토</td>
                <td class="doc-th">승 인</td>
            </tr>
            <tr style="height:20px;">
                <td class="doc-label">공정명</td>
                <td class="doc-cell" style="text-align:center;"><input class="doc-input" id="stdProcessName" value="${fv('processName','수입검사')}" style="text-align:center;font-weight:700;"></td>
                <td class="doc-th" rowspan="3" style="writing-mode:vertical-rl;text-align:center;vertical-align:middle;padding:4px 2px;font-size:11px;letter-spacing:3px;border-top:none;">결 재</td>
                ${signAuthor}
                ${signReviewer}
                ${signApprover}
            </tr>
            <tr style="height:20px;">
                <td class="doc-label">차 종</td>
                <td class="doc-cell" style="text-align:center;font-weight:700;"><input class="doc-input" id="stdCarModel" value="${fv('carModel')}" style="text-align:center;font-weight:700;"></td>
            </tr>
            <tr style="height:20px;">
                <td class="doc-label">품 명</td>
                <td class="doc-cell" style="font-weight:700;color:#1d4ed8;text-align:center;"><input class="doc-input" id="stdPartName" value="${fv('partName')}" style="font-weight:700;color:#1d4ed8;text-align:center;"></td>
            </tr>
        </table>
        <!-- hidden 저장용 필드 -->
        <input type="hidden" id="stdRevNo"       value="${fv('revNo','00')}">
        <input type="hidden" id="stdCreatedDate" value="${std?(std.createdDate||''):UIUtils.today()}">
        <input type="hidden" id="stdRevisedDate" value="${fv('revisedDate')}">
        <input type="hidden" id="stdItemType"    value="${fv('itemType')}">

        <!-- ③ 이미지 + 주요검사 Point -->
        <table class="std-split" id="stdSplitTable" style="margin-top:0;table-layout:fixed;width:100%;${_splitHeightStyle}">
            <colgroup><col id="stdSplitLeftCol" style="width:${_esc(_splitLeftWidth)}"><col></colgroup>
            <tr>
                <td class="std-split-left" style="width:${_esc(_splitLeftWidth)};border:1px solid #888;padding:0;height:1px;vertical-align:top;position:relative;">
                    <div class="std-split-handle" title="드래그해서 표 간격 조절"
                        onmousedown="InjIncomingStdModule._stdStartSplitResize(event)"
                        style="position:absolute;top:0;bottom:0;right:-4px;width:8px;cursor:col-resize;z-index:5;"></div>
                    <div class="doc-sec" style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;">
                        <span>외관 / 치수포인트</span>
                        <label style="display:flex;align-items:center;gap:3px;cursor:pointer;font-size:.72rem;font-weight:400;color:#2563eb;white-space:nowrap;">
                            <span class="material-symbols-outlined" style="font-size:14px;">add_photo_alternate</span>
                            <input type="file" accept="image/*" multiple style="display:none;"
                                onchange="InjIncomingStdModule._addImages(this)">
                        </label>
                    </div>
                    <div id="stdImgPasteZone" tabindex="0"
                        onpaste="InjIncomingStdModule._onPaste(event)"
                        onfocus="this.style.outline='2px dashed #2563eb';this.style.outlineOffset='-3px'"
                        onblur="this.style.outline='none'"
                        onclick="this.focus()"
                        style="outline:none;padding:6px;cursor:pointer;display:flex;flex-direction:column;height:calc(100% - 28px);">
                        <div id="stdImgGrid"
                            style="display:grid;grid-template-columns:1fr 1fr;gap:4px;flex:1;align-content:start;">
                            ${_renderImgGrid(_formImages)}
                        </div>
                    </div>
                </td>
                <td class="std-split-right" style="vertical-align:top;border:1px solid #888;padding:0;height:100%;">
                    <div class="doc-sec">주요검사 Point</div>
                    <div>
                    <table class="std-pt-table" id="stdPtTable" style="font-size:10px;width:100%;table-layout:fixed;border-collapse:collapse;">
                        <colgroup>
                            ${_ptColWidths.map((w, i) => `<col id="stdPtCol${i}" style="width:${_esc(w)}">`).join('')}
                        </colgroup>
                        <thead><tr>
                            ${['No','항 목','기 준','확인방법','시 료','관리방안'].map((label, ci) => `
                            <td class="doc-th" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;position:relative;">
                                ${label}
                                <div class="std-pt-col-handle" title="드래그해서 열 폭 조절"
                                    onmousedown="InjIncomingStdModule._stdStartPtColResize(event,${ci})"
                                    style="position:absolute;top:0;bottom:0;right:0;width:7px;cursor:col-resize;z-index:5;"></div>
                            </td>`).join('')}
                            <td class="doc-th" style="text-align:right;">
                                <button type="button" onclick="InjIncomingStdModule._addCheckRow()"
                                    style="background:none;border:none;color:#2563eb;cursor:pointer;font-size:14px;line-height:1;" title="행 추가">+</button>
                            </td>
                        </tr></thead>
                        <tbody id="stdCheckBody">${ptRows}</tbody>
                    </table>
                    </div>
                </td>
            </tr>
        </table>
        <div class="std-split-vresize" title="드래그해서 표 높이 조절"
            onmousedown="InjIncomingStdModule._stdStartSplitVResize(event)"
            style="height:7px;margin:-1px 0;cursor:row-resize;position:relative;z-index:4;"></div>

        <!-- ④ 검사순서 / 조치사항 -->
        <table class="std-bottom" id="stdBottomTable" style="margin-top:0;table-layout:fixed;width:100%;">
            <colgroup><col id="stdBottomLeftCol" style="width:${_esc(_bottomLeftWidth)}"><col></colgroup>
            <tr>
                <td style="vertical-align:top;border:1px solid #888;padding:0;position:relative;">
                    <div class="std-split-handle" title="드래그해서 표 간격 조절"
                        onmousedown="InjIncomingStdModule._stdStartBottomResize(event)"
                        style="position:absolute;top:0;bottom:0;right:-4px;width:8px;cursor:col-resize;z-index:5;"></div>
                    <div class="doc-sec">검 사 순 서</div>
                    <div style="padding:6px;">
                        <textarea id="stdProcedure"
                            oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"
                            style="width:100%;border:none;background:transparent;font-family:'Malgun Gothic',sans-serif;font-size:11px;line-height:1.8;resize:none;overflow:hidden;outline:none;display:block;"
                            >${std?_esc(std.procedure||''):'1. 소재의 표면상태를 검사한다.\n 1-1. 전면 → 후면 순으로 검사한다.\n2. 소재불량은 해당부위 마킹 후 별도의 불량 박스에 보관한다.\n3. 사출품의 표면 장력 Test를 실시한다.\n4. BOX내부에 이물질 유무검사를 실시한다.\n5. 내 포장 상태를 확인한다. (찢어짐등이 없을 것)\n6. 명세표 대비 수량을 확인한다.'}</textarea>
                    </div>
                </td>
                <td style="vertical-align:top;border:1px solid #888;padding:0;height:1px;">
                    ${_stdRightStackHtml('doc-sec', `
                                    <textarea id="stdCorrective"
                                        style="width:100%;height:100%;border:none;background:transparent;font-family:'Malgun Gothic',sans-serif;font-size:11px;line-height:1.8;resize:none;overflow:auto;outline:none;display:block;box-sizing:border-box;">${std?_esc(std.corrective||''):'1. 무결함을 원칙으로 한다.\n2. 불량 발생 시 반품, 선별, 폐기, 특채 의 조치를 취할 수 있다.'}</textarea>
                    `, `
                    <table id="stdRevTable" style="font-size:10px;width:100%;border-collapse:collapse;table-layout:fixed;flex:0 0 auto;">
                        ${_stdRevColgroupHtml(_revDateWidth, true)}
                        <tbody id="stdRevBody">
                        <tr style="height:24px;">
                            <td class="doc-label" rowspan="99" style="writing-mode:vertical-rl;text-align:center;vertical-align:middle;padding:2px;font-size:10px;">개정내용</td>
                            <td class="doc-th" style="white-space:nowrap;">NO</td>
                            <td class="doc-th" style="white-space:nowrap;position:relative;">개정일자
                                <div class="std-pt-col-handle" title="드래그해서 열 폭 조절"
                                    onmousedown="InjIncomingStdModule._stdStartRevDateResize(event)"
                                    style="position:absolute;top:0;bottom:0;right:0;width:7px;cursor:col-resize;z-index:5;"></div>
                            </td>
                            <td class="doc-th">개정사유</td>
                            <td class="doc-th" style="white-space:nowrap;">확 인</td>
                            <td class="doc-th" style="text-align:right;">
                                <button type="button" onclick="InjIncomingStdModule._addRevRow()"
                                    style="background:none;border:none;color:#2563eb;cursor:pointer;font-size:14px;line-height:1;" title="행 추가">+</button>
                            </td>
                        </tr>
                        ${revRows}
                        </tbody>
                    </table>`)}
                </td>
            </tr>
            <tr>
                <td colspan="2" style="border:none;padding:3px 0 0 0;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div style="font-size:9px;color:#555;">
                            문서번호 : <input class="doc-input" id="stdDocNo" value="${fv('docNo')}" placeholder="KC-IT-000"
                                title="문서번호 수정"
                                style="font-size:9px;font-weight:700;width:auto;min-width:9em;max-width:14em;display:inline-block;border-bottom:1px solid #94a3b8;padding:0 2px;">
                        </div>
                        <div style="font-size:9px;color:#888;">(주)케이씨케미칼&nbsp;&nbsp;&nbsp;A4(297×210)</div>
                    </div>
                </td>
            </tr>
        </table>
        </div><!-- /#stdDoc -->
        `, `
            <button class="btn btn-secondary" onclick="InjIncomingStdModule._closeEditModal()">취소</button>
            <button class="btn btn-outline" onclick="InjIncomingStdModule.printStd('${isEdit?std.id:''}')">
                <span class="material-symbols-outlined">print</span> 출력
            </button>
            <button class="btn btn-primary" onclick="InjIncomingStdModule.saveForm('${isEdit?std.id:''}')">저장</button>
        `, 'xl');

        // 모달 렌더 후 초기화
        setTimeout(() => {
            ['stdProcedure'].forEach(id => {
                const el = document.getElementById(id);
                if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
            });
            // confirmer 입력값이 있으면 대각선 제거
            document.querySelectorAll('.std-rev-confirmer').forEach(inp => {
                InjIncomingStdModule._onCfInput(inp);
            });
            // 제품이 선택된 경우 문서 내 차종/품명 동기화
            const selProd = document.getElementById('stdProductId');
            if (selProd && selProd.value) InjIncomingStdModule._onProductChange();
        }, 50);

        // Ctrl+Z: 텍스트 입력 안에서는 네이티브 undo, 그 외엔 뒤로가기 방지
        if (_kbHandler) document.removeEventListener('keydown', _kbHandler);
        _kbHandler = function(e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                const tag = (document.activeElement || {}).tagName;
                const ce  = (document.activeElement || {}).contentEditable;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || ce === 'true') return;
                e.preventDefault();
            }
        };
        document.addEventListener('keydown', _kbHandler);
    }

    function _closeEditModal() {
        if (_kbHandler) { document.removeEventListener('keydown', _kbHandler); _kbHandler = null; }
        UIUtils.closeModal();
    }

    /* ── 이미지 정규화: src 문자열 or {src,h,label} → 객체 ── */
    function _normImg(v) {
        if (typeof v === 'string') return {src:v, h:100, label:''};
        return {src:v.src||'', h:v.h||100, label:v.label||''};
    }

    /* ── 공통 핸들 스타일 ── */
    const _HDL = `position:absolute;width:10px;height:10px;background:#2563eb;border:2px solid #fff;
                  border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,.4);z-index:10;`;

    /* ── 이미지 그리드 렌더 ── */
    function _renderImgGrid(images) {
        if (!images || !images.length) return `
            <div style="grid-column:1/-1;display:flex;flex-direction:column;align-items:center;
                justify-content:center;min-height:150px;color:#bbb;gap:6px;">
                <span class="material-symbols-outlined" style="font-size:32px;">content_paste</span>
                <span style="font-size:.75rem;">클릭 후 Ctrl+V 또는 파일 선택</span>
            </div>`;
        return images.map((img, i) => {
            const o = _normImg(img);
            return `
            <div class="std-img-card" data-idx="${i}" draggable="true"
                ondragstart="InjIncomingStdModule._dragStart(event,${i})"
                ondragover="InjIncomingStdModule._dragOver(event)"
                ondrop="InjIncomingStdModule._dragDrop(event,${i})"
                ondragend="InjIncomingStdModule._dragEnd(event)"
                style="position:relative;border:1px solid #ddd;border-radius:4px;
                       background:#f9f9f9;user-select:none;cursor:grab;">
                <!-- 라벨 -->
                <div style="padding:2px 22px 2px 4px;background:#e8edf2;border-bottom:1px solid #ddd;">
                    <input type="text" value="${_esc(o.label)}" placeholder="라벨 (예: 외관)"
                        onchange="InjIncomingStdModule._updateImgLabel(${i},this.value)"
                        onclick="event.stopPropagation()"
                        style="width:100%;border:none;background:transparent;font-size:10px;outline:none;">
                </div>
                <!-- 이미지 영역 (리사이즈 핸들 포함) -->
                <div class="std-img-wrap" style="position:relative;overflow:visible;">
                    <img src="${o.src}" style="width:100%;height:${o.h}px;object-fit:contain;display:block;background:#fff;">
                    <!-- 4 모서리 리사이즈 핸들 -->
                    <div style="${_HDL}top:-5px;left:-5px;cursor:nw-resize;"
                        onmousedown="event.stopPropagation();InjIncomingStdModule._startResize(event,${i},'nw')"></div>
                    <div style="${_HDL}top:-5px;right:-5px;cursor:ne-resize;"
                        onmousedown="event.stopPropagation();InjIncomingStdModule._startResize(event,${i},'ne')"></div>
                    <div style="${_HDL}bottom:-5px;left:-5px;cursor:sw-resize;"
                        onmousedown="event.stopPropagation();InjIncomingStdModule._startResize(event,${i},'sw')"></div>
                    <div style="${_HDL}bottom:-5px;right:-5px;cursor:se-resize;"
                        onmousedown="event.stopPropagation();InjIncomingStdModule._startResize(event,${i},'se')"></div>
                </div>
                <!-- 삭제 버튼 -->
                <button type="button" onclick="event.stopPropagation();InjIncomingStdModule._removeImage(${i})"
                    style="position:absolute;top:22px;right:2px;background:rgba(220,38,38,.8);border:none;
                    color:#fff;border-radius:50%;width:18px;height:18px;font-size:11px;cursor:pointer;
                    display:flex;align-items:center;justify-content:center;line-height:1;z-index:11;">✕</button>
            </div>`;
        }).join('');
    }

    /* ── drag & drop 변수 ── */
    let _dragIdx = -1;

    function _dragStart(e, idx) {
        _dragIdx = idx;
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.style.opacity = '0.5';
    }
    function _dragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }
    function _dragEnd(e) {
        e.currentTarget.style.opacity = '';
        _dragIdx = -1;
    }
    function _dragDrop(e, toIdx) {
        e.preventDefault();
        if (_dragIdx < 0 || _dragIdx === toIdx) return;
        const imgs = _formImages.map(_normImg);
        const moved = imgs.splice(_dragIdx, 1)[0];
        imgs.splice(toIdx, 0, moved);
        _formImages = imgs;
        const g = document.getElementById('stdImgGrid');
        if (g) g.innerHTML = _renderImgGrid(_formImages);
    }

    function _resizeImg(idx, h) {
        _formImages = _formImages.map(_normImg);
        _formImages[idx].h = Number(h);
        const card = document.querySelectorAll('.std-img-card')[idx];
        if (card) { const im = card.querySelector('img'); if (im) im.style.height = h + 'px'; }
    }

    function _startResize(e, idx, dir) {
        e.preventDefault();
        _formImages = _formImages.map(_normImg);
        const startY = e.clientY;
        const startH = _formImages[idx].h;

        const card = document.querySelectorAll('.std-img-card')[idx];
        const imgEl = card ? card.querySelector('img') : null;

        // 리사이즈 중 드래그 비활성화
        if (card) card.draggable = false;

        function onMove(ev) {
            const dy = dir.includes('s') ? ev.clientY - startY : startY - ev.clientY;
            const newH = Math.max(50, Math.min(400, startH + dy));
            _formImages[idx].h = newH;
            if (imgEl) imgEl.style.height = newH + 'px';
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            if (card) card.draggable = true;
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    function _updateImgLabel(idx, label) {
        _formImages = _formImages.map(_normImg);
        _formImages[idx].label = label;
    }

    function _onPaste(e) {
        e.preventDefault();
        const items = ((e.clipboardData || {}).items) || [];
        Array.from(items).forEach(item => {
            if (!item.type.startsWith('image/')) return;
            const file = item.getAsFile();
            if (!file) return;
            const r = new FileReader();
            r.onload = ev => {
                _formImages = _formImages.map(_normImg);
                _formImages.push({src: ev.target.result, h: 100, label: ''});
                const g = document.getElementById('stdImgGrid');
                if (g) g.innerHTML = _renderImgGrid(_formImages);
            };
            r.readAsDataURL(file);
        });
    }

    function _addImages(input) {
        Array.from(input.files).forEach(file => {
            const r = new FileReader();
            r.onload = e => {
                _formImages = _formImages.map(_normImg);
                _formImages.push({src: e.target.result, h: 100, label: ''});
                const g = document.getElementById('stdImgGrid');
                if (g) g.innerHTML = _renderImgGrid(_formImages);
            };
            r.readAsDataURL(file);
        });
        input.value = '';
    }

    function _removeImage(idx) {
        _formImages = _formImages.map(_normImg);
        _formImages.splice(idx, 1);
        const g = document.getElementById('stdImgGrid');
        if (g) g.innerHTML = _renderImgGrid(_formImages);
    }

    function _onCarFilterChange() {
        const car = (document.getElementById('stdCarFilter')||{}).value || '';
        const sel = document.getElementById('stdProductId');
        if (!sel) return;
        const allMats = (Storage.getAll(PROD_ST)||[]).filter(p=>p.carModel&&p.injPartName);
        const products = Storage.getAll(DB.STORES.PRODUCTS) || [];
        const productsById = {};
        products.forEach(p => { if (p && p.id) productsById[p.id] = p; });
        const filtered = car ? allMats.filter(p=>p.carModel===car) : [];
        sel.innerHTML = `<option value="">${car ? '-- 사출품명 선택 --' : '← 차종을 먼저 선택하세요'}</option>`
            + filtered.map(p=>`<option value="${p.id}"
                data-car="${_esc(p.carModel)}" data-part="${_esc(p.injPartName)}"
                data-color="${_esc(p.injColor||'')}" data-type="${_esc(_stdEffectiveItemType(p, productsById, products))}">
                ${_esc(p.injPartName)}${p.injColor?' / '+_esc(p.injColor):''}
            </option>`).join('');
    }

    function _onProductChange() {
        const sel=document.getElementById('stdProductId');
        if(!sel||!sel.value) return;
        const opt=sel.options[sel.selectedIndex];
        const set=(id,v)=>{const e=document.getElementById(id);if(e)e.value=v;};
        set('stdCarModel', opt.dataset.car||'');
        set('stdPartName', opt.dataset.part||'');
        set('stdItemType', opt.dataset.type||'');
        const docEl=document.getElementById('stdDocNo');
        if(docEl&&!docEl.value){
            const max=(Storage.getAll(STORE)||[]).reduce((m,s)=>{
                const n=parseInt((s.docNo||'').replace(/\D/g,''))||0;return Math.max(m,n);},8);
            docEl.value=`KC-IT-${String(max+1).padStart(3,'0')}`;
        }
    }

    function _addCheckRow() {
        const tb=document.getElementById('stdCheckBody');
        if(!tb) return;
        const n = tb.querySelectorAll('tr.std-pt-row').length;
        const wrap=document.createElement('tbody');
        wrap.innerHTML=_stdCheckRowHtml({}, n);
        while (wrap.firstChild) tb.appendChild(wrap.firstChild);
    }

    function _insertCheckRowAfter(btn) {
        let el = btn;
        while (el && el.tagName !== 'TR') el = el.parentNode;
        if (!el || !el.parentNode) return;
        if (el.classList.contains('std-pt-row') && el.nextElementSibling &&
            el.nextElementSibling.classList.contains('std-pt-row-sizer')) {
            el = el.nextElementSibling;
        }
        const wrap=document.createElement('tbody');
        wrap.innerHTML=_stdCheckRowHtml({}, null);
        const frag = document.createDocumentFragment();
        while (wrap.firstChild) frag.appendChild(wrap.firstChild);
        const parent = el.parentNode;
        const next = el.nextElementSibling;
        if (next) parent.insertBefore(frag, next);
        else parent.appendChild(frag);
    }

    function _removeCheckRow(btn) {
        let el = btn;
        while (el && el.tagName !== 'TR') el = el.parentNode;
        if (!el) return;
        const sizer = el.nextElementSibling;
        el.remove();
        if (sizer && sizer.classList.contains('std-pt-row-sizer')) sizer.remove();
    }

    const _DIAG = 'linear-gradient(to top right,transparent calc(50% - 0.5px),#bbb calc(50% - 0.5px),#bbb calc(50% + 0.5px),transparent calc(50% + 0.5px))';

    function _onCfInput(inp) {
        inp.closest('td').style.background = inp.value.trim() ? 'none' : _DIAG;
    }

    function _makeRevRow(no) {
        const tr = document.createElement('tr');
        tr.style.height = '32px';
        tr.innerHTML = `
            <td style="padding:2px;border:1px solid #bbb;"><input class="std-rev-no" type="text" value="${no}"
                style="width:100%;height:28px;border:none;background:transparent;font-size:10px;text-align:center;"></td>
            <td style="padding:2px;border:1px solid #bbb;"><input class="std-rev-date" type="text"
                style="width:100%;height:28px;border:none;background:transparent;font-size:10px;text-align:center;"></td>
            <td style="padding:2px;border:1px solid #bbb;"><input class="std-rev-reason" type="text"
                style="width:100%;height:28px;border:none;background:transparent;font-size:10px;"></td>
            <td style="padding:0;border:1px solid #bbb;background:${_DIAG};">
                <input class="std-rev-confirmer" type="text" list="stdUserDatalist"
                    style="width:100%;height:32px;border:none;background:transparent;font-size:10px;text-align:center;display:block;"
                    oninput="InjIncomingStdModule._onCfInput(this)">
            </td>
            <td style="padding:2px;border:1px solid #bbb;text-align:right;white-space:nowrap;">
                <button type="button" onclick="InjIncomingStdModule._insertRevRowAfter(this)"
                    style="background:none;border:none;color:#2563eb;cursor:pointer;font-size:14px;line-height:1;" title="아래 행 추가">+</button>
                <button type="button" onclick="this.closest('tr').remove()"
                    style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:14px;line-height:1;" title="행 삭제">×</button>
            </td>`;
        return tr;
    }

    function _addRevRow() {
        const tb = document.getElementById('stdRevBody');
        if (!tb) return;
        // rows.length 에서 헤더 행(index 0) 제외
        const no = String(tb.rows.length - 1).padStart(2,'0');
        tb.appendChild(_makeRevRow(no));
    }

    function _insertRevRowAfter(btn) {
        // closest 대신 parentNode 체인으로 안전하게 tr 탐색
        let el = btn;
        while (el && el.tagName !== 'TR') el = el.parentNode;
        if (!el) return;
        const tbody = el.parentNode;
        if (!tbody) return;
        const newTr = _makeRevRow('');
        const next = el.nextElementSibling;
        if (next) tbody.insertBefore(newTr, next);
        else tbody.appendChild(newTr);
    }

    /* ═══════════════════════════════════════════════════════════════
       저장
    ═══════════════════════════════════════════════════════════════ */
    async function saveForm(editId) {
        const g=id=>(document.getElementById(id)||{}).value||'';
        const productId=g('stdProductId').trim();
        const partName=g('stdPartName').trim();
        if(!productId){UIUtils.toast('제품 연결에서 차종과 품명을 선택하세요.','warning');return;}
        if(!partName){UIUtils.toast('품명을 입력하세요.','warning');return;}

        const checkPoints=[];
        document.querySelectorAll('#stdCheckBody tr.std-pt-row').forEach(tr=>{
            const no=(tr.querySelector('.std-pt-no')||{}).value||'';
            const item=(tr.querySelector('.std-pt-item')||{}).value||'';
            const stdEl=tr.querySelector('.std-pt-std'); const std=stdEl?(stdEl.value!==undefined?stdEl.value:stdEl.innerText||stdEl.textContent||''):'';
            const method=(tr.querySelector('.std-pt-method')||{}).value||'';
            const sample=(tr.querySelector('.std-pt-sample')||{}).value||'';
            const mgmt=(tr.querySelector('.std-pt-mgmt')||{}).value||'';
            const rowHeight=(tr.style.height||'').trim();
            if(item||std) checkPoints.push({no,item,standard:std,method,sample,management:mgmt,rowHeight});
        });

        const revisions=[];
        document.querySelectorAll('#stdRevBody tr').forEach(tr=>{
            const no=(tr.querySelector('.std-rev-no')||{}).value||'';
            const date=(tr.querySelector('.std-rev-date')||{}).value||'';
            const reason=(tr.querySelector('.std-rev-reason')||{}).value||'';
            const confirmer=(tr.querySelector('.std-rev-confirmer')||{}).value||'';
            if(no||reason) revisions.push({no,date,reason,confirmer});
        });

        const data={
            productId,
            docNo:       g('stdDocNo'),
            revNo:       g('stdRevNo'),
            processName: g('stdProcessName')||'수입검사',
            equipment:   g('stdEquipment'),
            carModel:    g('stdCarModel'),
            partName,
            itemType:    _stdNormItemType(g('stdItemType')),
            createdDate: g('stdCreatedDate'),
            revisedDate: g('stdRevisedDate'),
            author:      g('stdAuthor').trim(),
            reviewer:    g('stdReviewer').trim(),
            approver:    g('stdApprover').trim(),
            authorSeal:  _sealForName(g('stdAuthor').trim(), ''),
            reviewerSeal:_sealForName(g('stdReviewer').trim(), ''),
            approverSeal:_sealForName(g('stdApprover').trim(), ''),
            procedure:   g('stdProcedure'),
            corrective:  g('stdCorrective'),
            images:      _formImages.map(_normImg),
            checkPoints,
            revisions,
            layout: {
                splitLeftWidth: (document.getElementById('stdSplitLeftCol') || {}).style.width || '',
                splitHeight: (document.getElementById('stdSplitTable') || {}).style.height || '',
                ptColWidths: [0, 1, 2, 3, 4, 5, 6].map(i => (document.getElementById('stdPtCol' + i) || {}).style.width || ''),
                bottomLeftWidth: (document.getElementById('stdBottomLeftCol') || {}).style.width || '',
                revDateWidth: (document.getElementById('stdRevDateCol') || {}).style.width || ''
            }
        };

        const missingSeal = [
            data.author && !data.authorSeal ? data.author : '',
            data.reviewer && !data.reviewerSeal ? data.reviewer : '',
            data.approver && !data.approverSeal ? data.approver : '',
            ...revisions.filter(r => r.confirmer && !_sealForName(r.confirmer, '')).map(r => r.confirmer)
        ].filter(Boolean);
        // confirmer 중복 제거
        const missingUnique = [...new Set(missingSeal)];

        try {
            if(editId){await Storage.update(STORE,editId,data);}
            else{await Storage.add(STORE,data);}
        } catch (err) {
            UIUtils.toast('저장에 실패했습니다. ' + (err && err.message ? err.message : '다시 시도하세요.'), 'error');
            return;
        }
        if (missingUnique.length) {
            UIUtils.toast(`저장됨. 날인 미등록: ${missingUnique.join(', ')} (설정>사용자에서 날인 등록)`, 'warning');
        } else {
            UIUtils.toast(editId ? '기준서가 수정되었습니다.' : '기준서가 등록되었습니다.', 'success');
        }
        if(_kbHandler){document.removeEventListener('keydown',_kbHandler);_kbHandler=null;}
        UIUtils.closeModal();
        renderList();
    }

    /* ═══════════════════════════════════════════════════════════════
       출력 (원본 양식과 동일)
    ═══════════════════════════════════════════════════════════════ */
    function printStd(id) {
        if(!id){UIUtils.toast('저장 후 출력할 수 있습니다.','info');return;}
        const std=Storage.getById(STORE,id);
        if(!std){UIUtils.toast('기준서를 찾을 수 없습니다.','error');return;}

        // 화면 px → mm 변환 (96dpi 기준: 1px = 0.2646mm)
        const px2mm = px => (Number(px) * 0.2646).toFixed(1);

        const ptRows=(std.checkPoints||[]).map((pt,i)=>`<tr style="${_stdPtRowHeightStyle(pt)}">
            <td style="text-align:center;vertical-align:top;">${_esc(_stdPtNoDisplay(pt,i))}</td>
            <td style="vertical-align:top;white-space:nowrap;">${_esc(pt.item||'')}</td>
            <td style="white-space:pre-wrap;vertical-align:top;">${_esc(pt.standard||'')}</td>
            <td style="text-align:center;vertical-align:top;">${_esc(pt.method||'')}</td>
            <td style="text-align:center;vertical-align:top;">${_esc(pt.sample||'')}</td>
            <td style="vertical-align:top;">${_esc(pt.management||'')}</td></tr>`).join('');

        const imgHtml=(std.images||[]).map(v=>{
            const o=typeof v==='string'?{src:v,h:100,label:''}:{src:v.src||'',h:v.h||100,label:v.label||''};
            const hmm = px2mm(o.h);
            return `<div style="border:1px solid #ccc;padding:2px;">
                ${o.label?`<div style="font-size:9px;font-weight:700;text-align:center;padding:2px 0;background:#e8edf2;">${_esc(o.label)}</div>`:''}
                <img src="${o.src}" style="height:${hmm}mm;max-width:100%;">
            </div>`;
        }).join('');

        const _rawRevsPrint=(std.revisions||[]).filter(r=>!!(r.no||r.reason));
        const revsPrint=_rawRevsPrint.length?_rawRevsPrint:[{no:'00',date:std.createdDate||UIUtils.today(),reason:'최초 작성',confirmer:''}];
        const revRows=revsPrint.map(r=>{
            const cf=r.confirmer||'';
            const diagBg=cf?'':'background:linear-gradient(to top right,transparent calc(50% - 0.5px),#999 calc(50% - 0.5px),#999 calc(50% + 0.5px),transparent calc(50% + 0.5px));';
            return `<tr style="height:30px;">
            <td style="text-align:center;">${_esc(r.no||'')}</td>
            <td style="text-align:center;">${_esc(r.date||'')}</td>
            <td style="text-align:center;">${_esc(r.reason||'')}</td>
            <td style="padding:${cf?'2px':'0'};text-align:center;vertical-align:middle;${diagBg}">${cf ? _confirmerView(cf) : ''}</td></tr>`;}).join('');

        const _pLayout = _stdReadLayout(std);
        const _pPtCols = _stdScale6ColWidths(_pLayout.ptColWidths);
        const _pSplitLeft = _pLayout.splitLeftWidth;
        const _pBottomLeft = _pLayout.bottomLeftWidth;
        const _pRevDate = _pLayout.revDateWidth;

        const win=window.open('','_blank','width=960,height=720');
        win.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
        <title>수입검사 기준서 — ${_esc(std.partName||'')}</title>
        <style>
            @page{size:A4 landscape;margin:8mm;}
            *{box-sizing:border-box;margin:0;padding:0;}
            html,body{width:281mm;font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:10px;color:#111;}
            table{border-collapse:collapse;width:100%;table-layout:fixed;}
            th,td{border:1px solid #555;padding:3px 5px;vertical-align:middle;overflow:hidden;}
            .doc-th{background:#d0e4f7;font-weight:700;text-align:center;}
            .doc-sec{background:#d0e4f7;font-weight:700;text-align:center;font-size:11px;padding:4px;}
            .doc-label{background:#f0f0f0;font-weight:700;text-align:center;white-space:nowrap;}
            .doc-title{font-size:18px;font-weight:900;text-align:center;letter-spacing:2px;}
            img{display:block;width:100%;object-fit:contain;background:#fff;}
            img.std-seal{width:auto;display:inline-block;background:transparent;}
            .std-corrective-stack{height:100%;}
            .std-corrective-body{white-space:pre-wrap;}
            @media print{html,body{width:281mm;}}
        </style></head><body>
        <!-- 헤더 -->
        <table>
            <colgroup>
                <col style="width:56px"><col style="width:128px">
                <col style="width:auto">
                <col style="width:24px">
                <col style="width:88px"><col style="width:88px"><col style="width:88px">
            </colgroup>
            <tr style="height:20px;">
                <td class="doc-label">공정NO</td>
                <td style="text-align:center;font-weight:700;font-size:12px;">10</td>
                <td rowspan="4" class="doc-title" style="font-size:20px;letter-spacing:3px;">수입검사 기준서</td>
                <td class="doc-th" style="border-bottom:none;"></td>
                <td class="doc-th">작 성</td>
                <td class="doc-th">검 토</td>
                <td class="doc-th">승 인</td>
            </tr>
            <tr style="height:20px;">
                <td class="doc-label">공정명</td>
                <td style="text-align:center;font-weight:700;">${_esc(std.processName||'수입검사')}</td>
                <td class="doc-th" rowspan="3" style="writing-mode:vertical-rl;text-align:center;vertical-align:middle;padding:4px 2px;font-size:11px;letter-spacing:3px;border-top:none;">결 재</td>
                <td rowspan="3" style="text-align:center;vertical-align:middle;padding:2px;">${_signView(std.author, std.authorSeal)}</td>
                <td rowspan="3" style="text-align:center;vertical-align:middle;padding:2px;">${_signView(std.reviewer, std.reviewerSeal)}</td>
                <td rowspan="3" style="text-align:center;vertical-align:middle;padding:2px;">${_signView(std.approver, std.approverSeal)}</td>
            </tr>
            <tr style="height:20px;">
                <td class="doc-label">차 종</td>
                <td style="text-align:center;font-weight:700;">${_esc(std.carModel||'')}</td>
            </tr>
            <tr style="height:20px;">
                <td class="doc-label">품 명</td>
                <td style="font-weight:700;color:#1d4ed8;text-align:center;">${_esc(std.partName||'')}</td>
            </tr>
        </table>
        <!-- 이미지 + 주요검사 -->
        <table style="margin-top:0;table-layout:fixed;">
            <colgroup><col style="width:${_esc(_pSplitLeft)}"><col></colgroup>
            <tr>
                <td style="width:${_esc(_pSplitLeft)};vertical-align:top;padding:0;">
                    <div class="doc-sec">외관 / 치수포인트</div>
                    <div style="padding:4px;display:grid;grid-template-columns:${(std.images||[]).length>1?'1fr 1fr':'1fr'};gap:4px;align-items:start;">
                        ${imgHtml||'<div style="text-align:center;padding:20px;color:#aaa;">이미지 없음</div>'}
                    </div>
                </td>
                <td style="vertical-align:top;padding:0;">
                    <div class="doc-sec">주요검사 Point</div>
                    <table style="font-size:10px;width:100%;table-layout:fixed;">
                        <colgroup>${_pPtCols.map(w => `<col style="width:${_esc(w)}">`).join('')}</colgroup>
                        <thead><tr>
                            <th class="doc-th" style="white-space:nowrap;">No</th>
                            <th class="doc-th" style="white-space:nowrap;">항 목</th>
                            <th class="doc-th">기 준</th>
                            <th class="doc-th" style="white-space:nowrap;">확인방법</th>
                            <th class="doc-th" style="white-space:nowrap;">시 료</th>
                            <th class="doc-th" style="white-space:nowrap;">관리방안</th>
                        </tr></thead>
                        <tbody>${ptRows}</tbody>
                    </table>
                </td>
            </tr>
        </table>
        <!-- 검사순서 / 조치사항 -->
        <table style="margin-top:0;table-layout:fixed;">
            <colgroup><col style="width:${_esc(_pBottomLeft)}"><col></colgroup>
            <tr>
                <td style="vertical-align:top;padding:0;">
                    <div class="doc-sec">검 사 순 서</div>
                    <div style="padding:6px;white-space:pre-wrap;line-height:1.8;font-size:11px;">${_esc(std.procedure||'')}</div>
                </td>
                <td style="vertical-align:top;padding:0;height:1px;">
                    ${_stdRightStackHtml('doc-sec', _esc(std.corrective||''), `
                    <table style="font-size:10px;width:100%;border-collapse:collapse;table-layout:fixed;flex:0 0 auto;">
                        ${_stdRevColgroupHtml(_pRevDate, false)}
                        <tr style="height:24px;">
                            <td class="doc-label" rowspan="99" style="writing-mode:vertical-rl;text-align:center;vertical-align:middle;padding:2px;">개정내용</td>
                            <th class="doc-th" style="white-space:nowrap;">NO</th>
                            <th class="doc-th" style="white-space:nowrap;">개정일자</th>
                            <th class="doc-th">개정사유</th>
                            <th class="doc-th" style="white-space:nowrap;">확 인</th>
                        </tr>
                        ${revRows}
                    </table>`)}
                </td>
            </tr>
            <tr>
                <td colspan="2" style="border:none;padding:3px 0 0 0;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div style="font-size:9px;color:#555;">문서번호 : <strong>${_esc(std.docNo||'')}</strong></div>
                        <div style="font-size:9px;color:#888;">(주)케이씨케미칼&nbsp;&nbsp;&nbsp;A4(297×210)</div>
                    </div>
                </td>
            </tr>
        </table>
        <script>window.onload=function(){window.print();}<\/script>
        </body></html>`);
        win.document.close();
    }

    function _stdCanWrite() {
        if (typeof AuthModule === 'undefined' || typeof AuthModule.canWritePage !== 'function') return true;
        return AuthModule.canWritePage('inj-incoming-std');
    }

    function _stdDocNoEditHtml(std) {
        const id = std && std.id ? String(std.id) : '';
        if (id && _stdCanWrite()) {
            return `문서번호 : <input class="doc-input" value="${_esc(std.docNo||'')}" placeholder="KC-IT-000"
                title="문서번호 수정 후 Enter 또는 다른 곳 클릭 시 저장"
                style="font-size:9px;font-weight:700;width:auto;min-width:9em;max-width:14em;display:inline-block;border-bottom:1px solid #94a3b8;padding:0 2px;background:transparent;"
                onblur="InjIncomingStdModule.updateDocNo('${_esc(id)}', this.value)"
                onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">`;
        }
        return `문서번호 : <strong>${_esc((std && std.docNo) || '')}</strong>`;
    }

    async function updateDocNo(id, value) {
        if (!_stdCanWrite()) {
            UIUtils.toast('문서번호를 수정할 권한이 없습니다.', 'warning');
            renderList();
            return;
        }
        const std = Storage.getById(STORE, id);
        if (!std) return;
        const docNo = String(value == null ? '' : value).trim();
        if (docNo === String(std.docNo || '').trim()) return;
        try {
            await Storage.update(STORE, id, { docNo });
            UIUtils.toast('문서번호가 저장되었습니다.', 'success');
            renderList();
        } catch (err) {
            UIUtils.toast('저장에 실패했습니다. ' + (err && err.message ? err.message : '다시 시도하세요.'), 'error');
            renderList();
        }
    }

    async function deleteStd(id) {
        if (!_stdCanWrite()) {
            UIUtils.toast('기준서를 삭제할 권한이 없습니다.', 'warning');
            return;
        }
        const std = Storage.getById(STORE, id);
        if (!std) {
            UIUtils.toast('기준서를 찾을 수 없습니다.', 'error');
            return;
        }
        const label = [std.carModel, std.partName, std.docNo].filter(Boolean).join(' | ') || id;
        UIUtils.confirm(
            `'${label}' 수입검사 기준서를 삭제하시겠습니까? 삭제하면 미등록 상태가 됩니다.`,
            async () => {
                try {
                    await Storage.remove(STORE, id);
                    const ov = document.getElementById('_injStdViewOv');
                    if (ov) ov.remove();
                    UIUtils.closeModal();
                    UIUtils.toast('기준서가 삭제되었습니다.', 'success');
                    renderList();
                } catch (err) {
                    UIUtils.toast('삭제에 실패했습니다. ' + (err && err.message ? err.message : '다시 시도하세요.'), 'error');
                }
            }
        );
    }

    // 외관/치수포인트(좌) ↔ 주요검사 Point(우) 표 사이 간격을 마우스 드래그로 조절
    function _stdStartSplitResize(e) {
        e.preventDefault();
        e.stopPropagation();
        const col = document.getElementById('stdSplitLeftCol');
        const td = document.querySelector('#stdDoc .std-split-left');
        const table = document.getElementById('stdSplitTable');
        if (!col || !table) return;
        const startX = e.clientX;
        const tableWidth = table.getBoundingClientRect().width || 1;
        const startW = _stdStartWidthPx(col, tableWidth, tableWidth * 0.5);
        _stdBindDocDrag(ev => {
            const dx = ev.clientX - startX;
            const newW = Math.max(180, Math.min(tableWidth - 180, startW + dx));
            col.style.width = newW + 'px';
            if (td) td.style.width = newW + 'px';
        });
    }

    // 외관/치수포인트·주요검사 Point 표 블록 전체의 높이를 아래로 드래그해 조절
    function _stdStartSplitVResize(e) {
        e.preventDefault();
        e.stopPropagation();
        const table = document.getElementById('stdSplitTable');
        if (!table) return;
        const startY = e.clientY;
        const startH = table.getBoundingClientRect().height;
        _stdBindDocDrag(ev => {
            const dy = ev.clientY - startY;
            const newH = Math.max(120, Math.min(1200, startH + dy));
            table.style.height = newH + 'px';
        });
    }

    // 검사순서 ↔ 조치사항/개정이력 표 사이 경계를 마우스로 조절
    function _stdStartBottomResize(e) {
        e.preventDefault();
        e.stopPropagation();
        const col = document.getElementById('stdBottomLeftCol');
        const table = document.getElementById('stdBottomTable');
        if (!col || !table) return;
        const startX = e.clientX;
        const tableWidth = table.getBoundingClientRect().width || 1;
        const startW = _stdStartWidthPx(col, tableWidth, tableWidth * 0.5);
        _stdBindDocDrag(ev => {
            const dx = ev.clientX - startX;
            const newW = Math.max(80, Math.min(tableWidth - 80, startW + dx));
            col.style.width = newW + 'px';
        });
    }

    // 주요검사 Point 표 열 경계를 마우스로 조절. 이 열만 늘리면 표 폭이 커지므로
    // 옆 열에서 같은 비율을 빼 합 100%를 유지한다.
    function _stdStartPtColResize(e, colIndex) {
        e.preventDefault();
        e.stopPropagation();
        const col = document.getElementById('stdPtCol' + colIndex);
        const nextCol = document.getElementById('stdPtCol' + (colIndex + 1));
        const table = document.getElementById('stdPtTable');
        if (!col || !nextCol || !table) return;
        const tableWidth = table.getBoundingClientRect().width || 1;
        const startX = e.clientX;
        const startColPct = parseFloat(col.style.width) || 10;
        const startNextPct = parseFloat(nextCol.style.width) || 10;
        const minPct = 3;
        _stdBindDocDrag(ev => {
            let dPct = ((ev.clientX - startX) / tableWidth) * 100;
            dPct = Math.max(minPct - startColPct, Math.min(startNextPct - minPct, dPct));
            col.style.width = (startColPct + dPct) + '%';
            nextCol.style.width = (startNextPct - dPct) + '%';
        });
    }

    // 개정내용 표의 개정일자 열 폭을 마우스로 조절 (개정사유 열이 나머지를 차지)
    function _stdStartRevDateResize(e) {
        e.preventDefault();
        e.stopPropagation();
        const col = document.getElementById('stdRevDateCol');
        if (!col) return;
        const startX = e.clientX;
        const startW = parseInt(col.style.width, 10) || parseInt(_STD_REV_DATE_W, 10) || 88;
        _stdBindDocDrag(ev => {
            const dx = ev.clientX - startX;
            const newW = Math.max(72, Math.min(180, startW + dx));
            col.style.width = newW + 'px';
        });
    }

    // 주요검사 Point 행 높이를 아래 경계 드래그로 조절
    function _stdStartPtRowResize(e) {
        e.preventDefault();
        e.stopPropagation();
        let sizer = e.currentTarget;
        while (sizer && sizer.tagName !== 'TR') sizer = sizer.parentNode;
        if (!sizer) return;
        let tr = sizer.previousElementSibling;
        while (tr && !tr.classList.contains('std-pt-row')) tr = tr.previousElementSibling;
        if (!tr) return;
        const startY = e.clientY;
        const startH = tr.getBoundingClientRect().height;
        const stdEl = tr.querySelector('.std-pt-std');
        _stdBindDocDrag(ev => {
            const newH = Math.max(22, Math.min(420, startH + (ev.clientY - startY)));
            tr.style.height = newH + 'px';
            if (stdEl) {
                const inner = Math.max(16, newH - 10);
                stdEl.style.minHeight = inner + 'px';
                stdEl.style.maxHeight = inner + 'px';
            }
        });
    }

    /* ═══════════════════════════════════════════════════════════════
       PUBLIC
    ═══════════════════════════════════════════════════════════════ */
    return {
        init, render, renderList,
        openNewForm, openNewFormForProduct, openViewForm, openViewFormOverlay, openEditForm,
        saveForm, printStd, updateDocNo, deleteStd,
        _stdStartSplitResize, _stdStartSplitVResize, _stdStartPtColResize, _stdStartBottomResize,
        _stdStartRevDateResize, _stdStartPtRowResize,
        _onCarFilterChange, _onProductChange, _onPaste,
        _dragStart, _dragOver, _dragEnd, _dragDrop,
        _startResize, _resizeImg, _updateImgLabel,
        _addCheckRow, _insertCheckRowAfter, _removeCheckRow, _addRevRow, _insertRevRowAfter,
        _addImages, _removeImage, _closeEditModal, _onCfInput
    };
})();
