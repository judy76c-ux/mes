---
name: mes-korean-encoding
description: MES(제조실행시스템) 서비스 개발 중 한글 깨짐 현상을 진단하고 해결한다.
  한글이 ???, 묻?묻, □□□ 등으로 표시되거나 DB 저장/조회 시 인코딩 오류가 발생할 때,
  REST API 응답에서 한글이 깨질 때, 파일 입출력 시 한글 깨짐이 생길 때 반드시 이 스킬을 사용한다.
---

# MES 한글 깨짐 해결 스킬

## 문제 유형별 체크리스트

### 1. DB 계층 (가장 흔한 원인)
- [ ] DB 생성 시 character set: `utf8mb4` (MySQL) / `AL32UTF8` (Oracle)
- [ ] 테이블/컬럼 collation 확인: `utf8mb4_unicode_ci`
- [ ] JDBC URL에 인코딩 파라미터 포함 여부:
```
  jdbc:mysql://host/db?useUnicode=true&characterEncoding=UTF-8
```
- [ ] Connection Pool 설정에 `connectionInitSql` 추가:
```sql
  SET NAMES utf8mb4
```

### 2. 웹 서버 / WAS 계층
- [ ] HTTP Response Header: `Content-Type: application/json; charset=UTF-8`
- [ ] Spring Boot: `spring.http.encoding.charset=UTF-8` / `server.servlet.encoding.force=true`
- [ ] Tomcat `server.xml`: `URIEncoding="UTF-8"`
- [ ] Filter/Interceptor에서 `request.setCharacterEncoding("UTF-8")` 설정

### 3. 파일 입출력 계층
- [ ] `FileReader` 대신 `InputStreamReader(stream, StandardCharsets.UTF_8)` 사용
- [ ] CSV/Excel 내보내기 시 BOM(`\uFEFF`) 추가 여부 (Excel 호환)
- [ ] 로그 파일: JVM 옵션 `-Dfile.encoding=UTF-8`

### 4. 프론트엔드 / API 계층
- [ ] HTML `<meta charset="UTF-8">` 선언
- [ ] `encodeURIComponent()` 처리 여부 (GET 파라미터)
- [ ] Axios/Fetch `Content-Type: application/json;charset=UTF-8` 헤더

---

## 진단 순서

1. **깨지는 위치 확인**: DB? API 응답? 화면?
2. **DB 직접 조회**: SQL 클라이언트에서 한글 정상 여부 확인
3. **API 응답 RAW 확인**: curl로 직접 확인
```bash
   curl -v http://api/endpoint | hexdump | grep -A2 "한글위치"
```
4. **JVM 인코딩 확인**:
```java
   System.out.println(Charset.defaultCharset());
   // UTF-8이 아니면 JVM 옵션 추가 필요
```

---

## 자주 발생하는 MES 특화 패턴

| 증상 | 원인 | 해결 |
|------|------|------|
| PLC 데이터 수신 시 깨짐 | EUC-KR 장비 통신 | 수신 시 EUC-KR 디코딩 후 UTF-8 변환 |
| 바코드 스캔 데이터 깨짐 | 스캐너 인코딩 설정 | 스캐너 UTF-8 모드 설정 or 변환 처리 |
| 레포트 출력 깨짐 | JasperReports 폰트 | 한글 폰트 embed 필요 |
| 엑셀 다운로드 깨짐 | BOM 누락 | BOM 바이트 추가 |
| 이메일 알림 깨짐 | MIME encoding | `MimeMessage` UTF-8 명시 |

---

## 검증 코드 스니펫
```java
// 인코딩 상태 진단 유틸
public static void diagnoseEncoding(String input) {
    System.out.println("Input: " + input);
    System.out.println("JVM charset: " + Charset.defaultCharset());
    System.out.println("UTF-8 bytes: " + Arrays.toString(input.getBytes(StandardCharsets.UTF_8)));
}