/**
 * 도료 수입검사 기준서 모듈 (PaintIncomingStdModule)
 * 입고 도료에 대한 수입검사 기준서 목록 (추후 구현)
 */
var PaintIncomingStdModule = (function () {

    function init() {}

    function render(container) {
        container.innerHTML = `
        <div class="fade-in-up">
            ${IncomingUI.renderSection('paint-incoming-std')}
            <div class="card" style="margin-top:8px;">
                <div class="card-body" style="padding:60px;text-align:center;">
                    <span class="material-symbols-outlined" style="font-size:48px;color:var(--text-muted);display:block;margin-bottom:16px;">picture_as_pdf</span>
                    <div style="font-size:1.1rem;font-weight:700;color:var(--text-primary);margin-bottom:8px;">도료 수입검사 기준서</div>
                    <div style="color:var(--text-muted);font-size:0.9rem;">준비 중입니다.</div>
                </div>
            </div>
        </div>`;
    }

    return { init, render };
})();
