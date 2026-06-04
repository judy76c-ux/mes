/**
 * 수입검사 표준서 모듈 (InjInspStdPhotoModule)
 * 차종·품명별 수입검사 기준 사진 및 표준서 관리
 * (기존 injection_part1.js 의 openStdModal 기능 이전 예정)
 */
var InjInspStdPhotoModule = (function () {

    function init() {}

    function render(container) {
        container.innerHTML = `
        <div class="fade-in-up">
            ${IncomingUI.renderSection('inj-insp-std-photo')}
            <div class="card" style="margin-top:8px;">
                <div class="card-body" style="padding:60px;text-align:center;">
                    <span class="material-symbols-outlined" style="font-size:48px;color:var(--text-muted);display:block;margin-bottom:16px;">photo_library</span>
                    <div style="font-size:1.1rem;font-weight:700;color:var(--text-primary);margin-bottom:8px;">수입검사 표준서</div>
                    <div style="color:var(--text-muted);font-size:0.9rem;">준비 중입니다.</div>
                </div>
            </div>
        </div>`;
    }

    return { init, render };
})();
