# CLAUDE.md — 생산 공정 관리 시스템 (MES)

## 프로젝트 개요

사출부터 출하까지 전체 생산 공정을 관리하는 순수 프론트엔드 MES 시스템.
서버 없이 브라우저만으로 동작하며, 데이터는 IndexedDB에 저장된다.

## 기술 스택

- **언어**: 바닐라 JavaScript (ES6+, 모듈 패턴 IIFE), HTML5, CSS3
- **차트**: Chart.js (CDN)
- **폰트/아이콘**: Google Fonts (Inter), Material Symbols Outlined
- **저장소**: IndexedDB (`ProductionMES_DB`, 버전 2)
- **빌드 도구 없음** — 번들러/트랜스파일러 사용 안 함

## 디렉터리 구조

```
index.html          # 앱 진입점, 모든 스크립트 로드
css/
  style.css         # 전체 스타일
js/
  db.js             # IndexedDB 래퍼 (저수준 CRUD)
  storage.js        # 메모리 캐시 + 비즈니스 CRUD 인터페이스
  data.js           # 초기/마스터 데이터
  router.js         # 페이지 라우터 (data-page 기반 SPA)
  ui.js             # 공통 UI 헬퍼 (모달, 토스트 등)
  chart.js          # 차트 공통 유틸
  app.js            # 부트스트랩 (Storage → 모듈 등록 → Router.init)
  modules/
    dashboard.js         # 대시보드
    injection.js         # 사출 수입검사 + 창고
    painting.js          # 도장 공정 (입고/작업/검사/출고)
    paint-inventory.js   # 도료 창고
    production-plan.js   # 생산 계획 지시서
    settings.js          # 설정
    shipping.js          # 출하검사 + 제품 창고/출고
```

## 공정 흐름

```
생산계획 → 사출 입고검사 → 사출 창고
         → 도장 입고 → 도장 작업 → 도장 검사 → 도장 출고
         → 출하검사 대기 → 출하검사 → 제품 창고 → 제품 출고
```

## 아키텍처 규칙

- **모듈 패턴**: 모든 JS 파일은 IIFE `(function() { ... })()`로 감싸 전역 오염 방지
- **라우터**: `Router.registerModule(pageId, ModuleObject)` 패턴. 각 모듈은 `init()` 메서드 필수
- **데이터 레이어**: `DB` (IndexedDB 직접) → `Storage` (캐시+인터페이스) → 모듈. 모듈은 `Storage`만 사용
- **캐시 우선**: `Storage.getAll(storeName)` 은 메모리 캐시 반환. DB 쓰기는 비동기 백그라운드
- **ID 생성**: `Storage` 내부의 `generateId()` 사용

## DB 스토어 목록 (`DB.STORES`)

| 스토어 키 | 스토어 이름 | 용도 |
|---|---|---|
| PRODUCTS | products | 제품 마스터 |
| DEFECT_TYPES | defect_types | 불량 유형 마스터 |
| PAINT_MATERIALS | paint_materials | 도료 마스터 |
| PRODUCTION_PLANS | production_plans | 생산 계획 지시서 |
| INJECTION_INSPECTIONS | injection_inspections | 사출 수입검사일지 |
| INJECTION_INVENTORY | injection_inventory | 사출 창고 재고 |
| PAINT_INCOMING_INSPECTIONS | paint_incoming_inspections | 도료 수입검사일지 |
| PAINT_INVENTORY | paint_inventory | 도료 창고 재고 |
| PAINTING_INCOMING | painting_incoming | 도장 입고 |
| PAINTING_WORK | painting_work | 도장 작업일지 |
| PAINTING_INSPECTIONS | painting_inspections | 도장 검사 |
| PAINTING_OUTGOING | painting_outgoing | 도장품 출고 |
| SHIPPING_STANDBY | shipping_standby | 출하검사 대기 |
| SHIPPING_INSPECTIONS | shipping_inspections | 출하검사 일지 |
| PRODUCT_INVENTORY | product_inventory | 제품 창고 재고 |
| PRODUCT_OUTGOING | product_outgoing | 제품 출고 |
| CONFIG | config | 설정 |

## 코딩 컨벤션

- ES6 모듈(import/export) 사용 안 함 — 스크립트 태그로 순서대로 로드
- `async/await` 사용 가능 (IndexedDB 작업)
- CSS 변수(`--accent-*`, `--bg-*` 등) 활용해 테마 일관성 유지
- 새 페이지/모듈 추가 시: `modules/` 에 파일 생성 → `index.html` 에 `<script>` 추가 → `app.js`의 `registerModules()`에 등록 → `index.html` 사이드바 nav에 항목 추가

## 주의사항

- DB 버전(`DB_VERSION`) 변경 시 반드시 `onupgradeneeded` 핸들러에서 마이그레이션 처리
- `Storage.init()` 완료 전에 모듈이 데이터에 접근하면 안 됨 (app.js 부트스트랩 순서 유지)
- Chart.js 인스턴스는 재렌더링 시 반드시 `.destroy()` 후 재생성
