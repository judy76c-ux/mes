 /**
 * Jig 수명관리 모듈 (Jig Management Module)
 * 페이지 ID: jig-management
 * 기능: Jig의 현재 사용 이력을 조회하고, 누적 사용량에 따른 교체 주기 경고를 UI에 표시합니다.
 */
(function() {
    // 반드시 IIFE 패턴을 따릅니다.
    
    const PAGE_ID = 'jig-management';
    let currentJigId = '';
    let currentJigStatus = null;
    
    /**
     * 1. 초기화 로직
     * 페이지 로드 시 기본 값을 설정하고 상태 점검을 실행합니다.
     * @param {string} initialJigId - (선택적) 초기 진입 시 사용할 Jig ID
     */
    function init(initialJigId = 'JIG-A001') {
        console.log("[Jig Management] 모듈 초기화 시작.");
        currentJigId = initialJigId;
        
        // 초기 데이터를 불러와 상태 점검을 요청합니다.
        loadJigStatus(currentJigId);
    }
    /**
     * Jig ID를 받아 JigService를 호출하고, 결과를 UI에 렌더링합니다.
     * @param {string} jigId - 조회할 Jig ID
     */
    async function loadJigStatus(jigId) {
        if (!window.JigService) {
            alert(`[Critical] JigService가 전역 범위에 로드되지 않았습니다. App.js 초기화 또는 전역 변수 할당을 확인해주세요.`);
            return;
        }
        try {
            const status = await window.JigService.checkJigStatus(jigId);
            currentJigStatus = status;
            console.log(`[Jig Management] Jig ${jigId} 상태 조회 성공`, status);
            // UI 갱신
            _renderStatusUI(status);
        } catch (e) {
            currentJigStatus = null;
            alert(`[ERROR] Jig 상태 조회 실패: ${e.message}`);
            _renderStatusUI(null);
        }
    }
    /**
     * 가상 UI 렌더링 함수 (Placeholder)
     * **주의**: 실제 환경에서는 이 함수 내부의 DOM 조작을 실제 UI 컴포넌트로 대체해야 합니다.
     * @param {object | null} status - JigService.checkJigStatus 결과
     */
    function _renderStatusUI(status) {
        const container = document.getElementById('zig-status-view');
        if (!container) {
            console.warn("상태 표시를 위한 DOM 요소(#zig-status-view)를 찾을 수 없습니다. 화면에 내용을 출력하지 못합니다.");
            return;
        }
        
        let html = `<h3 class="page-title">${currentJigId} 지그 상태 관리</h3>`;
        if (!status) {
            html += `<p class="error">[!] 상태 정보를 불러오는 데 실패했습니다. 상단 에러 메시지를 확인해주세요.</p>`;
        } else {
            const statusClass = status.status.toLowerCase().replace(/\s/g, '-');
            html += `
                <div class="status-box status-${statusClass}-status">
                    <h4 class="status-title">현재 상태: ${status.status}</h4>
                    <p><strong>재고 관리 기준:</strong> ${status.details}</p>
                    <p class="warning-${status.status.toLowerCase().replace(/\s/g, '-')}">⚠ 주요 알림: ${status.warning}</p>
                    <p>최근 사용 기록: ${status.lastUsage}</p>
                </div>
            `;
        }
        container.innerHTML = html;
    }
    // 노출 인터페이스
    return {
        init: init,
        loadJigStatus: loadJigStatus // 외부에서 수동으로 상태를 재점검할 때 사용
    };
})();
// 라우터 등록에 사용될 객체를 반환합니다.
window.JigManagementModule = {
    init: function() {
        // 라우터가 호출할 때, 기본 Jig ID로 초기화 로직을 실행합니다.
        JigManagementModule.init(); 
    }
};