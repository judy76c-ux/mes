/**
 * 수입검사 기준서 모듈 (InjIncomingStdModule)
 * 사출 수입검사 기준서 — 원본 양식과 동일한 레이아웃으로 편집/출력
 */
var InjIncomingStdModule = (function () {
    const STORE   = DB.STORES.INJ_INCOMING_STD;
    const PROD_ST = DB.STORES.INJECTION_MATERIALS;

    const _esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    let _formImages = [];   // 편집 중 이미지 배열

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

        const allProds = (Storage.getAll(PROD_ST)||[])
            .filter(p=>p.carModel && p.injPartName)
            .map(p=>({...p, partName:p.injPartName, color:p.injColor||''}));

        const allStds = Storage.getAll(STORE)||[];
        const stdMap  = {};
        allStds.forEach(s=>{stdMap[s.productId]=s;});

        let rows = allProds.filter(p=>{
            if (carFilter  && p.carModel!==carFilter) return false;
            if (typeFilter && (p.itemType||'')!==typeFilter) return false;
            if (kw && !(p.partName||'').toLowerCase().includes(kw) && !(p.carModel||'').toLowerCase().includes(kw)) return false;
            const has=!!stdMap[p.id];
            if (regFilter==='등록' && !has) return false;
            if (regFilter==='미등록' && has) return false;
            return true;
        });

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

        const IC={'양산품':'#059669','A/S품':'#d97706','개발품':'#7c3aed'};
        tbody.innerHTML=rows.map((p,i)=>{
            const std=stdMap[p.id],has=!!std;
            const it=p.itemType||'',itC=IC[it]||'#6b7280';
            const itB=it?`<span style="font-size:.72rem;font-weight:700;padding:2px 8px;border-radius:999px;background:${itC}22;color:${itC};border:1px solid ${itC}44;">${it}</span>`:'-';
            const regB=has
                ?`<span style="font-size:.72rem;font-weight:700;padding:2px 8px;border-radius:999px;background:#dcfce7;color:#16a34a;border:1px solid #86efac;">✓ 등록</span>`
                :`<span style="font-size:.72rem;font-weight:700;padding:2px 8px;border-radius:999px;background:#fef9c3;color:#d97706;border:1px solid #fde047;">미등록</span>`;
            return `<tr>
                <td>${i+1}</td>
                <td><strong>${_esc(p.carModel)}</strong></td>
                <td>${_esc(p.partName)}</td>
                <td>${_esc(p.color||'-')}</td>
                <td style="text-align:center;">${itB}</td>
                <td style="text-align:center;">${regB}</td>
                <td style="font-family:monospace;font-size:.8rem;">${has?_esc(std.docNo||'-'):'-'}</td>
                <td style="text-align:center;">${has?_esc(std.revNo||'00'):'-'}</td>
                <td>${has?_esc(std.createdDate||'-'):'-'}</td>
                <td style="text-align:center;white-space:nowrap;">
                    ${has
                        ?`<button class="btn btn-sm btn-outline" onclick="InjIncomingStdModule.openEditForm('${std.id}')">편집</button>
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

    /* ── 기본 10개 검사항목 ── */
    const DEFAULT_POINTS = [
        {item:'외관',      standard:'BURR, 이물, 흠, SINK MARK 없을 것',                  method:'육안',    sample:'10EA/LOT', management:'수입검사 성적서'},
        {item:'치수',      standard:'도면 규격 이내',                                      method:'V/C',     sample:'5EA/LOT',  management:''},
        {item:'표면장력',  standard:'TEST 시약이 물방울 형태로 맺히지 않을 것',            method:'육안',    sample:'1EA/LOT',  management:''},
        {item:'내포장상태',standard:'포장 BOX 내부에 이물없을 것\n내부 포장비닐등의 찢어짐이 없을 것', method:'육안', sample:'3Box/LOT', management:''},
        {item:'포장·수량', standard:'포장사양, 명세표대비 현품 동일할 것',                 method:'육안',    sample:'BOX',      management:'포장사양서'},
        {},{},{},{},{}
    ];

    function _openForm(std, prod) {
        const isEdit = !!std;
        const g = k => std ? (std[k]||'') : (prod ? (prod[k]||prod['injPartName']||prod['injColor']||'') : '');

        // 필드값 헬퍼
        const fv = (field, fallback='') => _esc(std ? (std[field]||fallback) : fallback);

        // 제품 select — 차종/사출품명 2단계 필터
        const allMats = (Storage.getAll(PROD_ST)||[]).filter(p=>p.carModel&&p.injPartName);
        const selectedMat = std && std.productId ? allMats.find(p=>p.id===std.productId) : null;
        const selCarModel = selectedMat ? selectedMat.carModel : '';
        const carList = [...new Set(allMats.map(p=>p.carModel))].sort();
        const carOpts = carList.map(c=>`<option value="${_esc(c)}" ${selCarModel===c?'selected':''}>${_esc(c)}</option>`).join('');
        const partMats = selCarModel ? allMats.filter(p=>p.carModel===selCarModel) : [];
        const prodSel = partMats.map(p=>`<option value="${p.id}"
            ${std&&std.productId===p.id?'selected':''}
            data-car="${_esc(p.carModel)}" data-part="${_esc(p.injPartName)}"
            data-color="${_esc(p.injColor||'')}" data-type="${_esc(p.itemType||'')}">
            ${_esc(p.injPartName)}${p.injColor?' / '+_esc(p.injColor):''}
        </option>`).join('');

        // 검사 항목 행
        const pts = std ? (std.checkPoints||[]) : DEFAULT_POINTS;
        const ptRows = pts.map((pt,i)=>`<tr>
            <td style="text-align:center;padding:3px;border:1px solid #bbb;font-size:.8rem;">${i+1}</td>
            <td style="padding:2px;border:1px solid #bbb;"><input class="std-pt-item" type="text" value="${_esc(pt.item||'')}"
                style="width:100%;border:none;background:transparent;font-size:.8rem;padding:2px;"></td>
            <td style="padding:2px;border:1px solid #bbb;"><textarea class="std-pt-std" rows="2"
                style="width:100%;border:none;background:transparent;font-size:.78rem;padding:2px;resize:none;line-height:1.4;">${_esc(pt.standard||'')}</textarea></td>
            <td style="padding:2px;border:1px solid #bbb;"><input class="std-pt-method" type="text" value="${_esc(pt.method||'')}"
                style="width:100%;border:none;background:transparent;font-size:.78rem;padding:2px;"></td>
            <td style="padding:2px;border:1px solid #bbb;"><input class="std-pt-sample" type="text" value="${_esc(pt.sample||'')}"
                style="width:100%;border:none;background:transparent;font-size:.78rem;padding:2px;"></td>
            <td style="padding:2px;border:1px solid #bbb;"><input class="std-pt-mgmt" type="text" value="${_esc(pt.management||'')}"
                style="width:100%;border:none;background:transparent;font-size:.78rem;padding:2px;"></td>
            <td style="padding:2px;border:1px solid #bbb;text-align:center;">
                <button type="button" onclick="InjIncomingStdModule._insertCheckRowAfter(this)"
                    style="background:none;border:none;color:#2563eb;cursor:pointer;font-size:14px;line-height:1;" title="아래 행 추가">+</button>
                <button type="button" onclick="this.closest('tr').remove()"
                    style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:14px;line-height:1;" title="행 삭제">×</button>
            </td></tr>`).join('');

        // 개정이력 행
        const revs = std ? (std.revisions||[{no:'00',date:std.createdDate||'',reason:'최초 작성',confirmer:''}])
                         : [{no:'00',date:UIUtils.today(),reason:'최초 작성',confirmer:''}];
        const revRows = revs.map(r=>`<tr>
            <td style="padding:2px;border:1px solid #bbb;text-align:center;"><input class="std-rev-no" type="text" value="${_esc(r.no||'')}"
                style="width:38px;border:none;background:transparent;font-size:.78rem;text-align:center;"></td>
            <td style="padding:2px;border:1px solid #bbb;"><input class="std-rev-date" type="text" value="${_esc(r.date||'')}"
                style="width:80px;border:none;background:transparent;font-size:.78rem;"></td>
            <td style="padding:2px;border:1px solid #bbb;"><input class="std-rev-reason" type="text" value="${_esc(r.reason||'')}"
                style="width:100%;border:none;background:transparent;font-size:.78rem;"></td>
            <td style="padding:2px;border:1px solid #bbb;"></td>
            <td style="padding:2px;border:1px solid #bbb;text-align:center;">
                <button type="button" onclick="InjIncomingStdModule._insertRevRowAfter(this)"
                    style="background:none;border:none;color:#2563eb;cursor:pointer;font-size:14px;line-height:1;" title="아래 행 추가">+</button>
                <button type="button" onclick="this.closest('tr').remove()"
                    style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:14px;line-height:1;" title="행 삭제">×</button>
            </td></tr>`).join('');

        // 이미지 목록 초기화
        _formImages = std ? [...(std.images||[])] : [];

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
            </style>`;

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

        <!-- ══ 문서 본체 ══ -->
        <div id="stdDoc">

        <!-- ① 헤더 -->
        <table style="margin-bottom:0;">
            <colgroup>
                <col style="width:58px"><!-- 라벨 -->
                <col style="width:130px"><!-- 값 -->
                <col style="width:auto"><!-- 제목 -->
                <col style="width:26px"><!-- 결재 세로 -->
                <col style="width:80px"><!-- 작성 -->
                <col style="width:80px"><!-- 검토 -->
                <col style="width:80px"><!-- 승인 -->
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
                <td class="doc-cell" rowspan="3" style="text-align:center;vertical-align:middle;"><input class="doc-input" id="stdAuthor" value="${fv('author')}" style="text-align:center;"></td>
                <td class="doc-cell" rowspan="3" style="text-align:center;vertical-align:middle;"><input class="doc-input" id="stdReviewer" value="${fv('reviewer')}" style="text-align:center;"></td>
                <td class="doc-cell" rowspan="3" style="text-align:center;vertical-align:middle;"><input class="doc-input" id="stdApprover" value="${fv('approver')}" style="text-align:center;"></td>
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
        <table style="margin-top:0;">
            <tr>
                <!-- 이미지 영역 -->
                <td style="width:50%;vertical-align:top;border:1px solid #888;padding:6px;">
                    <div style="text-align:center;font-weight:700;font-size:11px;margin-bottom:4px;">외관 / 치수포인트</div>
                    <div id="stdImgGrid" style="display:grid;grid-template-columns:1fr 1fr;gap:4px;min-height:160px;">
                        ${_renderImgGrid(_formImages)}
                    </div>
                    <div style="margin-top:6px;display:flex;align-items:center;gap:6px;">
                        <label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:.75rem;color:#2563eb;white-space:nowrap;">
                            <span class="material-symbols-outlined" style="font-size:16px;">add_photo_alternate</span> 이미지 추가
                            <input type="file" accept="image/*" multiple style="display:none;" onchange="InjIncomingStdModule._addImages(this)">
                        </label>
                    </div>
                </td>
                <!-- 주요검사 Point -->
                <td style="width:50%;vertical-align:top;border:1px solid #888;padding:0;">
                    <div class="doc-sec">주요검사 Point</div>
                    <table style="font-size:10px;">
                        <thead><tr>
                            <td class="doc-th" style="width:24px;">No</td>
                            <td class="doc-th" style="width:65px;">항 목</td>
                            <td class="doc-th">기 준</td>
                            <td class="doc-th" style="width:50px;">확인방법</td>
                            <td class="doc-th" style="width:65px;">시 료</td>
                            <td class="doc-th" style="width:70px;">관리방안</td>
                            <td class="doc-th" style="width:22px;">
                                <button type="button" onclick="InjIncomingStdModule._addCheckRow()"
                                    style="background:none;border:none;color:#2563eb;cursor:pointer;font-size:14px;line-height:1;" title="행 추가">+</button>
                            </td>
                        </tr></thead>
                        <tbody id="stdCheckBody">${ptRows}</tbody>
                    </table>
                </td>
            </tr>
        </table>

        <!-- ④ 검사순서 / 조치사항 -->
        <table style="margin-top:0;">
            <tr>
                <td style="width:50%;vertical-align:top;border:1px solid #888;padding:0;">
                    <div class="doc-sec">검 사 순 서</div>
                    <div style="padding:6px;">
                        <textarea id="stdProcedure" style="width:100%;border:none;background:transparent;font-family:'Malgun Gothic',sans-serif;font-size:11px;line-height:1.8;resize:none;min-height:120px;outline:none;"
                            >${std?_esc(std.procedure||''):'1. 소재의 표면상태를 검사한다.\n 1-1. 전면 → 후면 순으로 검사한다.\n2. 소재불량은 해당부위 마킹 후 별도의 불량 박스에 보관한다.\n3. 사출품의 표면 장력 Test를 실시한다.\n4. BOX내부에 이물질 유무검사를 실시한다.\n5. 내 포장 상태를 확인한다. (찢어짐등이 없을 것)\n6. 명세표 대비 수량을 확인한다.'}</textarea>
                    </div>
                </td>
                <td style="width:50%;vertical-align:top;border:1px solid #888;padding:0;">
                    <div class="doc-sec">조 치 사 항</div>
                    <div style="padding:6px;">
                        <textarea id="stdCorrective" style="width:100%;border:none;background:transparent;font-family:'Malgun Gothic',sans-serif;font-size:11px;line-height:1.8;resize:none;min-height:70px;outline:none;"
                            >${std?_esc(std.corrective||''):'1. 무결함을 원칙으로 한다.\n2. 불량 발생 시 반품, 선별, 폐기, 특채 의 조치를 취할 수 있다.'}</textarea>
                    </div>
                    <!-- 개정내용 -->
                    <table style="margin-top:4px;font-size:10px;">
                        <thead><tr>
                            <td class="doc-label" rowspan="${revs.length+2}" style="writing-mode:vertical-rl;width:20px;padding:4px 2px;font-size:10px;">개정내용</td>
                            <td class="doc-th" style="width:32px;">NO</td>
                            <td class="doc-th" style="width:80px;">개정일자</td>
                            <td class="doc-th">개정사유</td>
                            <td class="doc-th" style="width:50px;">확 인</td>
                            <td class="doc-th" style="width:22px;">
                                <button type="button" onclick="InjIncomingStdModule._addRevRow()"
                                    style="background:none;border:none;color:#2563eb;cursor:pointer;font-size:14px;line-height:1;" title="행 추가">+</button>
                            </td>
                        </tr></thead>
                        <tbody id="stdRevBody">${revRows}</tbody>
                    </table>
                </td>
            </tr>
        </table>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px;">
            <div style="font-size:9px;color:#555;">
                문서번호 : <input class="doc-input" id="stdDocNo" value="${fv('docNo')}" placeholder="KC-IT-000"
                    style="font-size:9px;font-weight:700;width:80px;display:inline-block;">
            </div>
            <div style="font-size:9px;color:#888;">(주)케이씨케미칼&nbsp;&nbsp;&nbsp;A4(297×210)</div>
        </div>
        </div><!-- /#stdDoc -->
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-outline" onclick="InjIncomingStdModule.printStd('${isEdit?std.id:''}')">
                <span class="material-symbols-outlined">print</span> 출력
            </button>
            <button class="btn btn-primary" onclick="InjIncomingStdModule.saveForm('${isEdit?std.id:''}')">저장</button>
        `, 'xl');
    }

    /* ── 이미지 그리드 렌더 ── */
    function _renderImgGrid(images) {
        if(!images||!images.length) return `<div style="grid-column:1/-1;display:flex;align-items:center;justify-content:center;
            min-height:150px;border:2px dashed #ccc;border-radius:6px;color:#bbb;font-size:.8rem;">이미지를 추가하세요</div>`;
        return images.map((src,i)=>`
            <div style="position:relative;border:1px solid #ddd;border-radius:4px;overflow:hidden;background:#f9f9f9;">
                <img src="${src}" style="width:100%;height:100px;object-fit:cover;display:block;">
                <button type="button" onclick="InjIncomingStdModule._removeImage(${i})"
                    style="position:absolute;top:2px;right:2px;background:rgba(220,38,38,.8);border:none;color:#fff;border-radius:50%;
                    width:18px;height:18px;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;">✕</button>
            </div>`).join('');
    }

    function _addImages(input) {
        Array.from(input.files).forEach(file=>{
            const r=new FileReader();
            r.onload=e=>{
                _formImages.push(e.target.result);
                const g=document.getElementById('stdImgGrid');
                if(g) g.innerHTML=_renderImgGrid(_formImages);
            };
            r.readAsDataURL(file);
        });
        input.value='';
    }

    function _removeImage(idx) {
        _formImages.splice(idx,1);
        const g=document.getElementById('stdImgGrid');
        if(g) g.innerHTML=_renderImgGrid(_formImages);
    }

    function _onCarFilterChange() {
        const car = (document.getElementById('stdCarFilter')||{}).value || '';
        const sel = document.getElementById('stdProductId');
        if (!sel) return;
        const allMats = (Storage.getAll(PROD_ST)||[]).filter(p=>p.carModel&&p.injPartName);
        const filtered = car ? allMats.filter(p=>p.carModel===car) : [];
        sel.innerHTML = `<option value="">${car ? '-- 사출품명 선택 --' : '← 차종을 먼저 선택하세요'}</option>`
            + filtered.map(p=>`<option value="${p.id}"
                data-car="${_esc(p.carModel)}" data-part="${_esc(p.injPartName)}"
                data-color="${_esc(p.injColor||'')}" data-type="${_esc(p.itemType||'')}">
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
        const i=tb.rows.length+1;
        const tr=document.createElement('tr');
        tr.innerHTML=`
            <td style="text-align:center;padding:3px;border:1px solid #bbb;font-size:.8rem;">${i}</td>
            <td style="padding:2px;border:1px solid #bbb;"><input class="std-pt-item" type="text"
                style="width:100%;border:none;background:transparent;font-size:.8rem;padding:2px;"></td>
            <td style="padding:2px;border:1px solid #bbb;"><textarea class="std-pt-std" rows="2"
                style="width:100%;border:none;background:transparent;font-size:.78rem;padding:2px;resize:none;"></textarea></td>
            <td style="padding:2px;border:1px solid #bbb;text-align:center;"><input class="std-pt-method" type="text"
                style="width:100%;border:none;background:transparent;font-size:.78rem;padding:2px;"></td>
            <td style="padding:2px;border:1px solid #bbb;text-align:center;"><input class="std-pt-sample" type="text"
                style="width:100%;border:none;background:transparent;font-size:.78rem;padding:2px;"></td>
            <td style="padding:2px;border:1px solid #bbb;"><input class="std-pt-mgmt" type="text"
                style="width:100%;border:none;background:transparent;font-size:.78rem;padding:2px;"></td>
            <td style="padding:2px;border:1px solid #bbb;text-align:center;">
                <button type="button" onclick="InjIncomingStdModule._insertCheckRowAfter(this)"
                    style="background:none;border:none;color:#2563eb;cursor:pointer;font-size:14px;line-height:1;" title="아래 행 추가">+</button>
                <button type="button" onclick="this.closest('tr').remove()"
                    style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:14px;line-height:1;" title="행 삭제">×</button>
            </td>`;
        tb.appendChild(tr);
    }

    function _insertCheckRowAfter(btn) {
        let el = btn;
        while (el && el.tagName !== 'TR') el = el.parentNode;
        if (!el) return;
        const tbody = el.parentNode;
        const newTr = document.createElement('tr');
        newTr.innerHTML = `
            <td style="text-align:center;padding:3px;border:1px solid #bbb;font-size:.8rem;">-</td>
            <td style="padding:2px;border:1px solid #bbb;"><input class="std-pt-item" type="text"
                style="width:100%;border:none;background:transparent;font-size:.8rem;padding:2px;"></td>
            <td style="padding:2px;border:1px solid #bbb;"><textarea class="std-pt-std" rows="2"
                style="width:100%;border:none;background:transparent;font-size:.78rem;padding:2px;resize:none;"></textarea></td>
            <td style="padding:2px;border:1px solid #bbb;"><input class="std-pt-method" type="text"
                style="width:100%;border:none;background:transparent;font-size:.78rem;padding:2px;"></td>
            <td style="padding:2px;border:1px solid #bbb;"><input class="std-pt-sample" type="text"
                style="width:100%;border:none;background:transparent;font-size:.78rem;padding:2px;"></td>
            <td style="padding:2px;border:1px solid #bbb;"><input class="std-pt-mgmt" type="text"
                style="width:100%;border:none;background:transparent;font-size:.78rem;padding:2px;"></td>
            <td style="padding:2px;border:1px solid #bbb;text-align:center;">
                <button type="button" onclick="InjIncomingStdModule._insertCheckRowAfter(this)"
                    style="background:none;border:none;color:#2563eb;cursor:pointer;font-size:14px;line-height:1;" title="아래 행 추가">+</button>
                <button type="button" onclick="this.closest('tr').remove()"
                    style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:14px;line-height:1;" title="행 삭제">×</button>
            </td>`;
        const next = el.nextElementSibling;
        if (next) tbody.insertBefore(newTr, next);
        else tbody.appendChild(newTr);
    }

    function _makeRevRow(no) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="padding:2px;border:1px solid #bbb;text-align:center;"><input class="std-rev-no" type="text" value="${no}"
                style="width:38px;border:none;background:transparent;font-size:.78rem;text-align:center;"></td>
            <td style="padding:2px;border:1px solid #bbb;"><input class="std-rev-date" type="text"
                style="width:80px;border:none;background:transparent;font-size:.78rem;"></td>
            <td style="padding:2px;border:1px solid #bbb;"><input class="std-rev-reason" type="text"
                style="width:100%;border:none;background:transparent;font-size:.78rem;"></td>
            <td style="padding:2px;border:1px solid #bbb;"></td>
            <td style="padding:2px;border:1px solid #bbb;text-align:center;">
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
        tb.appendChild(_makeRevRow(String(tb.rows.length).padStart(2,'0')));
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
        const partName=g('stdPartName');
        if(!partName){UIUtils.toast('품명을 입력하세요.','warning');return;}

        const checkPoints=[];
        document.querySelectorAll('#stdCheckBody tr').forEach(tr=>{
            const item=(tr.querySelector('.std-pt-item')||{}).value||'';
            const std=(tr.querySelector('.std-pt-std')||{}).value||'';
            const method=(tr.querySelector('.std-pt-method')||{}).value||'';
            const sample=(tr.querySelector('.std-pt-sample')||{}).value||'';
            const mgmt=(tr.querySelector('.std-pt-mgmt')||{}).value||'';
            if(item||std) checkPoints.push({item,standard:std,method,sample,management:mgmt});
        });

        const revisions=[];
        document.querySelectorAll('#stdRevBody tr').forEach(tr=>{
            const no=(tr.querySelector('.std-rev-no')||{}).value||'';
            const date=(tr.querySelector('.std-rev-date')||{}).value||'';
            const reason=(tr.querySelector('.std-rev-reason')||{}).value||'';
            if(no||reason) revisions.push({no,date,reason,confirmer:''});
        });

        const data={
            productId:   g('stdProductId'),
            docNo:       g('stdDocNo'),
            revNo:       g('stdRevNo'),
            processName: g('stdProcessName')||'수입검사',
            equipment:   g('stdEquipment'),
            carModel:    g('stdCarModel'),
            partName,
            itemType:    g('stdItemType'),
            createdDate: g('stdCreatedDate'),
            revisedDate: g('stdRevisedDate'),
            author:      g('stdAuthor'),
            reviewer:    g('stdReviewer'),
            approver:    g('stdApprover'),
            procedure:   g('stdProcedure'),
            corrective:  g('stdCorrective'),
            images:      [..._formImages],
            checkPoints,
            revisions
        };

        if(editId){await Storage.update(STORE,editId,data);UIUtils.toast('기준서가 수정되었습니다.','success');}
        else{await Storage.add(STORE,data);UIUtils.toast('기준서가 등록되었습니다.','success');}
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

        const ptRows=(std.checkPoints||[]).map((pt,i)=>`<tr>
            <td style="text-align:center;">${i+1}</td>
            <td>${_esc(pt.item||'')}</td>
            <td style="white-space:pre-wrap;">${_esc(pt.standard||'')}</td>
            <td style="text-align:center;">${_esc(pt.method||'')}</td>
            <td style="text-align:center;">${_esc(pt.sample||'')}</td>
            <td>${_esc(pt.management||'')}</td></tr>`).join('');

        const imgHtml=(std.images||[]).map((src,i)=>`
            <div style="border:1px solid #ccc;padding:2px;">
                <img src="${src}" style="width:100%;height:110px;object-fit:cover;display:block;">
            </div>`).join('');

        const revRows=(std.revisions||[]).map(r=>`<tr>
            <td style="text-align:center;">${_esc(r.no||'')}</td>
            <td style="text-align:center;">${_esc(r.date||'')}</td>
            <td>${_esc(r.reason||'')}</td>
            <td style="text-align:center;">${_esc(r.confirmer||'')}</td></tr>`).join('');

        const win=window.open('','_blank','width=960,height=720');
        win.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
        <title>수입검사 기준서 — ${_esc(std.partName||'')}</title>
        <style>
            *{box-sizing:border-box;margin:0;padding:0;}
            body{font-family:'Malgun Gothic','맑은 고딕',sans-serif;font-size:11px;padding:12mm 8mm;color:#111;}
            table{border-collapse:collapse;width:100%;}
            th,td{border:1px solid #555;padding:4px 5px;vertical-align:middle;}
            .doc-th{background:#d0e4f7;font-weight:700;text-align:center;}
            .doc-sec{background:#d0e4f7;font-weight:700;text-align:center;font-size:12px;padding:5px;}
            .doc-label{background:#f0f0f0;font-weight:700;text-align:center;white-space:nowrap;}
            .doc-title{font-size:20px;font-weight:900;text-align:center;letter-spacing:2px;}
            @media print{body{padding:0;} @page{size:A4 landscape;}}
        </style></head><body>
        <!-- 헤더 -->
        <table>
            <colgroup>
                <col style="width:56px"><col style="width:128px">
                <col style="width:auto">
                <col style="width:24px">
                <col style="width:78px"><col style="width:78px"><col style="width:78px">
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
                <td rowspan="3" style="text-align:center;vertical-align:middle;">${_esc(std.author||'')}</td>
                <td rowspan="3" style="text-align:center;vertical-align:middle;">${_esc(std.reviewer||'')}</td>
                <td rowspan="3" style="text-align:center;vertical-align:middle;">${_esc(std.approver||'')}</td>
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
        <table style="margin-top:0;">
            <tr>
                <td style="width:50%;vertical-align:top;padding:6px;">
                    <div style="font-weight:700;text-align:center;margin-bottom:4px;">외관 / 치수포인트</div>
                    <div style="display:grid;grid-template-columns:${(std.images||[]).length>2?'1fr 1fr':'1fr'};gap:4px;">
                        ${imgHtml||'<div style="text-align:center;padding:30px;color:#aaa;">이미지 없음</div>'}
                    </div>
                </td>
                <td style="width:50%;vertical-align:top;padding:0;">
                    <div class="doc-sec">주요검사 Point</div>
                    <table style="font-size:10px;">
                        <thead><tr>
                            <th class="doc-th" style="width:22px;">No</th>
                            <th class="doc-th" style="width:62px;">항 목</th>
                            <th class="doc-th">기 준</th>
                            <th class="doc-th" style="width:48px;">확인방법</th>
                            <th class="doc-th" style="width:65px;">시 료</th>
                            <th class="doc-th" style="width:70px;">관리방안</th>
                        </tr></thead>
                        <tbody>${ptRows}</tbody>
                    </table>
                </td>
            </tr>
        </table>
        <!-- 검사순서 / 조치사항 -->
        <table style="margin-top:0;">
            <tr>
                <td style="width:40%;vertical-align:top;padding:0;">
                    <div class="doc-sec">검 사 순 서</div>
                    <div style="padding:8px;white-space:pre-wrap;line-height:1.8;font-size:11px;">${_esc(std.procedure||'')}</div>
                </td>
                <td style="width:50%;vertical-align:top;padding:0;">
                    <div class="doc-sec">조 치 사 항</div>
                    <div style="padding:8px;white-space:pre-wrap;line-height:1.8;font-size:11px;">${_esc(std.corrective||'')}</div>
                    <table style="font-size:10px;margin-top:6px;">
                        <tr>
                            <td class="doc-label" rowspan="${(std.revisions||[]).length+2}" style="writing-mode:vertical-rl;width:20px;padding:4px 2px;">개정내용</td>
                            <th class="doc-th" style="width:32px;">NO</th>
                            <th class="doc-th" style="width:80px;">개정일자</th>
                            <th class="doc-th">개정사유</th>
                            <th class="doc-th" style="width:50px;">확 인</th>
                        </tr>
                        ${revRows}
                    </table>
                </td>
            </tr>
        </table>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
            <div style="font-size:9px;color:#555;">문서번호 : <strong>${_esc(std.docNo||'')}</strong></div>
            <div style="font-size:9px;color:#888;">(주)케이씨케미칼&nbsp;&nbsp;&nbsp;A4(297×210)</div>
        </div>
        <script>window.onload=function(){window.print();}<\/script>
        </body></html>`);
        win.document.close();
    }

    /* ═══════════════════════════════════════════════════════════════
       PUBLIC
    ═══════════════════════════════════════════════════════════════ */
    return {
        init, render, renderList,
        openNewForm, openNewFormForProduct, openEditForm,
        saveForm, printStd,
        _onCarFilterChange, _onProductChange, _addCheckRow, _insertCheckRowAfter, _addRevRow, _insertRevRowAfter,
        _addImages, _removeImage
    };
})();
