# AGENTS.md - 생산 공정 관리 시스템 (MES)

## 프로젝트 개요

사출부터 출하까지 전체 생산 공정을 관리하는 브라우저 기반 MES 시스템.
운영 데이터는 **MES API 서버(Express) → MariaDB**만 사용한다. 브라우저 IndexedDB 폴백/백업은 비활성(`Storage.USE_INDEXEDDB = false`).
NAS는 사진 저장(`api-server` `/api/photos`) 및 DB 백업 파일 보관 역할만 한다.

## 기술 스택

- **언어**: 바닐라 JavaScript (ES6+, IIFE 모듈 패턴), HTML5, CSS3
- **차트**: Chart.js (CDN)
- **엑셀**: SheetJS/XLSX (CDN)
- **폰트/아이콘**: Google Fonts (Inter), Material Symbols Outlined
- **1차 저장소**: MES API 서버 (`api-server/server.js`) + MariaDB JSON 문서 테이블
- **브라우저 캐시**: 메모리 캐시만 (세션용). API 연결 실패 시 앱 시작 불가
- **NAS**: 사진·백업 파일 저장소 (api-server 경유). IndexedDB 미사용
- **레거시**: `db.js`(IndexedDB)는 `DB.STORES` 상수·스키마 참조용으로만 로드
- **빌드 도구 없음**: 번들러/트랜스파일러 사용 안 함

## 디렉터리 구조

```text
index.html          # 앱 진입점, 스크립트 로드
css/
  style.css         # 전체 스타일
js/
  api-client.js     # MES REST API 클라이언트 (MariaDB)
  db.js             # DB.STORES 상수·레거시 IndexedDB 래퍼 (운영 데이터 미사용)
  storage.js        # 메모리 캐시 + MariaDB API CRUD
  data.js           # 레거시 DataManager 호환 레이어
  router.js         # data-page 기반 SPA 라우터
  ui.js             # 레거시 UI 헬퍼
  chart.js          # 레거시 차트 헬퍼
  app.js            # 부트스트랩 (Storage -> 모듈 등록 -> Router.init)
  modules/
    dashboard.js
    production-plan.js
    injection_part1.js
    injection_part2.js
    injection_part3.js
    injection_work.js
    raw-material-inventory.js
    paint-inventory.js
    painting.js
    laser.js
    sales.js
    production_mgmt.js
    shipping.js
    jig.js
    settings.js
api-server/
  server.js         # Express + MariaDB JSON document API
```

## 공정 흐름

```text
생산계획 -> 사출 입고검사 -> 사출 창고/사출 작업
         -> 도장 작업 -> 도장 검사 -> 도장 출고
         -> 레이저 대기 -> 레이저 작업 -> 레이저 검사
         -> 출하검사 대기 -> 출하검사 -> 제품 창고 -> 제품 출고
```

## 아키텍처 규칙

- **모듈 패턴**: 모든 브라우저 JS는 전역 export용 상수만 노출하고 IIFE로 내부 구현을 감싼다.
- **라우터**: `Router.registerModule(pageId, ModuleObject)` 패턴. 등록 모듈은 `render(container)` 메서드를 제공한다.
- **데이터 레이어**: 모듈은 `Storage`만 사용한다. `DB`는 `DB.STORES` 상수 참조용.
- **저장 정책**: 모든 쓰기는 MES API 성공 후 메모리 캐시에 반영. API 연결 실패 시 앱 시작·저장 불가.
- **API URL**: `localStorage.__mes_api_base__` 또는 `window.__MES_API_BASE__`. file:// 기본값 `http://192.168.10.2:3000`.
- **ID 생성**: 신규 데이터 ID는 `Storage.generateId()` 또는 `Storage.add()` 내부 생성값을 사용한다.
- **Chart.js**: 인스턴스 재렌더링 시 반드시 `.destroy()` 후 재생성한다.

## DB 스토어 목록 (`DB.STORES`)

| 키 | 스토어 이름 | 용도 |
|---|---|---|
| PRODUCTS | products | 제품 마스터 |
| DEFECT_TYPES | defect_types | 불량 유형 마스터 |
| PAINT_MATERIALS | paint_materials | 도료 마스터 |
| INJECTION_MATERIALS | injection_materials | 사출자재 마스터 |
| RAW_MATERIALS | raw_materials | 원재료 마스터 |
| PRODUCTION_PLANS | production_plans | 생산 계획 지시서 |
| INJECTION_INSPECTIONS | injection_inspections | 사출 수입검사일지 |
| INJECTION_INVENTORY | injection_inventory | 사출 창고 재고 |
| PAINT_INCOMING_INSPECTIONS | paint_incoming_inspections | 도료 수입검사일지 |
| PAINT_INVENTORY | paint_inventory | 도료 창고 재고 |
| PAINTING_INCOMING | painting_incoming | 도장 입고 |
| PAINTING_WORK | painting_work | 도장 작업일지 |
| PAINTING_INSPECTIONS | painting_inspections | 도장 검사 |
| PAINTING_OUTGOING | painting_outgoing | 도장품 출고 |
| INJECTION_WORK_LOG | injection_work_log | 사출 작업일지 |
| LASER_WORK_LOG | laser_work_log | 레이저 작업일지 |
| LASER_INSPECTIONS | laser_inspections | 레이저 검사일지 |
| SHIPPING_STANDBY | shipping_standby | 출하검사 대기 |
| SHIPPING_INSPECTIONS | shipping_inspections | 출하검사 일지 |
| PRODUCT_INVENTORY | product_inventory | 제품 창고 재고 |
| PRODUCT_OUTGOING | product_outgoing | 제품 출고 |
| SALES_DELIVERY | sales_delivery | 납품 관리 |
| SALES_PURCHASE | sales_purchase | 매입 관리 |
| SALES_OUTSOURCING | sales_outsourcing | 외주처 관리 |
| JIG_USAGE_HISTORY | zig_usage_history | Jig 사용 이력 |
| JIG_MASTER | jig_master | JIG 마스터 |
| JIG_LOG | jig_log | JIG 사용/이력 로그 |
| PROD_STANDARDS | prod_standards | 제조 관리 표준 |
| PROD_CONDITIONS | prod_conditions | 작업조건 관리 |
| PROD_QUALITY_CHECK | prod_quality_check | 초중종물 관리 |
| PROD_EQUIPMENT | prod_equipment | 설비 관리 |
| INSPECTORS | inspectors | 검사자 관리 |
| OPERATORS | operators | 작업자 관리 |
| RAW_MATERIAL_INVENTORY | raw_material_inventory | 원재료 재고 |
| CONFIG | config | 설정 |

## 주의사항

- `DB_VERSION` 변경 시 `onupgradeneeded`에서 기존 사용자 DB가 깨지지 않도록 신규 스토어/인덱스 생성만 점진적으로 처리한다.
- `Storage.init()` 완료 전에 모듈이 데이터에 접근하면 안 된다.
- `index.html`에 새 모듈을 추가하면 `app.js`의 `registerModules()`와 사이드바 `data-page`도 함께 맞춘다.
- Firebase/Firestore 파일은 현재 기본 앱 로드 경로에서 제외되어 있다. 다시 사용할 경우 초기화 순서, 충돌 정책, NAS 저장소와의 역할을 먼저 정해야 한다.
