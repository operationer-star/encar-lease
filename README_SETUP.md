# 엔카 HEV 승계 감시 — GitHub Actions 전환 설치 안내

저장소: operationer-star/encar-lease (main 브랜치, GitHub Pages)

## 1. 파일 올리기 (GitHub 웹 → Add file → Upload files, 또는 PC에서 git push)
- `.github/workflows/encar-watch.yml`  ← 주간 스케줄 (월 08:00 KST) + 수동 실행
- `scripts/collect.mjs`                 ← 수집·페이지·보고 스크립트 (Node 22, 외부 패키지 없음)
- `watch_tpl.html`                      ← 페이지 템플릿 (현재 watch.html 에서 데이터만 뺀 것, 디자인 동일)
- `watch_data.json`, `watch_history.json` ← 2026-11-02 수집분 (NEW 비교 기준)

주의: GitHub 웹 업로드는 `.github/workflows/` 처럼 점으로 시작하는 폴더를 만들 때
"Add file → Create new file" 에서 파일 이름 칸에 `.github/workflows/encar-watch.yml` 을 그대로 입력하면 폴더가 생깁니다.

## 2. Actions 권한
저장소 Settings → Actions → General → Workflow permissions → **Read and write permissions** 선택 → Save.
(없으면 커밋·푸시 단계에서 403 으로 실패)

## 3. 첫 실행 (수동)
Actions 탭 → "Encar HEV 승계 감시 (주간 수집)" → Run workflow.
로그에서 확인할 것:
- `q 후보 … → Count N` : N>0 인 줄이 있어야 함. 전부 0이면 → 아래 4번.
- `succession 응답 필드 예시:` : 보증금 필드 이름이 deposit 계열이 아니면 알려주세요(스크립트 pick 목록에 추가).
- `일반매물 회귀 표본 G/C:` : 15 미만이면 만기시세(mv)가 비어 "시세없음"으로 표시됨.
- 마지막에 report.md 내용이 출력되고, Summary 탭에도 같은 내용이 보임.

## 4. q 를 못 찾을 때 (ENCAR_Q 변수)
PC Chrome 에서 https://www.encar.com/dc/dc_carleaselist.do?carType=kor 열기 → F12 → Network → `premium?` 필터 →
요청 URL 의 `q=` 값(괄호로 시작)을 복사 → 저장소 Settings → Secrets and variables → Actions → Variables →
New repository variable: 이름 `ENCAR_Q`, 값에 붙여넣기(URL 디코딩된 한글 형태). 그다음 Run workflow.

## 5. 결과
- 페이지: https://operationer-star.github.io/encar-lease/watch.html (Pages 반영 1~2분)
- 보고: 저장소 report.md / report.json (Claude 스케줄 작업이 월 09:07 KST 에 report.json 을 읽어 푸시 알림)
- 히스토리: watch_history.json (git 이력에도 남음 — Downloads 백업 파일은 더 이상 안 씀)

## 6. 바뀐 점 (이전 브라우저 루틴 대비)
- Downloads/encar_blacklist.json 합집합 제외 → 저장소 blacklist.json 만 사용 (페이지 🗑 버튼이 쓰는 곳)
- Downloads/엔카_HEV감시_<날짜>.html 백업 생략 (git 이력으로 대체)
- 시간: 09:00 → 08:00 KST 수집, 09:07 Claude 보고. GitHub 스케줄은 몇 분~수십 분 늦을 수 있음.
