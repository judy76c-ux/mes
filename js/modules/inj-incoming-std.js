/**
 * 수입검사 기준서 모듈 (InjIncomingStdModule)
 * 사출 수입검사 기준서 — 원본 양식과 동일한 레이아웃으로 편집/출력
 */
var InjIncomingStdModule = (function () {
    const STORE   = DB.STORES.INJ_INCOMING_STD;
    const PROD_ST = DB.STORES.INJECTION_MATERIALS;

    const _esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

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
        const ptRows = (std.checkPoints||[]).map((pt,i) => `<tr>
            <td style="text-align:center;padding:3px;border:1px solid #bbb;font-size:10px;">${i+1}</td>
            <td style="padding:4px;border:1px solid #bbb;font-size:10px;">${_esc(pt.item||'')}</td>
            <td style="padding:4px;border:1px solid #bbb;font-size:10px;white-space:pre-wrap;">${_esc(pt.standard||'')}</td>
            <td style="padding:4px;border:1px solid #bbb;font-size:10px;text-align:center;">${_esc(pt.method||'')}</td>
            <td style="padding:4px;border:1px solid #bbb;font-size:10px;text-align:center;">${_esc(pt.sample||'')}</td>
            <td style="padding:4px;border:1px solid #bbb;font-size:10px;">${_esc(pt.management||'')}</td>
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

        UIUtils.showModal('수입검사 기준서 보기', `
        <style>
            #stdViewDoc { font-family:'Malgun Gothic','맑은 고딕',sans-serif; font-size:11px; color:#111; }
            #stdViewDoc table { border-collapse:collapse; width:100%; }
            #stdViewDoc td, #stdViewDoc th { border:1px solid #888; padding:3px 6px; vertical-align:middle; }
            #stdViewDoc .dth { background:#d0e4f7; font-weight:700; text-align:center; }
            #stdViewDoc .dlb { background:#f0f0f0; font-weight:700; text-align:center; white-space:nowrap; }
            #stdViewDoc .dsec { background:#d0e4f7; font-weight:700; text-align:center; padding:5px; font-size:12px; }
            #stdViewDoc .dtitle { font-size:20px; font-weight:900; text-align:center; letter-spacing:3px; }
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
            <table style="margin-top:0;">
                <colgroup><col style="width:50%"><col style="width:50%"></colgroup>
                <tr>
                    <td style="vertical-align:top;padding:0;">
                        <div class="dsec">외관 / 치수포인트</div>
                        <div style="padding:6px;display:grid;grid-template-columns:${imgs.length>1?'1fr 1fr':'1fr'};gap:4px;">${imgHtml}</div>
                    </td>
                    <td style="vertical-align:top;padding:0;">
                        <div class="dsec">주요검사 Point</div>
                        <table style="font-size:10px;">
                            <thead><tr>
                                <td class="dth" style="width:24px;">No</td>
                                <td class="dth" style="width:65px;">항 목</td>
                                <td class="dth">기 준</td>
                                <td class="dth" style="width:50px;">확인방법</td>
                                <td class="dth" style="width:65px;">시 료</td>
                                <td class="dth" style="width:70px;">관리방안</td>
                            </tr></thead>
                            <tbody>${ptRows}</tbody>
                        </table>
                    </td>
                </tr>
            </table>
            <!-- 검사순서 / 조치사항 -->
            <table style="margin-top:0;width:100%;">
                <colgroup><col style="width:50%"><col style="width:50%"></colgroup>
                <tr>
                    <td style="vertical-align:top;padding:0;">
                        <div class="dsec">검 사 순 서</div>
                        <div style="padding:8px;white-space:pre-wrap;font-size:11px;line-height:1.8;">${_esc(std.procedure||'')}</div>
                    </td>
                    <td style="vertical-align:top;padding:0;height:1px;">
                        <table style="font-size:10px;width:100%;border-collapse:collapse;height:100%;">
                            <colgroup><col style="width:20px"><col style="width:28px"><col style="width:72px"><col><col style="width:72px"></colgroup>
                            <tr>
                                <td colspan="5" class="dsec">조 치 사 항</td>
                            </tr>
                            <tr>
                                <td colspan="5" style="padding:8px;white-space:pre-wrap;font-size:11px;line-height:1.8;vertical-align:top;">${_esc(std.corrective||'')}</td>
                            </tr>
                            <tr style="height:24px;">
                                <td class="dlb" rowspan="99" style="writing-mode:vertical-rl;text-align:center;vertical-align:middle;padding:2px;font-size:10px;">개정내용</td>
                                <td class="dth">NO</td>
                                <td class="dth">개정일자</td>
                                <td class="dth">개정사유</td>
                                <td class="dth">확 인</td>
                            </tr>
                            ${revRows}
                        </table>
                    </td>
                </tr>
                <tr>
                    <td colspan="2" style="border:none;padding:3px 0 0 0;">
                        <div style="display:flex;justify-content:space-between;font-size:9px;color:#888;">
                            <span style="color:#555;">문서번호 : <strong>${_esc(std.docNo||'')}</strong></span>
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
        `, 'xl');
    }

    /* 수입검사 기준서를 별도 오버레이로 보기 (등록 모달 위에 표시) */
    function openViewFormOverlay(id) {
        const std = Storage.getById(STORE, id);
        if (!std) { UIUtils.toast('기준서를 찾을 수 없습니다.', 'error'); return; }

        const old = document.getElementById('_injStdViewOv');
        if (old) old.remove();

        const ptRows = (std.checkPoints||[]).map((pt,i) => `<tr>
            <td style="text-align:center;padding:3px;border:1px solid #bbb;font-size:10px;">${i+1}</td>
            <td style="padding:4px;border:1px solid #bbb;font-size:10px;">${_esc(pt.item||'')}</td>
            <td style="padding:4px;border:1px solid #bbb;font-size:10px;white-space:pre-wrap;">${_esc(pt.standard||'')}</td>
            <td style="padding:4px;border:1px solid #bbb;font-size:10px;text-align:center;">${_esc(pt.method||'')}</td>
            <td style="padding:4px;border:1px solid #bbb;font-size:10px;text-align:center;">${_esc(pt.sample||'')}</td>
            <td style="padding:4px;border:1px solid #bbb;font-size:10px;">${_esc(pt.management||'')}</td>
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
                    <table style="margin-top:0;">
                        <colgroup><col style="width:50%"><col style="width:50%"></colgroup>
                        <tr>
                            <td style="vertical-align:top;padding:0;">
                                <div class="dsec">외관 / 치수포인트</div>
                                <div style="padding:6px;display:grid;grid-template-columns:${imgs.length>1?'1fr 1fr':'1fr'};gap:4px;">${imgHtml}</div>
                            </td>
                            <td style="vertical-align:top;padding:0;">
                                <div class="dsec">주요검사 Point</div>
                                <table style="font-size:10px;">
                                    <thead><tr>
                                        <td class="dth" style="width:24px;">No</td>
                                        <td class="dth" style="width:65px;">항 목</td>
                                        <td class="dth">기 준</td>
                                        <td class="dth" style="width:50px;">확인방법</td>
                                        <td class="dth" style="width:65px;">시 료</td>
                                        <td class="dth" style="width:70px;">관리방안</td>
                                    </tr></thead>
                                    <tbody>${ptRows}</tbody>
                                </table>
                            </td>
                        </tr>
                    </table>
                    <table style="margin-top:0;width:100%;">
                        <colgroup><col style="width:50%"><col style="width:50%"></colgroup>
                        <tr>
                            <td style="vertical-align:top;padding:0;">
                                <div class="dsec">검 사 순 서</div>
                                <div style="padding:8px;white-space:pre-wrap;font-size:11px;line-height:1.8;">${_esc(std.procedure||'')}</div>
                            </td>
                            <td style="vertical-align:top;padding:0;height:1px;">
                                <table style="font-size:10px;width:100%;border-collapse:collapse;height:100%;">
                                    <colgroup><col style="width:20px"><col style="width:28px"><col style="width:72px"><col><col style="width:72px"></colgroup>
                                    <tr>
                                        <td colspan="5" class="dsec">조 치 사 항</td>
                                    </tr>
                                    <tr>
                                        <td colspan="5" style="padding:8px;white-space:pre-wrap;font-size:11px;line-height:1.8;vertical-align:top;">${_esc(std.corrective||'')}</td>
                                    </tr>
                                    <tr style="height:24px;">
                                        <td class="dlb" rowspan="99" style="writing-mode:vertical-rl;text-align:center;vertical-align:middle;padding:2px;font-size:10px;">개정내용</td>
                                        <td class="dth">NO</td>
                                        <td class="dth">개정일자</td>
                                        <td class="dth">개정사유</td>
                                        <td class="dth">확 인</td>
                                    </tr>
                                    ${revRows}
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td colspan="2" style="border:none;padding:3px 0 0 0;">
                                <div style="display:flex;justify-content:space-between;font-size:9px;color:#888;">
                                    <span style="color:#555;">문서번호 : <strong>${_esc(std.docNo||'')}</strong></span>
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
            <td style="text-align:center;padding:3px;border:1px solid #bbb;font-size:10px;">${i+1}</td>
            <td style="padding:2px;border:1px solid #bbb;"><input class="std-pt-item" type="text" value="${_esc(pt.item||'')}"
                style="width:100%;border:none;background:transparent;font-size:10px;padding:2px;"></td>
            <td style="padding:4px 2px;border:1px solid #bbb;"><div class="std-pt-std" contenteditable="true"
                style="width:100%;border:none;background:transparent;font-size:10px;padding:2px;line-height:1.5;outline:none;white-space:pre-wrap;min-height:1.5em;">${_esc(pt.standard||'')}</div></td>
            <td style="padding:2px;border:1px solid #bbb;"><input class="std-pt-method" type="text" value="${_esc(pt.method||'')}"
                style="width:100%;border:none;background:transparent;font-size:10px;padding:2px;"></td>
            <td style="padding:2px;border:1px solid #bbb;"><input class="std-pt-sample" type="text" value="${_esc(pt.sample||'')}"
                style="width:100%;border:none;background:transparent;font-size:10px;padding:2px;"></td>
            <td style="padding:2px;border:1px solid #bbb;"><input class="std-pt-mgmt" type="text" value="${_esc(pt.management||'')}"
                style="width:100%;border:none;background:transparent;font-size:10px;padding:2px;"></td>
            <td style="padding:2px;border:1px solid #bbb;text-align:right;white-space:nowrap;">
                <button type="button" onclick="InjIncomingStdModule._insertCheckRowAfter(this)"
                    style="background:none;border:none;color:#2563eb;cursor:pointer;font-size:14px;line-height:1;" title="아래 행 추가">+</button>
                <button type="button" onclick="this.closest('tr').remove()"
                    style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:14px;line-height:1;" title="행 삭제">×</button>
            </td></tr>`).join('');

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
        <table style="margin-top:0;">
            <tr>
                <!-- 이미지 영역 -->
                <td style="width:50%;border:1px solid #888;padding:0;height:1px;">
                    <div class="doc-sec" style="display:flex;align-items:center;justify-content:space-between;padding:5px 8px;">
                        <span>외관 / 치수포인트</span>
                        <label style="display:flex;align-items:center;gap:3px;cursor:pointer;
                                      font-size:.72rem;font-weight:400;color:#2563eb;white-space:nowrap;">
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
                        style="outline:none;padding:6px;cursor:pointer;
                               display:flex;flex-direction:column;height:calc(100% - 28px);">
                        <!-- 이미지 그리드: flex-grow로 남은 공간 채움 -->
                        <div id="stdImgGrid"
                            style="display:grid;grid-template-columns:1fr 1fr;gap:4px;flex:1;align-content:start;">
                            ${_renderImgGrid(_formImages)}
                        </div>
                    </div>
                </td>
                <!-- 주요검사 Point -->
                <td style="width:50%;vertical-align:top;border:1px solid #888;padding:0;height:100%;">
                    <div class="doc-sec">주요검사 Point</div>
                    <table style="font-size:10px;">
                        <thead><tr>
                            <td class="doc-th" style="width:24px;">No</td>
                            <td class="doc-th" style="width:65px;">항 목</td>
                            <td class="doc-th">기 준</td>
                            <td class="doc-th" style="width:50px;">확인방법</td>
                            <td class="doc-th" style="width:65px;">시 료</td>
                            <td class="doc-th" style="width:70px;">관리방안</td>
                            <td class="doc-th" style="width:44px;text-align:right;">
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
                        <textarea id="stdProcedure"
                            oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"
                            style="width:100%;border:none;background:transparent;font-family:'Malgun Gothic',sans-serif;font-size:11px;line-height:1.8;resize:none;overflow:hidden;outline:none;display:block;"
                            >${std?_esc(std.procedure||''):'1. 소재의 표면상태를 검사한다.\n 1-1. 전면 → 후면 순으로 검사한다.\n2. 소재불량은 해당부위 마킹 후 별도의 불량 박스에 보관한다.\n3. 사출품의 표면 장력 Test를 실시한다.\n4. BOX내부에 이물질 유무검사를 실시한다.\n5. 내 포장 상태를 확인한다. (찢어짐등이 없을 것)\n6. 명세표 대비 수량을 확인한다.'}</textarea>
                    </div>
                </td>
                <td style="width:50%;vertical-align:top;border:1px solid #888;padding:0;height:1px;">
                    <table style="font-size:10px;width:100%;border-collapse:collapse;height:100%;">
                        <colgroup><col style="width:20px"><col style="width:28px"><col style="width:72px"><col><col style="width:72px"><col style="width:44px"></colgroup>
                        <tbody>
                        <tr>
                            <td colspan="6" style="padding:0;border:none;">
                                <div class="doc-sec">조 치 사 항</div>
                                <div style="padding:6px;">
                                    <textarea id="stdCorrective"
                                        oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"
                                        style="width:100%;border:none;background:transparent;font-family:'Malgun Gothic',sans-serif;font-size:11px;line-height:1.8;resize:none;overflow:hidden;outline:none;display:block;"
                                        >${std?_esc(std.corrective||''):'1. 무결함을 원칙으로 한다.\n2. 불량 발생 시 반품, 선별, 폐기, 특채 의 조치를 취할 수 있다.'}</textarea>
                                </div>
                            </td>
                        </tr>
                        </tbody>
                        <!-- 개정내용 -->
                        <tbody id="stdRevBody">
                        <tr style="height:24px;">
                            <td class="doc-label" rowspan="99" style="writing-mode:vertical-rl;text-align:center;vertical-align:middle;padding:2px;font-size:10px;">개정내용</td>
                            <td class="doc-th">NO</td>
                            <td class="doc-th">개정일자</td>
                            <td class="doc-th">개정사유</td>
                            <td class="doc-th">확 인</td>
                            <td class="doc-th" style="text-align:right;">
                                <button type="button" onclick="InjIncomingStdModule._addRevRow()"
                                    style="background:none;border:none;color:#2563eb;cursor:pointer;font-size:14px;line-height:1;" title="행 추가">+</button>
                            </td>
                        </tr>
                        ${revRows}
                        </tbody>
                    </table>
                </td>
            </tr>
            <tr>
                <td colspan="2" style="border:none;padding:3px 0 0 0;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div style="font-size:9px;color:#555;">
                            문서번호 : <input class="doc-input" id="stdDocNo" value="${fv('docNo')}" placeholder="KC-IT-000"
                                style="font-size:9px;font-weight:700;width:80px;display:inline-block;">
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
            ['stdProcedure','stdCorrective'].forEach(id => {
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
            <td style="padding:4px 2px;border:1px solid #bbb;"><div class="std-pt-std" contenteditable="true"
                style="width:100%;border:none;background:transparent;font-size:.78rem;padding:2px;line-height:1.5;outline:none;white-space:pre-wrap;min-height:1.5em;"></div></td>
            <td style="padding:2px;border:1px solid #bbb;text-align:center;"><input class="std-pt-method" type="text"
                style="width:100%;border:none;background:transparent;font-size:.78rem;padding:2px;"></td>
            <td style="padding:2px;border:1px solid #bbb;text-align:center;"><input class="std-pt-sample" type="text"
                style="width:100%;border:none;background:transparent;font-size:.78rem;padding:2px;"></td>
            <td style="padding:2px;border:1px solid #bbb;"><input class="std-pt-mgmt" type="text"
                style="width:100%;border:none;background:transparent;font-size:.78rem;padding:2px;"></td>
            <td style="padding:2px;border:1px solid #bbb;text-align:right;white-space:nowrap;">
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
            <td style="padding:4px 2px;border:1px solid #bbb;"><div class="std-pt-std" contenteditable="true"
                style="width:100%;border:none;background:transparent;font-size:.78rem;padding:2px;line-height:1.5;outline:none;white-space:pre-wrap;min-height:1.5em;"></div></td>
            <td style="padding:2px;border:1px solid #bbb;"><input class="std-pt-method" type="text"
                style="width:100%;border:none;background:transparent;font-size:.78rem;padding:2px;"></td>
            <td style="padding:2px;border:1px solid #bbb;"><input class="std-pt-sample" type="text"
                style="width:100%;border:none;background:transparent;font-size:.78rem;padding:2px;"></td>
            <td style="padding:2px;border:1px solid #bbb;"><input class="std-pt-mgmt" type="text"
                style="width:100%;border:none;background:transparent;font-size:.78rem;padding:2px;"></td>
            <td style="padding:2px;border:1px solid #bbb;text-align:right;white-space:nowrap;">
                <button type="button" onclick="InjIncomingStdModule._insertCheckRowAfter(this)"
                    style="background:none;border:none;color:#2563eb;cursor:pointer;font-size:14px;line-height:1;" title="아래 행 추가">+</button>
                <button type="button" onclick="this.closest('tr').remove()"
                    style="background:none;border:none;color:#dc2626;cursor:pointer;font-size:14px;line-height:1;" title="행 삭제">×</button>
            </td>`;
        const next = el.nextElementSibling;
        if (next) tbody.insertBefore(newTr, next);
        else tbody.appendChild(newTr);
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
        const partName=g('stdPartName');
        if(!partName){UIUtils.toast('품명을 입력하세요.','warning');return;}

        const checkPoints=[];
        document.querySelectorAll('#stdCheckBody tr').forEach(tr=>{
            const item=(tr.querySelector('.std-pt-item')||{}).value||'';
            const stdEl=tr.querySelector('.std-pt-std'); const std=stdEl?(stdEl.value!==undefined?stdEl.value:stdEl.innerText||stdEl.textContent||''):'';
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
            const confirmer=(tr.querySelector('.std-rev-confirmer')||{}).value||'';
            if(no||reason) revisions.push({no,date,reason,confirmer});
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
            revisions
        };

        const missingSeal = [
            data.author && !data.authorSeal ? data.author : '',
            data.reviewer && !data.reviewerSeal ? data.reviewer : '',
            data.approver && !data.approverSeal ? data.approver : '',
            ...revisions.filter(r => r.confirmer && !_sealForName(r.confirmer, '')).map(r => r.confirmer)
        ].filter(Boolean);
        // confirmer 중복 제거
        const missingUnique = [...new Set(missingSeal)];

        if(editId){await Storage.update(STORE,editId,data);}
        else{await Storage.add(STORE,data);}
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

        const ptRows=(std.checkPoints||[]).map((pt,i)=>`<tr>
            <td style="text-align:center;">${i+1}</td>
            <td>${_esc(pt.item||'')}</td>
            <td style="white-space:pre-wrap;">${_esc(pt.standard||'')}</td>
            <td style="text-align:center;">${_esc(pt.method||'')}</td>
            <td style="text-align:center;">${_esc(pt.sample||'')}</td>
            <td>${_esc(pt.management||'')}</td></tr>`).join('');

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
            <colgroup><col style="width:50%"><col style="width:50%"></colgroup>
            <tr>
                <td style="vertical-align:top;padding:0;">
                    <div class="doc-sec">외관 / 치수포인트</div>
                    <div style="padding:4px;display:grid;grid-template-columns:${(std.images||[]).length>1?'1fr 1fr':'1fr'};gap:4px;align-items:start;">
                        ${imgHtml||'<div style="text-align:center;padding:20px;color:#aaa;">이미지 없음</div>'}
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
        <table style="margin-top:0;table-layout:fixed;">
            <colgroup><col style="width:50%"><col style="width:50%"></colgroup>
            <tr>
                <td style="vertical-align:top;padding:0;">
                    <div class="doc-sec">검 사 순 서</div>
                    <div style="padding:8px;white-space:pre-wrap;line-height:1.8;font-size:11px;">${_esc(std.procedure||'')}</div>
                </td>
                <td style="vertical-align:top;padding:0;height:1px;">
                    <table style="font-size:10px;width:100%;border-collapse:collapse;height:100%;">
                                    <colgroup><col style="width:20px"><col style="width:28px"><col style="width:72px"><col><col style="width:72px"></colgroup>
                        <tr>
                            <td colspan="5" class="doc-sec">조 치 사 항</td>
                        </tr>
                        <tr>
                            <td colspan="5" style="padding:8px;white-space:pre-wrap;line-height:1.8;font-size:11px;vertical-align:top;">${_esc(std.corrective||'')}</td>
                        </tr>
                        <tr style="height:24px;">
                            <td class="doc-label" rowspan="99" style="writing-mode:vertical-rl;text-align:center;vertical-align:middle;padding:2px;">개정내용</td>
                            <th class="doc-th">NO</th>
                            <th class="doc-th">개정일자</th>
                            <th class="doc-th">개정사유</th>
                            <th class="doc-th">확 인</th>
                        </tr>
                        ${revRows}
                    </table>
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

    /* ═══════════════════════════════════════════════════════════════
       PUBLIC
    ═══════════════════════════════════════════════════════════════ */
    return {
        init, render, renderList,
        openNewForm, openNewFormForProduct, openViewForm, openViewFormOverlay, openEditForm,
        saveForm, printStd,
        _onCarFilterChange, _onProductChange, _onPaste,
        _dragStart, _dragOver, _dragEnd, _dragDrop,
        _startResize, _resizeImg, _updateImgLabel,
        _addCheckRow, _insertCheckRowAfter, _addRevRow, _insertRevRowAfter,
        _addImages, _removeImage, _closeEditModal, _onCfInput
    };
})();
