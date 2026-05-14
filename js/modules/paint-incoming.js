/**
 * 도료 수입검사 모듈 (placeholder)
 * TODO: 실제 구현 필요
 */

const PaintIncomingInspectionModule = (function() {
    const STORE = DB.STORES.PAINT_INCOMING_INSPECTIONS;
    const MATERIALS_STORE = DB.STORES.PAINT_MATERIALS;

    function render(container) {
        container.innerHTML = `
            <div class="fade-in-up">
                <div class="empty-state" style="margin-top:100px;">
                    <span class="material-symbols-outlined" style="font-size:48px;color:var(--text-muted);">construction</span>
                    <h4>도료 수입검사</h4>
                    <p>현재 개발 중인 기능입니다.</p>
                </div>
            </div>
        `;
    }

    return {
        render
    };
})();
