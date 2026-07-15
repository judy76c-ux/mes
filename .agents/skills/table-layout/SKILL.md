---
name: mes-table-layout
description: >-
  MES UI의 데이터 표(table)·이력·LOT·재고 목록에서 열 폭을 내용에 맞게 조정해
  불필요한 빈 공간이 없게 만든다. Use when creating or editing tables, data grids,
  history sections, LOT lists, modal detail tables, StockDetailUI, data-table,
  or any HTML/JS table layout in this MES project. Also when the user mentions
  열 폭, 빈 공간, 표 레이아웃, table width, or column spacing.
---

# MES 표 열 폭 · 빈 공간 제거

## 핵심 규칙 (그대로 따를 것)

표 데이터는 형식에서 열 폭을 자동으로 조정해 빈 공간이 없도록 줄여서 만들어 불필요한 빈공간이 없게 만들어.

## 언제 적용

- 새 표·이력·LOT·재고·모달 상세 테이블을 만들 때
- 기존 표에 열이 늘어나거나 레이아웃이 헐렁해 보일 때
- `StockDetailUI`, `data-table`, 인라인 `<table>` 수정 시

## 구현 원칙

1. **내용 기준으로 폭을 잡는다** — 짧은 열(구분, LOT, 수량)은 좁게, 긴 열(경로·비고)만 여유.
2. **불필요한 여백을 남기지 않는다** — `width:100%`만 주고 열이 휑하게 늘어나는 상태를 피한다.
3. **담당·일시·수량 등 짧게 끝나는 열은 `white-space:nowrap`**.
4. **숫자 열은 `text-align:right`**, 넘치면 ellipsis + `title`로 전체 값 제공.

## 권장 패턴 (HTML/JS)

```html
<table class="data-table" style="width:max-content;min-width:100%;table-layout:auto;border-collapse:collapse;">
  <thead>...</thead>
  <tbody>...</tbody>
</table>
```

- 기본: `table-layout:auto` + 셀 `white-space:nowrap`으로 **내용만큼** 열 폭을 잡는다.
- `width:max-content;min-width:100%`로 컨테이너는 채우되, 짧은 열이 휑하게 늘어나지 않게 한다.
- 열이 많아 넘치면 wrapper에 `overflow:auto`만 둔다.
- 고정 비율이 꼭 필요하면 `<colgroup>` %를 쓰되, 짧은 열(구분·수량·담당)은 작게 잡는다.
- `StockDetailUI.buildHistorySection`처럼 공통 UI를 고칠 때도 동일 규칙을 적용한다.

## 하지 말 것

- 마지막 열만 텅 비게 늘리기
- 짧은 라벨 열에 과도한 `min-width` / 큰 padding으로 빈 공간 만들기
- 내용과 무관하게 모든 열을 균등 분할만 하고 끝내기 (짧은 열·긴 열 구분 없이)

## 체크리스트

- [ ] `table-layout:fixed` (또는 동등한 폭 제어) 적용
- [ ] 열별 폭이 내용 길이에 비례
- [ ] 담당/일시/수량/LOT에 불필요한 가로 여백 없음
- [ ] 모달·섹션 너비 안에서 표가 가득 차 보이며 중간이 휑하지 않음
