/**
 * MES 운영 게시판 (BoardModule)
 * - 오류·문제점 보고
 * - 텍스트 + 스크린샷 첨부
 * - 답글 기능
 */
var BoardModule = (function () {
    'use strict';

    const ST_POST  = DB.STORES.BOARD_POSTS;
    const ST_REPLY = DB.STORES.BOARD_REPLIES;

    const CATEGORY_LIST = ['오류 보고', '개선 요청', '문의', '기타'];
    const CAT_COLOR = {
        '오류 보고':  { bg:'#fee2e2', text:'#dc2626', border:'#fca5a5' },
        '개선 요청':  { bg:'#fef3c7', text:'#d97706', border:'#fcd34d' },
        '문의':       { bg:'#dbeafe', text:'#2563eb', border:'#93c5fd' },
        '기타':       { bg:'#f1f5f9', text:'#64748b', border:'#cbd5e1' }
    };

    let _filterCat = '';
    let _filterKw  = '';

    // ── 렌더 ──────────────────────────────────────────────────────────
    function render(container) {
        container.innerHTML = `
        <div class="fade-in-up">
            <div class="page-header">
                <div class="page-header-left">
                    <h2 style="margin:0;font-size:1.15rem;font-weight:700;">
                        <span class="material-symbols-outlined" style="vertical-align:middle;margin-right:6px;color:var(--accent-blue);">forum</span>
                        MES 운영 게시판
                    </h2>
                    <p style="margin:4px 0 0;font-size:0.82rem;color:var(--text-secondary);">
                        오류·문제점·개선 요청을 운영자에게 전달하세요. 스크린샷 첨부 가능합니다.
                    </p>
                </div>
                <div class="page-actions">
                    <button class="btn btn-primary" onclick="BoardModule.openWriteModal()">
                        <span class="material-symbols-outlined">edit_note</span> 글 작성
                    </button>
                </div>
            </div>

            <!-- 필터 바 -->
            <div class="filter-bar" style="flex-wrap:wrap;gap:10px;margin-bottom:16px;">
                <div class="form-group" style="margin:0;">
                    <select class="form-select" id="bdCatFilter" style="min-width:120px;"
                        onchange="BoardModule._onFilter()">
                        <option value="">전체 유형</option>
                        ${CATEGORY_LIST.map(c=>`<option value="${c}">${c}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group" style="margin:0;flex:1;min-width:200px;">
                    <input type="text" class="form-input" id="bdKwFilter" placeholder="제목·내용 검색"
                        oninput="BoardModule._onFilter()" style="width:100%;">
                </div>
            </div>

            <!-- 게시글 목록 -->
            <div id="bdPostList"></div>
        </div>`;

        _renderList();
    }

    function _onFilter() {
        _filterCat = (document.getElementById('bdCatFilter') || {}).value || '';
        _filterKw  = ((document.getElementById('bdKwFilter') || {}).value || '').trim().toLowerCase();
        _renderList();
    }

    // ── 목록 렌더 ──────────────────────────────────────────────────────
    function _renderList() {
        const wrap = document.getElementById('bdPostList');
        if (!wrap) return;

        let posts = (Storage.getAll(ST_POST) || [])
            .sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''));

        if (_filterCat) posts = posts.filter(p => p.category === _filterCat);
        if (_filterKw)  posts = posts.filter(p =>
            (p.title||'').toLowerCase().includes(_filterKw) ||
            (p.content||'').toLowerCase().includes(_filterKw));

        if (!posts.length) {
            wrap.innerHTML = `<div style="text-align:center;padding:60px 20px;color:var(--text-muted);">
                <span class="material-symbols-outlined" style="font-size:3rem;display:block;opacity:.3;margin-bottom:8px;">forum</span>
                게시글이 없습니다.
            </div>`;
            return;
        }

        const replies = Storage.getAll(ST_REPLY) || [];
        wrap.innerHTML = posts.map(p => _postCard(p, replies)).join('');
    }

    function _postCard(p, replies) {
        const cat   = p.category || '기타';
        const cc    = CAT_COLOR[cat] || CAT_COLOR['기타'];
        const pReplies = (replies||[]).filter(r => r.postId === p.id)
                          .sort((a,b) => (a.createdAt||'').localeCompare(b.createdAt||''));
        const catBadge = `<span style="display:inline-block;padding:2px 8px;border-radius:4px;
            font-size:0.72rem;font-weight:700;background:${cc.bg};color:${cc.text};
            border:1px solid ${cc.border};">${_esc(cat)}</span>`;
        const repliesHtml = pReplies.map(r => `
            <div style="display:flex;gap:10px;padding:10px 0;border-top:1px solid var(--border-color);">
                <span class="material-symbols-outlined" style="font-size:16px;color:var(--accent-green);margin-top:2px;flex-shrink:0;">subdirectory_arrow_right</span>
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                        <span style="font-size:0.8rem;font-weight:700;color:var(--accent-green);">${_esc(r.author||'운영자')}</span>
                        <span style="font-size:0.72rem;color:var(--text-muted);">${_fmtDate(r.createdAt)}</span>
                        <button onclick="BoardModule._deleteReply('${r.id}','${p.id}')"
                            style="margin-left:auto;background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:0.72rem;padding:1px 4px;">삭제</button>
                    </div>
                    <div style="font-size:0.85rem;color:var(--text-primary);white-space:pre-wrap;line-height:1.55;">${_esc(r.content||'')}</div>
                    ${r.imageData ? `<img src="${r.imageData}" style="max-width:320px;max-height:200px;object-fit:contain;border-radius:6px;border:1px solid var(--border-color);margin-top:6px;cursor:pointer;"
                        onclick="BoardModule._enlargeImg(this.src)">` : ''}
                </div>
            </div>`).join('');

        const replyFormId = `replyForm_${p.id}`;
        return `
        <div class="card" style="margin-bottom:14px;" id="post_${p.id}">
            <div class="card-body" style="padding:16px 18px;">
                <!-- 헤더 -->
                <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;">
                    <div style="flex:1;min-width:0;">
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:5px;">
                            ${catBadge}
                            <span style="font-size:1rem;font-weight:700;color:var(--text-primary);">${_esc(p.title||'(제목 없음)')}</span>
                        </div>
                        <div style="font-size:0.76rem;color:var(--text-muted);display:flex;gap:10px;">
                            <span><span class="material-symbols-outlined" style="font-size:13px;vertical-align:-2px;">person</span> ${_esc(p.author||'익명')}</span>
                            <span><span class="material-symbols-outlined" style="font-size:13px;vertical-align:-2px;">schedule</span> ${_fmtDate(p.createdAt)}</span>
                            <span><span class="material-symbols-outlined" style="font-size:13px;vertical-align:-2px;">chat_bubble</span> 답글 ${pReplies.length}</span>
                        </div>
                    </div>
                    <div style="display:flex;gap:6px;flex-shrink:0;">
                        <button class="btn btn-sm btn-outline" onclick="BoardModule.openEditModal('${p.id}')">수정</button>
                        <button class="btn btn-sm" style="background:none;border:1px solid var(--accent-red);color:var(--accent-red);border-radius:6px;padding:3px 10px;cursor:pointer;font-size:0.78rem;"
                            onclick="BoardModule._deletePost('${p.id}')">삭제</button>
                    </div>
                </div>

                <!-- 본문 -->
                <div style="font-size:0.88rem;color:var(--text-primary);white-space:pre-wrap;line-height:1.65;margin-bottom:10px;padding:10px 14px;background:var(--bg-secondary);border-radius:6px;">${_esc(p.content||'')}</div>

                <!-- 첨부 이미지 -->
                ${(p.images||[]).length ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
                    ${(p.images||[]).map((src,i)=>`
                    <div style="position:relative;">
                        <img src="${src}" style="width:120px;height:90px;object-fit:cover;border-radius:6px;border:1px solid var(--border-color);cursor:pointer;"
                            onclick="BoardModule._enlargeImg(this.src)">
                    </div>`).join('')}
                </div>` : ''}

                <!-- 답글 목록 -->
                ${pReplies.length ? `<div style="padding:6px 0 0;">${repliesHtml}</div>` : ''}

                <!-- 답글 작성 토글 -->
                <div style="margin-top:10px;border-top:1px solid var(--border-color);padding-top:10px;">
                    <button class="btn btn-sm btn-outline" style="gap:4px;"
                        onclick="BoardModule._toggleReplyForm('${p.id}')">
                        <span class="material-symbols-outlined" style="font-size:14px;">reply</span> 답글 달기
                    </button>
                    <div id="${replyFormId}" style="display:none;margin-top:10px;">
                        ${_replyFormHtml(p.id)}
                    </div>
                </div>
            </div>
        </div>`;
    }

    function _replyFormHtml(postId) {
        return `
        <div style="background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.25);border-radius:8px;padding:12px;">
            <div class="form-row" style="margin-bottom:8px;">
                <div class="form-group" style="margin:0;flex:0 0 160px;">
                    <input type="text" class="form-input" id="replyAuthor_${postId}" placeholder="작성자" style="font-size:0.85rem;">
                </div>
            </div>
            <textarea class="form-textarea" id="replyContent_${postId}" rows="3"
                placeholder="답글 내용을 입력하세요..." style="resize:vertical;font-size:0.85rem;margin-bottom:8px;"></textarea>
            <div style="display:flex;align-items:center;gap:10px;">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.82rem;color:var(--text-secondary);">
                    <span class="material-symbols-outlined" style="font-size:18px;">attach_file</span> 이미지 첨부
                    <input type="file" id="replyImg_${postId}" accept="image/*" style="display:none;"
                        onchange="BoardModule._previewReplyImg('${postId}', this)">
                </label>
                <div id="replyImgThumb_${postId}" style="display:none;"></div>
                <button class="btn btn-sm btn-primary" style="margin-left:auto;"
                    onclick="BoardModule._submitReply('${postId}')">답글 등록</button>
                <button class="btn btn-sm btn-secondary"
                    onclick="BoardModule._toggleReplyForm('${postId}')">취소</button>
            </div>
        </div>`;
    }

    // ── 글 작성 모달 ──────────────────────────────────────────────────
    function openWriteModal(prefill) {
        const p = prefill || {};
        const isEdit = !!p.id;
        UIUtils.showModal(isEdit ? '게시글 수정' : '게시글 작성', `
            <div class="form-row">
                <div class="form-group" style="flex:0 0 130px;">
                    <label class="form-label">유형 <span style="color:var(--accent-red)">*</span></label>
                    <select class="form-select" id="bdCat">
                        ${CATEGORY_LIST.map(c=>`<option value="${c}" ${c===(p.category||'오류 보고')?'selected':''}>${c}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">작성자</label>
                    <input type="text" class="form-input" id="bdAuthor" value="${_esc(p.author||'')}" placeholder="이름 또는 부서">
                </div>
            </div>
            <div class="form-group">
                <label class="form-label">제목 <span style="color:var(--accent-red)">*</span></label>
                <input type="text" class="form-input" id="bdTitle" value="${_esc(p.title||'')}" placeholder="문제·오류 요약">
            </div>
            <div class="form-group">
                <label class="form-label">내용 <span style="color:var(--accent-red)">*</span></label>
                <textarea class="form-textarea" id="bdContent" rows="6"
                    placeholder="발생 상황, 재현 방법, 오류 메시지 등을 상세히 적어주세요."
                    style="resize:vertical;">${_esc(p.content||'')}</textarea>
            </div>

            <!-- 이미지 첨부 -->
            <div class="form-group">
                <label class="form-label" style="display:flex;align-items:center;gap:6px;">
                    <span class="material-symbols-outlined" style="font-size:18px;">add_photo_alternate</span>
                    스크린샷 / 이미지 첨부
                    <span style="font-size:0.75rem;color:var(--text-muted);font-weight:400;">(최대 5장)</span>
                </label>
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                    <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;
                        padding:6px 14px;border:1.5px dashed var(--border-color);border-radius:8px;
                        font-size:0.82rem;color:var(--text-secondary);transition:all .15s;"
                        onmouseover="this.style.borderColor='var(--accent-blue)'"
                        onmouseout="this.style.borderColor='var(--border-color)'">
                        <span class="material-symbols-outlined" style="font-size:20px;">upload</span>
                        파일 선택
                        <input type="file" id="bdImgInput" accept="image/*" multiple style="display:none;"
                            onchange="BoardModule._onImgSelect(this)">
                    </label>
                    <span style="font-size:0.78rem;color:var(--text-muted);">또는 Ctrl+V 로 클립보드 이미지 붙여넣기</span>
                </div>
                <!-- 미리보기 그리드 -->
                <div id="bdImgPreview" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;"></div>
                <input type="hidden" id="bdImgData" value="${_esc(JSON.stringify(p.images||[]))}">
            </div>
        `, `
            <button class="btn btn-secondary" onclick="UIUtils.closeModal()">취소</button>
            <button class="btn btn-primary" onclick="BoardModule._submitPost('${p.id||''}')">
                <span class="material-symbols-outlined" style="font-size:16px;">send</span>
                ${isEdit ? '수정 저장' : '등록'}
            </button>
        `, 'lg');

        // 기존 이미지 미리보기 복원
        setTimeout(() => {
            _refreshImgPreview();
            // Ctrl+V 클립보드 붙여넣기
            const bodyEl = document.getElementById('bdContent');
            if (bodyEl) {
                bodyEl.addEventListener('paste', e => {
                    const items = (e.clipboardData || {}).items || [];
                    for (const item of items) {
                        if (item.type.startsWith('image/')) {
                            e.preventDefault();
                            const blob = item.getAsFile();
                            if (blob) _addImgBlob(blob);
                        }
                    }
                });
            }
            // 전역 붙여넣기도 감지 (모달 열려있는 동안)
            document.getElementById('modal')?.addEventListener('paste', function _mpaste(e) {
                const items = (e.clipboardData || {}).items || [];
                for (const item of items) {
                    if (item.type.startsWith('image/')) {
                        e.preventDefault();
                        const blob = item.getAsFile();
                        if (blob) _addImgBlob(blob);
                    }
                }
            }, { once: false, capture: false });
        }, 80);
    }

    function openEditModal(id) {
        const p = Storage.getById(ST_POST, id);
        if (!p) return;
        openWriteModal(p);
    }

    // ── 이미지 처리 ──────────────────────────────────────────────────
    function _getImgList() {
        try { return JSON.parse(document.getElementById('bdImgData')?.value || '[]'); }
        catch { return []; }
    }
    function _setImgList(arr) {
        const el = document.getElementById('bdImgData');
        if (el) el.value = JSON.stringify(arr);
    }

    function _onImgSelect(input) {
        if (!input.files) return;
        Array.from(input.files).forEach(f => _addImgBlob(f));
        input.value = '';
    }

    function _addImgBlob(blob) {
        const imgs = _getImgList();
        if (imgs.length >= 5) { UIUtils.toast('이미지는 최대 5장까지 첨부 가능합니다.', 'warning'); return; }
        const reader = new FileReader();
        reader.onload = e => {
            imgs.push(e.target.result);
            _setImgList(imgs);
            _refreshImgPreview();
        };
        reader.readAsDataURL(blob);
    }

    function _refreshImgPreview() {
        const grid = document.getElementById('bdImgPreview');
        if (!grid) return;
        const imgs = _getImgList();
        grid.innerHTML = imgs.map((src, i) => `
            <div style="position:relative;display:inline-block;">
                <img src="${src}" style="width:110px;height:80px;object-fit:cover;border-radius:6px;
                    border:1.5px solid var(--border-color);cursor:pointer;"
                    onclick="BoardModule._enlargeImg(this.src)">
                <button onclick="BoardModule._removeImg(${i})"
                    style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;
                    border-radius:50%;background:var(--accent-red);color:#fff;border:none;
                    cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;
                    line-height:1;">×</button>
            </div>`).join('');
    }

    function _removeImg(idx) {
        const imgs = _getImgList();
        imgs.splice(idx, 1);
        _setImgList(imgs);
        _refreshImgPreview();
    }

    // ── 게시글 저장 ──────────────────────────────────────────────────
    async function _submitPost(existingId) {
        const category = document.getElementById('bdCat')?.value || '기타';
        const author   = (document.getElementById('bdAuthor')?.value || '').trim();
        const title    = (document.getElementById('bdTitle')?.value || '').trim();
        const content  = (document.getElementById('bdContent')?.value || '').trim();
        const images   = _getImgList();

        if (!title)   { UIUtils.toast('제목을 입력하세요.', 'warning'); return; }
        if (!content) { UIUtils.toast('내용을 입력하세요.', 'warning'); return; }

        const now = new Date().toISOString();
        if (existingId) {
            const prev = Storage.getById(ST_POST, existingId) || {};
            await Storage.update(ST_POST, existingId, { ...prev, category, author, title, content, images, updatedAt: now });
            UIUtils.toast('수정되었습니다.', 'success');
        } else {
            await Storage.add(ST_POST, { category, author, title, content, images, createdAt: now });
            UIUtils.toast('게시글이 등록되었습니다.', 'success');
        }
        UIUtils.closeModal();
        _renderList();
    }

    // ── 게시글 삭제 ──────────────────────────────────────────────────
    function _deletePost(id) {
        UIUtils.confirm('이 게시글과 모든 답글을 삭제하시겠습니까?', async () => {
            const replies = (Storage.getAll(ST_REPLY) || []).filter(r => r.postId === id);
            for (const r of replies) await Storage.remove(ST_REPLY, r.id);
            await Storage.remove(ST_POST, id);
            UIUtils.toast('삭제되었습니다.', 'success');
            _renderList();
        });
    }

    // ── 답글 ─────────────────────────────────────────────────────────
    function _toggleReplyForm(postId) {
        const el = document.getElementById(`replyForm_${postId}`);
        if (!el) return;
        el.style.display = el.style.display === 'none' ? '' : 'none';
    }

    function _previewReplyImg(postId, input) {
        const file = input.files && input.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            const thumb = document.getElementById(`replyImgThumb_${postId}`);
            if (thumb) {
                thumb.style.display = '';
                thumb.innerHTML = `<img src="${e.target.result}"
                    style="width:60px;height:45px;object-fit:cover;border-radius:4px;
                    border:1px solid var(--border-color);cursor:pointer;"
                    onclick="BoardModule._enlargeImg(this.src)">`;
            }
        };
        reader.readAsDataURL(file);
    }

    async function _submitReply(postId) {
        const author  = (document.getElementById(`replyAuthor_${postId}`)?.value || '').trim() || '운영자';
        const content = (document.getElementById(`replyContent_${postId}`)?.value || '').trim();
        if (!content) { UIUtils.toast('답글 내용을 입력하세요.', 'warning'); return; }

        // 이미지
        let imageData = null;
        const imgInput = document.getElementById(`replyImg_${postId}`);
        if (imgInput && imgInput.files && imgInput.files[0]) {
            imageData = await new Promise((res, rej) => {
                const reader = new FileReader();
                reader.onload = e => res(e.target.result);
                reader.onerror = rej;
                reader.readAsDataURL(imgInput.files[0]);
            });
        }

        await Storage.add(ST_REPLY, {
            postId,
            author,
            content,
            imageData,
            createdAt: new Date().toISOString()
        });
        UIUtils.toast('답글이 등록되었습니다.', 'success');
        _renderList();
    }

    function _deleteReply(replyId, postId) {
        UIUtils.confirm('이 답글을 삭제하시겠습니까?', async () => {
            await Storage.remove(ST_REPLY, replyId);
            UIUtils.toast('답글이 삭제되었습니다.', 'success');
            _renderList();
        });
    }

    // ── 이미지 확대 ──────────────────────────────────────────────────
    function _enlargeImg(src) {
        const old = document.getElementById('bdImgEnlarge');
        if (old) old.remove();
        const div = document.createElement('div');
        div.id = 'bdImgEnlarge';
        div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:99999;' +
            'display:flex;align-items:center;justify-content:center;cursor:zoom-out;';
        div.innerHTML = `<img src="${src}" style="max-width:92vw;max-height:88vh;
            border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,.6);object-fit:contain;">`;
        div.onclick = () => div.remove();
        document.body.appendChild(div);
    }

    // ── 헬퍼 ─────────────────────────────────────────────────────────
    function _esc(s) {
        return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function _fmtDate(iso) {
        if (!iso) return '-';
        return iso.replace('T',' ').slice(0,16);
    }

    return {
        render,
        openWriteModal,
        openEditModal,
        _onFilter,
        _onImgSelect,
        _removeImg,
        _enlargeImg,
        _toggleReplyForm,
        _previewReplyImg,
        _submitPost,
        _submitReply,
        _deletePost,
        _deleteReply,
        _refreshImgPreview,
        _addImgBlob,
    };
})();
